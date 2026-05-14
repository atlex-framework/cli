# Controllers

Controllers are the heart of your Atlex application. They handle incoming HTTP requests, process business logic, and return responses. This guide covers everything you need to know about building and organizing controllers.

## Introduction

A controller is a TypeScript class that groups related request-handling logic. Instead of defining all your routes in a single file, controllers let you organize your application by feature or domain.

For example, you might have a `UserController` handling user registration, login, and profile management, and a separate `ProductController` handling product listing and details.

## Defining Controllers

The most common way to define a controller is using the `@Controller` decorator:

```typescript
import { Controller, Get, Post, Req, Res } from '@atlex/core'

@Controller('/users')
export class UserController {
  @Get('/')
  async listUsers(req: Req, res: Res) {
    const users = await db.query('SELECT * FROM users')
    res.json(users)
  }

  @Get('/:id')
  async getUser(req: Req, res: Res) {
    const user = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id])
    res.json(user)
  }

  @Post('/')
  async createUser(req: Req, res: Res) {
    const { email, name } = req.body
    const result = await db.query('INSERT INTO users (email, name) VALUES (?, ?)', [email, name])
    res.status(201).json({ id: result.insertId, email, name })
  }
}
```

All routes in this controller automatically inherit the `/users` prefix. So `@Get('/')` creates a route for `GET /users`, and `@Get('/:id')` creates `GET /users/:id`.

## Decorator-Based Controllers

### HTTP Method Decorators

Atlex provides decorators for all standard HTTP methods:

```typescript
import { Controller, Get, Post, Put, Patch, Delete } from '@atlex/core'

@Controller('/posts')
export class PostController {
  @Get('/')
  listPosts(req: Req, res: Res) {
    // GET /posts
  }

  @Get('/:id')
  getPost(req: Req, res: Res) {
    // GET /posts/:id
  }

  @Post('/')
  createPost(req: Req, res: Res) {
    // POST /posts
  }

  @Put('/:id')
  updatePost(req: Req, res: Res) {
    // PUT /posts/:id (full replacement)
  }

  @Patch('/:id')
  partialUpdate(req: Req, res: Res) {
    // PATCH /posts/:id (partial update)
  }

  @Delete('/:id')
  deletePost(req: Req, res: Res) {
    // DELETE /posts/:id
  }
}
```

### Accessing Request and Response

The simplest way to access request and response objects is through the method parameters:

```typescript
@Controller('/articles')
export class ArticleController {
  @Get('/:id')
  getArticle(req: Req, res: Res) {
    const articleId = req.params.id
    const filter = req.query.filter
    const headers = req.headers

    res.json({
      id: articleId,
      filter,
      headers,
    })
  }

  @Post('/')
  createArticle(req: Req, res: Res) {
    const { title, content } = req.body
    res.status(201).json({ title, content })
  }
}
```

Alternatively, you can use the `request()` and `response()` helper functions if you prefer a more functional style:

```typescript
import { Controller, Get, request, response } from '@atlex/core'

@Controller('/comments')
export class CommentController {
  @Get('/:id')
  getComment() {
    const req = request()
    const res = response()

    const commentId = req.params.id
    res.json({ id: commentId })
  }
}
```

### Parameter Decorators

If your controller has parameter decorators available (`@Body()`, `@Param()`, `@Query()`), you can use them for cleaner method signatures:

```typescript
import { Controller, Post, Body, Param, Query } from '@atlex/core'

@Controller('/orders')
export class OrderController {
  @Post('/:id/items')
  addItem(@Param('id') orderId: string, @Body('item') item: any, @Query('notify') notify: boolean) {
    // Handle request
  }
}
```

## Resource Controllers

Resource controllers follow RESTful conventions and automatically map standard CRUD operations. Create a resource controller by extending the base resource pattern:

```typescript
import { Controller, Get, Post, Put, Delete, Req, Res } from '@atlex/core'

@Controller('/products')
export class ProductController {
  // List all products
  @Get('/')
  index(req: Req, res: Res) {
    res.json({ message: 'All products' })
  }

  // Show creation form (or return creation schema for APIs)
  @Get('/create')
  create(req: Req, res: Res) {
    res.json({ schema: 'product schema' })
  }

  // Store a product
  @Post('/')
  store(req: Req, res: Res) {
    res.status(201).json({ message: 'Product created' })
  }

  // Show specific product
  @Get('/:id')
  show(req: Req, res: Res) {
    res.json({ id: req.params.id })
  }

  // Show edit form (or return current resource for APIs)
  @Get('/:id/edit')
  edit(req: Req, res: Res) {
    res.json({ id: req.params.id })
  }

  // Update product
  @Put('/:id')
  update(req: Req, res: Res) {
    res.json({ id: req.params.id, updated: true })
  }

  // Delete product
  @Delete('/:id')
  destroy(req: Req, res: Res) {
    res.json({ id: req.params.id, deleted: true })
  }
}
```

This pattern maps to these routes:

- `GET /products` → `index()`
- `GET /products/create` → `create()`
- `POST /products` → `store()`
- `GET /products/:id` → `show()`
- `GET /products/:id/edit` → `edit()`
- `PUT /products/:id` → `update()`
- `DELETE /products/:id` → `destroy()`

## Controller Middleware

Middleware can be applied at the controller or method level using the `@Middleware` decorator.

### Class-Level Middleware

Apply middleware to all methods in a controller:

```typescript
import { Controller, Middleware, Get, Req, Res } from '@atlex/core'

const authenticate = (req: Req, res: Res, next: Function) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

@Controller('/admin')
@Middleware(authenticate)
export class AdminController {
  @Get('/dashboard')
  dashboard(req: Req, res: Res) {
    res.json({ dashboard: 'data' })
  }

  @Get('/stats')
  stats(req: Req, res: Res) {
    res.json({ stats: 'data' })
  }
}
```

Both routes require authentication.

### Method-Level Middleware

Apply middleware to specific methods:

```typescript
const validateAdmin = (req: Req, res: Res, next: Function) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}

@Controller('/users')
export class UserController {
  @Get('/')
  listUsers(req: Req, res: Res) {
    res.json({ users: [] })
  }

  @Delete('/:id')
  @Middleware(validateAdmin)
  deleteUser(req: Req, res: Res) {
    res.json({ deleted: true })
  }
}
```

Only the delete operation requires admin validation.

### Multiple Middleware

Stack multiple middleware by passing an array:

```typescript
@Controller('/posts')
@Middleware([authenticate, rateLimit])
export class PostController {
  @Post('/')
  @Middleware([validatePostData, checkQuota])
  createPost(req: Req, res: Res) {
    res.status(201).json({ created: true })
  }
}
```

Middleware executes in the order specified.

## Request Validation in Controllers

Validate request data directly within your controller methods:

```typescript
@Controller('/auth')
export class AuthController {
  @Post('/register')
  async register(req: Req, res: Res) {
    // Validate request data
    try {
      await req.validate({
        email: 'required|email',
        password: 'required|min:8',
        name: 'required|string',
      })
    } catch (errors) {
      return res.status(422).json({ errors })
    }

    const { email, password, name } = req.body
    // Process registration
    res.status(201).json({ user: { email, name } })
  }

  @Post('/login')
  async login(req: Req, res: Res) {
    await req.validate({
      email: 'required|email',
      password: 'required',
    })

    const { email, password } = req.body
    // Authenticate user
    res.json({ token: 'jwt-token' })
  }
}
```

When validation fails, the `validate()` method throws an error with details about which fields failed validation.

## Dependency Injection in Controllers

Controllers integrate seamlessly with Atlex's service container. Declare dependencies in your controller's constructor, and they'll be automatically injected:

```typescript
import { Controller, Get, Req, Res, Inject } from '@atlex/core'

class UserService {
  async getUsers() {
    return [{ id: 1, name: 'Alice' }]
  }
}

@Controller('/users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('/')
  async listUsers(req: Req, res: Res) {
    const users = await this.userService.getUsers()
    res.json(users)
  }
}
```

You can also use the `@Inject()` decorator to specify which service to inject:

```typescript
import { Controller, Get, Inject } from '@atlex/core'

@Controller('/settings')
export class SettingsController {
  constructor(
    @Inject('ConfigService') private config: any,
    @Inject('CacheService') private cache: any,
  ) {}

  @Get('/')
  getSettings(req: Req, res: Res) {
    const setting = this.config.get('app.name')
    res.json({ setting })
  }
}
```

Register your services in a service provider before using them:

```typescript
import { Application } from '@atlex/core'

const app = new Application()

app.container.singleton('UserService', () => new UserService())
app.container.singleton('ConfigService', () => new ConfigService())
app.container.singleton('CacheService', () => new CacheService())
```

## Response Helpers

Atlex provides helper methods on the response object for common operations:

```typescript
@Controller('/api')
export class ApiController {
  @Get('/json')
  json(req: Req, res: Res) {
    res.json({ message: 'JSON response' })
  }

  @Get('/text')
  text(req: Req, res: Res) {
    res.text('Plain text response')
  }

  @Get('/html')
  html(req: Req, res: Res) {
    res.html('<h1>HTML response</h1>')
  }

  @Get('/redirect')
  redirect(req: Req, res: Res) {
    res.redirect('/home')
  }

  @Get('/not-found')
  notFound(req: Req, res: Res) {
    res.status(404).json({ error: 'Not found' })
  }

  @Get('/created')
  created(req: Req, res: Res) {
    res.status(201).json({ created: true })
  }

  @Get('/no-content')
  noContent(req: Req, res: Res) {
    res.status(204).send()
  }

  @Get('/custom-status')
  custom(req: Req, res: Res) {
    res.status(418).json({ message: 'I am a teapot' })
  }
}
```

## Organizing Controllers

### File Structure

Organize controllers by feature:

```
src/
├── app/
│   ├── controllers/
│   │   ├── AuthController.ts
│   │   ├── UserController.ts
│   │   ├── PostController.ts
│   │   └── CommentController.ts
│   ├── services/
│   │   ├── UserService.ts
│   │   └── PostService.ts
│   └── middleware/
│       ├── authenticate.ts
│       └── validateAdmin.ts
└── main.ts
```

### Registering Controllers

Register all your controllers when setting up the application:

```typescript
import { Application } from '@atlex/core'
import AuthController from './app/controllers/AuthController'
import UserController from './app/controllers/UserController'
import PostController from './app/controllers/PostController'

const app = new Application()

// Register controllers with the application
app.resolveController(AuthController)
app.resolveController(UserController)
app.resolveController(PostController)

app.listen(3000)
```

Or use the fluent route registration syntax for more control:

```typescript
import { Route } from '@atlex/core'

Route.get('/users', [UserController, 'listUsers'])
Route.get('/users/:id', [UserController, 'getUser'])
Route.post('/users', [UserController, 'createUser'])

app.listen(3000)
```

### Controller Inheritance

Share common logic across controllers using inheritance:

```typescript
import { Controller, Get, Req, Res } from '@atlex/core'

abstract class BaseController {
  protected async checkPermission(req: Req, resource: string): Promise<boolean> {
    return req.user?.permissions?.includes(resource) ?? false
  }

  protected jsonError(res: Res, message: string, status: number = 400) {
    res.status(status).json({ error: message })
  }
}

@Controller('/articles')
export class ArticleController extends BaseController {
  @Get('/:id')
  async getArticle(req: Req, res: Res) {
    const canView = await this.checkPermission(req, 'articles.view')
    if (!canView) {
      return this.jsonError(res, 'Unauthorized', 403)
    }
    res.json({ article: { id: req.params.id } })
  }
}

@Controller('/comments')
export class CommentController extends BaseController {
  @Get('/:id')
  async getComment(req: Req, res: Res) {
    const canView = await this.checkPermission(req, 'comments.view')
    if (!canView) {
      return this.jsonError(res, 'Unauthorized', 403)
    }
    res.json({ comment: { id: req.params.id } })
  }
}
```

## API Reference

### @Controller(prefix: string)

Decorator to mark a class as a controller and define the route prefix.

```typescript
@Controller('/api/users')
export class UserController {
  // All routes defined here will have /api/users prefix
}
```

### @Get, @Post, @Put, @Patch, @Delete(path: string)

Decorators to define HTTP method handlers.

```typescript
@Controller('/posts')
export class PostController {
  @Get('/')           // GET /posts
  @Get('/:id')        // GET /posts/:id
  @Post('/')          // POST /posts
  @Put('/:id')        // PUT /posts/:id
  @Patch('/:id')      // PATCH /posts/:id
  @Delete('/:id')     // DELETE /posts/:id
}
```

### @Middleware(handler | handlers)

Apply middleware to a controller or method.

```typescript
@Controller('/admin')
@Middleware(authenticate)
export class AdminController {
  @Delete('/:id')
  @Middleware([checkAdmin, logAction])
  delete(req: Req, res: Res) {}
}
```

### req.validate(rules)

Validate incoming request data against a set of rules.

```typescript
@Post('/users')
async create(req: Req, res: Res) {
  await req.validate({
    email: 'required|email',
    age: 'required|number|min:18'
  });
  // Proceed with validated data
}
```

### res.json(data)

Send a JSON response.

```typescript
res.json({ message: 'Success' })
```

### res.status(code)

Set the HTTP response status code.

```typescript
res.status(201).json({ created: true })
res.status(404).json({ error: 'Not found' })
```

### res.redirect(path)

Redirect to another path.

```typescript
res.redirect('/home')
res.redirect('https://example.com')
```

### res.text(text)

Send a plain text response.

```typescript
res.text('Hello, World!')
```

### res.html(html)

Send an HTML response.

```typescript
res.html('<h1>Welcome</h1>')
```

### Application.resolveController(Controller)

Register a controller with the application, automatically creating all its routes.

```typescript
const app = new Application()
app.resolveController(UserController)
app.resolveController(PostController)
```

### Route.get/post/put/patch/delete(path, [Controller, method])

Register a specific route using the fluent syntax.

```typescript
Route.get('/users/:id', [UserController, 'getUser'])
Route.post('/users', [UserController, 'createUser'])
Route.delete('/users/:id', [UserController, 'deleteUser'])
```

This gives you fine-grained control over which controller methods are exposed and how they're routed.
