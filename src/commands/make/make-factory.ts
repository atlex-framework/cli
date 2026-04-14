import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:factory`.
 */
export function makeFactoryCommand(): Command {
  return new Command('make:factory')
    .description(
      'Create a factory class under database/factories (extends Factory, static model, definition()).',
    )
    .argument('<name>', 'Model base name (e.g. User → UserFactory)')
    .option('--force', 'Overwrite the file if it already exists')
    .action(async (name: string, options: { force?: boolean }) => {
      await dispatchMake('factory', name, Boolean(options.force))
    })
}
