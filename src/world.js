// World and Corridor Generator for Atari Pitfall 3D
import * as THREE from 'three';
import {
  createTreeModel,
  createLogModel,
  createCrocodileModel,
  createVineModel,
  createScorpionModel,
  createCampfireModel,
  createTreasureModel,
  createOpeningQuicksandModel,
  createBrickWallModel,
  isSharedModelGeometry,
  isSharedModelMaterial
} from './models.js';
import { createVoxelGeometry, createVoxelMaterial } from './voxel.js';
import { audio } from './audio.js';

export const SCREEN_LENGTH = 60; // Length of each screen along Z axis
export const PATH_WIDTH = 8;     // Width of corridor
export const TUNNEL_FLOOR_Y = -12; // Underground tunnel floor (ladder screens)
export const CEIL_TOP_Y = -7; // Cave ceiling top (landing on it is hit kill)

export class World {
  constructor(scene) {
    this.scene = scene;
    this.screens = new Map(); // screenIndex => ScreenObject
    this.activeVines = [];
    this.activeCrocodiles = [];
    this.activeRollingLogs = [];
    this.nearestLogThreat = null; // { t, logZ } recomputed every frame (rear warning)
    this.activeTreasures = [];
    this.activeHazards = [];
    this.animatedCampfires = [];
    this.animatedTorches = [];
    this.torchTime = 0;
    this.activeOpeningPits = [];
    this.activeTunnelWalls = []; // brick dead-ends (authentic bit-7 wall logic)
    this.collectedTreasureSlots = new Set(); // authentic treasureBits: once per run

    // Fixed pool of PointLights (constant count => shaders compile once and
    // never again on screen crossings). Per-frame the nearest light emitters
    // around the player are assigned to pool slots; the rest stay parked at
    // intensity 0 (still counted, keeping every program cache key stable).
    this.POOL_SIZE = 8;
    this.lightPool = [];
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, 1);
      scene.add(pl);
      this.lightPool.push(pl);
    }
    // { screenIndex, color, distance, intensity, getPos(Vector3)->Vector3 }
    this.lightEmitters = [];
    this._poolVec = new THREE.Vector3();

    // Shared world-structure geometry/material cache: boxes reused on every
    // screen (borders, flags, tunnel walls, ladder rungs, spikes, pond water)
    // are built once and registered as shared — screen cleanup never disposes
    // them and repeated builds stop allocating.
    this.worldGeoCache = new Map();

    // Log shatter debris (shared unit cube + 3 wood materials: no per-burst
    // allocation, nothing to dispose on screen removal).
    this.logDebris = [];
    this.debrisGeo = new THREE.BoxGeometry(1, 1, 1);
    this.debrisMats = [0x784414, 0x542d0a, 0x9a5c20].map(
      (c) => new THREE.MeshLambertMaterial({ color: c })
    );

    // Base materials
    this.groundMaterial = createVoxelMaterial();
    this.waterMaterial = new THREE.MeshLambertMaterial({
      color: 0x1a6aaa,
      transparent: true,
      opacity: 0.85,
    });
    this.pitMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

    // Underground materials — declared BEFORE shared-resource registration so
    // they are protected from disposal (they were previously referenced before
    // definition, silently skipped by the `if (m)` guard and disposed on every
    // screen cleanup, forcing constant shader recompiles).
    this.tunnelWallMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
    this.tunnelFloorMaterial = new THREE.MeshLambertMaterial({ color: 0x5a4128 });
    this.caveCeilMaterial = new THREE.MeshLambertMaterial({ color: 0x2e2418 });
    this.ladderMaterial = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    this.spikeMaterial = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });

    // Shared tree template for cloning
    this.treeTemplate = createTreeModel(0.5);
    // Shared log template for cloning (identical on every screen: cloning skips
    // the voxel face-culling rebuild and reuses the uploaded GPU buffers).
    this.logTemplate = createLogModel(0.18, 38);

    // Shared GPU resources (never disposed on screen removal: clones reuse them).
    this.sharedGeometries = new Set();
    this.sharedMaterials = new Set();
    for (const tpl of [this.treeTemplate, this.logTemplate]) {
      tpl.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) this.sharedGeometries.add(o.geometry);
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          for (const m of mats) this.sharedMaterials.add(m);
        }
      });
    }
    // The log template material is the models-wide shared voxel material, so
    // registering it also protects every other voxel model from disposal.
    // Debris resources are shared too (spawned chunks reuse them forever).
    this.sharedGeometries.add(this.debrisGeo);
    for (const m of this.debrisMats) this.sharedMaterials.add(m);
    for (const m of [this.groundMaterial, this.waterMaterial, this.pitMaterial,
      this.tunnelWallMaterial, this.tunnelFloorMaterial, this.caveCeilMaterial,
      this.ladderMaterial, this.spikeMaterial]) {
      if (m) this.sharedMaterials.add(m);
    }
  }

  // Cached geometry shared across all screens (auto-registered as protected).
  sharedGeo(key, build) {
    let geo = this.worldGeoCache.get(key);
    if (!geo) {
      geo = build();
      this.worldGeoCache.set(key, geo);
      this.sharedGeometries.add(geo);
    }
    return geo;
  }

  // Cached material shared across all screens (auto-registered as protected).
  sharedMat(key, build) {
    let mat = this.worldGeoCache.get(key);
    if (!mat) {
      mat = build();
      this.worldGeoCache.set(key, mat);
      this.sharedMaterials.add(mat);
    }
    return mat;
  }

  // Generate or get screen at index (0, 1, 2, ...)
  getOrCreateScreen(screenIndex) {
    if (this.screens.has(screenIndex)) {
      return this.screens.get(screenIndex);
    }

    const screenData = this.buildScreen(screenIndex);
    this.screens.set(screenIndex, screenData);
    this.scene.add(screenData.group);
    return screenData;
  }

  // Update visible screens around current player Z
  updateVisibleScreens(currentScreenIndex) {
    const keepRange = 2;
    // Build missing screens, at most ONE per frame (nearest first): a full
    // screen build uploads ~250k verts to the GPU, so it must never share a
    // frame with the checkpoint crossing — prefetch (see prefetchScreen) builds
    // the next screen while the player is still mid-screen.
    const missing = [];
    for (let i = currentScreenIndex - 1; i <= currentScreenIndex + keepRange; i++) {
      if (!this.screens.has(i)) missing.push(i);
    }
    missing.sort((a, b) => Math.abs(a - currentScreenIndex) - Math.abs(b - currentScreenIndex));
    if (missing.length > 0) {
      this.getOrCreateScreen(missing[0]);
    }

    // Cleanup distant screens to keep memory tight (keep exactly one behind:
    // with prefetch the steady state is 4 screens alive, never more).
    for (const [idx, screen] of this.screens.entries()) {
      if (idx < currentScreenIndex - 1 || idx > currentScreenIndex + keepRange + 1) {
        this.scene.remove(screen.group);
        // remove items from active lists
        this.removeScreenEntities(screen);
        this.screens.delete(idx);
      }
    }
  }

  // Builds screen i ahead of time (no cleanup): call while the player is still
  // approaching the next checkpoint so the boundary-crossing frame builds nothing.
  prefetchScreen(screenIndex) {
    if (!this.screens.has(screenIndex)) {
      this.getOrCreateScreen(screenIndex);
    }
  }

  // Releases per-screen GPU resources (leaked VRAM/GC pressure otherwise:
  // scene.remove() alone never frees uploaded buffers).
  disposeScreenGroup(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry && !this.sharedGeometries.has(o.geometry) &&
          !isSharedModelGeometry(o.geometry)) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) {
          if (!this.sharedMaterials.has(m) && !isSharedModelMaterial(m)) m.dispose();
        }
        // Textures are all shared (hazard stripe), never disposed here.
      }
    });
  }

  removeScreenEntities(screen) {
    this.disposeScreenGroup(screen.group);
    this.lightEmitters = this.lightEmitters.filter(e => e.screenIndex !== screen.index);
    this.activeVines = this.activeVines.filter(v => v.screenIndex !== screen.index);
    this.activeCrocodiles = this.activeCrocodiles.filter(c => c.screenIndex !== screen.index);
    this.activeRollingLogs = this.activeRollingLogs.filter(l => l.screenIndex !== screen.index);
    this.activeTreasures = this.activeTreasures.filter(t => t.screenIndex !== screen.index);
    this.activeHazards = this.activeHazards.filter(h => h.screenIndex !== screen.index);
    this.animatedCampfires = this.animatedCampfires.filter(c => c.screenIndex !== screen.index);
    this.animatedTorches = this.animatedTorches.filter(t => t.screenIndex !== screen.index);
    this.activeOpeningPits = this.activeOpeningPits.filter(p => p.screenIndex !== screen.index);
    this.activeTunnelWalls = this.activeTunnelWalls.filter(wl => wl.screenIndex !== screen.index);
    this.logDebris = this.logDebris.filter(d => d.screenIndex !== screen.index);
  }

  buildScreen(index) {
    const group = new THREE.Group();
    const startZ = -index * SCREEN_LENGTH;
    const endZ = -(index + 1) * SCREEN_LENGTH;
    const midZ = (startZ + endZ) / 2;

    const screenType = this.getScreenType(index);

    // 1. Build Ground and Corridor Trees
    this.buildGroundAndBorders(group, index, startZ, endZ, screenType);

    // 2. Boundary flags at the start and end of the screen (visuals + checkpoints)
    this.addBoundaryFlags(group, startZ, endZ);

    // 2b. Section of the continuous tunnel on EVERY screen (endless underground)
    this.addTunnel(group, index, startZ, endZ);
    // 2c. Scorpion ONLY in tunnels without ladders (away from landings)
    if (screenType !== 'HOLE_SINGLE' && screenType !== 'HOLE_TRIPLE') {
      this.addScorpion(group, index, midZ, TUNNEL_FLOOR_Y + 0.08, 3);
    }
    // 2c. Cave ceiling (solid here; shaft screens will cut holes in it)
    if (screenType !== 'HOLE_SINGLE' && screenType !== 'HOLE_TRIPLE') {
      this.addCaveCeiling(group, startZ, endZ);
    }

    // 3. Build Specific Screen Hazards / Features
    this.buildScreenFeatures(group, index, startZ, endZ, midZ, screenType);

    return {
      index,
      group,
      startZ,
      endZ,
      type: screenType,
    };
  }

  // --- Authentic Atari 2600 level generator (pitfall.asm) ---
  // Bidirectional LFSR, seed $C4. Forward (-Z) = RightRandom:
  //   random' = (random << 1) | (bit3^bit4^bit5^bit7)
  // Bits: 0..2 ground object, 3..5 scene, 6..7 tree pattern, 7 wall side.
  static lfsrRight(r) {
    const b3 = (r >> 3) & 1, b4 = (r >> 4) & 1, b5 = (r >> 5) & 1, b7 = (r >> 7) & 1;
    return ((r << 1) & 0xff) | (b3 ^ b4 ^ b5 ^ b7);
  }

  // Screen N = LFSR stepped (N mod 255) times right from seed $C4.
  // Only 255 phases exist: phase 256 wraps back to phase 1 (seamless forward loop).
  // All 255 phases are precomputed once (O(1) lookups, zero per-build stepping).
  static LFSR_TABLE = (() => {
    const table = [];
    let r = 0xc4;
    for (let i = 0; i < 255; i++) {
      const objectType = r & 0x07;
      const sceneType = (r >> 3) & 0x07;
      table.push({
        rand: r,
        objectType,
        sceneType,
        treePat: (r >> 6) & 0x03,
        // Authentic treasure slot (pitfall.asm CheckTreasures): one of 32
        // unique slots per run, tracked with 4 bytes of treasureBits.
        // The 6502 does `rol; rol; rol; and #3` through carry, which reduces
        // exactly to (r >> 6) & 3 (= treePat) — verified against a cycle-exact
        // emulation of the instruction sequence.
        treasureSlot: ((r >> 6) & 3) * 8 + objectType,
      });
      r = World.lfsrRight(r);
    }
    return table;
  })();

  getAuthenticSpec(index) {
    return World.LFSR_TABLE[((index % 255) + 255) % 255];
  }

  // Treasures already claimed this run, keyed "<phase255>:<objectType>"
  // (pitfall.asm treasureBits: a collected treasure never reappears).
  static treasureKey(index) {
    const phase = ((index % 255) + 255) % 255;
    return `${phase}:${World.LFSR_TABLE[phase].objectType}`;
  }

  claimTreasureSlot(treasure) {
    if (treasure && treasure.slotKey) this.collectedTreasureSlots.add(treasure.slotKey);
  }

  resetRun() {
    this.collectedTreasureSlots.clear();
  }

  // Deterministic Pitfall 2600 screen sequence (hybrid authentic+)
  getScreenType(index) {
    const spec = this.getAuthenticSpec(index);
    // Scene 4 (crocodiles): half with a vine, half croc-only (decided by LFSR treePat —
    // deterministic, the map never changes between sessions).
    if (spec.sceneType === 4) {
      return spec.treePat % 2 === 1 ? 'CROCODILE_VINE' : 'CROCODILE_POND';
    }
    const base = [
      'HOLE_SINGLE',            // 0: one hole + ladder/wall underground
      'HOLE_TRIPLE',            // 1: three holes
      'TAR_PIT_VINE',           // 2: black pit + vine
      'QUICKSAND_VINE',         // 3: blue swamp + vine
      'CROCODILE_VINE',         // 4: (handled above)
      'DISAPPEARING_QUICKSAND', // 5: black quicksand + treasure
      'QUICKSAND_VINE_OPEN',    // 6: black quicksand + vine
      'BLUE_QUICKSAND',         // 7: blue quicksand (no vine)
    ][spec.sceneType];
    // Hybrid+: keep current rolling-log/vine-variety extras alive by
    // re-injecting them when the authentic cell would otherwise be bare
    // (bare rolling-log cells already cover ROLLING_LOGS/TRIPLE_LOGS).
    return base;
  }

  buildGroundAndBorders(group, index, startZ, endZ, screenType) {
    const length = SCREEN_LENGTH;
    const stepZ = 2;

    // Build corridor trees on left (-X) and right (+X)
    for (let z = startZ; z > endZ; z -= 7) {
      // Left side trees (2 rows deep for dense forest corridor)
      const treeL1 = this.treeTemplate.clone();
      treeL1.position.set(-5.5 - Math.random() * 1.5, 0, z + (Math.random() - 0.5) * 2);
      treeL1.rotation.y = (z % 4) * (Math.PI / 2);
      group.add(treeL1);

      const treeL2 = this.treeTemplate.clone();
      treeL2.position.set(-10 - Math.random() * 2, 0, z + 3);
      group.add(treeL2);

      // Right side trees
      const treeR1 = this.treeTemplate.clone();
      treeR1.position.set(5.5 + Math.random() * 1.5, 0, z + (Math.random() - 0.5) * 2);
      treeR1.rotation.y = ((z + 2) % 4) * (Math.PI / 2);
      group.add(treeR1);

      const treeR2 = this.treeTemplate.clone();
      treeR2.position.set(10 + Math.random() * 2, 0, z + 3);
      group.add(treeR2);
    }

    // Build Ground Voxel Strips
    // If screen has a pit/pond in the middle, create a gap in ground
    const hasCentralHazard = ['QUICKSAND_VINE', 'TAR_PIT_VINE', 'CROCODILE_VINE', 'CROCODILE_POND', 'QUICKSAND_VINE_OPEN', 'BLUE_QUICKSAND'].includes(screenType);
    // Half-length of the central lake: 10m for all scene types (20m total — vine lake,
    // tar pit, and croc pond all share the same size; the vine behaves identically in all).
    const centralHazardHalf = 10;
    const hazardStartZ = (startZ + endZ) / 2 + centralHazardHalf;
    const hazardEndZ = (startZ + endZ) / 2 - centralHazardHalf;

    const midZ = (startZ + endZ) / 2;
    const hasDisappearingPit = ['DISAPPEARING_QUICKSAND', 'BLUE_QUICKSAND'].includes(screenType);
    const pitCenterZ = midZ;
    // Blue exit pit for logs (1 row, ~1.5m). Only on screens with rolling logs
    // in the upper map (obj 0..3, scene != 5).
    const specForGround = this.getAuthenticSpec(index);
    const hasLogExitPit = !!specForGround && specForGround.sceneType !== 5 && specForGround.sceneType !== 4 && specForGround.objectType <= 3;
    const logExitPitCenterZ = startZ - 1.5;

    const groundVoxels = [];
    const grassColor = '#306c24';
    const grassBorderColor = '#489830';
    const pathColor = '#9a7638';
    const pathShade = '#825f26';

    for (let z = 0; z < length; z += 1.5) {
      const worldZ = startZ - z;
      const isOverHazard = hasCentralHazard && (worldZ <= hazardStartZ && worldZ >= hazardEndZ);
      const isOverDisappearingPit = hasDisappearingPit && Math.abs(worldZ - pitCenterZ) <= 10.2;
      // Underground shafts (ladder): 1 of 4m or 3 of 3m
      const isOverShaft = (screenType === 'HOLE_SINGLE' && Math.abs(worldZ - midZ) <= 2.2) ||
        (screenType === 'HOLE_TRIPLE' &&
          (Math.abs(worldZ - (midZ + 12)) <= 1.7 || Math.abs(worldZ - midZ) <= 1.7 || Math.abs(worldZ - (midZ - 12)) <= 1.7));
      // Log exit row: 1 full-width row (including the green edges)
      const isOverLogExit = hasLogExitPit && Math.abs(worldZ - logExitPitCenterZ) <= 0.8;
      if (isOverLogExit) continue;

      // Path corridor voxels (-3 to +3). The green edges (|x|>=3) remain
      // visible even over other pits — only the central path opens a gap.
      for (let x = -4; x <= 4; x++) {
        const isEdge = Math.abs(x) >= 3;
        if (!isEdge && (isOverHazard || isOverDisappearingPit || isOverShaft)) continue;

          let col = isEdge ? ((x + z) % 2 === 0 ? grassBorderColor : grassColor) : (((x + z) % 3 === 0) ? pathShade : pathColor);
          groundVoxels.push({ x, y: 0, z: -z, color: col });
        }
    }

    if (groundVoxels.length > 0) {
      const groundGeo = createVoxelGeometry(groundVoxels, 1.0, false);
      const groundMesh = new THREE.Mesh(groundGeo, this.groundMaterial);
      // Voxels with center=false occupy [x, x+1]: columns -4..4 generate
      // [-4, +5]. The -0.5 offset on X symmetrizes the strip to [-4.5, +4.5],
      // mirroring the right edge on the left (two green lines per side)
      // and centering the pit gap over the quicksand lid.
      groundMesh.position.set(-0.5, -1.0, startZ);
      groundMesh.receiveShadow = true;
      group.add(groundMesh);
    }

    // Lateral green grass borders beneath trees
    const borderGeo = this.sharedGeo('border', () => new THREE.BoxGeometry(16, 1, length));
    const borderMat = this.sharedMat('borderMat', () => new THREE.MeshLambertMaterial({ color: 0x224e18, flatShading: true }));

    // Top joints flush with the ground strip (which goes to ±4.5): no coplanar
    // overlap (avoids z-fighting) on either side.
    const leftBorder = new THREE.Mesh(borderGeo, borderMat);
    leftBorder.position.set(-12.5, -0.5, (startZ + endZ) / 2);
    group.add(leftBorder);

    const rightBorder = new THREE.Mesh(borderGeo, borderMat);
    rightBorder.position.set(12.5, -0.5, (startZ + endZ) / 2);
    group.add(rightBorder);
  }

  buildScreenFeatures(group, index, startZ, endZ, midZ, type) {
    // Authentic spec from pitfall.asm LFSR (seed $C4, stepped right)
    const spec = this.getAuthenticSpec(index) || { rand: 0, objectType: 4, sceneType: 0, treePat: 0 };
    const obj = spec.objectType;
    const scene = spec.sceneType;
    // Authentic ground-object depth: xPosObject = 124 of 160 px (pitfall.asm
    // ContRandom) — past the far edge of any central pit, on solid ground.
    const objZ = startZ - SCREEN_LENGTH * (124 / 160);
    // Authentic treasure kinds (scene 5 only): objectType & 3 selects the
    // sprite — money bag, silver bar, gold bar, diamond ring — worth exactly
    // 2000/3000/4000/5000 BCD points (matches models.js `points`).
    const treasureKinds = ['money', 'silver', 'gold', 'diamond'];
    // Authentic brick dead-end (pitfall.asm ContRandom): on ladder scenes
    // (0/1) bit 7 picks the wall side — 17/160 (left) or 136/160 (right).
    // Screen-left is behind us (+Z), so LEFT lands near the start edge.
    const wallFrac = ((spec.rand ?? 0) >> 7) & 1 ? 136 / 160 : 17 / 160;
    const tunnelWallZ = startZ - SCREEN_LENGTH * wallFrac;

    // Overlay ground object — surface map only (pitfall.asm bits 0..2).
    // Underground (tunnel + scorpion) for scenes 0-1 is built separately.
    // obj 7 = cobra (surface snake), spawned by addOverlayObject below.
    // Rolling logs: fixed, deterministic drop points on solid ground
    // (never inside lakes/pits), no randomness.
    const addOverlayObject = (z) => {
      if (scene === 5) return; // objectType IS the treasure kind on scene 5 (handled below)
      if (obj <= 3) {
        const count = [1, 2, 2, 3][obj];
        for (let i = 0; i < count; i++) {
          this.addRollingLog(group, index, startZ, endZ, i, count);
        }
        this.addLogExitPit(group, index, startZ);
      } else if (obj === 4) {
        this.addStationaryLog(group, index, z);
      } else if (obj === 5) {
        this.addStationaryLog(group, index, z + 5);
        this.addStationaryLog(group, index, z - 5);
      } else if (obj === 6) {
        this.addCampfire(group, index, z);
      } else if (obj === 7) {
        // obj 7 = cobra in the original (CheckTreasures/Color1PtrTab). Rendered
        // as the 3D rattlesnake — same hazard role, same kill box as the fire.
        this.addSnake(group, index, z);
      }
    }

    switch (type) {
      case 'HOLE_SINGLE':
        // Original: hole with ladder to the underground. Walk in to descend,
        // jump over to stay on the surface.
        this.addLadderShaft(group, index, midZ, 2);
        this.addCaveCeiling(group, startZ, endZ, [{ centerZ: midZ, half: 2 }]);
        // Authentic brick dead-end in the tunnel below (bit-7 side).
        this.addTunnelWall(group, index, tunnelWallZ);
        addOverlayObject(objZ);
        break;

      case 'HOLE_TRIPLE':
        // Original: three holes, but ladder ONLY in the middle one — the side holes drop straight in.
        this.addLadderShaft(group, index, midZ + 12, 1.5, false);
        this.addLadderShaft(group, index, midZ, 1.5, true);
        this.addLadderShaft(group, index, midZ - 12, 1.5, false);
        this.addCaveCeiling(group, startZ, endZ, [12, 0, -12].map((off) => ({ centerZ: midZ + off, half: 1.5 })));
        // Authentic brick dead-end in the tunnel below (bit-7 side).
        this.addTunnelWall(group, index, tunnelWallZ);
        addOverlayObject(objZ);
        break;

      case 'DISAPPEARING_QUICKSAND': {
        // Original scene 5 — THE ONLY treasure scene (pitfall.asm: treasures
        // spawn exclusively on sceneType 5). Kind = objectType & 3, worth
        // 2000/3000/4000/5000. Each (phase, kind) slot exists once per run,
        // exactly like the ROM's 32 treasureBits — claimed slots spawn nothing.
        const slotKey = World.treasureKey(index);
        if (!this.collectedTreasureSlots.has(slotKey)) {
          this.addOpeningQuicksandPit(group, index, midZ);
          this.addTreasure(group, index, objZ, treasureKinds[obj & 3], slotKey);
        } else {
          // Pit still renders on revisits — only the treasure is gone.
          this.addOpeningQuicksandPit(group, index, midZ);
        }
        break;
      }

      case 'BLUE_QUICKSAND':
        // Original scene 7: blue quicksand, no vine, NO treasure.
        this.addOpeningQuicksandPit(group, index, midZ);
        addOverlayObject(objZ);
        break;

      case 'QUICKSAND_VINE':
        // Original scene 3: blue swamp + vine, NO treasure.
        this.addWaterPond(group, index, midZ, 20);
        this.addVine(group, index, midZ);
        addOverlayObject(objZ);
        break;

      case 'TAR_PIT_VINE':
        // Original scene 2: black tar pit + vine, NO treasure.
        this.addTarPit(group, index, midZ, 20);
        this.addVine(group, index, midZ);
        addOverlayObject(objZ);
        break;

      case 'CROCODILE_VINE': {
        // Original scene 4: croc pond (3 crocs) + vine.
        this.addWaterPond(group, index, midZ, 20);
        this.addCrocodileTrio(group, index, midZ);
        this.addVine(group, index, midZ);
        break;
      }

      case 'CROCODILE_POND': {
        // Croc lake without a vine (croc-only): cross by hopping from croc to croc.
        this.addWaterPond(group, index, midZ, 20);
        this.addCrocodileTrio(group, index, midZ);
        break;
      }

      case 'QUICKSAND_VINE_OPEN':
        // Original scene 6: black quicksand + vine, NO treasure.
        this.addOpeningQuicksandPit(group, index, midZ);
        this.addVine(group, index, midZ);
        addOverlayObject(objZ);
        break;

      default:
        this.addStationaryLog(group, index, midZ);
        break;
    }
  }

  // --- Hazard Builders ---

  addStationaryLog(group, screenIndex, z) {
    // Wide log covering the yellow track plus half of each green edge
    // (38 voxels ≈ 7m): rolls visually over the pit margins.
    // Cloned from the shared template (no voxel rebuild, shared GPU buffers).
    const log = this.logTemplate.clone();
    log.position.set(0, 0.45, z);
    group.add(log);

    this.activeHazards.push({
      type: 'log',
      screenIndex,
      mesh: log,
      z: z,
      radius: 1.2,
      isRolling: false,
    });
  }

  // Warning stripe texture (yellow/black) for the falling-log ground marker.
  makeHazardStripeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#141414';
    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate(-Math.PI / 4);
    for (let x = -128; x < 128; x += 32) {
      ctx.fillRect(x, -128, 16, 256);
    }
    ctx.restore();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Ground warning marker for where the log will land: striped disc +
  // pulsing red ring, clearly visible from a distance so the player can brake in time.
  createFallingLogWarning(z) {
    const group = new THREE.Group();
    if (!this.hazardStripeTex) {
      this.hazardStripeTex = this.makeHazardStripeTexture();
    }
    const discMat = new THREE.MeshBasicMaterial({
      map: this.hazardStripeTex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.9, 24), discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    group.add(disc);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff2200,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.3, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);

    group.position.set(0, 0, z);
    return { group, disc, ring, discMat, ringMat };
  }

  // Exact cycle for one log: sky drop (~0.88s) + rolling 52m at 6.5m/s
  // (8.0s) + pit fall (~0.91s) ≈ 9.8s. Because geometry is identical every screen,
  // the cycle is constant and the staggered timing never drifts.
  static ROLLING_CYCLE = 9.8;

  addRollingLog(group, screenIndex, startZ, endZ, idx, count) {
    // Wide log covering the yellow track plus half of each green edge
    // (38 voxels ≈ 7m): rolls visually over the pit margins.
    // Cloned from the shared template (no voxel rebuild, shared GPU buffers).
    const log = this.logTemplate.clone();
    const dropZ = this.rollingDropZ(endZ);
    // Sky drop always from the screen's single drop point; logs stagger in time
    // (idx/count of cycle), with no randomness.
    const spawnY = 12;
    log.position.set(0, spawnY, dropZ);
    log.visible = false;
    group.add(log);

    // Ground warning marker: striped disc + pulsing red ring.
    // Grows and flashes as the log falls, disappears upon touching the ground.
    const alert = this.createFallingLogWarning(dropZ);
    alert.group.visible = false;
    group.add(alert.group);

    const logData = {
      type: 'rolling_log',
      screenIndex,
      group, // debris spawns into the same screen group
      mesh: log,
      landingShadow: alert.group,
      alertDisc: alert.disc,
      alertRing: alert.ring,
      alertDiscMat: alert.discMat,
      alertRingMat: alert.ringMat,
      z: dropZ,
      spawnZ: dropZ, // single return point — no Math.random
      y: spawnY,
      spawnY,
      vy: 0,
      waiting: true, // waiting its turn in the staggered queue
      clock: 0,
      nextDrop: (idx * World.ROLLING_CYCLE) / count,
      falling: false,
      fallingIntoPit: false,
      groundY: 0.45,
      maxFallHeight: spawnY - 0.45,
      startZ,
      endZ,
      exitPitZ: startZ - 1.5, // center of the spike exit pit
      speed: 6.5, // units/sec towards player (+Z direction)
      radius: 1.2,
    };

    this.activeRollingLogs.push(logData);
    this.activeHazards.push(logData);
  }

  // Log shatter burst: the impaled log crumbles into flying wooden cubes.
  spawnLogShatter(group, screenIndex, z) {
    for (let i = 0; i < 16; i++) {
      const size = 0.14 + Math.random() * 0.22;
      const mesh = new THREE.Mesh(
        this.debrisGeo,
        this.debrisMats[i % this.debrisMats.length]
      );
      mesh.position.set(
        (Math.random() - 0.5) * 6.4,
        0.2 + Math.random() * 0.5,
        z + (Math.random() - 0.5) * 1.2
      );
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      mesh.scale.setScalar(size);
      group.add(mesh);
      this.logDebris.push({
        screenIndex,
        mesh,
        size,
        vx: (Math.random() - 0.5) * 8,
        vy: 2.5 + Math.random() * 4.5,
        vz: (Math.random() - 0.5) * 6,
        rx: (Math.random() - 0.5) * 12,
        ry: (Math.random() - 0.5) * 12,
        life: 0.7 + Math.random() * 0.4,
      });
    }
  }

  // Debris physics: gravity, ground bounce, spin, shrink-out.
  updateLogDebris(delta) {
    for (let i = this.logDebris.length - 1; i >= 0; i--) {
      const d = this.logDebris[i];
      d.life -= delta;
      if (d.life <= 0) {
        d.mesh.removeFromParent(); // shared geo/mats: nothing to dispose
        this.logDebris.splice(i, 1);
        continue;
      }
      d.vy -= 22 * delta;
      d.mesh.position.x += d.vx * delta;
      d.mesh.position.y += d.vy * delta;
      d.mesh.position.z += d.vz * delta;
      const floorY = d.size / 2;
      if (d.mesh.position.y < floorY) {
        d.mesh.position.y = floorY;
        d.vy *= -0.35;
        d.vx *= 0.6;
        d.vz *= 0.6;
        d.rx *= 0.6;
        d.ry *= 0.6;
      }
      d.mesh.rotation.x += d.rx * delta;
      d.mesh.rotation.y += d.ry * delta;
      d.mesh.scale.setScalar(d.size * Math.min(1, d.life / 0.3));
    }
  }

  addBoundaryFlags(group, startZ, endZ) {
    const poleGeo = this.sharedGeo('flagPole', () => new THREE.BoxGeometry(0.14, 2.6, 0.14));
    const flagGeo = this.sharedGeo('flagCloth', () => new THREE.BoxGeometry(0.95, 0.55, 0.08));
    const poleMat = this.sharedMat('flagPoleMat', () => new THREE.MeshLambertMaterial({ color: 0xf0e0c0 }));
    const flagMat = this.sharedMat('flagClothMat', () => new THREE.MeshLambertMaterial({ color: 0xff3020 }));
    for (const z of [startZ - 1]) {
      for (const x of [5.0, -5.0]) {
        const flag = new THREE.Group();
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 1.3;
        flag.add(pole);
        const cloth = new THREE.Mesh(flagGeo, flagMat);
        cloth.position.set(x > 0 ? -0.55 : 0.55, 2.25, 0);
        flag.add(cloth);
        flag.position.set(x, 0, z);
        group.add(flag);
      }
    }
  }

  // Single drop point for rolling logs per screen: 8m from the end of the screen
  // (away from the boundary checkpoint), always on solid ground
  // (outside lakes/pits) and away from central treasures. Each screen with
  // rolling logs has ONE drop point — the logs stagger through it over time.
  rollingDropZ(endZ) {
    return endZ + 8;
  }

  addLogExitPit(group, screenIndex, startZ, length = 1.5) {
    // Exact center on a voxel row (startZ-1.5): the ground cutout has
    // 1 row = 1.5m = the pit width, with no gaps down to the subsurface.
    const centerZ = startZ - 1.5;
    // Short black hole (1.5m = log width) spanning the FULL trail width
    // (including the green edges). The log falls in and drops back from the sky
    // at its single spawn point.
    const pitWidth = PATH_WIDTH + 1;
    const pitGeo = this.sharedGeo('logExitPit', () => new THREE.BoxGeometry(pitWidth, 0.2, length));
    const pitMesh = new THREE.Mesh(pitGeo, this.pitMaterial);
    pitMesh.position.set(0, -0.6, centerZ);
    group.add(pitMesh);
    // Spikes at the bottom: make it clear this area is not to be entered.
    const spikeGeo = this.sharedGeo('spike', () => new THREE.ConeGeometry(0.32, 2.0, 6));
    for (let x = -4; x <= 4; x += 1) {
      const spike = new THREE.Mesh(spikeGeo, this.spikeMaterial);
      spike.position.set(x, -1.0, centerZ); // tips at 0.0, at the mouth of the pit
      group.add(spike);
    }

    this.activeHazards.push({
      type: 'log_exit_pit',
      screenIndex,
      minZ: centerZ - length / 2,
      maxZ: centerZ + length / 2,
      centerZ,
    });
  }

  // Authentic brick dead-end wall (pitfall.asm): on ladder screens the tunnel
  // is blocked on one side, forcing Harry back to the surface. Spans the full
  // tunnel cross-section (floor -8 up to the ceiling slab at -3).
  addTunnelWall(group, screenIndex, wallZ) {
    const wall = createBrickWallModel(0.25, 0.25);
    wall.position.set(-4.5, TUNNEL_FLOOR_Y, wallZ - 0.5);
    group.add(wall);
    this.activeTunnelWalls.push({ screenIndex, z: wallZ });
  }

  // Underground pit (HOLE_* screens): dirt walls from level 0 down to the tunnel.
  // As in the original, NOT every pit has a ladder: only the middle one has wooden
  // rungs (up and down); the side ones drop straight in.
  addLadderShaft(group, screenIndex, centerZ, half, hasLadder = true) {
    // No surrounding walls — just the wooden ladder hanging in the gap.
    // Siding in the ceiling colour closes the gap between the track floor (bottom -1)
    // and the cave ceiling (top -7) around the hole.
    const holeLen = half * 2 + 1;
    const bandSideGeo = this.sharedGeo(`shaftBandSide:${half}`, () => new THREE.BoxGeometry(0.3, 6, holeLen + 0.6));
    for (const x of [-2.65, 2.65]) {
      const band = new THREE.Mesh(bandSideGeo, this.caveCeilMaterial);
      band.position.set(x, -4.0, centerZ);
      group.add(band);
    }
    const bandEndGeo = this.sharedGeo('shaftBandEnd', () => new THREE.BoxGeometry(5.6, 6, 0.3));
    for (const z of [centerZ - half - 0.65, centerZ + half + 0.65]) {
      const band = new THREE.Mesh(bandEndGeo, this.caveCeilMaterial);
      band.position.set(0, -4.0, z);
      group.add(band);
    }

    // Ladder: 2 rails + rungs descending in the gap (middle pit only).
    // Doesn't reach the bottom: the two lowest rungs have been removed.
    // Grouped so the whole ladder can slide to the entry wall: north side
    // going forward (-Z), south side coming back (+Z).
    let ladder = null;
    if (hasLadder) {
      const railGeo = this.sharedGeo('ladderRail', () => new THREE.BoxGeometry(0.12, 9.5, 0.12));
      const rungGeo = this.sharedGeo('ladderRung', () => new THREE.BoxGeometry(1.0, 0.09, 0.09));
      ladder = new THREE.Group();
      ladder.position.set(0, 0, centerZ - half + 0.45); // north wall by default
      for (const x of [-0.5, 0.5]) {
        const rail = new THREE.Mesh(railGeo, this.ladderMaterial);
        rail.position.set(x, -5.0, 0);
        ladder.add(rail);
      }
      for (let y = -0.5; y >= TUNNEL_FLOOR_Y + 2.2; y -= 0.8) {
        const rung = new THREE.Mesh(rungGeo, this.ladderMaterial);
        rung.position.set(0, y, 0);
        ladder.add(rung);
      }
      group.add(ladder);
    }

    this.activeHazards.push({
      type: 'ladder_shaft',
      screenIndex,
      minZ: centerZ - half,
      maxZ: centerZ + half,
      centerZ,
      half,
      hasLadder,
      ladder, // null on ladder-free side shafts
    });
  }

  // Continuous underground tunnel running through the entire game: every screen
  // has its own stretch (floor, side walls, and a point light) with no end walls —
  // the underground is seamless and the player can walk indefinitely, climbing
  // back up at any ladder shaft.
  // Surface pits above are intentionally shallow (2.5m) so they never invade the corridor.
  // Cave ceiling at y=-3 with gaps ONLY over ladder shafts ('shaftCuts'): hides the
  // surface world, but lets light and the player pass through via the ladders.
  // Called for screens WITH pits; for all other screens the ceiling has no gaps.
  addCaveCeiling(group, startZ, endZ, shaftCuts = []) {
    const cuts = shaftCuts
      .map((s) => [s.centerZ - s.half - 0.5, s.centerZ + s.half + 0.5])
      .sort((a, b) => a[0] - b[0]);
    let cur = endZ;
    const closeSeg = (hi) => {
      if (hi - cur >= 0.3) {
        const seg = new THREE.Mesh(
          this.sharedGeo(`ceilSeg:${hi - cur}`, () => new THREE.BoxGeometry(PATH_WIDTH + 1, 0.5, hi - cur)),
          this.caveCeilMaterial
        );
        seg.position.set(0, CEIL_TOP_Y - 0.25, (cur + hi) / 2);
        group.add(seg);
      }
      cur = hi;
    };
    for (const [c0, c1] of cuts) {
      closeSeg(Math.min(c0, startZ));
      cur = Math.max(cur, c1);
    }
    closeSeg(startZ);
  }

  // Tunnel stretch (floor, side walls and light) — every screen has its own,
  // forming the continuous seamless corridor. Ceiling goes in `addCaveCeiling`.
  addTunnel(group, screenIndex, startZ, endZ, floorY = TUNNEL_FLOOR_Y) {
    const midZ = (startZ + endZ) / 2;
    const length = SCREEN_LENGTH;

    const floor = new THREE.Mesh(
      this.sharedGeo('tunnelFloor', () => new THREE.BoxGeometry(PATH_WIDTH + 1, 0.5, length)),
      this.tunnelFloorMaterial
    );
    floor.position.set(0, TUNNEL_FLOOR_Y - 0.25, midZ);
    group.add(floor);

    const sideGeo = this.sharedGeo('tunnelSide', () => new THREE.BoxGeometry(0.5, 7.5, length));
    for (const x of [-4.75, 4.75]) {
      const wall = new THREE.Mesh(sideGeo, this.tunnelWallMaterial);
      wall.position.set(x, TUNNEL_FLOOR_Y + 3, midZ);
      group.add(wall);
    }

    const lampPos = new THREE.Vector3(0, TUNNEL_FLOOR_Y + 3.5, midZ);
    this.lightEmitters.push({
      screenIndex,
      underground: true, // only assigned to a pool slot while the player is down there
      color: 0xffb060,
      distance: 50,
      intensity: 25,
      getPos: (v) => v.copy(lampPos),
    });

    // Tunnel torches marking underground checkpoints (alternate sides like the
    // surface flags; brazier only, no dedicated light of their own).
    const bracketGeo = this.sharedGeo('torchBracket', () => new THREE.BoxGeometry(0.16, 0.16, 0.5));
    const stickGeo = this.sharedGeo('torchStick', () => new THREE.BoxGeometry(0.12, 0.9, 0.12));
    const flameGeo = this.sharedGeo('torchFlame', () => new THREE.ConeGeometry(0.2, 0.55, 6));
    const emberGeo = this.sharedGeo('torchEmber', () => new THREE.ConeGeometry(0.1, 0.3, 6));
    const bracketMat = this.sharedMat('torchBracketMat', () => new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
    const stickMat = this.sharedMat('torchStickMat', () => new THREE.MeshLambertMaterial({ color: 0x6a4a28 }));
    const flameMat = this.sharedMat('torchFlameMat', () => new THREE.MeshBasicMaterial({ color: 0xff7018 }));
    const emberMat = this.sharedMat('torchEmberMat', () => new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    for (const z of [startZ - 2]) {
      for (const x of [4.3, -4.3]) {
        const torch = new THREE.Group();
        const bracket = new THREE.Mesh(bracketGeo, bracketMat);
        bracket.rotation.y = Math.PI / 2;
        torch.add(bracket);
        const stick = new THREE.Mesh(stickGeo, stickMat);
        stick.position.y = 0.4;
        stick.rotation.z = x > 0 ? -0.15 : 0.15;
        torch.add(stick);
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.y = 1.05;
        torch.add(flame);
        const ember = new THREE.Mesh(emberGeo, emberMat);
        ember.position.y = 1.0;
        torch.add(ember);
        const glowPos = new THREE.Vector3(x, TUNNEL_FLOOR_Y + 2.5 + 1.1, z);
        torch.position.set(x, TUNNEL_FLOOR_Y + 2.5, z);
        group.add(torch);
        const torchEmitter = {
          screenIndex,
          underground: true, // only assigned to a pool slot while the player is down there
          color: 0xff8030,
          distance: 11,
          intensity: 6,
          getPos: (v) => v.copy(glowPos),
        };
        this.lightEmitters.push(torchEmitter);
        this.animatedTorches.push({
          screenIndex,
          emitter: torchEmitter,
          seed: Math.random() * 10,
        });
      }
    }
  }

  addTarPit(group, screenIndex, centerZ, length = 20) {
    // Keep the tar visible as a solid black rectangle instead of exposing an empty shaft.
    const pitGeo = this.sharedGeo('pondTar', () => new THREE.BoxGeometry(PATH_WIDTH, 0.3, length));
    const pitMesh = new THREE.Mesh(pitGeo, this.pitMaterial);
    pitMesh.position.set(0, -0.6, centerZ);
    group.add(pitMesh);

    this.activeHazards.push({
      type: 'tarpit',
      screenIndex,
      minZ: centerZ - length / 2 + 1,
      maxZ: centerZ + length / 2 - 1,
      centerZ,
    });
  }

  addOpeningQuicksandPit(group, screenIndex, z) {
    const pit = createOpeningQuicksandModel(0.45, 12);
    pit.group.position.set(0, -0.45, z);
    group.add(pit.group);
    const pitData = {
      type: 'disappearing_quicksand',
      screenIndex,
      pit: pit,
      segments: pit.segments,
      numSegments: pit.segments.length,
      z: z,
      radius: 10, // 20m total (same as the vine lake) — impossible to jump over when open!
      timer: Math.random() * 2.0,
      isOpen: false,
      openCount: 0,
      phase: 'closed', // closed | opening | open | closing (fills edges→middle)
      wasOpen: false,
      rumblePlayed: false,
      // Cycle (seconds): closed-solid pause (0.5s) → sinking spreads
      // middle→edges (1.8s) → fully open (5.0s) → filling converges
      // edges→middle (1.8s, ~5.6 m/s per side: slower than Harry's 9.0,
      // so pace the closing front to cross).
      // Total: 9.1s, open for most of the cycle.
      closedDur: 0.5,
      openingDur: 1.8,
      openDur: 5.0,
      closingDur: 1.8,
    };

    this.activeOpeningPits.push(pitData);
    this.activeHazards.push(pitData);
  }

  // Quicksand pit: returns the segment currently under the player's Z position
  getQuicksandSegmentAt(pitData, z) {
    const rel = z - pitData.z; // + = entry side (player), - = exit side
    for (const s of pitData.segments) {
      if (rel <= s.maxOffset && rel >= s.minOffset) return s;
    }
    return null;
  }

  // Quicksand pit: is the section under the player's feet currently open?
  isQuicksandOpenAt(pitData, z) {
    if (Math.abs(z - pitData.z) >= pitData.radius) return false;
    const seg = this.getQuicksandSegmentAt(pitData, z);
    if (seg) return seg.isOpen;
    return pitData.isOpen;
  }

  addWaterPond(group, screenIndex, centerZ, length = 20) {
    const waterGeo = this.sharedGeo('pondWater', () => new THREE.BoxGeometry(PATH_WIDTH, 0.3, length));
    const waterMesh = new THREE.Mesh(waterGeo, this.waterMaterial);
    waterMesh.position.set(0, -0.6, centerZ);
    group.add(waterMesh);
    this.activeHazards.push({
      type: 'water',
      screenIndex,
      minZ: centerZ - length / 2 + 1,
      maxZ: centerZ + length / 2 - 1,
      centerZ,
    });
  }

  addCrocodileTrio(group, screenIndex, centerZ) {
    // 3 scaled-down crocs (0.22) evenly spaced in a 20m lake.
    // Each croc covers [z-1.2, z+2.8] (safe zone on the back/scales).
    // 6.5m spacing (max jump = 6.75m): equal jumps from croc to croc.
    const offsetsZ = [6.5, 0, -6.5];
    offsetsZ.forEach((offset, idx) => {
      const croc = createCrocodileModel(0.22);
      const zPos = centerZ + offset;
      // Top at Y=0.35 (3 model voxels at 0.22 = 0.66, minus 0.31).
      croc.mesh.position.set(0, -0.31, zPos);
      croc.mesh.rotation.y = 0; // Snouts point towards incoming player (+Z)!
      group.add(croc.mesh);

      this.activeCrocodiles.push({
        screenIndex,
        croc,
        z: zPos,
        mouthTimer: idx * 1.1, // staggered mouth timing
        isOpen: false,
        wasOpen: false,
      });
    });
  }

  addVine(group, screenIndex, centerZ, phaseTime = null) {
    // Tall but reachable vine: tip at ~3.3m above ground (only grabbable in the air
    // while jumping — standing still on the ground never grabs, guaranteed in checkVineGrab).
    const vine = createVineModel(24, 0.28);
    // Position pivot high up in canopy overhead
    vine.pivot.position.set(0, 9.0, centerZ);
    group.add(vine.pivot);

    this.activeVines.push({
      screenIndex,
      vine,
      centerZ,
      time: phaseTime ?? Math.random() * Math.PI,
    });
  }

  addSnake(group, screenIndex, z) {
    // TEMPORARY: the reworked snake model was shelved; the original campfire
    // stands in for object 7 (cobra) until a new model is approved.
    this.addCampfire(group, screenIndex, z);
  }

  addCampfire(group, screenIndex, z) {
    const campfire = createCampfireModel(0.24);
    campfire.group.position.set(0, 0, z);
    group.add(campfire.group);

    const fireEmitter = {
      screenIndex,
      color: 0xff7722,
      distance: 12,
      intensity: 2.2,
      getPos: (v) => v.set(0, 1.1, z),
    };
    this.lightEmitters.push(fireEmitter);
    this.animatedCampfires.push({
      screenIndex,
      campfire: campfire,
      emitter: fireEmitter,
      time: Math.random() * 10,
    });

    this.activeHazards.push({
      type: 'fire',
      screenIndex,
      z: z,
      radius: 1.4,
    });
  }

  addScorpion(group, screenIndex, z, groundY = 0.08, patrolRange = 3) {
    const scorpion = createScorpionModel(0.28);
    scorpion.position.set(0, groundY, z);
    group.add(scorpion);

    const hazard = {
      type: 'scorpion',
      screenIndex,
      mesh: scorpion,
      baseZ: z,
      baseY: groundY,
      patrolRange,
      time: 0,
      radius: 1.2,
    };
    this.activeHazards.push(hazard);
    // Venom glow follows the patrolling scorpion (mesh transform applied).
    const anchorLocal = scorpion.userData?.lightAnchor?.position?.clone() ?? new THREE.Vector3();
    const followQuat = new THREE.Quaternion();
    const followPos = new THREE.Vector3();
    const venomEmitter = {
      screenIndex,
      underground: true, // only assigned to a pool slot while the player is down there
      color: 0xffcc00,
      distance: 5,
      intensity: 1.4,
      getPos: (v) => {
        scorpion.getWorldQuaternion(followQuat);
        followPos.copy(anchorLocal).applyQuaternion(followQuat);
        return v.copy(scorpion.position).add(followPos);
      },
    };
    this.lightEmitters.push(venomEmitter);
    hazard.emitter = venomEmitter;
  }

  addTreasure(group, screenIndex, z, type = 'gold', slotKey = null) {
    const treasure = createTreasureModel(type, 0.22);
    // The diamond ring is lifted slightly so the golden band doesn't look sunken into the ground
    const liftY = type === 'diamond' ? 0.3 : 0.05;
    treasure.mesh.position.set(0, liftY, z);
    group.add(treasure.mesh);

    this.activeTreasures.push({
      screenIndex,
      mesh: treasure.mesh,
      points: treasure.points,
      type: treasure.type,
      z: z,
      slotKey,
      collected: false,
    });
  }

  // Update dynamic elements (animations, rolling logs, vine pendulum)
  update(delta, playerZ = 0, inTunnel = false, climbing = null, northFacing = true, playerVz = 0) {
    // 1b. Ladder side follows the travel direction: north wall (-Z) going
    // forward, south wall (+Z) coming back — the player faces the rungs
    // while climbing either way.
    const ladderSide = northFacing ? -1 : 1;
    for (const h of this.activeHazards) {
      if (h.type === 'ladder_shaft' && h.ladder) {
        h.ladder.position.z = h.centerZ + ladderSide * (h.half - 0.45);
      }
    }

    // Directional hearing: positional hazard sounds (croc snaps, quicksand)
    // only play for hazards ahead of the player in the facing direction
    // (2m tolerance so sounds underfoot still play).
    const facingDir = northFacing ? -1 : 1;
    const isAhead = (hz) => (hz - playerZ) * facingDir > -2.0;

    // 1. Update Swinging Vines
    this.activeVines.forEach(v => {
      v.time += delta * v.vine.speed;
      v.vine.angle = Math.sin(v.time) * v.vine.maxAngle;
      v.vine.pivot.rotation.x = v.vine.angle; // swings forward and backward along Z!
    });

    // 2. Update Crocodiles (Mouth open/close cycles with high-visibility warnings)
    this.activeCrocodiles.forEach(c => {
      c.mouthTimer += delta;
      // Cycle: 4.4s total (2.6s closed/safe, 0.3s warning, 1.3s wide open, 0.2s snap shut)
      const cycleTime = c.mouthTimer % 4.4;
      let targetAngle = 0;

      if (cycleTime < 2.5) {
        // STATE: CLOSED (100% SAFE TO STEP)
        c.isOpen = false;
        targetAngle = 0;
        if (c.croc.eyeMaterial) c.croc.eyeMaterial.color.setHex(0xf8d820); // Calm Yellow eyes

        if (c.wasOpen) {
          // Just snapped shut! Safety sound only if the croc is ahead.
          if (isAhead(c.z)) audio.playCrocSnap();
          c.wasOpen = false;
        }
      } else if (cycleTime < 2.8) {
        // STATE: WARNING (Eyes flash orange before opening!)
        c.isOpen = false;
        targetAngle = -0.2;
        if (c.croc.eyeMaterial) c.croc.eyeMaterial.color.setHex(0xff8800); // Warning Orange eyes
      } else if (cycleTime < 4.1) {
        // STATE: WIDE OPEN (DEADLY DANGER!)
        c.isOpen = true;
        c.wasOpen = true;
        targetAngle = -1.15; // Jaws wide open (~66 degrees), bright red throat exposed!
        if (c.croc.eyeMaterial) c.croc.eyeMaterial.color.setHex(0xff0000); // Angry Red eyes
      } else {
        // STATE: SNAPPING SHUT
        c.isOpen = true;
        targetAngle = 0;
      }

      // Smooth jaw rotation
      if (c.croc.upperJaw) {
        c.croc.currentAngle = THREE.MathUtils.lerp(c.croc.currentAngle || 0, targetAngle, delta * 16);
        c.croc.upperJaw.rotation.x = c.croc.currentAngle;
      }
    });

    // 3. Update Rolling Logs (single drop point per screen: logs stagger through it
    // over time via a clock — fully deterministic, no randomness: drop from sky,
    // roll to the spike pit, where the log CEASES TO EXIST (disappears into the spikes,
    // does not continue falling).
    // nearestLogThreat feeds the first-person rear warning (HUD + jump cue).
    this.nearestLogThreat = null;
    this.activeRollingLogs.forEach(l => {
      l.clock += delta;
      // Waiting its turn in the staggered queue (invisible up in the sky).
      if (l.waiting) {
        if (l.clock >= l.nextDrop) {
          l.nextDrop += World.ROLLING_CYCLE;
          l.waiting = false;
          l.falling = true;
          l.z = l.spawnZ;
          l.y = l.spawnY;
          l.vy = 0;
          l.mesh.visible = true;
          l.mesh.position.z = l.z;
          l.mesh.position.y = l.y;
          l.landingShadow.visible = true;
          if (!this.activeHazards.includes(l)) this.activeHazards.push(l);
        } else {
          return;
        }
      }
      // Sky drop before rolling: gravity until the log hits the ground
      if (l.falling) {
        l.vy -= 30 * delta;
        l.y += l.vy * delta;
        const fallProgress = THREE.MathUtils.clamp(
          1 - (l.y - l.groundY) / l.maxFallHeight,
          0,
          1,
        );
        // Pulsing warning marker: grows as the log approaches + flashes red.
        const pulse = (Math.sin(performance.now() * 0.012) + 1) / 2;
        const warnScale = 0.3 + fallProgress * 0.85;
        l.landingShadow.visible = true;
        l.landingShadow.position.z = l.z;
        l.landingShadow.scale.set(warnScale, 1, warnScale);
        if (l.alertDiscMat) l.alertDiscMat.opacity = 0.55 + fallProgress * 0.3;
        if (l.alertRingMat) l.alertRingMat.opacity = 0.45 + pulse * 0.5;
        if (l.alertDisc) l.alertDisc.rotation.z += delta * 1.5;
        if (l.alertRing) {
          const ringPulse = 1 + pulse * 0.12;
          l.alertRing.scale.set(ringPulse, ringPulse, 1);
        }
        if (l.y <= l.groundY) {
          l.y = l.groundY;
          l.vy = 0;
          l.falling = false;
          l.landingShadow.visible = false;
        }
        l.mesh.position.y = l.y;
        l.mesh.rotation.x += delta * 3; // gentle spin during the fall
      } else if (l.fallingIntoPit) {
        // The log reaches the spike pit and is impaled: it touches the spikes
        // and crumbles into cubes (never continues falling), then waits its
        // next turn in the queue (nextDrop already scheduled +1 cycle at drop).
        l.vy -= 30 * delta;
        l.y += l.vy * delta;
        l.z = l.exitPitZ;
        l.mesh.position.y = l.y;
        l.mesh.position.z = l.z;
        l.mesh.rotation.x += delta * 10;

        if (l.y <= 0.2) {
          // Touched the spikes: shatter burst, hide the log, wait for next turn.
          this.spawnLogShatter(l.group, l.screenIndex, l.z);
          l.waiting = true;
          l.falling = false;
          l.fallingIntoPit = false;
          l.mesh.visible = false;
          l.landingShadow.visible = false;
          const hi = this.activeHazards.indexOf(l);
          if (hi >= 0) this.activeHazards.splice(hi, 1);
        }
      } else {
        l.mesh.position.y = l.groundY;
        l.mesh.rotation.x += delta * 12; // rolling animation
        // Moves towards player (+Z direction) — only rolls after touching the ground
        l.z += l.speed * delta;
        l.mesh.position.z = l.z;

        // Proximity ticks: knock interval shrinks as the log nears the player.
        const ldz = Math.abs(l.z - playerZ);
        if (ldz < 25) {
          l.knockTimer = (l.knockTimer ?? 0) - delta;
          if (l.knockTimer <= 0) {
            audio.playWoodKnock(0.06 + 0.3 * (1 - ldz / 25));
            l.knockTimer = 0.12 + (ldz / 25) * 0.7;
          }
        }
        // 1D interception time with the player: t = (log - player) / (vp - vlog).
        const relV = playerVz - l.speed;
        let tHit = Infinity;
        if (Math.abs(relV) > 0.5) tHit = (l.z - playerZ) / relV;
        if (tHit >= 0 && tHit < 4 && (this.nearestLogThreat === null || tHit < this.nearestLogThreat.t)) {
          this.nearestLogThreat = { t: tHit, logZ: l.z };
        }

        // When the log reaches the exit pit, it gets impaled instead of
        // teleporting back immediately.
        if (l.z >= l.exitPitZ) {
          l.z = l.exitPitZ;
          l.y = l.groundY;
          l.vy = 0;
          l.fallingIntoPit = true;
          l.landingShadow.visible = false;
        }
      }
    });

    // 3b. Log shatter debris physics (cubes flying off the spike pit).
    this.updateLogDebris(delta);

    // 4b. Tunnel torch flicker (small, trembling warm light)
    this.torchTime += delta;
    this.animatedTorches.forEach(t => {
      t.emitter.intensity = 6 + Math.sin(this.torchTime * 13 + t.seed) * 1.3 +
        Math.sin(this.torchTime * 29 + t.seed * 2) * 0.7;
    });

    // 4. Update Animated Campfires (Core, multi-tongue flames, rising embers, flickering light)
    this.animatedCampfires.forEach(f => {
      f.time += delta;
      const t = f.time;
      const c = f.campfire;

      // A. Blazing Core Heat Pulse
      const scaleCoreY = 1.0 + Math.sin(t * 14) * 0.16 + Math.cos(t * 22) * 0.1;
      const scaleCoreXZ = 1.0 + Math.sin(t * 9) * 0.08;
      if (c.coreFlame) {
        c.coreFlame.scale.set(scaleCoreXZ, scaleCoreY, scaleCoreXZ);
      }

      // B. Outer Flame Tongues Dancing & Swaying
      if (c.outerFlames) {
        c.outerFlames.forEach((flame, i) => {
          const scaleY = 1.0 + Math.sin(t * 12 + i * 1.7) * 0.28 + Math.sin(t * 19 + i * 2.3) * 0.14;
          const swayX = Math.sin(t * 7 + i * 1.4) * 0.08;
          const swayZ = Math.cos(t * 8 + i * 1.8) * 0.08;
          flame.scale.set(1.0, scaleY, 1.0);
          flame.rotation.z = swayX;
          flame.rotation.x = swayZ;
        });
      }

      // C. Rising Glowing Voxel Embers / Sparks
      if (c.embers) {
        c.embers.forEach(ember => {
          ember.mesh.position.y += ember.speed * delta;
          ember.mesh.position.x += Math.sin(t * 5 + ember.seed) * 0.012;
          ember.mesh.position.z += Math.cos(t * 4 + ember.seed) * 0.012;

          if (ember.mesh.position.y > 2.5) {
            ember.mesh.position.y = 0.35 + Math.random() * 0.2;
            ember.mesh.position.x = (Math.random() - 0.5) * 0.6;
            ember.mesh.position.z = (Math.random() - 0.5) * 0.6;
          }
        });
      }

      // D. Dynamic Warm Fire Light Flicker (pooled light assigned per-frame)
      if (f.emitter) {
        f.emitter.intensity = 2.0 + Math.sin(t * 18) * 0.4 + (Math.random() - 0.5) * 0.3;
      }
    });

    // 5. Update Scorpions (scuttle back and forth along trail with step bounce & light pulse)
    this.activeHazards.filter(h => h.type === 'scorpion').forEach(s => {
      // Slow, steady patrol (~2.2 m/s peak): gives the player time to jump over.
      s.time += delta * (2.2 / (s.patrolRange || 3));
      s.mesh.position.z = s.baseZ + Math.sin(s.time) * (s.patrolRange || 3);
      s.z = s.mesh.position.z;
      s.mesh.rotation.y = Math.cos(s.time) >= 0 ? 0 : Math.PI;

      // Arachnid scuttle wobble and slight step bounce above the ground
      s.mesh.rotation.z = Math.sin(s.time * 12) * 0.04;
      s.mesh.position.y = (s.baseY ?? 0.08) + Math.abs(Math.sin(s.time * 12)) * 0.03;

      if (s.emitter) {
        s.emitter.intensity = 1.4 + Math.sin(s.time * 8) * 0.5;
      }
    });

    // 6. Update Treasures (rotate in place)
    this.activeTreasures.forEach(t => {
      if (!t.collected) {
        t.mesh.rotation.y += delta * 2.2;
      }
    });

    // 7. Update Disappearing Quicksand Pits (per-section cycle)
    // Phases: closed-solid pause (0.5s) → sinking spreads middle→edges
    // (2.2s) → fully open (5.0s) → filling converges edges→middle
    // (2.2s, pace the closing front to cross).
    // Total: 9.9s. Each section splits in half (X) and sinks (Y).
    this.activeOpeningPits.forEach(p => {
      p.timer += delta;
      const n = p.numSegments;
      const total = p.closedDur + p.openingDur + p.openDur + p.closingDur;
      const cycleTime = p.timer % total;

      let phase = 'closed';
      if (cycleTime < p.closedDur) {
        phase = 'closed';
      } else if (cycleTime < p.closedDur + p.openingDur) {
        phase = 'opening';
      } else if (cycleTime < p.closedDur + p.openingDur + p.openDur) {
        phase = 'open';
      } else {
        phase = 'closing';
      }
      p.phase = phase;

      // Global cycle transition sounds (only if the pit is ahead)
      if (phase === 'opening') {
        if (!p.rumblePlayed && isAhead(p.z)) {
          audio.playQuicksandRumble();
          p.rumblePlayed = true;
        }
      } else if (phase === 'closed') {
        if (p.wasOpen) {
          if (isAhead(p.z)) audio.playGroundThud();
          p.wasOpen = false;
          p.rumblePlayed = false;
        }
      }

      let openCount = 0;
      p.segments.forEach((seg, i) => {
        // Moment when this section should be open (binary target 0/1).
        // Bidirectional like the original: sinking starts in the MIDDLE and
        // spreads to both edges, filling starts at BOTH edges and meets in
        // the middle. d = 0 at the center, 1 at the edges.
        const half = Math.max(0.5, (n - 1) / 2);
        const d = Math.abs(i - (n - 1) / 2) / half;
        const openStart = p.closedDur + d * p.openingDur;
        const closeStart = p.closedDur + p.openingDur + p.openDur + (1 - d) * p.closingDur;
        const target = cycleTime >= openStart && cycleTime < closeStart ? 1 : 0;

        // Smooth section open/close
        seg.openAmount = THREE.MathUtils.lerp(seg.openAmount ?? 0, target, delta * 10);
        if (Math.abs(seg.openAmount - target) < 0.01) seg.openAmount = target;
        seg.isOpen = seg.openAmount > 0.5;
        if (seg.isOpen) openCount++;

        // Halves split from the centre outward (X) and sink (Y)
        const sep = seg.openAmount * 1.4;
        const sink = seg.openAmount * 4.0; // Sink much deeper to hide them
        // Earthquake jitter while the section is in motion
        const moving = Math.abs(target - seg.openAmount) > 0.02 ? 1 : 0;
        const jitter = moving * Math.sin(p.timer * 50 + i * 2.1) * 0.06;
        seg.leftMesh.position.set(seg.baseOffset - sep + jitter, -sink, seg.baseOffset);
        seg.rightMesh.position.set(seg.baseOffset + sep + jitter, -sink, seg.baseOffset);
        
        // Hide the meshes completely when fully open so they don't show at the bottom
        const hide = seg.openAmount > 0.95;
        seg.leftMesh.visible = !hide;
        seg.rightMesh.visible = !hide;
      });

      p.openCount = openCount;
      p.isOpen = openCount > 0;
      if (openCount > 0) p.wasOpen = true;
    });

    // 8. Assign pooled PointLights to the nearest eligible emitters.
    // Zone-split: on the surface only surface emitters (campfires) compete
    // for slots; underground (or climbing the shaft) only tunnel lamps,
    // torches and the scorpion glow. The pool count never changes, so shaders
    // never recompile — and each zone stops paying for the other's lights.
    this.updateLightPool(playerZ, !!(inTunnel || climbing));
  }

  updateLightPool(playerZ, underground) {
    const eligible = [];
    for (const e of this.lightEmitters) {
      if (!!e.underground !== underground) continue;
      e.getPos(this._poolVec);
      eligible.push({ e, dz: Math.abs(this._poolVec.z - playerZ) });
    }
    eligible.sort((a, b) => a.dz - b.dz);
    for (let i = 0; i < this.lightPool.length; i++) {
      const slot = this.lightPool[i];
      const pick = eligible[i];
      if (!pick) {
        slot.intensity = 0; // parked: still counted, keeps shaders stable
        continue;
      }
      pick.e.getPos(slot.position);
      slot.color.setHex(pick.e.color);
      slot.distance = pick.e.distance;
      slot.intensity = pick.e.intensity;
    }
  }
}
