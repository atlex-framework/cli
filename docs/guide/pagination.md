# Pagination Guide

Atlex provides powerful, flexible pagination methods for efficiently displaying large datasets. This guide covers length-aware, simple, and cursor-based pagination strategies.

## Introduction

Pagination is essential when working with large datasets. Rather than loading entire result sets into memory, pagination breaks data into manageable chunks. Atlex supports three pagination approaches:

- **Length-Aware Pagination**: Includes a total count and last page number, useful for displaying page numbers
- **Simple Pagination**: Lighter-weight pagination without total count, useful for "next" and "previous" links
- **Cursor-Based Pagination**: Efficient for large datasets, using cursor markers instead of offsets

Each pagination type returns results with metadata for building pagination UI components.

## Basic Usage

All three pagination methods follow similar patterns and can be chained with query conditions:

```typescript
// Paginate users
const page1 = await User.paginate(15)

// Get a specific page
const page2 = await User.paginate(15, { page: 2 })

// With query conditions
const activePage = await User.where('status', 'active').paginate(20, { page: 1 })

// Simplified pagination (no total count)
const page = await User.simplePaginate(15)

// Cursor pagination
const page = await User.cursorPaginate(15)
```

## Length-Aware Pagination

Length-aware pagination includes metadata about the total number of records and pages. Use this when you need to display page numbers and total counts in your UI.

### Basic Usage

```typescript
const users = await User.paginate(15) // 15 items per page

// Or specify page explicitly
const users = await User.paginate(15, { page: 1 })
```

### With Query Conditions

```typescript
const activeUsers = await User.where('status', 'active').orderBy('created_at', 'desc').paginate(20)

const adminUsers = await User.where('role', 'admin').paginate(10, { page: 2 })

const verified = await User.where('verified', true)
  .where('status', 'active')
  .paginate(25, { page: request.query.page })
```

### LengthAwarePaginator Properties

The paginator object contains all data and metadata:

```typescript
interface LengthAwarePaginator {
  data: User[] // Current page records
  currentPage: number // Current page number
  perPage: number // Items per page
  total: number // Total records
  lastPage: number // Last page number
  from: number // First record number
  to: number // Last record number
  hasMorePages: boolean // Whether there are more pages
  isFirstPage: boolean // Is current page first
  isLastPage: boolean // Is current page last
}
```

### Working with Paginated Data

```typescript
const paginator = await User.paginate(20)

// Access records
paginator.data.forEach((user) => {
  console.log(user.name)
})

// Get pagination metadata
console.log(`Page ${paginator.currentPage} of ${paginator.lastPage}`)
console.log(`Showing records ${paginator.from} to ${paginator.to} of ${paginator.total}`)

// Check pagination state
if (paginator.hasMorePages) {
  console.log('Load next page')
}

if (!paginator.isLastPage) {
  const nextPage = paginator.currentPage + 1
  const nextUrl = paginator.getUrl(nextPage)
}
```

### Building Pagination Links

```typescript
const paginator = await User.paginate(15)

// Get URL for specific page
const page2Url = paginator.getUrl(2)
const page3Url = paginator.getUrl(3)

// Build pagination HTML
const previousUrl = paginator.currentPage > 1 ? paginator.getUrl(paginator.currentPage - 1) : null

const nextUrl = paginator.hasMorePages ? paginator.getUrl(paginator.currentPage + 1) : null

// Example pagination response
return {
  data: paginator.data,
  pagination: {
    currentPage: paginator.currentPage,
    lastPage: paginator.lastPage,
    total: paginator.total,
    perPage: paginator.perPage,
    previousUrl,
    nextUrl,
    from: paginator.from,
    to: paginator.to,
  },
}
```

### Custom Per-Page Values

Some applications need to let users choose items per page:

```typescript
const perPage = Math.min(parseInt(request.query.per_page) || 15, 100)
const page = Math.max(parseInt(request.query.page) || 1, 1)

const paginator = await User.paginate(perPage, { page })
```

## Simple Pagination

Simple pagination is lighter-weight—it doesn't count total records, making it more efficient for very large datasets. Use this when you only need "next" and "previous" links.

### Basic Usage

```typescript
// Simple pagination (no total count)
const users = await User.simplePaginate(15)

// Specify page
const users = await User.simplePaginate(15, { page: 2 })
```

### With Query Conditions

```typescript
const activeUsers = await User.where('status', 'active').simplePaginate(20)

const recentPosts = await Post.orderBy('created_at', 'desc').simplePaginate(15, {
  page: request.query.page,
})
```

### Paginator Properties

```typescript
interface Paginator {
  data: User[] // Current page records
  currentPage: number // Current page number
  perPage: number // Items per page
  hasMorePages: boolean // Whether there are more pages
  from: number // First record number
  to: number // Last record number
  path: string // Base URL for pagination
}
```

### Working with Simple Pagination

```typescript
const paginator = await User.simplePaginate(20)

// Access records
paginator.data.forEach((user) => {
  console.log(user.name)
})

// Build navigation
if (paginator.hasMorePages) {
  const nextPage = paginator.currentPage + 1
  console.log(`Load page ${nextPage}`)
}

// Typically used for REST APIs
return {
  data: paginator.data,
  hasMore: paginator.hasMorePages,
  page: paginator.currentPage,
}
```

### Use Cases for Simple Pagination

Simple pagination is ideal for:

- Mobile applications with "load more" buttons
- Infinite scroll implementations
- APIs where total count is expensive to calculate
- Large datasets where exact page count isn't necessary

```typescript
// API endpoint for infinite scroll
async function getUsers(req, res) {
  const paginator = await User.where('status', 'active').simplePaginate(20, {
    page: req.query.page || 1,
  })

  return res.json({
    data: paginator.data,
    hasMore: paginator.hasMorePages,
    nextPage: paginator.currentPage + 1,
  })
}
```

## Cursor Pagination

Cursor-based pagination is the most efficient approach for very large datasets. Instead of offsets, it uses cursor pointers to track position.

### Basic Usage

```typescript
// Cursor pagination
const users = await User.cursorPaginate(15)

// Get next page using cursor
const users = await User.cursorPaginate(15, { cursor: 'eyJpZCI6MTAwfQ==' })
```

### With Query Conditions

```typescript
const recentUsers = await User.orderBy('created_at', 'desc').cursorPaginate(20)

const filteredUsers = await User.where('status', 'active').cursorPaginate(15)
```

### CursorPaginator Properties

```typescript
interface CursorPaginator {
  data: User[] // Current page records
  perPage: number // Items per page
  nextCursor: string | null // Cursor for next page
  previousCursor: string | null // Cursor for previous page
  path: string // Base URL
}
```

### Working with Cursor Pagination

```typescript
const paginator = await User.cursorPaginate(20)

// Access records
paginator.data.forEach((user) => {
  console.log(user.name)
})

// Build navigation with cursors
const nextUrl = paginator.nextCursor ? `${paginator.path}?cursor=${paginator.nextCursor}` : null

const previousUrl = paginator.previousCursor
  ? `${paginator.path}?cursor=${paginator.previousCursor}`
  : null

// Return for frontend
return {
  data: paginator.data,
  nextCursor: paginator.nextCursor,
  previousCursor: paginator.previousCursor,
  nextUrl,
  previousUrl,
}
```

### Cursor vs Offset Pagination

Cursor pagination is superior for large datasets:

```typescript
// Offset pagination (inefficient for large datasets)
// Must count all records and skip N offsets
const page = await User.limit(20)
  .offset((page - 1) * 20)
  .get()

// Cursor pagination (efficient)
// Uses index to find position, doesn't count all records
const page = await User.where('id', '>', cursor).limit(20).get()
```

Performance comparison:

```typescript
// Getting page 1000 with offset pagination:
// - Count 1,000,000+ records
// - Skip 20,000 records
// - Select 20 records
// SLOW: O(n) where n = total records

// Getting page 1000 with cursor pagination:
// - Find cursor position using index
// - Select 20 records
// FAST: O(1) database lookup
```

### Cursor Pagination for Infinite Scroll

Perfect for mobile and frontend implementations:

```typescript
// Initial load
const firstPage = await Post.orderBy('created_at', 'desc').cursorPaginate(15)

// Frontend stores nextCursor and uses it for "load more"
const nextPage = await Post.orderBy('created_at', 'desc').cursorPaginate(15, {
  cursor: firstPage.nextCursor,
})
```

## Customizing Results

### Selecting Specific Columns

```typescript
const paginator = await User.select('id', 'name', 'email').paginate(20)

const paginator = await Post.select('id', 'title', 'slug', 'user_id').with('author').paginate(15)
```

### Eager Loading Relationships

```typescript
// Load related data on paginated results
const users = await User.with('posts', 'comments').paginate(15)

// Nested relationships
const posts = await Post.with('author', 'comments.user').paginate(20)

// Conditional relationships
const users = await User.with({
  posts: (query) => query.latest().limit(5),
  comments: (query) => query.where('approved', true),
}).paginate(15)
```

### Filtering

```typescript
// Filter before pagination
const paginator = await User.where('status', 'active')
  .where('verified', true)
  .orderBy('created_at', 'desc')
  .paginate(20)

// Multiple conditions
const paginator = await Post.where('published', true)
  .whereBetween('created_at', [startDate, endDate])
  .paginate(15)
```

### Ordering

```typescript
// Order before pagination
const newest = await User.orderBy('created_at', 'desc').paginate(20)

const alphabetical = await User.orderBy('name', 'asc').paginate(20)

// Multiple orders
const paginator = await User.orderBy('status').orderBy('name', 'desc').paginate(20)
```

## Displaying Results

### REST API Response

```typescript
async function getUsers(req, res) {
  const page = req.query.page || 1
  const perPage = req.query.per_page || 20

  const paginator = await User.select('id', 'name', 'email')
    .where('status', 'active')
    .orderBy('created_at', 'desc')
    .paginate(perPage, { page })

  return res.json({
    data: paginator.data,
    meta: {
      currentPage: paginator.currentPage,
      lastPage: paginator.lastPage,
      total: paginator.total,
      perPage: paginator.perPage,
      from: paginator.from,
      to: paginator.to,
    },
    links: {
      first: paginator.getUrl(1),
      last: paginator.getUrl(paginator.lastPage),
      prev: paginator.currentPage > 1 ? paginator.getUrl(paginator.currentPage - 1) : null,
      next: paginator.hasMorePages ? paginator.getUrl(paginator.currentPage + 1) : null,
    },
  })
}
```

### HTML Template Example

```typescript
// Controller
const paginator = await Post.with('author').paginate(15)

// Pass to view
return view('posts.index', {
  posts: paginator.data,
  pagination: {
    currentPage: paginator.currentPage,
    lastPage: paginator.lastPage,
    hasMorePages: paginator.hasMorePages,
    getUrl: (page) => paginator.getUrl(page),
  },
})
```

```html
<!-- View: posts.index.html -->
<div class="posts">
  @foreach($posts as $post)
  <article>{{ $post.title }}</article>
  @endforeach
</div>

<div class="pagination">
  @if($pagination.currentPage > 1)
  <a href="{{ $pagination.getUrl(1) }}">First</a>
  <a href="{{ $pagination.getUrl($pagination.currentPage - 1) }}">Previous</a>
  @endif @for($i = 1; $i <= $pagination.lastPage; $i++) @if($i === $pagination.currentPage)
  <span class="active">{{ $i }}</span>
  @else
  <a href="{{ $pagination.getUrl($i) }}">{{ $i }}</a>
  @endif @endfor @if($pagination.hasMorePages)
  <a href="{{ $pagination.getUrl($pagination.currentPage + 1) }}">Next</a>
  <a href="{{ $pagination.getUrl($pagination.lastPage) }}">Last</a>
  @endif
</div>
```

### Cursor Pagination Example

```typescript
// Controller: Infinite scroll with cursor
async function getPosts(req, res) {
  const cursor = req.query.cursor

  const paginator = await Post.with('author').cursorPaginate(20, { cursor })

  return res.json({
    data: paginator.data,
    nextCursor: paginator.nextCursor,
    previousCursor: paginator.previousCursor,
  })
}
```

```javascript
// Frontend: Load more on scroll
let nextCursor = null

async function loadMorePosts() {
  const response = await fetch(`/api/posts?cursor=${nextCursor}`)
  const { data, nextCursor: newCursor } = await response.json()

  // Append to DOM
  data.forEach((post) => {
    appendPostToDOM(post)
  })

  nextCursor = newCursor
}
```

## API Reference

### Model Pagination Methods

```typescript
// Length-aware pagination
static paginate(
  perPage: number = 15,
  options?: {
    page?: number;
    pageName?: string;
  }
): Promise<LengthAwarePaginator>

// Simple pagination
static simplePaginate(
  perPage: number = 15,
  options?: {
    page?: number;
    pageName?: string;
  }
): Promise<Paginator>

// Cursor pagination
static cursorPaginate(
  perPage: number = 15,
  options?: {
    cursor?: string;
    cursorName?: string;
  }
): Promise<CursorPaginator>
```

### QueryBuilder Pagination Methods

Paginate any query:

```typescript
const users = await User.where('status', 'active').paginate(20)

const posts = await Post.with('comments').orderBy('created_at', 'desc').simplePaginate(15)

const items = await Item.cursorPaginate(25)
```

### LengthAwarePaginator Interface

```typescript
interface LengthAwarePaginator {
  data: T[]
  currentPage: number
  perPage: number
  total: number
  lastPage: number
  from: number
  to: number
  hasMorePages: boolean
  isFirstPage: boolean
  isLastPage: boolean
  path: string

  getUrl(page: number): string
  getQueryString(): string
}
```

### Paginator Interface

```typescript
interface Paginator {
  data: T[]
  currentPage: number
  perPage: number
  hasMorePages: boolean
  from: number
  to: number
  path: string

  getUrl(page: number): string
  getQueryString(): string
}
```

### CursorPaginator Interface

```typescript
interface CursorPaginator {
  data: T[]
  perPage: number
  nextCursor: string | null
  previousCursor: string | null
  path: string

  getUrl(cursor: string | null): string
}
```

## Best Practices

1. **Choose the right pagination type**:
   - Length-aware: Traditional pagination with page numbers
   - Simple: Mobile "load more" buttons
   - Cursor: Large datasets and infinite scroll

2. **Eager load relationships**: Always load needed relationships to avoid N+1 queries

3. **Index sort columns**: Paginated queries often sort by created_at or other columns—ensure these are indexed

4. **Validate page input**: Prevent negative or excessively large page numbers

5. **Set reasonable defaults**: Most applications use 15-25 items per page

6. **Cache paginated results**: For frequently accessed pages, consider caching results

7. **Optimize query conditions**: Filter data before pagination rather than after

8. **Use cursor pagination for large datasets**: Avoid offset pagination on tables with millions of records

9. **Validate per-page limits**: Prevent users from requesting 10,000 items per page

10. **Document pagination behavior**: Clearly specify in API docs which pagination method is used
