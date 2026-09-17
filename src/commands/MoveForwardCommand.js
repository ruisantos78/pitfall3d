import { Command } from './Command.js';

export class MoveForwardCommand extends Command {
  constructor(player, isPressed) {
    super();
    this.player = player;
    this.isPressed = isPressed;
  }

  execute() {
    if (!this.player) return;
    this.player.moveForward = this.isPressed;
  }
}
