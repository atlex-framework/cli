# Testing

Atlex's testing package gives you everything you need to write confident, fast tests for your application. It includes an HTTP test client, service fakes for isolating external dependencies, database helpers, model factories, and time manipulation utilities — all designed to work with Vitest.

## Installation

```bash
pnpm add -D @atlex/testing vitest
```

## Quick Start

```typescript
import { test, expect } from 'vitest'
import { TestClient } from '@atlex/testing'

test('welcome route returns 200', async () => {
  const response = await TestClient.get('/')

  response.assertOk()
  expect(response.json().message).toBe('Welcome to Atlex')
})
```

## The Test Client

The `TestClient` lets you make HTTP requests to your application without starting a real server:

### Making Requests

```typescript
import { TestClient } from '@atlex/testing'

// GET request
const response = await TestClient.get('/users')

// POST request with JSON body
const response = await TestClient.post('/users', {
  name: 'Karen',
  email: 'karen@example.com',
  password: 'secret123',
})

// PUT request
const response = await TestClient.put('/users/1', {
  name: 'Karen Updated',
})

// PATCH request
const response = await TestClient.patch('/users/1', {
  name: 'Karen Updated',
})

// DELETE request
const response = await TestClient.delete('/users/1')

// HEAD and OPTIONS
const response = await TestClient.head('/users')
const response = await TestClient.options('/users')
```

### Setting Headers

```typescript
const client = TestClient.withHeaders({
  'Accept-Language': 'fr',
  'X-Custom-Header': 'value',
})

const response = await client.get('/users')
```

Or a single header:

```typescript
const client = TestClient.withHeader('X-Api-Version', '2')
```

### Authentication

Test as an authenticated user:

```typescript
// Authenticate as a specific user
const user = await User.find(1)
const client = TestClient.actingAs(user)

const response = await client.get('/dashboard')
response.assertOk()

// Authenticate with a specific guard
const client = TestClient.actingAs(user, 'api')

// Authenticate with a bearer token
const client = TestClient.withToken('my-api-token')
const response = await client.get('/api/profile')
```

### Cookies

```typescript
const client = TestClient.withCookies({
  session_id: 'abc123',
  preferences: 'dark_mode',
})
```

### Disabling Exception Handling

By default, exceptions are caught and converted to HTTP responses. To let exceptions bubble up for direct assertion:

```typescript
const client = TestClient.withoutExceptionHandling()

await expect(client.get('/broken')).rejects.toThrow('Something went wrong')
```

## Response Assertions

`TestResponse` provides expressive assertions for verifying HTTP responses:

### Status Code Assertions

```typescript
response.assertStatus(200) // Exact status code
response.assertOk() // 200-299
response.assertCreated() // 201
response.assertNoContent() // 204
response.assertRedirect() // 3xx
response.assertNotFound() // 404
response.assertForbidden() // 403
response.assertUnauthorized() // 401
response.assertServerError() // 5xx
```

### Reading the Response

```typescript
// Parse JSON body
const data = response.json()

// Get raw text body
const text = response.text()

// Get the status code
const status = response.statusCode()

// Get all headers
const headers = response.headers()

// Get a specific header
const contentType = response.header('content-type')
```

### Practical Examples

```typescript
test('creating a user returns 201 with user data', async () => {
  const response = await TestClient.post('/users', {
    name: 'Karen',
    email: 'karen@example.com',
    password: 'secret123',
  })

  response.assertCreated()

  const user = response.json()
  expect(user.name).toBe('Karen')
  expect(user.email).toBe('karen@example.com')
  expect(user.password).toBeUndefined() // Hidden field
})

test('invalid data returns validation errors', async () => {
  const response = await TestClient.post('/users', {
    name: '',
    email: 'not-an-email',
  })

  response.assertStatus(422)

  const body = response.json()
  expect(body.errors.name).toBeDefined()
  expect(body.errors.email).toBeDefined()
})
```

## Service Fakes

Fakes replace real services with in-memory doubles that capture interactions for assertion. This lets you test that your code _dispatches_ a job or _sends_ an email without actually doing it.

### Mail Fake

```typescript
import { MailFake } from '@atlex/testing'

test('registration sends a welcome email', async () => {
  const mail = MailFake.install()

  await TestClient.post('/register', {
    name: 'Karen',
    email: 'karen@example.com',
    password: 'secret123',
  })

  // Assert a mailable was sent
  mail.assertSent(WelcomeMail)

  // Assert with a condition
  mail.assertSent(WelcomeMail, (m) => m.to === 'karen@example.com')

  // Assert a mailable was NOT sent
  mail.assertNotSent(PasswordResetMail)

  // Assert count
  mail.assertSentCount(WelcomeMail, 1)
})
```

### Queue Fake

```typescript
import { QueueFake } from '@atlex/testing'

test('order dispatches processing job', async () => {
  const queue = QueueFake.install()

  await TestClient.post('/orders', { product_id: 1, quantity: 3 })

  queue.assertPushed(ProcessOrder)
  queue.assertPushed(ProcessOrder, (job) => job.data.quantity === 3)
  queue.assertNotPushed(RefundOrder)
  queue.assertPushedCount(ProcessOrder, 1)
})
```

### Event Fake

```typescript
import { EventFake } from '@atlex/testing'

test('user registration dispatches event', async () => {
  const events = EventFake.install()

  await TestClient.post('/register', {
    name: 'Karen',
    email: 'karen@example.com',
    password: 'secret123',
  })

  events.assertDispatched(UserRegistered)
  events.assertDispatched(UserRegistered, (e) => e.user.email === 'karen@example.com')
  events.assertNotDispatched(OrderShipped)
  events.assertDispatchedCount(UserRegistered, 1)
})
```

### Notification Fake

```typescript
import { NotificationFake } from '@atlex/testing'

test('order shipment notifies the customer', async () => {
  const notifications = NotificationFake.install()
  const user = await User.find(1)

  await TestClient.post(`/orders/${order.id}/ship`)

  notifications.assertSentTo(user, OrderShippedNotification)
  notifications.assertSentTo(user, OrderShippedNotification, (n) => {
    return n.order.id === order.id
  })
  notifications.assertNotSentTo(user, RefundNotification)
})
```

### Storage Fake

```typescript
import { StorageFake } from '@atlex/testing'

test('avatar upload stores the file', async () => {
  const storage = StorageFake.install()

  await TestClient.post('/profile/avatar', {
    file: createTestFile('avatar.jpg'),
  })

  storage.disk('public').assertExists('avatars/avatar.jpg')
  storage.disk('public').assertMissing('avatars/old.jpg')
})
```

### Cache Fake

```typescript
import { CacheFake } from '@atlex/testing'

test('caching works correctly', async () => {
  const cache = CacheFake.install()

  await TestClient.get('/products/featured')

  // Verify cache interactions
  cache.assertHas('products:featured')
  cache.assertMissing('products:clearance')
})
```

### Log Fake

```typescript
import { LogFake } from '@atlex/testing'

test('failed payment logs an error', async () => {
  const log = LogFake.install()

  await TestClient.post('/payments', { amount: -1 })

  log.assertLogged('error', 'Payment failed')
  log.assertLogged('error', (entry) => entry.context.amount === -1)
  log.assertNotLogged('emergency')
})
```

## Database Testing

### Setting Up a Test Database

Use a separate database for testing, configured in your test setup:

```typescript
// vitest.setup.ts
import { useDatabase, refreshDatabase } from '@atlex/testing'

useDatabase({
  driver: 'sqlite',
  database: ':memory:',
})

beforeEach(async () => {
  await refreshDatabase()
})
```

The `refreshDatabase()` function resets the database schema before each test, ensuring a clean slate.

### Seeding Test Data

Run seeders to populate test data:

```typescript
import { seed } from '@atlex/testing'

test('dashboard shows user count', async () => {
  await seed(UserSeeder)

  const response = await TestClient.get('/admin/dashboard')
  response.assertOk()
  expect(response.json().userCount).toBeGreaterThan(0)
})
```

### Creating a Test Database Programmatically

```typescript
import { createTestDatabase } from '@atlex/testing'

const connection = await createTestDatabase({
  driver: 'postgres',
  host: 'localhost',
  database: 'atlex_test',
})
```

## Model Factories

Factories make it easy to generate model instances with realistic data:

```typescript
import { Factory, fake } from '@atlex/testing'

const UserFactory = new Factory(User, () => ({
  name: fake().person.fullName(),
  email: fake().internet.email(),
  password: 'hashed-password',
  active: true,
}))
```

### Creating Models

```typescript
// Create a single instance (in memory, not saved)
const user = await UserFactory.make()

// Create and persist to the database
const user = await UserFactory.create()

// Create with overrides
const admin = await UserFactory.create({
  role: 'admin',
  email: 'admin@example.com',
})

// Create multiple
const users = await UserFactory.times(10).create()

// Create multiple with overrides
const inactiveUsers = await UserFactory.times(5).create({ active: false })
```

### Using Factories in Tests

```typescript
test('admin can list all users', async () => {
  const admin = await UserFactory.create({ role: 'admin' })
  await UserFactory.times(5).create()

  const response = await TestClient.actingAs(admin).get('/admin/users')

  response.assertOk()
  expect(response.json().data).toHaveLength(6) // 5 + admin
})

test('inactive users are excluded from search', async () => {
  await UserFactory.times(3).create({ active: true })
  await UserFactory.times(2).create({ active: false })

  const response = await TestClient.get('/users')

  response.assertOk()
  expect(response.json().data).toHaveLength(3)
})
```

## Time Manipulation

Control the clock in your tests for time-dependent behavior:

### Freezing Time

```typescript
import { freezeTime, unfreezeTime, now } from '@atlex/testing'

test('trial expires after 14 days', async () => {
  freezeTime(new Date('2024-01-01'))

  const user = await UserFactory.create()
  await TestClient.actingAs(user).post('/start-trial')

  // Travel forward 15 days
  freezeTime(new Date('2024-01-16'))

  const response = await TestClient.actingAs(user).get('/dashboard')
  expect(response.json().trialExpired).toBe(true)

  unfreezeTime()
})
```

### Time Travel

```typescript
import { freezeTime, travelForward, travelBack, now } from '@atlex/testing'

test('cache expires after TTL', async () => {
  freezeTime()

  await cache.put('key', 'value', 60) // 60 seconds TTL
  expect(await cache.get('key')).toBe('value')

  travelForward(61_000) // 61 seconds in milliseconds

  expect(await cache.get('key')).toBeNull()

  unfreezeTime()
})
```

```typescript
import { travelTo } from '@atlex/testing'

test('scheduled report runs on the 1st of the month', async () => {
  travelTo(new Date('2024-02-01T00:00:00'))

  await scheduler.run()

  queue.assertPushed(GenerateMonthlyReport)

  unfreezeTime()
})
```

## Custom Matchers

Register custom Vitest matchers for more expressive tests:

```typescript
import { registerMatchers } from '@atlex/testing'

// In your vitest.setup.ts
registerMatchers()

// Now you can use custom matchers
test('response is JSON', async () => {
  const response = await TestClient.get('/api/users')

  expect(response).toBeJson()
  expect(response).toHaveStatus(200)
})
```

## Making an Empty Application

For unit tests that don't need the full app, create a minimal application:

```typescript
import { makeEmptyApplication } from '@atlex/testing'

test('container resolves service', () => {
  const app = makeEmptyApplication()

  app.container.singleton('myService', () => new MyService())

  const service = app.make(MyService)
  expect(service).toBeInstanceOf(MyService)
})
```

## Full Integration Test Example

Here's a complete test file showing common patterns:

```typescript
import { test, expect, beforeEach } from 'vitest'
import { TestClient, MailFake, QueueFake, EventFake } from '@atlex/testing'
import { refreshDatabase, Factory, fake } from '@atlex/testing'
import { freezeTime, unfreezeTime } from '@atlex/testing'

const UserFactory = new Factory(User, () => ({
  name: fake().person.fullName(),
  email: fake().internet.email(),
  password: 'hashed-password',
}))

const OrderFactory = new Factory(Order, () => ({
  product: fake().commerce.productName(),
  quantity: fake().number.int({ min: 1, max: 10 }),
  total: fake().number.float({ min: 10, max: 500, fractionDigits: 2 }),
}))

beforeEach(async () => {
  await refreshDatabase()
})

test('creating an order sends confirmation and dispatches job', async () => {
  const mail = MailFake.install()
  const queue = QueueFake.install()
  const events = EventFake.install()

  const user = await UserFactory.create()

  const response = await TestClient.actingAs(user).post('/orders', {
    product_id: 1,
    quantity: 3,
  })

  response.assertCreated()

  const order = response.json()
  expect(order.quantity).toBe(3)
  expect(order.userId).toBe(user.id)

  // Verify email was sent
  mail.assertSent(OrderConfirmationMail, (m) => m.to === user.email)

  // Verify job was dispatched
  queue.assertPushed(ProcessOrder, (j) => j.data.orderId === order.id)

  // Verify event was fired
  events.assertDispatched(OrderCreated)
})

test('unauthenticated users cannot create orders', async () => {
  const response = await TestClient.post('/orders', {
    product_id: 1,
    quantity: 1,
  })

  response.assertUnauthorized()
})

test('invalid order data returns validation errors', async () => {
  const user = await UserFactory.create()

  const response = await TestClient.actingAs(user).post('/orders', {
    product_id: null,
    quantity: -1,
  })

  response.assertStatus(422)
  expect(response.json().errors.product_id).toBeDefined()
  expect(response.json().errors.quantity).toBeDefined()
})
```

## API Reference

### TestClient

| Method                       | Description             |
| ---------------------------- | ----------------------- |
| `get(url)`                   | Make a GET request      |
| `post(url, body?)`           | Make a POST request     |
| `put(url, body?)`            | Make a PUT request      |
| `patch(url, body?)`          | Make a PATCH request    |
| `delete(url)`                | Make a DELETE request   |
| `head(url)`                  | Make a HEAD request     |
| `options(url)`               | Make an OPTIONS request |
| `actingAs(user, guard?)`     | Authenticate as a user  |
| `withHeaders(headers)`       | Set request headers     |
| `withHeader(key, value)`     | Set a single header     |
| `withToken(token, type?)`    | Set bearer token        |
| `withCookies(cookies)`       | Set cookies             |
| `withoutExceptionHandling()` | Let exceptions bubble   |

### TestResponse

| Method                 | Description              |
| ---------------------- | ------------------------ |
| `assertStatus(code)`   | Assert exact status code |
| `assertOk()`           | Assert 200-299           |
| `assertCreated()`      | Assert 201               |
| `assertNoContent()`    | Assert 204               |
| `assertRedirect()`     | Assert 3xx               |
| `assertNotFound()`     | Assert 404               |
| `assertForbidden()`    | Assert 403               |
| `assertUnauthorized()` | Assert 401               |
| `assertServerError()`  | Assert 5xx               |
| `json()`               | Parse response as JSON   |
| `text()`               | Get response as text     |
| `headers()`            | Get all response headers |
| `header(name)`         | Get a specific header    |
| `statusCode()`         | Get the status code      |

### Time Helpers

| Function            | Description                            |
| ------------------- | -------------------------------------- |
| `freezeTime(date?)` | Freeze the clock at a specific time    |
| `travelTo(date)`    | Travel to a specific date              |
| `travelForward(ms)` | Travel forward by milliseconds         |
| `travelBack(ms)`    | Travel backward by milliseconds        |
| `unfreezeTime()`    | Restore the real clock                 |
| `now()`             | Get the current (possibly mocked) time |
