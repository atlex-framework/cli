/**
 * Turn low-level driver errors into actionable migrate CLI hints.
 */

function has(err: unknown, substr: string): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return m.includes(substr)
}

function code(err: unknown): string | undefined {
  if (err !== null && typeof err === 'object' && 'code' in err) {
    const c = (err as { code: unknown }).code
    return typeof c === 'string' ? c : undefined
  }
  return undefined
}

export function explainDatabaseFailure(err: unknown): string {
  const c = code(err)

  if (c === 'ECONNREFUSED' || has(err, 'ECONNREFUSED')) {
    return [
      'Could not connect to the database (connection refused).',
      'Is the server running? If this project includes docker-compose.yml, try: docker compose up -d',
      'Then check host/port in .env match the container (e.g. localhost:5432 or localhost:3306).',
    ].join('\n')
  }

  if (c === '28P01' || has(err, 'password authentication failed')) {
    return [
      'PostgreSQL rejected the username or password.',
      'Verify DB_USERNAME and DB_PASSWORD match your Postgres user (see .env.example and docker-compose.yml if you use Docker).',
    ].join('\n')
  }

  if (c === 'ER_ACCESS_DENIED_ERROR' || has(err, 'Access denied for user')) {
    return [
      'MySQL rejected the credentials.',
      'Check DB_USER, DB_PASSWORD, and DB_NAME in .env — they should match docker-compose.yml if you use Docker.',
    ].join('\n')
  }

  if (c === 'ENOTFOUND' || has(err, 'getaddrinfo ENOTFOUND')) {
    return [
      'Database hostname could not be resolved.',
      'Check DB_HOST (and DB_PORT) in .env.',
    ].join('\n')
  }

  if (c === 'ETIMEDOUT' || has(err, 'ETIMEDOUT')) {
    return [
      'Database connection timed out.',
      'Check network, firewall, and that the DB host/port in .env is correct.',
    ].join('\n')
  }

  if (has(err, 'SQLITE_CANTOPEN') || has(err, 'unable to open database file')) {
    return [
      'SQLite could not open the database file.',
      'Check DATABASE_URL path exists and is writable, or create the parent directory.',
    ].join('\n')
  }

  return ''
}

export function wrapWithDatabaseHint(err: unknown): Error {
  const hint = explainDatabaseFailure(err)
  const base = err instanceof Error ? err.message : String(err)
  const message = hint.length > 0 ? `${hint}\n\nTechnical detail: ${base}` : base
  return new Error(message, { cause: err })
}
