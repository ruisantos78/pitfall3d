// First-person arms + head-bobbing camera (extracted from Player).
// Operates on the player instance passed in, so there is no `this` binding.

import * as THREE from 'three';
import { audio } from '../audio.js';
import { EYE_HEIGHT, WARP_FOV } from './constants.js';

export function updateArmsAndCamera(player, delta) {
  const isMoving = Math.abs(player.vz) > 0.5;
  const isTripped = player.isTripped;

  // Off the vine: hide the grip bar (only shown while swinging).
  if (player.arms && player.arms.gripBar) player.arms.gripBar.visible = false;

  // Kneeling: player drops to knees as in the original Atari 2600 while log rolls by
  if (isTripped) {
    // Lower camera to kneeling height (~1.2m above feet)
    const targetY = player.y + 1.2;
    player.camera.position.set(0, THREE.MathUtils.lerp(player.camera.position.y, targetY, delta * 10), player.z);
    // Slight natural tilt down, maintaining player facing direction (targetRotY)
    player.camera.rotation.x = THREE.MathUtils.lerp(player.camera.rotation.x, -0.15, delta * 10);
    player.camera.rotation.z = 0;
    player.camera.rotation.y = THREE.MathUtils.lerp(player.camera.rotation.y, player.targetRotY, delta * 15);
    if (player.arms) {
      // Arms rested on knees / bracing slightly
      player.arms.leftArm.position.set(-0.3, -0.25, -0.5);
      player.arms.rightArm.position.set(0.3, -0.25, -0.5);
      player.arms.leftArm.rotation.x = Math.PI / 4;
      player.arms.rightArm.rotation.x = Math.PI / 4;
    }
    return;
  }

  // Head bobbing calculation
  let bobY = 0;
  let bobPitch = 0;

  if (isMoving && player.isGrounded) {
    player.bobTimer += delta * 12;
    bobY = Math.sin(player.bobTimer) * 0.05;
    bobPitch = Math.sin(player.bobTimer) * 0.015;

    // Footstep on every stride (each zero crossing of the bob cycle).
    const bobSin = Math.sin(player.bobTimer);
    if (
      player.lastBobSin !== undefined &&
      ((player.lastBobSin >= 0 && bobSin < 0) || (player.lastBobSin < 0 && bobSin >= 0))
    ) {
      audio.playStep();
    }
    player.lastBobSin = bobSin;
  } else {
    player.bobTimer = 0;
    player.lastBobSin = 0;
  }

  // Warp stretch: widen the FOV while dashing, ease it back after.
  const targetFov = player.warp ? WARP_FOV : player.baseFov;
  if (Math.abs(player.camera.fov - targetFov) > 0.05) {
    player.camera.fov = THREE.MathUtils.lerp(player.camera.fov, targetFov, Math.min(1, delta * (player.warp ? 3 : 5)));
    player.camera.updateProjectionMatrix();
  }

  // Camera position & rotation (slight natural tilt towards the trail ahead)
  const targetCameraY = player.y + EYE_HEIGHT + bobY;
  player.camera.position.set(0, THREE.MathUtils.lerp(player.camera.position.y, targetCameraY, delta * 12), player.z);
  player.camera.rotation.x = THREE.MathUtils.lerp(player.camera.rotation.x, -0.04 + bobPitch, delta * 12);
  player.camera.rotation.z = 0;

  // Ensure targetRotY is initialized
  if (player.targetRotY === undefined) {
    player.targetRotY = 0;
  }

  // Smooth 180 degree spin
  player.camera.rotation.y = THREE.MathUtils.lerp(player.camera.rotation.y, player.targetRotY, delta * 15);

  // Arms animations
  if (player.arms) {
    if (!player.isGrounded) {
      // Arms raised slightly in jump
      player.arms.leftArm.position.set(-0.35, -0.15, -0.55);
      player.arms.rightArm.position.set(0.35, -0.15, -0.55);
      player.arms.leftArm.rotation.x = Math.PI / 3;
      player.arms.rightArm.rotation.x = Math.PI / 3;
    } else if (isMoving) {
      // Running arm swing
      const armSwing = Math.sin(player.bobTimer) * 0.35;
      player.arms.leftArm.position.set(-0.35, -0.3 + bobY, -0.6);
      player.arms.rightArm.position.set(0.35, -0.3 + bobY, -0.6);
      player.arms.leftArm.rotation.x = Math.PI / 4 + armSwing;
      player.arms.rightArm.rotation.x = Math.PI / 4 - armSwing;
    } else {
      // Idle breathing
      const breathe = Math.sin(Date.now() * 0.003) * 0.015;
      player.arms.leftArm.position.set(-0.35, -0.3 + breathe, -0.6);
      player.arms.rightArm.position.set(0.35, -0.3 + breathe, -0.6);
      player.arms.leftArm.rotation.x = Math.PI / 4;
      player.arms.rightArm.rotation.x = Math.PI / 4;
    }
  }
}
