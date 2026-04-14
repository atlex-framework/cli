import { Command } from '../Command.js'

export class AboutCommand extends Command {
  public static override signature = 'about'
  public static override description = 'Display basic application information'

  public constructor(private readonly version: string) {
    super()
  }

  public handle(): void {
    const env = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development'
    this.line(`Atlex Framework v${this.version}`)
    this.line(`Environment: ${env}`)
  }
}
