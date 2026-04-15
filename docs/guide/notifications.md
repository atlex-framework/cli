# Notifications

The `@atlex/notifications` package provides a powerful, flexible system for sending notifications through multiple channels—mail, database, Slack, and custom integrations. Define notifications as classes and route them intelligently to your users.

## Introduction

Notifications enable you to inform users about important events in your application. Whether it's a welcome email, a database activity log, a Slack message, or a custom channel delivery, the Atlex notification system handles it all with a unified API.

Key features:

- **Multiple channels** - Mail, database, Slack, and custom channels
- **Flexible routing** - Send to users, anonymous recipients, or custom notifiables
- **Conditional delivery** - Control whether notifications should be sent
- **Queued delivery** - Integrate with Atlex Queue for async processing
- **Broadcast notifications** - Real-time delivery via WebSockets
- **Event-driven** - Fire events at each stage of the notification lifecycle
- **Testable** - Built-in support for notification testing

## Creating Notifications

Create a notification class by extending the `Notification` base class and implementing the channels you want to support.

```typescript
import { Notification } from '@atlex/notifications'
import { MailMessage } from '@atlex/notifications/messages'

class WelcomeNotification extends Notification {
  constructor(public userName: string) {
    super()
  }

  // Define which channels this notification can be sent through
  via(): string[] {
    return ['mail', 'database']
  }

  // Handle mail delivery
  toMail(notifiable) {
    return new MailMessage()
      .subject('Welcome to Atlex!')
      .greeting(`Hello ${this.userName}!`)
      .line('Thank you for joining our community.')
      .action('Get Started', 'https://example.com/getting-started')
      .line('Happy coding!')
  }

  // Handle database storage
  toDatabase(notifiable) {
    return {
      title: 'Welcome',
      message: `Welcome ${this.userName}!`,
      url: '/getting-started',
    }
  }
}
```

### Notification Structure

Every notification should define:

1. **`via()` method** - Returns an array of channel names this notification supports
2. **Channel methods** - `toMail()`, `toDatabase()`, `toSlack()`, etc. for each channel
3. **Properties** - Optional metadata like locale, timing, and delivery rules

### Controlling Behavior

```typescript
class PaymentReceiptNotification extends Notification {
  public locale = 'en-US' // Set locale for this notification

  constructor(private amount: number) {
    super()
    this.afterCommit = true // Send after transaction commits
  }

  via(): string[] {
    return ['mail', 'database']
  }

  // Determine if this notification should be sent
  shouldSend(notifiable, channel: string): boolean {
    // Skip email if user opted out
    if (channel === 'mail' && notifiable.emailNotifications === false) {
      return false
    }
    return true
  }

  // Add delay before sending (in ms)
  deliveryDelay(channel: string): number {
    if (channel === 'mail') {
      return 60000 // Send email 1 minute later
    }
    return 0
  }

  toMail(notifiable) {
    return new MailMessage()
      .subject('Payment Receipt')
      .greeting(`Hi ${notifiable.name}!`)
      .line(`We received your payment of $${this.amount}`)
      .line('Thank you for your business.')
  }

  toDatabase(notifiable) {
    return {
      title: 'Payment Received',
      message: `Payment of $${this.amount} received`,
      data: { amount: this.amount },
    }
  }
}
```

## Sending Notifications

### Using the NotificationManager

The `NotificationManager` is responsible for routing and sending notifications.

```typescript
import { NotificationManager } from '@atlex/notifications';

// Inject the manager into your service
constructor(private notifications: NotificationManager) {}

// Send notification to a user
await this.notifications
  .send(user, new WelcomeNotification(user.name));

// Send immediately (bypass queue)
await this.notifications
  .sendNow(user, new WelcomeNotification(user.name));
```

### Using the Notifiable Mixin

Add the `Notifiable` mixin to your user model for convenient notification methods:

```typescript
import { Notifiable } from '@atlex/notifications'

class User extends Model.with(Notifiable) {
  // ... your model definition
}

// Now you can send directly from the user instance
await user.notify(new WelcomeNotification(user.name))
await user.notifyNow(new WelcomeNotification(user.name))

// Get user's notifications
const notifications = await user.notifications()
```

### Sending to Multiple Recipients

```typescript
const users = await User.query().where('role', 'admin').get()

for (const user of users) {
  await user.notifyNow(new AlertNotification('System maintenance'))
}
```

## Mail Notifications

The `MailMessage` class provides a fluent API for building professional emails.

```typescript
import { MailMessage } from '@atlex/notifications/messages';

toMail(notifiable) {
  return new MailMessage()
    .subject('Order Confirmation')
    .greeting('Hello!')
    .line('Your order has been confirmed.')
    .line('Order ID: #12345')
    .action('View Order', 'https://example.com/orders/12345')
    .line('---')
    .line('Questions? Contact our support team.')
    .salutation('Best regards,\nThe Team');
}
```

### MailMessage API

```typescript
class MailMessage {
  subject(subject: string): this
  greeting(greeting: string): this
  line(line: string): this
  lines(lines: string[]): this
  action(text: string, url: string): this
  salutation(salutation: string): this
  toArray(notifiable): object
}
```

### Custom Email Views

Override the `toArray()` method for complete control:

```typescript
toMail(notifiable) {
  return new MailMessage()
    .toArray(notifiable);
}

toArray(notifiable) {
  return {
    view: 'emails.order-confirmation',
    subject: 'Order Confirmed',
    data: {
      order: this.order,
      customer: notifiable,
    },
  };
}
```

## Database Notifications

Store notifications in the database for the notification center in your UI.

### Automatic Tracking

Use the `HasDatabaseNotifications` mixin to automatically track database notifications:

```typescript
import { HasDatabaseNotifications } from '@atlex/notifications'

class User extends Model.with(HasDatabaseNotifications) {
  // ... your model definition
}

// Get unread notifications
const unread = await user.unreadNotifications()

// Mark as read
await notification.markAsRead()

// Delete old notifications
await user
  .notifications()
  .where('created_at', '<', DateTime.now().minus({ days: 30 }))
  .delete()
```

### DatabaseMessage Format

```typescript
toDatabase(notifiable) {
  return new DatabaseMessage()
    .title('New Comment')
    .message('John commented on your post')
    .data({
      post_id: this.post.id,
      comment_id: this.comment.id,
    });
}
```

The notification is stored in the `DatabaseNotification` model with the user relationship.

## Slack Notifications

Send rich Slack messages directly to channels or users.

```typescript
import { SlackMessage, SlackAttachment } from '@atlex/notifications/messages'

class DeploymentNotification extends Notification {
  constructor(
    private environment: string,
    private status: string,
  ) {
    super()
  }

  via(): string[] {
    return ['slack']
  }

  toSlack(notifiable) {
    const color = this.status === 'success' ? '#36a64f' : '#ff0000'

    return new SlackMessage()
      .to('#deployments')
      .content(`Deployment to ${this.environment} ${this.status}`)
      .attachment(
        new SlackAttachment()
          .title('Deployment Report')
          .color(color)
          .field('Environment', this.environment, true)
          .field('Status', this.status, true)
          .field('Timestamp', new Date().toISOString(), false)
          .footer('Atlex Deployment System'),
      )
  }
}
```

### SlackMessage API

```typescript
class SlackMessage {
  to(channel: string): this
  content(text: string): this
  attachment(attachment: SlackAttachment): this
}

class SlackAttachment {
  title(title: string): this
  color(color: string): this
  field(name: string, value: string, short?: boolean): this
  footer(footer: string): this
}
```

## Custom Channels

Create custom notification channels for integrations like SMS, push notifications, or custom APIs.

```typescript
import { NotificationChannel } from '@atlex/notifications'

class SMSChannel implements NotificationChannel {
  constructor(private sms: SMSService) {}

  async send(notifiable, notification): Promise<void> {
    const message = notification.toSMS(notifiable)

    if (!notifiable.phone_number) {
      throw new Error('SMS channel requires a phone number')
    }

    await this.sms.send(notifiable.phone_number, message)
  }
}
```

Register the custom channel:

```typescript
const manager = new NotificationManager()

manager.channel('sms', new SMSChannel(smsService))

// Now use it in notifications
class AlertNotification extends Notification {
  via(): string[] {
    return ['sms', 'mail']
  }

  toSMS(notifiable) {
    return `Alert: System maintenance in 1 hour.`
  }

  toMail(notifiable) {
    return new MailMessage()
      .subject('System Maintenance')
      .line('System maintenance is scheduled for 1 hour from now.')
  }
}
```

## Conditional Sending

Control exactly when notifications should be delivered using the `shouldSend()` method.

```typescript
class NewsletterNotification extends Notification {
  constructor(private article: Article) {
    super()
  }

  via(): string[] {
    return ['mail', 'database']
  }

  shouldSend(notifiable, channel: string): boolean {
    // Don't send to inactive users
    if (!notifiable.is_active) {
      return false
    }

    // Only send email if they haven't unsubscribed
    if (channel === 'mail' && !notifiable.subscribed_to_newsletters) {
      return false
    }

    // Only send database notification if the article is published
    if (channel === 'database' && !this.article.is_published) {
      return false
    }

    return true
  }

  toMail(notifiable) {
    return new MailMessage()
      .subject(`New Article: ${this.article.title}`)
      .line(this.article.excerpt)
      .action('Read More', `https://example.com/articles/${this.article.slug}`)
  }

  toDatabase(notifiable) {
    return {
      title: 'New Article',
      message: this.article.title,
      data: { article_id: this.article.id },
    }
  }
}
```

## Queued Notifications

Automatically queue notifications for async delivery instead of blocking the request.

```typescript
import { QueueManager } from '@atlex/queue'

const manager = new NotificationManager(queueManager)

// Notifications are automatically queued
await manager.send(user, new WelcomeNotification(user.name))

// Force immediate delivery
await manager.sendNow(user, new WelcomeNotification(user.name))
```

The queue will process the notification asynchronously, handling retries and failures automatically.

### Custom Queue Configuration

```typescript
class OrderShippedNotification extends Notification {
  public afterCommit = true // Wait for database transaction
  public tries = 3 // Retry up to 3 times
  public timeout = 30000 // 30 second timeout

  via(): string[] {
    return ['mail', 'sms']
  }

  toMail(notifiable) {
    return new MailMessage()
      .subject('Your order has shipped!')
      .line(`Tracking: ${this.order.tracking_number}`)
  }

  toSMS(notifiable) {
    return `Order shipped! Track: ${this.order.tracking_number}`
  }
}
```

## On-Demand Notifications

Send notifications to users who aren't in your system yet (anonymous recipients) using the static `route()` method.

```typescript
import { AnonymousNotifiable } from '@atlex/notifications'

class InviteNotification extends Notification {
  constructor(private inviteLink: string) {
    super()
  }

  static route(channel: string, route: string) {
    // Map channel names to route keys
    return {
      mail: 'email',
      slack: 'slack_id',
    }[channel]
  }

  via(): string[] {
    return ['mail']
  }

  toMail(notifiable) {
    return new MailMessage()
      .subject("You're invited!")
      .line('You have been invited to join our team.')
      .action('Accept Invite', this.inviteLink)
      .line('This invitation expires in 7 days.')
  }
}

// Send to an anonymous email address
const notifiable = new AnonymousNotifiable()
await manager.send(
  { route: 'guest@example.com' },
  new InviteNotification('https://example.com/invite/abc123'),
)
```

## Notification Events

The notification system fires events at key points in the lifecycle. Listen for these events to extend functionality.

```typescript
import {
  NotificationSending,
  NotificationSent,
  NotificationFailed,
} from '@atlex/notifications/events'

// Listen for sending event (can be used to modify notification)
eventDispatcher.listen(NotificationSending, (event) => {
  console.log(`Sending ${event.notification.constructor.name} to ${event.notifiable.id}`)
})

// Listen for successful delivery
eventDispatcher.listen(NotificationSent, (event) => {
  console.log(`Successfully sent notification via ${event.channel}`)
})

// Listen for failures
eventDispatcher.listen(NotificationFailed, (event) => {
  console.error(`Failed to send notification: ${event.error.message}`)
})
```

### Available Events

- `NotificationSending` - Fired before notification is sent (can still be cancelled)
- `NotificationSent` - Fired after successful delivery
- `NotificationFailed` - Fired when delivery fails

## Testing Notifications

Use the `FakeNotificationManager` to test notifications without actually sending them.

```typescript
import { FakeNotificationManager } from '@atlex/notifications/testing'
import { test, expect } from 'vitest'

test('sends welcome notification', async () => {
  const notifications = new FakeNotificationManager()
  const user = new User({ name: 'John', email: 'john@example.com' })

  await notifications.send(user, new WelcomeNotification('John'))

  // Assert notification was sent to user
  expect(notifications.sent(user, WelcomeNotification)).toHaveLength(1)
})

test('sends mail and database notifications', async () => {
  const notifications = new FakeNotificationManager()
  const user = new User({ id: 1, email: 'user@example.com' })

  await notifications.send(user, new AlertNotification())

  // Assert specific channel was used
  expect(notifications.sent(user, AlertNotification, 'mail')).toHaveLength(1)

  expect(notifications.sent(user, AlertNotification, 'database')).toHaveLength(1)
})

test('respects shouldSend conditions', async () => {
  const notifications = new FakeNotificationManager()
  const inactiveUser = new User({ is_active: false })

  await notifications.send(inactiveUser, new NewsletterNotification())

  // Notification should not have been sent
  expect(notifications.sent(inactiveUser, NewsletterNotification)).toHaveLength(0)
})
```

## Exception Handling

The notification system defines specific exceptions for common error scenarios:

```typescript
import {
  NotificationRoutingException,
  NotificationFailedException,
} from '@atlex/notifications/exceptions'

try {
  await manager.send(user, notification)
} catch (error) {
  if (error instanceof NotificationRoutingException) {
    console.error(`Invalid notification route: ${error.message}`)
  } else if (error instanceof NotificationFailedException) {
    console.error(`Notification delivery failed: ${error.message}`)
  }
}
```

## API Reference

### NotificationManager

```typescript
class NotificationManager {
  constructor(queue?: QueueManager)

  channel(name: string, channel: NotificationChannel): void
  extend(name: string, callback: () => NotificationChannel): void
  send(notifiable: any, notification: Notification): Promise<void>
  sendNow(notifiable: any, notification: Notification): Promise<void>
}
```

### Notification

```typescript
abstract class Notification {
  id?: string
  locale?: string
  afterCommit?: boolean

  abstract via(): string[]
  shouldSend(notifiable: any, channel: string): boolean
  deliveryDelay(channel: string): number
  static route(channel: string, route: string): string
}
```

### Messages

```typescript
class MailMessage {
  subject(text: string): this
  greeting(text: string): this
  line(text: string): this
  lines(lines: string[]): this
  action(text: string, url: string): this
  salutation(text: string): this
  toArray(notifiable: any): object
}

class SlackMessage {
  to(channel: string): this
  content(text: string): this
  attachment(attachment: SlackAttachment): this
}

class SlackAttachment {
  title(text: string): this
  color(color: string): this
  field(name: string, value: string, short?: boolean): this
  footer(text: string): this
}

class DatabaseMessage {
  title(text: string): DatabaseMessage
  message(text: string): DatabaseMessage
  data(data: object): DatabaseMessage
}
```

### Mixins

```typescript
// Add to models to send notifications
mixin Notifiable {
  notify(notification: Notification): Promise<void>;
  notifyNow(notification: Notification): Promise<void>;
  notifications(): Promise<DatabaseNotification[]>;
}

mixin HasDatabaseNotifications {
  unreadNotifications(): Promise<DatabaseNotification[]>;
}
```

### Events

```typescript
class NotificationSending {
  constructor(
    public notification: Notification,
    public notifiable: any,
    public channel: string,
  ) {}
}

class NotificationSent {
  constructor(
    public notification: Notification,
    public notifiable: any,
    public channel: string,
  ) {}
}

class NotificationFailed {
  constructor(
    public notification: Notification,
    public notifiable: any,
    public channel: string,
    public error: Error,
  ) {}
}
```

## Next Steps

- Set up [Mail Channel](/guide/mail) configuration
- Integrate with [Queue](/guide/queue) for async delivery
- Learn about [Database](/guide/database) notifications storage
- Explore [Broadcasting](/guide/broadcasting) for real-time updates
