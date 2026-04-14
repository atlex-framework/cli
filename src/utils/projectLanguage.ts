import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Resolve whether generated app sources should use `.ts` or `.js`.
 *
 * Heuristic: `tsconfig.json` at the project root implies a TypeScript app (e.g. `atlex new` + TS).
 * Otherwise treat as JavaScript (e.g. `atlex new` + JS).
 *
 * @param projectRoot - Application root (typically `process.cwd()`).
 * @returns File extension without the dot.
 */
export function resolveAppSourceExtension(projectRoot: string): 'ts' | 'js' {
  const tsconfig = path.join(projectRoot, 'tsconfig.json')
  if (existsSync(tsconfig)) {
    return 'ts'
  }
  return 'js'
}

/**
 * Infer the database table name from a `create_*_table` migration name.
 *
 * @param migrationSnake - Normalized migration name, e.g. `create_users_table`.
 * @returns Table name (e.g. `users`), or `null` if the pattern does not match.
 *
 * @example
 * inferTableFromCreateMigration("create_users_table") // "users"
 * inferTableFromCreateMigration("create_user_profiles_table") // "user_profiles"
 */
export function inferTableFromCreateMigration(migrationSnake: string): string | null {
  const m = /^create_(.+)_table$/.exec(migrationSnake)
  return m && m[1]!.length > 0 ? m[1]! : null
}
