import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { confirm, intro, isCancel, log, outro } from '@clack/prompts'
import { Command } from 'commander'

import { wrapWithDatabaseHint } from '../migrateDbErrors.js'
import { resolveProjectCwd } from '../projectCwd.js'

/** Runtime ORM API — loaded from the app's `node_modules` so `ConnectionRegistry` matches bootstrap. */
type AtlexOrm = typeof import('@atlex/orm')

interface AtlexConfig {
  database?: {
    connection?: string
    config?: unknown
  }
  migrations?: {
    path?: string
    /** Override default table name `migrations`. */
    table?: string
  }
}

/**
 * Resolve `@atlex/orm` entry from the project tree (walks up for hoisted installs).
 * The global CLI must not use its own bundled `@atlex/orm`: that is a different module instance
 * than the one `bootstrap/database.js` registers connections on.
 */
export async function loadAppOrm(cwd: string): Promise<AtlexOrm> {
  let dir = path.resolve(cwd)
  for (;;) {
    const candidate = path.join(dir, 'node_modules', '@atlex', 'orm', 'dist', 'index.js')
    if (existsSync(candidate)) {
      return await (import(pathToFileURL(candidate).href) as Promise<AtlexOrm>)
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(
        [
          `Could not find @atlex/orm in node_modules (searched upward from ${cwd}).`,
          'Install dependencies in this project and run the CLI from the app directory.',
        ].join(' '),
      )
    }
    dir = parent
  }
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
      // ignore not found / load errors; we'll rely on env setup elsewhere
    }
  }
  return {}
}

function defaultMigrationsPath(cwd: string): string {
  return path.resolve(cwd, 'database', 'migrations')
}

function migrationRunnerOptions(cwd: string, cfg: AtlexConfig) {
  const migrationsPath = cfg.migrations?.path
    ? path.resolve(cwd, cfg.migrations.path)
    : defaultMigrationsPath(cwd)
  const table = cfg.migrations?.table?.trim()
  return {
    migrationsPath,
    connectionName: cfg.database?.connection,
    ...(table !== undefined && table.length > 0 ? { migrationsTable: table } : {}),
  }
}

async function confirmUnsafeIfProduction(orm: AtlexOrm, message: string): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return
  if (process.env.ALLOW_UNSAFE_OPERATIONS === 'true') return

  intro('Production safeguard')
  const ok = await confirm({ message: `${message}\n\nType: confirm`, initialValue: false })
  if (isCancel(ok) || !ok) {
    throw new orm.DangerousOperationException()
  }
}

/**
 * Loads `bootstrap/database.js` from the app (compiled TS lives under `dist/`).
 * Registers the default connection from `config/database` + environment — same as `main`.
 */
export async function bootstrapDatabaseFromApp(cwd: string): Promise<void> {
  let previousCwd: string | undefined
  try {
    previousCwd = process.cwd()
  } catch {
    previousCwd = undefined
  }
  let chdirToApp = false
  if (existsSync(cwd)) {
    try {
      process.chdir(cwd)
      chdirToApp = true
    } catch {
      // Shell cwd may already be invalid (uv_cwd); bootstrap loads .env by path, not cwd.
    }
  }

  const candidates = [
    path.join(cwd, 'dist', 'bootstrap', 'database.js'),
    path.join(cwd, 'bootstrap', 'database.js'),
  ]
  try {
    for (const p of candidates) {
      if (!existsSync(p)) continue
      try {
        await import(pathToFileURL(p).href)
        return
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(
          `Failed to load database bootstrap from ${p}: ${msg}\n` +
            'If the stack mentions a database driver, fix .env (see .env.example / docker-compose.yml).',
          { cause: e },
        )
      }
    }
    throw new Error(
      [
        'No database bootstrap found. Expected one of:',
        ...candidates.map((c) => `  - ${c}`),
        '',
        'TypeScript apps: run `pnpm build` (or `npm run build`) so `dist/bootstrap/database.js` exists,',
        'or use `pnpm migrate` / `npm run migrate` from the app template.',
      ].join('\n'),
    )
  } finally {
    if (chdirToApp && previousCwd !== undefined) {
      try {
        process.chdir(previousCwd)
      } catch {
        // ignore
      }
    }
  }
}

async function ensureConnection(cwd: string, orm: AtlexOrm): Promise<void> {
  await bootstrapDatabaseFromApp(cwd)
  orm.ConnectionRegistry.instance().default()
}

/** Knex keeps sockets open until destroyed; without this the CLI never exits after migrate. */
async function closeMigrateConnection(orm: AtlexOrm, connectionName?: string): Promise<void> {
  try {
    await orm.ConnectionRegistry.instance().connection(connectionName).close()
  } catch {
    // No connection registered yet, or already closed.
  }
}

function rethrowUnlessSetupError(err: unknown): never {
  if (err instanceof Error) {
    if (err.name === 'DangerousOperationException') throw err
    if (err.message.startsWith('Could not find @atlex/orm')) throw err
    if (err.message.includes('No database bootstrap found')) throw err
    if (err.message.includes('Could not resolve the project directory')) throw err
    if (err.message.startsWith('Failed to load database bootstrap')) throw err
  }
  throw wrapWithDatabaseHint(err)
}

export function migrateCommand(): Command {
  const cmd = new Command('migrate')
  cmd.description('Run database migrations')
  cmd.action(async () => {
    const cwd = resolveProjectCwd()
    let orm: AtlexOrm | undefined
    let connectionName: string | undefined
    try {
      orm = await loadAppOrm(cwd)
      await ensureConnection(cwd, orm)
      const cfg = await loadAtlexConfig(cwd)
      const mrOpts = migrationRunnerOptions(cwd, cfg)
      connectionName = mrOpts.connectionName
      const runner = new orm.MigrationRunner(mrOpts)
      const { ran, batch, migrationTableCreated } = await runner.migrate()
      if (migrationTableCreated) {
        log.info('Migration table created.')
      }
      outro(
        ran.length === 0
          ? 'Nothing to migrate.'
          : `Migrated ${ran.length} file(s) in batch ${batch}.`,
      )
    } catch (e) {
      rethrowUnlessSetupError(e)
    } finally {
      if (orm !== undefined) await closeMigrateConnection(orm, connectionName)
    }
  })
  return cmd
}

export function migrateRollbackCommand(): Command {
  const cmd = new Command('migrate:rollback')
  cmd.description('Rollback the last migration batch')
  cmd.action(async () => {
    const cwd = resolveProjectCwd()
    let orm: AtlexOrm | undefined
    let connectionName: string | undefined
    try {
      orm = await loadAppOrm(cwd)
      await ensureConnection(cwd, orm)
      const cfg = await loadAtlexConfig(cwd)
      const mrOpts = migrationRunnerOptions(cwd, cfg)
      connectionName = mrOpts.connectionName
      const runner = new orm.MigrationRunner(mrOpts)
      const { rolledBack, batch } = await runner.rollback()
      outro(
        rolledBack.length === 0
          ? 'Nothing to rollback.'
          : `Rolled back ${rolledBack.length} file(s) from batch ${batch}.`,
      )
    } catch (e) {
      rethrowUnlessSetupError(e)
    } finally {
      if (orm !== undefined) await closeMigrateConnection(orm, connectionName)
    }
  })
  return cmd
}

export function migrateResetCommand(): Command {
  const cmd = new Command('migrate:reset')
  cmd.description('Rollback all migrations')
  cmd.action(async () => {
    const cwd = resolveProjectCwd()
    let orm: AtlexOrm | undefined
    let connectionName: string | undefined
    try {
      orm = await loadAppOrm(cwd)
      await confirmUnsafeIfProduction(orm, 'This will rollback ALL migrations.')
      await ensureConnection(cwd, orm)
      const cfg = await loadAtlexConfig(cwd)
      const mrOpts = migrationRunnerOptions(cwd, cfg)
      connectionName = mrOpts.connectionName
      const runner = new orm.MigrationRunner(mrOpts)
      const { rolledBack } = await runner.reset()
      outro(
        rolledBack.length === 0
          ? 'Nothing to reset.'
          : `Rolled back ${rolledBack.length} migration(s).`,
      )
    } catch (e) {
      rethrowUnlessSetupError(e)
    } finally {
      if (orm !== undefined) await closeMigrateConnection(orm, connectionName)
    }
  })
  return cmd
}

export function migrateRefreshCommand(): Command {
  const cmd = new Command('migrate:refresh')
  cmd.description('Reset and re-run all migrations')
  cmd.action(async () => {
    const cwd = resolveProjectCwd()
    let orm: AtlexOrm | undefined
    let connectionName: string | undefined
    try {
      orm = await loadAppOrm(cwd)
      await confirmUnsafeIfProduction(orm, 'This will rollback ALL migrations and re-run them.')
      await ensureConnection(cwd, orm)
      const cfg = await loadAtlexConfig(cwd)
      const mrOpts = migrationRunnerOptions(cwd, cfg)
      connectionName = mrOpts.connectionName
      const runner = new orm.MigrationRunner(mrOpts)
      await runner.refresh()
      outro('Migrations refreshed.')
    } catch (e) {
      rethrowUnlessSetupError(e)
    } finally {
      if (orm !== undefined) await closeMigrateConnection(orm, connectionName)
    }
  })
  return cmd
}

export function migrateFreshCommand(): Command {
  const cmd = new Command('migrate:fresh')
  cmd.description('Drop all tables and re-run all migrations')
  cmd.action(async () => {
    const cwd = resolveProjectCwd()
    let orm: AtlexOrm | undefined
    let connectionName: string | undefined
    try {
      orm = await loadAppOrm(cwd)
      await confirmUnsafeIfProduction(orm, 'This will DROP ALL TABLES and re-run all migrations.')
      await ensureConnection(cwd, orm)
      const cfg = await loadAtlexConfig(cwd)
      const mrOpts = migrationRunnerOptions(cwd, cfg)
      connectionName = mrOpts.connectionName
      const runner = new orm.MigrationRunner(mrOpts)
      await runner.fresh()
      outro('Database wiped and migrations re-run.')
    } catch (e) {
      rethrowUnlessSetupError(e)
    } finally {
      if (orm !== undefined) await closeMigrateConnection(orm, connectionName)
    }
  })
  return cmd
}

export function migrateStatusCommand(): Command {
  const cmd = new Command('migrate:status')
  cmd.description('Show migration status')
  cmd.action(async () => {
    const cwd = resolveProjectCwd()
    let orm: AtlexOrm | undefined
    let connectionName: string | undefined
    try {
      orm = await loadAppOrm(cwd)
      await ensureConnection(cwd, orm)
      const cfg = await loadAtlexConfig(cwd)
      const mrOpts = migrationRunnerOptions(cwd, cfg)
      connectionName = mrOpts.connectionName
      const runner = new orm.MigrationRunner(mrOpts)
      const rows = await runner.status()

      const lines: string[] = []
      lines.push('Ran | Migration | Batch')
      lines.push('--- | --------- | -----')
      for (const r of rows) {
        lines.push(`${r.ran ? 'Y' : 'N'} | ${r.migration} | ${r.batch ?? '-'}`)
      }

      console.log(lines.join('\n'))
    } catch (e) {
      rethrowUnlessSetupError(e)
    } finally {
      if (orm !== undefined) await closeMigrateConnection(orm, connectionName)
    }
  })
  return cmd
}
