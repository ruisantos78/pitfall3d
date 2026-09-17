/**
 * Base Command interface
 */
export class Command {
  execute() {
    throw new Error('Command.execute() must be implemented');
  }
}
