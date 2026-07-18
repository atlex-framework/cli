# Mail Guide

Atlex provides a powerful, fluent mailing system for sending emails through multiple drivers. Define mailable classes with your message content and let Atlex handle delivery through SMTP, AWS SES, Mailgun, or other drivers.

## Introduction

The mail system makes it simple to send professional emails from your application. Define message content in reusable mailable classes, configure drivers, and let Atlex handle delivery, queuing, and error handling.

### Key Features

- **Multiple Drivers**: SMTP, AWS SES, Mailgun, Log, Array
- **Fluent API**: Chainable methods for building messages
- **Queueable**: Send emails asynchronously via the queue system
- **Templates**: Support for view-based email templates
- **Attachments**: Easily attach files or generate inline attachments
- **Localization**: Send emails in user's preferred language
- **Markdown**: Built-in markdown to HTML conversion
- **Testing**: Test email sending without real deliveries

## Installation

```bash
npm install @atlex/mail
```

For HTML email generation from markdown:

```bash
npm install markdown-it
```

## Configuration

Configure your mail drivers in `config/mail.ts`:

```typescript
import { defineConfig } from '@atlex/mail'

export default defineConfig({
  // Default mailer to use
  default: 'smtp',

  // Global from address
  from: {
    address: 'hello@example.com',
    name: 'Atlex App',
  },

  // Path to email views/templates
  viewsPath: 'resources/views/emails',

  // Mail drivers
  mailers: {
    // SMTP driver
    smtp: {
      driver: 'smtp',
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT || '587'),
      username: process.env.MAIL_USERNAME,
      password: process.env.MAIL_PASSWORD,
      encryption: process.env.MAIL_ENCRYPTION || 'tls',
    },

    // AWS SES
    ses: {
      driver: 'ses',
      key: process.env.AWS_ACCESS_KEY_ID,
      secret: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    },

    // Mailgun
    mailgun: {
      driver: 'mailgun',
      domain: process.env.MAILGUN_DOMAIN,
      secret: process.env.MAILGUN_SECRET,
      region: process.env.MAILGUN_REGION || 'us',
    },

    // Log driver (writes to application log)
    log: {
      driver: 'log',
      channel: 'mail',
    },

    // Array driver (stores in memory)
    array: {
      driver: 'array',
    },
  },
})
```

## Generating Mailables

Generate mailable classes with the CLI:

```bash
npx atlex make:mailable WelcomeEmail
```

This creates `app/mailables/WelcomeEmail.ts`:

```typescript
import { Mailable } from '@atlex/mail'

export class WelcomeEmail extends Mailable {
  async build(): Promise<void> {
    this.subject('Welcome to Atlex').html('<h1>Welcome!</h1>')
  }
}
```

## Writing Mailables

### Mailable Structure

```typescript
import { Mailable } from '@atlex/mail'

export class OrderConfirmation extends Mailable {
  constructor(public order: Order) {
    super()
  }

  async build(): Promise<void> {
    this.subject(`Order #${this.order.id} Confirmed`)
      .to(this.order.customer.email)
      .replyTo('support@example.com')
      .cc('manager@example.com')
      .bcc('archive@example.com')
      .html(this.buildHtml())
      .attach('invoice.pdf', './storage/invoices/invoice.pdf')
  }

  private buildHtml(): string {
    return `
      <h1>Order Confirmed</h1>
      <p>Thank you for your order #${this.order.id}</p>
      <p><strong>Total: $${this.order.total}</strong></p>
    `
  }
}
```

### Envelope Methods

Set the email envelope (sender, recipients, subject):

```typescript
class WelcomeEmail extends Mailable {
  async build(): Promise<void> {
    // Recipient
    this.to('user@example.com')

    // Multiple recipients
    this.to(['user1@example.com', 'user2@example.com'])

    // From address
    this.from('noreply@example.com')
    this.from({
      address: 'noreply@example.com',
      name: 'Atlex Team',
    })

    // Reply-to
    this.replyTo('support@example.com')

    // Carbon copy
    this.cc('manager@example.com')

    // Blind carbon copy
    this.bcc('archive@example.com')

    // Subject
    this.subject('Welcome to Atlex')
  }
}
```

### Content Methods

Define email content:

```typescript
class InvoiceEmail extends Mailable {
  async build(): Promise<void> {
    // HTML content
    this.html('<h1>Invoice</h1><p>Amount: $100</p>')

    // Plain text content
    this.text('Invoice\nAmount: $100')

    // View-based content
    this.view('emails.invoice', {
      invoiceNumber: '12345',
      amount: 100,
    })

    // Markdown content (converted to HTML)
    this.markdown(this.getMarkdownContent())

    // Subject and body together
    this.subject('Your Invoice')
  }

  private getMarkdownContent(): string {
    return `
# Invoice

Thank you for your business.

**Amount Due:** $100.00
    `
  }
}
```

### Attachments

Attach files to emails:

```typescript
class ReportEmail extends Mailable {
  async build(): Promise<void> {
    // Attach file from disk
    this.attach('report.pdf', './storage/reports/report.pdf')

    // Attach with custom name
    this.attach('custom-name.pdf', './storage/reports/report.pdf')

    // Attach raw data
    this.attachData(csvContent, {
      filename: 'data.csv',
      mimeType: 'text/csv',
    })

    // Inline attachment (reference in HTML)
    this.attach('logo.png', './resources/images/logo.png', {
      inline: true,
      contentId: 'logo',
    })

    // Reference inline image in HTML
    this.html(`
      <img src="cid:logo" alt="Logo">
      <p>Email content</p>
    `)
  }
}
```

## Sending Mail

### From HTTP Handlers

```typescript
import { Mail } from '@atlex/mail'

export default class SendOrderEmail {
  async handle() {
    const order = await Order.find(request.param('id'))

    await Mail.mailable(new OrderConfirmation(order)).send()
  }
}
```

### Basic Send

```typescript
// Send immediately
await Mail.send(new WelcomeEmail(user))

// Using mailable helper
await Mail.mailable(new WelcomeEmail(user)).send()

// Raw messages
await Mail.raw('Plain text email', {
  to: 'user@example.com',
  subject: 'Hello',
})
```

### Fluent Builder

```typescript
await Mail.mailable(new WelcomeEmail(user))
  .to('custom@example.com') // Override recipient
  .cc('cc@example.com') // Add CC
  .bcc('bcc@example.com') // Add BCC
  .from('sender@example.com')
  .locale('es') // Override locale
  .send()
```

### Multiple Recipients

```typescript
const users = await User.all()

for (const user of users) {
  await Mail.mailable(new WelcomeEmail(user)).send()
}

// Or send bulk
await Promise.all(users.map((user) => Mail.mailable(new WelcomeEmail(user)).send()))
```

## Queueable Mailables

Send emails asynchronously via the queue system:

```typescript
import { Mailable } from '@atlex/mail'

export class WelcomeEmail extends Mailable {
  // Static queue configuration
  static shouldQueue = true
  static queue = 'default'
  static delay = 0
  static connection = 'bullmq'

  async build(): Promise<void> {
    this.subject('Welcome!').html('<h1>Welcome to Atlex</h1>')
  }
}

// Send queued (dispatched to queue)
await Mail.send(new WelcomeEmail(user))

// Send immediately (not queued)
await Mail.sendNow(new WelcomeEmail(user))
```

### Controlling Queue Behavior

```typescript
class OrderNotification extends Mailable {
  // Send through queue with custom config
  static shouldQueue = true
  static queue = 'emails'
  static connection = 'sqs'
  static delay = 300 // 5 minutes
}

// Override at runtime
await Mail.mailable(new OrderNotification(order)).onQueue('high-priority').send()
```

## Mail Drivers

### SmtpDriver

Send emails via SMTP:

```typescript
// config/mail.ts
mailers: {
  smtp: {
    driver: 'smtp',
    host: 'smtp.gmail.com',
    port: 587,
    username: 'your-email@gmail.com',
    password: 'your-app-password',
    encryption: 'tls',
  },
}
```

Supports TLS and SSL encryption.

### SesDriver

Send via AWS Simple Email Service:

```typescript
// config/mail.ts
mailers: {
  ses: {
    driver: 'ses',
    key: process.env.AWS_ACCESS_KEY_ID,
    secret: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-east-1',
  },
}
```

### MailgunDriver

Send via Mailgun API:

```typescript
// config/mail.ts
mailers: {
  mailgun: {
    driver: 'mailgun',
    domain: 'mail.example.com',
    secret: process.env.MAILGUN_SECRET,
    region: 'us', // or 'eu'
  },
}
```

### LogDriver

Write emails to application log (development):

```typescript
// config/mail.ts
mailers: {
  log: {
    driver: 'log',
    channel: 'mail',
  },
}
```

Useful for development and debugging.

### ArrayDriver

Store emails in memory (testing):

```typescript
// config/mail.ts
mailers: {
  array: {
    driver: 'array',
  },
}
```

## Templates and Views

### View-Based Emails

Create email templates in `resources/views/emails/`:

```html
<!-- resources/views/emails/welcome.html -->
<!DOCTYPE html>
<html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Welcome, {{ firstName }}!</h1>
      <p>Thank you for joining Atlex.</p>
      <a href="{{ loginUrl }}">Sign in now</a>
    </div>
  </body>
</html>
```

Use in mailable:

```typescript
class WelcomeEmail extends Mailable {
  constructor(public user: User) {
    super()
  }

  async build(): Promise<void> {
    this.to(this.user.email).subject('Welcome to Atlex').view('welcome', {
      firstName: this.user.firstName,
      loginUrl: 'https://example.com/login',
    })
  }
}
```

### Template Renderer

Access the template renderer directly:

```typescript
import { TemplateRenderer } from '@atlex/mail'

const renderer = new TemplateRenderer()

const html = await renderer.render('welcome', {
  firstName: 'John',
})

const text = await renderer.renderText('welcome', {
  firstName: 'John',
})
```

## Inline Attachments

Embed images directly in email content:

```typescript
class NewsletterEmail extends Mailable {
  async build(): Promise<void> {
    // Attach logo with inline flag
    this.attach('logo.png', './resources/images/logo.png', {
      inline: true,
      contentId: 'logo-image',
    })

    // Reference in HTML using content ID
    this.html(`
      <img src="cid:logo-image" alt="Logo" style="max-width: 200px;">
      <h1>Monthly Newsletter</h1>
      <p>Content here...</p>
    `)
  }
}
```

## Raw Messages

Send plain text or custom messages without a mailable:

```typescript
// Raw text message
await Mail.raw('Hello, this is a test email', {
  to: 'user@example.com',
  subject: 'Test Email',
})

// Custom headers
await Mail.raw('Content', {
  to: 'user@example.com',
  subject: 'Custom Headers',
  headers: {
    'X-Custom-Header': 'value',
    'X-Priority': '1',
  },
})
```

## Localization

Send emails in the user's preferred language:

```typescript
class LocalizedEmail extends Mailable {
  constructor(public user: User) {
    super()
  }

  async build(): Promise<void> {
    this.to(this.user.email)
      .locale(this.user.preferredLanguage) // 'en', 'es', 'fr', etc.
      .view('notification')
  }
}

// Or set locale at send time
await Mail.mailable(new LocalizedEmail(user)).locale('es').send()
```

Email templates should be organized by locale:

```
resources/views/emails/
  en/
    notification.html
  es/
    notification.html
  fr/
    notification.html
```

## Events

React to mail events:

```typescript
import { Mail, MailEvent } from '@atlex/mail'

// Before send
Mail.on('mail:sending', (event: MailEvent) => {
  console.log(`Sending email to: ${event.message.to}`)
})

// After successful send
Mail.on('mail:sent', (event: MailEvent) => {
  console.log(`Email sent to: ${event.message.to}`)
})

// Send failed
Mail.on('mail:failed', (event: MailEvent & { error: Error }) => {
  console.error(`Email failed: ${event.error.message}`)
})
```

## Testing Mail

Test email sending without real deliveries:

```typescript
import { test } from 'vitest'
import { Mail, MailFake } from '@atlex/testing'

test('can send welcome email', async () => {
  // Use fake mailer
  const fake = new MailFake()
  Mail.driver = fake

  // Send email
  await Mail.mailable(new WelcomeEmail(user)).send()

  // Assert email was queued
  expect(fake.count()).toBe(1)

  // Get the sent message
  const message = fake.messages()[0]
  expect(message.to).toContain('user@example.com')
  expect(message.subject).toMatch('Welcome')
})

test('sends to correct recipient', async () => {
  const fake = new MailFake()
  Mail.driver = fake

  const user = { email: 'john@example.com' }
  await Mail.mailable(new WelcomeEmail(user)).send()

  expect(fake.sentTo('john@example.com')).toHaveLength(1)
})

test('includes correct subject', async () => {
  const fake = new MailFake()
  Mail.driver = fake

  await Mail.mailable(new OrderConfirmation(order)).send()

  expect(fake.subjects()).toContain(`Order #${order.id} Confirmed`)
})

test('can inspect email content', async () => {
  const fake = new MailFake()
  Mail.driver = fake

  await Mail.mailable(new InvoiceEmail(invoice)).send()

  const message = fake.messages()[0]
  expect(message.html).toContain('Invoice')
  expect(message.attachments).toHaveLength(1)
})

test('can assert mailable was not sent', async () => {
  const fake = new MailFake()
  Mail.driver = fake

  // Don't send anything

  expect(fake.count()).toBe(0)
})
```

## API Reference

### MailManager

```typescript
class MailManager {
  // Send mailable
  send(mailable: Mailable): Promise<void>
  sendNow(mailable: Mailable): Promise<void>

  // Send raw message
  raw(message: string, options: RawMessageOptions): Promise<void>

  // Helper to create mailable
  mailable(mailable: Mailable): MailMessage

  // Driver management
  driver(name?: string): MailDriver
  extend(name: string, driver: MailDriver): void

  // Global settings
  alwaysFrom(address: string | AddressObject): this
  alwaysReplyTo(address: string | AddressObject): this
  alwaysCc(address: string | AddressObject): this
  alwaysBcc(address: string | AddressObject): this
  alwaysTo(address: string | AddressObject): this

  // Locale
  locale(locale: string): this

  // Events
  on(event: string, listener: Function): void
}
```

### Mailable

```typescript
class Mailable {
  // Build the message
  abstract build(): Promise<void>

  // Envelope methods
  to(address: string | string[]): this
  from(address: string | AddressObject): this
  replyTo(address: string | AddressObject): this
  cc(address: string | AddressObject): this
  bcc(address: string | AddressObject): this

  // Content methods
  subject(subject: string): this
  html(html: string): this
  text(text: string): this
  view(view: string, data?: Record<string, any>): this
  markdown(markdown: string): this

  // Attachment methods
  attach(filename: string, path: string, options?: AttachOptions): this
  attachData(data: string | Buffer, options: AttachDataOptions): this

  // Other methods
  with(data: Record<string, any>): this
  locale(locale: string): this
  onQueue(queue: string): this
  onConnection(connection: string): this

  // Static configuration
  static shouldQueue: boolean
  static queue: string
  static delay: number
  static connection: string
}
```

### MailMessage

Fluent builder for constructing messages:

```typescript
class MailMessage {
  to(address: string | string[]): this
  from(address: string | AddressObject): this
  cc(address: string | AddressObject): this
  bcc(address: string | AddressObject): this
  replyTo(address: string | AddressObject): this
  subject(subject: string): this
  html(html: string): this
  text(text: string): this
  view(view: string, data?: Record<string, any>): this
  locale(locale: string): this
  send(): Promise<void>
}
```

### Attachment

```typescript
interface AttachOptions {
  inline?: boolean
  contentId?: string
  mimeType?: string
}

interface AttachDataOptions {
  filename: string
  mimeType?: string
  contentId?: string
}
```

### Exceptions

- `MailException`: Base mail exception
- `DriverNotFoundException`: When mail driver not found
- `TemplateNotFoundException`: When email template not found

### Configuration Properties

```typescript
interface MailConfig {
  default: string
  from: AddressObject | string
  viewsPath: string
  mailers: Record<string, MailerConfig>
}

interface AddressObject {
  address: string
  name?: string
}
```
