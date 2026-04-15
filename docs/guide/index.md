# Getting Started

Welcome to Atlex! This guide walks you through creating your first application from scratch: installing the tooling, defining routes, creating a database model, adding authentication, and deploying to production. By the end, you'll have a solid understanding of how all the pieces fit together.

## Prerequisites

Before you begin, make sure you have:

- **Node.js 20+** installed ([download](https://nodejs.org))
- **pnpm**, **npm**, or **yarn** as your package manager
- A code editor (VS Code recommended)
- A terminal

## Step 1: Create a New Project

The fastest way to get started is with **`@atlex/create-atlex-app`** (initializer: `npm create @atlex/atlex-app`):

```bash
pnpm create @atlex/atlex-app my-app
```

You'll be prompted to choose between TypeScript (recommended) and JavaScript. The scaffolder creates the full project structure, generates an `APP_KEY` for encryption, sets up your `.env` file, and includes Docker configuration:

```
🔮 Create Atlex App v1.0.0

? Project name: my-app
? Language: TypeScript (recommended)

✔ Scaffolding project in ./my-app...

  📁 Created project structure
  📦 Installing dependencies...
  ⚙️  Generating .env file
  📝 Created README.md

✅ Done! Next steps:

  cd my-app
  pnpm dev
```

Navigate into the project and start the development server:

```bash
cd my-app
pnpm install
pnpm dev
```

Visit `http://localhost:3000` — you should see a JSON welcome response. Your Atlex app is running!

## Step 2: Project Structure

Here's what the scaffolder created:

```
my-app/
├── src/
│   └── main.ts              — Application bootstrap
├── routes/
│   ├── web.ts               — HTTP routes
│   └── console.ts           — CLI routes
├── app/
│   └── Console/
│       └── Kernel.ts         — Console command kernel
├── config/
│   ├── app.ts               — Application config
│   ├── database.ts           — Database connections
│   ├── auth.ts              — Authentication config
│   ├── cache.ts             — Cache config
│   ├── mail.ts              — Mail config
│   ├── queue.ts             — Queue config
│   └── logging.ts           — Logging config
├── .env                      — Environment variables
├── .env.example              — Template for .env
├── docker-compose.yml        — Docker services
├── Dockerfile                — Production build
├── package.json
└── tsconfig.json
```

## Step 3: Define Your First Route

Open `routes/web.ts`. This is where you define your HTTP routes:

```typescript
import { Route } from '@atlex/core'

// A simple GET route
Route.get('/', (_req, res) => {
  res.json({ message: 'Welcome to Atlex' })
})

// Add more routes
Route.get('/hello/:name', (req, res) => {
  res.json({ message: `Hello, ${req.params.name}!` })
})

Route.post('/echo', (req, res) => {
  res.json({ received: req.body })
})
```

Save the file and the dev server will hot-reload. Try visiting `http://localhost:3000/hello/Karen`.

### Using a Controller

For more structure, create a controller:

```bash
atlex make:controller UserController
```

This generates `app/Http/Controllers/UserController.ts`:

```typescript
import { Controller, Get, Post } from '@atlex/core'

@Controller('/users')
export class UserController {
  @Get('/')
  async index(req, res) {
    res.json({ users: [] })
  }

  @Post('/')
  async store(req, res) {
    const data = req.validate({
      name: 'required|min:2',
      email: 'required|email',
    })

    res.status(201).json({ user: data })
  }
}
```

## Step 4: Create Your First Model

Install the ORM if it's not already included:

```bash
pnpm add @atlex/orm
```

Generate a model with a migration:

```bash
atlex make:model Post -m
```

This creates two files:

**`app/Models/Post.ts`**:

```typescript
import { Model, Column } from '@atlex/orm'

export class Post extends Model {
  static table = 'posts'

  @Column()
  declare title: string

  @Column()
  declare body: string

  @Column()
  declare published: boolean
}
```

**`database/migrations/xxxx_create_posts_table.ts`**:

```typescript
import { Schema, Blueprint } from '@atlex/orm'

export async function up() {
  await Schema.create('posts', (table: Blueprint) => {
    table.increments('id')
    table.string('title')
    table.text('body')
    table.boolean('published').defaultTo(false)
    table.timestamps()
  })
}

export async function down() {
  await Schema.dropIfExists('posts')
}
```

Run the migration to create the table:

```bash
atlex migrate
```

Now use the model in your routes:

```typescript
import { Route } from '@atlex/core'
import { Post } from '../app/Models/Post.js'

Route.get('/posts', async (_req, res) => {
  const posts = await Post.query()
    .where('published', true)
    .orderBy('created_at', 'desc')
    .paginate(15)

  res.json(posts)
})

Route.post('/posts', async (req, res) => {
  const data = req.validate({
    title: 'required|min:3',
    body: 'required',
  })

  const post = await Post.create({
    title: data.title,
    body: data.body,
    published: false,
  })

  res.status(201).json(post)
})
```

## Step 5: Add Authentication

Install the auth package:

```bash
pnpm add @atlex/auth
```

Add your JWT secret to `.env`:

```
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=3600
```

Create a User model:

```bash
atlex make:model User -m
```

Add authentication to your routes:

```typescript
import { Route } from '@atlex/core'
import { hash, verify } from '@atlex/auth'

// Public routes
Route.post('/register', async (req, res) => {
  const data = req.validate({
    name: 'required',
    email: 'required|email|unique:users',
    password: 'required|min:8',
  })

  const user = await User.create({
    name: data.name,
    email: data.email,
    password: await hash(data.password),
  })

  res.status(201).json({ user })
})

Route.post('/login', async (req, res) => {
  const { email, password } = req.body
  const user = await User.query().where('email', email).first()

  if (!user || !(await verify(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = auth.guard('token').createToken(user)
  res.json({ token })
})

// Protected routes
Route.middleware(['auth']).group(() => {
  Route.get('/profile', async (req, res) => {
    res.json({ user: req.user })
  })
})
```

See the [Authentication guide](./auth.md) for the full picture: guards, sessions vs JWT, password resets, authorization gates, and more.

## Step 6: Write a Test

Install the testing package:

```bash
pnpm add -D @atlex/testing vitest
```

Create a test file:

```typescript
// tests/posts.test.ts
import { test, expect } from 'vitest'
import { TestClient } from '@atlex/testing'

test('can list published posts', async () => {
  const response = await TestClient.get('/posts')

  response.assertOk()
  expect(response.json()).toHaveProperty('data')
})

test('can create a post', async () => {
  const response = await TestClient.post('/posts', {
    title: 'My First Post',
    body: 'Hello, world!',
  })

  response.assertCreated()
  expect(response.json().title).toBe('My First Post')
})

test('validates required fields', async () => {
  const response = await TestClient.post('/posts', {})

  response.assertStatus(422)
})
```

Run your tests:

```bash
pnpm test
```

## Step 7: Deploy

Build your application for production:

```bash
pnpm build
```

Start the production server:

```bash
node --enable-source-maps dist/main.js
```

Or use the included Docker configuration:

```bash
docker-compose up -d
```

The generated `docker-compose.yml` includes PostgreSQL and your application. For simpler setups, point `DB_CONNECTION` to SQLite in your `.env`.

::: tip
Environment-specific values live in `.env`. Never commit this file to version control — use `.env.example` as a template for other developers.
:::

## Next Steps

You've built a working Atlex application with routes, models, authentication, and tests. Here's where to go from here:

- **[Installation](./installation.md)** — Detailed setup guide and requirements
- **[Routing](./routing.md)** — Route groups, middleware, decorators
- **[Controllers](./controllers.md)** — Organizing your request handlers
- **[ORM](./orm.md)** — Models, relationships, migrations, seeders
- **[Authentication](./auth.md)** — Guards, JWT, sessions, authorization
- **[Queue](./queue.md)** — Background job processing
- **[Mail](./mail.md)** — Sending emails
- **[Testing](./testing.md)** — HTTP client, fakes, factories
- **[Configuration](./config.md)** — Environment and config management
