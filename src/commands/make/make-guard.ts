import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:guard`.
 */
export function makeGuardCommand(): Command {
  return new Command('make:guard')
    .description('Create a new custom auth guard class')
    .argument('<name>', 'Guard base name (e.g. ApiKey)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('guard', name, Boolean(options.force))
    })
}
