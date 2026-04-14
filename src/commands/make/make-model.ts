import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:model`.
 */
export function makeModelCommand(): Command {
  return new Command('make:model')
    .description(
      'Create a new ORM model class. Use -m to also create a matching create_*_table migration.',
    )
    .argument('<name>', 'Model name (e.g. User or Admin/Post)')
    .option('-m, --migration', 'Also create the matching create_*_table migration')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean; migration?: boolean }) => {
      await dispatchMake('model', name, Boolean(options.force), {
        withMigration: Boolean(options.migration),
      })
    })
}
