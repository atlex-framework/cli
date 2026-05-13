# Cache Guide

Atlex provides a robust and unified caching system that supports multiple storage backends. The `@atlex/cache` module simplifies storing and retrieving cached data, managing cache expiration, organizing related items with tags, coordinating concurrent operations with atomic locks, and enforcing rate limits.

## Introduction

Caching is essential for building high-performance applications. Atlex's cache system abstracts away the complexity of different storage backends while providing a fluent, intuitive API. Whether you're caching database query results, API responses, or computation-intensive operations, Atlex makes it seamless.

Key benefits:

- **Multiple drivers**: Memory, file system, Redis, and null (for testing)
- **Flexible TTLs**: Set expiration times or cache permanently
- **Cache tags**: Organize and invalidate related cache entries together
- **Atomic locks**: Coordinate concurrent access to critical sections
- **Rate limiting**: Prevent abuse and control request rates
- **Event system**: Hook into cache operations for logging and monitoring

## Configuration

Configure caching in your application's configuration file:

```typescript
// config/cache.ts
import { defineConfig } from '@atlex/cache'

export default defineConfig({
  // Default cache driver to use
  default: 'memory',

  // Optional cache key prefix (useful in shared environments)
  prefix: 'atlex_cache:',

  // Define available cache stores
  stores: {
    memory: {
      driver: 'memory',
    },
    file: {
      driver: 'file',
      path: './storage/cache',
    },
    redis: {
      driver: 'redis',
      host: 'localhost',
      port: 6379,
      database: 1,
    },
    null: {
      driver: 'null',
    },
  },
})
```

Access the cache manager in your application:

```typescript
import { Cache } from '@atlex/cache'

// Get the default cache store
const cache = Cache.store()

// Get a specific named store
const fileCache = Cache.store('file')
const redisCache = Cache.store('redis')
```

## Cache Usage

### Getting Values

Retrieve values from the cache using `get()`:

```typescript
import { Cache } from '@atlex/cache'

// Get a cached value
const user = await Cache.get('user:1')

// Get with a fallback value
const user = await Cache.get('user:1', { id: 1, name: 'Guest' })

// Use a callback for the fallback
const user = await Cache.get('user:1', () => {
  return { id: 1, name: 'Guest' }
})
```

### Storing Values

Store values in the cache with optional TTL (time-to-live):

```typescript
import { Cache } from '@atlex/cache'

// Store indefinitely
await Cache.put('user:1', { id: 1, name: 'John Doe' })

// Store for 60 minutes (in seconds)
await Cache.put('user:1', { id: 1, name: 'John Doe' }, 3600)

// Store for 1 day
await Cache.put('user:1', { id: 1, name: 'John Doe' }, 86400)

// Using put() for clarity (identical to put)
await Cache.put('config', appConfig, 7200)
```

### Remember Pattern

The `remember()` method provides a convenient way to cache the result of a computation. If the key exists in the cache, it's returned. Otherwise, the callback is executed, the result is cached, and then returned:

```typescript
import { Cache } from '@atlex/cache'

// Cache user data for 1 hour, or fetch if missing
const user = await Cache.remember('user:1', 3600, async () => {
  return await database.users.findById(1)
})

// Cache and return immediately without TTL check
const config = await Cache.rememberForever('app:config', async () => {
  return await loadApplicationConfig()
})
```

### Cache Sear

The `sear()` method is optimized for frequently accessed data. It caches a value indefinitely and is ideal for data that rarely changes:

```typescript
import { Cache } from '@atlex/cache'

// Cache permissions permanently
const permissions = await Cache.sear('user:1:permissions', async () => {
  return await database.permissions.forUser(1)
})
```

### Removing Values

Remove items from the cache:

```typescript
import { Cache } from '@atlex/cache'

// Forget a single key
await Cache.forget('user:1')

// Flush entire cache store
await Cache.flush()

// Get and remove in one operation
const user = await Cache.pull('user:1', { name: 'Guest' })
```

## Incrementing & Decrementing

Efficiently increment or decrement numeric values in the cache:

```typescript
import { Cache } from '@atlex/cache'

// Initialize a counter
await Cache.put('page:views', 0)

// Increment by 1
await Cache.increment('page:views')

// Increment by 5
await Cache.increment('page:views', 5)

// Decrement by 1
await Cache.decrement('page:views')

// Decrement by 3
await Cache.decrement('page:views', 3)
```

These operations are atomic, making them safe for concurrent increments:

```typescript
import { Cache } from '@atlex/cache'

// Multiple concurrent increments are safe
await Promise.all([
  Cache.increment('counter'),
  Cache.increment('counter'),
  Cache.increment('counter'),
])

// Counter will be 3, not random
const count = await Cache.get('counter') // 3
```

## Cache Tags

Organize related cache entries using tags, allowing you to invalidate groups of entries simultaneously:

```typescript
import { Cache } from '@atlex/cache'

// Store tagged entries
await Cache.tags('users', 'accounts').put('user:1', userData, 3600)
await Cache.tags('users', 'accounts').put('user:2', userData, 3600)
await Cache.tags('posts').put('post:1', postData, 3600)

// Retrieve tagged entries
const user1 = await Cache.tags('users').get('user:1')

// Forget all entries with the 'users' tag
await Cache.tags('users').flush()

// Entries tagged with both 'users' and 'accounts' are removed
// Entries tagged with only 'posts' remain
```

Use tags to organize cache logically:

```typescript
import { Cache } from '@atlex/cache'

// Cache product data with multiple tags
const productCache = Cache.tags('products', 'catalog', 'search')
await productCache.put(`product:${id}`, product, 86400)

// Invalidate all product-related caches
await Cache.tags('products').flush()

// Invalidate only search-related caches
await Cache.tags('search').flush()

// Keep product data but update search indexes
```

Tags work with `remember()`:

```typescript
import { Cache } from '@atlex/cache'

const post = await Cache.tags('posts', `user:${userId}`).remember(
  `post:${postId}`,
  3600,
  async () => {
    return await database.posts.findById(postId)
  },
)
```

## Atomic Locks

Coordinate concurrent operations using atomic locks, ensuring only one process modifies shared resources:

```typescript
import { Cache } from '@atlex/cache'

// Acquire a lock
const lock = await Cache.lock('inventory:update', 30, 'process-1')

// Check if lock was acquired
if (lock.acquire()) {
  try {
    // Safe to perform operations
    await updateInventory()
  } finally {
    // Always release the lock
    await lock.release()
  }
}
```

Use `block()` for automatic lock waiting:

```typescript
import { Cache } from '@atlex/cache'

// Wait up to 10 seconds for the lock
await Cache.lock('inventory:update').block(10, async () => {
  // Execute once lock is acquired
  await updateInventory()
  // Lock is automatically released after callback
})
```

Locks with ownership tracking:

```typescript
import { Cache } from '@atlex/cache'

const lockId = generateUniqueId()
const lock = await Cache.lock('critical-section', 60, lockId)

if (lock.acquire()) {
  try {
    // Perform work
  } finally {
    // Only the owner can release
    await lock.release()
  }
}

// Force release if process crashed
await lock.forceRelease()
```

## Rate Limiting

Prevent abuse and control request rates using the built-in rate limiter:

```typescript
import { Cache } from '@atlex/cache'

// Create a rate limiter: max 60 requests per minute
const limiter = await Cache.rateLimit('user:1:requests', 60, 60)

// Record a hit
const hit = await limiter.hit()
if (!hit.allowed) {
  // Too many requests
  throw new TooManyRequestsError(`Retry after ${hit.retryAfter} seconds`)
}

// Check remaining requests
const remaining = await limiter.remaining('user:1:requests', 60)

// Reset the limit
await limiter.reset('user:1:requests')

// Clear all limits for a prefix
await limiter.clear('user:')
```

Use rate limiting for API endpoints:

```typescript
import { Cache } from '@atlex/cache'

export async function handleRequest(userId: string, req: Request) {
  const limiter = await Cache.rateLimit(`user:${userId}:api`, 100, 3600)

  const result = await limiter.hit()
  if (!result.allowed) {
    return new Response('Rate limit exceeded', {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter),
      },
    })
  }

  // Process the request
  return await processRequest(req)
}
```

## Cache Drivers

Atlex includes several built-in drivers suitable for different use cases.

### Memory Driver

Store cache in application memory. Fast but not persistent:

```typescript
// config/cache.ts
import { defineConfig } from '@atlex/cache'

export default defineConfig({
  default: 'memory',
  stores: {
    memory: {
      driver: 'memory',
      maxSize: 1000, // Optional: max items
    },
  },
})
```

Best for: Development, testing, temporary caches, single-process applications.

### File Driver

Store cache as files on the file system:

```typescript
// config/cache.ts
export default defineConfig({
  default: 'file',
  stores: {
    file: {
      driver: 'file',
      path: './storage/cache',
      serializeWith: 'json', // or 'msgpack'
    },
  },
})
```

Best for: Small to medium caches, persistence requirements, shared hosting environments.

### Redis Driver

Use Redis for high-performance, distributed caching:

```typescript
// config/cache.ts
export default defineConfig({
  default: 'redis',
  stores: {
    redis: {
      driver: 'redis',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      database: 1,
      namespace: 'atlex:',
    },
  },
})
```

Best for: High-traffic applications, distributed systems, real-time caching, rate limiting.

### Null Driver

The null driver doesn't actually cache anything, useful for testing:

```typescript
// config/cache.ts
export default defineConfig({
  stores: {
    null: {
      driver: 'null',
    },
  },
})
```

Best for: Testing without side effects, disabling cache in certain environments.

## Custom Drivers

Create custom cache drivers by extending the base driver class:

```typescript
import { Driver } from '@atlex/cache'

export class CustomDriver extends Driver {
  private store = new Map()

  async get(key: string, fallback?: any): Promise<any> {
    if (!this.store.has(key)) {
      return fallback
    }

    const item = this.store.get(key)

    // Check expiration
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.store.delete(key)
      return fallback
    }

    return item.value
  }

  async put(key: string, value: any, ttl?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : null,
    })
  }

  async forget(key: string): Promise<void> {
    this.store.delete(key)
  }

  async flush(): Promise<void> {
    this.store.clear()
  }
}
```

Register the custom driver:

```typescript
import { Cache } from '@atlex/cache'
import { CustomDriver } from './drivers/CustomDriver'

Cache.extend('custom', () => new CustomDriver())

// Now use it in configuration
export default defineConfig({
  default: 'custom',
  stores: {
    custom: {
      driver: 'custom',
    },
  },
})
```

## Cache Events

Listen to cache events for logging, monitoring, and debugging:

```typescript
import { Cache } from '@atlex/cache'

// Listen to cache hits
Cache.on('hit', ({ key, value }) => {
  console.log(`Cache hit for key: ${key}`)
})

// Listen to cache misses
Cache.on('miss', ({ key }) => {
  console.log(`Cache miss for key: ${key}`)
})

// Listen to writes
Cache.on('write', ({ key, ttl }) => {
  console.log(`Cached ${key} for ${ttl} seconds`)
})

// Listen to deletes
Cache.on('delete', ({ key }) => {
  console.log(`Forgot cache key: ${key}`)
})

// Listen to flushes
Cache.on('flush', () => {
  console.log('Cache flushed')
})
```

Use events to implement cache warming or invalidation strategies:

```typescript
import { Cache } from '@atlex/cache'

Cache.on('miss', async ({ key }) => {
  // Warm cache on miss for frequently accessed items
  if (key.startsWith('featured:')) {
    const data = await fetchFeaturedData()
    await Cache.put(key, data, 3600)
  }
})
```

## Testing Cache

Use the null driver in tests to avoid cache side effects:

```typescript
// tests/cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Cache } from '@atlex/cache'

describe('Cache', () => {
  beforeEach(() => {
    // Switch to null driver for tests
    Cache.setDefaultDriver('null')
  })

  it('should not cache in null driver', async () => {
    await Cache.put('test', { value: 1 })
    const result = await Cache.get('test')

    expect(result).toBeUndefined()
  })

  it('should return fallback in null driver', async () => {
    const result = await Cache.get('test', { fallback: true })

    expect(result).toEqual({ fallback: true })
  })
})
```

Test cache behavior with an in-memory driver:

```typescript
// tests/feature.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Cache } from '@atlex/cache'

describe('Feature with caching', () => {
  beforeEach(() => {
    Cache.setDefaultDriver('memory')
    Cache.flush()
  })

  it('should cache user data', async () => {
    const user = { id: 1, name: 'John' }

    await Cache.put('user:1', user)
    const cached = await Cache.get('user:1')

    expect(cached).toEqual(user)
  })

  it('should remember computed values', async () => {
    let computeCount = 0

    const result = await Cache.remember('expensive', 3600, async () => {
      computeCount++
      return 'expensive result'
    })

    expect(computeCount).toBe(1)

    const again = await Cache.remember('expensive', 3600, async () => {
      computeCount++
      return 'expensive result'
    })

    expect(computeCount).toBe(1) // Callback not executed again
    expect(again).toBe('expensive result')
  })
})
```

## API Reference

### CacheManager

The main interface for cache operations.

**Methods:**

- `store(name?: string): Repository` - Get a cache store
- `driver(name?: string): Driver` - Get the driver for a store
- `extend(name: string, callback: () => Driver): void` - Register a custom driver
- `getDefaultDriver(): string` - Get the default driver name
- `setDefaultDriver(name: string): void` - Set the default driver
- `forgetDriver(name: string): void` - Unregister a driver
- `purge(name?: string): Promise<void>` - Delete expired entries
- `stores(): string[]` - List registered stores
- `hasStore(name: string): boolean` - Check if a store exists
- `on(event: string, callback: Function): void` - Listen to cache events

**Proxy methods** (delegate to default store):

- `get(key: string, fallback?: any): Promise<any>`
- `put(key: string, value: any, ttl?: number): Promise<void>`
- `forget(key: string): Promise<void>`
- `flush(): Promise<void>`
- `remember(key: string, ttl: number, callback: () => Promise<any>): Promise<any>`
- `rememberForever(key: string, callback: () => Promise<any>): Promise<any>`
- `sear(key: string, callback: () => Promise<any>): Promise<any>`

### Repository

Represents a single cache store.

**Methods:**

- `get(key: string, fallback?: any): Promise<any>` - Retrieve a cached value
- `set(key: string, value: any, ttl?: number): Promise<void>` - Store a value
- `put(key: string, value: any, ttl?: number): Promise<void>` - Store a value (alias)
- `add(key: string, value: any, ttl?: number): Promise<boolean>` - Store only if key doesn't exist
- `remember(key: string, ttl: number, callback: () => Promise<any>): Promise<any>` - Cache computed value
- `rememberForever(key: string, callback: () => Promise<any>): Promise<any>` - Cache permanently
- `sear(key: string, callback: () => Promise<any>): Promise<any>` - Cache value indefinitely
- `pull(key: string, fallback?: any): Promise<any>` - Get and remove
- `forget(key: string): Promise<void>` - Delete a key
- `flush(): Promise<void>` - Clear all entries
- `increment(key: string, value?: number): Promise<number>` - Increment numeric value
- `decrement(key: string, value?: number): Promise<number>` - Decrement numeric value
- `tags(...names: string[]): TaggedCache` - Create a tagged cache instance
- `lock(name: string, timeout?: number, owner?: string): Promise<Lock>` - Create an atomic lock
- `rateLimit(key: string, limit: number, window: number): Promise<RateLimiter>` - Create a rate limiter

### TaggedCache

A repository scoped to specific tags.

**Methods:**

Same as Repository, but operations are scoped to the specified tags. Flushing a tagged cache only removes entries with those tags.

### Lock

Represents an atomic lock.

**Methods:**

- `acquire(): boolean` - Acquire the lock
- `release(): Promise<void>` - Release the lock
- `forceRelease(): Promise<void>` - Force release without ownership check
- `block(timeout: number, callback: () => Promise<void>): Promise<void>` - Wait for lock and execute callback

### RateLimiter

Tracks and enforces rate limits.

**Methods:**

- `hit(): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }>` - Record a request
- `hits(key: string, limit: number): Promise<number>` - Get hit count
- `remaining(key: string, limit: number): Promise<number>` - Get remaining requests
- `retry(key: string, limit: number): Promise<number>` - Get retry delay
- `reset(key: string): Promise<void>` - Reset rate limit
- `clear(prefix: string): Promise<void>` - Clear limits by prefix
