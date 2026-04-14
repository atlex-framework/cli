import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { Application } from '@atlex/core'
import { CommandRegistry } from '../dist/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'atlex-cli-discovery-'))
}

describe('CommandRegistry.discover', () => {
  it('discovers enabled Command subclasses and ignores .d.ts / tests', async () => {
    const dir = await makeTempDir()
    await fs.mkdir(dir, { recursive: true })

    await fs.writeFile(
      path.join(dir, 'GoodCommand.js'),
      [
        `import { Command } from ${JSON.stringify(pathToFileURL(path.resolve(__dirname, '..', 'dist', 'index.js')).href)};`,
        'export class GoodCommand extends Command {',
        '  static signature = "good";',
        '  static description = "good";',
        "  handle() { this.info('ok'); }",
        '}',
        '',
      ].join('\n'),
      'utf8',
    )

    await fs.writeFile(path.join(dir, 'Ignore.d.ts'), 'export {};\n', 'utf8')
    await fs.writeFile(path.join(dir, 'Bad.test.js'), 'export {};\n', 'utf8')

    const app = new Application()
    app.container.singleton('logger', () => ({ debug: () => {}, warn: () => {} }))
    const registry = new CommandRegistry(app.container)

    await registry.discover(dir)
    expect(registry.has('good')).toBe(true)
  })

  it('discovers commands that do not extend Command (duplicate @atlex/cli module graph)', async () => {
    const dir = await makeTempDir()
    await fs.mkdir(dir, { recursive: true })

    await fs.writeFile(
      path.join(dir, 'StandaloneCommand.js'),
      [
        '// Simulates app code: no `extends Command` from the same module instance as the CLI.',
        'export class StandaloneCommand {',
        '  static signature = "standalone:run";',
        '  static description = "standalone";',
        '  handle() { return 0; }',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )

    const app = new Application()
    app.container.singleton('logger', () => ({ debug: () => {}, warn: () => {} }))
    const registry = new CommandRegistry(app.container)

    await registry.discover(dir)
    expect(registry.has('standalone:run')).toBe(true)
  })

  it('handles import errors gracefully', async () => {
    const dir = await makeTempDir()
    await fs.writeFile(path.join(dir, 'Broken.js'), 'export const x = ;\n', 'utf8')

    const app = new Application()
    app.container.singleton('logger', () => ({ debug: () => {}, warn: () => {} }))
    const registry = new CommandRegistry(app.container)

    await expect(registry.discover(dir)).resolves.toBeUndefined()
  })
})
