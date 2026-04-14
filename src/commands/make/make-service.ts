import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:service`.
 */
export function makeServiceCommand(): Command {
  return new Command('make:service')
    .description('Create a new service class')
    .argument('<name>', 'Service base name (e.g. User)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('service', name, Boolean(options.force))
    })
}
