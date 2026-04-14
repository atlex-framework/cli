#!/usr/bin/env node
import { CommanderError, Command } from 'commander'

import { readCliPackageVersion } from '../cli-package-version.js'
import { authClearResetsCommand } from '../commands/auth-clear-resets.js'
import { configCacheCommand } from '../commands/config-cache.js'
import { configClearCommand } from '../commands/config-clear.js'
import { keyGenerateCommand } from '../commands/key-generate.js'
import {
  makeControllerCommand,
  makeCommandCommand,
  makeConfigCommand,
  makeCollectionCommand,
  makeFactoryCommand,
  makeEventCommand,
  makeGuardCommand,
  makeJobCommand,
  makeListenerCommand,
  makeMailCommand,
  makeNotificationCommand,
  makeMiddlewareCommand,
  makeMigrationCommand,
  makeModelCommand,
  makePolicyCommand,
  makeProviderCommand,
  makeRequestCommand,
  makeResourceCommand,
  makeSeederCommand,
  makeServiceCommand,
  notificationTableCommand,
} from '../commands/make/index.js'
import {
  migrateCommand,
  migrateRollbackCommand,
  migrateResetCommand,
  migrateRefreshCommand,
  migrateFreshCommand,
  migrateStatusCommand,
} from '../commands/migrate.js'
import { newCommand } from '../commands/new.js'
import { queueFailedCommand } from '../commands/queue-failed.js'
import { queueFlushCommand } from '../commands/queue-flush.js'
import { queueRetryCommand } from '../commands/queue-retry.js'
import { queueWorkCommand } from '../commands/queue-work.js'
import { scheduleListCommand } from '../commands/schedule-list.js'
import { scheduleRunCommand } from '../commands/schedule-run.js'
import { dbSeedCommand } from '../commands/seed.js'
import { serveCommand } from '../commands/serve.js'
import { writeCliFatalError } from '../format-cli-fatal-error.js'

/**
 * Commander program with all framework subcommands (generators, migrate, queue, schedule, serve, …).
 *
 * Used in two ways:
 * - **Standalone:** `runLegacyCli` when the user runs the CLI outside an app (or without `app/Console/Kernel`).
 * - **Bridged:** `registerBridgedFrameworkCommands` re-registers each subcommand name so `atlex list` inside
 *   an app shows the same surface as the standalone binary; execution still delegates to Commander via `runLegacyCliAsync`.
 */
export function createLegacyProgram(): Command {
  const program = new Command()

  program.name('atlex').description('Atlex CLI').version(readCliPackageVersion())
  program.configureHelp({ sortSubcommands: false })

  program.commandsGroup('Application')
  program.addCommand(newCommand())
  program.addCommand(serveCommand())

  program.commandsGroup('Code generators')
  program.addCommand(makeControllerCommand())
  program.addCommand(makeCommandCommand())
  program.addCommand(makeConfigCommand())
  program.addCommand(makeModelCommand())
  program.addCommand(makeMigrationCommand())
  program.addCommand(makeMiddlewareCommand())
  program.addCommand(makeRequestCommand())
  program.addCommand(makeResourceCommand())
  program.addCommand(makeCollectionCommand())
  program.addCommand(makeServiceCommand())
  program.addCommand(makeProviderCommand())
  program.addCommand(makeJobCommand())
  program.addCommand(makeEventCommand())
  program.addCommand(makeListenerCommand())
  program.addCommand(makeMailCommand())
  program.addCommand(makeNotificationCommand())
  program.addCommand(notificationTableCommand())
  program.addCommand(makePolicyCommand())
  program.addCommand(makeSeederCommand())
  program.addCommand(makeFactoryCommand())
  program.addCommand(makeGuardCommand())

  program.commandsGroup('Database')
  program.addCommand(dbSeedCommand())
  program.addCommand(authClearResetsCommand())
  program.addCommand(migrateCommand())
  program.addCommand(migrateRollbackCommand())
  program.addCommand(migrateResetCommand())
  program.addCommand(migrateRefreshCommand())
  program.addCommand(migrateFreshCommand())
  program.addCommand(migrateStatusCommand())

  program.commandsGroup('Queue')
  program.addCommand(queueWorkCommand())
  program.addCommand(queueFailedCommand())
  program.addCommand(queueRetryCommand())
  program.addCommand(queueFlushCommand())

  program.commandsGroup('Schedule')
  program.addCommand(scheduleRunCommand())
  program.addCommand(scheduleListCommand())

  program.commandsGroup('Configuration')
  program.addCommand(configCacheCommand())
  program.addCommand(configClearCommand())
  program.addCommand(keyGenerateCommand())

  return program
}

export function runLegacyCli(argv: string[]): void {
  // Do not use `{ from: "user" }` with full `process.argv` — that makes Commander
  // treat argv[0] (the node binary) as the subcommand name.
  void runLegacyCliAsync(argv)
    .then((code) => {
      process.exit(code)
    })
    .catch((err: unknown) => {
      writeCliFatalError(err)
      process.exit(1)
    })
}

/**
 * Run the legacy Commander program and return an exit code (no `process.exit`).
 * Used by the console kernel to delegate to existing `commander` subcommands.
 */
export async function runLegacyCliAsync(argv: string[]): Promise<number> {
  const program = createLegacyProgram()
  program.exitOverride()
  try {
    await program.parseAsync(argv)
    return 0
  } catch (err) {
    if (err instanceof CommanderError) {
      return err.exitCode
    }
    writeCliFatalError(err)
    return 1
  }
}
