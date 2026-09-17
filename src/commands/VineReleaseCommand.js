import * as THREE from 'three';
import { Command } from './Command.js';
import { audio } from '../audio.js';
import { CROC_BITE_GRACE_DURATION } from '../player.js';

export class VineReleaseCommand extends Command {
  constructor(player) {
    super();
    this.player = player;
  }

  execute() {
    const p = this.player;
    if (!p.attachedVine) return;
    const v = p.attachedVine.vine;
    const omega = v.maxAngle * v.speed * Math.cos(p.attachedVine.time);
    const swingVz = -v.length * Math.cos(v.angle) * omega;

    if (swingVz < 0) {
      p.vz = Math.min(swingVz * 1.3, -11.0);
    } else {
      p.vz = THREE.MathUtils.clamp(swingVz * 1.2, -16, 16);
    }
    p.vy = 5.2;
    p.isGrounded = false;
    p.justReleasedVineTimer = 0.35;
    p.crocBiteGraceTimer = CROC_BITE_GRACE_DURATION;
    p.ignoredVine = p.attachedVine;
    p.attachedVine = null;
    if (p.arms && p.arms.gripBar) p.arms.gripBar.visible = false;

    audio.playRelease();

    const prompt = document.getElementById('vine-prompt');
    if (prompt) prompt.classList.remove('active');
  }
}
