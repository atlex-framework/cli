# Storage

Atlex's storage system provides a unified API for working with files across different storage backends — local disk, Amazon S3, Google Cloud Storage, or in-memory. Write your code once, then swap drivers by changing a configuration value.

## Installation

```bash
pnpm add @atlex/storage
```

For S3 support:

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Configuration

Create `config/filesystems.ts`:

```typescript
import { FilesystemsConfig } from '@atlex/storage'

export default {
  default: 'local',

  disks: {
    local: {
      driver: 'local',
      root: 'storage/app',
      url: '/storage',
    },

    public: {
      driver: 'local',
      root: 'storage/app/public',
      url: '/storage/public',
    },

    s3: {
      driver: 's3',
      bucket: process.env['AWS_BUCKET'] ?? '',
      key: process.env['AWS_ACCESS_KEY_ID'] ?? '',
      secret: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
      region: process.env['AWS_REGION'] ?? 'us-east-1',
      url: process.env['AWS_URL'] ?? '',
    },

    memory: {
      driver: 'memory',
    },
  },
} satisfies FilesystemsConfig
```

Set your default disk in `.env`:

```
FILESYSTEM_DISK=local
```

## Obtaining Disk Instances

Use the `StorageManager` to access disks:

```typescript
import { StorageManager } from '@atlex/storage'

const storage = app.make(StorageManager)

// Use the default disk
const defaultDisk = storage.disk()

// Use a specific disk
const s3 = storage.disk('s3')
const local = storage.disk('local')
```

Or construct from config directly:

```typescript
const storage = StorageManager.fromConfig(config, basePath)
```

## Retrieving Files

### Reading File Contents

```typescript
const disk = storage.disk()

// Read as a string
const contents = await disk.get('documents/report.txt')

// Read as bytes
const bytes = await disk.getBytes('images/photo.png')
```

### Checking File Existence

```typescript
if (await disk.exists('documents/report.txt')) {
  const contents = await disk.get('documents/report.txt')
}

if (await disk.missing('documents/report.txt')) {
  console.log('File not found')
}
```

### File Metadata

```typescript
// File size in bytes
const size = await disk.size('uploads/video.mp4')

// MIME type
const mime = await disk.mimeType('uploads/photo.jpg')
// => 'image/jpeg'

// Last modified timestamp (Unix epoch in ms)
const lastModified = await disk.lastModified('config/app.ts')
```

### File Visibility

```typescript
// Get current visibility
const visibility = await disk.getVisibility('uploads/photo.jpg')
// => 'public' or 'private'

// Set visibility
await disk.setVisibility('uploads/photo.jpg', 'public')
```

## Storing Files

### Writing Content

```typescript
// Write a string
await disk.put('documents/notes.txt', 'Hello, world!')

// Write with options
await disk.put('documents/notes.txt', 'Hello, world!', {
  visibility: 'public',
  contentType: 'text/plain',
})
```

### Appending to a File

```typescript
await disk.append('logs/app.log', 'New log entry\n')
```

### Uploading Files

Store an uploaded file from an HTTP request:

```typescript
import { UploadedFile } from '@atlex/storage'

Route.post('/profile/avatar', async (req, res) => {
  const file: UploadedFile = req.file

  // Store in the avatars directory
  await file.store('avatars', { disk: 'public' })

  // Access file info
  console.log(file.originalName()) // => 'photo.jpg'
  console.log(file.extension()) // => 'jpg'
  console.log(file.mimeType()) // => 'image/jpeg'
  console.log(file.size()) // => 245832

  res.json({ message: 'Avatar uploaded' })
})
```

Use the `putFile` method for direct file storage:

```typescript
await disk.putFile('avatars', uploadedFile, {
  visibility: 'public',
})
```

### File Upload Middleware

Parse multipart file uploads with the `parseUploads` middleware:

```typescript
import { parseUploads } from '@atlex/storage'

// Apply to specific routes
Route.post('/upload', parseUploads({ maxFileSize: 10 * 1024 * 1024 }), async (req, res) => {
  const file = req.file
  await storage.disk('s3').putFile('uploads', file)
  res.json({ success: true })
})
```

## Copying and Moving Files

```typescript
// Copy a file
await disk.copy('original/photo.jpg', 'backup/photo.jpg')

// Move (rename) a file
await disk.move('temp/upload.jpg', 'avatars/user-42.jpg')
```

## Deleting Files

```typescript
// Delete a single file
await disk.delete('temp/old-file.txt')
```

## Directories

### Creating Directories

```typescript
await disk.makeDirectory('uploads/2024/01')
```

### Listing Contents

```typescript
// List files in a directory
const files = await disk.listContents('uploads')

for (const file of files) {
  console.log(file.path, file.size, file.lastModified)
}

// List recursively
const allFiles = await disk.listContents('uploads', true)
```

### Deleting Directories

```typescript
await disk.deleteDirectory('temp')
```

## File URLs

### Public URLs

Generate a URL for a publicly accessible file:

```typescript
const url = disk.url('avatars/user-42.jpg')
// => '/storage/avatars/user-42.jpg' (local)
// => 'https://bucket.s3.amazonaws.com/avatars/user-42.jpg' (S3)
```

### Temporary (Signed) URLs

Generate a time-limited URL for private files (S3 only):

```typescript
const url = await disk.temporaryUrl('reports/financial.pdf', 3600)
// => Signed S3 URL valid for 1 hour

const url = await disk.temporaryUrl('reports/financial.pdf', 3600, {
  ResponseContentDisposition: 'attachment; filename="report.pdf"',
})
```

## Storage Drivers

### Local Driver

Stores files on the local filesystem:

```typescript
disks: {
  local: {
    driver: 'local',
    root: 'storage/app',
    url: '/storage',
  },
}
```

### S3 Driver

Stores files on Amazon S3 or S3-compatible services (MinIO, DigitalOcean Spaces, etc.):

```typescript
disks: {
  s3: {
    driver: 's3',
    bucket: 'my-bucket',
    key: 'AKIAIOSFODNN7EXAMPLE',
    secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    url: 'https://my-bucket.s3.amazonaws.com',
  },
}
```

### Memory Driver

In-memory storage — ideal for testing:

```typescript
disks: {
  memory: {
    driver: 'memory',
  },
}
```

## Custom Drivers

If you need a storage backend that isn't built in, implement the `StorageDriver` interface:

```typescript
import { StorageDriver } from '@atlex/storage'

export class AzureBlobDriver implements StorageDriver {
  async exists(path: string): Promise<boolean> {
    /* ... */
  }
  async get(path: string): Promise<string> {
    /* ... */
  }
  async getBytes(path: string): Promise<Uint8Array> {
    /* ... */
  }
  async put(path: string, contents: string | Uint8Array): Promise<boolean> {
    /* ... */
  }
  async delete(path: string): Promise<boolean> {
    /* ... */
  }
  // ... implement all required methods
}
```

Register it in a service provider:

```typescript
const storage = app.make(StorageManager)
storage.replaceDisk('azure', new AzureBlobDriver(config))
```

## Testing Storage

Use the `MemoryDriver` or `StorageFake` in tests to avoid hitting real filesystems:

```typescript
import { test, expect } from 'vitest'
import { StorageFake } from '@atlex/testing'

test('avatar upload stores file', async () => {
  const storage = StorageFake.install()

  await TestClient.post('/profile/avatar', {
    file: createTestFile('avatar.jpg'),
  })

  storage.disk('public').assertExists('avatars/avatar.jpg')
  storage.disk('public').assertMissing('avatars/old-avatar.jpg')
})

test('report generation creates pdf', async () => {
  const storage = StorageFake.install()

  await generateMonthlyReport('2024-01')

  storage.disk('s3').assertExists('reports/2024-01.pdf')
})
```

Or replace the disk in the storage manager for a specific test:

```typescript
import { MemoryDriver, StorageManager } from '@atlex/storage'

const storage = app.make(StorageManager)
storage.replaceDisk('s3', new MemoryDriver())
```

## API Reference

### StorageManager

| Method                         | Description                                |
| ------------------------------ | ------------------------------------------ |
| `disk(name?)`                  | Get a disk instance (default if no name)   |
| `fromConfig(config, basePath)` | Create manager from configuration          |
| `getDefaultDiskKey()`          | Get the default disk name                  |
| `replaceDisk(name, driver)`    | Replace a disk driver (useful for testing) |

### Disk

| Method                                   | Description                    |
| ---------------------------------------- | ------------------------------ |
| `exists(path)`                           | Check if a file exists         |
| `missing(path)`                          | Check if a file does not exist |
| `get(path)`                              | Read file contents as string   |
| `getBytes(path)`                         | Read file contents as bytes    |
| `put(path, contents, options?)`          | Write file contents            |
| `putFile(path, file, options?)`          | Store an uploaded file         |
| `append(path, data)`                     | Append to a file               |
| `delete(path)`                           | Delete a file                  |
| `copy(from, to)`                         | Copy a file                    |
| `move(from, to)`                         | Move or rename a file          |
| `size(path)`                             | Get file size in bytes         |
| `mimeType(path)`                         | Get file MIME type             |
| `lastModified(path)`                     | Get last modification time     |
| `getVisibility(path)`                    | Get file visibility            |
| `setVisibility(path, visibility)`        | Set file visibility            |
| `url(path)`                              | Get public URL                 |
| `temporaryUrl(path, expireIn, options?)` | Get signed temporary URL       |
| `makeDirectory(path)`                    | Create a directory             |
| `deleteDirectory(path)`                  | Delete a directory recursively |
| `listContents(directory, recursive?)`    | List files in a directory      |

### UploadedFile

| Method                  | Description                       |
| ----------------------- | --------------------------------- |
| `originalName()`        | Original filename from the upload |
| `name()`                | Filename without extension        |
| `extension()`           | File extension                    |
| `mimeType()`            | MIME type of the file             |
| `size()`                | File size in bytes                |
| `stream()`              | Get readable stream               |
| `buffer()`              | Read entire file into a buffer    |
| `store(path, options?)` | Save to a disk                    |
