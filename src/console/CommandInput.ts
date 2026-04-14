export interface ParsedSignatureArgument {
  readonly kind: 'argument'
  readonly name: string
  readonly required: boolean
  readonly variadic: boolean
}

export interface ParsedSignatureOption {
  readonly kind: 'option'
  readonly name: string
  readonly requiredValue: boolean
  readonly defaultValue?: string
}

export type ParsedSignatureToken = ParsedSignatureArgument | ParsedSignatureOption

export interface ParsedSignature {
  readonly name: string
  readonly tokens: readonly ParsedSignatureToken[]
}

export interface ArgvParseResult {
  readonly args: Record<string, string | string[] | undefined>
  readonly options: Record<string, string | boolean | undefined>
}

function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)
}

function stripBraces(token: string): string {
  const t = token.trim()
  if (!t.startsWith('{') || !t.endsWith('}')) return t
  return t.slice(1, -1).trim()
}

function parseOptionBody(body: string): ParsedSignatureOption {
  // Examples:
  // --queue
  // --queue=default
  // --queue=
  // --queue=  (treated as requiredValue with empty default)
  let s = body.trim()
  if (!s.startsWith('--')) {
    throw new Error(`Invalid option token "${body}". Options must start with "--".`)
  }
  s = s.slice(2)
  const eqIdx = s.indexOf('=')
  if (eqIdx === -1) {
    if (!isValidIdentifier(s)) {
      throw new Error(`Invalid option name "${s}".`)
    }
    return { kind: 'option', name: s, requiredValue: false }
  }
  const name = s.slice(0, eqIdx).trim()
  const def = s.slice(eqIdx + 1)
  if (!isValidIdentifier(name)) {
    throw new Error(`Invalid option name "${name}".`)
  }
  // If '=' appears, treat as requiring a value (even if default is empty string).
  return def.length > 0
    ? { kind: 'option', name, requiredValue: true, defaultValue: def }
    : { kind: 'option', name, requiredValue: true, defaultValue: '' }
}

function parseArgumentBody(body: string): ParsedSignatureArgument {
  // Examples:
  // user
  // user?
  // user*
  // user?* (not typical; treat ? and * independently)
  let s = body.trim()
  let required = true
  let variadic = false

  if (s.endsWith('*')) {
    variadic = true
    s = s.slice(0, -1)
  }
  if (s.endsWith('?')) {
    required = false
    s = s.slice(0, -1)
  }
  const name = s.trim()
  if (!isValidIdentifier(name)) {
    throw new Error(`Invalid argument name "${name}".`)
  }
  return { kind: 'argument', name, required, variadic }
}

/**
 * Structured CLI input for Atlex commands.
 */
export class CommandInput {
  readonly #signature: ParsedSignature
  readonly #args: Record<string, string | string[] | undefined>
  readonly #options: Record<string, string | boolean | undefined>

  private constructor(signature: ParsedSignature, parsed: ArgvParseResult) {
    this.#signature = signature
    this.#args = parsed.args
    this.#options = parsed.options
  }

  /**
   * Parse a command signature string (options and arguments).
   *
   * Examples:
   * - "inspire"
   * - "mail:send {user} {--queue=default}"
   */
  public static parseSignature(signature: string): ParsedSignature {
    const trimmed = signature.trim()
    if (trimmed.length === 0) throw new Error('Command signature cannot be empty.')

    const parts = trimmed.split(/\s+/g)
    const name = parts[0]?.trim() ?? ''
    if (name.length === 0) throw new Error('Command signature must start with a name.')

    const tokens: ParsedSignatureToken[] = []
    for (const p of parts.slice(1)) {
      const raw = stripBraces(p)
      if (raw.length === 0) continue
      if (raw.startsWith('--')) {
        tokens.push(parseOptionBody(raw))
      } else {
        tokens.push(parseArgumentBody(raw))
      }
    }

    return { name, tokens }
  }

  /**
   * Create input from raw argv (excluding `node` + script path).
   *
   * @param signature - Command signature definition.
   * @param argv - Raw argv array (e.g. process.argv.slice(2)).
   * @param commandNameOverride - When the command name is already known/resolved.
   */
  public static fromArgv(
    signature: ParsedSignature,
    argv: readonly string[],
    commandNameOverride?: string,
  ): CommandInput {
    const name = commandNameOverride ?? argv[0] ?? ''
    const args: string[] = argv.slice(1)
    const parsed = CommandInput.parseArgv(signature, args)
    return new CommandInput({ ...signature, name }, parsed)
  }

  /**
   * Create input from an args object (programmatic invocation).
   */
  public static fromObject(
    signature: ParsedSignature,
    args?: Record<string, unknown>,
  ): CommandInput {
    const result: ArgvParseResult = { args: {}, options: {} }
    const obj = args ?? {}
    for (const token of signature.tokens) {
      if (token.kind === 'argument') {
        const v = obj[token.name]
        if (v === undefined || v === null) {
          result.args[token.name] = undefined
        } else if (typeof v === 'string') {
          result.args[token.name] = v
        } else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
          result.args[token.name] = v
        } else {
          throw new Error(`Argument "${token.name}" must be a string (or string[] for variadic).`)
        }
      } else {
        const v = obj[token.name]
        if (v === undefined || v === null) {
          result.options[token.name] = token.defaultValue ?? undefined
        } else if (typeof v === 'boolean') {
          result.options[token.name] = v
        } else if (typeof v === 'string') {
          result.options[token.name] = v
        } else {
          throw new Error(`Option "${token.name}" must be boolean or string.`)
        }
      }
    }
    return new CommandInput(signature, result)
  }

  private static parseArgv(signature: ParsedSignature, argv: readonly string[]): ArgvParseResult {
    const argDefs = signature.tokens.filter(
      (t): t is ParsedSignatureArgument => t.kind === 'argument',
    )
    const optDefs = signature.tokens.filter((t): t is ParsedSignatureOption => t.kind === 'option')

    const options: Record<string, string | boolean | undefined> = {}
    const positionals: string[] = []

    for (let i = 0; i < argv.length; i += 1) {
      const cur = argv[i] ?? ''
      if (cur.startsWith('--')) {
        const eq = cur.indexOf('=')
        const name = (eq === -1 ? cur.slice(2) : cur.slice(2, eq)).trim()
        if (name.length === 0 || !isValidIdentifier(name)) {
          throw new Error(`Invalid option "${cur}".`)
        }
        const def = optDefs.find((d) => d.name === name)
        if (!def) {
          // Unknown option: still capture as boolean true (some CLIs accept extra flags).
          options[name] = eq === -1 ? true : cur.slice(eq + 1)
          continue
        }
        if (eq !== -1) {
          options[name] = cur.slice(eq + 1)
          continue
        }
        if (def.requiredValue) {
          const next = argv[i + 1]
          if (next === undefined || next.startsWith('--')) {
            options[name] = def.defaultValue ?? ''
          } else {
            options[name] = next
            i += 1
          }
          continue
        }
        options[name] = true
        continue
      }
      positionals.push(cur)
    }

    const args: Record<string, string | string[] | undefined> = {}
    let posIndex = 0
    for (const def of argDefs) {
      if (def.variadic) {
        const rest = positionals.slice(posIndex)
        if (rest.length === 0) {
          args[def.name] = def.required ? [] : undefined
        } else {
          args[def.name] = rest
        }
        posIndex = positionals.length
        continue
      }

      const val = positionals[posIndex]
      if (val === undefined) {
        args[def.name] = def.required ? undefined : undefined
      } else {
        args[def.name] = val
        posIndex += 1
      }
    }

    // Apply defaults for options.
    for (const o of optDefs) {
      if (options[o.name] === undefined && o.defaultValue !== undefined) {
        options[o.name] = o.defaultValue
      }
    }

    return { args, options }
  }

  /**
   * Get an argument by name.
   */
  public argument(name: string): string | undefined {
    const v = this.#args[name]
    if (typeof v === 'string') return v
    return undefined
  }

  /**
   * Get a variadic argument by name.
   */
  public arguments(name: string): string[] {
    const v = this.#args[name]
    if (Array.isArray(v)) return [...v]
    if (typeof v === 'string') return [v]
    return []
  }

  /**
   * Get an option by name.
   */
  public option(name: string): string | boolean | undefined {
    return this.#options[name]
  }

  /**
   * @returns Parsed signature.
   */
  public signature(): ParsedSignature {
    return this.#signature
  }
}
