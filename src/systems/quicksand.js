// Disappearing-quicksand cycle system (extracted from World.update).
// The phase timer always advances (gameplay timing must stay exact), but
// segment mesh transforms are frozen while the pit is far away.

import * as THREE from 'three';
import { audio } from '../audio.js';

export const QUICKSAND_ANIM_RANGE = 90;

export function updateQuicksand(world, delta, playerZ, isAhead) {
  const pits = world.activeOpeningPits;
  for (let p = 0; p < pits.length; p++) {
    const pit = pits[p];
    pit.timer += delta;
    const n = pit.numSegments;
    const total = pit.closedDur + pit.openingDur + pit.openDur + pit.closingDur;
    const cycleTime = pit.timer % total;

    let phase = 'closed';
    if (cycleTime < pit.closedDur) {
      phase = 'closed';
    } else if (cycleTime < pit.closedDur + pit.openingDur) {
      phase = 'opening';
    } else if (cycleTime < pit.closedDur + pit.openingDur + pit.openDur) {
      phase = 'open';
    } else {
      phase = 'closing';
    }
    pit.phase = phase;

    if (phase === 'opening') {
      if (!pit.rumblePlayed && isAhead(pit.z)) {
        audio.playQuicksandRumble();
        pit.rumblePlayed = true;
      }
    } else if (phase === 'closed') {
      if (pit.wasOpen) {
        if (isAhead(pit.z)) audio.playGroundThud();
        pit.wasOpen = false;
        pit.rumblePlayed = false;
      }
    }

    // Open/closed bookkeeping stays exact at any distance (cheap arithmetic).
    let openCount = 0;
    const far = Math.abs(pit.z - playerZ) > QUICKSAND_ANIM_RANGE;
    const segs = pit.segments;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const half = Math.max(0.5, (n - 1) / 2);
      const d = Math.abs(i - (n - 1) / 2) / half;
      const openStart = pit.closedDur + d * pit.openingDur;
      const closeStart = pit.closedDur + pit.openingDur + pit.openDur + (1 - d) * pit.closingDur;
      const target = cycleTime >= openStart && cycleTime < closeStart ? 1 : 0;

      seg.openAmount = THREE.MathUtils.lerp(seg.openAmount ?? 0, target, delta * 10);
      if (Math.abs(seg.openAmount - target) < 0.01) seg.openAmount = target;
      seg.isOpen = seg.openAmount > 0.5;
      if (seg.isOpen) openCount++;

      if (far) continue;

      const sep = seg.openAmount * 1.4;
      const sink = seg.openAmount * 4.0;
      const moving = Math.abs(target - seg.openAmount) > 0.02 ? 1 : 0;
      const jitter = moving * Math.sin(pit.timer * 50 + i * 2.1) * 0.06;
      seg.leftMesh.position.set(seg.baseOffset - sep + jitter, -sink, seg.baseOffset);
      seg.rightMesh.position.set(seg.baseOffset + sep + jitter, -sink, seg.baseOffset);

      const hide = seg.openAmount > 0.95;
      seg.leftMesh.visible = !hide;
      seg.rightMesh.visible = !hide;
    }

    pit.openCount = openCount;
    pit.isOpen = openCount > 0;
    if (openCount > 0) pit.wasOpen = true;
  }
}
