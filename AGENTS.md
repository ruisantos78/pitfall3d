# 🤖 AGENTS.md — Developer & AI Agent Guide

This document contains all architecture guidelines, gameplay rules, math conventions and maintenance instructions for AI agents and developers working on the **Atari Pitfall 3D (FPS Edition)** repository.

---

## 🧭 Project Overview

**Atari Pitfall 3D** is a **First-Person (FPS)** recreation of the timeless classic **Pitfall!** (Activision / Atari 2600, 1982). The game puts the player directly in Pitfall Harry's perspective, keeping the strictest fidelity to the original Atari 2600 cartridge rules, but rendered in real time with **Three.js** and a cube/voxel aesthetic simulating three-dimensional pixels.

- **Repository:** https://github.com/ruisantos78/pitfall3d.git (default branch: `main`, old `gitea` remote kept as backup)
- **Tech Stack:** Modern JavaScript (ES Modules), [Three.js](https://threejs.org/) (3D WebGL renderer), [Vite](https://vitejs.dev/) (bundler & dev server), standalone HTML5 Canvas & Web Audio API.
- **Default Port:** `http://localhost:5173/`
- **Startup Commands:** `make` or `make run` (dev server), `make build` (production build).

---

## 🌲 Inviolable Game Rules (Gameplay Constraints)

Any agent modifying this code **MUST PRESERVE** these guidelines:

1. **Strictly One-Dimensional Movement (1D):**
   - The player can only walk **Forward** (`W` / `Up Arrow`) or **Backward** (`S` / `Down Arrow`) along the `Z` axis.
   - There is **NO sideways strafing (`A`/`D`)** nor free movement on the `X` axis. The player walks down the center of the jungle corridor.
2. **Single Action Button:**
   - `Space`, `Enter`, Mouse Click or virtual touch button:
     - On the ground: **JUMP** over logs, campfires and scorpions.
     - In the air / hanging on the vine: **LET GO OF THE VINE**, transferring angular momentum into forward thrust.
3. **Automatic Vine Grab:**
   - The vine is grabbed **automatically** as soon as the player touches or gets near its lower knot (`tip`), triggering the iconic 8-bit Tarzan yell.
4. **No Center Crosshair (No Crosshair Dot):**
   - **DO NOT add a crosshair / aim reticle.** The user explicitly requested removing the central white dot to keep a clean retro immersion.
5. **Legendary Immunity on the Crocodile's Eyes:**
   - In the original Atari 2600, standing on the crocodile's eyes/top of the head makes Harry 100% immune to bites, even with its mouth wide open.
   - In code: if `z <= croc.z + 0.8`, the player is on the eyes/skull and **MUST NEVER DIE** when the mouth opens. Only the front snout area (`z > croc.z + 0.8`) is dangerous when open.
6. **Long Moving Quicksand (9.0 Meters):**
   - The opening/closing quicksand hole is **9.0 meters long** (`radius = 4.5`).
   - The player's max running jump is **6.75 meters**. Therefore it is **physically impossible to jump over it when open**.
   - Correct crossing requires waiting for the ground to close and sprinting across the solid floor.
7. **Open Treasure Count (No 32 Cap):**
   - In the Atari 2600 classic there were 32 treasures spread across underground and surface screens.
   - In the continuous procedurally generated 3D game, the player can explore indefinitely and rescue **more than 32 treasures**.
   - The HUD and Game Over screen show only the pure progressive count (`0`, `1`, `2`, ...), without the restrictive `/32` suffix.
8. **Retro Atari Aesthetics:**
   - Atari 2600 NTSC color palette.
   - Stylized cube/voxel graphics using `createVoxelGeometry` with inner-face culling.
   - Toggleable CRT scanline effect in the HUD.
   - 100% synthesized audio via Web Audio API (no external `.mp3` or `.wav` assets).

---

## 📁 File Structure & Responsibilities

```
pitfall/
├── Makefile             # make commands (run, build, preview, clean, help)
├── package.json         # Dependencies: Three.js and Vite
├── index.html           # Canvas, 3D container, CRT overlay and retro HUD
├── style.css            # Atari styling, arcade typography and CRT filters
├── README.md            # Player guide
├── AGENTS.md            # This technical guide for AI agents
└── src/
    ├── main.js          # Main loop, Three.js setup, scene and camera
    ├── player.js        # FPS physics, collisions, jumping, vine and crocodile logic
    ├── world.js         # Procedural screen generation, hazards and world animation
    ├── models.js        # 3D voxel model generators (crocodile, vine, campfire, etc.)
    ├── voxel.js         # Optimized voxel geometry algorithm with face-culling
    ├── audio.js         # Pure Web Audio API synthesizer with 8-bit effects
    ├── hud.js           # HUD panel, score, timer, lives and contextual warnings
    └── i18n.js          # PT/EN languages + preferences (localStorage: pitfall3d-settings)
```

### Module Details:

#### [`src/player.js`](file:///home/ruisantos/Projects/pitfall/src/player.js)
- **Physics Constants:**
  - `RUN_SPEED = 9.0` (walk speed forward/backward)
  - `JUMP_VELOCITY = 10.5`, `GRAVITY = 28.0` (air time ~0.75s, max running jump range = 6.75m)
  - `EYE_HEIGHT = 2.2` (Harry's first-person eye height)
  - **Natural Camera Tilt:** `camera.rotation.x = -0.04 + bobPitch` (~-2.3° tilt subtly facing the path ahead, framing the ground, obstacles and foreground arms).
- **Coordinate Convention:**
  - The player starts at `z = 0` and **advances toward negative `Z`** (`vz < 0`).
  - Therefore: more negative coordinates are **ahead**; more positive coordinates are **behind**.
- **Critical Functions:**
  - `getCrocodileAt(world, z)`: Locates the specific crocodile under the player's feet within the extended range `[-3.3, +3.9]`.
  - `getSurfaceElevation(world, z)`: Returns ground elevation (`0.0`), crocodile top (`0.35`) or abyss (`-10.0`).
  - `checkVineGrab(world)`: Detects proximity to the vine tip and anchors the player.
  - `releaseVine()`: Releases the vine with parabolic momentum.
  - `die(reasonKey)`: takes a DICTIONARY KEY (`death.*` in `i18n.js`), never literal text; translated only in `triggerGameOver()` via `t()`. Fires `audio.playLifeLost()` when lives remain (`lives > 0`) and `audio.playGameOver()` on the last life, triggering the game-over screen.

#### [`src/world.js`](file:///home/ruisantos/Projects/pitfall/src/world.js)
- **Global Ground Surface Leveling:**
  - The central dirt mesh (`groundMesh`) uses blocks of height `1.0` positioned at `Y = -1.0`, ensuring the trail's top surface sits exactly at **`Y = 0.00`**.
  - This perfectly aligns the trail with the side borders (`leftBorder`, `rightBorder`), Harry's feet elevation (`standingSurfaceY = 0.00`) and the quicksand lid.
- **Screen Dimensions:**
  - Each screen is `SCREEN_LENGTH = 60` meters long on the `Z` axis.
  - `startZ = -index * 60`, `endZ = -(index + 1) * 60`.
- **Classic Screen Sequence:**
  - `START_TRAIL` (intro log)
  - `STATIONARY_LOGS` (two logs)
  - `DISAPPEARING_QUICKSAND` (9m moving quicksand)
  - `QUICKSAND_VINE` (20m blue lake with vine — vine-only crossing)
  - `ROLLING_LOGS` (rolling logs)
  - `CROCODILE_POND` (pond with 3 crocodiles spaced at `[5, 0, -5]`)
  - `QUICKSAND_AND_LOG` (moving quicksand + rolling log)
  - `CAMPFIRE_TREASURE` (campfires with dynamic flames)
  - `TAR_PIT_VINE` (tar pit with vine)
  - `SCORPION_RUN` (crawling scorpions)
  - `CROCODILE_VINE` (crocodile pond + hanging vine)
- **Dynamic Updates (`world.update(delta)`):**
  - Vine swing animation (`v.vine.pivot.rotation.x`).
  - 4.4s crocodile mouth cycle (closed, orange-eyed alert, red open, snap shut).
  - 7.4s quicksand zipper cycle (closed and solid for 2.8s, entry→exit opening wave for 1.8s, fully open for 1.6s, surfable entry→exit zipper close for 1.2s).

#### [`src/models.js`](file:///home/ruisantos/Projects/pitfall/src/models.js)
- `createOpeningQuicksandModel(voxelSize = 0.45, numSegments = 6)`:
  - Fixed pit walls at `Y = -2..0`; bottom is the endless black shaft (`addBottomlessShaft`).
  - Lid split into 6 sections along `Z`: each section splits in half (halves slide from center to the sides on `X`) and sinks on `Y` as `openAmount` goes 0→1, with tremor while moving. Physics (`isQuicksandOpenAt`) and cycle are per-section.
- `createCrocodileModel(voxelSize = 0.32)`:
  - Head/eyes at `Z = 0`.
  - Safe platform on scales and golden chevrons from `Z = -10` to `+2` (`z <= croc.z + 0.8`).
  - Articulated jaw from `Z = 3` to `12` with X-axis rotation and sharp teeth.
- `createLogModel(voxelSize = 0.18)`:
  - Log cylinder 0.90m in diameter (0.45m radius) and 3.06m wide.
  - Centered on the X rotation axis and resting at `Y = 0.45`, ensuring perfect rolling on the ground without sinking.
- `createCampfireModel(voxelSize = 0.22)`:
  - Base with stone ring, ash bed and live embers grounded at `Y = 0.0` with `center = 'bottom'`.
  - Pyramid logs and layered flames rising from `Y = 0.22` up to ~2.0m, with dynamic sparks and warm light.
- `createTreasureModel(type, voxelSize = 0.22)`:
  - Money bag with `$` sign, gold/silver bars and diamond ring with 2-layer golden band; the diamond is lifted (`liftY = 0.3` in `addTreasure`) so the band doesn't look sunken into the ground.
  - Positioned at `Y = 0.05` for smooth rotation and full visibility over the trail.
- `createScorpionModel(voxelSize = 0.28)`:
  - Giant high-visibility arcade scorpion with vibrant red carapace and obsidian/gold bands.
  - Tall arched tail with stinger and glowing yellow venom bulb at `Y = 6` (~1.68m tall).
  - Dynamic `THREE.PointLight(0xffcc00)` point light casting warning glow on ground and vegetation.
  - Glowing cyan eyes, 8 articulated legs and menacing front pincers.

#### [`src/voxel.js`](file:///home/ruisantos/Projects/pitfall/src/voxel.js)
- Optimized voxel geometry algorithm with face-culling (culls adjacent inner faces for high performance).
- **Centering Modes (`createVoxelGeometry(voxels, voxelSize, center)`):**
  - `center = true`: geometrically centers on all 3 axes (`X`, `Y`, `Z`). Used for rolling cylindrical logs centered on their rotation axis.
  - `center = 'bottom'`: centers horizontally on `X` and `Z`, but anchors the lowest voxel's bottom plane at `Y = 0.0` (`offsetY = minY`). Essential for campfires, treasures and scorpions resting directly on the ground.
  - `center = false`: keeps raw voxel coordinates untranslated (used for terrain and trees).

#### [`src/hud.js`](file:///home/ruisantos/Projects/pitfall/src/hud.js)
- Retro Heads-Up Display management:
  - 6-digit score (`padStart(6, '0')`).
  - 20-minute countdown timer (`MM:SS`).
  - Continuous progressive treasure counter (`player.treasuresCollected`), with no fixed cap or 32 suffix.
  - Dynamic proximity indicators: crocodile mouth danger/safety warning and vine-grab prompt.
  - Audio toggle and retro CRT filter with scanlines.
  - Dynamic texts always via `t()` from `i18n.js` (never literal PT/EN); help warnings (`croc-status`) hideable via `getShowHelp()`.

#### [`src/i18n.js`](file:///home/ruisantos/Projects/pitfall/src/i18n.js)
- PT/EN dictionary (69 keys per language) + `localStorage` preferences (`pitfall3d-settings`: `{ lang, showHelp, highScore }`).
- Static HTML uses `data-i18n` (text), `data-i18n-aria` (`aria-label`) and `data-i18n-title` (`title`); `setLanguage()` reapplies everything and adjusts `<html lang>`.
- OPTIONS menu has a language selector (🇧🇷/🇺🇸) and an `ON-SCREEN HELP` toggle (`setShowHelp`); sound/CRT/touch toggle labels are reapplied via `HUD.refreshOptionsLabels(player)`.
- High score (`highScore`) recorded via `submitScore()` only at game over (arcade standard), shown on the start menu (`#highscore-display`) and the game-over screen (`#final-highscore` + `#new-record` badge); `Game.backToMenu()` returns to the menu re-showing the main view.

#### [`src/audio.js`](file:///home/ruisantos/Projects/pitfall/src/audio.js)
- File-free audio engine. Methods:
  - `playSteps(notes, volume, delay)`: TIA-style helper — square wave with stepped pitch (`notes = [[freqHz, durSec], ...]`).
  - The 6 classic effects were re-synthesized from spectral analysis of the authentic Atari 2600 sounds (ref. meatfighter/pitfall-js, no files copied):
  - `playJump()`: ascending square sweep 300→420→525→700Hz (~0.2s).
  - `playTreasure()`: noise snap + 140/175/210Hz square arpeggio (~0.65s).
  - `playTarzanYell()`: 100Hz growl + alternating 175/210Hz yodel (~1.9s) on vine grab.
  - `playTrip()`: harsh descending buzz 700→80Hz + noise (~0.4s, kneel).
  - `playSink()`: two low steps 80→140Hz (~0.4s, pit fall).
  - `playLifeLost()` & `playGameOver()`: original death jingle 140→80→140→100Hz (~2.1s).
  - `playChomp()` & `playCrocSnap()`: filtered white noise for bite and fang snap.
  - `playQuicksandRumble()`, `playGroundThud()`: original effects for the zipper quicksand.

---

## 🛠️ Commands & Workflow Guide

To test or develop:

```bash
# Start the development server
make run          # runs 'npx vite --port 5173 --host'

# Check production compilation and bundle
make build        # runs 'npm run build'

# Generate standalone single-file HTML (no external dependencies)
make deploy       # runs 'npm run deploy' (produces dist/pitfall.html and dist/index.html)

# Clean build artifacts
make clean        # removes the dist/ folder

# Test the bundle locally
make preview      # runs 'npm run preview'
```

## 🌐 Publishing (GitHub Pages)

- Push to `main` triggers `.github/workflows/pages.yml`: `npm run deploy` generates the single-file `dist/index.html` and publishes it at **https://ruisantos78.github.io/pitfall3d/**.
- Since the bundle is 100% self-contained (inlined JS/CSS), there is no base path issue.

---

## 💡 Important Tips for Future Agents

- **Always verify the build with `npm run build`** after changing JavaScript files.
- **Don't change HUD message orientation**: remember the player runs forward (direction `-Z`). Any tip about approaching the crocodile's eyes must say to move **forward**, never backward.
- **Keep user-facing texts bilingual**: the game supports PT/EN via `src/i18n.js` — never hardcode user-visible strings; add a dictionary key in both languages instead.
