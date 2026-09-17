// Crocodile jaw-cycle system (extracted from World.update).
// The 4.4s mouth timer always advances (gameplay timing must stay exact),
// but mesh rotation and eye-color uniform uploads are skipped for distant
// crocodiles, and the eye color is only pushed when the phase changes.

import * as THREE from 'three';
import { audio } from '../audio.js';

export const CROC_ANIM_RANGE = 90;

const EYE_CALM = 0xf8d820;
const EYE_ALERT = 0xff8800;
const EYE_OPEN = 0xff0000;

export function updateCrocs(world, delta, playerZ, isAhead) {
  const crocs = world.activeCrocodiles;
  for (let i = 0; i < crocs.length; i++) {
    const c = crocs[i];
    c.mouthTimer += delta;
    const cycleTime = c.mouthTimer % 4.4;
    let targetAngle = 0;
    let eye = EYE_CALM;

    if (cycleTime < 2.5) {
      c.isOpen = false;
      targetAngle = 0;
      eye = EYE_CALM;
      if (c.wasOpen) {
        if (isAhead(c.z)) audio.playCrocSnap();
        c.wasOpen = false;
      }
    } else if (cycleTime < 2.8) {
      c.isOpen = false;
      targetAngle = -0.2;
      eye = EYE_ALERT;
    } else if (cycleTime < 4.1) {
      c.isOpen = true;
      c.wasOpen = true;
      targetAngle = -1.15;
      eye = EYE_OPEN;
    } else {
      c.isOpen = true;
      targetAngle = 0;
      eye = EYE_OPEN;
    }

    // Distant crocs: timer advanced above, visuals frozen until approached.
    if (Math.abs(c.z - playerZ) > CROC_ANIM_RANGE) continue;

    if (eye !== c._eye) {
      c._eye = eye;
      if (c.croc.eyeMaterial) c.croc.eyeMaterial.color.setHex(eye);
    }

    if (c.croc.upperJaw) {
      c.croc.currentAngle = THREE.MathUtils.lerp(c.croc.currentAngle || 0, targetAngle, delta * 16);
      c.croc.upperJaw.rotation.x = c.croc.currentAngle;
    }
  }
}
