import { Command } from './Command.js';

export class MoveBackwardCommand extends Command {
  constructor(player, isPressed) {
    super();
    this.player = player;
    this.isPressed = isPressed;
  }

  execute() {
    if (!this.player) return;
    this.player.moveBackward = this.isPressed;
  }
}
