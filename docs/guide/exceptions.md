# Exception Handling

Atlex provides a centralized exception handling system that catches errors thrown during HTTP request processing and converts them into clean, consistent responses. Instead of exposing raw stack traces to your users, you control exactly what they see.

## Installation

Exception handling is part of the core package:

```bash
pnpm add @atlex/core
```

## How It Works

When an error is thrown inside a route handler, middleware, or controller, Atlex's exception handler middleware catches it and transforms it into an appropriate HTTP response. In development, you get detailed error information. In production, users see clean error messages without implementation details.

```typescript
// This error is caught and handled automatically
Route.get('/users/:id', async (req, res) => {
  const user = await User.findOrFail(req.params.id)
  // If user not found, ModelNotFoundException is thrown
  // Atlex converts it to a 404 JSON response
  res.json(user)
})
```

## Built-In Exceptions

Atlex ships with typed exceptions that map to specific HTTP status codes:

### AtlexError

The base error class for all framework exceptions:

```typescript
import { AtlexError } from '@atlex/core'

export class InsufficientFundsError extends AtlexError {
  constructor(
    public readonly balance: number,
    public readonly required: number,
  ) {
    super(`Insufficient funds: have ${balance}, need ${required}`)
    this.statusCode = 422
    this.code = 'INSUFFICIENT_FUNDS'
  }
}
```

### Common Exceptions

| Exception                  | Status | Package             | When Thrown                    |
| -------------------------- | ------ | ------------------- | ------------------------------ |
| `ValidationException`      | 422    | `@atlex/core`       | Request validation fails       |
| `ModelNotFoundException`   | 404    | `@atlex/orm`        | `findOrFail()` finds no record |
| `MassAssignmentException`  | 500    | `@atlex/orm`        | Assigning a guarded attribute  |
| `QueryException`           | 500    | `@atlex/orm`        | Database query error           |
| `CircularDependencyError`  | 500    | `@atlex/core`       | Circular DI resolution         |
| `DecryptException`         | 500    | `@atlex/encryption` | Decryption fails               |
| `MailException`            | 500    | `@atlex/mail`       | Email sending fails            |
| `MaxAttemptsExceededError` | —      | `@atlex/queue`      | Job exceeds max retries        |

## Creating Custom Exceptions

Define exceptions that carry structured data for API consumers:

```typescript
import { AtlexError } from '@atlex/core'

export class ResourceNotFoundError extends AtlexError {
  constructor(resource: string, id: string | number) {
    super(`${resource} #${id} not found`)
    this.statusCode = 404
    this.code = 'RESOURCE_NOT_FOUND'
  }
}

export class RateLimitExceededError extends AtlexError {
  constructor(public readonly retryAfter: number) {
    super('Too many requests')
    this.statusCode = 429
    this.code = 'RATE_LIMIT_EXCEEDED'
  }
}

export class UnauthorizedError extends AtlexError {
  constructor(message = 'Unauthorized') {
    super(message)
    this.statusCode = 401
    this.code = 'UNAUTHORIZED'
  }
}
```

Use them in your routes and controllers:

```typescript
Route.get('/orders/:id', async (req, res) => {
  const order = await Order.find(req.params.id)
  if (!order) {
    throw new ResourceNotFoundError('Order', req.params.id)
  }

  if (order.userId !== req.user.id) {
    throw new UnauthorizedError('You do not own this order')
  }

  res.json(order)
})
```

## The Exception Handler

### Built-In Middleware

Atlex's `handleExceptions` middleware catches all unhandled errors and converts them to HTTP responses:

```typescript
import { Application, handleExceptions } from '@atlex/core'

const app = new Application()

// Register the exception handler (typically done automatically at boot)
app.express.use(handleExceptions)
```

### Default Behavior

In **development** (`APP_DEBUG=true`), error responses include detailed information:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Order #42 not found",
    "stack": "ResourceNotFoundError: Order #42 not found\n    at ..."
  }
}
```

In **production** (`APP_DEBUG=false`), stack traces are suppressed:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Order #42 not found"
  }
}
```

### Custom Exception Handler

Create a custom handler to control how specific exceptions are rendered:

```typescript
import { ExceptionHandler, AtlexError } from '@atlex/core'

export class AppExceptionHandler extends ExceptionHandler {
  render(error: Error, req: Request, res: Response) {
    // Handle validation errors with a specific format
    if (error instanceof ValidationException) {
      return res.status(422).json({
        message: 'Validation failed',
        errors: error.errors.all(),
      })
    }

    // Handle model not found
    if (error instanceof ModelNotFoundException) {
      return res.status(404).json({
        message: 'Resource not found',
      })
    }

    // Handle rate limiting
    if (error instanceof RateLimitExceededError) {
      return res
        .status(429)
        .header('Retry-After', String(error.retryAfter))
        .json({ message: 'Too many requests', retryAfter: error.retryAfter })
    }

    // Fall back to default handling
    return super.render(error, req, res)
  }

  report(error: Error) {
    // Log the error or send it to an external service
    if (this.shouldReport(error)) {
      logger.error(error.message, { stack: error.stack })
      // sentry.captureException(error)
    }
  }

  shouldReport(error: Error): boolean {
    // Don't report client errors (4xx)
    if (error instanceof AtlexError && error.statusCode < 500) {
      return false
    }
    return true
  }
}
```

Register your handler in a service provider:

```typescript
export class AppServiceProvider extends ServiceProvider {
  register() {
    this.app.container.singleton('exceptionHandler', () => {
      return new AppExceptionHandler()
    })
  }
}
```

## Validation Exceptions

When request validation fails, a `ValidationException` is thrown automatically with a `MessageBag` containing the errors:

```typescript
Route.post('/users', async (req, res) => {
  // If validation fails, a ValidationException is thrown
  const data = req.validate({
    name: 'required|min:2',
    email: 'required|email|unique:users',
    password: 'required|min:8',
  })

  const user = await User.create(data)
  res.status(201).json(user)
})
```

The exception handler converts this into a 422 response:

```json
{
  "message": "Validation failed",
  "errors": {
    "email": ["The email has already been taken."],
    "password": ["The password must be at least 8 characters."]
  }
}
```

### The MessageBag

Access validation error details through the `MessageBag`:

```typescript
try {
  const data = validate(input, rules)
} catch (error) {
  if (error instanceof ValidationException) {
    // Get all errors
    const allErrors = error.errors.all()
    // => { email: ['...'], password: ['...'] }

    // Get errors for a specific field
    const emailErrors = error.errors.get('email')
    // => ['The email has already been taken.']

    // Check if a field has errors
    if (error.errors.has('password')) {
      // ...
    }

    // Get the first error for each field
    const first = error.errors.first('email')
    // => 'The email has already been taken.'
  }
}
```

## Error Responses in APIs

A common pattern is to always return consistent JSON error responses:

```typescript
export class ApiExceptionHandler extends ExceptionHandler {
  render(error: Error, req: Request, res: Response) {
    const statusCode = error instanceof AtlexError ? error.statusCode : 500
    const code = error instanceof AtlexError ? error.code : 'INTERNAL_ERROR'

    const response: Record<string, unknown> = {
      error: {
        code,
        message: statusCode < 500 ? error.message : 'Internal server error',
      },
    }

    // Include validation errors if present
    if (error instanceof ValidationException) {
      response.error.errors = error.errors.all()
    }

    // Include debug info in development
    if (process.env['APP_DEBUG'] === 'true') {
      response.error.debug = {
        message: error.message,
        stack: error.stack,
      }
    }

    return res.status(statusCode).json(response)
  }
}
```

## HTTP Error Helpers

Throw quick HTTP errors without creating custom exception classes:

```typescript
Route.get('/admin', async (req, res) => {
  if (!req.user?.isAdmin) {
    throw new AtlexError('Access denied', 403, 'FORBIDDEN')
  }

  res.json({ message: 'Welcome, admin' })
})

Route.get('/legacy', async (req, res) => {
  throw new AtlexError('This endpoint has been removed', 410, 'GONE')
})
```

## Testing Exception Handling

Use `TestClient` to verify error responses:

```typescript
import { test } from 'vitest'
import { TestClient } from '@atlex/testing'

test('missing resource returns 404', async () => {
  const response = await TestClient.get('/users/99999')
  response.assertNotFound()
  expect(response.json().error.code).toBe('RESOURCE_NOT_FOUND')
})

test('validation errors return 422', async () => {
  const response = await TestClient.post('/users', {
    name: '',
    email: 'not-an-email',
  })

  response.assertStatus(422)

  const body = response.json()
  expect(body.errors.name).toBeDefined()
  expect(body.errors.email).toBeDefined()
})

test('unauthorized access returns 401', async () => {
  const response = await TestClient.get('/admin/dashboard')
  response.assertUnauthorized()
})

test('raw exceptions are caught in production', async () => {
  // Disable exception handling to let errors bubble up
  const client = TestClient.withoutExceptionHandling()

  await expect(client.get('/broken-route')).rejects.toThrow()
})
```

## API Reference

### AtlexError

| Property     | Description                        |
| ------------ | ---------------------------------- |
| `message`    | Human-readable error message       |
| `statusCode` | HTTP status code (default: 500)    |
| `code`       | Machine-readable error code string |
| `stack`      | Stack trace                        |

### ExceptionHandler

| Method                    | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `render(error, req, res)` | Convert an error into an HTTP response         |
| `report(error)`           | Log or report the error to an external service |
| `shouldReport(error)`     | Determine if the error should be reported      |

### ValidationException

| Property     | Description                               |
| ------------ | ----------------------------------------- |
| `errors`     | `MessageBag` containing validation errors |
| `statusCode` | Always `422`                              |

### MessageBag

| Method         | Description                             |
| -------------- | --------------------------------------- |
| `all()`        | Get all errors as `{ field: string[] }` |
| `get(field)`   | Get errors for a specific field         |
| `first(field)` | Get the first error for a field         |
| `has(field)`   | Check if a field has errors             |
