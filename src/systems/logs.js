// Rolling-log physics system (extracted from World.update).
// Position integration always runs (collision timing must stay exact); only
// the landing-shadow visuals and proximity audio are culled by distance.

import * as THREE from 'three';
import { audio } from '../audio.js';

// Kept in sync with World.ROLLING_CYCLE (local copy avoids a world<->system
// circular import; both must stay 7.4).
const ROLLING_CYCLE = 7.4;

export const LOG_FX_RANGE = 40;

export function updateRollingLogs(world, delta, playerZ, playerVz) {
  world.nearestLogThreat = null;
  const logs = world.activeRollingLogs;
  for (let i = 0; i < logs.length; i++) {
    const l = logs[i];
    l.clock += delta;
    if (l.waiting) {
      if (l.clock >= l.nextDrop) {
        l.nextDrop += ROLLING_CYCLE;
        l.waiting = false;
        l.falling = true;
        l.z = l.spawnZ;
        l.y = l.spawnY;
        l.vy = 0;
        l.mesh.visible = true;
        l.mesh.position.z = l.z;
        l.mesh.position.y = l.y;
        l.landingShadow.visible = true;
        if (!world.activeHazards.includes(l)) world.activeHazards.push(l);
      } else {
        continue;
      }
    }

    const near = Math.abs(l.z - playerZ) < LOG_FX_RANGE;

    if (l.falling) {
      l.vy -= 30 * delta;
      l.y += l.vy * delta;
      if (near) {
        const fallProgress = THREE.MathUtils.clamp(
          1 - (l.y - l.groundY) / l.maxFallHeight,
          0,
          1
        );
        const bandWidth = Math.max(0.01, fallProgress * 9.5);
        l.landingShadow.visible = true;
        l.landingShadow.position.z = l.z;
        if (l.band) l.band.scale.set(bandWidth, 1, 1);
        if (l.bandMat) l.bandMat.opacity = 0.4 + fallProgress * 0.5;
      }

      if (l.y <= l.groundY) {
        l.y = l.groundY;
        l.vy = 0;
        l.falling = false;
        l.landingShadow.visible = false;
      }
      l.mesh.position.y = l.y;
      l.mesh.rotation.x += delta * 3;
    } else if (l.fallingIntoPit) {
      l.vy -= 30 * delta;
      l.y += l.vy * delta;
      l.z = l.exitPitZ;
      l.mesh.position.y = l.y;
      l.mesh.position.z = l.z;
      l.mesh.rotation.x += delta * 10;

      if (l.y <= 0.2) {
        world.debrisManager.spawnLogShatter(l.group, l.screenIndex, l.z);
        l.waiting = true;
        l.falling = false;
        l.fallingIntoPit = false;
        l.mesh.visible = false;
        l.landingShadow.visible = false;
        const hi = world.activeHazards.indexOf(l);
        if (hi >= 0) world.activeHazards.splice(hi, 1);
      }
    } else {
      l.mesh.position.y = l.groundY;
      l.mesh.rotation.x += delta * 12;
      l.z += l.speed * delta;
      l.mesh.position.z = l.z;

      if (near) {
        const ldz = Math.abs(l.z - playerZ);
        if (ldz < 25) {
          l.knockTimer = (l.knockTimer ?? 0) - delta;
          if (l.knockTimer <= 0) {
            audio.playWoodKnock(0.06 + 0.3 * (1 - ldz / 25));
            l.knockTimer = 0.12 + (ldz / 25) * 0.7;
          }
        }
      }

      const relV = playerVz - l.speed;
      let tHit = Infinity;
      if (Math.abs(relV) > 0.5) tHit = (l.z - playerZ) / relV;
      if (tHit >= 0 && tHit < 4 && (world.nearestLogThreat === null || tHit < world.nearestLogThreat.t)) {
        world.nearestLogThreat = { t: tHit, logZ: l.z };
      }

      if (l.z >= l.exitPitZ) {
        l.z = l.exitPitZ;
        l.y = l.groundY;
        l.vy = 0;
        l.fallingIntoPit = true;
        l.landingShadow.visible = false;
      }
    }
  }
}
