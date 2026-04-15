# Logging

Atlex's logging system provides structured, multi-channel logging for your application. Route log messages to the console, files, daily-rotated files, or multiple channels simultaneously. Every channel supports configurable log levels, formatters, and contextual data.

## Installation

```bash
pnpm add @atlex/log
```

## Configuration

Create `config/logging.ts`:

```typescript
import { env } from '@atlex/config'

export default {
  default: env('LOG_CHANNEL', 'stack'),

  channels: {
    stack: {
      driver: 'stack',
      channels: ['console', 'daily'],
    },

    console: {
      driver: 'console',
      level: 'debug',
      format: 'pretty',
    },

    single: {
      driver: 'single',
      path: 'storage/logs/app.log',
      level: 'info',
      format: 'line',
    },

    daily: {
      driver: 'daily',
      path: 'storage/logs/app.log',
      level: 'info',
      days: 14,
      format: 'json',
    },

    null: {
      driver: 'null',
    },
  },
}
```

Set your default channel in `.env`:

```
LOG_CHANNEL=stack
LOG_LEVEL=debug
```

## Basic Usage

### Getting a Logger

Resolve the `LogManager` from the container and access channels:

```typescript
import { LogManager } from '@atlex/log'

const log = app.make(LogManager)

// Use the default channel
const logger = log.channel()

// Use a specific channel
const fileLogger = log.channel('daily')
const consoleLogger = log.channel('console')
```

### Writing Log Messages

The logger supports all standard log levels:

```typescript
logger.debug('Query executed', { sql: 'SELECT * FROM users', duration: 12 })
logger.info('User logged in', { userId: 42, ip: '192.168.1.1' })
logger.notice('Cache miss for key', { key: 'user:42:profile' })
logger.warning('Disk usage above 80%', { usage: 85, disk: '/dev/sda1' })
logger.error('Payment failed', { orderId: 123, error: 'Card declined' })
logger.critical('Database connection lost', { host: 'db.example.com' })
logger.alert('SSL certificate expiring in 3 days', { domain: 'api.example.com' })
logger.emergency('Application cannot start', { reason: 'Missing APP_KEY' })
```

You can also use the generic `log()` method:

```typescript
import { LogLevel } from '@atlex/log'

logger.log(LogLevel.info, 'Order placed', { orderId: 456 })
```

## Log Levels

Atlex uses the standard RFC 5424 log levels, from most to least severe:

| Level       | Value | When to Use                                 |
| ----------- | ----- | ------------------------------------------- |
| `emergency` | 0     | System is unusable                          |
| `alert`     | 1     | Immediate action required                   |
| `critical`  | 2     | Critical conditions (component failure)     |
| `error`     | 3     | Runtime errors that need attention          |
| `warning`   | 4     | Unusual conditions that might become errors |
| `notice`    | 5     | Normal but noteworthy events                |
| `info`      | 6     | Informational messages (user actions, etc.) |
| `debug`     | 7     | Detailed debug information                  |

When you set a minimum level on a channel, only messages at that level or above are recorded. For example, setting `level: 'warning'` captures warning, error, critical, alert, and emergency — but ignores info and debug.

## Contextual Logging

Add persistent context data that appears in every subsequent log message:

```typescript
// Create a logger with context
const requestLogger = logger.withContext({
  requestId: 'req-abc-123',
  userId: 42,
})

requestLogger.info('Processing order')
// => { message: 'Processing order', requestId: 'req-abc-123', userId: 42 }

requestLogger.info('Order completed', { orderId: 789 })
// => { message: 'Order completed', requestId: 'req-abc-123', userId: 42, orderId: 789 }
```

This is useful for adding request or user identifiers to all log entries within a single request lifecycle.

## Log Channels

### Console Channel

Writes to stdout/stderr with colored output:

```typescript
channels: {
  console: {
    driver: 'console',
    level: 'debug',
    format: 'pretty', // 'pretty', 'line', or 'json'
  },
}
```

### Single File Channel

Writes all messages to a single log file:

```typescript
channels: {
  single: {
    driver: 'single',
    path: 'storage/logs/app.log',
    level: 'info',
    format: 'line',
  },
}
```

### Daily File Channel

Creates a new log file for each day and retains files for a configurable number of days:

```typescript
channels: {
  daily: {
    driver: 'daily',
    path: 'storage/logs/app.log',
    level: 'info',
    days: 14,       // Keep logs for 14 days
    format: 'json',
  },
}
```

This creates files like `app-2024-01-15.log`, `app-2024-01-16.log`, etc., and automatically cleans up files older than the retention period.

### Stack Channel

Fan out log messages to multiple channels simultaneously:

```typescript
channels: {
  stack: {
    driver: 'stack',
    channels: ['console', 'daily'],
  },
}
```

When you write to the stack channel, the message is sent to both the console and the daily file channel.

### Null Channel

Discards all messages — useful for suppressing output in tests:

```typescript
channels: {
  null: {
    driver: 'null',
  },
}
```

## Log Formatters

Each channel can use a different formatter:

### Line Formatter

Single-line human-readable format:

```
[2024-01-15 14:32:05] INFO: User logged in {"userId":42,"ip":"192.168.1.1"}
```

### JSON Formatter

Structured JSON for log aggregation tools (Elasticsearch, Datadog, etc.):

```json
{
  "timestamp": "2024-01-15T14:32:05.000Z",
  "level": "info",
  "message": "User logged in",
  "userId": 42,
  "ip": "192.168.1.1"
}
```

### Pretty Formatter

Colorized, multi-line output for local development:

```
  INFO  User logged in
        userId: 42
        ip: 192.168.1.1
```

## Custom Drivers

Register a custom log driver in a service provider:

```typescript
import { LogManager } from '@atlex/log'

export class LogServiceProvider extends ServiceProvider {
  boot() {
    const logManager = this.app.make(LogManager)

    logManager.extend('sentry', (config) => {
      return new SentryLogDriver({
        dsn: config.dsn,
        level: config.level,
      })
    })
  }
}
```

Then use it in your configuration:

```typescript
channels: {
  sentry: {
    driver: 'sentry',
    dsn: process.env['SENTRY_DSN'],
    level: 'error',
  },
}
```

## Flushing Logs

Some drivers buffer log entries. Call `flush()` to ensure all pending records are written:

```typescript
await logger.flush()
```

This is important before process exit or at the end of serverless function invocations.

## Real-World Example

A typical production logging setup:

```typescript
// config/logging.ts
export default {
  default: env('LOG_CHANNEL', 'stack'),

  channels: {
    stack: {
      driver: 'stack',
      channels: ['console', 'daily'],
    },

    console: {
      driver: 'console',
      level: env('LOG_LEVEL', 'info'),
      format: env('APP_ENV') === 'local' ? 'pretty' : 'json',
    },

    daily: {
      driver: 'daily',
      path: 'storage/logs/app.log',
      level: 'info',
      days: 30,
      format: 'json',
    },

    errors: {
      driver: 'single',
      path: 'storage/logs/errors.log',
      level: 'error',
      format: 'json',
    },
  },
}
```

```typescript
// In a request middleware
Route.middleware('logging', (req, res, next) => {
  const start = Date.now()
  const logger = app.make(LogManager).channel()

  const requestLogger = logger.withContext({
    requestId: req.headers['x-request-id'],
    method: req.method,
    path: req.path,
  })

  res.on('finish', () => {
    requestLogger.info('Request completed', {
      status: res.statusCode,
      duration: Date.now() - start,
    })
  })

  next()
})
```

## Testing Logging

Use `LogFake` from `@atlex/testing` to capture log messages:

```typescript
import { test } from 'vitest'
import { LogFake } from '@atlex/testing'

test('failed login logs a warning', async () => {
  const log = LogFake.install()

  await TestClient.post('/login', {
    email: 'user@example.com',
    password: 'wrong-password',
  })

  log.assertLogged('warning', 'Failed login attempt')
  log.assertLogged('warning', (entry) => entry.context.email === 'user@example.com')
})

test('order creation logs info', async () => {
  const log = LogFake.install()

  await TestClient.post('/orders', { product_id: 1 })

  log.assertLogged('info', 'Order created')
  log.assertNotLogged('error')
})
```

## API Reference

### LogManager

| Method                    | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `channel(name?)`          | Get a logger for a specific channel (default if omitted) |
| `extend(driver, factory)` | Register a custom driver                                 |

### Logger

| Method                          | Description                                 |
| ------------------------------- | ------------------------------------------- |
| `debug(message, context?)`      | Log debug message                           |
| `info(message, context?)`       | Log informational message                   |
| `notice(message, context?)`     | Log notice                                  |
| `warning(message, context?)`    | Log warning                                 |
| `error(message, context?)`      | Log error                                   |
| `critical(message, context?)`   | Log critical error                          |
| `alert(message, context?)`      | Log alert                                   |
| `emergency(message, context?)`  | Log emergency                               |
| `log(level, message, context?)` | Log at a specific level                     |
| `withContext(context)`          | Create a new logger with additional context |
| `flush()`                       | Flush all buffered log records              |
