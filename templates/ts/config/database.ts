import { env } from '@atlex/config'
import type { DatabaseConfig as OrmDatabaseConfig } from '@atlex/orm'

const sqliteDatabase = env('DATABASE_URL', 'database.sqlite') as string

export default {
  default: env('DB_CONNECTION', 'sqlite'),
  pagination: {
    perPage: 15,
  },
  connections: {
    sqlite: {
      driver: 'better-sqlite3' as const,
      database: sqliteDatabase,
    },
  },
}

/**
 * Maps environment variables to @atlex/orm connection settings (used by bootstrap).
 */
export function getOrmDatabaseConfig(): OrmDatabaseConfig {
  return {
    driver: 'better-sqlite3',
    database: sqliteDatabase,
  }
}
