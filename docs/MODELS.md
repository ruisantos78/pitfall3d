# Model architecture

## General approach

The project uses Three.js groups and voxel-based geometry to create the Atari-style world. Model builders return reusable groups, meshes, geometries, or materials depending on the asset. Shared GPU resources are cached and must not be disposed by per-screen cleanup.

## World models

The model exports are collected in `src/models/index.js` and used by `src/world.js`.

### Terrain and environment

- `createTreeModel()` creates the reusable tree template used along both sides of the corridor.
- `createBrickWallModel()` creates the dark-red underground dead-end wall. It spans the tunnel and is instantiated dynamically for active shortcuts.
- Tunnel floor, side walls, cave ceilings, and pit bottoms are built by `World` because their dimensions depend on screen placement.

### Hazards

- `createLogModel()` creates stationary and rolling logs.
- `createCampfireModel()` creates the campfire base, flames, embers, and sparks.
- `createSnakeModel()` creates the surface snake hazard.
- `createScorpionModel()` creates the underground scorpion, including articulated legs, tail, stinger, and light anchor.
- `createCrocodileModel()` creates the crocodile platform, head, eyes, jaw, teeth, and safe rear area.
- `createOpeningQuicksandModel()` creates the segmented moving quicksand lid and its pit walls. The shallow surface bottom is added separately by `World`.

### Traversal models

- `createVineModel()` creates the swinging vine, pivot, rope, and tip used for automatic grabbing.
- Ladder geometry is assembled by `World.addLadderShaft()` because ladder visibility, placement, and ceiling plugs depend on the active shortcut.

### Collectibles

- `createTreasureModel(type)` creates money bags, silver bars, gold bars, and diamond rings.
- Treasure meshes are attached to the screen that owns them and removed when collected.

## Geometry and materials

`src/voxel.js` provides `createVoxelGeometry()` with face culling. The centering modes are:

- `true`: center geometry on all axes;
- `false`: preserve raw voxel coordinates;
- `'bottom'`: center horizontally while anchoring the lowest voxel at `Y = 0`.

Voxel geometry and materials are memoized whenever possible. Screen cleanup must not dispose shared geometry or shared materials.

## Surface pits and the tunnel

Surface pits have their own shallow bottom at `PIT_FLOOR_Y = -1`. This bottom is separate from the continuous underground tunnel ceiling and floor. Water, tar, and quicksand may use different surface materials, but their collision floor remains independent from the tunnel.

The tunnel base is continuous across screens. Shortcut-specific brick walls, scorpions, open ceiling plugs, and visible ladders are activated and removed by `World.activateTunnelCorridor()` and `World.deactivateTunnelCorridor()`.

## Animation and lighting

Dynamic model behavior is updated by `World.update()`:

- vines swing around their pivot;
- crocodile jaws follow their mouth cycle;
- quicksand sections open and close independently;
- logs fall, roll, enter the exit pit, and shatter;
- campfire flames and sparks animate;
- scorpions patrol their assigned tunnel ranges.

Lights use pooled emitters rather than creating and destroying point lights for every screen. Surface and underground emitters are selected separately according to the player's current level.

## Collision ownership

Models provide visual geometry; gameplay collision is owned by `Player` and `World` data structures. A visible mesh alone is not a collision definition. Whenever a model's dimensions change, its corresponding hazard range, floor height, or wall range must be updated as well.
