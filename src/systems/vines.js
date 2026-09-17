// Vine swing animation system (extracted from World.update).
// Only vines near the player are animated; distant ones keep their last pose
// until Harry gets close (their swing phase resumes from the stored time).

// Beyond this distance the swing pose is frozen (no visual difference).
export const VINE_ANIM_RANGE = 90;

export function updateVines(world, delta, playerZ) {
  const vines = world.activeVines;
  for (let i = 0; i < vines.length; i++) {
    const v = vines[i];
    if (Math.abs(v.centerZ - playerZ) > VINE_ANIM_RANGE) continue;
    v.time += delta * v.vine.speed;
    v.vine.angle = Math.sin(v.time) * v.vine.maxAngle;
    v.vine.pivot.rotation.x = v.vine.angle;
  }
}
