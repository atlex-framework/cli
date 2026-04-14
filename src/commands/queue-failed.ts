import { Command } from 'commander'

import { resolveProjectCwd } from '../projectCwd.js'

import { bootstrapDatabaseFromApp, loadAppOrm } from './migrate.js'
import { loadAppQueue } from './queue-work.js'

type QueueConfig = import('@atlex/queue').QueueConfig

/**
 * @returns Commander command for `queue:failed`.
 */
export function queueFailedCommand(): Command {
  return new Command('queue:failed')
    .description('List failed jobs')
    .option('--queue <name>', 'Filter by queue')
    .option('--limit <n>', 'Max rows', '50')
    .action(async (options: { queue?: string; limit?: string }) => {
      const cwd = resolveProjectCwd()
      await bootstrapDatabaseFromApp(cwd)
      const orm = await loadAppOrm(cwd)
      const queuePkg = await loadAppQueue(cwd)

      const cfgMod = await import(new URL('../..', import.meta.url).toString())
      void cfgMod

      // Minimal config load: rely on atlex.config.* exporting `queue`.
      const candidates = [
        'atlex.config.ts',
        'atlex.config.js',
        'atlex.config.mjs',
        'atlex.config.cjs',
      ]
      let queueConfig: QueueConfig | undefined
      for (const f of candidates) {
        try {
          const mod = (await import(new URL(`file://${cwd}/${f}`).toString())) as unknown
          const m = mod as Record<string, unknown>
          const cfg = (m.default ?? m.config ?? m) as Record<string, unknown>
          if (typeof cfg.queue === 'object' && cfg.queue !== null) {
            queueConfig = cfg.queue as QueueConfig
            break
          }
        } catch {
          // ignore
        }
      }
      if (!queueConfig) {
        throw new Error('queue:failed requires `queue` config in atlex.config.*')
      }

      const failer = new queuePkg.DatabaseFailedJobProvider(
        new orm.QueryBuilder(
          orm.ConnectionRegistry.instance().connection(queueConfig.failed.database),
        ),
        queueConfig.failed.table,
      )
      const all = await failer.all()
      const filtered = options.queue
        ? all.filter((j: { queue: string }) => j.queue === options.queue)
        : all
      const limit = options.limit ? Number.parseInt(options.limit, 10) : 50
      const rows = filtered.slice(0, Number.isFinite(limit) ? limit : 50)
      for (const j of rows) {
        // CLI output

        console.log(
          `${j.uuid}\t${j.connection}\t${j.queue}\t${j.failedAt.toISOString()}\t${j.payload.job}`,
        )
      }
    })
}
