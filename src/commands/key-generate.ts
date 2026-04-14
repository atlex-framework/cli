import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { Encrypter } from '@atlex/encryption'
import { confirm, isCancel } from '@clack/prompts'
import { Command } from 'commander'

const APP_KEY_LINE = /^APP_KEY=(.*)$/m

function upsertAppKeyInEnv(contents: string, newKey: string): string {
  if (APP_KEY_LINE.test(contents)) {
    return contents.replace(APP_KEY_LINE, `APP_KEY=${newKey}`)
  }
  const trimmed = contents.endsWith('\n') ? contents : `${contents}\n`
  return `${trimmed}APP_KEY=${newKey}\n`
}

/**
 * `atlex key:generate` — create or replace `APP_KEY` in `.env`.
 */
export function keyGenerateCommand(): Command {
  const cmd = new Command('key:generate')
  cmd.description('Generate APP_KEY (AES-256) and write to .env')
  cmd.option('--show', 'Print the key only; do not write .env', false)
  cmd.option('--force', 'Overwrite existing APP_KEY without confirmation', false)
  cmd.action(async (opts: { show?: boolean; force?: boolean }) => {
    const key = Encrypter.generateKey()
    if (opts.show) {
      process.stdout.write(`${key}\n`)
      return
    }

    const envPath = join(process.cwd(), '.env')
    const hasFile = existsSync(envPath)
    let body = ''
    if (hasFile) {
      body = readFileSync(envPath, 'utf8')
    }

    const hasKey = APP_KEY_LINE.test(body)
    if (hasKey && !opts.force) {
      const ok = await confirm({
        message: 'APP_KEY already exists in .env. Overwrite?',
        initialValue: false,
      })
      if (isCancel(ok) || !ok) {
        process.stderr.write('Aborted.\n')
        process.exitCode = 1
        return
      }
    }

    const next = hasFile ? upsertAppKeyInEnv(body, key) : `APP_KEY=${key}\n`
    writeFileSync(envPath, next, 'utf8')
    process.stdout.write(`Application key set successfully: ${key}\n`)
  })
  return cmd
}
