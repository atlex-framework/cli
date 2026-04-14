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
    events(): readonly { getSummary(): string }[]
    runDueEvents(now?: Date): Promise<
      readonly {
        task: { getSummary(): string }
        success: boolean
        duration: number
        skippedReason?: string
        error: Error | null
      }[]
    >
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

/**
 * @returns Commander command for `schedule:run`.
 */
export function scheduleRunCommand(): Command {
  return new Command('schedule:run')
    .description('Run the task scheduler (executes tasks due this minute)')
    .action(async () => {
      const cwd = resolveProjectCwd()
      const queuePkg = (await loadAppQueue(cwd)) as unknown as QueueSchedulingApi
      const cfg = await loadAtlexConfig(cwd)

      const timezone = coerceString(cfg.schedule?.timezone, 'UTC')
      const environment = coerceString(
        cfg.schedule?.environment,
        process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
      )
      const defaultOverlapTimeout = coerceNumber(cfg.schedule?.defaultOverlapTimeout, 1440)

      const scheduler = new queuePkg.Scheduler(
        // Scheduler doesn't require container for core operations (yet).
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
        if (typeof scheduleFn === 'function') {
          scheduleFn.call(kernel, scheduler)
        }
      }

      const now = new Date()
      const registered = scheduler.events()
      if (registered.length === 0) {
        writeLine(
          'No scheduled tasks registered. Define tasks in app/Console/Kernel (schedule method).',
        )
        process.exitCode = 0
        return
      }

      const results = await scheduler.runDueEvents(now)
      if (results.length === 0) {
        writeLine('No scheduled tasks were due at this time.')
        process.exitCode = 0
        return
      }

      let hadFailure = false
      for (const r of results) {
        const prefix = `[${now.toISOString()}]`
        if (r.skippedReason !== undefined) {
          writeLine(`${prefix} Skipped: ${r.task.getSummary()} (${r.skippedReason})`)
          continue
        }
        if (r.success) {
          writeLine(`${prefix} Ran: ${r.task.getSummary()} (${(r.duration / 1000).toFixed(2)}s)`)
        } else {
          hadFailure = true
          writeLine(`${prefix} Failed: ${r.task.getSummary()} (${(r.duration / 1000).toFixed(2)}s)`)
          if (r.error !== null) writeLine(`  ${r.error.name}: ${r.error.message}`)
        }
      }

      process.exitCode = hadFailure ? 1 : 0
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
