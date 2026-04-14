import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { Command } from 'commander'

import { resolveProjectCwd } from '../projectCwd.js'

import { bootstrapDatabaseFromApp, loadAppOrm } from './migrate.js'

type AtlexQueue = typeof import('@atlex/queue')
type QueueConfig = import('@atlex/queue').QueueConfig

interface AtlexConfig {
  queue?: unknown
}

async function loadAtlexConfig(cwd: string): Promise<AtlexConfig> {
  const candidates = ['atlex.config.ts', 'atlex.config.js', 'atlex.config.mjs', 'atlex.config.cjs']
  for (const f of candidates) {
    const full = path.join(cwd, f)
    try {
      await import(pathToFileURL(full).href)

      const mod = (await import(pathToFileURL(full).href)) as unknown
      if (typeof mod === 'object' && mod !== null) {
        const m = mod as Record<string, unknown>
        const cfg = (m.default ?? m.config ?? m) as unknown
        if (typeof cfg === 'object' && cfg !== null) return cfg as AtlexConfig
      }
    } catch {
      // ignore
    }
  }
  return {}
}

export async function loadAppQueue(cwd: string): Promise<AtlexQueue> {
  let dir = path.resolve(cwd)
  for (;;) {
    const candidate = path.join(dir, 'node_modules', '@atlex', 'queue', 'dist', 'index.js')
    if (existsSync(candidate)) {
      return await (import(pathToFileURL(candidate).href) as Promise<AtlexQueue>)
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(
        `Could not find @atlex/queue in node_modules (searched upward from ${cwd}). Install dependencies in this project.`,
      )
    }
    dir = parent
  }
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * @returns Commander command for `queue:work`.
 */
export function queueWorkCommand(): Command {
  return new Command('queue:work')
    .description('Process jobs from the queue')
    .argument('[connection]', 'Queue connection name (from atlex.config queue.connections)')
    .option('--queue <names>', 'Comma-separated queues (priority order)', 'default')
    .option('--concurrency <n>', 'Parallel job processors', '1')
    .option('--sleep <n>', 'Seconds to sleep when no jobs', '3')
    .option('--timeout <n>', 'Per-job timeout seconds', '60')
    .option('--tries <n>', 'Max attempts per job', '1')
    .option('--max-jobs <n>', 'Stop after N jobs (0=unlimited)', '0')
    .option('--max-time <n>', 'Stop after N seconds (0=unlimited)', '0')
    .option('--memory <n>', 'Stop if memory exceeds MB', '0')
    .option('--rest <ms>', 'Milliseconds to pause between jobs', '0')
    .option('--force', 'Process even in maintenance mode', false)
    .option('--stop-when-empty', 'Exit when queue is empty', false)
    .option('--name <name>', 'Worker name', 'default')
    .action(async (connectionArg: string | undefined, options: Record<string, unknown>) => {
      const cwd = resolveProjectCwd()
      await bootstrapDatabaseFromApp(cwd)
      const orm = await loadAppOrm(cwd)
      const queuePkg = await loadAppQueue(cwd)
      const cfg = await loadAtlexConfig(cwd)

      const queueConfig = cfg.queue as QueueConfig | undefined
      if (queueConfig === undefined) {
        throw new Error('queue:work requires `queue` config in atlex.config.*')
      }

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

      const worker = new queuePkg.Worker(
        manager,
        new EventEmitter(),
        failer,
        () => false,
        () => undefined,
      )
      await worker.daemon(connectionArg ?? queueConfig.default, {
        name: String(options.name ?? 'default'),
        queue: String(options.queue ?? 'default'),
        connection: connectionArg ?? queueConfig.default,
        concurrency: parseNumber(options.concurrency as string | undefined, 1),
        delay: 0,
        sleep: parseNumber(options.sleep as string | undefined, 3),
        maxTries: parseNumber(options.tries as string | undefined, 1),
        maxJobs: parseNumber(
          options.maxJobs as string | undefined,
          parseNumber(options['max-jobs'] as string | undefined, 0),
        ),
        maxTime: parseNumber(
          options.maxTime as string | undefined,
          parseNumber(options['max-time'] as string | undefined, 0),
        ),
        memory: parseNumber(options.memory as string | undefined, 0),
        timeout: parseNumber(options.timeout as string | undefined, 60),
        rest: parseNumber(options.rest as string | undefined, 0),
        force: Boolean(options.force),
        stopWhenEmpty: Boolean(options.stopWhenEmpty ?? options['stop-when-empty']),
        backoff: 0,
      })
      process.exitCode = 0
    })
}
