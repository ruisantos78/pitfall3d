// World Coordinator for Atari Pitfall 3D
// Orchestrates level generation, screen caching, tunnels, hazards, and dynamic lighting.

import * as THREE from 'three';
import {
  createTreeModel,
  createLogModel,
  isSharedModelGeometry,
  isSharedModelMaterial,
} from './models/index.js';
import { createVoxelMaterial } from './voxel.js';
import { audio } from './audio.js';
import {
  SCREEN_LENGTH,
  PATH_WIDTH,
  TUNNEL_FLOOR_Y,
  CEIL_TOP_Y,
  PIT_FLOOR_Y,
  screenRoom,
} from './WorldConstants.js';
import { LevelGenerator } from './LevelGenerator.js';
import { LightPool } from './LightPool.js';
import { DebrisManager } from './DebrisManager.js';
import { TunnelManager } from './TunnelManager.js';
import { ScreenBuilder } from './ScreenBuilder.js';
import { HazardBuilder } from './HazardBuilder.js';

export {
  SCREEN_LENGTH,
  PATH_WIDTH,
  TUNNEL_FLOOR_Y,
  CEIL_TOP_Y,
  PIT_FLOOR_Y,
  screenRoom,
};

export class World {
  static ROLLING_CYCLE = 7.4;
  static LFSR_TABLE = LevelGenerator.LFSR_TABLE;
  static TUNNEL_ROUTE_TABLE = LevelGenerator.TUNNEL_ROUTE_TABLE;

  static lfsrRight(r) {
    return LevelGenerator.lfsrRight(r);
  }

  static treasureKey(index) {
    const phase = ((index % 255) + 255) % 255;
    return `${phase}:${LevelGenerator.LFSR_TABLE[phase].objectType}`;
  }

  constructor(scene) {
    this.scene = scene;
    this.screens = new Map();

    // Active screen entities
    this.activeVines = [];
    this.activeCrocodiles = [];
    this.activeRollingLogs = [];
    this.nearestLogThreat = null;
    this.activeTreasures = [];
    this.activeHazards = [];
    this.animatedCampfires = [];
    this.animatedTorches = [];
    this.animatedSnakes = [];
    this.torchTime = 0;
    this.activeOpeningPits = [];
    this.activeTunnelWalls = [];
    this.collectedTreasureSlots = new Set();

    // Component managers (SOLID / Single Responsibility)
    this.lightPoolManager = new LightPool(this.scene, 8);
    this.debrisManager = new DebrisManager();
    this.tunnelManager = new TunnelManager(this);
    this.hazardBuilder = new HazardBuilder(this);
    this.screenBuilder = new ScreenBuilder(this);

    // Shared geometry and material caches
    this.worldGeoCache = new Map();
    this.sharedGeometries = new Set();
    this.sharedMaterials = new Set();

    // Base materials
    this.groundMaterial = createVoxelMaterial();
    this.waterMaterial = new THREE.MeshLambertMaterial({
      color: 0x1a6aaa,
      transparent: true,
      opacity: 0.85,
    });
    this.pitMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.tunnelWallMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
    this.tunnelFloorMaterial = new THREE.MeshLambertMaterial({ color: 0x5a4128 });
    this.caveCeilMaterial = new THREE.MeshLambertMaterial({ color: 0x2e2418 });
    this.ladderMaterial = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    this.spikeMaterial = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });

    // Shared model templates
    this.treeTemplate = createTreeModel(0.5);
    this.logTemplate = createLogModel(0.18, 38);

    // Register shared model and base material resources to prevent disposal
    for (const tpl of [this.treeTemplate, this.logTemplate]) {
      tpl.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) this.sharedGeometries.add(o.geometry);
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          for (const m of mats) this.sharedMaterials.add(m);
        }
      });
    }

    this.debrisManager.registerShared(this.sharedGeometries, this.sharedMaterials);

    for (const m of [
      this.groundMaterial,
      this.waterMaterial,
      this.pitMaterial,
      this.tunnelWallMaterial,
      this.tunnelFloorMaterial,
      this.caveCeilMaterial,
      this.ladderMaterial,
      this.spikeMaterial,
    ]) {
      if (m) this.sharedMaterials.add(m);
    }
  }

  // Backward compatibility getters and setters
  get POOL_SIZE() { return this.lightPoolManager.poolSize; }
  get lightPool() { return this.lightPoolManager.lightPool; }
  get lightEmitters() { return this.lightPoolManager.lightEmitters; }
  set lightEmitters(v) { this.lightPoolManager.lightEmitters = v; }
  get logDebris() { return this.debrisManager.logDebris; }
  set logDebris(v) { this.debrisManager.logDebris = v; }
  get tunnelCorridor() { return this.tunnelManager.tunnelCorridor; }
  set tunnelCorridor(v) { this.tunnelManager.tunnelCorridor = v; }
  get tunnelCorridorWalls() { return this.tunnelManager.tunnelCorridorWalls; }
  set tunnelCorridorWalls(v) { this.tunnelManager.tunnelCorridorWalls = v; }
  get tunnelCorridorScorpions() { return this.tunnelManager.tunnelCorridorScorpions; }
  set tunnelCorridorScorpions(v) { this.tunnelManager.tunnelCorridorScorpions = v; }
  get openShaftScreens() { return this.tunnelManager.openShaftScreens; }
  set openShaftScreens(v) { this.tunnelManager.openShaftScreens = v; }
  get openPlugs() { return this.tunnelManager.openPlugs; }
  set openPlugs(v) { this.tunnelManager.openPlugs = v; }
  get visibleLadderScreens() { return this.tunnelManager.visibleLadderScreens; }
  set visibleLadderScreens(v) { this.tunnelManager.visibleLadderScreens = v; }
  get shortcutMap() { return LevelGenerator.SHORTCUT_MAP; }

  // Shared geometry cache
  sharedGeo(key, build) {
    let geo = this.worldGeoCache.get(key);
    if (!geo) {
      geo = build();
      this.worldGeoCache.set(key, geo);
      this.sharedGeometries.add(geo);
    }
    return geo;
  }

  // Shared material cache
  sharedMat(key, build) {
    let mat = this.worldGeoCache.get(key);
    if (!mat) {
      mat = build();
      this.worldGeoCache.set(key, mat);
      this.sharedMaterials.add(mat);
    }
    return mat;
  }

  // Screen management
  getOrCreateScreen(screenIndex) {
    if (this.screens.has(screenIndex)) {
      return this.screens.get(screenIndex);
    }
    const screenData = this.buildScreen(screenIndex);
    this.screens.set(screenIndex, screenData);
    this.scene.add(screenData.group);
    return screenData;
  }

  updateVisibleScreens(currentScreenIndex) {
    const keepRange = 2;
    const missing = [];
    for (let i = currentScreenIndex - 1; i <= currentScreenIndex + keepRange; i++) {
      if (!this.screens.has(i)) missing.push(i);
    }
    missing.sort((a, b) => Math.abs(a - currentScreenIndex) - Math.abs(b - currentScreenIndex));
    if (missing.length > 0) {
      this.getOrCreateScreen(missing[0]);
    }

    for (const [idx, screen] of this.screens.entries()) {
      if (idx < currentScreenIndex - 1 || idx > currentScreenIndex + keepRange + 1) {
        this.scene.remove(screen.group);
        this.removeScreenEntities(screen);
        this.screens.delete(idx);
      }
    }
  }

  prefetchScreen(screenIndex) {
    if (!this.screens.has(screenIndex)) {
      this.getOrCreateScreen(screenIndex);
    }
  }

  disposeScreenGroup(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry && !this.sharedGeometries.has(o.geometry) && !isSharedModelGeometry(o.geometry)) {
          o.geometry.dispose();
        }
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) {
          if (!this.sharedMaterials.has(m) && !isSharedModelMaterial(m)) {
            m.dispose();
          }
        }
      }
    });
  }

  removeScreenEntities(screen) {
    this.disposeScreenGroup(screen.group);
    this.lightPoolManager.removeEmittersForScreen(screen.index);
    this.activeVines = this.activeVines.filter(v => v.screenIndex !== screen.index);
    this.activeCrocodiles = this.activeCrocodiles.filter(c => c.screenIndex !== screen.index);
    this.activeRollingLogs = this.activeRollingLogs.filter(l => l.screenIndex !== screen.index);
    this.activeTreasures = this.activeTreasures.filter(t => t.screenIndex !== screen.index);
    this.activeHazards = this.activeHazards.filter(h => h.screenIndex !== screen.index);
    this.animatedCampfires = this.animatedCampfires.filter(c => c.screenIndex !== screen.index);
    this.animatedTorches = this.animatedTorches.filter(t => t.screenIndex !== screen.index);
    this.animatedSnakes = this.animatedSnakes.filter(s => s.screenIndex !== screen.index);
    this.activeOpeningPits = this.activeOpeningPits.filter(p => p.screenIndex !== screen.index);
    this.activeTunnelWalls = this.activeTunnelWalls.filter(wl => wl.screenIndex !== screen.index);
    this.debrisManager.removeForScreen(screen.index);
  }

  buildScreen(index) {
    return this.screenBuilder.build(index);
  }

  // LevelGenerator delegation
  getSurfaceMap(index) {
    return LevelGenerator.getSurfaceMap(index);
  }

  getTunnelRooms(index) {
    return LevelGenerator.getTunnelRooms(index);
  }

  getShortcutExit(index) {
    return LevelGenerator.getShortcutExit(index);
  }

  getAuthenticSpec(index) {
    return LevelGenerator.getAuthenticSpec(index);
  }

  getScreenType(index) {
    return LevelGenerator.getScreenType(index);
  }

  treasureKey(index) {
    return World.treasureKey(index);
  }

  claimTreasureSlot(treasure) {
    if (treasure?.slotKey) {
      this.collectedTreasureSlots.add(treasure.slotKey);
    }
  }

  resetRun() {
    this.collectedTreasureSlots.clear();
  }

  // TunnelManager delegation
  getWallZ(screenIndex, wall) {
    return this.tunnelManager.getWallZ(screenIndex, wall);
  }

  activateTunnelCorridor(entryScreenIndex) {
    this.tunnelManager.activateTunnelCorridor(entryScreenIndex);
  }

  deactivateTunnelCorridor() {
    this.tunnelManager.deactivateTunnelCorridor();
  }

  // DebrisManager delegation
  spawnLogShatter(group, screenIndex, z) {
    this.debrisManager.spawnLogShatter(group, screenIndex, z);
  }

  updateLogDebris(delta) {
    this.debrisManager.update(delta);
  }

  // LightPool delegation
  updateLightPool(playerZ, underground) {
    this.lightPoolManager.update(playerZ, underground);
  }

  // HazardBuilder delegation
  addStationaryLog(group, screenIndex, z) {
    this.hazardBuilder.addStationaryLog(group, screenIndex, z);
  }

  addRollingLog(group, screenIndex, startZ, endZ, idx, count) {
    this.hazardBuilder.addRollingLog(group, screenIndex, startZ, endZ, idx, count);
  }

  rollingDropZ(endZ) {
    return this.hazardBuilder.rollingDropZ(endZ);
  }

  addLogExitPit(group, screenIndex, startZ, length = 1.5) {
    this.hazardBuilder.addLogExitPit(group, screenIndex, startZ, length);
  }

  addLadderShaft(group, screenIndex, centerZ, half, hasLadder = true) {
    this.hazardBuilder.addLadderShaft(group, screenIndex, centerZ, half, hasLadder);
  }

  addTarPit(group, screenIndex, centerZ, length = 20) {
    this.hazardBuilder.addTarPit(group, screenIndex, centerZ, length);
  }

  addOpeningQuicksandPit(group, screenIndex, z) {
    this.hazardBuilder.addOpeningQuicksandPit(group, screenIndex, z);
  }

  getQuicksandSegmentAt(pitData, z) {
    return this.hazardBuilder.getQuicksandSegmentAt(pitData, z);
  }

  isQuicksandOpenAt(pitData, z) {
    return this.hazardBuilder.isQuicksandOpenAt(pitData, z);
  }

  addWaterPond(group, screenIndex, centerZ, length = 20) {
    this.hazardBuilder.addWaterPond(group, screenIndex, centerZ, length);
  }

  addShallowPitBottom(group, centerZ, length) {
    this.hazardBuilder.addShallowPitBottom(group, centerZ, length);
  }

  addCrocodileTrio(group, screenIndex, centerZ) {
    this.hazardBuilder.addCrocodileTrio(group, screenIndex, centerZ);
  }

  addVine(group, screenIndex, centerZ, phaseTime = null) {
    this.hazardBuilder.addVine(group, screenIndex, centerZ, phaseTime);
  }

  addSnake(group, screenIndex, z) {
    this.hazardBuilder.addSnake(group, screenIndex, z);
  }

  addCampfire(group, screenIndex, z) {
    this.hazardBuilder.addCampfire(group, screenIndex, z);
  }

  addScorpion(group, screenIndex, z, groundY = 0.08, patrolRange = 3) {
    this.hazardBuilder.addScorpion(group, screenIndex, z, groundY, patrolRange);
  }

  addTreasure(group, screenIndex, z, type = 'gold', slotKey = null) {
    this.hazardBuilder.addTreasure(group, screenIndex, z, type, slotKey);
  }

  // Update loop for all dynamic entities
  update(delta, playerZ = 0, inTunnel = false, climbing = null, northFacing = true, playerVz = 0) {
    const currentScreen = Math.floor(-playerZ / SCREEN_LENGTH);
    this.tunnelManager.visibleLadderScreens = new Set([currentScreen]);
    if (this.tunnelManager.tunnelCorridor) {
      this.tunnelManager.visibleLadderScreens.add(this.tunnelManager.tunnelCorridor.exitScreenIndex);
    }

    const ladderSide = northFacing ? -1 : 1;
    for (const h of this.activeHazards) {
      if (h.type === 'ladder_shaft' && h.ladder) {
        h.ladder.position.z = h.centerZ + ladderSide * (h.half - 0.45);
        h.ladder.visible = this.tunnelManager.openShaftScreens?.has(h.screenIndex) === true;
      }
    }

    const facingDir = northFacing ? -1 : 1;
    const isAhead = (hz) => (hz - playerZ) * facingDir > -2.0;

    // 1. Update Swinging Vines
    this.activeVines.forEach(v => {
      v.time += delta * v.vine.speed;
      v.vine.angle = Math.sin(v.time) * v.vine.maxAngle;
      v.vine.pivot.rotation.x = v.vine.angle;
    });

    // 2. Update Crocodiles
    this.activeCrocodiles.forEach(c => {
      c.mouthTimer += delta;
      const cycleTime = c.mouthTimer % 4.4;
      let targetAngle = 0;

      if (cycleTime < 2.5) {
        c.isOpen = false;
        targetAngle = 0;
        if (c.croc.eyeMaterial) c.croc.eyeMaterial.color.setHex(0xf8d820);
        if (c.wasOpen) {
          if (isAhead(c.z)) audio.playCrocSnap();
          c.wasOpen = false;
        }
      } else if (cycleTime < 2.8) {
        c.isOpen = false;
        targetAngle = -0.2;
        if (c.croc.eyeMaterial) c.croc.eyeMaterial.color.setHex(0xff8800);
      } else if (cycleTime < 4.1) {
        c.isOpen = true;
        c.wasOpen = true;
        targetAngle = -1.15;
        if (c.croc.eyeMaterial) c.croc.eyeMaterial.color.setHex(0xff0000);
      } else {
        c.isOpen = true;
        targetAngle = 0;
      }

      if (c.croc.upperJaw) {
        c.croc.currentAngle = THREE.MathUtils.lerp(c.croc.currentAngle || 0, targetAngle, delta * 16);
        c.croc.upperJaw.rotation.x = c.croc.currentAngle;
      }
    });

    // 3. Update Rolling Logs
    this.nearestLogThreat = null;
    this.activeRollingLogs.forEach(l => {
      l.clock += delta;
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

      if (l.falling) {
        l.vy -= 30 * delta;
        l.y += l.vy * delta;
        const fallProgress = THREE.MathUtils.clamp(
          1 - (l.y - l.groundY) / l.maxFallHeight,
          0,
          1
        );
        const bandWidth = Math.max(0.01, fallProgress * 9.5);
        l.landingShadow.visible = true;
        l.landingShadow.position.z = l.z;
        if (l.band) l.band.scale.set(bandWidth, 1, 1);
        if (l.tex) l.tex.repeat.set(bandWidth / 1.5, 1);
        if (l.bandMat) l.bandMat.opacity = 0.4 + fallProgress * 0.5;

        if (l.y <= l.groundY) {
          l.y = l.groundY;
          l.vy = 0;
          l.falling = false;
          l.landingShadow.visible = false;
        }
        l.mesh.position.y = l.y;
        l.mesh.rotation.x += delta * 3;
      } else if (l.fallingIntoPit) {
        l.vy -= 30 * delta;
        l.y += l.vy * delta;
        l.z = l.exitPitZ;
        l.mesh.position.y = l.y;
        l.mesh.position.z = l.z;
        l.mesh.rotation.x += delta * 10;

        if (l.y <= 0.2) {
          this.debrisManager.spawnLogShatter(l.group, l.screenIndex, l.z);
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
        l.mesh.rotation.x += delta * 12;
        l.z += l.speed * delta;
        l.mesh.position.z = l.z;

        const ldz = Math.abs(l.z - playerZ);
        if (ldz < 25) {
          l.knockTimer = (l.knockTimer ?? 0) - delta;
          if (l.knockTimer <= 0) {
            audio.playWoodKnock(0.06 + 0.3 * (1 - ldz / 25));
            l.knockTimer = 0.12 + (ldz / 25) * 0.7;
          }
        }

        const relV = playerVz - l.speed;
        let tHit = Infinity;
        if (Math.abs(relV) > 0.5) tHit = (l.z - playerZ) / relV;
        if (tHit >= 0 && tHit < 4 && (this.nearestLogThreat === null || tHit < this.nearestLogThreat.t)) {
          this.nearestLogThreat = { t: tHit, logZ: l.z };
        }

        if (l.z >= l.exitPitZ) {
          l.z = l.exitPitZ;
          l.y = l.groundY;
          l.vy = 0;
          l.fallingIntoPit = true;
          l.landingShadow.visible = false;
        }
      }
    });

    // 3b. Log shatter debris physics
    this.debrisManager.update(delta);

    // 4b. Tunnel torch flicker
    this.torchTime += delta;
    this.animatedTorches.forEach(t => {
      t.emitter.intensity = 6 + Math.sin(this.torchTime * 13 + t.seed) * 1.3 +
        Math.sin(this.torchTime * 29 + t.seed * 2) * 0.7;
    });

    // Update Snakes
    this.animatedSnakes.forEach(s => {
      s.time += delta;
      const burst = Math.sin(s.time * 5);
      if (burst > 0.4) {
        s.snake.tongue.rotation.x = Math.sin(s.time * 30) * 0.4;
      } else {
        s.snake.tongue.rotation.x = 0;
      }
      s.snake.tail.rotation.y = Math.sin(s.time * 8) * 0.4;
    });

    // 4. Update Campfires
    this.animatedCampfires.forEach(f => {
      f.time += delta;
      const t = f.time;
      const c = f.campfire;

      const scaleCoreY = 1.0 + Math.sin(t * 14) * 0.16 + Math.cos(t * 22) * 0.1;
      const scaleCoreXZ = 1.0 + Math.sin(t * 9) * 0.08;
      if (c.coreFlame) {
        c.coreFlame.scale.set(scaleCoreXZ, scaleCoreY, scaleCoreXZ);
      }

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

      if (f.emitter) {
        f.emitter.intensity = 2.0 + Math.sin(t * 18) * 0.4 + (Math.random() - 0.5) * 0.3;
      }
    });

    // 5. Update Scorpions
    this.activeHazards.filter(h => h.type === 'scorpion').forEach(s => {
      s.time += delta * (2.2 / (s.patrolRange || 3));
      s.mesh.position.z = s.baseZ + Math.sin(s.time) * (s.patrolRange || 3);
      s.z = s.mesh.position.z;
      s.mesh.rotation.y = Math.cos(s.time) >= 0 ? 0 : Math.PI;

      s.mesh.rotation.z = Math.sin(s.time * 12) * 0.04;
      s.mesh.position.y = (s.baseY ?? 0.08) + Math.abs(Math.sin(s.time * 12)) * 0.03;

      if (s.emitter) {
        s.emitter.intensity = 1.4 + Math.sin(s.time * 8) * 0.5;
      }
    });

    // 6. Update Treasures
    this.activeTreasures.forEach(t => {
      if (!t.collected) {
        t.mesh.rotation.y += delta * 2.2;
      }
    });

    // 7. Update Quicksand Pits
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
        const half = Math.max(0.5, (n - 1) / 2);
        const d = Math.abs(i - (n - 1) / 2) / half;
        const openStart = p.closedDur + d * p.openingDur;
        const closeStart = p.closedDur + p.openingDur + p.openDur + (1 - d) * p.closingDur;
        const target = cycleTime >= openStart && cycleTime < closeStart ? 1 : 0;

        seg.openAmount = THREE.MathUtils.lerp(seg.openAmount ?? 0, target, delta * 10);
        if (Math.abs(seg.openAmount - target) < 0.01) seg.openAmount = target;
        seg.isOpen = seg.openAmount > 0.5;
        if (seg.isOpen) openCount++;

        const sep = seg.openAmount * 1.4;
        const sink = seg.openAmount * 4.0;
        const moving = Math.abs(target - seg.openAmount) > 0.02 ? 1 : 0;
        const jitter = moving * Math.sin(p.timer * 50 + i * 2.1) * 0.06;
        seg.leftMesh.position.set(seg.baseOffset - sep + jitter, -sink, seg.baseOffset);
        seg.rightMesh.position.set(seg.baseOffset + sep + jitter, -sink, seg.baseOffset);

        const hide = seg.openAmount > 0.95;
        seg.leftMesh.visible = !hide;
        seg.rightMesh.visible = !hide;
      });

      p.openCount = openCount;
      p.isOpen = openCount > 0;
      if (openCount > 0) p.wasOpen = true;
    });

    // 8. Assign pooled PointLights
    this.lightPoolManager.update(playerZ, !!(inTunnel || climbing));
  }
}
