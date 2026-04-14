import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * `atlex new` resolves templates from `../../templates/<lang>` relative to
 * `dist/commands/new.js`. Those directories must ship in the published tarball
 * (`package.json` "files").
 */
describe('new command template directories', () => {
  it('exposes templates/js and templates/ts at the CLI package root', () => {
    const testsDir = path.dirname(fileURLToPath(import.meta.url))
    const cliRoot = path.resolve(testsDir, '..')
    expect(existsSync(path.join(cliRoot, 'templates', 'js'))).toBe(true)
    expect(existsSync(path.join(cliRoot, 'templates', 'ts'))).toBe(true)
  })
})
