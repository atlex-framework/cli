import { Command } from '../Command.js'

export class ListCommand extends Command {
  public static override signature = 'list'
  public static override description = 'List all available commands'

  public constructor(
    private readonly renderer: {
      renderList: (output: { line: (msg?: string) => void }) => void
    },
  ) {
    super()
  }

  public handle(): void {
    this.renderer.renderList(this.output)
  }
}
