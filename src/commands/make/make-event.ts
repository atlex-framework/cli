import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:event`.
 */
export function makeEventCommand(): Command {
  return new Command('make:event')
    .description('Create a new event class')
    .argument('<name>', 'Event class name (e.g. UserRegistered)')
    .option('-b, --broadcast', 'Scaffold as a broadcastable event')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { broadcast?: boolean; force?: boolean }) => {
      await dispatchMake('event', name, Boolean(options.force), {
        broadcast: Boolean(options.broadcast),
      })
    })
}
