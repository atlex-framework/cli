import { Command } from '../Command.js'

export class HelpCommand extends Command {
  public static override signature = 'help {command?}'
  public static override description = 'Display help for a command'

  public constructor(
    private readonly renderer: {
      renderHelp: (
        output: { line: (msg?: string) => void; lineError: (msg?: string) => void },
        command: string,
      ) => void
      renderList: (output: { line: (msg?: string) => void }) => void
    },
  ) {
    super()
  }

  public handle(): number | void {
    const name = this.argument('command')
    if (!name) {
      this.renderer.renderList(this.output)
      return
    }
    this.renderer.renderHelp(this.output, name)
    return 0
  }
}
