import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:collection`.
 */
export function makeCollectionCommand(): Command {
  return new Command('make:collection')
    .description('Create a ResourceCollection class under app/Http/Resources')
    .argument('<name>', 'Collection base name (e.g. User)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('collection', name, Boolean(options.force))
    })
}
