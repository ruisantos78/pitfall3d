import { Command } from './Command.js';

export class MenuBackCommand extends Command {
  constructor(optionsBackBtn) {
    super();
    this.optionsBackBtn = optionsBackBtn;
  }

  execute() {
    if (this.optionsBackBtn) {
      this.optionsBackBtn.click();
    }
  }
}
