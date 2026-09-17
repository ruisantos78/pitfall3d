// Ambient animation system: torches, snakes, campfires, scorpions and
// treasures (extracted from World.update). Everything beyond ANIM_RANGE is
// skipped; gameplay-relevant state (scorpion patrol position) still advances
// through cheap arithmetic so collisions stay exact up close.

export const AMBIENT_ANIM_RANGE = 90;

export function updateAmbient(world, delta, playerZ) {
  // Tunnel torch flicker (emitter intensity only; no Math.random per frame —
  // layered sines look identical and cost nothing in GC).
  world.torchTime += delta;
  const torchTime = world.torchTime;
  const torches = world.animatedTorches;
  for (let i = 0; i < torches.length; i++) {
    const t = torches[i];
    t.emitter.intensity = 6 + Math.sin(torchTime * 13 + t.seed) * 1.3 +
      Math.sin(torchTime * 29 + t.seed * 2) * 0.7;
  }

  // Snakes (tongue/tail wiggle, near only).
  const snakes = world.animatedSnakes;
  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    s.time += delta;
    if (Math.abs(s.snake.group.position.z - playerZ) > AMBIENT_ANIM_RANGE) continue;
    const burst = Math.sin(s.time * 5);
    if (burst > 0.4) {
      s.snake.tongue.rotation.x = Math.sin(s.time * 30) * 0.4;
    } else {
      s.snake.tongue.rotation.x = 0;
    }
    s.snake.tail.rotation.y = Math.sin(s.time * 8) * 0.4;
  }

  // Campfires (flame scale/embers + glow, near only).
  const fires = world.animatedCampfires;
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i];
    f.time += delta;
    // Emitter anchor z is the hazard z; the fire group sits at (0,0,z).
    const fz = f.campfire.group ? f.campfire.group.position.z : 0;
    if (Math.abs(fz - playerZ) > AMBIENT_ANIM_RANGE) continue;
    const t = f.time;
    const c = f.campfire;

    const scaleCoreY = 1.0 + Math.sin(t * 14) * 0.16 + Math.cos(t * 22) * 0.1;
    const scaleCoreXZ = 1.0 + Math.sin(t * 9) * 0.08;
    if (c.coreFlame) {
      c.coreFlame.scale.set(scaleCoreXZ, scaleCoreY, scaleCoreXZ);
    }

    if (c.outerFlames) {
      for (let k = 0; k < c.outerFlames.length; k++) {
        const flame = c.outerFlames[k];
        const scaleY = 1.0 + Math.sin(t * 12 + k * 1.7) * 0.28 + Math.sin(t * 19 + k * 2.3) * 0.14;
        const swayX = Math.sin(t * 7 + k * 1.4) * 0.08;
        const swayZ = Math.cos(t * 8 + k * 1.8) * 0.08;
        flame.scale.set(1.0, scaleY, 1.0);
        flame.rotation.z = swayX;
        flame.rotation.x = swayZ;
      }
    }

    if (c.embers) {
      for (let k = 0; k < c.embers.length; k++) {
        const ember = c.embers[k];
        ember.mesh.position.y += ember.speed * delta;
        ember.mesh.position.x += Math.sin(t * 5 + ember.seed) * 0.012;
        ember.mesh.position.z += Math.cos(t * 4 + ember.seed) * 0.012;

        if (ember.mesh.position.y > 2.5) {
          ember.mesh.position.y = 0.35 + Math.random() * 0.2;
          ember.mesh.position.x = (Math.random() - 0.5) * 0.6;
          ember.mesh.position.z = (Math.random() - 0.5) * 0.6;
        }
      }
    }

    if (f.emitter) {
      // Deterministic flicker: same look as random, no RNG cost per frame.
      f.emitter.intensity = 2.0 + Math.sin(t * 18) * 0.4 + Math.sin(t * 47 + 1.7) * 0.15;
    }
  }

  // Scorpions (manual loop: no per-frame .filter allocation).
  const hazards = world.activeHazards;
  for (let i = 0; i < hazards.length; i++) {
    const s = hazards[i];
    if (s.type !== 'scorpion') continue;
    s.time += delta * (2.2 / (s.patrolRange || 3));
    if (Math.abs(s.baseZ - playerZ) > AMBIENT_ANIM_RANGE) continue;
    s.mesh.position.z = s.baseZ + Math.sin(s.time) * (s.patrolRange || 3);
    s.z = s.mesh.position.z;
    s.mesh.rotation.y = Math.cos(s.time) >= 0 ? 0 : Math.PI;

    s.mesh.rotation.z = Math.sin(s.time * 12) * 0.04;
    s.mesh.position.y = (s.baseY ?? 0.08) + Math.abs(Math.sin(s.time * 12)) * 0.03;

    if (s.emitter) {
      s.emitter.intensity = 1.4 + Math.sin(s.time * 8) * 0.5;
    }
  }

  // Treasures (spin, near only).
  const treasures = world.activeTreasures;
  for (let i = 0; i < treasures.length; i++) {
    const t = treasures[i];
    if (!t.collected && Math.abs(t.z - playerZ) <= AMBIENT_ANIM_RANGE) {
      t.mesh.rotation.y += delta * 2.2;
    }
  }
}
