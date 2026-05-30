import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { intro, outro } from '@clack/prompts'
import { Command } from 'commander'

import { resolveProjectCwd } from '../projectCwd.js'

import { bootstrapDatabaseFromApp, loadAppOrm } from './migrate.js'

type SeederModule = Record<string, unknown>

function seederBaseName(className: string): string {
  return className.endsWith('Seeder') ? className : `${className}Seeder`
}

/**
 * TypeScript apps compile seeders to `dist/database/seeders/*.js`.
 * Loading `database/seeders/*.ts` breaks ESM imports that use `.js` extensions.
 */
function resolveSeederPath(cwd: string, className: string): string {
  const base = seederBaseName(className)
  const candidates = [
    path.join(cwd, 'dist', 'database', 'seeders', `${base}.js`),
    path.join(cwd, 'database', 'seeders', `${base}.ts`),
    path.join(cwd, 'database', 'seeders', `${base}.js`),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  throw new Error(
    [
      `Seeder not found: ${base}`,
      'Searched:',
      ...candidates.map((c) => `  - ${c}`),
      '',
      'Create one with `atlex make:seeder ' +
        base.replace(/Seeder$/, '') +
        '` or run `pnpm exec tsc -p tsconfig.json` so dist/ seeders exist.',
    ].join('\n'),
  )
}

/** Compile seeders when the project uses TypeScript and dist output is missing. */
function ensureSeedersCompiled(cwd: string, className: string): void {
  const base = seederBaseName(className)
  const distJs = path.join(cwd, 'dist', 'database', 'seeders', `${base}.js`)
  if (existsSync(distJs)) {
    return
  }
  if (!existsSync(path.join(cwd, 'tsconfig.json'))) {
    return
  }

  execSync('npx tsc -p tsconfig.json', { cwd, stdio: 'inherit' })
  copySeedDataAssets(cwd)
}

/** Copy JSON (and similar) seed assets from `database/data` into `dist/database/data`. */
function copySeedDataAssets(cwd: string): void {
  const srcDir = path.join(cwd, 'database', 'data')
  const destDir = path.join(cwd, 'dist', 'database', 'data')
  if (!existsSync(srcDir)) {
    return
  }

  mkdirSync(destDir, { recursive: true })
  for (const name of readdirSync(srcDir)) {
    if (!name.endsWith('.json')) {
      continue
    }
    const src = path.join(srcDir, name)
    const dest = path.join(destDir, name)
    copyFileSync(src, dest)
  }
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
    ensureSeedersCompiled(cwd, options.class)
    copySeedDataAssets(cwd)

    const orm = await loadAppOrm(cwd)
    await bootstrapDatabaseFromApp(cwd)
    orm.ConnectionRegistry.instance().default()

    const seederPath = resolveSeederPath(cwd, options.class)
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
