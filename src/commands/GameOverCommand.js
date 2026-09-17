import { Command } from './Command.js';
import { t } from '../i18n.js';
import { submitScore, getHighScore } from '../settings.js';

export class GameOverCommand extends Command {
  constructor(player) {
    super();
    this.player = player;
  }

  execute() {
    const p = this.player;
    const overlay = document.getElementById('gameover-overlay');
    const reasonText = document.getElementById('gameover-reason');
    const finalScore = document.getElementById('final-score');
    const finalScreens = document.getElementById('final-screens');
    const finalTreasures = document.getElementById('final-treasures');
    const newRecordEl = document.getElementById('new-record');
    const finalHighscore = document.getElementById('final-highscore');

    const isNewRecord = submitScore(p.score);

    if (overlay) overlay.classList.remove('hidden');
    if (reasonText) reasonText.textContent = t(p.deathReasonKey || 'death.lifeLost');
    if (newRecordEl) newRecordEl.classList.toggle('hidden', !isNewRecord);
    if (finalHighscore) finalHighscore.textContent = String(getHighScore()).padStart(6, '0');
    if (finalScore) finalScore.textContent = String(p.score).padStart(6, '0');
    if (finalScreens) finalScreens.textContent = Math.floor(Math.abs(p.z) / 60) + 1;
    if (finalTreasures) finalTreasures.textContent = `${p.treasuresCollected}`;

    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
      restartBtn.focus();
      restartBtn.classList.add('menu-focus');
    }
  }
}
