import { EventEmitter } from 'node:events'

export type ConsoleEventName =
  | 'CommandStarting'
  | 'CommandFinished'
  | 'ConsoleTerminating'
  | 'ScheduleRegistered'

/**
 * Typed EventEmitter wrapper for console lifecycle events.
 */
export class ConsoleEvents extends EventEmitter {
  public override on(event: ConsoleEventName, listener: (payload: unknown) => void): this {
    return super.on(event, listener)
  }

  public override emit(event: ConsoleEventName, payload: unknown): boolean {
    return super.emit(event, payload)
  }
}
