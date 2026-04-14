import path from 'node:path'

import { AtlexCliError } from '../errors/AtlexCliError.js'

import { toPascalCase } from './naming.js'

export interface ParsedQualifiedMakeName {
  /** Subdirectory segments under the generator root, each PascalCase. */
  subdirectories: string[]
  /** Final segment only (e.g. `TestController`, `User`), not normalized to PascalCase yet. */
  leafRaw: string
}

/**
 * Parse `Admin/UserController` or `API/V1/Post` style names for `make:*` commands.
 *
 * @param raw - User input; may use `/` or `\\` as separators.
 * @returns Directory segments (normalized PascalCase) and the leaf segment.
 * @throws AtlexCliError - Empty, traversal, or invalid segments.
 */
export function parseQualifiedMakeName(raw: string): ParsedQualifiedMakeName {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    throw new AtlexCliError('E_INVALID_NAME', 'Name must not be empty.')
  }

  const normalized = trimmed.replace(/\\/g, '/')
  if (normalized.includes('..')) {
    throw new AtlexCliError('E_INVALID_NAME', 'Name cannot contain "..".')
  }

  const segments = normalized
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (segments.length === 0) {
    throw new AtlexCliError('E_INVALID_NAME', 'Name must contain at least one path segment.')
  }

  const leafRaw = segments[segments.length - 1]!
  if (leafRaw.length === 0) {
    throw new AtlexCliError('E_INVALID_NAME', 'The final path segment must not be empty.')
  }

  const dirParts = segments.slice(0, -1)
  const subdirectories: string[] = []
  for (const dir of dirParts) {
    const pascalDir = toPascalCase(dir)
    if (pascalDir.length === 0) {
      throw new AtlexCliError(
        'E_INVALID_NAME',
        `Invalid directory segment "${dir}" — use letters, numbers, hyphens, or underscores.`,
      )
    }
    subdirectories.push(pascalDir)
  }

  return { subdirectories, leafRaw }
}

/**
 * Join generator root with optional nested directories (POSIX-style for display; `path.join` on write).
 *
 * @param baseDir - Generator root (e.g. `app/Http/Controllers`).
 * @param subdirectories - Parsed PascalCase folder names.
 * @param fileName - File base + extension (e.g. `UserController.ts`).
 */
export function joinMakeOutputRelativePath(
  baseDir: string,
  subdirectories: string[],
  fileName: string,
): string {
  return path.join(baseDir, ...subdirectories, fileName)
}
