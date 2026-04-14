import type { Container } from '@atlex/core'

import { ClosureCommand, type ClosureCommandCallback } from './ClosureCommand.js'
import type { CommandInput } from './CommandInput.js'
import type { CommandRegistry } from './CommandRegistry.js'
import type { ConsoleApplication } from './ConsoleApplication.js'
import type { ConsoleEvents } from './events.js'

function requireBound<T>(app: Container, key: string): T {
  return app.make<T>(key)
}

/**
 * Static facade for registering closure-based console commands from routes/console.ts.
 */
export class Artisan {
  static #app: Container | null = null

  /**
   * Bind the facade to a container (called during bootstrap).
   */
  public static setApplication(app: Container): void {
    Artisan.#app = app
  }

  private static app(): Container {
    if (Artisan.#app === null) {
      throw new Error('Artisan facade is not bound to an application container.')
    }
    return Artisan.#app
  }

  /**
   * Register a closure-based command.
   */
  public static command(signature: string, callback: ClosureCommandCallback): ClosureCommand {
    const app = Artisan.app()
    const registry = requireBound<CommandRegistry>(app, 'commands')

    // Create a unique class per closure command so it can be resolved/executed by name.
    class RoutedClosureCommand extends ClosureCommand {
      public static override signature = signature
      public static override description = ''
      public constructor() {
        super(callback)
      }
    }

    registry.register(RoutedClosureCommand)
    return new RoutedClosureCommand()
  }

  /**
   * Programmatically invoke a command.
   */
  public static async call(command: string, args?: Record<string, unknown>): Promise<number> {
    const app = Artisan.app()
    const artisan = requireBound<ConsoleApplication>(app, 'console.app')
    return await artisan.call(command, args ?? {})
  }

  /**
   * Queue a command for background execution.
   *
   * Note: requires the application's queue system. If not bound, this will throw.
   */
  public static async queue(command: string, args?: Record<string, unknown>): Promise<void> {
    const app = Artisan.app()
    const enqueue = requireBound<(cmd: string, a?: Record<string, unknown>) => Promise<void>>(
      app,
      'console.queue',
    )
    await enqueue(command, args ?? {})
  }

  /**
   * Get the output from the last command.
   */
  public static output(): string {
    const app = Artisan.app()
    const artisan = requireBound<ConsoleApplication>(app, 'console.app')
    return artisan.output()
  }

  /**
   * Get all registered command names.
   */
  public static all(): string[] {
    const app = Artisan.app()
    const registry = requireBound<CommandRegistry>(app, 'commands')
    return [...registry.all().keys()].sort()
  }

  /**
   * Register an event listener for when any command starts.
   */
  public static starting(callback: (command: string, input: CommandInput) => void): void {
    const app = Artisan.app()
    const events = requireBound<ConsoleEvents>(app, 'console.events')
    events.on('CommandStarting', (payload) => {
      const p = payload as { command: string; input: CommandInput }
      callback(p.command, p.input)
    })
  }

  /**
   * Register an event listener for when any command finishes.
   */
  public static finished(callback: (command: string, exitCode: number) => void): void {
    const app = Artisan.app()
    const events = requireBound<ConsoleEvents>(app, 'console.events')
    events.on('CommandFinished', (payload) => {
      const p = payload as { command: string; exitCode: number }
      callback(p.command, p.exitCode)
    })
  }
}
