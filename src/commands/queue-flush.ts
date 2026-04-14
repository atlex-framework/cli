import { Command } from 'commander'

import { resolveProjectCwd } from '../projectCwd.js'

import { bootstrapDatabaseFromApp, loadAppOrm } from './migrate.js'
import { loadAppQueue } from './queue-work.js'

type QueueConfig = import('@atlex/queue').QueueConfig

async function loadQueueConfig(cwd: string): Promise<QueueConfig> {
  const candidates = ['atlex.config.ts', 'atlex.config.js', 'atlex.config.mjs', 'atlex.config.cjs']
  for (const f of candidates) {
    try {
      const mod = (await import(new URL(`file://${cwd}/${f}`).toString())) as unknown
      const m = mod as Record<string, unknown>
      const cfg = (m.default ?? m.config ?? m) as Record<string, unknown>
      if (typeof cfg.queue === 'object' && cfg.queue !== null) {
        return cfg.queue as QueueConfig
      }
    } catch {
      // ignore
    }
  }
  throw new Error('queue:flush requires `queue` config in atlex.config.*')
}

/**
 * @returns Commander command for `queue:flush`.
 */
export function queueFlushCommand(): Command {
  return new Command('queue:flush')
    .description('Clear failed jobs from storage')
    .option('--hours <n>', 'Only flush jobs older than N hours')
    .option('--queue <name>', 'Only flush jobs from a specific queue')
    .action(async (options: { hours?: string; queue?: string }) => {
      const cwd = resolveProjectCwd()
      await bootstrapDatabaseFromApp(cwd)
      const orm = await loadAppOrm(cwd)
      const queuePkg = await loadAppQueue(cwd)
      const queueConfig = await loadQueueConfig(cwd)

      const failer = new queuePkg.DatabaseFailedJobProvider(
        new orm.QueryBuilder(
          orm.ConnectionRegistry.instance().connection(queueConfig.failed.database),
        ),
        queueConfig.failed.table,
      )

      const hours = options.hours !== undefined ? Number.parseFloat(options.hours) : undefined
      const queue = options.queue

      if (queue === undefined && hours === undefined) {
        await failer.flush()
        return
      }

      const all = await failer.all()
      const cutoff = hours !== undefined ? Date.now() - hours * 3600 * 1000 : null
      const targets = all.filter((j) => {
        if (queue !== undefined && j.queue !== queue) return false
        if (cutoff !== null && j.failedAt.getTime() >= cutoff) return false
        return true
      })

      for (const j of targets) {
        await failer.forget(j.uuid)
      }
    })
}
