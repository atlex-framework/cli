# Dependency Injection

Dependency Injection (DI) is a core architectural pattern in Atlex that promotes loose coupling, testability, and maintainability. The service container automatically manages object creation, dependency resolution, and lifecycle management.

## Introduction

Dependency Injection is a design pattern that helps you write modular, testable code. Instead of creating dependencies inside a class, you pass them in from the outside. The Atlex service container manages this automatically.

For example, instead of:

```typescript
class UserService {
  private db = new Database() // Hard-coded dependency

  async getUsers() {
    return await this.db.query('SELECT * FROM users')
  }
}
```

You'd do:

```typescript
class UserService {
  constructor(private db: Database) {} // Injected dependency

  async getUsers() {
    return await this.db.query('SELECT * FROM users')
  }
}
```

This makes testing easier (you can pass a mock database) and your code more flexible.

## The Service Container

The service container is the heart of Atlex's DI system. It's responsible for creating instances, managing lifecycles, and resolving dependencies.

### Accessing the Container

Every Atlex application has a container accessible from the Application instance:

```typescript
import { Application } from '@atlex/core'

const app = new Application()
const container = app.container

// Or use the static method
const instance = Application.make(SomeService)
```

### Container Basics

The container stores bindings and resolves them on demand:

```typescript
const container = app.container

// Register a binding
container.bind('DatabaseService', () => new DatabaseService())

// Resolve (get an instance)
const db = container.make('DatabaseService')
```

## Binding Basics

### Binding to a Factory Function

The most common way to bind is with a factory function:

```typescript
container.bind('UserService', () => {
  return new UserService(container.make('Database'))
})

const userService = container.make('UserService')
```

The factory function is called every time you request the binding, creating a new instance.

### Singleton Bindings

For services that should have only one instance throughout the application's lifetime, use singleton:

```typescript
container.singleton('Logger', () => {
  return new Logger('/var/log/app.log')
})

const logger1 = container.make('Logger')
const logger2 = container.make('Logger')

console.log(logger1 === logger2) // true - same instance
```

Singletons are created once and reused. This is perfect for expensive operations like database connections or configuration loaders.

### Binding Instances

Sometimes you already have an instance and just want to register it:

```typescript
const config = new Config()
config.set('app.debug', true)

container.instance('Config', config)

const appConfig = container.make('Config') // Returns the exact same instance
```

### Binding Aliases

Create alternative names for bindings:

```typescript
container.singleton('DatabaseConnection', () => {
  return new MySQLConnection()
})

container.alias('Database', 'DatabaseConnection')
container.alias('DB', 'DatabaseConnection')

const db1 = container.make('Database') // MySQLConnection instance
const db2 = container.make('DB') // Same MySQLConnection instance
const db3 = container.make('DatabaseConnection') // Same instance
```

## Resolving Services

### Basic Resolution

Get an instance from the container:

```typescript
class UserService {
  constructor(private db: Database) {}

  async getUsers() {
    return await this.db.query('SELECT * FROM users')
  }
}

container.bind('UserService', () => {
  return new UserService(container.make('Database'))
})

const userService = container.make('UserService')
```

### Checking for Bindings

Before attempting to resolve, check if a binding exists:

```typescript
if (container.hasBinding('UserService')) {
  const service = container.make('UserService')
}
```

### Method Injection

Pass the container to methods that need it:

```typescript
class OrderProcessor {
  process(order: Order, container: Container) {
    const paymentService = container.make('PaymentService')
    const logger = container.make('Logger')

    logger.info(`Processing order ${order.id}`)
    paymentService.charge(order)
  }
}
```

## Auto-Wiring

Atlex can automatically resolve constructor dependencies by inspecting parameter types. This eliminates much boilerplate:

```typescript
class Database {
  connect() {}
}

class UserService {
  constructor(private db: Database) {}

  getUsers() {
    return this.db.query('SELECT * FROM users')
  }
}

class UserController {
  constructor(private userService: UserService) {}

  async listUsers(req: Req, res: Res) {
    const users = await this.userService.getUsers()
    res.json(users)
  }
}

// Register the base dependency
container.singleton(Database, () => new Database())

// Auto-wiring: Atlex automatically creates UserService with Database
// and creates UserController with UserService
const controller = container.make(UserController)
```

The container automatically resolves the chain: `UserController` needs `UserService`, which needs `Database`. It creates them all without you having to wire them manually.

### Auto-Wiring with Conditional Logic

You can enhance auto-wiring with conditional checks:

```typescript
class Logger {
  constructor(private env: string) {}
}

class UserService {
  constructor(private logger: Logger) {}
}

container.bind(Logger, (container) => {
  const env = process.env.NODE_ENV || 'development'
  return new Logger(env)
})

// Auto-wiring still works
const service = container.make(UserService)
```

## Decorators

Atlex provides decorators to streamline dependency injection:

### @Injectable()

Mark a class as injectable (resolvable by the container):

```typescript
import { Injectable } from '@atlex/core'

@Injectable()
export class Logger {
  log(message: string) {
    console.log(message)
  }
}

// Now you can resolve it directly
const logger = container.make(Logger)
```

Without `@Injectable()`, the container might not know about the class.

### @Singleton()

Mark a class as a singleton automatically:

```typescript
import { Singleton } from '@atlex/core'

@Singleton()
export class DatabaseConnection {
  private connected = false

  connect() {
    this.connected = true
  }
}

const db1 = container.make(DatabaseConnection)
const db2 = container.make(DatabaseConnection)

console.log(db1 === db2) // true
```

### @Inject(token)

Specify which dependency to inject when multiple are available:

```typescript
import { Injectable, Inject } from '@atlex/core'

@Injectable()
export class UserService {
  constructor(
    @Inject('Database') private db: any,
    @Inject('Cache') private cache: any,
  ) {}

  async getUser(id: string) {
    const cached = await this.cache.get(`user:${id}`)
    if (cached) return cached

    const user = await this.db.query('SELECT * FROM users WHERE id = ?', [id])
    await this.cache.set(`user:${id}`, user)
    return user
  }
}

container.singleton('Database', () => new DatabaseConnection())
container.singleton('Cache', () => new RedisCache())
```

When the container resolves `UserService`, it injects the services bound to 'Database' and 'Cache'.

## Service Providers

Service Providers are the recommended way to organize your bindings. They group related registrations with a predictable structure.

### Creating a Service Provider

Create a provider class with `register()` and `boot()` methods:

```typescript
import { ServiceProvider } from '@atlex/core'

export class DatabaseServiceProvider extends ServiceProvider {
  register() {
    // Bindings without dependencies on other services
    this.container.singleton('Database', () => {
      return new MySQLConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      })
    })
  }

  boot() {
    // Bindings that depend on other services being registered
    const db = this.container.make('Database')
    db.connect()
  }
}
```

The `register()` method is called first, then `boot()` after all providers are registered. This ensures all dependencies are available during the boot phase.

### Registering Service Providers

Providers are typically registered in your application bootstrap:

```typescript
import { Application } from '@atlex/core'
import DatabaseServiceProvider from './providers/DatabaseServiceProvider'
import AuthServiceProvider from './providers/AuthServiceProvider'

const app = new Application()

app.register(new DatabaseServiceProvider())
app.register(new AuthServiceProvider())

app.listen(3000)
```

### Complex Service Provider Example

Here's a more realistic example:

```typescript
import { ServiceProvider, Container } from '@atlex/core'

export class MailServiceProvider extends ServiceProvider {
  register() {
    // Register the mail driver factory
    this.container.bind('MailDriver', (container) => {
      const driver = process.env.MAIL_DRIVER || 'smtp'

      switch (driver) {
        case 'sendgrid':
          return new SendGridDriver(process.env.SENDGRID_API_KEY)
        case 'ses':
          return new SESDriver(process.env.AWS_ACCESS_KEY)
        default:
          return new SMTPDriver({
            host: process.env.MAIL_HOST,
            port: process.env.MAIL_PORT,
            user: process.env.MAIL_USER,
            password: process.env.MAIL_PASSWORD,
          })
      }
    })

    // Register the mailer service
    this.container.singleton('Mailer', (container) => {
      const driver = container.make('MailDriver')
      return new Mailer(driver)
    })

    // Register templating for emails
    this.container.singleton('EmailTemplate', () => {
      return new TemplateEngine('./resources/views/emails')
    })
  }

  boot() {
    // Ensure the mailer is warmed up
    const mailer = this.container.make('Mailer')
    mailer.warmup()
  }
}
```

## Contextual Binding

Sometimes you need different implementations based on context. Contextual binding lets you specify which implementation to use where:

```typescript
interface Logger {
  log(message: string): void
}

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(message)
  }
}

class FileLogger implements Logger {
  constructor(private path: string) {}
  log(message: string) {
    // Write to file
  }
}

class UserService {
  constructor(private logger: Logger) {}
}

class AdminService {
  constructor(private logger: Logger) {}
}

// By default, use ConsoleLogger
container.bind(Logger, () => new ConsoleLogger())

// But in AdminService context, use FileLogger instead
container.contextualRule(AdminService, Logger, () => {
  return new FileLogger('/var/log/admin.log')
})

const userService = container.make(UserService) // Gets ConsoleLogger
const adminService = container.make(AdminService) // Gets FileLogger
```

Contextual rules are checked before default bindings, allowing fine-grained control over which implementation is used in different parts of your application.

## Container Events

The container fires events during the resolution lifecycle, allowing you to hook into the process:

### beforeResolveString

Execute code before resolving string-based bindings:

```typescript
container.beforeResolveString('UserService', (container, binding) => {
  console.log(`Resolving UserService from container`)
})

const service = container.make('UserService')
// Output: Resolving UserService from container
```

This is useful for logging, statistics, or deferred binding strategies where you want to register additional bindings on-demand.

### Deferred Service Registration

Use container events to defer binding registration until needed:

```typescript
container.beforeResolveString('PaymentProcessor', (container) => {
  if (!container.hasBinding('StripeDriver')) {
    // Register on first use
    container.singleton('StripeDriver', () => {
      return new StripeDriver(process.env.STRIPE_API_KEY)
    })

    container.singleton('PaymentProcessor', (c) => {
      return new PaymentProcessor(c.make('StripeDriver'))
    })
  }
})

// First access triggers registration and binding
const processor = container.make('PaymentProcessor')
```

## Testing with the Container

The container is designed with testing in mind. Easily swap real implementations for mocks:

### Basic Mocking

```typescript
import { Container } from '@atlex/core'

describe('UserService', () => {
  let container: Container
  let userService: UserService

  beforeEach(() => {
    container = new Container()

    // Register mock database
    const mockDb = {
      query: vi.fn().mockResolvedValue([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]),
    }

    container.instance('Database', mockDb)
    container.singleton('UserService', (c) => {
      return new UserService(c.make('Database'))
    })

    userService = container.make('UserService')
  })

  test('getUsers returns all users', async () => {
    const users = await userService.getUsers()
    expect(users).toHaveLength(2)
  })
})
```

### Testing with Contextual Bindings

```typescript
describe('PaymentService', () => {
  test('uses test payment driver in tests', () => {
    const container = new Container()

    container.contextualRule(PaymentService, PaymentDriver, () => {
      return new TestPaymentDriver()
    })

    const service = container.make(PaymentService)
    expect(service.driver).toBeInstanceOf(TestPaymentDriver)
  })
})
```

### Full Integration Testing

```typescript
describe('User Registration Flow', () => {
  test('registers user and sends email', async () => {
    const container = new Container()

    // Set up real database but mock email service
    container.singleton('Database', () => new TestDatabase())
    container.singleton('EmailService', () => new MockEmailService())

    // All dependent services auto-wire correctly
    const controller = container.make(UserController)

    // Test the flow
    await controller.register({ email: 'test@example.com' })

    const emailService = container.make('EmailService') as MockEmailService
    expect(emailService.sentEmails).toContainEqual(
      expect.objectContaining({ to: 'test@example.com' }),
    )
  })
})
```

## Circular Dependency Detection

The container detects and reports circular dependencies, preventing infinite loops:

```typescript
class ServiceA {
  constructor(serviceB: ServiceB) {}
}

class ServiceB {
  constructor(serviceA: ServiceA) {} // Circular!
}

container.singleton(ServiceA, (c) => new ServiceA(c.make(ServiceB)))
container.singleton(ServiceB, (c) => new ServiceB(c.make(ServiceA)))

// Throws: CircularDependencyError: Circular dependency detected: ServiceA -> ServiceB -> ServiceA
container.make(ServiceA)
```

Break circular dependencies by using lazy injection or refactoring:

```typescript
// Option 1: Lazy injection
class ServiceB {
  constructor(private container: Container) {}

  getServiceA() {
    return this.container.make(ServiceA)
  }
}

// Option 2: Extract to a third service
class SharedLogic {
  doSomething() {}
}

class ServiceA {
  constructor(shared: SharedLogic) {}
}

class ServiceB {
  constructor(shared: SharedLogic) {}
}
```

## API Reference

### container.bind(key, factory)

Register a binding that creates a new instance each time.

```typescript
container.bind('Logger', () => new Logger())
const logger = container.make('Logger') // New instance
```

### container.singleton(key, factory)

Register a binding that creates a single instance, reused throughout the application.

```typescript
container.singleton('Database', () => new MySQLConnection())
const db1 = container.make('Database')
const db2 = container.make('Database')
// db1 === db2 (same instance)
```

### container.instance(key, instance)

Register an existing instance.

```typescript
const config = new Config()
container.instance('Config', config)
```

### container.alias(alias, original)

Create an alias for a binding.

```typescript
container.alias('DB', 'Database')
container.alias('Logger', 'LoggerService')
```

### container.make(key, params?)

Resolve a binding from the container.

```typescript
const service = container.make('UserService')
```

### container.hasBinding(key)

Check if a binding exists.

```typescript
if (container.hasBinding('UserService')) {
  const service = container.make('UserService')
}
```

### container.contextualRule(consumer, need, give)

Register a contextual binding for specific consumers.

```typescript
container.contextualRule(AdminPanel, Logger, () => {
  return new FileLogger()
})
```

### container.beforeResolveString(key, callback)

Hook into string-based resolution.

```typescript
container.beforeResolveString('UserService', (c, binding) => {
  console.log(`Resolving ${binding}`)
})
```

### @Injectable()

Decorator to mark a class as injectable.

```typescript
@Injectable()
export class UserService {}
```

### @Singleton()

Decorator to mark a class as a singleton.

```typescript
@Singleton()
export class Database {}
```

### @Inject(token)

Decorator to specify which dependency to inject.

```typescript
class UserService {
  constructor(@Inject('Database') private db: any) {}
}
```

### Application.make(key)

Static helper to resolve from the application's container.

```typescript
const service = Application.make('UserService')
```

### ServiceProvider

Base class for organizing related bindings.

```typescript
class MyProvider extends ServiceProvider {
  register() {
    this.container.bind('Service', () => new Service())
  }

  boot() {
    const service = this.container.make('Service')
    service.initialize()
  }
}
```
