import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:middleware`.
 */
export function makeMiddlewareCommand(): Command {
  return new Command('make:middleware')
    .description('Create a new HTTP middleware class')
    .argument('<name>', 'Middleware base name (e.g. Auth)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('middleware', name, Boolean(options.force))
    })
}
