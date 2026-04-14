import { ConsoleKernel } from '@atlex/cli'

export class Kernel extends ConsoleKernel {
  /**
   * Register command classes manually.
   * Commands in app/Console/Commands/ are auto-discovered.
   * Only add commands here that live outside the standard directory.
   */
  commands = []

  /**
   * Define the application's command schedule.
   */
  schedule(_schedule) {
    // Example:
    // schedule.command("reports:send").daily();
  }
}
