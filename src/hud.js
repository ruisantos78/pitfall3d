// Atari 2600 Pitfall HUD & UI Management
import { audio } from './audio.js';
import { t, getShowHelp, getHighScore } from './i18n.js';

export class HUD {
  constructor() {
    this.scoreEl = document.getElementById('score-display');
    this.timerEl = document.getElementById('timer-display');
    this.livesEl = document.getElementById('lives-display');
    this.screenEl = document.getElementById('screen-display');
    this.treasuresEl = document.getElementById('treasure-display');
    this.compassUp = document.getElementById('compass-up');
    this.compassDown = document.getElementById('compass-down');
    this.recordEl = document.getElementById('record-display');
    this.crtOverlay = document.getElementById('crt-overlay');
    this.btnSound = document.getElementById('btn-sound');
    this.btnCrt = document.getElementById('btn-crt');
    this.btnFullscreen = document.getElementById('btn-fullscreen');

    this.rearLogPromptEl = document.getElementById('rear-log-prompt');
    this.rearLogBarEl = document.getElementById('rear-log-bar');

    this.crtEnabled = true;
    this.lastJumpCue = 0;
    this.initControls();
  }

  // Swaps icon + text while preserving the button spans (.btn-ico/.btn-txt).
  setToggleLabel(btn, icon, text) {
    if (!btn) return;
    const ico = btn.querySelector('.btn-ico');
    const txt = btn.querySelector('.btn-txt');
    if (ico) ico.textContent = icon;
    if (txt) txt.textContent = ` ${text}`;
    if (!ico && !txt) btn.textContent = `${icon} ${text}`;
  }

  initControls() {
    if (this.btnSound) {
      this.btnSound.addEventListener('click', () => {
        audio.toggle();
        this.refreshOptionsLabels();
      });
    }

    if (this.btnCrt) {
      this.btnCrt.addEventListener('click', () => {
        this.crtEnabled = !this.crtEnabled;
        if (this.crtEnabled) {
          this.crtOverlay.classList.remove('crt-off');
        } else {
          this.crtOverlay.classList.add('crt-off');
        }
        this.refreshOptionsLabels();
      });
    }

    if (this.btnFullscreen) {
      this.btnFullscreen.addEventListener('click', () => {
        this.toggleFullscreen();
      });
      document.addEventListener('fullscreenchange', () => {
        this.refreshOptionsLabels();
      });
    }
  }

  isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  // Fullscreen toggle for desktop and Xbox Edge (must run on user gesture).
  async toggleFullscreen() {
    try {
      if (this.isFullscreen()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else {
        const el = document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      }
    } catch {
      // Fullscreen denied (iframe permissions, Xbox kiosk mode, etc.): stay windowed.
    }
    this.refreshOptionsLabels();
  }

  // Reapplies toggle labels in the current language (e.g. after switching PT/EN)
  refreshOptionsLabels(player = null) {
    this.setToggleLabel(this.btnSound, audio.enabled ? '🔊' : '🔇', t(audio.enabled ? 'opt.soundOn' : 'opt.soundOff'));
    this.setToggleLabel(this.btnCrt, '📺', t(this.crtEnabled ? 'opt.crtOn' : 'opt.crtOff'));
    this.setToggleLabel(this.btnFullscreen, '⛶', t(this.isFullscreen() ? 'opt.fullscreenOn' : 'opt.fullscreenOff'));
    if (player && typeof player.refreshTouchLabel === 'function') {
      player.refreshTouchLabel();
    }
  }

  update(player, currentScreenIndex, world) {
    // Reset the alert icon styling first (it must never leak into text messages).
    if (this.crocTextEl) {
      this.crocTextEl.style.fontSize = '';
      this.crocTextEl.style.color = '';
    }
    // 1. Score
    if (this.scoreEl) {
      this.scoreEl.textContent = String(Math.max(0, player.score)).padStart(6, '0');
    }

    // 2. Timer (MM:SS)
    if (this.timerEl) {
      const minutes = Math.floor(player.timeRemaining / 60);
      const seconds = Math.floor(player.timeRemaining % 60);
      this.timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // 3. Lives Icons
    if (this.livesEl) {
      let iconsHtml = '';
      for (let i = 0; i < player.lives; i++) {
        iconsHtml += '<span class="life-icon">▲</span>';
      }
      this.livesEl.innerHTML = iconsHtml;
    }

    // 4. Screen Number (phase 001..255 looping)
    if (this.screenEl) {
      const phase = ((currentScreenIndex % 255) + 255) % 255 + 1;
      this.screenEl.textContent = String(phase).padStart(3, '0');
    }

    // 4b. Heading arrows right of the phase number: current direction
    // green, opposite direction light gray.
    if (this.compassUp && this.compassDown) {
      const north = player.targetRotY === 0;
      this.compassUp.style.color = north ? '#7dd87d' : '#9aa0a8';
      this.compassDown.style.color = north ? '#9aa0a8' : '#7dd87d';
    }

    // 5. Treasures
    if (this.treasuresEl) {
      this.treasuresEl.textContent = `${player.treasuresCollected}`;
    }

    // 5b. High score (above the gem counter)
    if (this.recordEl) {
      this.recordEl.textContent = String(getHighScore()).padStart(6, '0');
    }

    // Rear-log aid: Expanding striped bar (zebra pattern).
    // Completely independent visual element.
    const threat = world ? world.nearestLogThreat : null;
    if (
      threat && !player.inTunnel && !player.climbing && !player.attachedVine &&
      player.targetRotY !== 0 &&
      threat.logZ < player.z && threat.t <= 3.6
    ) {
      if (this.rearLogPromptEl && this.rearLogBarEl) {
        this.rearLogPromptEl.style.display = 'block';
        const progress = Math.max(0, Math.min(1, 1 - (threat.t / 3.6)));
        const barWidth = 10 + progress * 90; // Grows smoothly from 10% to 100% of container
        this.rearLogBarEl.style.width = `${barWidth}%`;
      }
      if (threat.t <= 0.7 && player.isGrounded) {
        const now = performance.now();
        if (now - this.lastJumpCue > 500) {
          audio.playJumpCue();
          this.lastJumpCue = now;
        }
      }
    } else {
      if (this.rearLogPromptEl) {
        this.rearLogPromptEl.style.display = 'none';
      }
    }
  }
}
