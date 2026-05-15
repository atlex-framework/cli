# Queue & Jobs Guide

Atlex provides a powerful, unified queue system for handling asynchronous jobs and task scheduling. Whether you need to dispatch background jobs, retry failed tasks, or run scheduled cron jobs, the queue system gives you the tools to build responsive applications.

## Introduction

Queues allow you to defer time-consuming operations (like sending emails, processing uploads, or generating reports) to be executed later, keeping your application responsive. The Atlex queue system supports multiple drivers, job middleware, batching, and comprehensive error handling.

### Key Concepts

- **Jobs**: Classes that encapsulate work to be performed asynchronously
- **Drivers**: Different queue backends (BullMQ, SQS, Database, Sync, Null)
- **Worker**: Process that executes queued jobs
- **Retry**: Automatically retry failed jobs with exponential backoff
- **Batching**: Group related jobs and execute callbacks when all complete
- **Scheduling**: Execute jobs on a cron schedule

## Installation

```bash
npm install @atlex/queue
```

For Redis-backed queues (recommended for production):

```bash
npm install bullmq redis
```

## Configuration

Configure your queue system in `config/queue.ts`:

```typescript
import { defineConfig } from '@atlex/queue'

export default defineConfig({
  // Default queue connection
  default: 'bullmq',

  // Connection configurations
  connections: {
    // BullMQ (Redis-backed)
    bullmq: {
      driver: 'bullmq',
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    },

    // Database driver (uses database table)
    database: {
      driver: 'database',
      table: 'jobs',
      connection: 'default',
    },

    // AWS SQS
    sqs: {
      driver: 'sqs',
      key: process.env.AWS_ACCESS_KEY_ID,
      secret: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
      queue: process.env.SQS_QUEUE_URL,
    },

    // Synchronous (executes immediately)
    sync: {
      driver: 'sync',
    },

    // Null driver (discards jobs)
    null: {
      driver: 'null',
    },
  },

  // Failed job provider
  failed: {
    driver: 'database',
    table: 'failed_jobs',
    connection: 'default',
  },
})
```

## Creating Jobs

Create job classes that define units of work:

```typescript
// app/jobs/SendWelcomeEmail.ts
import { Job } from '@atlex/queue'

export class SendWelcomeEmail extends Job {
  // Static configuration
  static shouldQueue = true
  static queue = 'default'
  static delay = 0
  static connection = 'bullmq'
  static maxTries = 3
  static timeout = 30 // seconds

  constructor(
    public userId: string,
    public email: string,
  ) {
    super()
  }

  /**
   * Execute the job
   */
  async handle(): Promise<void> {
    const user = await User.find(this.userId)

    if (!user) {
      throw new Error(`User ${this.userId} not found`)
    }

    await Mail.mailable(new WelcomeMailableMailable(user)).send()
  }
}
```

### Job Class Methods

The `Job` class provides fluent methods for job configuration:

```typescript
class ProcessVideo extends Job {
  async handle(): Promise<void> {
    // Job logic here
  }
}

// Dispatch with configuration
ProcessVideo.dispatch(videoId)
  .onQueue('videos')
  .onConnection('bullmq')
  .delay(60) // 60 seconds
  .retry(5)
  .timeout(300)
  .middleware([validateVideo, notifyUser])

// Or use static configuration
class OptimizedVideo extends Job {
  static queue = 'videos'
  static connection = 'bullmq'
  static delay = 60
  static maxTries = 5
  static timeout = 300
}
```

### Checking if a Job Should Queue

Control whether a job should be queued:

```typescript
class ProcessReport extends Job {
  async handle(): Promise<void> {
    // Generate report...
  }

  shouldQueue(): boolean {
    // Only queue if report is large
    return this.dataSize > 10_000_000
  }
}

// If shouldQueue() returns false, the job executes synchronously
```

## Dispatching Jobs

### Basic Dispatch

Dispatch jobs to the queue with `dispatch()`:

```typescript
import { Queue } from '@atlex/queue'

// Dispatch a job
await Queue.dispatch(new SendWelcomeEmail(userId, email))

// Dispatch multiple jobs
await Queue.dispatch([
  new SendWelcomeEmail(user1Id, user1Email),
  new SendWelcomeEmail(user2Id, user2Email),
])
```

### Dispatch Variants

```typescript
// Asynchronously (adds to queue, returns immediately)
await Queue.dispatch(new SendEmail(email))

// Synchronously (executes immediately)
await Queue.dispatchSync(new SendEmail(email))

// After HTTP response (executes after response sent to client)
// Useful for background cleanup or notifications
await Queue.dispatchAfterResponse(new CleanupTemporaryFiles())
```

## Running the Worker

Start the worker process to execute queued jobs:

```bash
# Run the default queue worker
npx atlex queue:work

# Run specific queue
npx atlex queue:work --queue=videos

# Multiple queues with priority
npx atlex queue:work --queues=high,default,low

# With options
npx atlex queue:work \
  --connection=bullmq \
  --max-jobs=1000 \
  --timeout=60 \
  --sleep=3 \
  --memory=256
```

### Worker Options

```typescript
import { Worker } from '@atlex/queue'

const worker = new Worker()

await worker.run({
  queue: 'default', // Queue name
  connection: 'bullmq', // Connection name
  maxJobs: 1000, // Exit after processing N jobs
  timeout: 60, // Job timeout in seconds
  sleep: 3, // Sleep between job checks
  memory: 256, // Exit if memory exceeds MB
})
```

## Queue Connections

### SyncDriver

Executes jobs immediately, useful for development and testing:

```typescript
// config/queue.ts
connections: {
  sync: {
    driver: 'sync',
  },
}
```

No additional configuration needed. Jobs execute in the current process.

### NullDriver

Discards all jobs without processing:

```typescript
// config/queue.ts
connections: {
  null: {
    driver: 'null',
  },
}
```

Useful for disabling queuing in certain environments.

### DatabaseDriver

Uses a database table to store jobs:

```typescript
// config/queue.ts
connections: {
  database: {
    driver: 'database',
    table: 'jobs',
    connection: 'default',
  },
}

// Migration
export async function up(knex: Knex) {
  return knex.schema.createTable('jobs', (table) => {
    table.bigIncrements('id')
    table.string('queue').index()
    table.string('payload', 4000)
    table.integer('attempts').defaultTo(0)
    table.timestamp('reserved_at').nullable()
    table.timestamp('available_at')
    table.timestamp('created_at').defaultTo(knex.fn.now())
  })
}
```

### BullMQDriver

Redis-backed queue using BullMQ:

```typescript
// config/queue.ts
connections: {
  bullmq: {
    driver: 'bullmq',
    connection: {
      host: 'localhost',
      port: 6379,
      password: process.env.REDIS_PASSWORD,
      db: 0,
    },
  },
}
```

Requirements: Redis server running.

### SqsDriver

Amazon SQS queue:

```typescript
// config/queue.ts
connections: {
  sqs: {
    driver: 'sqs',
    key: process.env.AWS_ACCESS_KEY_ID,
    secret: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-east-1',
    queue: process.env.SQS_QUEUE_URL,
  },
}
```

## Delayed Jobs

Delay job execution by a specified number of seconds:

```typescript
// Delay using method
await Queue.dispatch(new ProcessReport(reportId)).delay(300) // Execute in 5 minutes

// Delay using static property
class DelayedJob extends Job {
  static delay = 600 // 10 minutes

  async handle(): Promise<void> {
    // Process...
  }
}
```

## Job Retries & Failure Handling

### Configuring Retries

```typescript
class ExternalApiJob extends Job {
  static maxTries = 3 // Retry up to 3 times

  async handle(): Promise<void> {
    const response = await fetch('https://api.example.com/process')

    if (!response.ok) {
      throw new Error('API request failed')
    }

    // Process response...
  }
}

// Or configure at dispatch time
await Queue.dispatch(new ExternalApiJob()).retry(5)
```

### Retry Logic

- Failed jobs are automatically re-queued
- Exponential backoff is applied between retries
- After `maxTries` attempts, the job moves to failed jobs

### Handling Specific Errors

```typescript
class RobustJob extends Job {
  async handle(): Promise<void> {
    try {
      await riskyOperation()
    } catch (error) {
      // Retry for network errors
      if (error.code === 'ECONNREFUSED') {
        throw error // Will be retried
      }

      // Don't retry for validation errors
      if (error instanceof ValidationError) {
        // Log and continue (or move to failed jobs manually)
        logger.error('Validation failed', error)
        return
      }

      throw error
    }
  }
}
```

## Failed Job Management

Manage jobs that exceeded retry limits:

```typescript
import { FailedJobProvider } from '@atlex/queue'

const failedJobs = FailedJobProvider.for('database')

// Get all failed jobs
const all = await failedJobs.all()

// Get specific failed job
const job = await failedJobs.get(jobId)

// Retry a failed job
await failedJobs.retry(jobId)

// Retry all failed jobs
await failedJobs.retryAll()

// Forget (delete) a failed job
await failedJobs.forget(jobId)

// Flush all failed jobs
await failedJobs.flush()
```

### Failed Job CLI

```bash
# List failed jobs
npx atlex queue:failed

# Retry a specific failed job
npx atlex queue:retry --id=123

# Retry all failed jobs
npx atlex queue:retry --all

# Remove a failed job
npx atlex queue:forget --id=123

# Clear all failed jobs
npx atlex queue:flush
```

## Unique Jobs

Prevent duplicate job execution by making jobs unique:

```typescript
class GenerateReport extends Job {
  constructor(public reportId: string) {
    super()
  }

  shouldBeUnique(): boolean {
    return true
  }

  /**
   * Unique key for deduplication
   */
  uniqueKey(): string {
    return `report:${this.reportId}`
  }

  async handle(): Promise<void> {
    // Only one instance of this report generation runs at a time
  }
}
```

If you dispatch the same unique job multiple times before it completes, duplicates are ignored.

## Encrypted Jobs

Encrypt sensitive job data:

```typescript
class ProcessPayment extends Job {
  constructor(
    public amount: number,
    public cardToken: string,
  ) {
    super()
  }

  shouldBeEncrypted(): boolean {
    return true
  }

  async handle(): Promise<void> {
    // cardToken is encrypted in transit and at rest
    await Payment.charge(this.cardToken, this.amount)
  }
}
```

The job's constructor parameters are encrypted using your application's encryption key.

## Job Middleware

Execute middleware before and after job handling:

```typescript
import { JobMiddleware } from '@atlex/queue'

// Create middleware
class LogJobMiddleware implements JobMiddleware {
  async before(job: Job): Promise<void> {
    console.log(`Starting job: ${job.constructor.name}`)
  }

  async after(job: Job, error?: Error): Promise<void> {
    if (error) {
      console.error(`Job failed: ${error.message}`)
    } else {
      console.log(`Job completed: ${job.constructor.name}`)
    }
  }
}

// Global middleware
Queue.middleware([new LogJobMiddleware(), new UpdateMetricsMiddleware()])

// Per-job middleware
await Queue.dispatch(new ProcessImage(imageId)).middleware([new ImageValidationMiddleware()])
```

### Built-in Middleware

```typescript
// Notify on failure
class NotifyOnFailureMiddleware implements JobMiddleware {
  async after(job: Job, error?: Error): Promise<void> {
    if (error) {
      await Notification.send(adminUserId, `Job failed: ${error.message}`)
    }
  }
}

// Measure performance
class PerformanceMiddleware implements JobMiddleware {
  private start: number

  async before(job: Job): Promise<void> {
    this.start = Date.now()
  }

  async after(job: Job): Promise<void> {
    const duration = Date.now() - this.start
    metrics.recordJobDuration(job.constructor.name, duration)
  }
}
```

## Job Batching

Group related jobs and execute callbacks when all complete:

```typescript
import { Batch } from '@atlex/queue'

// Create a batch
const batch = new Batch()

// Add jobs
for (const userId of userIds) {
  batch.add(new SendEmail(userId))
}

// Execute callbacks when all jobs complete
batch
  .then(async () => {
    await Notification.send(adminId, 'All emails sent!')
  })
  .catch(async (error) => {
    await ErrorLog.create({
      message: 'Batch processing failed',
      error: error.message,
    })
  })
  .finally(async () => {
    await cleanupTemporaryData()
  })

// Dispatch the batch
await batch.dispatch()
```

### Batch Methods

```typescript
// Add single job
batch.add(new SendEmail(userId))

// Add multiple jobs
batch.add([new SendEmail(user1Id), new SendEmail(user2Id)])

// Chain callbacks
batch
  .then(async () => {
    /* success */
  })
  .catch(async (error) => {
    /* failure */
  })
  .finally(async () => {
    /* cleanup */
  })

// Dispatch to queue
await batch.dispatch()
```

## Task Scheduling

Execute tasks on a schedule using cron expressions:

```typescript
import { Scheduler } from '@atlex/queue'

const scheduler = new Scheduler()

// Simple schedules
scheduler
  .call(async () => {
    await cleanupOldFiles()
  })
  .everyMinute()

scheduler.exec(new GenerateDailyReport()).daily()

scheduler
  .call(async () => {
    await backupDatabase()
  })
  .weekly('sunday', '2:00')

scheduler
  .call(async () => {
    await archiveOldData()
  })
  .monthly(15, '3:00') // 15th of month at 3 AM

// Custom cron expressions
scheduler
  .call(async () => {
    await sendReminders()
  })
  .cron('0 9,14,18 * * *') // 9 AM, 2 PM, 6 PM every day

// Run the scheduler
await scheduler.run()
```

### Scheduler Methods

```typescript
// Schedule a callback
scheduler.call(async () => {
  /* ... */
})

// Schedule a job class
scheduler.exec(JobClass)

// Schedule with cron expression
scheduler.cron('0 0 * * *')

// Common intervals
scheduler.everyMinute()
scheduler.everyFiveMinutes()
scheduler.everyTenMinutes()
scheduler.everyFifteenMinutes()
scheduler.everyThirtyMinutes()
scheduler.hourly()
scheduler.daily()
scheduler.weekly()
scheduler.monthly()
scheduler.quarterly()
scheduler.yearly()

// At specific time
scheduler.at('14:30') // 2:30 PM
scheduler.between('9:00', '17:00') // Only between these times
```

### Running the Scheduler

```bash
# Run the scheduler (execute due tasks)
npx atlex schedule:run

# List scheduled tasks
npx atlex schedule:list
```

## Events

React to job lifecycle events:

```typescript
import { Queue, JobEvent } from '@atlex/queue'

// Job started
Queue.on('job:start', (event: JobEvent) => {
  logger.info(`Job started: ${event.job.constructor.name}`)
})

// Job completed successfully
Queue.on('job:success', (event: JobEvent) => {
  logger.info(`Job completed: ${event.job.constructor.name}`)
})

// Job failed (before retry)
Queue.on('job:failed', (event: JobEvent & { error: Error }) => {
  logger.error(`Job failed: ${event.error.message}`)
})

// Job retrying
Queue.on('job:retry', (event: JobEvent & { attempt: number }) => {
  logger.info(`Job retrying (attempt ${event.attempt})`)
})

// All retries exhausted
Queue.on('job:exhausted', (event: JobEvent & { error: Error }) => {
  logger.error(`Job exhausted: ${event.error.message}`)
})
```

## Testing Queues

Test queued jobs with the testing utilities:

```typescript
import { test } from 'vitest'
import { Queue, TestQueue } from '@atlex/queue'

test('can dispatch and process job', async () => {
  // Use test queue (stores jobs in memory)
  const testQueue = new TestQueue()
  Queue.driver = testQueue

  // Dispatch a job
  await Queue.dispatch(new SendWelcomeEmail(userId, email))

  // Assert job was queued
  expect(testQueue.count()).toBe(1)

  // Get the queued job
  const job = testQueue.jobs()[0]
  expect(job).toBeInstanceOf(SendWelcomeEmail)

  // Process the job
  await testQueue.process()

  // Assert job was processed
  expect(testQueue.processed).toHaveLength(1)
})

test('handles job failure', async () => {
  const testQueue = new TestQueue()
  Queue.driver = testQueue

  class FailingJob extends Job {
    async handle(): Promise<void> {
      throw new Error('Job failed')
    }
  }

  await Queue.dispatch(new FailingJob())
  await testQueue.process()

  expect(testQueue.failed).toHaveLength(1)
  expect(testQueue.failed[0].error).toMatch('Job failed')
})
```

## API Reference

### Job Class

```typescript
class Job {
  // Methods
  static dispatch(...args: any[]): Job
  static dispatchSync(...args: any[]): Job
  static dispatchAfterResponse(...args: any[]): Job

  dispatch(): Promise<void>
  dispatchSync(): Promise<void>
  dispatchAfterResponse(): Promise<void>

  handle(): Promise<void>
  retry(maxAttempts: number): this
  delay(seconds: number): this
  onQueue(queue: string): this
  onConnection(connection: string): this
  timeout(seconds: number): this
  middleware(middleware: JobMiddleware[]): this

  shouldBeUnique(): boolean
  uniqueKey(): string
  shouldBeEncrypted(): boolean
  shouldQueue(): boolean

  // Static properties
  static shouldQueue: boolean
  static queue: string
  static delay: number
  static connection: string
  static maxTries: number
  static timeout: number
}
```

### QueueManager

```typescript
class QueueManager {
  dispatch(job: Job | Job[]): Promise<void>
  dispatchSync(job: Job | Job[]): Promise<void>
  dispatchAfterResponse(job: Job | Job[]): Promise<void>

  connection(name?: string): QueueDriver
  fail(job: Job, error: Error): Promise<void>

  extend(name: string, driver: QueueDriver): void

  middleware(middleware: JobMiddleware[]): void
  on(event: string, listener: Function): void
}
```

### Exceptions

- `MaxAttemptsExceededError`: Thrown when job exceeds retry limit
- `TimeoutExceededError`: Thrown when job execution timeout exceeded
- `QueueException`: Base queue exception
- `DriverNotFoundException`: When queue driver not found

### Configuration Properties

```typescript
interface QueueConfig {
  default: string
  connections: Record<string, ConnectionConfig>
  failed: {
    driver: string
    table: string
    connection: string
  }
}
```
