# Authentic Map & Treasure Spec (from `assets/pitfall.asm`)

Authoritative reference for `src/world.js` screen generation. Everything here is
taken directly from the disassembled Atari 2600 ROM (Thomas Jentzsch disassembly).

## 1. Scene LFSR (bidirectional, 255 phases)

- Seed: `RAND_SEED = $C4` (`InitGame`).
- **Forward** (`RightRandom`, walking right/forward): `r' = (r << 1) | (b3^b4^b5^b7)`
- **Backward** (`LeftRandom`, walking left/back): `r' = (r >> 1) | ((b0^b4^b5^b6) << 7)`
  - Note: the ASM *comment* says `bit1`, but the executed code (`asl,eor,asl,eor,asl,asl,rol,eor,lsr,ror`) combines bits 0, 4, 5 and 6 — the equation above is the one the code performs (verified: forward∘backward round-trips the full 255-phase cycle).
- Screen N (0-based) = seed stepped forward `N mod 255` times. Phase 255 wraps to phase 1's state → seamless loop in both directions.
- `src/world.js` precomputes all 255 specs once into a static table (`World.LFSR_TABLE`) instead of re-stepping per screen build (memory + CPU).

## 2. Field decode (`ContRandom`)

| Bits | Field | Meaning |
|------|-------|---------|
| 0..2 | `objectType` | ground object id (see table below) |
| 3..5 | `sceneType` | scene id 0..7 |
| 6..7 | `treePat` | tree pattern 0..3 |
| 7 | wall side | ladder scenes only: 0 → left (17/160), 1 → right (136/160) |

## 3. Scene types (`sceneType` bits 3..5)

| sceneType | Original | world.js type | Features |
|-----------|----------|---------------|----------|
| 0 | One hole | `HOLE_SINGLE` | 1 shaft + ladder + tunnel brick wall (bit 7 side) |
| 1 | Three holes | `HOLE_TRIPLE` | 3 shafts (ladder only in the middle) + brick wall |
| 2 | Tar pit | `TAR_PIT_VINE` | black pit + vine, **no treasure** |
| 3 | Blue swamp | `QUICKSAND_VINE` | water + vine, **no treasure** |
| 4 | Crocodiles | `CROCODILE_VINE` / `CROCODILE_POND` | croc pond; vine presence split deterministically by `treePat` parity (3D-only extension) |
| 5 | **Treasure quicksand** | `DISAPPEARING_QUICKSAND` | opening quicksand + **the only treasure scene** |
| 6 | Black quicksand | `QUICKSAND_VINE_OPEN` | opening quicksand + vine, **no treasure** |
| 7 | Blue quicksand | `BLUE_QUICKSAND` | opening quicksand, no vine, **no treasure** |

## 4. Ground objects (`objectType` bits 0..2)

| obj | Object | Original render | world.js |
|-----|--------|-----------------|----------|
| 0 | 1 rolling log | `ONE_COPY` | rolling log (drop cycle) |
| 1 | 2 rolling logs | `TWO_COPIES` | 2 staggered rolling logs |
| 2 | 2 wide rolling logs | `TWO_WIDE_COPIES` | 2 staggered rolling logs |
| 3 | 3 rolling logs | `THREE_MED_COPIES` | 3 staggered rolling logs |
| 4 | 1 stationary log | `ONE_COPY` | stationary log |
| 5 | 3 stationary logs | `THREE_MED_COPIES` | stationary logs (wide group) |
| 6 | Fire | `ONE_COPY` | campfire |
| 7 | Cobra | `ONE_COPY` | snake (rattlesnake model) |

- Object X position: `xPosObject = 124` px of 160 (`ContRandom`) → **object sits at 124/160 of the screen depth** (z = `startZ − 46.5` with `SCREEN_LENGTH = 60`).
- Crocodile scenes override the object X: `xPosObject = 60` px (60/160 of depth); the three croc copies render adjacently (NUSIZ `THREE_COPIES`). In 3D we keep the AGENTS.md-mandated gameplay layout (crocs at `z offsets [+6.5, 0, −6.5]`, 6.5 m spacing) — a documented, deliberate deviation.

## 5. Treasures (`CheckTreasures`) — THE critical rules

1. Treasures exist **ONLY on `sceneType == 5`** screens. Scenes 2/3/6/7 have **no treasure** (common modding mistake — the ROM never puts one there).
2. The sprite kind is `objectType & 3`:
   | kind | Sprite | Points (`(obj&3)<<4 + $20` BCD) |
   |------|--------|--------|
   | 0 | Money bag | 2000 |
   | 1 | Silver bar | 3000 |
   | 2 | Gold bar | 4000 |
   | 3 | Diamond ring | 5000 |
3. **32 unique treasures total**: `CheckTreasures` maps each scene-5 screen to one of 32
   `(slotIndex, objectType)` slots tracked in `treasureBits` (4 bytes = 32 bits), where
   `slotIndex` comes from `lda random; rol; rol; rol; and #3` — through the 6502 carry
   this reduces exactly to `bits 6..7` (= `treePat`). A claimed slot renders **nothing** —
   treasures never respawn in the original. The famous "32 treasures" comes from this:
   the 255-phase loop contains exactly 32 scene-5 phases, each contributing one unique slot
   (verified: 8 money bags, 8 silver bars, 8 gold bars, 8 diamond rings).
4. Placement: same X as any ground object, **124/160 of the screen** — i.e. *past the far
   edge* of the quicksand pit (pit spans px 44..107), on solid ground.
5. Score is BCD; `treasureCnt` counts down from 31 and reaching 0 wins the game. The 3D
   edition keeps the count open-ended in the HUD (AGENTS.md rule 7) but preserves
   *uniqueness*: each `(phase, kind)` slot can be collected **once per run**.

### world.js implementation
- `World.collectedTreasureSlots: Set<string>` — key `"<phase255>:<objectType>"` (equivalent to the ROM's `(bits 6..7, objectType)` slot id).
- Scene-5 build: skip spawning if the slot is already claimed this run.
- Player pickup (`player.js`) calls `world.claimTreasureSlot(treasure)`.
- `world.resetRun()` clears the set (called by `Game.rebuildWorld()` on restart, like the ROM's `InitGame` resetting `treasureBits`).

## 6. Underground (ladder scenes 0/1)

- `ladderFlag = WITHLADDER`, wall X = bit 7 ? `136/160` : `17/160` (already implemented as `addTunnelWall`).
- Scorpion only on ladder-free screens (never both), patrolling the tunnel.
- Other scenes: `ladderFlag = NOLADDER`, `xPosScorpion = 80` (scorpion centered).

## 7. Crocodile / hole bounds (HoleBoundsTab, px)

- Single hole: 72–79. Triple: 44–55, 72–79, 96–107. Pit: 44–107.
- Crocs closed: 44–61, 64–71, 80–87, 96–107; open jaws widen each bound by ~2 px.
- The quicksand/scenes 5–7 use the animated `QuickSandTab` cycle (already replicated as the 9.9 s per-section cycle).

## 8. Model resolution & memory policy

- All voxel model **geometries are memoized** in `models.js` (`GEO_CACHE`) and shared
  across every screen; meshes are lightweight `THREE.Mesh` instances reusing the same
  GPU buffers. `World.disposeScreenGroup` never disposes a cached geometry
  (`isSharedModelGeometry`).
- Smoothing is achieved by *raising voxel resolution* on decorative/hazard models
  (campfire, snake, scorpion, treasure, vine, brick wall) while keeping
  **physics-tied sizes frozen**: crocodile `0.22` (safe-platform height 0.35 m and the
  `z <= croc.z + 0.8` rule depend on it) and the log (`0.18 × 38` voxels ≈ 7 m, resting
  `Y = 0.45`).
- The vine keeps an exact tip height: `32 knots × 0.21 = 6.72 m` (identical to the old
  `24 × 0.28`), so grab windows in `player.js` are unchanged.
