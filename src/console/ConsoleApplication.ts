import type { Container } from '@atlex/core'

import type { Command, CommandConstructor } from './Command.js'
import { CommandInput } from './CommandInput.js'
import { CommandOutput, type CommandOutputWriter } from './CommandOutput.js'
import { type CommandRegistry } from './CommandRegistry.js'
import { type ConsoleEvents } from './events.js'

type CallArgs = Record<string, unknown>

function groupByNamespace(names: readonly string[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const n of names) {
    const idx = n.indexOf(':')
    const ns = idx === -1 ? 'global' : n.slice(0, idx)
    const list = map.get(ns) ?? []
    list.push(n)
    map.set(ns, list)
  }
  for (const [, list] of map) {
    list.sort()
  }
  return map
}

/**
 * CLI runner for Atlex commands.
 */
export class ConsoleApplication {
  #lastOutput = ''

  public constructor(
    private readonly app: Container,
    private readonly registry: CommandRegistry,
    private readonly events: ConsoleEvents,
    private readonly version: string,
  ) {}

  /**
   * Run the application with raw argv (excluding `node` + entry script).
   */
  public async run(argv: readonly string[]): Promise<number> {
    const name = argv[0]?.trim() ?? ''
    // Use `call()` (not `callSilent`) so list/help render to the terminal.
    if (name.length === 0 || name === 'list') {
      return await this.call('list')
    }
    if (name === 'help') {
      const cmd = argv[1]
      return await this.call('help', cmd ? { command: cmd } : {})
    }
    return await this.resolveAndRunFromArgv(argv)
  }

  /**
   * Call a command by name with structured arguments.
   */
  public async call(command: string, args: CallArgs = {}): Promise<number> {
    return await this.resolveAndRun(command, args, { silent: false })
  }

  /**
   * Call a command silently (capture output, don't print).
   */
  public async callSilent(command: string, args: CallArgs = {}): Promise<number> {
    return await this.resolveAndRun(command, args, { silent: true })
  }

  private async resolveAndRunFromArgv(argv: readonly string[]): Promise<number> {
    const name = argv[0]?.trim() ?? ''
    const ctor = this.registry.get(name)
    if (ctor === null) {
      const out = new CommandOutput({ stdout: { write: () => {} }, stderr: { write: () => {} } })
      this.renderHeader(out)
      out.lineError(`Command "${name}" is not defined.`)
      out.line('')
      this.renderList(out)
      this.#lastOutput = out.toString()
      process.stderr.write(this.#lastOutput)
      return 1
    }

    const sig = CommandInput.parseSignature((ctor as unknown as { signature: string }).signature)
    const input = CommandInput.fromArgv(sig, argv, name)
    return await this.resolveAndRunCtor(name, ctor, input, { silent: false })
  }

  private async resolveAndRun(
    command: string,
    args: CallArgs,
    opts: { silent: boolean },
  ): Promise<number> {
    const ctor = this.registry.get(command)
    if (ctor === null) return 1
    const sig = CommandInput.parseSignature((ctor as unknown as { signature: string }).signature)
    const input = CommandInput.fromObject(sig, args)
    return await this.resolveAndRunCtor(command, ctor, input, opts)
  }

  private async resolveAndRunCtor(
    name: string,
    ctor: CommandConstructor,
    input: CommandInput,
    opts: { silent: boolean },
  ): Promise<number> {
    const writers: { stdout?: CommandOutputWriter; stderr?: CommandOutputWriter } = opts.silent
      ? { stdout: { write: () => {} }, stderr: { write: () => {} } }
      : {}

    const output = new CommandOutput(writers)
    let cmd: Command
    try {
      cmd = this.app.make(ctor)
    } catch (err: unknown) {
      const maybeCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code: unknown }).code
          : undefined
      if (maybeCode === 'E_NOT_INJECTABLE') {
        cmd = new ctor()
      } else {
        throw err instanceof Error ? err : new Error(String(err))
      }
    }
    cmd.bindIO(input, output)

    this.events.emit('CommandStarting', { command: name, input })
    await cmd.beforeHandle()

    let exitCode = 0
    try {
      const res = await Promise.resolve(cmd.handle())
      if (typeof res === 'number' && Number.isFinite(res)) exitCode = res
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      output.lineError(`${e.name}: ${e.message}`)
      exitCode = 1
    }

    await cmd.afterHandle()
    this.events.emit('CommandFinished', { command: name, exitCode })

    this.#lastOutput = output.toString()
    if (opts.silent) return exitCode
    return exitCode
  }

  /**
   * Display application header.
   */
  public renderHeader(output: CommandOutput): void {
    output.line(`Atlex Framework v${this.version}`)
    output.line('')
  }

  /**
   * Render list/help screen.
   */
  public renderList(output: CommandOutput): void {
    const names = [...this.registry.all().keys()].sort()
    this.renderHeader(output)
    output.line('Usage:')
    output.line('  command [options] [arguments]')
    output.line('')
    output.line('Available commands:')

    const groups = groupByNamespace(names)
    for (const [ns, cmds] of groups) {
      output.line(` ${ns === 'global' ? '' : ns}`.trimEnd())
      for (const name of cmds) {
        const ctor = this.registry.get(name)
        const desc = ctor ? ((ctor as unknown as { description?: unknown }).description ?? '') : ''
        const d = typeof desc === 'string' ? desc : ''
        const label = name.padEnd(22)
        output.line(`  ${label} ${d}`.trimEnd())
      }
    }
  }

  /**
   * Render help for a specific command.
   */
  public renderHelp(output: CommandOutput, command: string): void {
    const ctor = this.registry.get(command)
    this.renderHeader(output)
    if (ctor === null) {
      output.lineError(`Command "${command}" is not defined.`)
      return
    }
    const sig = (ctor as unknown as { signature: string }).signature
    const desc = (ctor as unknown as { description?: unknown }).description
    output.line(`Command: ${command}`)
    output.line(`Signature: ${sig}`)
    if (typeof desc === 'string' && desc.trim().length > 0) {
      output.line(`Description: ${desc}`)
    }
  }

  /**
   * Get output from the last command.
   */
  public output(): string {
    return this.#lastOutput
  }

  public has(name: string): boolean {
    return this.registry.has(name)
  }

  public add(command: CommandConstructor): void {
    this.registry.register(command)
  }
}
