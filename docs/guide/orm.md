# ORM Guide

Atlex provides a powerful ActiveRecord ORM through the `@atlex/orm` package. This guide covers everything you need to know about defining models, querying databases, managing relationships, and leveraging advanced ORM features.

## Introduction

The Atlex ORM (`@atlex/orm`) gives you an expressive ActiveRecord layer for TypeScript and Node.js applications. It provides:

- **ActiveRecord pattern**: Models that combine data access and business logic
- **Fluent query builder**: Expressive, chainable database queries
- **Relationship management**: Seamless one-to-one, one-to-many, many-to-many, and through relationships
- **Model events**: Lifecycle hooks for model creation, updates, and deletion
- **Migrations**: Version control for your database schema
- **Soft deletes**: Logical deletion without removing data
- **Eager loading**: Efficient loading of related data

## Defining Models

### Creating a Model

Create a model by extending the `Model` class:

```typescript
import { Model } from '@atlex/orm'

export class User extends Model {
  static table = 'users'
  static primaryKey = 'id'
  static timestamps = true

  declare id: number
  declare name: string
  declare email: string
  declare password: string
  declare created_at?: Date
  declare updated_at?: Date
}
```

### Model Configuration

#### Table Name

By default, the table name is the lowercase plural form of the model name. Override it with the `table` property:

```typescript
class User extends Model {
  static table = 'app_users' // Custom table name
}
```

#### Primary Key

The default primary key is `id`. Change it with `primaryKey`:

```typescript
class Post extends Model {
  static primaryKey = 'post_id'
}
```

#### Timestamps

Enable automatic `created_at` and `updated_at` timestamps:

```typescript
class User extends Model {
  static timestamps = true
}
```

Disable timestamps:

```typescript
class Log extends Model {
  static timestamps = false
}
```

#### Hidden Attributes

Hide attributes from JSON serialization:

```typescript
class User extends Model {
  static hidden = ['password', 'remember_token']
}
```

#### Visible Attributes

Alternatively, specify which attributes to include:

```typescript
class User extends Model {
  static visible = ['id', 'name', 'email']
}
```

#### Fillable & Guarded

Control mass assignment with `fillable` (whitelist) or `guarded` (blacklist):

```typescript
class User extends Model {
  static fillable = ['name', 'email', 'password']
}

class Post extends Model {
  static guarded = ['id', 'created_at', 'updated_at']
}
```

#### Appends

Add computed properties to JSON output:

```typescript
class User extends Model {
  static appends = ['full_name', 'initials']

  get full_name(): string {
    return `${this.first_name} ${this.last_name}`
  }

  get initials(): string {
    return `${this.first_name[0]}${this.last_name[0]}`
  }
}
```

### Column Decorators

Use the `@Column` decorator for fine-grained control:

```typescript
import { Model, Column } from '@atlex/orm'

class User extends Model {
  @Column({ type: 'string' })
  declare name: string

  @Column({ type: 'string', nullable: true })
  declare middle_name?: string

  @Column({ type: 'integer', hidden: true })
  declare password_hash: string
}
```

## Retrieving Models

### Fetching Records

#### Get All Records

```typescript
const users = await User.all()
```

#### Find by Primary Key

```typescript
const user = await User.find(1)

if (user) {
  console.log(user.name)
}
```

#### Find or Fail

Throw an exception if not found:

```typescript
const user = await User.findOrFail(1)
```

#### Find Multiple Records

```typescript
const users = await User.findMany([1, 2, 3])
```

### Building Queries

#### Basic Query

```typescript
const activeUsers = await User.query().where('status', '=', 'active').get()
```

#### Where Clauses

```typescript
// Basic where
await User.where('status', 'active').get()

// Multiple conditions (AND)
await User.where('status', 'active').where('verified', true).get()

// Or clause
await User.where('status', 'active').orWhere('admin', true).get()

// Where IN
await User.whereIn('role', ['admin', 'moderator']).get()

// Where NOT IN
await User.whereNotIn('role', ['banned']).get()

// Where NULL
await User.whereNull('deleted_at').get()

// Where NOT NULL
await User.whereNotNull('verified_at').get()

// Where BETWEEN
await User.whereBetween('age', [18, 65]).get()

// Where NOT BETWEEN
await User.whereNotBetween('price', [100, 200]).get()

// Where raw SQL
await User.whereRaw('LOWER(name) = ?', ['john']).get()
```

#### Ordering

```typescript
// Ascending order
await User.orderBy('created_at', 'asc').get()

// Descending order
await User.orderBy('name', 'desc').get()

// Latest (created_at DESC)
await User.latest().get()

// Oldest (created_at ASC)
await User.oldest().get()

// Multiple orders
await User.orderBy('status').orderBy('name', 'desc').get()
```

#### Limiting Results

```typescript
// Limit
await User.limit(10).get()

// Alias: take
await User.take(10).get()

// Offset
await User.offset(20).limit(10).get()

// Alias: skip
await User.skip(20).take(10).get()
```

#### Selecting Columns

```typescript
// Select specific columns
await User.select('id', 'name', 'email').get()

// Add columns to default selection
await User.select('id', 'name').addSelect('email').get()
```

#### Distinct

```typescript
await User.select('country').distinct().get()
```

### Aggregates

```typescript
// Count
const total = await User.count()

// Count with conditions
const activeCount = await User.where('status', 'active').count()

// Max
const maxAge = await User.max('age')

// Min
const minPrice = await Product.min('price')

// Sum
const totalRevenue = await Order.sum('amount')

// Average
const avgRating = await Review.avg('rating')
```

### Getting Results

```typescript
// Get all matching records
const users = await User.where('status', 'active').get()

// Get first matching record
const user = await User.where('status', 'active').first()

// Get first or fail
const user = await User.where('email', 'test@example.com').firstOrFail()

// Count results without getting records
const count = await User.where('status', 'active').count()
```

## Inserting & Updating

### Creating Records

#### Save Method

```typescript
const user = new User()
user.name = 'John Doe'
user.email = 'john@example.com'
user.password = 'secret'

await user.save()
console.log(user.id) // Auto-populated after save
```

#### Create Method

```typescript
const user = await User.create({
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: 'secret',
})

console.log(user.id)
```

#### Insert Multiple Records

```typescript
await User.query().insert([
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' },
  { name: 'User 3', email: 'user3@example.com' },
])
```

#### Insert and Get ID

```typescript
const id = await User.query().insertGetId({
  name: 'John Doe',
  email: 'john@example.com',
})

console.log(id) // The inserted record's ID
```

### Updating Records

#### Save an Instance

```typescript
const user = await User.find(1)
user.name = 'Updated Name'
user.email = 'updated@example.com'

await user.save()
```

#### Update via Query Builder

```typescript
await User.where('id', 1).update({
  name: 'Updated Name',
  verified: true,
})
```

#### Update Multiple Records

```typescript
await User.where('status', 'inactive').update({
  status: 'active',
})
```

#### Increment/Decrement

```typescript
// Increment a column
await Post.where('id', 1).increment('views')

// Increment by specific amount
await Post.where('id', 1).increment('likes', 5)

// Decrement
await Post.where('id', 1).decrement('inventory', 10)
```

### First or Create

Create a record if it doesn't exist:

```typescript
const user = await User.firstOrCreate(
  { email: 'john@example.com' }, // Search criteria
  { name: 'John Doe', password: 'secret' }, // Creation attributes
)
```

### Update or Create

Update if exists, create if not:

```typescript
const user = await User.updateOrCreate(
  { email: 'john@example.com' }, // Search criteria
  { name: 'John Doe', password: 'secret' }, // Update/create attributes
)
```

## Deleting Models

### Deleting Instances

```typescript
const user = await User.find(1)
await user.delete()
```

### Deleting via Query Builder

```typescript
await User.where('status', 'inactive').delete()
```

### Force Delete

Delete all records (use with care):

```typescript
await User.query().delete()
```

### Soft Deletes

Use the `SoftDeletes` mixin for logical deletion:

```typescript
import { Model, SoftDeletes } from '@atlex/orm';

class User extends Model {
  use SoftDeletes;

  static table = 'users';
}
```

With soft deletes enabled, records aren't actually removed—a `deleted_at` timestamp is set instead.

#### Querying with Soft Deletes

By default, soft-deleted records are excluded:

```typescript
// Only active records
const users = await User.get()

// Include soft-deleted records
const users = await User.withTrashed().get()

// Only soft-deleted records
const deletedUsers = await User.onlyTrashed().get()
```

#### Restoring Records

```typescript
const user = await User.onlyTrashed().first()
await user.restore()
```

#### Force Deleting

```typescript
const user = await User.find(1)
await user.forceDelete()
```

## Query Scopes

Scopes allow you to encapsulate reusable query logic:

```typescript
class User extends Model {
  static table = 'users'

  scope(builder: QueryBuilder) {
    if (builder.hasScope('active')) {
      builder.where('status', 'active')
    }
  }

  // Or using static methods
  static scopeActive(builder: QueryBuilder) {
    return builder.where('status', 'active')
  }

  static scopeVerified(builder: QueryBuilder) {
    return builder.whereNotNull('verified_at')
  }

  static scopeByRole(builder: QueryBuilder, role: string) {
    return builder.where('role', role)
  }
}
```

Using scopes:

```typescript
// Apply local scope
const activeUsers = await User.active().get()

// Chain multiple scopes
const verifiedActive = await User.active().verified().get()

// Scopes with parameters
const admins = await User.byRole('admin').get()
```

### Global Scopes

Apply scopes automatically to all queries:

```typescript
class User extends Model {
  static boot() {
    super.boot()
    this.addGlobalScope('active', (builder) => {
      builder.where('status', 'active')
    })
  }
}

// This automatically excludes inactive users
const users = await User.get()

// Remove global scope when needed
const allUsers = await User.withoutGlobalScopes().get()
const users = await User.withoutGlobalScope('active').get()
```

## Relationships

Relationships define connections between models. The ORM supports all major relationship types.

### One-to-One

A user has one profile:

```typescript
class User extends Model {
  hasOne(Profile, 'user_id', 'id'): HasOne {
    return this.hasOne(Profile, 'user_id', 'id');
  }
}

class Profile extends Model {
  belongsTo(User, 'user_id', 'id'): BelongsTo {
    return this.belongsTo(User, 'user_id', 'id');
  }
}

// Usage
const user = await User.with('profile').find(1);
console.log(user.profile.bio);
```

### One-to-Many

A user has many posts:

```typescript
class User extends Model {
  hasMany(Post, 'user_id', 'id'): HasMany {
    return this.hasMany(Post, 'user_id', 'id');
  }
}

class Post extends Model {
  belongsTo(User, 'user_id', 'id'): BelongsTo {
    return this.belongsTo(User, 'user_id', 'id');
  }
}

// Usage
const user = await User.with('posts').find(1);
user.posts.forEach((post) => {
  console.log(post.title);
});
```

### Many-to-Many

Users and roles have a many-to-many relationship through a pivot table:

```typescript
class User extends Model {
  belongsToMany(
    Role,
    'role_user', // Pivot table
    'user_id',   // FK on pivot
    'role_id',   // FK on related model
    'id',        // User PK
    'id'         // Role PK
  ): BelongsToMany {
    return this.belongsToMany(Role, 'role_user', 'user_id', 'role_id');
  }
}

class Role extends Model {
  belongsToMany(
    User,
    'role_user',
    'role_id',
    'user_id'
  ): BelongsToMany {
    return this.belongsToMany(User, 'role_user', 'role_id', 'user_id');
  }
}

// Usage
const user = await User.with('roles').find(1);
user.roles.forEach((role) => {
  console.log(role.name);
});

// Attach roles
await user.roles().attach([1, 2, 3]);

// Detach roles
await user.roles().detach([1]);

// Sync roles (replace)
await user.roles().sync([2, 3, 4]);

// Toggle roles
await user.roles().toggle([1, 2]);
```

### Has-Many-Through

Access related data through intermediate models:

```typescript
class Country extends Model {
  hasManyThrough(
    Post,
    User,
    'country_id', // FK on User
    'user_id',    // FK on Post
    'id',         // Country PK
    'id'          // User PK
  ): HasManyThrough {
    return this.hasManyThrough(Post, User, 'country_id', 'user_id');
  }
}

// Get all posts from users in a country
const country = await Country.with('posts').find(1);
console.log(country.posts); // Posts from all users in this country
```

### Has-One-Through

Similar to has-many-through, but returns one record:

```typescript
class Country extends Model {
  hasOneThrough(
    Post,
    User,
    'country_id',
    'user_id',
    'id',
    'id'
  ): HasOneThrough {
    return this.hasOneThrough(Post, User, 'country_id', 'user_id');
  }
}

// Get the first post from users in a country
const country = await Country.with('latestPost').find(1);
```

## Eager Loading

Load relationships efficiently to avoid N+1 queries:

```typescript
// Load single relationship
const users = await User.with('posts').get()

// Load multiple relationships
const users = await User.with('posts', 'comments').get()

// Nested relationships
const users = await User.with('posts.comments').get()

// Multiple nested
const users = await User.with({
  posts: (query) => query.latest(),
  comments: (query) => query.where('approved', true),
}).get()

// With count
const users = await User.withCount('posts').get()
console.log(user.posts_count) // Count of posts

// Lazy eager load
const users = await User.get()
await User.query().loadMissing('posts')

// Load only specific columns
const users = await User.with({
  posts: (query) => query.select('id', 'title', 'user_id'),
}).get()
```

## Model Events & Observers

Respond to model lifecycle events:

### Event Hooks

```typescript
class User extends Model {
  protected creating() {
    // Before creating a new record
    this.email = this.email.toLowerCase()
  }

  protected created() {
    // After creating a new record
    console.log(`User ${this.id} was created`)
  }

  protected updating() {
    // Before updating
    this.updated_at = new Date()
  }

  protected updated() {
    // After updating
    this.dispatchEvent('user:updated')
  }

  protected saving() {
    // Before save (create or update)
    this.slug = this.name.toLowerCase().replace(' ', '-')
  }

  protected saved() {
    // After save (create or update)
    // Broadcast event, send notifications, etc.
  }

  protected deleting() {
    // Before deleting
  }

  protected deleted() {
    // After deleting
  }

  protected restoring() {
    // Before restoring (soft delete)
  }

  protected restored() {
    // After restoring
  }
}
```

Available events: `creating`, `created`, `updating`, `updated`, `saving`, `saved`, `deleting`, `deleted`, `restoring`, `restored`.

### Observers

Centralize event logic in observer classes:

```typescript
class UserObserver {
  created(user: User) {
    // Send welcome email
    sendWelcomeEmail(user)
  }

  updated(user: User) {
    // Log update
    console.log(`User ${user.id} updated`)
  }

  deleted(user: User) {
    // Clean up related data
    cleanupUserData(user)
  }
}

// Register observer
User.observe(UserObserver)
```

## Migrations

Manage database schema changes with version control:

### Creating Migrations

```typescript
import { Schema, Blueprint } from '@atlex/orm'

export async function up() {
  await Schema.create('users', (table: Blueprint) => {
    table.increments('id')
    table.string('name')
    table.string('email').unique()
    table.string('password')
    table.timestamps()
  })
}

export async function down() {
  await Schema.dropIfExists('users')
}
```

### Schema Methods

```typescript
// Create table
await Schema.create('users', (table) => {
  table.increments('id')
  table.string('name')
  table.timestamps()
})

// Modify table
await Schema.table('users', (table) => {
  table.string('middle_name').nullable()
  table.dropColumn('old_field')
})

// Drop table
await Schema.drop('users')

// Drop table if exists
await Schema.dropIfExists('users')

// Check if table exists
const exists = await Schema.hasTable('users')

// Check if column exists
const exists = await Schema.hasColumn('users', 'email')
```

### Column Types

```typescript
table.increments('id') // Auto-incrementing integer
table.integer('count') // Integer
table.bigInteger('id') // Big integer
table.tinyInteger('flag') // Tiny integer
table.string('name', 255) // String with length
table.text('description') // Text
table.longText('content') // Long text
table.boolean('active') // Boolean
table.date('birthday') // Date
table.dateTime('created_at') // DateTime
table.timestamp('updated_at') // Timestamp
table.time('start_time') // Time
table.decimal('price', 8, 2) // Decimal with precision
table.float('rating', 3, 2) // Float
table.json('metadata') // JSON
table.uuid('id') // UUID
table.binary('data') // Binary data
table.enum('status', ['active', 'inactive']) // Enum

// Modifiers
table.string('name').nullable()
table.string('name').default('Unknown')
table.string('name').comment('User name')
table.increments('id').unsigned()
```

### Indexes

```typescript
table.primary('id') // Primary key
table.unique('email') // Unique index
table.index('status') // Regular index
table.fullText('description') // Full-text index
table.spatialIndex('location') // Spatial index

// Drop indexes
table.dropPrimary('id')
table.dropUnique('email')
table.dropIndex('status')
```

### Foreign Keys

```typescript
table.unsignedInteger('user_id')
table.foreign('user_id').references('id').on('users').onDelete('cascade').onUpdate('cascade')
```

## Seeders & Factories

Populate your database with test data:

### Seeders

```typescript
import { User } from '../models/User'

export class UserSeeder {
  async run() {
    await User.create({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'secret',
    })
  }
}
```

Run seeders:

```bash
npm run db:seed
```

### Factories

Define reusable data generation:

```typescript
import { Factory } from '@atlex/orm'
import { User } from '../models/User'

const UserFactory = new Factory(User, () => ({
  name: faker.name.fullName(),
  email: faker.internet.email(),
  password: bcrypt.hashSync('secret', 10),
}))

// Create single record
await UserFactory.create()

// Create multiple records
await UserFactory.count(100).create()

// With custom attributes
await UserFactory.create({ email: 'custom@example.com' })

// Raw data without saving
const data = UserFactory.make()
```

## Pagination

Paginate large result sets efficiently:

```typescript
// Length-aware pagination (with total count)
const paginator = await User.paginate(15) // 15 per page

// Simple pagination (without total)
const paginator = await User.simplePaginate(15)

// Cursor-based pagination
const paginator = await User.cursorPaginate(15)

// With query conditions
const paginator = await User.where('status', 'active').paginate(20, { page: 2 })
```

See the [Pagination Guide](/guide/pagination.md) for detailed information.

## API Reference

### Model Class

```typescript
static table: string
static primaryKey: string = 'id'
static timestamps: boolean = true
static hidden: string[] = []
static visible: string[] = []
static fillable: string[] = []
static guarded: string[] = []
static appends: string[] = []

// Query methods
static query(): QueryBuilder
static all(): Promise<Model[]>
static where(column, value): QueryBuilder
static find(id): Promise<Model | null>
static findOrFail(id): Promise<Model>
static findMany(ids): Promise<Model[]>
static create(attributes): Promise<Model>
static firstOrCreate(search, create): Promise<Model>
static updateOrCreate(search, update): Promise<Model>
static paginate(perPage, options): Promise<LengthAwarePaginator>
static simplePaginate(perPage, options): Promise<Paginator>
static cursorPaginate(perPage, options): Promise<CursorPaginator>

// Instance methods
save(): Promise<void>
delete(): Promise<boolean>
restore(): Promise<void>
forceDelete(): Promise<boolean>
fresh(): Promise<Model>
getAttribute(key): any
setAttribute(key, value): Model
getChanges(): object
getOriginal(key?): any
```

### QueryBuilder

```typescript
where(column, operator, value): QueryBuilder
orWhere(column, operator, value): QueryBuilder
whereIn(column, values): QueryBuilder
whereNotIn(column, values): QueryBuilder
whereNull(column): QueryBuilder
whereNotNull(column): QueryBuilder
whereBetween(column, [min, max]): QueryBuilder
whereNotBetween(column, [min, max]): QueryBuilder
whereRaw(sql, bindings): QueryBuilder

select(...columns): QueryBuilder
addSelect(...columns): QueryBuilder
distinct(): QueryBuilder

join(table, first, operator, second): QueryBuilder
leftJoin(table, first, operator, second): QueryBuilder
rightJoin(table, first, operator, second): QueryBuilder
crossJoin(table): QueryBuilder

groupBy(...columns): QueryBuilder
having(column, operator, value): QueryBuilder

orderBy(column, direction): QueryBuilder
latest(column): QueryBuilder
oldest(column): QueryBuilder

limit(value): QueryBuilder
offset(value): QueryBuilder
take(value): QueryBuilder
skip(value): QueryBuilder

with(...relations): QueryBuilder
withCount(...relations): QueryBuilder
withOnly(...relations): QueryBuilder

get(): Promise<Model[]>
first(): Promise<Model | null>
firstOrFail(): Promise<Model>
count(): Promise<number>
max(column): Promise<number>
min(column): Promise<number>
sum(column): Promise<number>
avg(column): Promise<number>

insert(values): Promise<boolean>
insertGetId(values): Promise<number>
update(values): Promise<number>
delete(): Promise<number>

raw(sql, bindings): QueryBuilder
```

### Pagination Classes

See the [Pagination Guide](/guide/pagination.md) for complete API reference.

## Exceptions

Common ORM exceptions:

- `ModelNotFoundException`: When `findOrFail()` or `firstOrFail()` finds no record
- `MassAssignmentException`: When attempting to mass-assign a guarded attribute
- `QueryException`: Database query errors
- `RelationNotFoundException`: When accessing an undefined relationship
- `InvalidCastException`: When casting fails for a column type

## Best Practices

1. **Use fillable/guarded wisely**: Always define `fillable` or `guarded` to prevent mass assignment vulnerabilities
2. **Eager load relationships**: Use `with()` to avoid N+1 queries
3. **Leverage scopes**: Encapsulate common query logic in scopes
4. **Use observers for events**: Keep model files clean by moving event logic to observers
5. **Soft delete when appropriate**: Use soft deletes for recoverable data
6. **Create migrations**: Version control your schema changes
7. **Index frequently queried columns**: Improve query performance
8. **Validate input**: Use middleware or validators before model creation/update
9. **Cache relationships**: For expensive relationships, consider caching
10. **Use factories in tests**: Generate consistent test data with factories
