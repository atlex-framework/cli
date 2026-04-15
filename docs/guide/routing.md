# Routing

The Atlex router is a powerful, expressive system for building RESTful APIs and web applications. It provides multiple ways to define routes—from simple function handlers to class-based controllers with decorators—giving you the flexibility to structure your application exactly how you want it.

## Basic Routing

All HTTP verbs are supported through static methods on the `Route` class. Here's how to define basic routes:

```typescript
import { Route } from '@atlex/core'

// GET request
Route.get('/users', (req, res) => {
  res.json({ users: [] })
})

// POST request
Route.post('/users', (req, res) => {
  res.status(201).json({ id: 1, name: 'John Doe' })
})

// PUT request
Route.put('/users/:id', (req, res) => {
  res.json({ id: req.params.id, updated: true })
})

// DELETE request
Route.delete('/users/:id', (req, res) => {
  res.status(204).send()
})

// PATCH request
Route.patch('/users/:id', (req, res) => {
  res.json({ id: req.params.id, patched: true })
})
```

Each route method accepts three parameters:

- **path**: The URI pattern (e.g., `/users`, `/posts/:id`)
- **handler**: A function, controller tuple, or middleware chain
- **options**: Optional configuration object

## Route Parameters

Route parameters allow you to capture dynamic segments of the URL and pass them to your route handler.

### Path Parameters

Path parameters are defined using a colon (`:`) prefix:

```typescript
Route.get('/users/:id', (req, res) => {
  const userId = req.params.id
  res.json({ userId, message: `Fetching user ${userId}` })
})

Route.get('/posts/:postId/comments/:commentId', (req, res) => {
  const { postId, commentId } = req.params
  res.json({ postId, commentId })
})
```

### Optional Parameters

Make parameters optional by appending a `?` to the parameter name:

```typescript
Route.get('/search/:query?', (req, res) => {
  const query = req.params.query || 'all'
  res.json({ results: [], query })
})

Route.get('/products/:category?/:subcategory?', (req, res) => {
  const { category, subcategory } = req.params
  res.json({
    category: category || 'all',
    subcategory: subcategory || 'all',
  })
})
```

### Numeric Parameters

Constrain parameters to numeric values using regex patterns:

```typescript
// Using inline regex constraint
Route.get('/posts/:id(\\d+)', (req, res) => {
  const postId = parseInt(req.params.id, 10)
  res.json({ postId, type: 'number' })
})

// Access query parameters
Route.get('/api/items', (req, res) => {
  const limit = req.query.limit || 10
  const offset = req.query.offset || 0
  res.json({ limit, offset })
})
```

## Route Groups

Group related routes together with a common prefix using the `Route.group()` method. This is useful for organizing your routes and applying shared configuration.

### Basic Route Groups

```typescript
Route.group('/api/v1', () => {
  Route.get('/users', (req, res) => {
    res.json({ users: [] })
  })

  Route.post('/users', (req, res) => {
    res.status(201).json({ id: 1 })
  })

  Route.get('/users/:id', (req, res) => {
    res.json({ id: req.params.id })
  })
})

// Routes are now accessible at:
// GET /api/v1/users
// POST /api/v1/users
// GET /api/v1/users/:id
```

### Nested Route Groups

Groups can be nested to any depth:

```typescript
Route.group('/api', () => {
  Route.group('/v1', () => {
    Route.group('/admin', () => {
      Route.get('/dashboard', (req, res) => {
        res.json({ dashboard: true })
      })

      Route.get('/users', (req, res) => {
        res.json({ users: [] })
      })
    })
  })

  Route.group('/v2', () => {
    Route.get('/dashboard', (req, res) => {
      res.json({ dashboard: true, version: 2 })
    })
  })
})

// Routes accessible at:
// GET /api/v1/admin/dashboard
// GET /api/v1/admin/users
// GET /api/v2/dashboard
```

## Named Routes

Named routes allow you to reference routes by name throughout your application, making it easier to update routes without breaking your code.

```typescript
Route.get(
  '/users/:id',
  (req, res) => {
    res.json({ id: req.params.id })
  },
  { name: 'users.show' },
)

Route.post(
  '/users',
  (req, res) => {
    res.status(201).json({ id: 1 })
  },
  { name: 'users.store' },
)

Route.get(
  '/posts/:id/comments/:commentId',
  (req, res) => {
    res.json({ postId: req.params.id, commentId: req.params.commentId })
  },
  { name: 'posts.comments.show' },
)

// Retrieve routes by name
const userShowRoute = Route.getByName('users.show')
const postCommentsRoute = Route.getByName('posts.comments.show')

// Generate URLs from named routes
const userUrl = Route.url('users.show', { id: 42 })
const commentUrl = Route.url('posts.comments.show', { id: 1, commentId: 5 })
```

Named routes are particularly useful when building a frontend or generating links in emails:

```typescript
// In a response or email template
Route.get(
  '/reset-password/:token',
  (req, res) => {
    res.json({ resetUrl: Route.url('password.reset', { token: req.params.token }) })
  },
  { name: 'password.reset' },
)
```

## Route Middleware

Middleware allows you to filter or process requests before they reach your route handlers. The router supports both inline middleware and named middleware.

### Registering Named Middleware

Register middleware globally so you can apply it to multiple routes:

```typescript
import { Route, Request, Response, NextFunction } from '@atlex/core'

// Register authentication middleware
Route.middleware('auth', (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  // Verify token, attach user to request
  req.user = { id: 1, name: 'John' }
  next()
})

// Register admin-only middleware
Route.middleware('admin', (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
})

// Register CORS middleware
Route.middleware('cors', (req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*')
  next()
})
```

### Applying Middleware to Routes

Apply middleware to individual routes using the `middleware` option:

```typescript
Route.get(
  '/users',
  (req, res) => {
    res.json({ users: req.user ? [{ id: 1 }] : [] })
  },
  {
    name: 'users.index',
    middleware: ['auth'],
  },
)

Route.delete(
  '/users/:id',
  (req, res) => {
    res.status(204).send()
  },
  {
    name: 'users.destroy',
    middleware: ['auth', 'admin'],
  },
)

Route.post(
  '/comments',
  (req, res) => {
    res.status(201).json({ id: 1 })
  },
  {
    name: 'comments.store',
    middleware: ['auth', 'throttle'],
  },
)
```

### Applying Middleware to Groups

Apply middleware to all routes within a group:

```typescript
// Apply auth middleware to all admin routes
Route.middleware(['auth']).group('/admin', () => {
  Route.get('/dashboard', (req, res) => {
    res.json({ dashboard: true, user: req.user })
  })

  Route.get('/users', (req, res) => {
    res.json({ users: [] })
  })

  Route.delete('/users/:id', (req, res) => {
    res.status(204).send()
  })
})

// All routes under /admin now require authentication
```

### Combining Group and Route Middleware

You can apply middleware at both the group and route level. Route-level middleware is applied in addition to group middleware:

```typescript
Route.middleware(['auth']).group('/api', () => {
  Route.get('/profile', (req, res) => {
    res.json({ user: req.user })
  })

  // This route requires both 'auth' and 'admin' middleware
  Route.delete(
    '/users/:id',
    (req, res) => {
      res.status(204).send()
    },
    { middleware: ['admin'] },
  )
})
```

## Controller Routes

Use controller classes to organize your route handlers. The fluent API allows you to reference controller methods using a tuple syntax.

### Basic Controller Pattern

```typescript
// app/controllers/UserController.ts
export class UserController {
  index(req: Request, res: Response) {
    res.json({ users: [] })
  }

  show(req: Request, res: Response) {
    const userId = req.params.id
    res.json({ id: userId, name: 'John Doe' })
  }

  store(req: Request, res: Response) {
    const { name, email } = req.body
    res.status(201).json({ id: 1, name, email })
  }

  update(req: Request, res: Response) {
    const { id } = req.params
    const { name, email } = req.body
    res.json({ id, name, email, updated: true })
  }

  destroy(req: Request, res: Response) {
    const { id } = req.params
    res.status(204).send()
  }
}

// app/routes.ts
import { Route, Request, Response } from '@atlex/core'
import { UserController } from './app/controllers/UserController'

Route.get('/users', [UserController, 'index'])
Route.post('/users', [UserController, 'store'])
Route.get('/users/:id', [UserController, 'show'])
Route.put('/users/:id', [UserController, 'update'])
Route.delete('/users/:id', [UserController, 'destroy'])
```

### RESTful Resource Routes

```typescript
import { Route } from '@atlex/core'
import { PostController } from './app/controllers/PostController'

// Create a full RESTful resource with a single call
Route.group('/posts', () => {
  Route.get('/', [PostController, 'index'], { name: 'posts.index' })
  Route.post('/', [PostController, 'store'], { name: 'posts.store' })
  Route.get('/:id', [PostController, 'show'], { name: 'posts.show' })
  Route.put('/:id', [PostController, 'update'], { name: 'posts.update' })
  Route.delete('/:id', [PostController, 'destroy'], { name: 'posts.destroy' })
})
```

### Controller Routes with Middleware

```typescript
Route.get('/admin/users', [UserController, 'index'], {
  middleware: ['auth', 'admin'],
})

Route.put('/users/:id', [UserController, 'update'], {
  middleware: ['auth'],
  name: 'users.update',
})

// Apply middleware to all controller routes in a group
Route.middleware(['auth']).group('/api', () => {
  Route.get('/profile', [UserController, 'profile'])
  Route.put('/profile', [UserController, 'updateProfile'])
})
```

## Decorator-Based Controllers

Atlex also supports TypeScript decorators for a more declarative approach to defining controller routes. This approach is ideal if you prefer a class-based architecture.

### Using @Controller Decorator

The `@Controller` decorator defines a base prefix for all routes in a class:

```typescript
import { Controller, Get, Post, Put, Delete, Request, Response } from '@atlex/core'

@Controller('/users')
export class UserController {
  @Get('/')
  index(req: Request, res: Response) {
    res.json({ users: [] })
  }

  @Post('/')
  store(req: Request, res: Response) {
    const { name, email } = req.body
    res.status(201).json({ id: 1, name, email })
  }

  @Get('/:id')
  show(req: Request, res: Response) {
    res.json({ id: req.params.id, name: 'John Doe' })
  }

  @Put('/:id')
  update(req: Request, res: Response) {
    const { id } = req.params
    res.json({ id, updated: true })
  }

  @Delete('/:id')
  destroy(req: Request, res: Response) {
    res.status(204).send()
  }
}
```

Routes decorated this way are automatically registered and accessible at:

- GET /users/
- POST /users/
- GET /users/:id
- PUT /users/:id
- DELETE /users/:id

### Nested Controllers with Sub-paths

```typescript
@Controller('/api/v1')
export class ApiController {
  @Get('/status')
  status(req: Request, res: Response) {
    res.json({ status: 'ok', timestamp: new Date() })
  }
}

@Controller('/admin')
export class AdminController {
  @Get('/dashboard')
  dashboard(req: Request, res: Response) {
    res.json({ dashboard: true })
  }

  @Get('/users')
  users(req: Request, res: Response) {
    res.json({ users: [] })
  }
}
```

### Method-Level Decorators

Each HTTP verb has its own decorator. You can also specify a path prefix and options:

```typescript
@Controller('/products')
export class ProductController {
  @Get('/')
  index(req: Request, res: Response) {
    res.json({ products: [] })
  }

  @Get('/:id')
  show(req: Request, res: Response) {
    res.json({ id: req.params.id })
  }

  @Post('/')
  store(req: Request, res: Response) {
    res.status(201).json({ id: 1 })
  }

  @Put('/:id')
  update(req: Request, res: Response) {
    res.json({ id: req.params.id, updated: true })
  }

  @Delete('/:id')
  destroy(req: Request, res: Response) {
    res.status(204).send()
  }

  @Patch('/:id')
  patch(req: Request, res: Response) {
    res.json({ id: req.params.id, patched: true })
  }
}
```

### Middleware on Decorated Controllers

Apply middleware at the class level using the `@Middleware` decorator:

```typescript
import { Controller, Get, Middleware, Request, Response } from '@atlex/core'

@Controller('/admin')
@Middleware(authMiddleware)
@Middleware(adminMiddleware)
export class AdminController {
  @Get('/dashboard')
  dashboard(req: Request, res: Response) {
    res.json({ dashboard: true, user: req.user })
  }

  @Get('/users')
  users(req: Request, res: Response) {
    res.json({ users: [] })
  }
}

// Apply middleware to a specific method
@Controller('/users')
export class UserController {
  @Get('/')
  index(req: Request, res: Response) {
    res.json({ users: [] })
  }

  @Delete('/:id')
  @Middleware(adminMiddleware)
  destroy(req: Request, res: Response) {
    res.status(204).send()
  }
}
```

### Combining Decorators with Options

```typescript
@Controller('/posts')
export class PostController {
  @Get('/', { name: 'posts.index' })
  index(req: Request, res: Response) {
    res.json({ posts: [] })
  }

  @Post('/', { name: 'posts.store' })
  store(req: Request, res: Response) {
    res.status(201).json({ id: 1 })
  }

  @Get('/:id', { name: 'posts.show' })
  show(req: Request, res: Response) {
    res.json({ id: req.params.id })
  }

  @Put('/:id', { name: 'posts.update', middleware: ['auth'] })
  update(req: Request, res: Response) {
    res.json({ id: req.params.id, updated: true })
  }

  @Delete('/:id', { name: 'posts.destroy', middleware: ['auth', 'admin'] })
  destroy(req: Request, res: Response) {
    res.status(204).send()
  }
}
```

## Request and Response

Atlex provides convenient helpers for accessing the current request and building responses.

### Accessing the Current Request

Use the `request()` helper to access the Express Request object:

```typescript
import { Route, request, response } from '@atlex/core'

Route.get('/users/:id', () => {
  const req = request()

  const userId = req.params.id
  const userAgent = req.headers['user-agent']
  const authToken = req.headers.authorization
  const queryParam = req.query.filter

  console.log({ userId, userAgent, authToken, queryParam })
})

Route.post('/data', () => {
  const req = request()
  const { name, email } = req.body
  const contentType = req.headers['content-type']

  console.log({ name, email, contentType })
})
```

### Building Fluent Responses

Use the `response()` helper to build responses fluently:

```typescript
import { Route, response } from '@atlex/core'

// Simple JSON response
Route.get('/users', () => {
  response().json({ users: [] })
})

// With status code
Route.post('/users', () => {
  response().status(201).json({ id: 1, created: true })
})

// With headers
Route.get('/file', () => {
  response()
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', 'attachment; filename="report.pdf"')
    .send('PDF content')
})

// Redirect
Route.get('/old-path', () => {
  response().redirect('/new-path')
})

// Send HTML
Route.get('/home', () => {
  response().header('Content-Type', 'text/html').send('<h1>Welcome</h1>')
})

// Download file
Route.get('/download', () => {
  response().download('/path/to/file.pdf', 'document.pdf')
})
```

### Response Helper Fluent Methods

```typescript
import { Route, response } from '@atlex/core'

Route.post('/users', () => {
  const res = response()

  // Chain multiple methods
  res.status(201).header('X-Custom-Header', 'value').json({
    id: 1,
    name: 'John',
    created_at: new Date(),
  })
})

Route.get('/auth-error', () => {
  response().status(401).header('WWW-Authenticate', 'Bearer').json({ error: 'Unauthorized' })
})

// Send plain text
Route.get('/text', () => {
  response().header('Content-Type', 'text/plain').send('Hello, World!')
})
```

## Route Options

Routes accept an optional `RouteOptions` object that provides additional configuration:

```typescript
interface RouteOptions {
  name?: string // Named route identifier
  middleware?: string[] // Array of middleware names to apply
}
```

### Using Route Options

```typescript
import { Route } from '@atlex/core'

// With name only
Route.get(
  '/users/:id',
  (req, res) => {
    res.json({ id: req.params.id })
  },
  { name: 'users.show' },
)

// With middleware only
Route.delete(
  '/users/:id',
  (req, res) => {
    res.status(204).send()
  },
  { middleware: ['auth', 'admin'] },
)

// With both name and middleware
Route.put(
  '/users/:id',
  (req, res) => {
    res.json({ id: req.params.id, updated: true })
  },
  {
    name: 'users.update',
    middleware: ['auth'],
  },
)

// With controller and options
Route.post('/users', [UserController, 'store'], {
  name: 'users.store',
  middleware: ['auth', 'validated'],
})
```

### Common Route Option Patterns

```typescript
// Resource routes with consistent naming
Route.get('/posts', [PostController, 'index'], { name: 'posts.index' })
Route.post('/posts', [PostController, 'store'], { name: 'posts.store', middleware: ['auth'] })
Route.get('/posts/:id', [PostController, 'show'], { name: 'posts.show' })
Route.put('/posts/:id', [PostController, 'update'], { name: 'posts.update', middleware: ['auth'] })
Route.delete('/posts/:id', [PostController, 'destroy'], {
  name: 'posts.destroy',
  middleware: ['auth', 'admin'],
})

// Grouped resource with consistent middleware
Route.middleware(['api']).group('/api/v1', () => {
  Route.get('/users', [UserController, 'index'], { name: 'users.index' })
  Route.post('/users', [UserController, 'store'], {
    name: 'users.store',
    middleware: ['validated'],
  })
  Route.get('/users/:id', [UserController, 'show'], { name: 'users.show' })
  Route.put('/users/:id', [UserController, 'update'], {
    name: 'users.update',
    middleware: ['validated'],
  })
  Route.delete('/users/:id', [UserController, 'destroy'], {
    name: 'users.destroy',
    middleware: ['admin'],
  })
})
```

## API Reference

Here's a quick reference of the most commonly used routing methods:

### Route Static Methods

| Method                                              | Description                       | Example                                                     |
| --------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `Route.get(path, handler, options?)`                | Register a GET route              | `Route.get('/users', handler)`                              |
| `Route.post(path, handler, options?)`               | Register a POST route             | `Route.post('/users', handler)`                             |
| `Route.put(path, handler, options?)`                | Register a PUT route              | `Route.put('/users/:id', handler)`                          |
| `Route.patch(path, handler, options?)`              | Register a PATCH route            | `Route.patch('/users/:id', handler)`                        |
| `Route.delete(path, handler, options?)`             | Register a DELETE route           | `Route.delete('/users/:id', handler)`                       |
| `Route.group(prefix, callback)`                     | Group routes under a prefix       | `Route.group('/api', () => { ... })`                        |
| `Route.middleware(name, handler)`                   | Register named middleware         | `Route.middleware('auth', authHandler)`                     |
| `Route.middleware(names[]).group(prefix, callback)` | Apply middleware to group         | `Route.middleware(['auth']).group('/admin', () => { ... })` |
| `Route.getByName(name)`                             | Retrieve a route by its name      | `Route.getByName('users.show')`                             |
| `Route.url(name, params?)`                          | Generate a URL from a named route | `Route.url('users.show', { id: 1 })`                        |

### Handler Types

```typescript
// Function handler
type RequestHandler = (req: Request, res: Response) => void

// Controller tuple
type ControllerHandler = [typeof ControllerClass, 'methodName']

// Middleware handler
type MiddlewareHandler = (req: Request, res: Response, next: NextFunction) => void
```

### Decorator Reference

| Decorator                  | Target          | Description                                      |
| -------------------------- | --------------- | ------------------------------------------------ |
| `@Controller(prefix)`      | Class           | Define route prefix for all methods in the class |
| `@Get(path?, options?)`    | Method          | Register a GET route for the method              |
| `@Post(path?, options?)`   | Method          | Register a POST route for the method             |
| `@Put(path?, options?)`    | Method          | Register a PUT route for the method              |
| `@Patch(path?, options?)`  | Method          | Register a PATCH route for the method            |
| `@Delete(path?, options?)` | Method          | Register a DELETE route for the method           |
| `@Middleware(handler)`     | Class or Method | Apply middleware to controller or method         |

### Request Helper

```typescript
import { request } from '@atlex/core'

const req = request() // Returns the current Express Request object
req.params // Route parameters
req.query // Query string parameters
req.body // Request body (if using body parser)
req.headers // Request headers
req.user // User object (typically set by auth middleware)
```

### Response Helper

```typescript
import { response } from '@atlex/core';

const res = response(); // Returns a fluent HttpResponse builder

res.status(code)                          // Set HTTP status code
res.json(data)                            // Send JSON response
res.send(data)                            // Send response
res.header(name, value)                   // Set response header
res.redirect(url)                         // Redirect to URL
res.download(path, filename?)             // Download file
```

## Best Practices

- **Use named routes**: Make your route references maintainable by giving important routes descriptive names
- **Group related routes**: Keep your routing code organized by grouping related endpoints under common prefixes
- **Apply middleware strategically**: Use group-level middleware for shared concerns (auth, logging) and route-level for specific needs
- **Prefer controllers**: For anything beyond trivial endpoints, use controller classes to keep your route file clean
- **Use decorators for clarity**: Decorator-based controllers provide excellent readability and reduce boilerplate
- **Separate concerns**: Keep route definitions separate from business logic by using controllers

## Further Reading

For more advanced routing patterns and integration with other Atlex features, check out the [Controllers Guide](/guide/controllers) and [Middleware Guide](/guide/middleware).
