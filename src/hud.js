// Atari 2600 Pitfall HUD & UI Management
import { audio } from './audio.js';
import { t } from './i18n.js';
import { getShowHelp, getHighScore } from './settings.js';

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
    // Cached DOM values: HUD.update runs every frame, but DOM writes trigger
    // style/layout work, so each field is only touched when its value changes.
    this._lastScore = -1;
    this._lastTimeText = '';
    this._lastLives = -1;
    this._lastScreen = -1;
    this._lastTreasures = -1;
    this._lastRecord = -1;
    this._lastNorth = null;
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
    // 1. Score (only on change)
    const score = Math.max(0, Math.floor(player.score));
    if (this.scoreEl && score !== this._lastScore) {
      this._lastScore = score;
      this.scoreEl.textContent = String(score).padStart(6, '0');
    }

    // 2. Timer (MM:SS, only when the visible second changes)
    if (this.timerEl) {
      const totalSec = Math.max(0, Math.ceil(player.timeRemaining));
      const text = `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
      if (text !== this._lastTimeText) {
        this._lastTimeText = text;
        this.timerEl.textContent = text;
      }
    }

    // 3. Lives Icons (rebuild only when the count changes)
    if (this.livesEl && player.lives !== this._lastLives) {
      this._lastLives = player.lives;
      let iconsHtml = '';
      for (let i = 0; i < player.lives; i++) {
        iconsHtml += '<span class="life-icon">▲</span>';
      }
      this.livesEl.innerHTML = iconsHtml;
    }

    // 4. Screen Number (phase 001..255 looping, only on change)
    if (this.screenEl) {
      const phase = ((currentScreenIndex % 255) + 255) % 255 + 1;
      if (phase !== this._lastScreen) {
        this._lastScreen = phase;
        this.screenEl.textContent = String(phase).padStart(3, '0');
      }
    }

    // 4b. Heading arrows: recolor only when the direction flips.
    if (this.compassUp && this.compassDown) {
      const north = player.targetRotY === 0;
      if (north !== this._lastNorth) {
        this._lastNorth = north;
        this.compassUp.style.color = north ? '#7dd87d' : '#9aa0a8';
        this.compassDown.style.color = north ? '#9aa0a8' : '#7dd87d';
      }
    }

    // 5. Treasures (only on change)
    if (this.treasuresEl && player.treasuresCollected !== this._lastTreasures) {
      this._lastTreasures = player.treasuresCollected;
      this.treasuresEl.textContent = `${player.treasuresCollected}`;
    }

    // 5b. High score (only on change)
    if (this.recordEl) {
      const record = getHighScore();
      if (record !== this._lastRecord) {
        this._lastRecord = record;
        this.recordEl.textContent = String(record).padStart(6, '0');
      }
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
