import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:notification`.
 */
export function makeNotificationCommand(): Command {
  return new Command('make:notification')
    .description('Create a new notification class under app/Notifications')
    .argument('<name>', 'Notification class base name (e.g. InvoicePaid)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('notification', name, Boolean(options.force))
    })
}
