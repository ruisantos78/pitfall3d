import * as THREE from 'three';
import { Command } from './Command.js';
import { SCREEN_LENGTH, TUNNEL_FLOOR_Y } from '../WorldConstants.js';
import { EYE_HEIGHT } from '../player.js';

export class RespawnCommand extends Command {
  constructor(player, world = null) {
    super();
    this.player = player;
    this.world = world;
  }

  isRespawnGroundSafe(world, z) {
    for (const hazard of world.activeHazards) {
      if (['quicksand', 'tarpit', 'water', 'ladder_shaft'].includes(hazard.type)) {
        if (z <= hazard.maxZ && z >= hazard.minZ) return false;
      } else if (hazard.type === 'log_exit_pit') {
        if (z >= hazard.minZ - 1 && z <= hazard.maxZ + 1) return false;
      }
    }
    if (world.activeOpeningPits) {
      for (const pitData of world.activeOpeningPits) {
        if (Math.abs(z - pitData.z) < pitData.radius + 1) return false;
      }
    }
    return true;
  }

  isRespawnClearOfHazards(world, z) {
    for (const hazard of world.activeHazards) {
      const hy = hazard.baseY ?? 0;
      if (Math.abs(hy) > 3) continue;
      if (hazard.type === 'rolling_log') {
        if (Math.abs(z - hazard.z) < 4.0) return false;
      } else if (hazard.type === 'log' || hazard.type === 'fire' || hazard.type === 'scorpion' || hazard.type === 'snake') {
        if (Math.abs(z - hazard.z) < 2.8) return false;
      }
    }
    return true;
  }

  isTunnelRespawnClear(world, z) {
    for (const hazard of world.activeHazards) {
      if (hazard.type === 'scorpion') {
        const hz = hazard.mesh ? hazard.mesh.position.z : hazard.baseZ;
        if (Math.abs(z - hz) < 4) return false;
      }
    }
    if (world.activeTunnelWalls) {
      for (const wl of world.activeTunnelWalls) {
        if (Math.abs(z - wl.z) < 2.5) return false;
      }
    }
    return true;
  }

  findSafeTunnelRespawnZ(world, baseZ) {
    const candidates = [baseZ, baseZ - 4, baseZ + 4, baseZ - 8, baseZ + 8, baseZ - 12, baseZ + 12];
    for (const c of candidates) {
      if (this.isTunnelRespawnClear(world, c)) return c;
    }
    return baseZ;
  }

  findSafeRespawnZ(world, baseZ, screenIndex) {
    const screenStartZ = -screenIndex * SCREEN_LENGTH;
    const screenEndZ = -(screenIndex + 1) * SCREEN_LENGTH;
    const minZ = screenEndZ + 2;
    const maxZ = screenStartZ + 10;
    const candidates = [baseZ, baseZ - 4, baseZ + 4, baseZ - 8, baseZ + 8,
      baseZ - 12, baseZ + 12, baseZ - 16, baseZ + 16, baseZ - 20, baseZ + 20];
    for (const c of candidates) {
      const z = THREE.MathUtils.clamp(c, minZ, maxZ);
      if (this.isRespawnGroundSafe(world, z) && this.isRespawnClearOfHazards(world, z)) {
        return z;
      }
    }
    return THREE.MathUtils.clamp(baseZ, minZ, maxZ);
  }

  execute() {
    const p = this.player;
    const world = this.world;
    p.isDying = false;

    const fade = document.getElementById('death-fade');
    if (fade) fade.classList.remove('on');
    p.vy = 0;
    p.vz = 0;
    p.isGrounded = false;
    p.isTripped = false;
    p.tripStandTimer = 0;
    p.tripCooldown = 0;

    const tunnelRespawn = !!(world && p.deathReasonKey === 'death.scorpion' && p.diedInTunnel);
    p.diedInTunnel = false;
    p.inTunnel = tunnelRespawn;
    p.climbing = null;
    p.climbGrace = 0;
    p.crocBiteGraceTimer = 0;
    p.warp = null;
    p.camera.fov = p.baseFov;
    p.camera.updateProjectionMatrix();

    if (!tunnelRespawn && world) world.deactivateTunnelCorridor();

    if (world) {
      if (tunnelRespawn) {
        p.z = this.findSafeTunnelRespawnZ(world, p.z);
      } else {
        let baseZ;
        if (p.checkpointZ !== null) {
          baseZ = p.checkpointZ;
        } else {
          const screenIndex = Math.floor(-p.z / SCREEN_LENGTH);
          baseZ = -screenIndex * SCREEN_LENGTH + 6;
        }
        const screenIndex = Math.floor(-baseZ / SCREEN_LENGTH);
        p.z = this.findSafeRespawnZ(world, baseZ, screenIndex);
      }
    } else {
      p.z += 8;
    }

    if (tunnelRespawn) {
      p.y = TUNNEL_FLOOR_Y;
      p.vy = 0;
      p.isGrounded = true;
      p.respawnDrop = false;
    } else {
      p.y = p.RESPAWN_DROP_HEIGHT;
      p.isGrounded = false;
      p.respawnDrop = true;
    }

    if (p.targetRotY === undefined) p.targetRotY = 0;
    p.camera.rotation.y = p.targetRotY;
    p.camera.position.set(0, p.y + EYE_HEIGHT, p.z);
  }
}
