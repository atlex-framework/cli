import type { Scheduler } from '@atlex/queue'

import type { CommandInput } from './CommandInput.js'
import type { CommandOutput } from './CommandOutput.js'

// Commander-registered commands use heterogeneous constructor signatures.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- constructor arity varies per command
export type CommandConstructor<T extends Command = Command> = new (...args: any[]) => T

/**
 * Base class for all Atlex console commands.
 */
export abstract class Command {
  /**
   * Command signature string (options, arguments, description).
   *
   * @example "inspire"
   * @example "mail:send {user} {--queue=default}"
   */
  public static signature: string

  /**
   * Command description shown in list/help.
   */
  public static description = ''

  /**
   * Whether this command is enabled for registration.
   */
  public static enabled = true

  protected input!: CommandInput
  protected output!: CommandOutput

  /**
   * Lifecycle hook before handle().
   */
  public async beforeHandle(): Promise<void> {
    // no-op
  }

  /**
   * Main command handler. Return number to set exit code (default 0).
   */
  public abstract handle(): Promise<number | void> | number | void

  /**
   * Lifecycle hook after handle().
   */
  public async afterHandle(): Promise<void> {
    // no-op
  }

  /**
   * Optional schedule hook. If defined, the kernel will call it during bootstrap.
   */
  public schedule?(_schedule: Scheduler): void

  /**
   * Bind input/output for execution.
   */
  public bindIO(input: CommandInput, output: CommandOutput): void {
    this.input = input
    this.output = output
  }

  /**
   * Read an argument.
   */
  public argument(name: string): string | undefined {
    return this.input.argument(name)
  }

  /**
   * Read an option.
   */
  public option(name: string): string | boolean | undefined {
    return this.input.option(name)
  }

  /**
   * Write a line to stdout.
   */
  public line(message = ''): void {
    this.output.line(message)
  }

  /**
   * Write an info line.
   */
  public info(message: string): void {
    this.output.message('info', message)
  }

  /**
   * Write a warning line.
   */
  public warn(message: string): void {
    this.output.message('warn', message)
  }

  /**
   * Write an error line.
   */
  public error(message: string): void {
    this.output.message('error', message)
  }
}
