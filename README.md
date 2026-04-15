# ![Atlex](/docs/public/logo.svg)

**A modern framework for Node.js**

[![npm version](https://img.shields.io/npm/v/@atlex/cli.svg?style=flat-square&color=7c3aed)](https://www.npmjs.com/package/@atlex/cli)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-brightgreen?style=flat-square)](https://nodejs.org)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow?style=flat-square&logo=buy-me-a-coffee)](https://buymeacoffee.com/khamazaspyan)

Build elegant, production-ready applications with the developer experience you love.

[Documentation](https://atlex.dev) · [Getting Started](#quick-start) · [CLI Reference](#cli-reference) · [Packages](#packages)

---

## Why Atlex?

Atlex is built for the **TypeScript ecosystem** with a focus on developer experience: expressive routing, a powerful ActiveRecord ORM, built-in auth, queues, mail, caching, and more — all in one cohesive framework.

| Feature                  | Description                                                      |
| ------------------------ | ---------------------------------------------------------------- |
| **Expressive Routing**   | Define routes with decorators or a fluent API                    |
| **Dependency Injection** | Built-in IoC container with decorator-based DI                   |
| **Powerful ORM**         | ActiveRecord models, migrations, seeders, and factories          |
| **Authentication**       | JWT + session auth with guards, middleware, and password hashing |
| **Mail**                 | Fluent mail builder with SMTP, SES, Mailgun drivers              |
| **Queue**                | Background jobs with Redis, SQS, database drivers                |
| **Notifications**        | Multi-channel notifications: mail, Slack, database               |
| **Cache**                | Redis, file, in-memory drivers with tags and locks               |
| **Storage**              | Local, S3, GCS filesystem abstraction                            |
| **Config**               | Centralized config with `.env` support and type-safe access      |
| **Logging**              | Multi-channel logging: console, file, daily rotation             |
| **Encryption**           | AES-256-GCM encryption with key rotation                         |
| **Testing**              | First-class testing toolkit: HTTP client, fakes, assertions      |

---

## Quick Start

### 1. Create a new application

```bash
npm install -g @atlex/cli

atlex new my-app
```

The interactive prompt will ask for your preferred language (TypeScript or JavaScript). Once scaffolded:

```bash
cd my-app
npm install
npm run dev
```

Your app is running at `http://localhost:3000`.

### 2. Generate an application key

```bash
atlex key:generate
```

---

## CLI Reference

### Project Scaffolding

```bash
# Create a new Atlex application
atlex new <app-name>

# Example
atlex new my-app
```

---

### Development Server

```bash
# Start the HTTP server (runs `npm run start`)
atlex serve

# Start on a specific port
atlex serve --port 4000
```

---

### Code Generators

All `make:*` commands create files under `app/` (or the appropriate directory) and support `--force` to overwrite existing files.

```bash
# Controller
atlex make:controller User
atlex make:controller User --api          # REST controller with index/store/show/update/destroy

# Model
atlex make:model Post
atlex make:model Post --migration         # Also generates the create_posts_table migration

# Migration
atlex make:migration create_posts_table
atlex make:migration add_status_to_posts_table

# Seeder
atlex make:seeder User

# Factory
atlex make:factory User

# Background job
atlex make:job ProcessPodcast

# Mail
atlex make:mail WelcomeMail

# Notification
atlex make:notification OrderShipped

# Event
atlex make:event UserRegistered

# Listener
atlex make:listener SendWelcomeEmail

# Middleware
atlex make:middleware EnsureEmailVerified

# Service provider
atlex make:provider AppServiceProvider

# Form request
atlex make:request StorePostRequest

# API resource
atlex make:resource PostResource

# Auth guard
atlex make:guard JwtGuard

# Custom console command
atlex make:command SendEmails

# Config file
atlex make:config mail

# Service class
atlex make:service PaymentService

# Collection
atlex make:collection PostCollection

# Auth policy
atlex make:policy PostPolicy

# Notification database table migration
atlex make:notification-table
```

---

### Database Migrations

```bash
# Run all pending migrations
atlex migrate

# Rollback the last migration batch
atlex migrate:rollback

# Rollback all migrations
atlex migrate:reset

# Rollback and re-run all migrations
atlex migrate:refresh

# Drop all tables and re-run all migrations
atlex migrate:fresh

# Show migration status
atlex migrate:status
```

---

### Database Seeding

```bash
# Run the default DatabaseSeeder
atlex db:seed

# Run a specific seeder class
atlex db:seed --class UserSeeder
```

---

### Queue Worker

```bash
# Start processing jobs from the default connection
atlex queue:work

# Process a specific connection
atlex queue:work redis

# Specify queues (priority order)
atlex queue:work --queue high,default,low

# Parallel processing
atlex queue:work --concurrency 4

# Stop after processing N jobs
atlex queue:work --max-jobs 100

# Stop after N seconds
atlex queue:work --max-time 3600

# Stop when queue is empty
atlex queue:work --stop-when-empty

# Full example
atlex queue:work redis --queue high,default --concurrency 4 --timeout 90 --tries 3
```

**All `queue:work` options:**

| Option              | Default         | Description                                  |
| ------------------- | --------------- | -------------------------------------------- |
| `[connection]`      | config default  | Queue connection name                        |
| `--queue <names>`   | `default`       | Comma-separated queue names (priority order) |
| `--concurrency <n>` | `1`             | Parallel job processors                      |
| `--sleep <n>`       | `3`             | Seconds to sleep when queue is empty         |
| `--timeout <n>`     | `60`            | Per-job timeout in seconds                   |
| `--tries <n>`       | `1`             | Max attempts per job                         |
| `--max-jobs <n>`    | `0` (unlimited) | Stop worker after N jobs                     |
| `--max-time <n>`    | `0` (unlimited) | Stop worker after N seconds                  |
| `--memory <n>`      | `0` (disabled)  | Stop if memory exceeds MB                    |
| `--rest <ms>`       | `0`             | Pause between jobs in milliseconds           |
| `--stop-when-empty` | `false`         | Exit when the queue drains                   |
| `--force`           | `false`         | Process jobs even in maintenance mode        |
| `--name <name>`     | `default`       | Worker identifier name                       |

---

### Failed Jobs

```bash
# List failed jobs
atlex queue:failed

# Filter by queue
atlex queue:failed --queue high

# Limit output rows
atlex queue:failed --limit 100

# Retry a specific failed job by UUID
atlex queue:retry <uuid>

# Retry all failed jobs
atlex queue:retry --all

# Retry all failed jobs from a specific queue
atlex queue:retry --queue high

# Retry a range of failed job IDs
atlex queue:retry --range 1..50

# Flush (delete) all failed jobs
atlex queue:flush
```

---

### Task Scheduler

```bash
# Run all tasks that are due at this minute
atlex schedule:run

# List all registered scheduled tasks
atlex schedule:list
```

Wire this up with a system cron to run every minute:

```
* * * * * cd /path/to/app && atlex schedule:run >> /dev/null 2>&1
```

---

### Configuration

```bash
# Cache all config files into bootstrap/cache/config.cached.json
atlex config:cache

# Clear the configuration cache
atlex config:clear
```

---

### Authentication

```bash
# Clear expired password reset tokens
atlex auth:clear-resets
```

---

### Application Key

```bash
# Generate APP_KEY and write to .env
atlex key:generate

# Print the key without writing .env
atlex key:generate --show

# Overwrite existing APP_KEY without confirmation
atlex key:generate --force
```

---

## Code Examples

### Define a Controller

```typescript
import { Controller, Get, Post } from '@atlex/core'
import { auth } from '@atlex/auth'

@Controller('/users')
@Middleware(auth())
export class UserController {
  @Get('/')
  async index() {
    return User.query().paginate(15)
  }

  @Post('/')
  async store(@Body() data: CreateUserDto) {
    return User.create(data)
  }
}
```

Generate with:

```bash
atlex make:controller User --api
```

### Define a Model

```typescript
import { Model, Column, HasMany, BeforeCreate } from '@atlex/orm'
import { hash } from '@atlex/auth'

export class User extends Model {
  static table = 'users'

  @Column() declare name: string
  @Column() declare email: string

  @HasMany(() => Post)
  declare posts: Post[]

  @BeforeCreate()
  async hashPassword() {
    this.password = await hash(this.password)
  }
}
```

Generate with:

```bash
atlex make:model User --migration
atlex migrate
```

### Fluent Routing

```typescript
import { Route } from '@atlex/core'

Route.get('/', (_req, res) => res.json({ message: 'Welcome to Atlex' }))

Route.group('/api', () => {
  Route.middleware(['auth']).group(() => {
    Route.get('/users', [UserController, 'index'])
    Route.post('/users', [UserController, 'store'])
  })
})
```

### Background Jobs

```typescript
import { Job } from '@atlex/queue'

export class ProcessPodcast extends Job {
  static queue = 'podcasts'
  static maxTries = 3

  async handle() {
    // process this.data.podcast ...
  }
}

// Dispatch
await new ProcessPodcast({ podcast }).dispatch()

// Dispatch with delay
await new ProcessPodcast({ podcast }).delay(60).dispatch()
```

Generate and run with:

```bash
atlex make:job ProcessPodcast
atlex queue:work --queue podcasts --concurrency 2
```

### Send Notifications

```typescript
import { Notification, MailMessage, SlackMessage } from '@atlex/notifications'

export class OrderShipped extends Notification {
  via() {
    return ['mail', 'slack', 'database']
  }

  toMail(notifiable: User): MailMessage {
    return new MailMessage()
      .subject('Your order has shipped!')
      .greeting(`Hello ${notifiable.name}`)
      .line(`Order #${this.order.id} is on its way.`)
      .action('Track Order', this.order.trackingUrl)
  }

  toSlack(): SlackMessage {
    return new SlackMessage()
      .to('#orders')
      .content(`Order #${this.order.id} shipped to ${this.order.address}`)
  }
}

await user.notify(new OrderShipped(order))
```

Generate with:

```bash
atlex make:notification OrderShipped
```

### Testing with Fakes

```typescript
import { test } from 'vitest'
import { TestClient, MailFake, QueueFake } from '@atlex/testing'

test('user registration sends welcome email', async () => {
  const mail = MailFake.install()
  const queue = QueueFake.install()

  const response = await TestClient.post('/register', {
    name: 'Karen',
    email: 'karen@example.com',
    password: 'secret123',
  })

  response.assertCreated()
  mail.assertSent(WelcomeMail, (m) => m.to === 'karen@example.com')
  queue.assertPushed(ProcessNewUser)
})
```

---

## Packages

Atlex is modular — use only what you need:

| Package                                                                      | Description                                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| [`@atlex/core`](https://www.npmjs.com/package/@atlex/core)                   | IoC container, routing, middleware, service providers |
| [`@atlex/orm`](https://www.npmjs.com/package/@atlex/orm)                     | ActiveRecord ORM, migrations, seeders, factories      |
| [`@atlex/auth`](https://www.npmjs.com/package/@atlex/auth)                   | JWT + session authentication, guards, hashing         |
| [`@atlex/queue`](https://www.npmjs.com/package/@atlex/queue)                 | Background job processing (Redis, SQS, database)      |
| [`@atlex/mail`](https://www.npmjs.com/package/@atlex/mail)                   | Email sending (SMTP, SES, Mailgun)                    |
| [`@atlex/cache`](https://www.npmjs.com/package/@atlex/cache)                 | Caching (Redis, file, memory) with tags and locks     |
| [`@atlex/config`](https://www.npmjs.com/package/@atlex/config)               | Configuration management with `.env` support          |
| [`@atlex/log`](https://www.npmjs.com/package/@atlex/log)                     | Structured logging (console, file, daily rotation)    |
| [`@atlex/storage`](https://www.npmjs.com/package/@atlex/storage)             | Filesystem abstraction (local, S3, GCS)               |
| [`@atlex/encryption`](https://www.npmjs.com/package/@atlex/encryption)       | AES-256-GCM encryption with key rotation              |
| [`@atlex/notifications`](https://www.npmjs.com/package/@atlex/notifications) | Multi-channel notifications                           |
| [`@atlex/testing`](https://www.npmjs.com/package/@atlex/testing)             | Testing toolkit: HTTP client, fakes, assertions       |
| [`@atlex/cli`](https://www.npmjs.com/package/@atlex/cli)                     | CLI binary: generators, migrations, queue worker      |

---

## Architecture

```
my-app/
├── app/
│   ├── Http/
│   │   ├── Controllers/    # atlex make:controller
│   │   ├── Middleware/     # atlex make:middleware
│   │   └── Requests/       # atlex make:request
│   ├── Models/             # atlex make:model
│   ├── Jobs/               # atlex make:job
│   ├── Mail/               # atlex make:mail
│   ├── Notifications/      # atlex make:notification
│   ├── Events/             # atlex make:event
│   ├── Listeners/          # atlex make:listener
│   └── Console/
│       └── Kernel.ts       # schedule:run reads this
├── database/
│   ├── migrations/         # atlex make:migration
│   ├── seeders/            # atlex make:seeder
│   └── factories/          # atlex make:factory
├── config/                 # atlex make:config / config:cache
├── atlex.config.ts
└── .env
```

---

## License

MIT © [Karen Hamazaspyan](https://github.com/khamazaspyan)

---

Built with 💜 by Karen Hamazaspyan
