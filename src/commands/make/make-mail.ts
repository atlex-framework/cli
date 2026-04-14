import { Command } from 'commander'

import { dispatchMake } from './dispatchMake.js'

/**
 * @returns Commander command for `make:mail`.
 */
export function makeMailCommand(): Command {
  return new Command('make:mail')
    .description('Create a new mailable class + view template')
    .argument('<name>', 'Mailable class base name (e.g. WelcomeMail)')
    .option('--force', 'Overwrite the file if it already exists')
    .option('--markdown', 'Generate a Markdown-based mail view instead of HTML')
    .action(async (name: string, options: { force?: boolean; markdown?: boolean }) => {
      await dispatchMake('mail', name, Boolean(options.force), {
        markdown: Boolean(options.markdown),
      })
    })
}
