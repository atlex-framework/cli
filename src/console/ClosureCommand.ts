import { Command } from './Command.js'

export type ClosureCommandCallback = (command: ClosureCommand) => void | Promise<void>

/**
 * A Command instance created from a closure (via routes/console.ts).
 */
export class ClosureCommand extends Command {
  public static override signature: string
  public static override description = ''

  readonly #callback: ClosureCommandCallback

  public constructor(callback: ClosureCommandCallback) {
    super()
    this.#callback = callback
  }

  /**
   * Set the command description. Fluent API for routes/console.ts.
   */
  public purpose(description: string): this {
    ;(this.constructor as typeof ClosureCommand).description = description
    return this
  }

  /**
   * Alias for purpose() (describe-style metadata for listings).
   */
  public describe(description: string): this {
    return this.purpose(description)
  }

  public async handle(): Promise<number | void> {
    await this.#callback(this)
    return 0
  }
}
