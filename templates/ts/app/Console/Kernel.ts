import { ConsoleKernel } from '@atlex/cli'
import type { Scheduler } from '@atlex/queue'

export class Kernel extends ConsoleKernel {
  /**
   * Register command classes manually.
   * Commands in app/Console/Commands/ are auto-discovered.
   * Only add commands here that live outside the standard directory.
   */
  protected commands = []

  /**
   * Define the application's command schedule.
   *
   * The OS cron calls `atlex schedule:run` every minute.
   */
  protected schedule(_schedule: Scheduler): void {
    // Example:
    // schedule.command("reports:send").daily();
  }
}
