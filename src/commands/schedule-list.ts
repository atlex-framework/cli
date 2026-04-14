import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { Command } from 'commander'

import { resolveProjectCwd } from '../projectCwd.js'

import { loadAppQueue } from './queue-work.js'

interface QueueSchedulingApi {
  readonly Scheduler: new (
    app: unknown,
    events: EventEmitter,
    mutex: unknown,
    config: {
      readonly environment: string
      readonly timezone: string
      readonly defaultOverlapTimeout: number
    },
    timezone: string,
  ) => {
    events(): readonly {
      getSummary(): string
      getExpression(): string
      nextRunDate(now?: Date): Date
      previousRunDate(now?: Date): Date
      usesOverlapPrevention(): boolean
    }[]
  }
  readonly CacheScheduleMutex: new () => unknown
}

interface AtlexConfig {
  schedule?: {
    timezone?: unknown
    environment?: unknown
    defaultOverlapTimeout?: unknown
  }
}

async function loadAtlexConfig(cwd: string): Promise<AtlexConfig> {
  const candidates = ['atlex.config.ts', 'atlex.config.js', 'atlex.config.mjs', 'atlex.config.cjs']
  for (const f of candidates) {
    const full = path.join(cwd, f)
    try {
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

async function loadConsoleKernel(cwd: string): Promise<unknown | null> {
  const candidates = [
    path.join(cwd, 'dist', 'app', 'Console', 'Kernel.js'),
    path.join(cwd, 'app', 'Console', 'Kernel.js'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      return (await import(pathToFileURL(p).href)) as unknown
    } catch {
      // ignore
    }
  }
  return null
}

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return fallback
}

function writeLine(line: string): void {
  process.stdout.write(`${line}\n`)
}

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length)
}

/**
 * @returns Commander command for `schedule:list`.
 */
export function scheduleListCommand(): Command {
  return new Command('schedule:list')
    .description('List all scheduled tasks')
    .option('--timezone <tz>', 'Display next/previous run times in this timezone')
    .action(async (options: { timezone?: string }) => {
      const cwd = resolveProjectCwd()
      const queuePkg = (await loadAppQueue(cwd)) as unknown as QueueSchedulingApi
      const cfg = await loadAtlexConfig(cwd)

      const timezone = coerceString(options.timezone, coerceString(cfg.schedule?.timezone, 'UTC'))
      const environment = coerceString(
        cfg.schedule?.environment,
        process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
      )
      const defaultOverlapTimeout = coerceNumber(cfg.schedule?.defaultOverlapTimeout, 1440)

      const scheduler = new queuePkg.Scheduler(
        {},
        new EventEmitter(),
        new queuePkg.CacheScheduleMutex(),
        { environment, timezone, defaultOverlapTimeout },
        timezone,
      )

      const kernelMod = await loadConsoleKernel(cwd)
      const KernelCtor = resolveKernelCtor(kernelMod)
      if (KernelCtor !== null) {
        const kernel = new KernelCtor()
        const scheduleFn = (kernel as { schedule?: (s: unknown) => void }).schedule
        if (typeof scheduleFn === 'function') scheduleFn.call(kernel, scheduler)
      }

      const now = new Date()
      const tasks = scheduler.events()
      if (tasks.length === 0) {
        writeLine('No scheduled tasks registered.')
        process.exitCode = 0
        return
      }

      const headers = ['Task', 'Expression', 'Next Run', 'Previous Run', 'Overlap']
      const rows: string[][] = tasks.map((t) => {
        const next = t.nextRunDate(now)
        const prev = t.previousRunDate(now)
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
        return [
          t.getSummary(),
          t.getExpression(),
          fmt.format(next),
          fmt.format(prev),
          t.usesOverlapPrevention() ? 'Yes' : 'No',
        ]
      })

      const widths = headers.map((h, i) =>
        Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
      )
      writeLine(headers.map((h, i) => padRight(h, widths[i] ?? h.length)).join(' | '))
      writeLine(widths.map((w) => '-'.repeat(w)).join('-|-'))
      for (const r of rows) {
        writeLine(r.map((c, i) => padRight(c, widths[i] ?? c.length)).join(' | '))
      }
      process.exitCode = 0
    })
}

function resolveKernelCtor(mod: unknown): (new () => unknown) | null {
  if (typeof mod !== 'object' || mod === null) return null
  const m = mod as Record<string, unknown>
  const candidate = m.Kernel ?? m.default
  if (typeof candidate === 'function') {
    return candidate as new () => unknown
  }
  return null
}
