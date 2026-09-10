// Atari Pitfall 3D - First Person (FPS) Edition
// Main Entry Point
import * as THREE from 'three';
import { audio } from './audio.js';
import { World, SCREEN_LENGTH } from './world.js';
import { Player } from './player.js';
import { HUD } from './hud.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.lastTime = performance.now();
    this.isRunning = false;

    this.initScene();
    this.initWorld();
    this.initHUD();
    this.bindEvents();

    // Start render loop (render backdrop while paused)
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initScene() {
    // 1. Scene & Atari 2600 Jungle Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3888c8); // Atari bright jungle sky
    // Fog blending the corridor into the deep jungle
    this.scene.fog = new THREE.Fog(0x204820, 25, 85);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      150
    );

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false, // sharper retro pixel edges!
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 4. Lighting: Crisp arcade lighting
    const ambientLight = new THREE.AmbientLight(0xd8ecd0, 1.4);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffae0, 1.6);
    sunLight.position.set(15, 30, 20);
    this.scene.add(sunLight);

    const backLight = new THREE.DirectionalLight(0x408040, 0.6);
    backLight.position.set(-15, 20, -20);
    this.scene.add(backLight);
  }

  initWorld() {
    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.scene);

    // Pre-generate initial screens (Screen 0, 1, 2)
    this.world.updateVisibleScreens(0);
  }

  initHUD() {
    this.hud = new HUD();
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const startBtn = document.getElementById('start-btn');
    const startOverlay = document.getElementById('start-overlay');
    const restartBtn = document.getElementById('restart-btn');

    const startGame = () => {
      if (this.isRunning) return;
      audio.init();
      audio.startAmbient();
      if (startOverlay) startOverlay.classList.add('hidden');
      this.isRunning = true;
      this.lastTime = performance.now();
    };

    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startGame();
      });
    }

    if (startOverlay) {
      startOverlay.addEventListener('click', () => {
        startGame();
      });
    }

    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        this.restartGame();
      });
    }

    // Allow Space or Enter or W or Up arrow to start / restart smoothly
    window.addEventListener('keydown', (e) => {
      if (!this.isRunning) {
        if (this.player && this.player.isGameOver) {
          if (['Space', 'Enter'].includes(e.code)) {
            this.restartGame();
          }
        } else {
          if (['Space', 'Enter', 'KeyW', 'ArrowUp'].includes(e.code)) {
            startGame();
          }
        }
      }
    });
  }

  restartGame() {
    // Reset player
    this.player.reset();

    // Rebuild initial screens
    for (const [idx, screen] of this.world.screens.entries()) {
      this.scene.remove(screen.group);
      this.world.removeScreenEntities(screen);
    }
    this.world.screens.clear();
    this.world.updateVisibleScreens(0);

    this.isRunning = true;
    this.lastTime = performance.now();
  }

  animate() {
    requestAnimationFrame(this.animate);

    const now = performance.now();
    const rawDelta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    // Cap delta to prevent physics glitches if tab is switched
    const delta = Math.min(rawDelta, 0.08);

    if (this.isRunning) {
      // 1. Update Dynamic World Entities (Vines, Logs, Crocodiles, Campfires)
      this.world.update(delta);

      // 2. Update First-Person Player Physics & Actions
      this.player.update(delta, this.world);

      // 3. Update Current Screen Index based on Player Z
      const currentScreenIndex = Math.max(0, Math.floor(-this.player.z / SCREEN_LENGTH));
      this.world.updateVisibleScreens(currentScreenIndex);

      // 4. Update HUD
      this.hud.update(this.player, currentScreenIndex, this.world);
    }

    // Render 3D Scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Start Game Instance
function initGame() {
  new Game();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
