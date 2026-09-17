import { createBrickWallModel } from './models/index.js';
import { screenRoom, SCREEN_LENGTH, TUNNEL_FLOOR_Y } from './WorldConstants.js';

export class TunnelManager {
  constructor(world) {
    this.world = world;
    this.tunnelCorridor = null;
    this.tunnelCorridorWalls = [];
    this.tunnelCorridorScorpions = [];
    this.openPlugs = [];
    this.openShaftScreens = null;
    this.visibleLadderScreens = new Set();
  }

  getWallZ(screenIndex, wall) {
    const startZ = -screenIndex * SCREEN_LENGTH;
    return wall === 'N' ? startZ - SCREEN_LENGTH : startZ;
  }

  activateTunnelCorridor(entryScreenIndex) {
    this.deactivateTunnelCorridor();

    const phase = ((entryScreenIndex % 255) + 255) % 255;
    const shortcut = this.world.shortcutMap.get(phase);
    if (!shortcut) return;
    const { screenDelta, direction, entryWall, exitWall } = shortcut;

    const entryZ = -(entryScreenIndex * SCREEN_LENGTH) - SCREEN_LENGTH / 2;
    const exitScreenIndex = entryScreenIndex + screenDelta;
    const exitZ = -(exitScreenIndex * SCREEN_LENGTH) - SCREEN_LENGTH / 2;

    const nearWallZ = this.getWallZ(entryScreenIndex, entryWall);
    const farWallZ = this.getWallZ(exitScreenIndex, exitWall);

    const buildDynWall = (z) => {
      const wall = createBrickWallModel(0.25, 0.25);
      wall.position.set(-4.5, TUNNEL_FLOOR_Y, z - 0.5);
      this.world.scene.add(wall);
      this.world.activeTunnelWalls.push({ screenIndex: -1, z, mesh: wall });
      return wall;
    };
    const w1 = buildDynWall(nearWallZ);
    const w2 = buildDynWall(farWallZ);
    this.tunnelCorridorWalls = [w1, w2];

    const rooms = shortcut.rooms ?? [];
    const scorpionRooms = new Set(rooms.slice(1, -1));
    const totalScreens = Math.abs(screenDelta);
    const indexStep = Math.sign(screenDelta) || 1;
    const scorpionInfos = [];
    for (let k = 1; k < totalScreens; k++) {
      const s = entryScreenIndex + indexStep * k;
      if (!scorpionRooms.has(screenRoom(s))) continue;
      const scZ = -s * SCREEN_LENGTH - SCREEN_LENGTH / 2;
      const patrolRange = SCREEN_LENGTH * 0.25;
      this.world.addScorpion(this.world.scene, -1, scZ, TUNNEL_FLOOR_Y + 0.08, patrolRange);
      const sc = this.world.activeHazards[this.world.activeHazards.length - 1];
      const emitter = this.world.lightPoolManager.lightEmitters[this.world.lightPoolManager.lightEmitters.length - 1];
      scorpionInfos.push({ mesh: sc.mesh, emitter });
    }
    this.tunnelCorridorScorpions = scorpionInfos;

    this.tunnelCorridor = {
      entryScreenIndex,
      exitScreenIndex,
      screenDelta,
      entryZ,
      exitZ,
      direction,
      interestingRooms: new Set(rooms),
    };

    this.openShaftScreens = new Set([entryScreenIndex, exitScreenIndex]);
    for (const si of [entryScreenIndex, exitScreenIndex]) {
      for (const h of this.world.activeHazards) {
        if (h.type === 'ladder_shaft' && h.hasLadder && h.screenIndex === si && h.ceilingPlug) {
          h.ceilingPlug.visible = false;
          if (h.ladder) h.ladder.visible = true;
          if (!this.openPlugs.includes(h.ceilingPlug)) this.openPlugs.push(h.ceilingPlug);
        }
      }
    }
    for (const h of this.world.activeHazards) {
      if (h.type === 'ladder_shaft' && h.ladder && !this.openShaftScreens.has(h.screenIndex)) {
        h.ladder.visible = false;
      }
    }
  }

  deactivateTunnelCorridor() {
    if (!this.tunnelCorridor) return;

    for (const wall of this.tunnelCorridorWalls) {
      this.world.scene.remove(wall);
      wall.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry && !this.world.sharedGeometries.has(o.geometry))
            o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          for (const m of mats)
            if (!this.world.sharedMaterials.has(m)) m.dispose();
        }
      });
    }
    this.world.activeTunnelWalls = this.world.activeTunnelWalls.filter(w => w.screenIndex !== -1);
    this.tunnelCorridorWalls = [];

    const corridorScorpionMeshes = new Set(
      this.tunnelCorridorScorpions.map(sc => sc.mesh)
    );
    for (const sc of this.tunnelCorridorScorpions) {
      if (sc.mesh) this.world.scene.remove(sc.mesh);
    }
    this.world.activeHazards = this.world.activeHazards.filter(
      hazard => !corridorScorpionMeshes.has(hazard.mesh)
    );
    this.world.lightPoolManager.lightEmitters = this.world.lightPoolManager.lightEmitters.filter(e =>
      !this.tunnelCorridorScorpions.some(sc => sc.emitter === e)
    );
    this.tunnelCorridorScorpions = [];

    for (const plug of this.openPlugs) plug.visible = true;
    this.openPlugs = [];
    this.openShaftScreens = null;
    for (const h of this.world.activeHazards) {
      if (h.type === 'ladder_shaft' && h.ladder) h.ladder.visible = false;
    }

    this.tunnelCorridor = null;
  }
}
