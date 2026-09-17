import { Command } from './Command.js';

export class MenuSelectCommand extends Command {
  constructor(game) {
    super();
    this.game = game;
  }

  execute() {
    if (!this.game) return;
    this.game.activateMenuSelected();
  }
}
