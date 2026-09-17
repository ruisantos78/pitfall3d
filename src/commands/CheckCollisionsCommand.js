import { Command } from './Command.js';
import { DEBUG_GOD_MODE } from '../debug.js';
import { audio } from '../audio.js';

export class CheckCollisionsCommand extends Command {
  constructor(player, world) {
    super();
    this.player = player;
    this.world = world;
  }

  execute() {
    const p = this.player;
    const world = this.world;

    // 1. Logs (Stationary & Rolling)
    for (const hazard of world.activeHazards) {
      if (hazard.type === 'log' || hazard.type === 'rolling_log') {
        if (DEBUG_GOD_MODE) continue;
        if (hazard.falling || hazard.fallingIntoPit || hazard.waiting) continue;
        const distZ = Math.abs(p.z - hazard.z);
        if (Math.abs(p.y - 0.45) > 3) continue;
        if (p.isOverPit(world)) continue;
        if (distZ < 1.0 && p.y < 0.75) {
          if (p.tripCooldown <= 0) {
            p.tripCooldown = 1.0;
            p.isTripped = true;
            p.trippingHazard = hazard;
            p.tripStandTimer = 0;
            p.score = Math.max(0, p.score - 100);
            audio.playTrip();
            p.vz = 0;
          }
        }
      } else if (hazard.type === 'fire') {
        if (DEBUG_GOD_MODE) continue;
        const distZ = Math.abs(p.z - hazard.z);
        if (distZ < 1.1 && Math.abs(p.y) < 0.9) {
          audio.playTrip();
          p.die('death.fire');
          return;
        }
      } else if (hazard.type === 'snake') {
        if (DEBUG_GOD_MODE) continue;
        const distZ = Math.abs(p.z - hazard.z);
        if (distZ < 1.1 && Math.abs(p.y) < 0.9) {
          audio.playTrip();
          p.die('death.snake');
          return;
        }
      } else if (hazard.type === 'scorpion') {
        if (DEBUG_GOD_MODE) continue;
        const distZ = Math.abs(p.z - hazard.z);
        const hy = hazard.baseY ?? 0.08;
        if (distZ < 1.1 && Math.abs(p.y - hy) < 0.9) {
          audio.playTrip();
          p.die('death.scorpion');
          return;
        }
      }
    }

    // 2. Treasures
    for (const treasure of world.activeTreasures) {
      if (!treasure.collected) {
        const distZ = Math.abs(p.z - treasure.z);
        if (distZ < 1.4 && Math.abs(p.y - treasure.mesh.position.y) < 2) {
          treasure.collected = true;
          treasure.mesh.removeFromParent();
          world.claimTreasureSlot(treasure);
          p.score += treasure.points;
          p.treasuresCollected++;
          audio.playTreasure();
        }
      }
    }
  }
}
