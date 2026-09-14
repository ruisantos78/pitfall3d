# Collision and pit rules

## Movement conventions

- Harry moves only along the `Z` axis.
- Forward movement uses `-Z`.
- Backward movement uses `+Z`.
- The surface trail is at `Y = 0`.
- Shallow pit floors are at `PIT_FLOOR_Y = -1`.
- The continuous tunnel floor is at `TUNNEL_FLOOR_Y`.
- The underground ceiling is at `CEIL_TOP_Y` and is never used as a pit floor.

## Surface and underground separation

The surface, pit floor, and tunnel are three separate levels:

```text
------------------------- surface trail (Y = 0)
        shallow pit
        ____pit floor____  own floor (Y = -1)
========================= underground ceiling (CEIL_TOP_Y)
        tunnel             tunnel floor (TUNNEL_FLOOR_Y)
```

A pit must never use the ceiling or tunnel floor as its physical surface. Falling into a pit ends at its shallow floor and causes a hit kill when that level is reached.

## Water, tar, and quicksand pits

- Water and tar are 20 meters long, matching their visual geometry.
- Quicksand has a physical radius of `10 m`, for a total length of 20 meters.
- Collision ranges must cover the entire visual opening, including its edges.
- When quicksand is closed, the surface is solid at `Y = 0`.
- When a section is open, Harry falls to `PIT_FLOOR_Y`.
- Reaching the pit floor triggers the corresponding death.
- The pit floor is rendered separately and does not depend on the continuous tunnel.

Crocodiles are an exception inside water: when Harry is over a valid crocodile area, the elevation is the crocodile top (`Y approximately 0.35`). The rear area remains protected according to the game's immunity rule.

## Shafts and ladders

`HOLE_SINGLE` and `HOLE_TRIPLE` openings use matching Z ranges for geometry and collision.

- `HOLE_SINGLE` has one ladder shaft.
- `HOLE_TRIPLE` has a ladder only in the center shaft.
- Side shafts have no ladder and drop directly into the tunnel.
- Entering any part of an opening activates the corresponding transition; there is no outer strip where Harry can walk across empty space.
- Descending marks `inTunnel = true` at the beginning of the transition.
- When climbing up, `inTunnel` returns to `false` only after Harry reaches the surface.
- All ladders are hidden by default; only the active shortcut entrance and exit may be visible.

## Underground ceiling

- Every screen has a continuous underground ceiling.
- Screens with shafts use plugs to close their openings by default.
- The active shortcut entrance and exit plugs are hidden.
- The ceiling must not be used as the floor for water, tar, quicksand, or shafts.
- Falling onto a closed ceiling area is a cave collision, not a tunnel landing.

## Tunnel walls

Each active shortcut has two dynamic walls: one at the far end of the entry screen and one at the far end of the exit screen.

- Walls block both `-Z` and `+Z` movement.
- Collision uses the wall's physical range and the segment traveled between the previous and current frame.
- Fast movement steps that skip over the wall center must also be blocked.
- As an additional guard, Harry's position is clamped to the interval between the two active walls.
- Wall collision applies only underground, during descent, or once Harry is below the surface.
- An underground wall must never block movement on the surface.

## Surface obstacles

- Stationary and rolling logs use a Z collision range close to their visual length.
- Logs hit Harry only at surface level and when he is not high enough during a jump.
- Fires, snakes, and scorpions use contact ranges at the player's level.
- The rolling-log exit pit has its own shallow floor and spike hit kill.
- Crocodiles use their top elevation to support jumping from one crocodile to the next.

## God Mode

The debug mode is defined in `src/debug.js`:

```js
export const DEBUG_GOD_MODE = false;
```

When enabled, it bypasses specified obstacle deaths and impacts, but the original collision logic must remain in the code. The setting must be disabled by default.

## Maintenance rules

- When changing a pit's visual size, update its collision range as well.
- Never use `TUNNEL_FLOOR_Y` as a surface pit floor.
- Never use `CEIL_TOP_Y` as a substitute for a pit floor.
- Test the entrance, center, and exit of every pit.
- Test tunnel walls while walking in both directions.
- Run `npm run build` after collision changes.
