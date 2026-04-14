import { env } from '@atlex/config'

const sqliteDatabase = env('DATABASE_URL', 'database.sqlite')

export default {
  default: env('DB_CONNECTION', 'sqlite'),
  connections: {
    sqlite: {
      driver: 'better-sqlite3',
      database: sqliteDatabase,
    },
  },
}

/**
 * @returns {import("@atlex/orm").DatabaseConfig}
 */
export function getOrmDatabaseConfig() {
  return {
    driver: 'better-sqlite3',
    database: sqliteDatabase,
  }
}
