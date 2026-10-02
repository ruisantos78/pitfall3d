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
import { updateVines } from './systems/vines.js';
import { updateCrocs } from './systems/crocs.js';
import { updateRollingLogs } from './systems/logs.js';
import { updateQuicksand } from './systems/quicksand.js';
import { updateAmbient } from './systems/ambient.js';
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

  // Screen management (progressive + asynchronous).
  //
  // Screen builds (voxel geometry) are the biggest main-thread cost, so they
  // go through a priority queue: at most one screen is built per frame, the
  // nearest first, keeping every frame under a small time budget. Distant
  // prefetch happens in idle callbacks so gameplay frames never hitch.
  getOrCreateScreen(screenIndex) {
    if (this.screens.has(screenIndex)) {
      return this.screens.get(screenIndex);
    }
    const screenData = this.buildScreen(screenIndex);
    this.screens.set(screenIndex, screenData);
    this.scene.add(screenData.group);
    return screenData;
  }

  // Enqueue a screen build ordered by distance to the current screen.
  enqueueScreen(screenIndex, currentScreenIndex) {
    if (this.screens.has(screenIndex)) return;
    if (!this._screenQueue) {
      this._screenQueue = [];
      this._queuedScreens = new Set();
    }
    if (this._queuedScreens.has(screenIndex)) return;
    this._queuedScreens.add(screenIndex);
    this._screenQueue.push(screenIndex);
    this._screenQueue.sort((a, b) => Math.abs(a - currentScreenIndex) - Math.abs(b - currentScreenIndex));
  }

  // Builds queued screens while inside the frame budget (default 6ms).
  // Returns the number of screens built.
  drainScreenQueue(currentScreenIndex, budgetMs = 6) {
    if (!this._screenQueue || this._screenQueue.length === 0) return 0;
    const start = performance.now();
    let built = 0;
    while (this._screenQueue.length > 0) {
      const next = this._screenQueue.shift();
      this._queuedScreens.delete(next);
      if (this.screens.has(next)) continue;
      this.getOrCreateScreen(next);
      built++;
      // One screen per frame max: voxel builds are chunky, and the nearest
      // screen is always first in the queue.
      if (built >= 1 || performance.now() - start > budgetMs) break;
    }
    return built;
  }

  // Idle-time prefetch of screens further ahead (never blocks a frame).
  prefetchScreensIdle(indices) {
    const run = () => {
      for (const i of indices) {
        if (!this.screens.has(i)) this.getOrCreateScreen(i);
      }
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 0);
    }
  }

  updateVisibleScreens(currentScreenIndex) {
    const keepRange = 2;
    for (let i = currentScreenIndex - 1; i <= currentScreenIndex + keepRange; i++) {
      this.enqueueScreen(i, currentScreenIndex);
    }
    this.drainScreenQueue(currentScreenIndex);

    for (const [idx, screen] of this.screens.entries()) {
      if (idx < currentScreenIndex - 1 || idx > currentScreenIndex + keepRange + 1) {
        this.scene.remove(screen.group);
        this.removeScreenEntities(screen);
        this.screens.delete(idx);
      }
    }
  }

  prefetchScreen(screenIndex) {
    this.enqueueScreen(screenIndex, screenIndex - 2);
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

  // Full new-game reset: drops every per-run entity so a fresh run never
  // inherits timers, collected treasures, debris, tunnel state, or lights
  // from the previous game. Shared GPU caches and materials are kept.
  fullReset() {
    // Dismantle the underground shortcut first (removes its walls,
    // scorpions, emitters, and restores ladder plugs/visibility).
    this.tunnelManager.deactivateTunnelCorridor();
    this.tunnelManager.tunnelCorridor = null;
    this.tunnelManager.tunnelCorridorWalls = [];
    this.tunnelManager.tunnelCorridorScorpions = [];
    this.tunnelManager.openShaftScreens = null;
    this.tunnelManager.openPlugs = [];
    this.tunnelManager.visibleLadderScreens = new Set();

    // Remove every built screen from the scene and dispose its meshes.
    for (const screen of this.screens.values()) {
      this.scene.remove(screen.group);
      this.disposeScreenGroup(screen.group);
    }
    this.screens.clear();
    if (this._screenQueue) this._screenQueue.length = 0;
    if (this._queuedScreens) this._queuedScreens.clear();

    // Drop all per-run entities.
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
    this.collectedTreasureSlots.clear();

    // Clear debris meshes and light emitters (rebuilt with the screens).
    for (const d of this.debrisManager.logDebris) {
      d.mesh.removeFromParent();
    }
    this.debrisManager.logDebris = [];
    this.lightPoolManager.lightEmitters = [];
    for (const slot of this.lightPoolManager.lightPool) {
      slot.intensity = 0;
      slot.userData.emitter = null;
    }
    this.lightPoolManager._reassignTimer = 0;
    this.lightPoolManager._lastAssignZ = Infinity;
    this.lightPoolManager._lastAssignUnder = null;

    // Rebuild the starting area so the menu backdrop and the new run
    // start from pristine screens with fresh hazard clocks.
    this.getOrCreateScreen(0);
    this.prefetchScreensIdle([1, 2]);
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
  updateLightPool(playerZ, underground, delta = 0) {
    this.lightPoolManager.update(playerZ, underground, delta);
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

  // Update loop for all dynamic entities (delegates to src/systems/*; each
  // system culls distant entities so per-frame CPU scales with what is near).
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

    updateVines(this, delta, playerZ);
    updateCrocs(this, delta, playerZ, isAhead);
    updateRollingLogs(this, delta, playerZ, playerVz);
    this.debrisManager.update(delta);
    updateAmbient(this, delta, playerZ);
    updateQuicksand(this, delta, playerZ, isAhead);

    // Assign pooled PointLights (slot reassignment is throttled internally).
    this.lightPoolManager.update(playerZ, !!(inTunnel || climbing), delta);
  }
}
