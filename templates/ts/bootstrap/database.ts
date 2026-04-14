import { loadEnv } from '@atlex/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConnectionRegistry } from '@atlex/orm'
import { getOrmDatabaseConfig } from '../config/database.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnv(root)

ConnectionRegistry.instance().register('default', getOrmDatabaseConfig())
