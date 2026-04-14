import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:request`.
 */
export function makeRequestCommand(): Command {
  return new Command('make:request')
    .description('Create a FormRequest class under app/Http/Requests')
    .argument('<name>', 'Request base name (e.g. StoreUser)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('request', name, Boolean(options.force))
    })
}
