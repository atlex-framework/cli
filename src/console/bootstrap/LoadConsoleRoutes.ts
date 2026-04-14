import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function isNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return 'code' in err && (err as unknown as { code?: unknown }).code === 'ENOENT'
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

/**
 * Safely import a console routes file (routes/console.ts|js).
 *
 * - Missing file is not an error.
 * - Import errors are surfaced as a single error message (caller decides how to log).
 */
export async function loadConsoleRoutes(options: {
  readonly basePath: string
  readonly routePath: string // e.g. "routes/console"
}): Promise<{ loaded: boolean; error: Error | null; resolvedPath: string | null }> {
  const base = path.resolve(options.basePath)
  const rel = options.routePath.replace(/(\.ts|\.js|\.mjs|\.cjs)$/i, '')

  const candidates = [
    path.join(base, 'dist', `${rel}.js`),
    path.join(base, `${rel}.js`),
    path.join(base, `${rel}.ts`),
  ]

  const existing: string[] = []
  for (const c of candidates) {
    if (await pathExists(c)) existing.push(c)
  }

  if (existing.length === 0) {
    return { loaded: false, error: null, resolvedPath: null }
  }

  const resolved = existing[0]!
  try {
    await import(pathToFileURL(resolved).href)
    return { loaded: true, error: null, resolvedPath: resolved }
  } catch (err) {
    if (isNotFound(err)) return { loaded: false, error: null, resolvedPath: null }
    const e = err instanceof Error ? err : new Error(String(err))
    return { loaded: false, error: e, resolvedPath: resolved }
  }
}
