/**
 * Split a CLI name into lowercase word segments (handles snake, kebab, camel, Pascal).
 *
 * @param input - Raw user input (e.g. `user_profile`, `UserProfile`, `userProfile`).
 * @returns Word segments in lower case.
 */
export function splitNameWords(input: string): string[] {
  const trimmed = input.trim()
  if (trimmed === '') return []

  if (/[_\s-]/.test(trimmed)) {
    return trimmed
      .split(/[_\s-]+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 0)
  }

  const spaced = trimmed
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')

  const parts = spaced
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0)

  return parts.length > 0 ? parts : [trimmed.toLowerCase()]
}

function capitalizeWord(word: string): string {
  if (word.length === 0) return word
  return word[0]!.toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * Convert a name to PascalCase (e.g. `user_profile` → `UserProfile`).
 *
 * @param input - Raw user input.
 * @returns PascalCase identifier, or empty string when input is empty/whitespace.
 */
export function toPascalCase(input: string): string {
  return splitNameWords(input).map(capitalizeWord).join('')
}

/**
 * Convert a name to camelCase (e.g. `user_profile` → `userProfile`).
 *
 * @param input - Raw user input.
 * @returns camelCase identifier, or empty string when input is empty/whitespace.
 */
export function toCamelCase(input: string): string {
  const pascal = toPascalCase(input)
  if (pascal.length === 0) return ''
  return pascal[0]!.toLowerCase() + pascal.slice(1)
}

/**
 * Convert a name to snake_case (e.g. `UserProfile` → `user_profile`).
 *
 * @param input - Raw user input.
 * @returns snake_case identifier, or empty string when input is empty/whitespace.
 */
export function toSnakeCase(input: string): string {
  return splitNameWords(input).join('_')
}

/**
 * Convert a name to kebab-case (e.g. `UserProfile` → `user-profile`).
 *
 * @param input - Raw user input.
 * @returns kebab-case identifier, or empty string when input is empty/whitespace.
 */
export function toKebabCase(input: string): string {
  return splitNameWords(input).join('-')
}

/**
 * Convert a name to SCREAMING_SNAKE_CASE (e.g. `redis` → `REDIS`, `my_config` → `MY_CONFIG`).
 *
 * @param input - Raw user input.
 * @returns Uppercase snake env prefix.
 */
export function toScreamingSnakeCase(input: string): string {
  return splitNameWords(input).join('_').toUpperCase()
}

/**
 * If `pascal` ends with `suffix`, remove it once (e.g. `UserController` + `Controller` → `User`).
 *
 * @param pascal - PascalCase base string.
 * @param suffix - PascalCase suffix without leading lowercase.
 * @returns Root PascalCase string.
 */
export function stripTrailingSuffix(pascal: string, suffix: string): string {
  if (pascal.length <= suffix.length || !pascal.endsWith(suffix)) return pascal
  const next = pascal.slice(0, -suffix.length)
  return next.length > 0 ? next : pascal
}

/**
 * Build a migration filename timestamp: `YYYY_MM_DD_HHMMSS` (UTC).
 *
 * @param date - Reference time; defaults to now.
 * @returns Timestamp segment used before the descriptive migration name.
 */
export function formatMigrationTimestamp(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}_${pad(date.getUTCMonth() + 1)}_${pad(date.getUTCDate())}_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
}

/**
 * Plural snake_case table name from a model class name (e.g. `User` → `users`).
 *
 * @param className - PascalCase model class (e.g. `User`, `UserProfile`).
 */
export function pluralSnakeTableFromModelClass(className: string): string {
  const singular = toSnakeCase(className)
  if (singular.length === 0) return 'items'
  if (singular.endsWith('s')) return singular
  return `${singular}s`
}

/**
 * Default `create_*_table` migration name for a model class (`User` → `create_users_table`).
 *
 * @param className - PascalCase model class.
 */
export function createTableMigrationNameForModel(className: string): string {
  return `create_${pluralSnakeTableFromModelClass(className)}_table`
}
