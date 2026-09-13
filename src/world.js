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
  createOpeningQuicksandModel
} from './models.js';
import { createVoxelGeometry, createVoxelMaterial } from './voxel.js';
import { audio } from './audio.js';

export const SCREEN_LENGTH = 60; // Length of each screen along Z axis
export const PATH_WIDTH = 8;     // Width of corridor
export const TUNNEL_FLOOR_Y = -8; // Underground tunnel floor (ladder screens)
export const CEIL_TOP_Y = -3; // Cave ceiling top (landing on it is hit kill)

export class World {
  constructor(scene) {
    this.scene = scene;
    this.screens = new Map(); // screenIndex => ScreenObject
    this.activeVines = [];
    this.activeCrocodiles = [];
    this.activeRollingLogs = [];
    this.activeTreasures = [];
    this.activeHazards = [];
    this.animatedCampfires = [];
    this.animatedTorches = [];
    this.torchTime = 0;
    this.activeOpeningPits = [];

    // Base materials
    this.groundMaterial = createVoxelMaterial();
    this.waterMaterial = new THREE.MeshLambertMaterial({
      color: 0x1a6aaa,
      transparent: true,
      opacity: 0.85,
    });
    this.pitMaterial = new THREE.MeshBasicMaterial({ color: 0x181818 });

    // Shared tree template for cloning
    this.treeTemplate = createTreeModel(0.5);

    // Bottomless pit: black material seen from inside (walls of the abyss)
    this.abyssMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });

    // Underground: dirt for tunnel walls and wood for the ladder
    this.tunnelWallMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
    this.tunnelFloorMaterial = new THREE.MeshLambertMaterial({ color: 0x5a4128 });
    this.caveCeilMaterial = new THREE.MeshLambertMaterial({ color: 0x2e2418 });
    this.ladderMaterial = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  }

  // Surface shaft: short black tube with a bottom (2.5m) to look deep
  // - purposely shallow to NOT intersect the continuous tunnel below.
  addBottomlessShaft(group, centerZ, length, width = PATH_WIDTH) {
    const depth = 2.5;
    const shaftGeo = new THREE.BoxGeometry(width, depth, length);
    const shaft = new THREE.Mesh(shaftGeo, this.abyssMaterial);
    // Open top just below the ground (y=-0.5), bottom at -3.0
    shaft.position.set(0, -0.5 - depth / 2, centerZ);
    group.add(shaft);
    // Absolute black bottom so the sky/fog is not visible below
    const bottomGeo = new THREE.PlaneGeometry(width, length);
    const bottomMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const bottom = new THREE.Mesh(bottomGeo, bottomMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(0, -0.5 - depth, centerZ);
    group.add(bottom);
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
    for (let i = currentScreenIndex - 1; i <= currentScreenIndex + keepRange; i++) {
      if (i >= 0 && !this.screens.has(i)) {
        this.getOrCreateScreen(i);
      }
    }

    // Cleanup distant screens to keep memory tight
    for (const [idx, screen] of this.screens.entries()) {
      if (idx < currentScreenIndex - 2 || idx > currentScreenIndex + keepRange + 1) {
        this.scene.remove(screen.group);
        // remove items from active lists
        this.removeScreenEntities(screen);
        this.screens.delete(idx);
      }
    }
  }

  removeScreenEntities(screen) {
    this.activeVines = this.activeVines.filter(v => v.screenIndex !== screen.index);
    this.activeCrocodiles = this.activeCrocodiles.filter(c => c.screenIndex !== screen.index);
    this.activeRollingLogs = this.activeRollingLogs.filter(l => l.screenIndex !== screen.index);
    this.activeTreasures = this.activeTreasures.filter(t => t.screenIndex !== screen.index);
    this.activeHazards = this.activeHazards.filter(h => h.screenIndex !== screen.index);
    this.animatedCampfires = this.animatedCampfires.filter(c => c.screenIndex !== screen.index);
    this.animatedTorches = this.animatedTorches.filter(t => t.screenIndex !== screen.index);
    this.activeOpeningPits = this.activeOpeningPits.filter(p => p.screenIndex !== screen.index);
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
      this.addScorpion(group, index, midZ, TUNNEL_FLOOR_Y + 0.08, 12);
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
  getAuthenticSpec(index) {
    const n = ((index % 255) + 255) % 255;
    let r = 0xc4;
    for (let i = 0; i < n; i++) r = World.lfsrRight(r);
    const objectType = r & 0x07;
    const sceneType = (r >> 3) & 0x07;
    const treePat = (r >> 6) & 0x03;
    return { rand: r, objectType, sceneType, treePat };
  }

  // Deterministic Pitfall 2600 screen sequence (hybrid authentic+)
  getScreenType(index) {
    const spec = this.getAuthenticSpec(index);
    // Scene 4 (crocodiles): half with a vine, half croc-only (decided by LFSR treePat —
    // deterministic, the map never changes between sessions).
    if (spec.sceneType === 4) {
      return spec.treePat % 2 === 0 ? 'CROCODILE_VINE' : 'CROCODILE_POND';
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
    const borderGeo = new THREE.BoxGeometry(16, 1, length);
    const borderMat = new THREE.MeshLambertMaterial({ color: 0x224e18, flatShading: true });

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
    const spec = this.getAuthenticSpec(index) || { objectType: 4, sceneType: 0, treePat: 0 };
    const obj = spec.objectType;
    const scene = spec.sceneType;
    const treasureKinds = ['money', 'silver', 'gold', 'diamond'];

    // Overlay ground object — surface map only (pitfall.asm bits 0..2).
    // Underground (tunnel + scorpion) for scenes 0-1 is built separately.
    // obj 7 = surface snake: no model yet, so nothing spawns
    // (the scorpion lives in the tunnel).
    // Rolling logs: fixed, deterministic drop points on solid ground
    // (never inside lakes/pits), no randomness.
    const addOverlayObject = (z) => {
      if (scene === 5) return; // treasure handled with quicksand below
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
      }
      // obj === 7 (snake): omitted — surface only, no scorpion on the surface.
    };

    switch (type) {
      case 'HOLE_SINGLE':
        // Original: hole with ladder to the underground. Walk in to descend,
        // jump over to stay on the surface.
        this.addLadderShaft(group, index, midZ, 2);
        this.addCaveCeiling(group, startZ, endZ, [{ centerZ: midZ, half: 2 }]);
        addOverlayObject(midZ + 14);
        break;

      case 'HOLE_TRIPLE':
        // Original: three holes, but ladder ONLY in the middle one — the side holes drop straight in.
        this.addLadderShaft(group, index, midZ + 12, 1.5, false);
        this.addLadderShaft(group, index, midZ, 1.5, true);
        this.addLadderShaft(group, index, midZ - 12, 1.5, false);
        this.addCaveCeiling(group, startZ, endZ, [12, 0, -12].map((off) => ({ centerZ: midZ + off, half: 1.5 })));
        addOverlayObject(midZ + 20);
        break;

      case 'DISAPPEARING_QUICKSAND': {
        // Original scene 5: black quicksand + treasure (obj&3 selects which).
        const kind = treasureKinds[obj & 3];
        this.addOpeningQuicksandPit(group, index, midZ);
        this.addTreasure(group, index, midZ - 12, kind);
        break;
      }

      case 'BLUE_QUICKSAND':
        // Original scene 7: blue quicksand, no vine (surfable like black).
        this.addOpeningQuicksandPit(group, index, midZ);
        addOverlayObject(midZ + 14);
        this.addTreasure(group, index, midZ - 14, 'silver');
        break;

      case 'QUICKSAND_VINE':
        // Original scene 3: blue swamp + vine.
        this.addWaterPond(group, index, midZ, 20);
        this.addVine(group, index, midZ);
        addOverlayObject(midZ + 14);
        this.addTreasure(group, index, midZ - 14, 'gold');
        break;

      case 'TAR_PIT_VINE':
        // Original scene 2: black pit + vine.
        this.addTarPit(group, index, midZ, 20);
        this.addVine(group, index, midZ);
        addOverlayObject(midZ + 14);
        this.addTreasure(group, index, midZ - 14, 'diamond');
        break;

      case 'CROCODILE_VINE': {
        // Original scene 4: croc pond (3 crocs) + vine.
        // In the original ASM, logs (x=124) and crocs (x=60) run in separate lanes —
        // never overlapping. In the 1D corridor, static obstacles go to the solid ground
        // BEFORE the lake (edge +10): nothing stationary inside midZ±10 to avoid blocking
        // croc-to-croc jumps. The lake is 20m like the vine-only lake (vine is identical in the middle).
        this.addWaterPond(group, index, midZ, 20);
        this.addCrocodileTrio(group, index, midZ);
        this.addVine(group, index, midZ);
        if (scene !== 5) {
          // No rolling logs in the croc lake (stationary only): a rolling log
          // crossing the lake would break the croc-hopping mechanic.
          if (obj === 4) {
            this.addStationaryLog(group, index, midZ + 19);
          } else if (obj === 5) {
            this.addStationaryLog(group, index, midZ + 19);
            this.addStationaryLog(group, index, midZ + 24);
          } else if (obj === 6) {
            this.addCampfire(group, index, midZ + 19);
          }
        }
        this.addTreasure(group, index, midZ - 20, 'diamond');
        break;
      }

      case 'CROCODILE_POND': {
        // Croc lake without a vine (croc-only): cross by hopping from croc to croc.
        this.addWaterPond(group, index, midZ, 20);
        this.addCrocodileTrio(group, index, midZ);
        if (scene !== 5) {
          // No rolling logs here either (stationary only).
          if (obj === 4) {
            this.addStationaryLog(group, index, midZ + 19);
          } else if (obj === 5) {
            this.addStationaryLog(group, index, midZ + 19);
            this.addStationaryLog(group, index, midZ + 24);
          } else if (obj === 6) {
            this.addCampfire(group, index, midZ + 19);
          }
        }
        this.addTreasure(group, index, midZ - 20, 'diamond');
        break;
      }

      case 'QUICKSAND_VINE_OPEN':
        // Original scene 6: black quicksand + vine.
        this.addOpeningQuicksandPit(group, index, midZ);
        this.addVine(group, index, midZ);
        addOverlayObject(midZ + 14);
        this.addTreasure(group, index, midZ - 14, 'gold');
        break;

      default:
        this.addStationaryLog(group, index, midZ);
        break;
    }
  }

  // --- Hazard Builders ---

  addStationaryLog(group, screenIndex, z) {
    // Stationary log only on the yellow track (28 voxels ≈ 5m, no green coverage).
    const log = createLogModel(0.18, 28);
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
    // Wide log only on the yellow track (28 voxels ≈ 5m, no green coverage).
    const log = createLogModel(0.18, 28);
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

  // Boundary flags at the start and end of each screen: visual border markers
  // and checkpoints (respawn returns here). Alternates sides (right at start,
  // left at end) so they don't overlap at borders, with the cloth always facing
  // inward (towards the track, away from the trees).
  addBoundaryFlags(group, startZ, endZ) {
    const poleGeo = new THREE.BoxGeometry(0.14, 2.6, 0.14);
    const flagGeo = new THREE.BoxGeometry(0.95, 0.55, 0.08);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xf0e0c0 });
    const flagMat = new THREE.MeshLambertMaterial({ color: 0xff3020 });
    for (const [x, z] of [[5.0, startZ - 1], [-5.0, endZ + 1]]) {
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
    const pitGeo = new THREE.BoxGeometry(pitWidth, 0.2, length);
    const pitMesh = new THREE.Mesh(pitGeo, this.pitMaterial);
    pitMesh.position.set(0, -0.6, centerZ);
    group.add(pitMesh);
    this.addBottomlessShaft(group, centerZ, length, pitWidth);

    // Spikes at the bottom: make it clear this area is not to be entered.
    if (!this.spikeMaterial) {
      this.spikeMaterial = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
    }
    const spikeGeo = new THREE.ConeGeometry(0.32, 2.0, 6);
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

  // Underground pit (HOLE_* screens): dirt walls from level 0 down to the tunnel.
  // As in the original, NOT every pit has a ladder: only the middle one has wooden
  // rungs (up and down); the side ones drop straight in.
  addLadderShaft(group, screenIndex, centerZ, half, hasLadder = true) {
    // No surrounding walls — just the wooden ladder hanging in the gap.
    // Siding in the ceiling colour closes the gap between the track floor (bottom -1)
    // and the cave ceiling (top -3) around the hole.
    const holeLen = half * 2 + 1;
    const bandSideGeo = new THREE.BoxGeometry(0.3, 2, holeLen + 0.6);
    for (const x of [-2.65, 2.65]) {
      const band = new THREE.Mesh(bandSideGeo, this.caveCeilMaterial);
      band.position.set(x, -2.0, centerZ);
      group.add(band);
    }
    const bandEndGeo = new THREE.BoxGeometry(5.6, 2, 0.3);
    for (const z of [centerZ - half - 0.65, centerZ + half + 0.65]) {
      const band = new THREE.Mesh(bandEndGeo, this.caveCeilMaterial);
      band.position.set(0, -2.0, z);
      group.add(band);
    }

    // Ladder: 2 rails + rungs descending in the gap (middle pit only).
    // Doesn't reach the bottom: the two lowest rungs have been removed.
    if (hasLadder) {
      const railGeo = new THREE.BoxGeometry(0.12, 5.5, 0.12);
      const rungGeo = new THREE.BoxGeometry(1.0, 0.09, 0.09);
      const ladderZ = centerZ - half + 0.45;
      for (const x of [-0.5, 0.5]) {
        const rail = new THREE.Mesh(railGeo, this.ladderMaterial);
        rail.position.set(x, -3.0, ladderZ);
        group.add(rail);
      }
      for (let y = -0.5; y >= TUNNEL_FLOOR_Y + 2.2; y -= 0.8) {
        const rung = new THREE.Mesh(rungGeo, this.ladderMaterial);
        rung.position.set(0, y, ladderZ);
        group.add(rung);
      }
    }

    this.activeHazards.push({
      type: 'ladder_shaft',
      screenIndex,
      minZ: centerZ - half,
      maxZ: centerZ + half,
      centerZ,
      half,
      hasLadder,
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
          new THREE.BoxGeometry(PATH_WIDTH + 1, 0.5, hi - cur),
          this.caveCeilMaterial
        );
        seg.position.set(0, -3.25, (cur + hi) / 2);
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
  addTunnel(group, screenIndex, startZ, endZ, floorY = -8) {
    const midZ = (startZ + endZ) / 2;
    const length = SCREEN_LENGTH;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(PATH_WIDTH + 1, 0.5, length),
      this.tunnelFloorMaterial
    );
    floor.position.set(0, TUNNEL_FLOOR_Y - 0.25, midZ);
    group.add(floor);

    const sideGeo = new THREE.BoxGeometry(0.5, 8, length);
    for (const x of [-4.75, 4.75]) {
      const wall = new THREE.Mesh(sideGeo, this.tunnelWallMaterial);
      wall.position.set(x, TUNNEL_FLOOR_Y + 4, midZ);
      group.add(wall);
    }

    const lamp = new THREE.PointLight(0xffb060, 25, 50);
    lamp.position.set(0, TUNNEL_FLOOR_Y + 3.5, midZ);
    group.add(lamp);

    // Tunnel torches marking underground checkpoints (alternate sides like the
    // surface flags; brazier only, no dedicated light of their own).
    const bracketGeo = new THREE.BoxGeometry(0.16, 0.16, 0.5);
    const stickGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12);
    const flameGeo = new THREE.ConeGeometry(0.2, 0.55, 6);
    const emberGeo = new THREE.ConeGeometry(0.1, 0.3, 6);
    const bracketMat = new THREE.MeshLambertMaterial({ color: 0x2a2018 });
    const stickMat = new THREE.MeshLambertMaterial({ color: 0x6a4a28 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7018 });
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    for (const [x, z] of [[4.3, startZ - 2], [-4.3, endZ + 2]]) {
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
      const glow = new THREE.PointLight(0xff8030, 6, 11);
      glow.position.y = 1.1;
      torch.add(glow);
      torch.position.set(x, TUNNEL_FLOOR_Y + 2.5, z);
      group.add(torch);
      this.animatedTorches.push({
        screenIndex,
        light: glow,
        seed: Math.random() * 10,
      });
    }
  }

  addTarPit(group, screenIndex, centerZ, length = 20) {
    const pitGeo = new THREE.BoxGeometry(PATH_WIDTH, 0.2, length);
    const pitMesh = new THREE.Mesh(pitGeo, this.pitMaterial);
    pitMesh.position.set(0, -0.6, centerZ);
    group.add(pitMesh);
    // Endless black abyss below the surface
    this.addBottomlessShaft(group, centerZ, length);

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
    // Endless black abyss (20m wide, like the vine lake) below the moving lid
    this.addBottomlessShaft(group, z, 20.4);

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
      phase: 'closed', // closed | opening | open | closing (closes from the player's edge)
      wasOpen: false,
      rumblePlayed: false,
      // Cycle (seconds): closed-solid pause (0.5s) → opening wave entry→exit (1.8s)
      // → fully open (5.0s) → closing wave from the player's edge, entry→exit
      // (1.8s, ~11.1 m/s vs Harry's 9.0: wave is visibly faster than the player,
      // guaranteeing safety).
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
    const waterGeo = new THREE.BoxGeometry(PATH_WIDTH, 0.3, length);
    const waterMesh = new THREE.Mesh(waterGeo, this.waterMaterial);
    waterMesh.position.set(0, -0.6, centerZ);
    group.add(waterMesh);
    // Endless black abyss below the lake
    this.addBottomlessShaft(group, centerZ, length);

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

  addCampfire(group, screenIndex, z) {
    const campfire = createCampfireModel(0.24);
    campfire.group.position.set(0, 0, z);
    group.add(campfire.group);

    this.animatedCampfires.push({
      screenIndex,
      campfire: campfire,
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

    this.activeHazards.push({
      type: 'scorpion',
      screenIndex,
      mesh: scorpion,
      baseZ: z,
      baseY: groundY,
      patrolRange,
      time: 0,
      radius: 1.2,
    });
  }

  addTreasure(group, screenIndex, z, type = 'gold') {
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
      collected: false,
    });
  }

  // Update dynamic elements (animations, rolling logs, vine pendulum)
  update(delta) {
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
          // Just snapped shut! Play safety sound
          audio.playCrocSnap();
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
        // The log reaches the spike pit and is impaled: CEASES TO EXIST immediately
        // (does not continue falling) and waits its next turn in the queue
        // (nextDrop was already scheduled +1 cycle at drop time).
        l.vy -= 30 * delta;
        l.y += l.vy * delta;
        l.z = l.exitPitZ;
        l.mesh.position.y = l.y;
        l.mesh.position.z = l.z;
        l.mesh.rotation.x += delta * 10;

        if (l.y <= -0.6) {
          // Impaled: disappears and waits for next turn (nextDrop already scheduled
          // at drop time — the exact cycle is maintained forever).
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

    // 4b. Tunnel torch flicker (small, trembling warm light)
    this.torchTime += delta;
    this.animatedTorches.forEach(t => {
      t.light.intensity = 6 + Math.sin(this.torchTime * 13 + t.seed) * 1.3 +
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

      // D. Dynamic Warm Fire Light Flicker
      if (c.light) {
        c.light.intensity = 2.0 + Math.sin(t * 18) * 0.4 + (Math.random() - 0.5) * 0.3;
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

      if (s.mesh.userData && s.mesh.userData.light) {
        s.mesh.userData.light.intensity = 1.4 + Math.sin(s.time * 8) * 0.5;
      }
    });

    // 6. Update Treasures (rotate in place)
    this.activeTreasures.forEach(t => {
      if (!t.collected) {
        t.mesh.rotation.y += delta * 2.2;
      }
    });

    // 7. Update Disappearing Quicksand Pits (per-section cycle)
    // Phases: closed-solid pause (0.5s) → opening wave from entry to exit
    // (2.2s) → fully open (5.0s) → closing wave from the player's edge,
    // entry→exit (2.2s, surf alongside the wave to cross).
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

      // Global cycle transition sounds
      if (phase === 'opening') {
        if (!p.rumblePlayed) {
          audio.playQuicksandRumble();
          p.rumblePlayed = true;
        }
      } else if (phase === 'closed') {
        if (p.wasOpen) {
          audio.playGroundThud();
          p.wasOpen = false;
          p.rumblePlayed = false;
        }
      }

      let openCount = 0;
      p.segments.forEach((seg, i) => {
        // Moment when this section should be open (binary target 0/1).
        // Opening AND closing as a wave from the entry (i=0, +Z, player's edge) to
        // the exit (i=n-1, -Z): the closing wave sweeps at ~9.1 m/s, the same
        // direction and pace as Harry (9.0), so the player can run alongside the wave.
        const openStart = p.closedDur + (i * p.openingDur) / n;
        const closeStart = p.closedDur + p.openingDur + p.openDur + (i * p.closingDur) / n;
        const target = cycleTime >= openStart && cycleTime < closeStart ? 1 : 0;

        // Smooth section open/close
        seg.openAmount = THREE.MathUtils.lerp(seg.openAmount ?? 0, target, delta * 10);
        if (Math.abs(seg.openAmount - target) < 0.01) seg.openAmount = target;
        seg.isOpen = seg.openAmount > 0.5;
        if (seg.isOpen) openCount++;

        // Halves split from the centre outward (X) and sink (Y)
        const sep = seg.openAmount * 1.4;
        const sink = seg.openAmount * 1.4;
        // Earthquake jitter while the section is in motion
        const moving = Math.abs(target - seg.openAmount) > 0.02 ? 1 : 0;
        const jitter = moving * Math.sin(p.timer * 50 + i * 2.1) * 0.06;
        seg.leftMesh.position.set(seg.baseOffset - sep + jitter, -sink, seg.baseOffset);
        seg.rightMesh.position.set(seg.baseOffset + sep + jitter, -sink, seg.baseOffset);
      });

      p.openCount = openCount;
      p.isOpen = openCount > 0;
      if (openCount > 0) p.wasOpen = true;
    });
  }
}
