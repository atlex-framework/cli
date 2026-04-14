import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:controller`.
 */
export function makeControllerCommand(): Command {
  return new Command('make:controller')
    .description(
      'Create a new HTTP controller class extending app/Http/Controllers/Controller (created automatically if missing).',
    )
    .argument('<name>', 'Resource name (e.g. User)')
    .option('--api', 'Generate a REST-style API controller (index, store, show, update, destroy)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean; api?: boolean }) => {
      await dispatchMake('controller', name, Boolean(options.force), {
        api: Boolean(options.api),
      })
    })
}
