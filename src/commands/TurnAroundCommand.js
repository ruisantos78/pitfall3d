import { Command } from './Command.js';
import { audio } from '../audio.js';

export class TurnAroundCommand extends Command {
  constructor(player) {
    super();
    this.player = player;
  }

  execute() {
    if (!this.player || this.player.isGameOver) return;
    audio.init();
    this.player.targetRotY = this.player.targetRotY === 0 ? Math.PI : 0;
  }
}
