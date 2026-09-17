import * as THREE from 'three';
import { Command } from './Command.js';
import { EYE_HEIGHT } from '../player.js';
import { audio } from '../audio.js';
import { getShowHelp } from '../settings.js';

export class VineGrabCommand extends Command {
  constructor(player, world) {
    super();
    this.player = player;
    this.world = world;
  }

  execute() {
    const p = this.player;
    const world = this.world;
    if (p.justReleasedVineTimer > 0) return;
    if (p.isGrounded) return;
    if (p.inTunnel || p.y < -2) return;
    const tipPos = new THREE.Vector3();

    for (const vineData of world.activeVines) {
      if (!vineData.vine.tip) continue;
      if (vineData === p.ignoredVine) continue;
      vineData.vine.tip.getWorldPosition(tipPos);

      const distZ = Math.abs(p.z - tipPos.z);
      const distY = Math.abs((p.y + EYE_HEIGHT) - tipPos.y);

      if (distZ < 2.2 && distY < 2.4) {
        p.attachedVine = vineData;
        p.ignoredVine = null;
        p.isGrounded = false;
        p.vy = 0;
        p.vz = 0;
        audio.playTarzanYell();

        if (getShowHelp()) {
          const prompt = document.getElementById('vine-prompt');
          if (prompt) prompt.classList.add('active');
        }
        break;
      }
    }
  }
}
