import { EventEmitter } from 'node:events'
import path from 'node:path'

import type { Application, Container } from '@atlex/core'
import { CacheScheduleMutex, Scheduler } from '@atlex/queue'

import { Artisan } from './console/ArtisanFacade.js'
import { loadConsoleRoutes } from './console/bootstrap/LoadConsoleRoutes.js'
import { AboutCommand } from './console/builtins/AboutCommand.js'
import { CompletionCommand } from './console/builtins/CompletionCommand.js'
import { EnvCommand } from './console/builtins/EnvCommand.js'
import { HelpCommand } from './console/builtins/HelpCommand.js'
import { ListCommand } from './console/builtins/ListCommand.js'
import { type Command, type CommandConstructor } from './console/Command.js'
import type { CommandOutput } from './console/CommandOutput.js'
import { CommandRegistry } from './console/CommandRegistry.js'
import { ConsoleApplication } from './console/ConsoleApplication.js'
import { ConsoleEvents } from './console/events.js'
import { registerBridgedFrameworkCommands } from './console/registerBridgedFrameworkCommands.js'

interface Logger {
  debug?: (message: string) => void
  warn?: (message: string) => void
}

function noop(): void {
  // intentional
}

function ensureLogger(app: Container): void {
  try {
    app.make('logger')
  } catch {
    app.singleton('logger', (): Logger => ({ debug: noop, warn: noop }))
  }
}

/**
 * Base console kernel for Atlex applications (`app/Console/Kernel`-style entrypoint).
 *
 * **User flow:** The `atlex` binary loads your app’s `Kernel`, calls {@link ConsoleKernel.setApplication},
 * then {@link ConsoleKernel.handle} with CLI args. That boots the app, registers built-ins and bridged
 * framework commands, discovers `app/Console/Commands`, loads `routes/console`, and dispatches the matched command.
 *
 * **Contributors:** Subclass this in generated apps; override {@link ConsoleKernel.commands} / {@link ConsoleKernel.schedule}
 * as needed. Framework generators and `migrate` / `serve` / etc. appear in `atlex list` via bridging from Commander.
 */
export abstract class ConsoleKernel {
  protected app!: Application
  protected artisan: ConsoleApplication | null = null

  protected commands: CommandConstructor[] = []
  protected commandPaths: string[] = ['app/Console/Commands']
  protected commandRoutePaths: string[] = ['routes/console']
  protected autoDiscover = true

  #bootstrapped = false
  #basePath = process.cwd()

  /**
   * Bind the kernel to an Application instance.
   */
  public setApplication(
    app: Application,
    options?: { readonly basePath?: string; readonly version?: string },
  ): void {
    this.app = app
    this.#basePath = path.resolve(options?.basePath ?? process.cwd())
    const container = app.container

    ensureLogger(container)

    container.singleton('commands', () => new CommandRegistry(container))
    container.singleton('console.events', () => new ConsoleEvents())
    container.singleton(
      'console.app',
      () =>
        new ConsoleApplication(
          container,
          container.make('commands'),
          container.make('console.events'),
          options?.version ?? '0.1.0-beta',
        ),
    )

    // Default scheduler binding for apps that didn't register one via providers.
    container.singleton('schedule', () => {
      const env = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development'
      const timezone = 'UTC'
      const defaultOverlapTimeout = 1440
      return new Scheduler(
        container,
        new EventEmitter(),
        new CacheScheduleMutex(),
        { environment: env, timezone, defaultOverlapTimeout },
        timezone,
      )
    })

    // Optional queue binding used by Artisan.queue()
    container.singleton('console.queue', () => {
      return async (_cmd: string, _args?: Record<string, unknown>) => {
        throw new Error('Queueing console commands is not configured for this application.')
      }
    })

    Artisan.setApplication(container)
  }

  /**
   * Define the application's command schedule.
   */

  protected schedule(_schedule: Scheduler): void {
    // base: intentionally empty
  }

  /**
   * Load closure-command route files (routes/console.ts).
   */
  protected commandRoutes(): void {
    void this.commandRoutesAsync()
  }

  protected async commandRoutesAsync(): Promise<void> {
    const logger = this.app.container.make<Logger>('logger')
    for (const rel of this.commandRoutePaths) {
      const result = await loadConsoleRoutes({ basePath: this.#basePath, routePath: rel })
      if (result.error !== null) {
        logger.warn?.(
          `Failed to load console routes from ${result.resolvedPath ?? rel}: ${result.error.message}`,
        )
      } else if (!result.loaded) {
        logger.debug?.(`Console routes not found: ${rel}`)
      }
    }
  }

  /**
   * Bootstrap the console application (idempotent).
   */
  public async bootstrap(): Promise<void> {
    if (this.#bootstrapped) return
    this.#bootstrapped = true

    // Boot providers (Application.boot is sync in current core)
    this.app.boot()

    // Register built-ins first
    this.registerBuiltIns()

    // Register manually listed command classes
    this.registerCommands()

    // Auto-discover commands
    if (this.autoDiscover) {
      await this.discoverCommands()
    }

    // Load routes/console.ts files
    await this.commandRoutesAsync()

    // Register schedule
    const scheduler = this.app.container.make<Scheduler>('schedule')
    this.schedule(scheduler)
    this.scheduleFromCommands(scheduler)
    this.app.container
      .make<ConsoleEvents>('console.events')
      .emit('ScheduleRegistered', { taskCount: scheduler.events().length })
  }

  private registerBuiltIns(): void {
    const registry = this.app.container.make<CommandRegistry>('commands')
    const consoleApp = this.getArtisan()

    registry.register(ListCommand)
    registry.register(EnvCommand)

    registry.registerNamed(
      'help',
      class extends HelpCommand {
        public constructor() {
          super({
            renderHelp: (o, c) => {
              consoleApp.renderHelp(o as CommandOutput, c)
            },
            renderList: (o) => {
              consoleApp.renderList(o as CommandOutput)
            },
          })
        }
      },
    )

    registry.registerNamed(
      'list',
      class extends ListCommand {
        public constructor() {
          super({
            renderList: (o) => {
              consoleApp.renderList(o as CommandOutput)
            },
          })
        }
      },
    )

    registry.registerNamed(
      'about',
      class extends AboutCommand {
        public constructor() {
          super('0.1.0-beta')
        }
      },
    )

    registry.registerNamed(
      'completion',
      class extends CompletionCommand {
        public constructor() {
          super(() => [...registry.all().keys()])
        }
      },
    )

    registerBridgedFrameworkCommands(registry)
  }

  private registerCommands(): void {
    const registry = this.app.container.make<CommandRegistry>('commands')
    for (const commandClass of this.commands) {
      registry.register(commandClass)
    }
  }

  private async discoverCommands(): Promise<void> {
    const registry = this.app.container.make<CommandRegistry>('commands')
    for (const dir of this.commandPaths) {
      await registry.discover(path.resolve(this.#basePath, dir))
    }
  }

  private scheduleFromCommands(scheduler: Scheduler): void {
    const registry = this.app.container.make<CommandRegistry>('commands')
    for (const [, CommandClass] of registry.all()) {
      let instance: Command
      try {
        instance = this.app.container.make(CommandClass)
      } catch {
        instance = new CommandClass()
      }
      if (typeof instance.schedule === 'function') {
        instance.schedule(scheduler)
      }
    }
  }

  /**
   * Run the console application with argv.
   */
  public async handle(argv: string[]): Promise<number> {
    await this.bootstrap()
    const artisan = this.getArtisan()
    const exitCode = await artisan.run(argv)
    await this.terminate(exitCode)
    return exitCode
  }

  public async call(command: string, args?: Record<string, unknown>): Promise<number> {
    await this.bootstrap()
    return await this.getArtisan().call(command, args ?? {})
  }

  public all(): Map<string, CommandConstructor> {
    return this.app.container.make<CommandRegistry>('commands').all()
  }

  public output(): string {
    return this.getArtisan().output()
  }

  protected async terminate(exitCode: number): Promise<void> {
    this.app.container
      .make<ConsoleEvents>('console.events')
      .emit('ConsoleTerminating', { exitCode })
  }

  protected getArtisan(): ConsoleApplication {
    if (this.artisan !== null) return this.artisan
    this.artisan = this.app.container.make<ConsoleApplication>('console.app')
    return this.artisan
  }
}
