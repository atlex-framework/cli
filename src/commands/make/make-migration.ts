import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:migration`.
 */
export function makeMigrationCommand(): Command {
  return new Command('make:migration')
    .description(
      'Create a new database migration (.js or .ts matches your app). ' +
        'Names like create-users-table scaffold Schema.create with id + timestamps.',
    )
    .argument('<name>', 'Migration name (e.g. create-users-table or add_foo_to_bar)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('migration', name, Boolean(options.force))
    })
}
