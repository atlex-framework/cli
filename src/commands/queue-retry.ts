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
  throw new Error('queue:retry requires `queue` config in atlex.config.*')
}

function parseRange(raw: string): { from: number; to: number } | null {
  const m = /^(\d+)\.\.(\d+)$/.exec(raw.trim())
  if (!m) return null
  const from = Number.parseInt(m[1]!, 10)
  const to = Number.parseInt(m[2]!, 10)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return { from, to }
}

/**
 * @returns Commander command for `queue:retry`.
 */
export function queueRetryCommand(): Command {
  return new Command('queue:retry')
    .description('Retry failed jobs')
    .argument('[uuid]', 'Failed job UUID')
    .option('--all', 'Retry all failed jobs')
    .option('--queue <name>', 'Retry only failed jobs from a specific queue')
    .option('--range <range>', 'Retry a range of failed job numeric IDs (e.g. 1..50)')
    .action(
      async (
        uuidArg: string | undefined,
        options: { all?: boolean; queue?: string; range?: string },
      ) => {
        const cwd = resolveProjectCwd()
        await bootstrapDatabaseFromApp(cwd)
        const orm = await loadAppOrm(cwd)
        const queuePkg = await loadAppQueue(cwd)
        const queueConfig = await loadQueueConfig(cwd)

        const manager = new queuePkg.QueueManager(queueConfig, {
          query: (name: string) =>
            new orm.QueryBuilder(orm.ConnectionRegistry.instance().connection(name)),
        })
        queuePkg._setQueueManager(manager)

        const failer = new queuePkg.DatabaseFailedJobProvider(
          new orm.QueryBuilder(
            orm.ConnectionRegistry.instance().connection(queueConfig.failed.database),
          ),
          queueConfig.failed.table,
        )

        const all = await failer.all()
        const byUuid = (uuid: string) => all.find((j) => j.uuid === uuid) ?? null

        let targets = all
        if (options.queue) {
          targets = targets.filter((j) => j.queue === options.queue)
        }
        if (options.range) {
          const r = parseRange(options.range)
          if (!r) {
            throw new Error(`Invalid --range format: "${options.range}". Expected "1..50".`)
          }
          targets = targets.filter((j) => {
            const id = Number.parseInt(j.id, 10)
            return Number.isFinite(id) && id >= r.from && id <= r.to
          })
        }

        if (uuidArg) {
          const job = byUuid(uuidArg)
          if (job === null) {
            throw new Error(`Failed job not found: ${uuidArg}`)
          }
          targets = [job]
        } else if (
          options.all !== true &&
          options.queue === undefined &&
          options.range === undefined
        ) {
          throw new Error(
            'queue:retry requires a UUID argument or one of: --all, --queue, --range.',
          )
        }

        for (const failed of targets) {
          await manager.connection(failed.connection).push(failed.payload, failed.queue)

          await failer.forget(failed.uuid)
        }
      },
    )
}
