import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:seeder`.
 */
export function makeSeederCommand(): Command {
  return new Command('make:seeder')
    .description(
      'Create a seeder class under database/seeders (export default class extends Seeder { run() })',
    )
    .argument('<name>', 'Seeder base name (e.g. User → UserSeeder, Database → DatabaseSeeder)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('seeder', name, Boolean(options.force))
    })
}
