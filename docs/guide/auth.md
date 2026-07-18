# Authentication Guide

Atlex provides a comprehensive authentication system that handles user identity verification, session management, authorization, and password reset flows. This guide covers all aspects of securing your application with robust authentication mechanisms.

## Introduction

The authentication system in Atlex is flexible and extensible, supporting multiple authentication guards (session-based and token-based), various user providers, and fine-grained authorization through gates and policies. Whether you're building a traditional web application or a modern API, Atlex provides the tools needed to secure your users' data.

Key features include:

- **Multiple Authentication Guards**: Session and token-based authentication
- **JWT Support**: Complete JWT implementation with access and refresh tokens
- **Password Security**: Multiple hashing algorithms (Bcrypt, Argon2, Scrypt)
- **Session Management**: Flexible session stores (File, Database, Redis, Cookie)
- **Password Reset**: Secure password reset flows with token validation
- **Authorization**: Gates and policies for fine-grained access control
- **Email Verification**: Enforce email verification before account use
- **Login Throttling**: Rate limiting to prevent brute force attacks
- **Event System**: Hooks for authentication lifecycle events

## Configuration

Configure authentication in your `config/auth.ts` file:

```typescript
export default {
  // Default authentication guard
  defaults: {
    guard: 'web',
    passwords: 'users',
  },

  // Guard definitions
  guards: {
    web: {
      driver: 'session',
      provider: 'users',
    },
    api: {
      driver: 'token',
      provider: 'users',
      inputKey: 'api_token',
      storageKey: 'api_token',
      hash: false,
    },
    jwt_api: {
      driver: 'jwt',
      provider: 'users',
      secret: process.env.JWT_SECRET,
    },
  },

  // User provider definitions
  providers: {
    users: {
      driver: 'orm',
      model: 'App/Models/User',
    },
  },

  // Password reset broker
  passwords: {
    users: {
      provider: 'users',
      email: 'emails.password-reset',
      store: 'database',
      expire: 60, // minutes
      throttle: 60, // seconds
    },
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    algorithm: 'HS256',
    accessTokenExpire: 3600, // 1 hour in seconds
    refreshTokenExpire: 604800, // 1 week in seconds
    blacklistStore: 'redis',
  },

  // Session configuration
  session: {
    driver: 'file',
    lifetime: 120, // minutes
    files: 'storage/sessions',
    domain: null,
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
  },

  // Password hashing
  hashing: {
    driver: 'bcrypt',
    bcrypt: {
      rounds: 12,
    },
    argon2: {
      memory: 19456,
      threads: 2,
      time: 2,
    },
    scrypt: {
      memory: 16384,
      blockSize: 8,
      parallelization: 1,
      length: 64,
    },
  },

  // Login throttling
  throttle: {
    maxAttempts: 5,
    decayMinutes: 1,
  },
}
```

## Authentication Quickstart

### Checking Authentication Status

```typescript
import { Auth } from '@atlex/auth'

export default {
  async handle({ auth }: Context) {
    // Check if user is authenticated
    const isAuthenticated = auth.check()

    // Get authenticated user
    const user = auth.user()

    // Check if user is a guest
    const isGuest = auth.guest()

    // Get a specific guard
    const sessionGuard = auth.guard('web')
    const apiGuard = auth.guard('api')
  },
}
```

### Manual Authentication

```typescript
import { AuthManager } from '@atlex/auth'

export default {
  async login({ auth, request }: Context) {
    const { email, password } = request.only(['email', 'password'])

    // Attempt login
    const success = await auth.attempt({
      email,
      password,
    })

    if (success) {
      return { message: 'Logged in successfully' }
    }

    return { error: 'Invalid credentials' }
  },

  async logout({ auth }: Context) {
    await auth.logout()
    return { message: 'Logged out successfully' }
  },
}
```

### Protecting Routes

Use the `auth` middleware to protect routes:

```typescript
// routes/api.ts
export default (router: Router) => {
  router.post('/login', 'AuthController.login')
  router.post('/logout', 'AuthController.logout').middleware('auth')

  router.get('/profile', 'UserController.show').middleware('auth')
  router.post('/profile', 'UserController.update').middleware('auth')
}
```

## Guards

Guards determine how users are authenticated. Atlex supports session-based and token-based guards.

### Session Guard

Session-based authentication stores user information in server-side sessions:

```typescript
export default {
  async login({ auth, request, session }: Context) {
    const { email, password } = request.only(['email', 'password'])

    // Attempt to authenticate
    const authenticated = await auth.guard('web').attempt({ email, password })

    if (authenticated) {
      // Session is automatically created
      return { message: 'Logged in' }
    }

    throw new AuthenticationException('Invalid credentials')
  },

  async profile({ auth }: Context) {
    // User is automatically retrieved from session
    const user = auth.user()
    return { user }
  },

  async logout({ auth, session }: Context) {
    await auth.logout()
    session.forget('auth')
    return { message: 'Logged out' }
  },
}
```

### Token Guard

Token-based authentication validates user tokens (typically API tokens or JWT):

```typescript
export default {
  async apiRequest({ auth }: Context) {
    // Token is extracted from Authorization header or request parameter
    const guard = auth.guard('api')

    // Automatically validates the token
    const authenticated = guard.check()

    if (!authenticated) {
      throw new UnauthorizedException('Invalid token')
    }

    const user = guard.user()
    return { user }
  },
}
```

## Manually Authenticating Users

When you need to authenticate a user without credentials:

```typescript
import { UserProvider } from '@atlex/auth'

export default {
  async oauthCallback({ auth, oauth }: Context) {
    // Create or update user from OAuth provider
    const user = await User.updateOrCreate(
      { email: oauth.email },
      {
        name: oauth.name,
        email: oauth.email,
        email_verified_at: new Date(),
      },
    )

    // Authenticate the user
    await auth.login(user)

    return { message: 'Authenticated via OAuth' }
  },

  async validateUser({ auth, request }: Context) {
    // Validate credentials
    const validated = await auth.validate({
      email: request.input('email'),
      password: request.input('password'),
    })

    if (validated) {
      const user = await auth.retrieveById(validated.id)
      return { user }
    }

    throw new AuthenticationException('Invalid credentials')
  },
}
```

## JWT Authentication

JWT provides stateless authentication ideal for APIs and SPAs. Tokens include access tokens (short-lived) and refresh tokens (long-lived).

### Full JWT Flow

```typescript
import { JwtProvider } from '@atlex/auth'

export default {
  async login({ auth, request }: Context) {
    const { email, password } = request.only(['email', 'password'])

    // Authenticate user
    const authenticated = await auth.guard('jwt_api').attempt({ email, password })

    if (!authenticated) {
      throw new AuthenticationException('Invalid credentials')
    }

    // Get JWT token pair
    const tokens = await auth.guard('jwt_api').getTokens()

    return {
      accessToken: tokens.accessToken.value(),
      refreshToken: tokens.refreshToken.value(),
      expiresIn: tokens.accessToken.expiresIn(),
    }
  },

  async refresh({ auth, request }: Context) {
    const refreshToken = request.input('refresh_token')

    // Validate refresh token
    const tokens = await auth.guard('jwt_api').refresh(refreshToken)

    return {
      accessToken: tokens.accessToken.value(),
      refreshToken: tokens.refreshToken.value(),
      expiresIn: tokens.accessToken.expiresIn(),
    }
  },

  async logout({ auth, request }: Context) {
    const token = auth.getToken()

    // Blacklist the token
    await auth.guard('jwt_api').blacklist(token)

    return { message: 'Logged out successfully' }
  },
}
```

### Creating JWT Tokens Manually

```typescript
import { AccessToken, RefreshToken } from '@atlex/auth'

export default {
  async generateTokens({ auth }: Context) {
    const user = auth.user()

    // Create custom access token
    const accessToken = new AccessToken()
    accessToken.subject(user.id)
    accessToken.setClaim('email', user.email)
    accessToken.setClaim('role', user.role)
    accessToken.expiresIn(3600) // 1 hour

    // Create custom refresh token
    const refreshToken = new RefreshToken()
    refreshToken.subject(user.id)
    refreshToken.expiresIn(604800) // 1 week

    const encoded = await auth.guard('jwt_api').encodeTokens(accessToken, refreshToken)

    return {
      accessToken: encoded.accessToken,
      refreshToken: encoded.refreshToken,
    }
  },
}
```

### JWT Token Blacklisting

Blacklist tokens to prevent their use after logout:

```typescript
import { JwtBlacklist } from '@atlex/auth'

// Redis blacklist store
const redisBlacklist = app.make('auth.blacklist.redis')
await redisBlacklist.add(token, expiresAt)

// Database blacklist store
const dbBlacklist = app.make('auth.blacklist.database')
await dbBlacklist.add(token, expiresAt)

// Memory blacklist store (not persistent)
const memoryBlacklist = app.make('auth.blacklist.memory')
await memoryBlacklist.add(token, expiresAt)
```

Configure blacklist store in config:

```typescript
jwt: {
  blacklistStore: 'redis', // 'redis', 'database', or 'memory'
  blacklistRedis: 'default',
  blacklistTable: 'jwt_blacklist',
}
```

## Password Hashing

Atlex supports multiple password hashing algorithms. Always hash passwords before storing.

### Hashing Passwords

```typescript
import { HashManager } from '@atlex/auth'

export default {
  async register({ hash, request }: Context) {
    const user = await User.create({
      name: request.input('name'),
      email: request.input('email'),
      password: await hash.make(request.input('password')),
    })

    return { user }
  },
}
```

### Verifying Passwords

```typescript
export default {
  async login({ hash, request }: Context) {
    const user = await User.findBy('email', request.input('email'))

    if (!user || !(await hash.check(request.input('password'), user.password))) {
      throw new AuthenticationException('Invalid credentials')
    }

    return { user }
  },
}
```

### Supported Hashing Algorithms

**Bcrypt** (recommended):

```typescript
const hashed = await hash.driver('bcrypt').make(password)
const valid = await hash.driver('bcrypt').check(password, hashed)
```

**Argon2**:

```typescript
const hashed = await hash.driver('argon2').make(password)
const valid = await hash.driver('argon2').check(password, hashed)
```

**Scrypt**:

```typescript
const hashed = await hash.driver('scrypt').make(password)
const valid = await hash.driver('scrypt').check(password, hashed)
```

### Rehashing Passwords

Detect and rehash passwords using newer algorithms:

```typescript
export default {
  async login({ hash, auth, request }: Context) {
    const user = await User.findBy('email', request.input('email'))

    if (!(await hash.check(request.input('password'), user.password))) {
      throw new AuthenticationException('Invalid credentials')
    }

    // Rehash if needed
    if (hash.needsRehash(user.password)) {
      user.password = await hash.make(request.input('password'))
      await user.save()
    }

    await auth.login(user)
    return { message: 'Logged in' }
  },
}
```

## Protecting Routes

Use middleware to require authentication:

```typescript
// routes/api.ts
export default (router: Router) => {
  // Protected routes
  router.get('/profile', 'UserController.show').middleware('auth')

  router.post('/profile', 'UserController.update').middleware('auth')

  // Multiple guards
  router.delete('/profile', 'UserController.destroy').middleware('auth:web,api')

  // Custom middleware
  router.patch('/password', 'UserController.updatePassword').middleware(['auth', 'throttle:5,1'])
}
```

### Middleware Implementation

```typescript
import { Middleware } from '@atlex/http'

export class AuthMiddleware implements Middleware {
  async handle({ auth, request }: Context, next: () => Promise<any>) {
    if (!auth.check()) {
      throw new UnauthorizedException('Unauthenticated')
    }

    return next()
  }
}
```

## Session Management

Sessions store user state on the server. Multiple storage drivers are available.

### Session Configuration

```typescript
session: {
  driver: 'file', // 'file', 'database', 'redis', 'cookie', or 'null'
  lifetime: 120, // minutes
  files: 'storage/sessions',
  connection: 'default',
  table: 'sessions',
  domain: null,
  path: '/',
  secure: false, // HTTPS only
  httpOnly: true,
  sameSite: 'lax', // 'strict', 'lax', or 'none'
}
```

### Session Operations

```typescript
export default {
  async login({ auth, session, request }: Context) {
    const authenticated = await auth.attempt({
      email: request.input('email'),
      password: request.input('password'),
    })

    if (authenticated) {
      // Store additional data in session
      session.put('preferences', {
        theme: 'dark',
        language: 'en',
      })

      session.push('visits', new Date())

      return { message: 'Logged in' }
    }

    throw new AuthenticationException('Invalid credentials')
  },

  async profile({ session }: Context) {
    // Retrieve session data
    const preferences = session.get('preferences')
    const visits = session.all().visits

    return { preferences, visits }
  },

  async logout({ auth, session }: Context) {
    await auth.logout()

    // Forget specific data
    session.forget('preferences')

    // Flush entire session
    session.flush()

    return { message: 'Logged out' }
  },
}
```

### Session Stores

**File Store** (default for development):

```typescript
session: {
  driver: 'file',
  files: 'storage/sessions',
}
```

**Database Store** (production):

```typescript
session: {
  driver: 'database',
  connection: 'default',
  table: 'sessions',
}
```

**Redis Store** (high performance):

```typescript
session: {
  driver: 'redis',
  connection: 'default',
}
```

**Cookie Store** (stateless):

```typescript
session: {
  driver: 'cookie',
  secure: true,
  httpOnly: true,
}
```

## Authorization

Authorization determines what authenticated users can do. Use gates for simple checks and policies for complex rules.

### Gates

Gates are simple, closure-based authorization checks:

```typescript
// bootstrap/auth.ts
import { Gate } from '@atlex/auth'

export default function bootstrapAuth(app: Application) {
  const gate = app.make(Gate)

  // Simple gate
  gate.define('view-settings', (user) => {
    return user.role === 'admin'
  })

  // Gate with additional arguments
  gate.define('edit-post', (user, post) => {
    return user.id === post.user_id || user.role === 'admin'
  })

  // Gate with multiple arguments
  gate.define('moderate-comment', (user, comment, post) => {
    return user.role === 'moderator' && comment.post_id === post.id
  })
}
```

### Using Gates

```typescript
export default {
  async settings({ auth, response }: Context) {
    // Check authorization
    if (!auth.can('view-settings')) {
      throw new ForbiddenException('Unauthorized');
    }

    return { settings: {...} };
  },

  async updatePost({ auth, request }: Context) {
    const post = await Post.find(request.param('id'));

    // Authorize with arguments
    if (auth.cannot('edit-post', post)) {
      throw new ForbiddenException('Cannot edit this post');
    }

    // Update post...
    return { post };
  },

  async moderateComment({ auth, request }: Context) {
    const comment = await Comment.find(request.param('id'));
    const post = await Post.find(comment.post_id);

    // Authorize with multiple arguments
    auth.authorize('moderate-comment', [comment, post]);

    // Process moderation...
    return { success: true };
  },
};
```

### Policies

Policies are classes that encapsulate authorization logic:

```typescript
// app/Policies/PostPolicy.ts
import { Policy } from '@atlex/auth'

export class PostPolicy implements Policy {
  view(user: User, post: Post): boolean {
    return post.isPublished() || user.id === post.user_id
  }

  create(user: User): boolean {
    return user.email_verified_at !== null
  }

  update(user: User, post: Post): boolean {
    return user.id === post.user_id
  }

  delete(user: User, post: Post): boolean {
    return user.id === post.user_id || user.isAdmin()
  }

  restore(user: User, post: Post): boolean {
    return user.id === post.user_id
  }

  forceDelete(user: User, post: Post): boolean {
    return user.isAdmin()
  }
}
```

### Registering Policies

```typescript
// bootstrap/auth.ts
import { Gate } from '@atlex/auth'
import { PostPolicy } from 'app/Policies/PostPolicy'

export default function bootstrapAuth(app: Application) {
  const gate = app.make(Gate)

  gate.policy(Post, PostPolicy)
}
```

### Using Policies

```typescript
export default {
  async show({ auth, request }: Context) {
    const post = await Post.find(request.param('id'))

    // Authorize using policy
    auth.authorize('view', post)

    return { post }
  },

  async update({ auth, request }: Context) {
    const post = await Post.find(request.param('id'))

    if (auth.denies('update', post)) {
      throw new ForbiddenException('Cannot update this post')
    }

    post.title = request.input('title')
    await post.save()

    return { post }
  },

  async delete({ auth, request }: Context) {
    const post = await Post.find(request.param('id'))

    auth.authorize('delete', post)

    await post.delete()

    return { message: 'Post deleted' }
  },
}
```

## Password Reset

Secure password reset flow with token validation and expiration:

```typescript
import { PasswordBrokerManager } from '@atlex/auth'

export default {
  async sendResetLink({ passwords, request }: Context) {
    const email = request.input('email')

    // Send password reset link
    const response = await passwords.broker('users').sendResetLink(email)

    if (response === 'password.sent') {
      return { message: 'Reset link sent to email' }
    }

    return { error: 'User not found' }
  },

  async resetPassword({ passwords, request }: Context) {
    const email = request.input('email')
    const token = request.input('token')
    const password = request.input('password')
    const passwordConfirmation = request.input('password_confirmation')

    if (password !== passwordConfirmation) {
      throw new ValidationException('Passwords do not match')
    }

    // Reset the password
    const response = await passwords.broker('users').reset({ email, password }, token)

    if (response === 'password.reset') {
      return { message: 'Password reset successfully' }
    }

    return { error: 'Invalid or expired token' }
  },

  async verifyToken({ passwords, request }: Context) {
    const email = request.input('email')
    const token = request.input('token')

    const exists = await passwords.broker('users').tokenExists(email, token)

    return { valid: exists }
  },
}
```

### Password Reset Broker Configuration

```typescript
passwords: {
  users: {
    provider: 'users',
    email: 'emails.password-reset',
    store: 'database', // 'database', 'cache', or custom
    expire: 60, // minutes
    throttle: 60, // seconds between requests
  },
}
```

## Email Verification

Require email verification before users access the application:

```typescript
// Middleware
import { Middleware } from '@atlex/http'

export class EnsureEmailIsVerified implements Middleware {
  async handle({ auth, response }: Context, next: () => Promise<any>) {
    if (auth.check() && auth.user().email_verified_at === null) {
      throw new EmailNotVerifiedException('Email not verified')
    }

    return next()
  }
}
```

### Email Verification Flow

```typescript
export default {
  async register({ hash, mail }: Context) {
    const user = await User.create({
      name: request.input('name'),
      email: request.input('email'),
      password: await hash.make(request.input('password')),
    })

    // Send verification email
    await mail.queue('emails.verify-email', { user })

    return { message: 'Check your email to verify' }
  },

  async verifyEmail({ request, event }: Context) {
    const user = await User.findBy('email', request.input('email'))

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Mark email as verified
    user.email_verified_at = new Date()
    await user.save()

    // Fire verification event
    event.dispatch('user:verified', user)

    return { message: 'Email verified' }
  },

  async sendVerificationEmail({ mail, auth }: Context) {
    const user = auth.user()

    if (user.email_verified_at !== null) {
      return { error: 'Email already verified' }
    }

    await mail.queue('emails.verify-email', { user })

    return { message: 'Verification email sent' }
  },
}
```

## Throttling

Prevent brute force attacks by throttling login attempts:

```typescript
// Middleware
import { Middleware } from '@atlex/http'
import { ThrottleRequests } from '@atlex/auth'

export class ThrottleLogins extends ThrottleRequests {
  async handle({ auth, request }: Context, next: () => Promise<any>) {
    if (!request.is('login')) {
      return next()
    }

    return this.throttle(
      request,
      `login_${request.ip()}`,
      5, // max attempts
      1, // decay minutes
    )
  }
}
```

### Using Throttle Middleware

```typescript
// routes/auth.ts
export default (router: Router) => {
  router.post('/login', 'AuthController.login').middleware('throttle:5,1')

  router.post('/password/email', 'PasswordResetController.send').middleware('throttle:5,1')
}
```

## Events

Listen to authentication lifecycle events:

```typescript
import { EventDispatcher } from '@atlex/events'

export default function bootstrapAuth(app: Application) {
  const event = app.make(EventDispatcher)

  // User attempting login
  event.listen('auth:attempting', (data) => {
    console.log('Login attempt:', data.credentials.email)
  })

  // User authenticated
  event.listen('auth:authenticated', (user) => {
    console.log('User authenticated:', user.email)
  })

  // User logged in
  event.listen('auth:login', (user) => {
    user.last_login_at = new Date()
    user.save()
  })

  // Authentication failed
  event.listen('auth:failed', (credentials) => {
    console.log('Failed login:', credentials.email)
  })

  // User logged out
  event.listen('auth:logout', (user) => {
    console.log('User logged out:', user.email)
  })

  // Too many login attempts
  event.listen('auth:lockout', (data) => {
    console.log('Account locked:', data.user.email)
  })

  // Password reset
  event.listen('auth:password-reset', (user) => {
    console.log('Password reset:', user.email)
  })

  // Email verified
  event.listen('auth:verified', (user) => {
    console.log('Email verified:', user.email)
  })

  // User registered
  event.listen('auth:registered', (user) => {
    console.log('User registered:', user.email)
  })
}
```

## Testing Authentication

Test authentication easily in your application:

```typescript
import { test } from '@atlex/testing'

describe('Authentication', () => {
  test('user can login', async () => {
    const user = await User.factory().create()

    const response = await test(app)
      .post('/login', {
        email: user.email,
        password: 'password',
      })
      .expect(200)

    expect(response.json().accessToken).toBeDefined()
  })

  test('user cannot login with invalid password', async () => {
    const user = await User.factory().create()

    await test(app)
      .post('/login', {
        email: user.email,
        password: 'wrong-password',
      })
      .expect(401)
  })

  test('authenticated user can access protected route', async () => {
    const user = await User.factory().create()

    await test(app).actingAs(user).get('/profile').expect(200)
  })

  test('unauthenticated user cannot access protected route', async () => {
    await test(app).get('/profile').expect(401)
  })

  test('user can be authorized for action', async () => {
    const user = await User.factory().state('admin').create()

    const response = await test(app).actingAs(user).post('/settings', { theme: 'dark' }).expect(200)

    expect(response.json().message).toBe('Settings updated')
  })

  test('user can be denied for action', async () => {
    const user = await User.factory().create()

    await test(app).actingAs(user).post('/settings', { theme: 'dark' }).expect(403)
  })
})
```

## API Reference

### AuthManager

```typescript
// Check if authenticated
auth.check(): boolean

// Get authenticated user
auth.user(): User | null

// Check if guest
auth.guest(): boolean

// Get specific guard
auth.guard(name: string): Guard

// Attempt authentication
auth.attempt(credentials: object): Promise<boolean>

// Login user
auth.login(user: User): Promise<void>

// Login user by ID
auth.loginUsingId(id: any): Promise<boolean>

// Logout user
auth.logout(): Promise<void>

// Validate credentials
auth.validate(credentials: object): Promise<object | null>

// Get broker
auth.broker(name?: string): PasswordBroker

// Check authorization
auth.can(ability: string, ...args): boolean

// Check authorization denial
auth.cannot(ability: string, ...args): boolean

// Authorize or throw
auth.authorize(ability: string, ...args): void

// Deny authorization
auth.denies(ability: string, ...args): boolean

// Get current token
auth.getToken(): string | null
```

### Guard

```typescript
// Check if authenticated
check(): boolean

// Get user
user(): User | null

// Attempt authentication
attempt(credentials: object): Promise<boolean>

// Login user
login(user: User): Promise<void>

// Login by ID
loginUsingId(id: any): Promise<boolean>

// Logout
logout(): Promise<void>

// Validate credentials
validate(credentials: object): Promise<object | null>

// Get user by ID
retrieveById(id: any): Promise<User | null>

// Get user by credentials
retrieveByCredentials(credentials: object): Promise<User | null>
```

### HashManager

```typescript
// Hash a value
hash.make(value: string): Promise<string>

// Check if value matches hash
hash.check(value: string, hashed: string): Promise<boolean>

// Check if hash needs rehashing
hash.needsRehash(hashed: string): boolean

// Get specific driver
hash.driver(name: string): Hasher
```

### PasswordBroker

```typescript
// Send password reset link
sendResetLink(email: string): Promise<string>

// Reset password
reset(credentials: object, token: string): Promise<string>

// Check if token exists
tokenExists(email: string, token: string): Promise<boolean>

// Validate token
validateToken(email: string, token: string): Promise<boolean>
```

### Gate

```typescript
// Define gate
define(name: string, callback: Function): void

// Define policy
policy(model: typeof Model, policy: typeof Policy): void

// Authorize
authorize(ability: string, ...args): void

// Check ability
allows(ability: string, ...args): boolean

// Check denial
denies(ability: string, ...args): boolean
```

### Session

```typescript
// Get value
get(key: string, defaultValue?: any): any

// Get all data
all(): object

// Put value
put(key: string, value: any): void

// Push to array
push(key: string, value: any): void

// Forget value
forget(key: string): void

// Flush session
flush(): void

// Check if exists
has(key: string): boolean

// Get and forget
pull(key: string, defaultValue?: any): any
```

This comprehensive guide covers all aspects of authentication in Atlex. Refer to the API Reference section for complete method signatures and the Configuration section when setting up your authentication system.
