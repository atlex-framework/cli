import { Command } from '../Command.js'

export class EnvCommand extends Command {
  public static override signature = 'env'
  public static override description = 'Display the current environment'

  public handle(): void {
    const env = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development'
    this.line(env)
  }
}
