import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { intro, outro } from '@clack/prompts'
import { Command } from 'commander'

import { resolveProjectCwd } from '../projectCwd.js'
import { resolveAppSourceExtension } from '../utils/projectLanguage.js'

import { bootstrapDatabaseFromApp, loadAppOrm } from './migrate.js'

type SeederModule = Record<string, unknown>

function resolveSeederPath(cwd: string, ext: 'ts' | 'js', className: string): string {
  const base = className.endsWith('Seeder') ? className : `${className}Seeder`
  const file = `${base}.${ext}`
  const candidates = [
    path.join(cwd, 'dist', 'database', 'seeders', file),
    path.join(cwd, 'database', 'seeders', file),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      return p
    }
  }
  throw new Error(
    [
      `Seeder not found: ${file}`,
      'Searched:',
      ...candidates.map((c) => `  - ${c}`),
      '',
      'Create one with `atlex make:seeder ' +
        base.replace(/Seeder$/, '') +
        '` or build TypeScript output to dist/.',
    ].join('\n'),
  )
}

function isConstructor(value: unknown): value is new () => { run(): void | Promise<void> } {
  return typeof value === 'function'
}

/**
 * Run a seeder module: prefers `export default class … { run() }`, else legacy `export async function run`.
 */
async function invokeSeederModule(seederPath: string, mod: SeederModule): Promise<void> {
  const DefaultExport = mod.default
  if (isConstructor(DefaultExport)) {
    const instance = new DefaultExport()
    if (typeof instance.run !== 'function') {
      throw new Error(`Seeder default export must be a class with run(): ${seederPath}`)
    }
    await instance.run()
    return
  }
  const runFn = mod.run
  if (typeof runFn === 'function') {
    await (runFn as () => Promise<void>)()
    return
  }
  throw new Error(
    `Seeder module must export default class … extends Seeder { run() } or export async function run(): ${seederPath}`,
  )
}

/**
 * @returns Commander command for `db:seed`.
 */
export function dbSeedCommand(): Command {
  const cmd = new Command('db:seed')
  cmd.description(
    'Run database seeders under `database/seeders` (default export class with `run()`)',
  )
  cmd.option('--class <name>', 'Seeder class base name (default: DatabaseSeeder)', 'DatabaseSeeder')
  cmd.action(async (options: { class: string }) => {
    const cwd = resolveProjectCwd()
    intro('db:seed')
    const ext = resolveAppSourceExtension(cwd)
    const orm = await loadAppOrm(cwd)
    await bootstrapDatabaseFromApp(cwd)
    orm.ConnectionRegistry.instance().default()

    const seederPath = resolveSeederPath(cwd, ext, options.class)
    const mod = (await import(pathToFileURL(seederPath).href)) as SeederModule
    await invokeSeederModule(seederPath, mod)
    try {
      await orm.ConnectionRegistry.instance().default().close()
    } catch {
      // ignore
    }
    outro('Seeding complete.')
  })
  return cmd
}
