import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Reads the semver from this package's `package.json` (the `@atlex/cli` package).
 *
 * @returns Version string, or `0.0.0` if missing or invalid.
 */
export function readCliPackageVersion(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const pkgPath = path.resolve(dir, '..', 'package.json')
  try {
    const raw = readFileSync(pkgPath, 'utf8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}
