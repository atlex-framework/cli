import { createLegacyProgram, runLegacyCliAsync } from '../bin/legacy-atlex.js'

import { Command, type CommandConstructor } from './Command.js'
import type { CommandRegistry } from './CommandRegistry.js'

function createBridgedCommandClass(name: string, description: string): CommandConstructor {
  class BridgedFrameworkCommand extends Command {
    public static override signature = name
    public static override description = description

    public async handle(): Promise<number> {
      return await runLegacyCliAsync(process.argv)
    }
  }
  return BridgedFrameworkCommand
}

/**
 * Registers every legacy Commander subcommand (make:*, migrate*, queue:*, schedule:*, serve, db:seed, …)
 * on the in-app {@link CommandRegistry} so `atlex list` matches the standalone CLI when using {@link ConsoleKernel}.
 *
 * Each registered class delegates to `runLegacyCliAsync(process.argv)` — full argv is re-parsed by Commander
 * so options and arguments stay identical to running the binary without an app kernel.
 */
export function registerBridgedFrameworkCommands(registry: CommandRegistry): void {
  const program = createLegacyProgram()
  for (const sub of program.commands) {
    const name = sub.name()
    if (name.length === 0) continue
    if (registry.has(name)) continue
    const description = sub.description() ?? ''
    registry.register(createBridgedCommandClass(name, description))
  }
}
