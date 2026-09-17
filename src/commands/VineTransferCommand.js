import * as THREE from 'three';
import { Command } from './Command.js';
import { EYE_HEIGHT } from '../player.js';
import { audio } from '../audio.js';

export class VineTransferCommand extends Command {
  constructor(player, world) {
    super();
    this.player = player;
    this.world = world;
  }

  execute() {
    const p = this.player;
    const world = this.world;
    if (!world || !world.activeVines) return false;
    const tipPos = new THREE.Vector3();
    let best = null;
    let bestDist = Infinity;
    for (const vineData of world.activeVines) {
      if (vineData === p.attachedVine) continue;
      if (vineData === p.ignoredVine) continue;
      if (!vineData.vine.tip) continue;
      vineData.vine.tip.getWorldPosition(tipPos);
      const distZ = Math.abs(p.z - tipPos.z);
      const distY = Math.abs((p.y + EYE_HEIGHT) - tipPos.y);
      if (distZ < 3.5 && distY < 3.0) {
        const d = distZ + distY;
        if (d < bestDist) {
          bestDist = d;
          best = vineData;
        }
      }
    }
    if (!best) return false;
    p.ignoredVine = p.attachedVine;
    p.attachedVine = best;
    p.vy = 0;
    p.vz = 0;
    audio.playTarzanYell();
    return true;
  }
}
