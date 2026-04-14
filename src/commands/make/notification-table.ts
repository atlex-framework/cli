import process from 'node:process'

import { Command } from 'commander'

import { AtlexCliError } from '../../errors/AtlexCliError.js'

import { generateNotificationsTableMigration } from './runMakeCommand.js'

/**
 * @returns Commander command for `notification:table`.
 */
export function notificationTableCommand(): Command {
  return new Command('notification:table')
    .description('Create a migration for the polymorphic notifications table')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (options: { force?: boolean }) => {
      try {
        await generateNotificationsTableMigration(Boolean(options.force))
      } catch (err) {
        if (err instanceof AtlexCliError) {
          console.error(err.message)
          process.exit(1)
        }
        throw err
      }
    })
}
