import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Container } from '@atlex/core'

import type { CommandConstructor } from './Command.js'
import { CommandInput } from './CommandInput.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      yield* walk(full)
      continue
    }
    if (ent.isFile()) {
      yield full
    }
  }
}

/**
 * Detect Atlex command classes without `instanceof Command`.
 * Apps import `Command` from `@atlex/cli`; the CLI loads user files in a separate graph,
 * so `instanceof` often fails (duplicate Command constructor). Duck-type instead.
 */
function looksLikeCommandConstructor(value: unknown): value is CommandConstructor {
  if (typeof value !== 'function') return false
  const ctor = value as CommandConstructor & { signature?: unknown; prototype?: unknown }
  const sig = ctor.signature
  if (typeof sig !== 'string' || sig.trim().length === 0) return false
  const proto = ctor.prototype
  if (proto === null || typeof proto !== 'object') return false
  const handle = (proto as { handle?: unknown }).handle
  if (typeof handle !== 'function') return false
  return true
}

function isEnabledCommand(ctor: CommandConstructor): boolean {
  const enabled = (ctor as unknown as { enabled?: unknown }).enabled
  return enabled !== false
}

function getSignature(ctor: CommandConstructor): string | null {
  const sig = (ctor as unknown as { signature?: unknown }).signature
  return typeof sig === 'string' && sig.trim().length > 0 ? sig.trim() : null
}

/**
 * Stores registered commands and supports auto-discovery by scanning directories.
 */
export class CommandRegistry {
  readonly #byName = new Map<string, CommandConstructor>()

  public constructor(private readonly app: Container) {}

  /**
   * Register a command class.
   */
  public register(commandClass: CommandConstructor): void {
    if (!isEnabledCommand(commandClass)) return
    const sig = getSignature(commandClass)
    if (sig === null) return
    const parsed = CommandInput.parseSignature(sig)
    this.#byName.set(parsed.name, commandClass)
  }

  /**
   * Add/override a command by explicit name (used internally for synthetic commands).
   */
  public registerNamed(name: string, commandClass: CommandConstructor): void {
    this.#byName.set(name, commandClass)
  }

  /**
   * Resolve a command constructor by name.
   */
  public get(name: string): CommandConstructor | null {
    return this.#byName.get(name) ?? null
  }

  /**
   * @returns All commands as a Map.
   */
  public all(): Map<string, CommandConstructor> {
    return new Map(this.#byName)
  }

  /**
   * @returns True when a command is registered.
   */
  public has(name: string): boolean {
    return this.#byName.has(name)
  }

  /**
   * Discover and register commands in a directory (recursively).
   *
   * Scans for .ts/.js files excluding .d.ts and test/spec files.
   * Import failures are reported but do not crash discovery.
   */
  public async discover(directory: string): Promise<void> {
    const absDir = path.resolve(directory)
    if (!(await pathExists(absDir))) return

    for await (const file of walk(absDir)) {
      const ext = path.extname(file).toLowerCase()
      if (ext !== '.ts' && ext !== '.js' && ext !== '.mjs' && ext !== '.cjs') continue
      if (file.endsWith('.d.ts')) continue
      if (file.endsWith('.test.ts') || file.endsWith('.test.js')) continue
      if (file.endsWith('.spec.ts') || file.endsWith('.spec.js')) continue
      if (file.includes(`${path.sep}__tests__${path.sep}`)) continue

      try {
        const mod = (await import(pathToFileURL(file).href)) as unknown
        if (!isRecord(mod)) continue

        for (const key of Object.keys(mod)) {
          const exported = mod[key]
          if (!looksLikeCommandConstructor(exported)) continue
          const ctor = exported
          this.register(ctor)
        }
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        const logger = this.app.make<{ debug?: (msg: string) => void }>('logger')
        if (typeof logger?.debug === 'function') {
          logger.debug(`Warning: Failed to load command from ${file}: ${e.message}`)
        } else {
          // Last resort: avoid console.log in framework sources; throw silently.
        }
      }
    }
  }
}
