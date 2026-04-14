import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { Command } from 'commander'

import { resolveProjectCwd } from '../projectCwd.js'

import { loadAppOrm } from './migrate.js'

/**
 * @returns Commander command for `auth:clear-resets`.
 */
export function authClearResetsCommand(): Command {
  return new Command('auth:clear-resets')
    .description('Delete expired rows from the password_resets table')
    .option('-t, --table <name>', 'password_resets table name', 'password_resets')
    .option(
      '-e, --expire-minutes <n>',
      'Retention window in minutes (rows older than this are deleted)',
      '1440',
    )
    .action(async (options: { table?: string; expireMinutes?: string }) => {
      const cwd = resolveProjectCwd()
      const { db } = await loadAppOrm(cwd)
      const bootstrap = path.join(cwd, 'bootstrap', 'database.js')
      await import(pathToFileURL(bootstrap).href)
      const table = options.table ?? 'password_resets'
      const minutes = Number(options.expireMinutes ?? '1440')
      const cutoff = new Date(Date.now() - minutes * 60 * 1000)
      const deleted = await db(table).where('created_at', '<', cutoff).delete()
      process.stdout.write(
        `Deleted ${String(deleted)} expired password reset row(s) from "${table}".\n`,
      )
    })
}
