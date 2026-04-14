#!/usr/bin/env node
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import type { Application } from '@atlex/core'

import type { ConsoleKernel } from '../ConsoleKernel.js'
import { writeCliFatalError } from '../format-cli-fatal-error.js'

import { runLegacyCli } from './legacy-atlex.js'

type ApplicationCtor = new () => Application

/**
 * Load {@link Application} from the current project's `node_modules` when present.
 * The CLI binary lives under `@atlex/cli`; a static `import "@atlex/core"` would resolve
 * to the CLI's own dependency graph and can differ from the app's `@atlex/core` instance,
 * which breaks `Kernel.setApplication(app)` and fails silently after `process.exit(1)`.
 */
async function loadApplicationClass(cwd: string): Promise<ApplicationCtor> {
  const fromProject = path.join(cwd, 'node_modules', '@atlex/core', 'dist', 'index.js')
  if (existsSync(fromProject)) {
    const mod = (await import(pathToFileURL(fromProject).href)) as { Application: ApplicationCtor }
    return mod.Application
  }
  const mod = (await import('@atlex/core')) as { Application: ApplicationCtor }
  return mod.Application
}

async function loadAppConsoleKernelCtor(cwd: string): Promise<(new () => ConsoleKernel) | null> {
  const candidates = [
    path.join(cwd, 'dist', 'app', 'Console', 'Kernel.js'),
    path.join(cwd, 'app', 'Console', 'Kernel.js'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      const mod = (await import(pathToFileURL(p).href)) as unknown
      if (typeof mod === 'object' && mod !== null) {
        const m = mod as Record<string, unknown>
        const candidate = m.Kernel ?? m.default
        if (typeof candidate === 'function') return candidate as new () => ConsoleKernel
      }
    } catch {
      // ignore
    }
  }
  return null
}

/**
 * Prefer the app’s `ConsoleKernel` when `app/Console/Kernel` (or compiled `dist/...`) exists;
 * otherwise fall back to the standalone Commander program (e.g. `atlex new` before an app exists).
 */
async function main(): Promise<void> {
  const cwd = process.cwd()
  const KernelCtor = await loadAppConsoleKernelCtor(cwd)
  if (KernelCtor === null) {
    runLegacyCli(process.argv)
    return
  }

  const ApplicationClass = await loadApplicationClass(cwd)
  const app = new ApplicationClass()
  const kernel = new KernelCtor()
  kernel.setApplication(app, { basePath: cwd, version: '0.1.0-beta' })

  const exitCode = await kernel.handle(process.argv.slice(2))
  process.exit(typeof exitCode === 'number' && Number.isFinite(exitCode) ? exitCode : 1)
}

main().catch((err: unknown) => {
  writeCliFatalError(err)
  process.exit(1)
})
