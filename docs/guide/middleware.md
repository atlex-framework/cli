# Middleware Guide

Middleware provides a powerful way to filter, transform, and enhance HTTP requests and responses as they flow through your application. Think of middleware as a series of gates that each request must pass through before reaching your route handler.

Atlex middleware is fully compatible with Express middleware, giving you access to thousands of proven packages while maintaining clean, elegant integration with your routes.

## Introduction

Middleware functions receive the request object (`req`), response object (`res`), and a `next` callback. They can:

- **Inspect** the incoming request
- **Modify** the request or response objects
- **Terminate** the request-response cycle
- **Call** the next middleware in the chain via `next()`

This makes middleware ideal for concerns that apply across multiple routes: authentication, logging, rate limiting, CORS, security headers, and more.

### Key Concepts

**Middleware Chain**: When a request arrives, it travels through a series of middleware functions in order. Each middleware either passes control to the next one or terminates the response.

```
Request → Middleware 1 → Middleware 2 → Middleware 3 → Route Handler → Response
```

**Named Middleware**: Register middleware with a name, then apply it to routes using that name. This keeps your route definitions clean and reusable.

**Execution Order Matters**: Middleware runs in the order it's registered. A middleware registered first will run before one registered later.

## Defining Middleware

The simplest middleware is a function that accepts `req`, `res`, and `next`:

```typescript
// middleware/timestamp.ts
import { Request, Response, NextFunction } from 'express'

export function addTimestampMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Add timestamp to request object
  ;(req as any).timestamp = new Date()

  // Pass control to next middleware
  next()
}
```

### Middleware That Sends a Response

Some middleware terminates the request-response cycle by sending a response:

```typescript
// middleware/maintenance.ts
import { Request, Response, NextFunction } from 'express'

export function maintenanceModeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const maintenanceMode = process.env.MAINTENANCE_MODE === 'true'

  if (maintenanceMode) {
    // Terminate the cycle with a response
    res.status(503).json({
      message: 'Application is currently under maintenance.',
    })
    return
  }

  // Or continue to next middleware
  next()
}
```

### Middleware That Modifies Request Properties

Middleware can enrich the request object with additional data:

```typescript
// middleware/user-agent.ts
import { Request, Response, NextFunction } from 'express'

interface RequestWithUserAgent extends Request {
  userAgent?: string
}

export function parseUserAgentMiddleware(
  req: RequestWithUserAgent,
  res: Response,
  next: NextFunction,
): void {
  req.userAgent = req.get('user-agent') || 'Unknown'
  next()
}
```

### Conditional Middleware

Middleware can check conditions and decide whether to proceed:

```typescript
// middleware/admin-check.ts
import { Request, Response, NextFunction } from 'express'

export function adminCheckMiddleware(req: Request, res: Response, next: NextFunction): void {
  const isAdmin = (req as any).user?.role === 'admin'

  if (!isAdmin) {
    res.status(403).json({ error: 'Unauthorized' })
    return
  }

  next()
}
```

## Registering Middleware

Before you can use middleware on routes, you must register it with a name. This is done when configuring your application:

```typescript
// config/middleware.ts
import { Application } from '@atlex/core'
import {
  addTimestampMiddleware,
  maintenanceModeMiddleware,
  parseUserAgentMiddleware,
} from '../middleware'

export function registerMiddleware(app: Application): void {
  // Register named middleware
  app.Route.middleware('timestamp', addTimestampMiddleware)
  app.Route.middleware('maintenance', maintenanceModeMiddleware)
  app.Route.middleware('userAgent', parseUserAgentMiddleware)
}
```

Now you can reference these middleware by name throughout your application:

```typescript
// routes/api.ts
import { Application } from '@atlex/core'

export function setupRoutes(app: Application): void {
  app.Route.get('/status', (req, res) => {
    res.json({ status: 'ok' })
  }).middleware(['timestamp', 'userAgent'])
}
```

## Global Middleware

Global middleware applies to every request in your application. Register global middleware before defining routes:

```typescript
// config/middleware.ts
import { Application } from '@atlex/core'
import { corsMiddleware, bodyParserMiddleware } from '@atlex/core'
import { addTimestampMiddleware } from '../middleware'

export function registerGlobalMiddleware(app: Application): void {
  // These run for every request
  app.use(corsMiddleware())
  app.use(bodyParserMiddleware())
  app.use(addTimestampMiddleware)
}
```

### Built-In Global Middleware

Atlex provides several built-in middleware functions for common needs:

```typescript
import { handleExceptions, corsMiddleware, bodyParser, securityHeaders } from '@atlex/core'

export function setupGlobalMiddleware(app: Application): void {
  // Parse incoming request bodies (JSON, form data)
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: true }))

  // Add security headers (X-Frame-Options, X-Content-Type-Options, etc.)
  app.use(securityHeaders())

  // Configure CORS
  app.use(
    corsMiddleware({
      origin: ['https://example.com'],
      credentials: true,
    }),
  )

  // Handle exceptions globally
  app.use(handleExceptions())
}
```

The `handleExceptions` middleware should typically be registered last, as it catches errors thrown by other middleware or route handlers.

## Route Middleware

Apply middleware to specific routes using the `middleware` option:

```typescript
// routes/admin.ts
import { Application } from '@atlex/core'

export function setupAdminRoutes(app: Application): void {
  // Single middleware
  app.Route.get('/admin/users', (req, res) => {
    res.json({ users: [] })
  }).middleware('adminCheck')

  // Multiple middleware
  app.Route.delete('/admin/users/:id', (req, res) => {
    res.json({ deleted: true })
  }).middleware(['adminCheck', 'timestamp', 'audit'])
}
```

Middleware is applied in the order specified in the array, so the above route runs `adminCheck` first, then `timestamp`, then `audit`, and finally the route handler.

### Apply Middleware After Route Definition

You can also chain middleware calls:

```typescript
app.Route.post('/api/users')
  .middleware('validate')
  .middleware('rateLimit')
  .handler((req, res) => {
    res.json({ created: true })
  })
```

Or use multiple `.middleware()` calls:

```typescript
app.Route.patch('/api/profile')
  .middleware('auth')
  .middleware('validateProfile')
  .handler((req, res) => {
    res.json({ updated: true })
  })
```

## Middleware Groups

Middleware groups allow you to register a set of middleware together and reuse them across multiple routes:

```typescript
// config/middleware.ts
import { Application } from '@atlex/core'

export function registerMiddlewareGroups(app: Application): void {
  // API middleware group
  app.Route.middlewareGroup('api', ['rateLimit', 'jsonParser', 'timestamp'])

  // Admin panel middleware group
  app.Route.middlewareGroup('admin', ['auth', 'adminCheck', 'auditLog'])

  // Sensitive operations group
  app.Route.middlewareGroup('sensitive', ['auth', 'verified-email', 'two-factor'])
}
```

Apply a group using the same syntax as individual middleware:

```typescript
// routes/api.ts
import { Application } from '@atlex/core'

export function setupApiRoutes(app: Application): void {
  app.Route.get('/api/users', (req, res) => {
    res.json({ users: [] })
  }).middleware('api')

  app.Route.post('/api/posts', (req, res) => {
    res.json({ created: true })
  }).middleware('api')
}
```

### Middleware Group Routes

Use `Route.middleware([]).group()` to apply middleware to all routes defined in a group:

```typescript
import { Application } from '@atlex/core'

export function setupAdminRoutes(app: Application): void {
  // All routes in this group get the 'admin' middleware
  app.Route.middleware(['auth', 'adminCheck']).group(() => {
    app.Route.get('/admin/users', (req, res) => {
      res.json({ users: [] })
    })

    app.Route.post('/admin/users', (req, res) => {
      res.json({ created: true })
    })

    app.Route.delete('/admin/users/:id', (req, res) => {
      res.json({ deleted: true })
    })
  })
}
```

This is much cleaner than applying the same middleware to each route individually!

## Middleware Parameters

Some middleware needs configuration. Pass parameters when registering:

```typescript
// middleware/rate-limit.ts
import { Request, Response, NextFunction } from 'express'

interface RateLimitOptions {
  maxRequests: number
  windowMs: number
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const requests = new Map<string, number[]>()

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || 'unknown'
    const now = Date.now()
    const requestTimes = requests.get(ip) || []

    // Remove old requests outside the window
    const recentRequests = requestTimes.filter((time) => now - time < options.windowMs)

    if (recentRequests.length >= options.maxRequests) {
      res.status(429).json({ error: 'Too many requests' })
      return
    }

    // Record this request
    recentRequests.push(now)
    requests.set(ip, recentRequests)

    next()
  }
}
```

Register the parameterized middleware in your config:

```typescript
// config/middleware.ts
import { Application } from '@atlex/core'
import { createRateLimitMiddleware } from '../middleware/rate-limit'

export function registerMiddleware(app: Application): void {
  app.Route.middleware(
    'strict-rate-limit',
    createRateLimitMiddleware({
      maxRequests: 10,
      windowMs: 60000, // 1 minute
    }),
  )

  app.Route.middleware(
    'loose-rate-limit',
    createRateLimitMiddleware({
      maxRequests: 100,
      windowMs: 60000,
    }),
  )
}
```

Use the registered middleware in your routes:

```typescript
// routes/api.ts
app.Route.post('/api/login', (req, res) => {
  // Handle login
}).middleware('strict-rate-limit')

app.Route.get('/api/public', (req, res) => {
  // Public endpoint
}).middleware('loose-rate-limit')
```

## Class-Based Middleware

For more complex middleware, use class-based middleware with dependency injection:

```typescript
// middleware/DatabaseLoggerMiddleware.ts
import { Request, Response, NextFunction } from 'express'
import { Injectable } from '@atlex/core'
import { DatabaseService } from '../services/DatabaseService'

@Injectable()
export class DatabaseLoggerMiddleware {
  constructor(private db: DatabaseService) {}

  async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now()

    // Log request to database
    await this.db.logs.create({
      method: req.method,
      path: req.path,
      ip: req.ip,
      timestamp: new Date(),
    })

    // Track response time
    res.on('finish', async () => {
      const duration = Date.now() - startTime
      await this.db.logs.update(
        { method: req.method, path: req.path },
        { duration, status: res.statusCode },
      )
    })

    next()
  }
}
```

Register class-based middleware:

```typescript
// config/middleware.ts
import { Application } from '@atlex/core'
import { DatabaseLoggerMiddleware } from '../middleware/DatabaseLoggerMiddleware'

export function registerMiddleware(app: Application): void {
  app.Route.middleware('db-logger', DatabaseLoggerMiddleware)
}
```

The dependency injection container automatically instantiates `DatabaseService` and injects it into the middleware.

### Class-Based Middleware with Parameters

Pass parameters to class-based middleware using a factory function:

```typescript
// middleware/CacheMiddleware.ts
import { Request, Response, NextFunction } from 'express'
import { Injectable } from '@atlex/core'
import { CacheService } from '../services/CacheService'

interface CacheOptions {
  ttl: number
}

@Injectable()
export class CacheMiddleware {
  constructor(private cache: CacheService) {}

  handle(options: CacheOptions) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Only cache GET requests
      if (req.method !== 'GET') {
        next()
        return
      }

      const cacheKey = `${req.method}:${req.path}`
      const cached = await this.cache.get(cacheKey)

      if (cached) {
        res.json(cached)
        return
      }

      // Store original json method
      const originalJson = res.json.bind(res)

      // Override json to cache response
      res.json = function (data: any) {
        this.cache.set(cacheKey, data, options.ttl)
        return originalJson(data)
      }

      next()
    }
  }
}
```

Register and use with parameters:

```typescript
app.Route.get('/api/users', (req, res) => {
  res.json({ users: [] })
}).middleware(new CacheMiddleware().handle({ ttl: 3600 }))
```

## Built-In Middleware

Atlex provides several commonly-needed middleware out of the box.

### CORS Middleware

Enable cross-origin requests:

```typescript
import { corsMiddleware } from '@atlex/core'

app.use(
  corsMiddleware({
    origin: ['https://example.com', 'https://app.example.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    maxAge: 86400, // Cache preflight for 24 hours
  }),
)
```

### Body Parser Middleware

Parse request bodies:

```typescript
import { bodyParser } from '@atlex/core'

// JSON bodies
app.use(bodyParser.json({ limit: '10mb' }))

// URL-encoded form data
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }))

// Raw body
app.use(bodyParser.raw({ type: 'application/octet-stream' }))

// Text bodies
app.use(bodyParser.text({ type: 'text/plain' }))
```

### Security Headers Middleware

Add security headers to all responses:

```typescript
import { securityHeaders } from '@atlex/core'

app.use(
  securityHeaders({
    // Prevent clickjacking
    xFrameOptions: 'DENY',

    // Prevent MIME type sniffing
    xContentTypeOptions: 'nosniff',

    // Enable XSS protection in older browsers
    xXssProtection: '1; mode=block',

    // Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },

    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }),
)
```

### Exception Handling Middleware

Catch and handle errors:

```typescript
import { handleExceptions } from '@atlex/core'

// Register as the last middleware
app.use(
  handleExceptions({
    debug: process.env.NODE_ENV === 'development',
    logger: console,
  }),
)
```

The exception handler catches synchronous errors and rejections from async handlers, converting them to appropriate HTTP responses.

## Authentication Middleware

Atlex provides authentication middleware through the `@atlex/auth` package:

### Basic Authentication Middleware

```typescript
import { auth } from '@atlex/auth'

app.Route.get('/api/secure', (req, res) => {
  res.json({ user: (req as any).user })
}).middleware('auth')
```

### Guard-Based Authentication

Use different authentication guards:

```typescript
import { AuthMiddleware } from '@atlex/auth'

// Middleware for API token authentication
app.Route.middleware(
  'auth:api',
  new AuthMiddleware({
    guard: 'api',
  }),
)

// Middleware for session-based authentication
app.Route.middleware(
  'auth:web',
  new AuthMiddleware({
    guard: 'web',
  }),
)

// Apply to routes
app.Route.get('/api/users', (req, res) => {
  res.json({ users: [] })
}).middleware('auth:api')
```

### Session Middleware

Manage user sessions:

```typescript
import { StartSession } from '@atlex/auth'

app.use(new StartSession())

// Now routes can access session data
app.Route.get('/profile', (req, res) => {
  const userId = (req as any).session.userId
  res.json({ userId })
})
```

### Email Verification Middleware

Ensure user email is verified:

```typescript
import { EnsureEmailIsVerified } from '@atlex/auth'

app.Route.post('/api/sensitive', (req, res) => {
  res.json({ result: 'success' })
}).middleware('verified-email')

// Register the middleware
app.Route.middleware('verified-email', new EnsureEmailIsVerified())
```

### Authorization Middleware

Check user permissions:

```typescript
import { AuthorizeMiddleware } from '@atlex/auth'

// Check if user has 'edit-users' ability
app.Route.middleware('authorize:edit-users', new AuthorizeMiddleware('edit-users'))

// Check multiple abilities (AND logic)
app.Route.middleware(
  'authorize:admin',
  new AuthorizeMiddleware(['delete-users', 'edit-permissions']),
)

// Use in routes
app.Route.delete('/users/:id', (req, res) => {
  res.json({ deleted: true })
}).middleware('authorize:delete-users')
```

### Throttle Logins Middleware

Prevent brute force attacks:

```typescript
import { ThrottleLogins } from '@atlex/auth'

app.Route.post('/login', (req, res) => {
  // Login logic
}).middleware(
  new ThrottleLogins({
    maxAttempts: 5,
    decayMinutes: 15,
  }),
)
```

## Creating Custom Middleware

Let's explore real-world examples of custom middleware.

### Logging Middleware

Track every request:

```typescript
// middleware/logging.ts
import { Request, Response, NextFunction } from 'express'

export function createLoggingMiddleware(logger: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now()
    const requestId = Math.random().toString(36).substr(2, 9)

    // Add request ID to response headers
    res.setHeader('X-Request-ID', requestId)

    // Log incoming request
    logger.info(`[${requestId}] ${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    })

    // Track when response is sent
    res.on('finish', () => {
      const duration = Date.now() - startTime
      logger.info(`[${requestId}] ${res.statusCode} ${duration}ms`)
    })

    next()
  }
}

// Usage
import { createLoggingMiddleware } from '../middleware/logging'

app.use(createLoggingMiddleware(console))
```

### Rate Limiting Middleware

Prevent abuse:

```typescript
// middleware/rate-limit.ts
import { Request, Response, NextFunction } from 'express'

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  message?: string
}

export function createRateLimitMiddleware(config: RateLimitConfig) {
  const store = new Map<string, { count: number; resetTime: number }>()

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || 'unknown'
    const now = Date.now()
    const record = store.get(key)

    // Initialize or reset expired record
    if (!record || now > record.resetTime) {
      store.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
      })
      next()
      return
    }

    // Check if limit exceeded
    if (record.count >= config.maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000)
      res.set('Retry-After', String(retryAfter))
      res.status(429).json({
        error: config.message || 'Too many requests',
        retryAfter,
      })
      return
    }

    // Increment counter
    record.count++
    next()
  }
}

// Usage
app.Route.middleware(
  'rate-limit',
  createRateLimitMiddleware({
    maxRequests: 30,
    windowMs: 60000,
    message: 'Please slow down your requests',
  }),
)
```

### CORS Middleware (Custom)

Handle cross-origin requests:

```typescript
// middleware/cors.ts
import { Request, Response, NextFunction } from 'express'

interface CorsOptions {
  origin?: string | string[]
  methods?: string[]
  allowedHeaders?: string[]
  credentials?: boolean
}

export function createCorsMiddleware(options: CorsOptions = {}) {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders = ['Content-Type', 'Authorization'],
    credentials = false,
  } = options

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestOrigin = req.get('origin')
    const allowedOrigins = Array.isArray(origin) ? origin : [origin]

    // Check if origin is allowed
    if (origin === '*' || allowedOrigins.includes(requestOrigin!)) {
      res.header('Access-Control-Allow-Origin', requestOrigin || '*')
    }

    res.header('Access-Control-Allow-Methods', methods.join(', '))
    res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '))

    if (credentials) {
      res.header('Access-Control-Allow-Credentials', 'true')
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }

    next()
  }
}

// Usage
app.use(
  createCorsMiddleware({
    origin: ['https://example.com', 'https://app.example.com'],
    credentials: true,
  }),
)
```

### Request Validation Middleware

Validate request data before it reaches handlers:

```typescript
// middleware/validate.ts
import { Request, Response, NextFunction } from 'express'

interface ValidationSchema {
  [key: string]: (value: any) => boolean | string
}

export function createValidationMiddleware(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Record<string, string> = {}

    for (const [field, validator] of Object.entries(schema)) {
      const value = req.body[field]
      const result = validator(value)

      if (result !== true && result !== '') {
        errors[field] = typeof result === 'string' ? result : 'Invalid value'
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(422).json({ errors })
      return
    }

    next()
  }
}

// Usage
app.Route.post('/api/users', (req, res) => {
  res.json({ created: true })
}).middleware(
  createValidationMiddleware({
    email: (value) => {
      if (!value) return 'Email is required'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email format'
      return true
    },
    password: (value) => {
      if (!value) return 'Password is required'
      if (value.length < 8) return 'Password must be at least 8 characters'
      return true
    },
    name: (value) => {
      if (!value) return 'Name is required'
      if (value.length < 2) return 'Name must be at least 2 characters'
      return true
    },
  }),
)
```

### Request Compression Middleware

Compress response bodies:

```typescript
// middleware/compression.ts
import { Request, Response, NextFunction } from 'express'
import { createGzip } from 'zlib'

export function createCompressionMiddleware(options = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const acceptEncoding = req.get('accept-encoding') || ''

    // Check if client accepts gzip
    if (!acceptEncoding.includes('gzip')) {
      next()
      return
    }

    // Wrap the response json method
    const originalJson = res.json.bind(res)

    res.json = function (data: any) {
      res.set('Content-Encoding', 'gzip')

      const gzip = createGzip()
      const payload = JSON.stringify(data)

      gzip.on('data', (chunk) => {
        res.write(chunk)
      })

      gzip.on('end', () => {
        res.end()
      })

      gzip.write(payload)
      gzip.end()

      return this
    }

    next()
  }
}

// Usage
app.use(createCompressionMiddleware())
```

## Middleware Execution Order

Understanding the execution order is crucial for debugging and design:

```typescript
// Middleware runs in registration order
app.use(loggerMiddleware) // 1st
app.use(authMiddleware) // 2nd
app.use(corsMiddleware()) // 3rd

app.Route.get('/api/users', (req, res) => {
  // This runs 4th
  res.json({ users: [] })
}).middleware(['validate', 'rateLimit']) // 5th, 6th
```

Request flow:

```
1. loggerMiddleware
   |
2. authMiddleware
   |
3. corsMiddleware
   |
4. Route Handler
   |
5. validate middleware
   |
6. rateLimit middleware
```

### Important Notes

1. **Global middleware** (registered with `app.use()`) runs before route-specific middleware
2. **Route middleware** (specified in `.middleware()`) runs in the order specified
3. **If middleware sends a response**, execution stops there
4. **If middleware calls `next()`**, execution continues to the next middleware
5. **Async middleware** should use `async/await` and let errors propagate

```typescript
// Correct: async middleware
app.Route.middleware('async-check', async (req, res, next) => {
  const user = await db.users.find(req.userId)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})

// Avoid: not awaiting promises
app.Route.middleware('bad', (req, res, next) => {
  db.users.find(req.userId) // Promise not awaited!
  next()
})
```

## Practical Example: Complete Setup

Here's a complete, real-world middleware setup:

```typescript
// config/middleware.ts
import { Application } from '@atlex/core'
import { corsMiddleware, bodyParser, securityHeaders } from '@atlex/core'
import { auth } from '@atlex/auth'
import { createLoggingMiddleware } from '../middleware/logging'
import { createRateLimitMiddleware } from '../middleware/rate-limit'
import { DatabaseLoggerMiddleware } from '../middleware/DatabaseLoggerMiddleware'

export function registerMiddleware(app: Application): void {
  // Global middleware (runs for all requests)
  app.use(createLoggingMiddleware(console))
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: true }))
  app.use(securityHeaders())
  app.use(
    corsMiddleware({
      origin: process.env.CORS_ORIGIN?.split(','),
      credentials: true,
    }),
  )

  // Named middleware
  app.Route.middleware('auth', auth())
  app.Route.middleware(
    'strict-rate-limit',
    createRateLimitMiddleware({
      maxRequests: 10,
      windowMs: 60000,
    }),
  )
  app.Route.middleware(
    'loose-rate-limit',
    createRateLimitMiddleware({
      maxRequests: 100,
      windowMs: 60000,
    }),
  )
  app.Route.middleware('db-logger', DatabaseLoggerMiddleware)

  // Middleware groups
  app.Route.middlewareGroup('api', ['auth', 'loose-rate-limit'])
  app.Route.middlewareGroup('admin', ['auth', 'db-logger'])
}
```

```typescript
// routes/api.ts
import { Application } from '@atlex/core'

export function setupApiRoutes(app: Application): void {
  // Public endpoint
  app.Route.get('/health', (req, res) => {
    res.json({ status: 'ok' })
  })

  // Protected API routes
  app.Route.middleware(['auth', 'loose-rate-limit']).group(() => {
    app.Route.get('/api/users', (req, res) => {
      res.json({ users: [] })
    })

    app.Route.post('/api/posts', (req, res) => {
      res.json({ created: true })
    }).middleware('db-logger')
  })

  // Admin routes with stricter rate limiting
  app.Route.middleware(['auth', 'strict-rate-limit']).group(() => {
    app.Route.get('/admin/users', (req, res) => {
      res.json({ users: [] })
    })

    app.Route.delete('/admin/users/:id', (req, res) => {
      res.json({ deleted: true })
    }).middleware('db-logger')
  })
}
```

## API Reference

### Application Methods

#### `app.use(middleware)`

Register global middleware that runs for all requests.

```typescript
app.use(corsMiddleware())
app.use(bodyParser.json())
```

#### `Route.middleware(name, handler)`

Register a named middleware.

```typescript
app.Route.middleware('auth', authMiddleware)
app.Route.middleware('validate', validateMiddleware)
```

#### `Route.middleware([names]).group(callback)`

Apply middleware to a group of routes.

```typescript
app.Route.middleware(['auth', 'admin']).group(() => {
  app.Route.get('/admin', handler)
  app.Route.post('/admin/users', handler)
})
```

#### `Route.get/post/put/delete(...).middleware(names)`

Apply middleware to a specific route.

```typescript
app.Route.post('/api/users', handler).middleware('validate')
app.Route.delete('/api/users/:id', handler).middleware(['auth', 'admin'])
```

#### `Route.middlewareGroup(name, middlewares)`

Create a reusable group of middleware.

```typescript
app.Route.middlewareGroup('api', ['auth', 'rateLimit'])
```

### Middleware Signature

```typescript
// Function-based
type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>

// Class-based
class MyMiddleware {
  handle(req: Request, res: Response, next: NextFunction): void | Promise<void> {
    // Handle request
  }
}
```

### Common Request Extensions

Middleware can extend the `Request` object:

```typescript
interface RequestWithUser extends Request {
  user?: {
    id: string
    email: string
    role: string
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: any
      session?: any
      timestamp?: Date
    }
  }
}
```

## Best Practices

1. **Keep middleware focused**: Each middleware should do one thing well
2. **Use middleware groups**: Avoid repeating the same middleware on multiple routes
3. **Order matters**: Place authentication before authorization, validation before handlers
4. **Error handling**: Always catch errors in async middleware
5. **Performance**: Be mindful of expensive operations in middleware that runs on every request
6. **Testing**: Middleware should be unit testable and not depend on the full app
7. **Documentation**: Document what each middleware does and what data it adds to the request
8. **Naming**: Use clear, descriptive names like `requireAuth` instead of `auth`

Happy middleware building!
