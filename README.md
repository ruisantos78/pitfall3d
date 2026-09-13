# 🕹️ ATARI PITFALL 3D - First-Person Edition (FPS)

**▶ Play online: https://ruisantos78.github.io/pitfall3d/**

A **first-person (FPS)** recreation of the timeless Atari 2600 classic **Pitfall!**, built with Three.js and a retro cube/voxel aesthetic that simulates three-dimensional pixels.

---

## ⚖️ Legal Notice — Fan Work, Non-Commercial

> **Pitfall!** and all related trademarks, characters, and intellectual property are the exclusive property of **Activision Publishing, Inc.** This project is an **independent fan recreation** created for educational and hobbyist purposes only. It is **not affiliated with, endorsed by, or sponsored by Activision** in any way.
>
> - No original Activision assets (graphics, audio, code) were copied or reverse-engineered. All visuals are original voxel art; all audio is synthesized from scratch via the Web Audio API.
> - This project is **strictly non-commercial**: it is free to play, generates no revenue, and is distributed with no charge.
> - If you are a rights holder and have concerns about this project, please open a GitHub issue or contact the repository owner directly.

---

## 🎮 Original Controls & Mechanics

Just like in the original Atari 2600 game:
- **Straight-Line Movement (1D):** The player only moves **FORWARD** or **BACKWARD** along the jungle corridor (no sideways strafing).
  - `[W]` or `[Up Arrow]` or touch button: **Walk Forward**
  - `[S]` or `[Down Arrow]` or touch button: **Walk Backward**
- **Single Action Button:**
  - `[Space]`, `[Enter]` or `[Mouse Click / Button Tap]`:
    - On the ground: **JUMP** over obstacles (logs, campfires, scorpions).
    - Grabbing the vine: **LET GO OF THE VINE**, launching Harry through the air with the swing's momentum to cross the chasm!
- **Automatic Vine:** When jumping or getting close to the vine swinging over quicksand or a crocodile pit, Harry **grabs the vine automatically**, reproducing the classic 8-bit Tarzan yell!
- **Tree Corridor:** Dense rows of stylized cube trees on the sides form a continuous jungle corridor with an overhead canopy.
- **Crocodiles:** Can be used as stepping stones to cross ponds, **but only while their mouths are closed**! If a mouth opens, Harry gets bitten!
- **Logs:** Rolling and stationary logs. Tripping on them costs points.
- **Treasures:** Voxel Gold Bars, Silver Bars, Diamond Rings and Money Bags ($) to rescue.
- **Retro HUD:** Score (starts at 2000), 20-minute countdown timer, lives indicator and current screen.
- **CRT Filter:** Toggleable scanlines, vignette and retro phosphor effect.
- **8-bit Web Audio Synthesizer:** Self-contained sound effects with no external files needed (jump, vine/yodel, bite, sinking, treasures, footsteps).

---

## 🚀 How to Run

### Using the Makefile:
```bash
# Start the game (launches the server and opens the browser automatically)
make

# Or specifying the command:
make run

# Other useful commands:
make install    # Install npm dependencies
make build      # Generate optimized production build
make preview    # Test the production build locally
make deploy     # Generate a single standalone HTML file for offline play
make clean      # Clean the dist folder
make help       # See all available commands
```

### Using npm directly:
```bash
npm run dev
# Or for build:
npm run build
npm run preview
```
