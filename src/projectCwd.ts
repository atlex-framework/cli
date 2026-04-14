import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

/**
 * Resolves the directory commands should treat as the project root (where `package.json` / `main.js` live).
 *
 * Normally this is `process.cwd()`. If the cwd is invalid (deleted folder, broken shell state), Node throws
 * `uv_cwd` / `ENOENT`; we then try `ATLEX_PROJECT_DIR`, `INIT_CWD` (pnpm/npm), and `PWD` so scripts and
 * generators still have a stable path when possible.
 */
export function resolveProjectCwd(): string {
  try {
    return process.cwd()
  } catch {
    const fallbacks = [process.env.ATLEX_PROJECT_DIR, process.env.INIT_CWD, process.env.PWD].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    )

    for (const raw of fallbacks) {
      const resolved = path.resolve(raw.trim())
      if (existsSync(resolved)) return resolved
    }

    throw new Error(
      [
        'Could not resolve the project directory: the current working directory is no longer valid (uv_cwd ENOENT).',
        'cd into your app folder, or set ATLEX_PROJECT_DIR to the app root, then run again.',
      ].join(' '),
    )
  }
}
