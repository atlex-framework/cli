import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:job`.
 */
export function makeJobCommand(): Command {
  return new Command('make:job')
    .description('Create a new job class')
    .argument('<name>', 'Job base name (e.g. SendWelcomeEmail)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('job', name, Boolean(options.force))
    })
}
