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

    this.crocPromptEl = document.getElementById('croc-prompt');
    this.crocTextEl = document.getElementById('croc-status-text');

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
  }

  // Reapplies toggle labels in the current language (e.g. after switching PT/EN)
  refreshOptionsLabels(player = null) {
    this.setToggleLabel(this.btnSound, audio.enabled ? '🔊' : '🔇', t(audio.enabled ? 'opt.soundOn' : 'opt.soundOff'));
    this.setToggleLabel(this.btnCrt, '📺', t(this.crtEnabled ? 'opt.crtOn' : 'opt.crtOff'));
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

    if (player.isTripped && this.crocPromptEl) {
      // Faceplant notice only when on-screen help is enabled.
      if (!getShowHelp()) {
        this.crocPromptEl.className = 'hud-box croc-status';
        return;
      }
      this.crocPromptEl.className = 'hud-box croc-status danger';
      if (this.crocTextEl) {
        this.crocTextEl.textContent = t('hint.tripped');
      }
      return;
    }

    // Rear-log aid, inverted facing only: warning triangle (no text),
    // colored by proximity — yellow → orange → red as impact nears.
    // Single purpose: rear logs while facing south. Nothing else uses it.
    // (No vz gate: the interception time only exists when the log WILL reach
    // you — standing still, walking back (S) or tripping into its path all
    // count. A vz > 0.5 gate hid exactly those deaths.)
    const threat = world ? world.nearestLogThreat : null;
    if (
      threat && !player.inTunnel && !player.climbing && !player.attachedVine &&
      player.targetRotY !== 0 &&
      threat.logZ < player.z && threat.t <= 3.6
    ) {
      // Text-presentation triangle (recolorable): yellow far, orange near, red now.
      const alertColor = threat.t > 2.4 ? '#f8d820' : (threat.t > 1.2 ? '#f87800' : '#ff2200');
      this.crocPromptEl.className = 'hud-box croc-status danger';
      if (this.crocTextEl) {
        this.crocTextEl.textContent = '⚠';
        this.crocTextEl.style.fontSize = '28px';
        this.crocTextEl.style.color = alertColor;
      }
      if (threat.t <= 0.7 && player.isGrounded) {
        const now = performance.now();
        if (now - this.lastJumpCue > 500) {
          audio.playJumpCue();
          this.lastJumpCue = now;
        }
      }
      return;
    }

    // Contextual help messages (hideable via the ON-SCREEN HELP option)
    if (!getShowHelp()) {
      if (this.crocPromptEl) this.crocPromptEl.className = 'hud-box croc-status';
      return;
    }

    // 6. Crocodile Danger / Safe Indicator
    if (this.crocPromptEl && world && world.activeCrocodiles) {
      let nearestCroc = null;
      let minDistance = Infinity;

      for (const crocData of world.activeCrocodiles) {
        const dist = Math.abs(player.z - crocData.z);
        if (dist < minDistance) {
          minDistance = dist;
          nearestCroc = crocData;
        }
      }

      // If within 15 units of a crocodile
      if (nearestCroc && minDistance < 15) {
        // Check if player is currently standing on this crocodile
        const isStandingOnThisCroc = player.isGrounded && Math.abs(player.y - 0.35) < 0.25 && (player.z >= nearestCroc.z - 1.2 && player.z <= nearestCroc.z + 2.8);

        if (isStandingOnThisCroc) {
          if (player.z <= nearestCroc.z + 0.65) {
            // ON THE EYES! 100% SAFE - THE CLASSIC ATARI STRATEGY!
            this.crocPromptEl.className = 'hud-box croc-status eye-safe';
            if (this.crocTextEl) {
              this.crocTextEl.textContent = t('hint.eyeSafe');
            }
          } else {
            // ON THE SNOUT
            this.crocPromptEl.className = 'hud-box croc-status safe';
            if (this.crocTextEl) {
              this.crocTextEl.textContent = t('hint.snout');
            }
          }
        } else {
          if (nearestCroc.isOpen) {
            this.crocPromptEl.className = 'hud-box croc-status danger';
            if (this.crocTextEl) {
              this.crocTextEl.textContent = t('hint.mouthOpen');
            }
          } else {
            this.crocPromptEl.className = 'hud-box croc-status safe';
            if (this.crocTextEl) {
              this.crocTextEl.textContent = t('hint.mouthClosed');
            }
          }
        }
      } else {
        // No crocodile nearby: check quicksand, falling logs and scorpion.
          let shown = false;

          if (world.activeOpeningPits && world.activeOpeningPits.length > 0) {
            let nearestPit = null;
            let minPitDist = Infinity;
            for (const pitData of world.activeOpeningPits) {
              const dist = Math.abs(player.z - pitData.z);
              if (dist < minPitDist) {
                minPitDist = dist;
                nearestPit = pitData;
              }
            }

            if (nearestPit && minPitDist < 14) {
              shown = true;
              if (nearestPit.phase === 'closing') {
                this.crocPromptEl.className = 'hud-box croc-status safe';
                if (this.crocTextEl) {
                  this.crocTextEl.textContent = t('hint.zipClosing');
                }
              } else if (nearestPit.phase === 'opening') {
                this.crocPromptEl.className = 'hud-box croc-status danger';
                if (this.crocTextEl) {
                  this.crocTextEl.textContent = t('hint.zipOpening');
                }
              } else if (nearestPit.isOpen) {
                this.crocPromptEl.className = 'hud-box croc-status danger';
                if (this.crocTextEl) {
                  this.crocTextEl.textContent = t('hint.zipOpen');
                }
              } else {
                this.crocPromptEl.className = 'hud-box croc-status safe';
                if (this.crocTextEl) {
                  this.crocTextEl.textContent = t('hint.zipClosed');
                }
              }
            }
          }

          // Falling/rolling logs nearby (fall zone marked on the ground).
          if (!shown && world.activeRollingLogs && world.activeRollingLogs.length > 0) {
            let minLogDist = Infinity;
            for (const logData of world.activeRollingLogs) {
              const dist = Math.abs(player.z - logData.z);
              if (dist < minLogDist) minLogDist = dist;
            }
            if (minLogDist < 14) {
              shown = true;
              this.crocPromptEl.className = 'hud-box croc-status danger';
              if (this.crocTextEl) {
                this.crocTextEl.textContent = t('hint.fallingLog');
              }
            }
          }

          if (!shown && world.activeHazards && world.activeHazards.some(h => h.type === 'scorpion')) {
            let nearestScorpion = null;
            let minScorpionDist = Infinity;
            for (const h of world.activeHazards) {
              if (h.type === 'scorpion') {
                // Only warn about a scorpion on the same level (tunnel or surface)
                const hy = h.baseY ?? 0.08;
                if (Math.abs(player.y - hy) > 3) continue;
                const dist = Math.abs(player.z - h.z);
                if (dist < minScorpionDist) {
                  minScorpionDist = dist;
                  nearestScorpion = h;
                }
              }
            }

            if (nearestScorpion && minScorpionDist < 14) {
              shown = true;
              this.crocPromptEl.className = 'hud-box croc-status danger';
              if (this.crocTextEl) {
                this.crocTextEl.textContent = t('hint.scorpion');
              }
            }
          }

          if (!shown) {
            this.crocPromptEl.className = 'hud-box croc-status';
          }
        }
    }
  }
}
