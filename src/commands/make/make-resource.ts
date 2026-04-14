import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:resource`.
 */
export function makeResourceCommand(): Command {
  return new Command('make:resource')
    .description('Create a JsonResource class under app/Http/Resources')
    .argument('<name>', 'Resource base name (e.g. User)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('resource', name, Boolean(options.force))
    })
}
