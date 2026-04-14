import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:listener`.
 */
export function makeListenerCommand(): Command {
  return new Command('make:listener')
    .description('Create a new event listener class')
    .argument('<name>', 'Listener class name (e.g. SendWelcomeEmail)')
    .option(
      '--event <EventClass>',
      'Event class name to import and listen for (e.g. UserRegistered)',
    )
    .option('-q, --queued', 'Make the listener queueable')
    .option('--force', 'Overwrite the file if it already exists')
    .action(
      async (name: string, options: { event?: string; queued?: boolean; force?: boolean }) => {
        await dispatchMake('listener', name, Boolean(options.force), {
          event: options.event,
          queued: Boolean(options.queued),
        })
      },
    )
}
