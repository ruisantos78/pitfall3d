// Player physics constants (extracted from player.js so camera/movement
// modules can share them without circular imports; player.js re-exports
// every name to keep existing `from './player.js'` imports working).

export const GRAVITY = 28.0;
export const JUMP_VELOCITY = 10.5;
export const RUN_SPEED = 9.0;
export const EYE_HEIGHT = 2.2;
// Underground shortcut pace: ladder/scorpion screens walk at normal surface
// pace (jumping stays enabled — it is the only way past scorpions).
export const TUNNEL_SPEED_MULT = 1.0;
// Empty underground screens have no ladder or scorpion to negotiate, so Harry
// sprints through them at 6x, braking smoothly into the next 1x screen.
export const EMPTY_TUNNEL_SPEED_MULT = 6.0;
// Planned braking decel (m/s^2) capping the 6x cruise by distance to the
// next ladder/scorpion screen: ~41m of smooth slowdown from 54 to 9 m/s.
export const TUNNEL_BRAKE_DECEL = 35.0;
// Animated warp through empty tunnel screens: top speed, stop margin before
// the next ladder/scorpion screen edge, and min trip length to engage.
export const WARP_SPEED = 60.0;
export const WARP_STOP_MARGIN = 6.0;
export const WARP_MIN_DIST = 25.0;
export const WARP_FOV = 95.0;
// Grace period after releasing a vine during which an open crocodile mouth
// cannot kill (enough time to clear the last croc and land back on track).
export const CROC_BITE_GRACE_DURATION = 1.0;
