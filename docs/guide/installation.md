# Installation

Atlex is published on npm under the `@atlex` scope. You can scaffold a complete new application in seconds, or add individual packages to an existing Node.js project.

## Requirements

- **Node.js** 20 or later ([download](https://nodejs.org))
- **pnpm** (recommended), **npm**, or **yarn**
- **TypeScript** 5.0+ (recommended, but JavaScript is also supported)

## Creating a New Application

The quickest way to start is with the official scaffolding tool:

::: code-group

```bash [pnpm]
pnpm create @atlex/atlex-app my-app
cd my-app
pnpm install
pnpm dev
```

```bash [npm]
npm create @atlex/atlex-app my-app
cd my-app
npm install
npm run dev
```

```bash [yarn]
yarn create @atlex/atlex-app my-app
cd my-app
yarn install
yarn dev
```

:::

The scaffolder will:

1. Ask you to choose **TypeScript** (recommended) or **JavaScript**
2. Create the project directory with a complete folder structure
3. Generate an `APP_KEY` for encryption
4. Create a `.env` file with sensible defaults
5. Include `docker-compose.yml` and `Dockerfile` for deployment
6. Generate a project `README.md` with quickstart instructions

All `@atlex/*` dependencies are pinned to published semver versions (no `workspace:*` references).

### Scaffolder Options

```bash
# Flags are simplest with the package binary (any package manager):
npx @atlex/create-atlex-app my-app --ts
npx @atlex/create-atlex-app my-app --js
npx @atlex/create-atlex-app my-app --yes
npx @atlex/create-atlex-app my-app --skip-install
```

With **`pnpm create @atlex/atlex-app`**, forward flags after `--`, for example: `pnpm create @atlex/atlex-app my-app -- --ts`.

## Adding Packages to an Existing Project

If you already have a Node.js project and want to add Atlex packages individually:

### Core (Required)

The core package provides the application class, routing, DI container, middleware, and service providers:

```bash
pnpm add @atlex/core
```

### CLI (Recommended)

The framework CLI provides development server, generators, and migration commands:

```bash
pnpm add -D @atlex/cli
```

After installing, the `atlex` binary is available:

```bash
npx atlex --help
npx atlex serve
npx atlex make:controller UserController
npx atlex migrate
```

### Optional Packages

Install only the packages you need:

```bash
# Database ORM
pnpm add @atlex/orm

# Authentication
pnpm add @atlex/auth

# Background queues
pnpm add @atlex/queue

# Email sending
pnpm add @atlex/mail

# Caching
pnpm add @atlex/cache

# Configuration management
pnpm add @atlex/config

# Logging
pnpm add @atlex/log

# File storage
pnpm add @atlex/storage

# Encryption
pnpm add @atlex/encryption

# Notifications
pnpm add @atlex/notifications

# Testing toolkit (dev dependency)
pnpm add -D @atlex/testing
```

### Common Combinations

Here are typical package sets for different project types:

**API server:**

```bash
pnpm add @atlex/core @atlex/orm @atlex/auth @atlex/config @atlex/log
pnpm add -D @atlex/cli @atlex/testing
```

**Full-stack application:**

```bash
pnpm add @atlex/core @atlex/orm @atlex/auth @atlex/mail @atlex/queue @atlex/cache @atlex/config @atlex/log @atlex/storage @atlex/notifications
pnpm add -D @atlex/cli @atlex/testing
```

**Microservice:**

```bash
pnpm add @atlex/core @atlex/config @atlex/log @atlex/queue
pnpm add -D @atlex/cli @atlex/testing
```

## TypeScript Configuration

Atlex is built with strict TypeScript and ESM. Your `tsconfig.json` should include:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*", "routes/**/*", "config/**/*"]
}
```

And your `package.json` should specify ESM:

```json
{
  "type": "module"
}
```

## Environment Setup

### The .env File

Create a `.env` file in your project root (the scaffolder does this automatically):

```
APP_NAME=My App
APP_ENV=local
APP_DEBUG=true
APP_KEY=base64:your-generated-key
APP_URL=http://localhost:3000
APP_PORT=3000

DB_CONNECTION=postgres
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=myapp
DB_USERNAME=postgres
DB_PASSWORD=

CACHE_DRIVER=memory
QUEUE_CONNECTION=sync
LOG_CHANNEL=console
```

Generate an encryption key:

```bash
atlex key:generate
```

### Docker Setup

The scaffolded project includes Docker support:

```bash
# Start PostgreSQL + application
docker-compose up -d

# Run migrations inside the container
docker-compose exec app atlex migrate
```

## The CLI

The `@atlex/cli` package provides the `atlex` binary with these command groups:

```bash
# Development
atlex serve              # Start development server
atlex build              # Build for production

# Code Generation
atlex make:controller    # Create a controller
atlex make:model         # Create a model (with optional -m for migration)
atlex make:migration     # Create a migration
atlex make:seeder        # Create a seeder
atlex make:middleware     # Create middleware
atlex make:job           # Create a queue job
atlex make:mail          # Create a mailable
atlex make:notification  # Create a notification
atlex make:event         # Create an event
atlex make:listener      # Create an event listener
atlex make:factory       # Create a model factory
atlex make:test          # Create a test file

# Database
atlex migrate            # Run pending migrations
atlex migrate:rollback   # Rollback last batch
atlex migrate:fresh      # Drop all tables and re-run
atlex migrate:status     # Show migration status
atlex db:seed            # Run database seeders

# Queue
atlex queue:work         # Start queue worker
atlex queue:failed       # List failed jobs
atlex queue:retry        # Retry a failed job
atlex queue:flush        # Clear the queue

# Configuration
atlex config:cache       # Cache configuration
atlex config:clear       # Clear configuration cache
atlex key:generate       # Generate APP_KEY

# Scheduling
atlex schedule:run       # Run scheduled tasks
atlex schedule:list      # List scheduled tasks
```

Use `atlex --help` for the complete command list and `atlex <command> --help` for details on any command.

## Contributing to the Framework

If you're working on Atlex itself (not just using it), the monorepo uses **pnpm**:

```bash
git clone https://github.com/atlex-framework/atlex.git
cd atlex

# Enable Corepack for the pinned pnpm version
corepack enable && corepack prepare pnpm@10.14.0 --activate

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the full test suite
pnpm test

# Run code quality checks
pnpm quality

# Start the documentation site locally
pnpm docs:dev
```

See [CONTRIBUTING.md](https://github.com/atlex-framework/atlex/blob/main/CONTRIBUTING.md) for the full development workflow.
