import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:policy`.
 */
export function makePolicyCommand(): Command {
  return new Command('make:policy')
    .description('Create a new authorization policy class')
    .argument('<name>', 'Policy base name (e.g. Post)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('policy', name, Boolean(options.force))
    })
}
