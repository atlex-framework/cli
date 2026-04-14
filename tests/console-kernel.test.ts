import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { Application } from '@atlex/core'
import { Artisan, ConsoleKernel } from '../dist/index.js'

class TestKernel extends ConsoleKernel {}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'atlex-cli-'))
}

describe('ConsoleKernel + routes/console', () => {
  it('loads routes/console.ts and registers closure command', async () => {
    const dir = await makeTempDir()
    await fs.mkdir(path.join(dir, 'routes'), { recursive: true })

    const distIndex = path.resolve(__dirname, '..', 'dist', 'index.js')
    const artisanImport = pathToFileURL(distIndex).href

    await fs.writeFile(
      path.join(dir, 'routes', 'console.js'),
      [
        `import { Artisan } from ${JSON.stringify(artisanImport)};`,
        'Artisan.command("hello {name}", (cmd) => { cmd.info("hi " + (cmd.argument("name") ?? "")); }).purpose("Say hello");',
        '',
      ].join('\n'),
      'utf8',
    )

    const app = new Application()
    const logs: string[] = []
    app.container.singleton('logger', () => ({
      debug: (m: string) => logs.push(`debug:${m}`),
      warn: (m: string) => logs.push(`warn:${m}`),
    }))
    const kernel = new TestKernel()
    kernel.setApplication(app, { basePath: dir, version: '0.1.0-beta' })

    const exit = await kernel.handle(['hello', 'world'])
    const joined = logs.join('\n')
    expect(joined).not.toMatch(/Failed to load console routes/)
    expect(joined).not.toMatch(/Console routes not found/)
    expect(exit).toBe(0)
    expect(kernel.output()).toContain('hi world')
    expect(Artisan.all()).toContain('hello')
  })

  it('does not crash when routes/console is missing', async () => {
    const dir = await makeTempDir()
    const app = new Application()
    const kernel = new TestKernel()
    kernel.setApplication(app, { basePath: dir, version: '0.1.0-beta' })

    const exit = await kernel.handle(['list'])
    expect(exit).toBe(0)
    const out = kernel.output()
    expect(out).toContain('Available commands:')
    expect(out).toContain('make:controller')
    expect(out).toContain('migrate')
    expect(out).toContain('queue:work')
    expect(out).toContain('serve')
    expect(out).not.toContain('inspire')
  })
})
