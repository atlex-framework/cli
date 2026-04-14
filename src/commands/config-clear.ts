import { clearConfigCacheSync } from '@atlex/config'
import { Command } from 'commander'

import { resolveProjectCwd } from '../projectCwd.js'

/**
 * @returns Commander command for `config:clear`.
 */
export function configClearCommand(): Command {
  return new Command('config:clear')
    .description('Remove bootstrap/cache/config.cached.json')
    .action(async () => {
      const cwd = resolveProjectCwd()
      clearConfigCacheSync(cwd)

      console.log('✓ Configuration cache cleared.')
    })
}
