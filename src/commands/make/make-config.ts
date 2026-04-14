import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:config`.
 */
export function makeConfigCommand(): Command {
  return new Command('make:config')
    .description('Create a new config file under config/')
    .argument('<name>', 'Config file basename (letters, digits, underscore; e.g. redis)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('config', name, Boolean(options.force))
    })
}
