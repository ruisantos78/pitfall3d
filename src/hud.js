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
    this.recordEl = document.getElementById('record-display');
    this.crtOverlay = document.getElementById('crt-overlay');
    this.btnSound = document.getElementById('btn-sound');
    this.btnCrt = document.getElementById('btn-crt');

    this.crocPromptEl = document.getElementById('croc-prompt');
    this.crocTextEl = document.getElementById('croc-status-text');

    this.crtEnabled = true;
    this.initControls();
  }

  // Troca ícone + texto preservando os spans (.btn-ico/.btn-txt) do botão.
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

  // Reaplica os rótulos dos toggles no idioma atual (ex.: após trocar PT/EN)
  refreshOptionsLabels(player = null) {
    this.setToggleLabel(this.btnSound, audio.enabled ? '🔊' : '🔇', t(audio.enabled ? 'opt.soundOn' : 'opt.soundOff'));
    this.setToggleLabel(this.btnCrt, '📺', t(this.crtEnabled ? 'opt.crtOn' : 'opt.crtOff'));
    if (player && typeof player.refreshTouchLabel === 'function') {
      player.refreshTouchLabel();
    }
  }

  update(player, currentScreenIndex, world) {
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

    // 4. Screen Number
    if (this.screenEl) {
      this.screenEl.textContent = String(currentScreenIndex + 1).padStart(3, '0');
    }

    // 5. Treasures
    if (this.treasuresEl) {
      this.treasuresEl.textContent = `${player.treasuresCollected}`;
    }

    // 5b. Recorde (acima do contador de gemas)
    if (this.recordEl) {
      this.recordEl.textContent = String(getHighScore()).padStart(6, '0');
    }

    if (player.isTripped && this.crocPromptEl) {
      this.crocPromptEl.className = 'hud-box croc-status danger';
      if (this.crocTextEl) {
        this.crocTextEl.textContent = t('hint.tripped');
      }
      return;
    }

    // Mensagens de ajuda contextuais (ocultáveis na opção AJUDA NA TELA)
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
        const isStandingOnThisCroc = player.isGrounded && Math.abs(player.y - 0.35) < 0.25 && (player.z >= nearestCroc.z - 1.6 && player.z <= nearestCroc.z + 3.9);

        if (isStandingOnThisCroc) {
          if (player.z <= nearestCroc.z + 0.8) {
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
        // Sem crocodilo por perto: checa areia movediça, troncos caindo e escorpião.
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

          // Troncos caindo/rolando por perto (zona de queda sinalizada no chão).
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
