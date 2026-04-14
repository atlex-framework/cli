import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:provider`.
 */
export function makeProviderCommand(): Command {
  return new Command('make:provider')
    .description('Create a new service provider class')
    .argument('<name>', 'Provider base name (e.g. App)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('provider', name, Boolean(options.force))
    })
}
