import { Command } from './Command.js';

export class MenuNavigateCommand extends Command {
  constructor(game, direction) {
    super();
    this.game = game;
    this.direction = direction;
  }

  execute() {
    if (!this.game) return;
    this.game.navigateMenu(this.direction);
  }
}
