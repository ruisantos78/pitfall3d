import { Command } from './Command.js';
import { DEBUG_GOD_MODE } from '../debug.js';
import { audio } from '../audio.js';

export class DieCommand extends Command {
  constructor(player, reasonKey = 'death.lifeLost') {
    super();
    this.player = player;
    this.reasonKey = reasonKey;
  }

  execute() {
    const p = this.player;
    if (p.isDying || p.isGameOver) return;
    p.isDying = true;

    if (DEBUG_GOD_MODE) {
      p.deathTimer = 0.5;
    } else {
      p.deathTimer = 1.2;
      p.lives--;
    }

    p.deathReasonKey = this.reasonKey;
    p.diedInTunnel = p.inTunnel;
    p.crocBiteGraceTimer = 0;
    p.warp = null;

    const fade = document.getElementById('death-fade');
    if (fade) fade.classList.add('on');

    if (p.attachedVine) {
      p.attachedVine = null;
      p.ignoredVine = null;
      if (p.arms && p.arms.gripBar) p.arms.gripBar.visible = false;
      const prompt = document.getElementById('vine-prompt');
      if (prompt) prompt.classList.remove('active');
    }

    if (p.lives <= 0) {
      p.lives = 0;
      p.isGameOver = true;
      audio.playGameOver();
      setTimeout(() => {
        p.triggerGameOver();
      }, 1000);
    } else {
      audio.playLifeLost();
    }
  }
}
