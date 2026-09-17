import { Command } from './Command.js';
import { audio } from '../audio.js';

export class ActionJumpCommand extends Command {
  constructor(player, isPressed) {
    super();
    this.player = player;
    this.isPressed = isPressed;
  }

  execute() {
    if (!this.player || this.player.isGameOver) return;
    if (this.isPressed) {
      audio.init();
      if (!this.player.actionPressed) {
        this.player.actionJustPressed = true;
      }
      this.player.actionPressed = true;
    } else {
      this.player.actionPressed = false;
    }
  }
}
