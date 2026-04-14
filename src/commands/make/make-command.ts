import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:command`.
 */
export function makeCommandCommand(): Command {
  return new Command('make:command')
    .description('Create a new console command class')
    .argument('<name>', 'Command class base name (e.g. PruneUsersCommand)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('command', name, Boolean(options.force))
    })
}
