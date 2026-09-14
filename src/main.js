// Atari Pitfall 3D - First Person (FPS) Edition
// Main Entry Point
import * as THREE from 'three';
import { audio } from './audio.js';
import { World, SCREEN_LENGTH } from './world.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { t, getLanguage, setLanguage, getShowHelp, setShowHelp, getHighScore, applyStaticTexts } from './i18n.js';

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
    // Debug hook (dev only): lets headless perf probes inspect the live game.
    if (import.meta.env.DEV) window.__game = this;
    requestAnimationFrame(this.animate);
  }

  initScene() {
    // 1. Scene & Atari 2600 Jungle Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3888c8); // Atari bright jungle sky
    // Fog blending the corridor into the deep jungle (soft haze matching the sky)
    this.scene.fog = new THREE.Fog(0x8fb8c8, 30, 95);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      150
    );

    // 3. Renderer (coarse pointers = phones/tablets: no MSAA, capped
    // pixel ratio and shadows — the fragment load is what melts mobile GPUs)
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !coarse, // smooth voxel edges on desktop only
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // 4. Lighting: soft jungle lighting
    const ambientLight = new THREE.AmbientLight(0xd8ecd0, 1.0);
    this.scene.add(ambientLight);

    // Hemisphere fill for smooth sky-to-ground transitions
    const hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x2e5a24, 0.55);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffae0, 1.5);
    sunLight.position.set(15, 30, 20);
    sunLight.castShadow = true;
    const coarseShadow = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    sunLight.shadow.mapSize.set(coarseShadow ? 1024 : 2048, coarseShadow ? 1024 : 2048);
    sunLight.shadow.camera.left = -25;
    sunLight.shadow.camera.right = 25;
    sunLight.shadow.camera.top = 25;
    sunLight.shadow.camera.bottom = -25;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 90;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);
    this.scene.add(sunLight.target);
    this.sunLight = sunLight;

    const backLight = new THREE.DirectionalLight(0x408040, 0.5);
    backLight.position.set(-15, 20, -20);
    this.scene.add(backLight);
  }

  initWorld() {
    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.scene);

    // Pre-generate initial screens (Screen 0, 1, 2) synchronously behind the menu
    for (let i = 0; i <= 2; i++) this.world.getOrCreateScreen(i);
  }

  initHUD() {
    this.hud = new HUD();
  }

  bindEvents() {
    const handleResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    
    // On mobile, the browser bar appears/disappears without triggering a classic resize event
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    const startBtn = document.getElementById('start-btn');
    const startOverlay = document.getElementById('start-overlay');
    const restartBtn = document.getElementById('restart-btn');
    const menuBtn = document.getElementById('menu-btn');
    const optionsBtn = document.getElementById('options-btn');
    const optionsBackBtn = document.getElementById('options-back-btn');
    const menuMain = document.getElementById('menu-main');
    const menuOptions = document.getElementById('menu-options');
    const optionsMenu = document.getElementById('options-menu');

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

    // Options menu: toggles views without starting the game
    const showOptions = (show) => {
      if (menuMain) menuMain.classList.toggle('hidden', show);
      if (menuOptions) menuOptions.classList.toggle('hidden', !show);
    };

    if (optionsBtn) {
      optionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showOptions(true);
      });
    }

    if (optionsBackBtn) {
      optionsBackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showOptions(false);
      });
    }

    // Clicks on toggles (sound/CRT/touch) must not start the game
    if (optionsMenu) {
      optionsMenu.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Options: language (PT/EN) and on-screen help, persisted in the browser
    this.btnLangPt = document.getElementById('btn-lang-pt');
    this.btnLangEn = document.getElementById('btn-lang-en');
    this.btnHelp = document.getElementById('btn-help');

    if (this.btnLangPt) {
      this.btnLangPt.addEventListener('click', () => this.switchLanguage('pt'));
    }
    if (this.btnLangEn) {
      this.btnLangEn.addEventListener('click', () => this.switchLanguage('en'));
    }
    if (this.btnHelp) {
      this.btnHelp.addEventListener('click', () => {
        setShowHelp(!getShowHelp());
        this.refreshOptionsUI();
      });
    }

    // Apply saved preferences (language + help) on startup
    this.refreshOptionsUI();

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

    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.backToMenu();
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
          // When the options menu is open, the keyboard must not start the game
          const optionsOpen = menuOptions && !menuOptions.classList.contains('hidden');
          if (!optionsOpen && ['Space', 'Enter', 'KeyW', 'ArrowUp'].includes(e.code)) {
            startGame();
          }
        }
      }
    });
  }

  switchLanguage(lang) {
    setLanguage(lang);
    this.refreshOptionsUI();
  }

  // Syncs all options UI with saved preferences
  refreshOptionsUI() {
    applyStaticTexts();
    document.documentElement.lang = getLanguage() === 'pt' ? 'pt-BR' : 'en';
    if (this.hud) this.hud.refreshOptionsLabels(this.player);
    const highscoreDisplay = document.getElementById('highscore-display');
    if (highscoreDisplay) highscoreDisplay.textContent = String(getHighScore()).padStart(6, '0');
    if (this.btnLangPt) this.btnLangPt.classList.toggle('active', getLanguage() === 'pt');
    if (this.btnLangEn) this.btnLangEn.classList.toggle('active', getLanguage() === 'en');
    if (this.btnHelp) {
      const txt = this.btnHelp.querySelector('.btn-txt');
      const label = t(getShowHelp() ? 'opt.helpOn' : 'opt.helpOff');
      if (txt) txt.textContent = ` ${label}`;
      else this.btnHelp.textContent = `💡 ${label}`;
    }
  }
  restartGame() {
    // Reset player
    this.player.reset();

    this.rebuildWorld();

    this.isRunning = true;
    this.lastTime = performance.now();
  }

  // Return to the main menu (after game over)
  backToMenu() {
    this.player.reset();
    this.rebuildWorld();

    this.isRunning = false;
    this.lastTime = performance.now();

    // Always reopens on the main menu view
    const menuMain = document.getElementById('menu-main');
    const menuOptions = document.getElementById('menu-options');
    if (menuMain) menuMain.classList.remove('hidden');
    if (menuOptions) menuOptions.classList.add('hidden');

    const startOverlay = document.getElementById('start-overlay');
    if (startOverlay) startOverlay.classList.remove('hidden');

    this.refreshOptionsUI();
  }

  // Removes current screens and regenerates from scratch (used on restart and back-to-menu)
  rebuildWorld() {
    for (const [idx, screen] of this.world.screens.entries()) {
      this.scene.remove(screen.group);
      this.world.removeScreenEntities(screen);
    }
    this.world.screens.clear();
    this.world.updateVisibleScreens(0);
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
      // Player position drives the pooled-light assignment (tunnel lights only
      // compete for slots while Harry is underground; surface lights only
      // while he is up there). Facing drives the ladder wall side.
      this.world.update(delta, this.player.z, this.player.inTunnel, this.player.climbing, this.player.targetRotY === 0, this.player.vz);

      // 2. Update First-Person Player Physics & Actions
      this.player.update(delta, this.world);

      // 3. Update Current Screen Index based on Player Z
      const currentScreenIndex = Math.floor(-this.player.z / SCREEN_LENGTH);
      // Prefetch the screen after next while approaching the checkpoint (~2s
      // ahead at full speed): the boundary-crossing frame then builds nothing.
      const nextBoundaryZ = -(currentScreenIndex + 1) * SCREEN_LENGTH;
      if (this.player.z - nextBoundaryZ < 18) {
        this.world.prefetchScreen(currentScreenIndex + 2);
      }
      this.world.updateVisibleScreens(currentScreenIndex);

      // 4. Update HUD
      this.hud.update(this.player, currentScreenIndex, this.world);

      // 5. Keep sun/shadow frustum following the player down the corridor
      this.sunLight.position.set(15, 30, this.player.z + 20);
      this.sunLight.target.position.set(0, 0, this.player.z);
      this.sunLight.target.updateMatrixWorld();
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
