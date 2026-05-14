import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scaffoldNewApplication } from '../src/commands/new.js'

let root: string

const testsDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(testsDir, '..')

async function readScaffoldFile(appName: string, filePath: string): Promise<string> {
  return readFile(path.join(root, appName, filePath), 'utf8')
}

describe('new command API route scaffold', () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'atlex-api-routes-'))

    await scaffoldNewApplication({
      appName: 'ts-app',
      targetDir: path.join(root, 'ts-app'),
      language: 'ts',
      registryDependencies: true,
      runPnpmInstall: false,
    })

    await scaffoldNewApplication({
      appName: 'js-app',
      targetDir: path.join(root, 'js-app'),
      language: 'js',
      registryDependencies: true,
      runPnpmInstall: false,
    })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('creates a TypeScript API route file under /api', async () => {
    const apiRoute = await readScaffoldFile('ts-app', path.join('routes', 'api.ts'))

    expect(apiRoute).toContain("Route.group('/api', () => {")
    expect(apiRoute).toContain("Route.get('/health', (_req: Request, res: Response) => {")
  })

  it('creates a JavaScript API route file under /api', async () => {
    const apiRoute = await readScaffoldFile('js-app', path.join('routes', 'api.js'))

    expect(apiRoute).toContain("Route.group('/api', () => {")
    expect(apiRoute).toContain("Route.get('/health', (_req, res) => {")
  })

  it('loads generated API routes after web routes and before boot', async () => {
    const tsMain = await readScaffoldFile('ts-app', 'main.ts')
    const tsWebImportIndex = tsMain.indexOf('import "./routes/web.js";')
    const tsApiImportIndex = tsMain.indexOf('import "./routes/api.js";')
    const tsBootIndex = tsMain.indexOf('app.boot();')

    expect(tsWebImportIndex).toBeGreaterThanOrEqual(0)
    expect(tsApiImportIndex).toBeGreaterThan(tsWebImportIndex)
    expect(tsBootIndex).toBeGreaterThan(tsApiImportIndex)

    const jsMain = await readScaffoldFile('js-app', 'main.js')
    const jsWebImportIndex = jsMain.indexOf('import "./routes/web.js";')
    const jsApiImportIndex = jsMain.indexOf('import "./routes/api.js";')
    const jsBootIndex = jsMain.indexOf('app.boot();')

    expect(jsWebImportIndex).toBeGreaterThanOrEqual(0)
    expect(jsApiImportIndex).toBeGreaterThan(jsWebImportIndex)
    expect(jsBootIndex).toBeGreaterThan(jsApiImportIndex)
  })

  it('keeps static API route templates and main templates aligned', async () => {
    const tsApiTemplate = await readFile(
      path.join(cliRoot, 'templates', 'ts', 'routes', 'api.ts'),
      'utf8',
    )
    const jsApiTemplate = await readFile(
      path.join(cliRoot, 'templates', 'js', 'routes', 'api.js'),
      'utf8',
    )

    expect(tsApiTemplate).toContain("Route.group('/api', () => {")
    expect(jsApiTemplate).toContain("Route.group('/api', () => {")

    const tsMainTemplate = await readFile(path.join(cliRoot, 'templates', 'ts', 'main.ts'), 'utf8')
    const tsWebImportIndex = tsMainTemplate.indexOf("import './routes/web.js'")
    const tsApiImportIndex = tsMainTemplate.indexOf("import './routes/api.js'")
    const tsBootIndex = tsMainTemplate.indexOf('app.boot()')

    expect(tsWebImportIndex).toBeGreaterThanOrEqual(0)
    expect(tsApiImportIndex).toBeGreaterThan(tsWebImportIndex)
    expect(tsBootIndex).toBeGreaterThan(tsApiImportIndex)

    const jsMainTemplate = await readFile(path.join(cliRoot, 'templates', 'js', 'main.js'), 'utf8')
    const jsWebImportIndex = jsMainTemplate.indexOf("import './routes/web.js'")
    const jsApiImportIndex = jsMainTemplate.indexOf("import './routes/api.js'")
    const jsBootIndex = jsMainTemplate.indexOf('app.boot()')

    expect(jsWebImportIndex).toBeGreaterThanOrEqual(0)
    expect(jsApiImportIndex).toBeGreaterThan(jsWebImportIndex)
    expect(jsBootIndex).toBeGreaterThan(jsApiImportIndex)
  })
})
