# Configuration

Atlex's configuration system gives you a centralized, type-safe way to manage your application settings. Instead of scattering `process.env` calls across your codebase, you define configuration in `config/*.ts` files and access values through a clean dot-notation API.

## Installation

```bash
pnpm add @atlex/config
```

## How Configuration Works

Atlex loads configuration from TypeScript files in your `config/` directory at boot time. Each file exports a default object, and the filename becomes the top-level config key. Environment variables from your `.env` file are available to all config files via the `env()` helper.

```
config/
├── app.ts          → config.get('app.name')
├── database.ts     → config.get('database.default')
├── mail.ts         → config.get('mail.from.address')
└── cache.ts        → config.get('cache.default')
```

## Defining Configuration

### Configuration Files

Each config file exports a default object:

```typescript
// config/app.ts
import { env } from '@atlex/config'

export default {
  name: env('APP_NAME', 'My Atlex App'),
  env: env('APP_ENV', 'production'),
  debug: env('APP_DEBUG', 'false') === 'true',
  url: env('APP_URL', 'http://localhost:3000'),
  port: Number(env('APP_PORT', '3000')),
  key: env('APP_KEY', ''),
  timezone: env('TZ', 'UTC'),
}
```

```typescript
// config/database.ts
import { env } from '@atlex/config'

export default {
  default: env('DB_CONNECTION', 'postgres'),

  connections: {
    postgres: {
      driver: 'postgres',
      host: env('DB_HOST', '127.0.0.1'),
      port: Number(env('DB_PORT', '5432')),
      database: env('DB_DATABASE', 'atlex'),
      username: env('DB_USERNAME', 'root'),
      password: env('DB_PASSWORD', ''),
    },

    sqlite: {
      driver: 'sqlite',
      database: env('DB_DATABASE', 'database/database.sqlite'),
    },
  },
}
```

### Environment Variables

The `env()` function reads from `process.env` with an optional default value:

```typescript
import { env, envs, hasEnv } from '@atlex/config'

// Read a single variable
const appName = env('APP_NAME', 'Atlex')

// Read multiple variables at once
const vars = envs(['DB_HOST', 'DB_PORT', 'DB_DATABASE'])
// => { DB_HOST: '127.0.0.1', DB_PORT: '5432', DB_DATABASE: 'atlex' }

// Check if a variable is defined
if (hasEnv('REDIS_URL')) {
  // Redis is configured
}
```

### The .env File

Store environment-specific values in a `.env` file at your project root:

```
APP_NAME=My App
APP_ENV=local
APP_DEBUG=true
APP_KEY=base64:abc123...
APP_URL=http://localhost:3000

DB_CONNECTION=postgres
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=myapp
DB_USERNAME=postgres
DB_PASSWORD=secret

REDIS_URL=redis://localhost:6379
MAIL_DRIVER=smtp
```

Load your `.env` file early in your bootstrap:

```typescript
import { loadEnv } from '@atlex/config'

loadEnv() // Loads .env from the project root
loadEnv('.env.local') // Load a specific file
```

::: warning
Never commit your `.env` file to version control. Add it to `.gitignore` and provide a `.env.example` file as a template.
:::

## Reading Configuration

### The ConfigRepository

The `ConfigRepository` provides dot-notation access to all your configuration:

```typescript
import { ConfigRepository } from '@atlex/config'

const config = app.make(ConfigRepository)

// Read a value
const appName = config.get('app.name')
// => 'My Atlex App'

// Read with a fallback
const timezone = config.get('app.timezone', 'UTC')

// Read a nested value
const dbHost = config.get('database.connections.postgres.host')
// => '127.0.0.1'

// Check if a key exists
if (config.has('mail.from.address')) {
  // Mail is configured
}

// Get all configuration
const all = config.all()
```

### The config() Helper

Use the global `config()` helper function for quick access:

```typescript
import { config } from '@atlex/config'

const appName = config('app.name')
const dbHost = config('database.connections.postgres.host', 'localhost')
```

### Wildcard Access

Use `*` wildcards to read values across multiple keys:

```typescript
// Get the host from every database connection
const hosts = config.get('database.connections.*.host')
// => ['127.0.0.1', undefined] (for postgres and sqlite)

// Get all driver values
const drivers = config.get('database.connections.*.driver')
// => ['postgres', 'sqlite']
```

### Setting Configuration at Runtime

You can modify configuration values at runtime:

```typescript
// Set a single value
config.set('app.debug', true)

// Set multiple values at once
config.set({
  'app.debug': true,
  'app.name': 'Test App',
  'cache.default': 'memory',
})
```

This is particularly useful in testing when you need to override settings.

## Environment Type Casting

The `EnvCaster` helps convert environment variable strings to appropriate types:

```typescript
import { env } from '@atlex/config'

// Boolean casting
const debug = env('APP_DEBUG', 'false') === 'true'

// Number casting
const port = Number(env('APP_PORT', '3000'))

// Array casting (comma-separated)
const allowedOrigins = env('CORS_ORIGINS', '').split(',').filter(Boolean)

// JSON casting
const features = JSON.parse(env('FEATURE_FLAGS', '{}'))
```

## Configuration Caching

For production performance, cache your configuration so it doesn't need to be loaded from individual files on every request:

```bash
# Cache configuration
atlex config:cache

# Clear the cache
atlex config:clear
```

Programmatically:

```typescript
import { writeConfigCacheSync, readCachedConfigSync, clearConfigCacheSync } from '@atlex/config'

// Write cache
writeConfigCacheSync(config.all())

// Read cache
const cached = readCachedConfigSync()

// Clear cache
clearConfigCacheSync()
```

::: tip
After caching, changes to `.env` or config files won't take effect until you run `atlex config:cache` again. During development, skip caching and let configuration load dynamically.
:::

## Custom Config Loaders

If you need to load configuration from a different source (database, remote service, etc.), implement the `ConfigLoaderInterface`:

```typescript
import { ConfigLoaderInterface } from '@atlex/config'

export class DatabaseConfigLoader implements ConfigLoaderInterface {
  async load(): Promise<Record<string, unknown>> {
    const rows = await db.table('settings').get()
    const config: Record<string, unknown> = {}
    for (const row of rows) {
      config[row.key] = row.value
    }
    return config
  }
}
```

## Testing Configuration

Override config values in tests to isolate behavior:

```typescript
import { test } from 'vitest'
import { ConfigRepository } from '@atlex/config'

test('app uses correct timezone', () => {
  const config = app.make(ConfigRepository)

  // Override for this test
  config.set('app.timezone', 'America/New_York')

  const tz = config.get('app.timezone')
  expect(tz).toBe('America/New_York')
})

test('database falls back to SQLite', () => {
  const config = new ConfigRepository({
    database: {
      default: 'sqlite',
      connections: {
        sqlite: { driver: 'sqlite', database: ':memory:' },
      },
    },
  })

  expect(config.get('database.default')).toBe('sqlite')
})
```

## API Reference

### ConfigRepository

| Method                | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `get(key, fallback?)` | Read a value using dot-notation (supports `*` wildcards) |
| `set(key, value)`     | Set a single config value                                |
| `set(values)`         | Set multiple values from an object                       |
| `has(key)`            | Check if a config key exists                             |
| `all()`               | Get all configuration as a plain object                  |

### Environment Helpers

| Function              | Description                                   |
| --------------------- | --------------------------------------------- |
| `env(key, fallback?)` | Read an environment variable                  |
| `envs(keys)`          | Read multiple environment variables           |
| `hasEnv(key)`         | Check if an environment variable is defined   |
| `loadEnv(path?)`      | Load a `.env` file (defaults to project root) |

### Cache Helpers

| Function                       | Description                       |
| ------------------------------ | --------------------------------- |
| `writeConfigCacheSync(config)` | Write configuration to cache file |
| `readCachedConfigSync()`       | Read cached configuration         |
| `clearConfigCacheSync()`       | Delete the configuration cache    |
| `getConfigCacheFilePath()`     | Get the path to the cache file    |

### CLI Commands

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `atlex config:cache` | Cache all configuration to a single file |
| `atlex config:clear` | Remove the configuration cache file      |
