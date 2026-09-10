// Atari 2600 Pitfall HUD & UI Management
import { audio } from './audio.js';

export class HUD {
  constructor() {
    this.scoreEl = document.getElementById('score-display');
    this.timerEl = document.getElementById('timer-display');
    this.livesEl = document.getElementById('lives-display');
    this.screenEl = document.getElementById('screen-display');
    this.treasuresEl = document.getElementById('treasure-display');
    this.crtOverlay = document.getElementById('crt-overlay');
    this.btnSound = document.getElementById('btn-sound');
    this.btnCrt = document.getElementById('btn-crt');

    this.crocPromptEl = document.getElementById('croc-prompt');
    this.crocTextEl = document.getElementById('croc-status-text');

    this.crtEnabled = true;
    this.initControls();
  }

  initControls() {
    if (this.btnSound) {
      this.btnSound.addEventListener('click', () => {
        const enabled = audio.toggle();
        this.btnSound.textContent = enabled ? '🔊 SOM: LIGADO' : '🔇 SOM: DESLIGADO';
      });
    }

    if (this.btnCrt) {
      this.btnCrt.addEventListener('click', () => {
        this.crtEnabled = !this.crtEnabled;
        if (this.crtEnabled) {
          this.crtOverlay.classList.remove('crt-off');
          this.btnCrt.textContent = '📺 CRT: ON';
        } else {
          this.crtOverlay.classList.add('crt-off');
          this.btnCrt.textContent = '📺 CRT: OFF';
        }
      });
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

    if (player.isTripped && this.crocPromptEl) {
      this.crocPromptEl.className = 'hud-box croc-status danger';
      if (this.crocTextEl) {
        this.crocTextEl.textContent = '💥 VOCÊ CAIU DE CARA! PRESSIONE W/↑ OU S/↓ PARA LEVANTAR';
      }
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
        const isStandingOnThisCroc = player.isGrounded && Math.abs(player.y - 0.35) < 0.25 && (player.z >= nearestCroc.z - 3.3 && player.z <= nearestCroc.z + 3.9);

        if (isStandingOnThisCroc) {
          if (player.z <= nearestCroc.z + 0.8) {
            // ON THE EYES! 100% SAFE - THE CLASSIC ATARI STRATEGY!
            this.crocPromptEl.className = 'hud-box croc-status eye-safe';
            if (this.crocTextEl) {
              this.crocTextEl.textContent = '👁️ SOBRE OS OLHOS: 100% SEGURO! (A BOCA NÃO TE PEGA)';
            }
          } else {
            // ON THE SNOUT
            this.crocPromptEl.className = 'hud-box croc-status safe';
            if (this.crocTextEl) {
              this.crocTextEl.textContent = '🐊 NO FOCINHO: AVANCE PARA OS OLHOS PARA FICAR SEGURO!';
            }
          }
        } else {
          if (nearestCroc.isOpen) {
            this.crocPromptEl.className = 'hud-box croc-status danger';
            if (this.crocTextEl) {
              this.crocTextEl.textContent = '⚠️ BOCA ABERTA: NÃO PISE NO FOCINHO! PULE DIRETO NOS OLHOS!';
            }
          } else {
            this.crocPromptEl.className = 'hud-box croc-status safe';
            if (this.crocTextEl) {
              this.crocTextEl.textContent = '🐊 BOCA FECHADA! PULE NOS OLHOS OU NA CABEÇA!';
            }
          }
        }
      } else if (world.activeOpeningPits && world.activeOpeningPits.length > 0) {
        // Check nearest disappearing quicksand hole
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
          if (nearestPit.isOpen) {
            this.crocPromptEl.className = 'hud-box croc-status danger';
            if (this.crocTextEl) {
              this.crocTextEl.textContent = '⚠️ AREIA MOVEDIÇA ABERTA! LONGA DEMAIS PARA PULAR - AGUARDE!';
            }
          } else {
            this.crocPromptEl.className = 'hud-box croc-status safe';
            if (this.crocTextEl) {
              this.crocTextEl.textContent = '⏳ AREIA MOVEDIÇA FECHADA: CORRA AGORA!';
            }
          }
        } else {
          this.crocPromptEl.className = 'hud-box croc-status';
        }
      } else if (world.activeHazards && world.activeHazards.some(h => h.type === 'scorpion')) {
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
          this.crocPromptEl.className = 'hud-box croc-status danger';
          if (this.crocTextEl) {
            this.crocTextEl.textContent = '🦂 ESCORPIÃO VENENOSO À FRENTE! PULE PARA SUPERAR!';
          }
        } else {
          this.crocPromptEl.className = 'hud-box croc-status';
        }
      } else {
        this.crocPromptEl.className = 'hud-box croc-status';
      }
    }
  }
}
