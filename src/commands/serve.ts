import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { Command } from 'commander'
import { execa } from 'execa'

import { resolveProjectCwd } from '../projectCwd.js'

type PackageJson = {
  scripts?: Record<string, string>
}

type PackageManager = 'pnpm' | 'yarn' | 'npm'

/**
 * Chooses which package manager to use for `run start`, based on lockfiles in the app root.
 * Matches what contributors typically use after `pnpm install` / `npm install`.
 */
function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml')) || existsSync(path.join(cwd, 'pnpm-lock.yml'))) {
    return 'pnpm'
  }
  if (existsSync(path.join(cwd, 'yarn.lock'))) {
    return 'yarn'
  }
  return 'npm'
}

/**
 * Returns the `atlex serve` Commander subcommand.
 *
 * Runs the app’s **`start`** script from `package.json` (same as `pnpm start` / `npm run start`).
 * Use this from your Atlex application root after `pnpm install` (or npm/yarn).
 *
 * @example
 * ```bash
 * cd my-app
 * atlex serve
 * atlex serve --port 4000
 * ```
 */
export function serveCommand(): Command {
  return new Command('serve')
    .description('Start the HTTP application (runs the package.json `start` script)')
    .option('-p, --port <port>', 'Override PORT for this run (e.g. 4000)')
    .action(async (opts: { port?: string }) => {
      const cwd = resolveProjectCwd()
      const pkgPath = path.join(cwd, 'package.json')
      if (!existsSync(pkgPath)) {
        throw new Error(
          'No package.json here. Run `atlex serve` from your Atlex app root (the folder that contains main.js or dist/main.js).',
        )
      }

      let pkg: PackageJson
      try {
        pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as PackageJson
      } catch {
        throw new Error('Could not read or parse package.json.')
      }

      const start = pkg.scripts?.start?.trim()
      if (start === undefined || start.length === 0) {
        throw new Error(
          'Missing `scripts.start` in package.json. Add one, for example `"start": "node main.js"` or `"start": "node --enable-source-maps dist/main.js"` for TypeScript.',
        )
      }

      const pm = detectPackageManager(cwd)
      const env =
        opts.port !== undefined && opts.port !== ''
          ? { ...process.env, PORT: opts.port }
          : process.env

      const run = async (command: string, args: string[]): Promise<void> => {
        const result = await execa(command, args, {
          cwd,
          env,
          stdio: 'inherit',
          reject: false,
        })
        if (result.exitCode === null) {
          process.exitCode = 1
          return
        }
        if (result.exitCode !== 0) {
          process.exitCode = result.exitCode
        }
      }

      if (pm === 'pnpm') {
        await run('pnpm', ['run', 'start'])
        return
      }
      if (pm === 'yarn') {
        await run('yarn', ['run', 'start'])
        return
      }
      await run('npm', ['run', 'start'])
    })
}
