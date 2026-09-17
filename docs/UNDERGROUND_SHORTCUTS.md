# Underground shortcut logic

Underground shortcuts connect two screens with holes. The tunnel is continuous, but shortcut-specific walls, scorpions, open shafts, and visible ladders are activated only for the current shortcut.

## Data flow

- `src/maps/surface.js` describes the surface screen data.
- `src/maps/shortcuts.js` maps each entry room to `[entrance, ...scorpion rooms in travel order, exit]` (rooms NOT listed warp, listed rooms run at 1x).
- Shortcut activation is triggered only when Harry enters a hole screen from the surface.
- Underground movement never searches for or activates another shortcut automatically.

## Tunnel base

Every screen has a permanent tunnel stretch with a floor, side walls, ceiling, torches, and pooled-light emitters. The base tunnel does not create shortcut walls or scorpions.

All ladders are hidden by default. Only the active shortcut entry and exit ladders may be visible. Ceiling plugs remain visible except at those two openings.

## Shortcut walls

Each active shortcut has two dynamic brick walls: one at the far end of the entry screen and one at the far end of the exit screen. Walls are placed at screen boundaries rather than beside ladders, so side holes cannot trap Harry immediately after a drop.

Wall collision is swept along the player's Z movement in both directions. The player's position is also clamped to the interval between the two active walls. This collision is active only underground and must never block surface movement.

## Scorpions

Scorpions are created only for the active shortcut, one per middle room listed in its array (generated every three screens inside the corridor, excluding the entry and exit screens). The spawn walk follows travel order from the entry screen toward the exit.

When the shortcut changes, its scorpions are removed from the scene, hazard list, and light emitters.

## Speed

- Rooms listed in the active corridor array (entrance, scorpions, exit) use `1x` speed.
- Unlisted transit rooms use `6x` cruise with planned braking, or the animated warp (`60 m/s`, stops `6m` before the next listed room).
- Without an active corridor, ladder screens fall back to `1x`.

## Lifecycle

Activation is performed only from the surface when Harry enters a screen with `Hole > 0`. It creates the two walls and interior scorpions, hides the entry and exit ceiling plugs, and enables only the two endpoint ladders.

During underground travel, other ladder screens remain sealed even if they are loaded in memory. When Harry returns to the surface and leaves the ladder screen, the dynamic shortcut elements are removed and all plugs are restored.

## Maintenance rules

- Do not add shortcut scorpions directly in `buildScreen()`.
- Do not add shortcut walls to the permanent tunnel base.
- Remove dynamic objects from the scene, collision lists, and emitters when deactivating the corridor.
- Open the ceiling only at the active shortcut entry and exit.
- Keep ladder visibility controlled by the active shortcut state.
