import { join } from 'node:path'

import { FileConfigLoader, loadEnv, writeConfigCacheSync } from '@atlex/config'
import { Command } from 'commander'

import { resolveProjectCwd } from '../projectCwd.js'

/**
 * @returns Commander command for `config:cache`.
 */
export function configCacheCommand(): Command {
  return new Command('config:cache')
    .description('Serialize config/ into bootstrap/cache/config.cached.json')
    .action(async () => {
      const cwd = resolveProjectCwd()
      loadEnv(cwd)
      const loader = new FileConfigLoader(join(cwd, 'config'))
      const data = loader.loadSync()
      try {
        writeConfigCacheSync(cwd, data)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(
          `Could not write config cache (ensure values are JSON-serializable): ${message}`,
        )
      }

      console.log('✓ Configuration cached successfully.')
    })
}
