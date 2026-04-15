# Events

Atlex's event system provides a clean way to decouple parts of your application. When something important happens — a user registers, an order ships, a payment fails — you dispatch an event, and any number of listeners respond independently. This keeps your code modular and easy to extend.

## Installation

Events are part of the core package:

```bash
pnpm add @atlex/core
```

## Defining Events

An event is a simple class that carries data about what happened:

```typescript
import { Event } from '@atlex/core'

export class OrderShipped extends Event {
  constructor(
    public readonly order: Order,
    public readonly trackingNumber: string,
  ) {
    super()
  }
}
```

```typescript
export class UserRegistered extends Event {
  constructor(public readonly user: User) {
    super()
  }
}
```

Events are plain data carriers — they describe _what happened_, not what should be done about it.

## Registering Listeners

### Using the EventDispatcher

Register listeners by calling `listen()` on the event dispatcher:

```typescript
import { EventDispatcher } from '@atlex/core'

const events = app.make(EventDispatcher)

events.listen(OrderShipped, async (event) => {
  await sendTrackingEmail(event.order, event.trackingNumber)
})

events.listen(OrderShipped, async (event) => {
  await updateInventory(event.order)
})

events.listen(UserRegistered, async (event) => {
  await sendWelcomeEmail(event.user)
})
```

Each event can have as many listeners as you need. They all run when the event is dispatched.

### Using the @Listen Decorator

For a more declarative approach, use the `@Listen` decorator on class methods:

```typescript
import { Listen } from '@atlex/core'

export class OrderEventSubscriber {
  @Listen(OrderShipped)
  async sendTrackingEmail(event: OrderShipped) {
    const mail = new TrackingMailable(event.order, event.trackingNumber)
    await mailer.send(mail)
  }

  @Listen(OrderShipped)
  async notifyWarehouse(event: OrderShipped) {
    await warehouse.updateShipmentStatus(event.order.id, 'shipped')
  }
}
```

### In a Service Provider

The recommended pattern is to register listeners in a service provider's `boot()` method:

```typescript
import { ServiceProvider } from '@atlex/core'

export class EventServiceProvider extends ServiceProvider {
  boot() {
    const events = this.app.make(EventDispatcher)

    events.listen(UserRegistered, async (event) => {
      await sendWelcomeEmail(event.user)
    })

    events.listen(OrderShipped, async (event) => {
      await sendTrackingEmail(event.order, event.trackingNumber)
    })

    events.listen(PaymentFailed, async (event) => {
      await notifyAdmin(event.payment, event.error)
    })
  }
}
```

## Dispatching Events

Use the event dispatcher to fire events from anywhere in your application:

```typescript
const events = app.make(EventDispatcher)

// In a controller
Route.post('/orders/:id/ship', async (req, res) => {
  const order = await Order.findOrFail(req.params.id)
  const trackingNumber = await shippingService.createShipment(order)

  await order.update({ status: 'shipped', tracking_number: trackingNumber })

  // Dispatch the event — all registered listeners will be called
  events.dispatch(new OrderShipped(order, trackingNumber))

  res.json({ order, trackingNumber })
})
```

In a service class:

```typescript
export class RegistrationService {
  constructor(private events: EventDispatcher) {}

  async register(data: { name: string; email: string; password: string }) {
    const user = await User.create({
      name: data.name,
      email: data.email,
      password: await hash(data.password),
    })

    this.events.dispatch(new UserRegistered(user))

    return user
  }
}
```

## Event Subscribers

An event subscriber is a class that handles multiple events in one place. Register all handlers using the `subscribe()` method:

```typescript
export class PaymentEventSubscriber {
  subscribe(events: EventDispatcher) {
    events.listen(PaymentReceived, this.onPaymentReceived.bind(this))
    events.listen(PaymentFailed, this.onPaymentFailed.bind(this))
    events.listen(PaymentRefunded, this.onPaymentRefunded.bind(this))
  }

  async onPaymentReceived(event: PaymentReceived) {
    await event.order.update({ status: 'paid' })
    await sendReceiptEmail(event.order, event.payment)
  }

  async onPaymentFailed(event: PaymentFailed) {
    await event.order.update({ status: 'payment_failed' })
    await notifyCustomer(event.order, event.error)
  }

  async onPaymentRefunded(event: PaymentRefunded) {
    await event.order.update({ status: 'refunded' })
    await sendRefundConfirmation(event.order, event.refund)
  }
}
```

Register the subscriber in your provider:

```typescript
boot() {
  const events = this.app.make(EventDispatcher)
  const subscriber = new PaymentEventSubscriber()
  subscriber.subscribe(events)
}
```

## Queued Listeners

For time-consuming work, mark a listener to run on the queue rather than inline. Use the `SHOULD_QUEUE_LISTENER` symbol:

```typescript
import { SHOULD_QUEUE_LISTENER } from '@atlex/core'

export class GenerateInvoicePdf {
  [SHOULD_QUEUE_LISTENER] = true

  async handle(event: OrderShipped) {
    const pdf = await generateInvoice(event.order)
    await storage.disk('s3').put(`invoices/${event.order.id}.pdf`, pdf)
  }
}
```

When the event fires, this listener is dispatched as a background job instead of running synchronously in the request cycle.

## Checking for Listeners

You can check whether an event has registered listeners before dispatching:

```typescript
const events = app.make(EventDispatcher)

if (events.hasListeners(OrderShipped)) {
  events.dispatch(new OrderShipped(order, trackingNumber))
}
```

## Removing Listeners

Remove all listeners for a specific event:

```typescript
events.forget(OrderShipped)
```

## Broadcasting Events

For real-time notifications, events can be broadcast to connected clients:

```typescript
import { Event, broadcast } from '@atlex/core'

export class NewMessage extends Event {
  constructor(public readonly message: Message) {
    super()
  }

  broadcastOn() {
    return `chat.${this.message.channelId}`
  }

  broadcastAs() {
    return 'message.new'
  }
}

// Dispatch and broadcast
broadcast(new NewMessage(message))
```

## Common Event Patterns

### Domain Events

Model important state changes as events:

```typescript
// Events
export class AccountActivated extends Event {
  constructor(public readonly account: Account) {
    super()
  }
}

export class AccountSuspended extends Event {
  constructor(
    public readonly account: Account,
    public readonly reason: string,
  ) {
    super()
  }
}

export class SubscriptionRenewed extends Event {
  constructor(public readonly subscription: Subscription) {
    super()
  }
}

// Service
export class AccountService {
  constructor(private events: EventDispatcher) {}

  async activate(accountId: number) {
    const account = await Account.findOrFail(accountId)
    await account.update({ status: 'active', activated_at: new Date() })
    this.events.dispatch(new AccountActivated(account))
  }

  async suspend(accountId: number, reason: string) {
    const account = await Account.findOrFail(accountId)
    await account.update({ status: 'suspended' })
    this.events.dispatch(new AccountSuspended(account, reason))
  }
}
```

### Audit Logging

Use events to build an audit trail:

```typescript
export class AuditLogger {
  @Listen(UserRegistered)
  async logRegistration(event: UserRegistered) {
    await AuditLog.create({
      action: 'user.registered',
      subject_id: event.user.id,
      subject_type: 'User',
      metadata: { email: event.user.email },
    })
  }

  @Listen(OrderShipped)
  async logShipment(event: OrderShipped) {
    await AuditLog.create({
      action: 'order.shipped',
      subject_id: event.order.id,
      subject_type: 'Order',
      metadata: { tracking: event.trackingNumber },
    })
  }
}
```

## Testing Events

Use `EventFake` to capture dispatched events without triggering real listeners:

```typescript
import { test } from 'vitest'
import { EventFake } from '@atlex/testing'

test('registering a user dispatches UserRegistered event', async () => {
  const events = EventFake.install()

  await TestClient.post('/register', {
    name: 'Karen',
    email: 'karen@example.com',
    password: 'password123',
  })

  events.assertDispatched(UserRegistered)
  events.assertDispatched(UserRegistered, (e) => e.user.email === 'karen@example.com')
  events.assertNotDispatched(OrderShipped)
})

test('shipping an order dispatches OrderShipped event', async () => {
  const events = EventFake.install()
  const order = await Order.create({ product: 'Widget', quantity: 3 })

  await TestClient.post(`/orders/${order.id}/ship`)

  events.assertDispatched(OrderShipped)
  events.assertDispatchedCount(OrderShipped, 1)
})
```

## API Reference

### Event

| Property / Method | Description                                 |
| ----------------- | ------------------------------------------- |
| `constructor()`   | Base event class — extend it with your data |

### EventDispatcher

| Method                         | Description                          |
| ------------------------------ | ------------------------------------ |
| `dispatch(event)`              | Fire an event and call all listeners |
| `listen(eventClass, listener)` | Register a listener for an event     |
| `subscribe(subscriber)`        | Register an event subscriber         |
| `hasListeners(eventClass)`     | Check if an event has listeners      |
| `forget(eventClass)`           | Remove all listeners for an event    |

### Decorators

| Decorator             | Description                                     |
| --------------------- | ----------------------------------------------- |
| `@Listen(EventClass)` | Mark a method as a listener for the given event |

### Symbols

| Symbol                  | Description                                   |
| ----------------------- | --------------------------------------------- |
| `SHOULD_QUEUE_LISTENER` | Set to `true` on a listener class to queue it |
