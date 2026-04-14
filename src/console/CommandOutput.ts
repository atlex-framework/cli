export type OutputLevel = 'info' | 'warn' | 'error' | 'debug'

export interface CommandOutputWriter {
  write(chunk: string): void
}

export interface CommandOutputOptions {
  readonly stdout?: CommandOutputWriter
  readonly stderr?: CommandOutputWriter
}

/**
 * Buffered console output with optional streaming to stdout/stderr.
 */
export class CommandOutput {
  readonly #stdout: CommandOutputWriter
  readonly #stderr: CommandOutputWriter

  #buffer = ''

  public constructor(options: CommandOutputOptions = {}) {
    this.#stdout = options.stdout ?? { write: (chunk) => process.stdout.write(chunk) }
    this.#stderr = options.stderr ?? { write: (chunk) => process.stderr.write(chunk) }
  }

  /**
   * Write a line to stdout (and buffer it).
   */
  public line(message = ''): void {
    this.#buffer += `${message}\n`
    this.#stdout.write(`${message}\n`)
  }

  /**
   * Write a line to stderr (and buffer it).
   */
  public lineError(message = ''): void {
    this.#buffer += `${message}\n`
    this.#stderr.write(`${message}\n`)
  }

  /**
   * Write a structured message (info/warn/error/debug).
   */
  public message(level: OutputLevel, message: string): void {
    if (level === 'error') {
      this.lineError(message)
      return
    }
    this.line(message)
  }

  /**
   * Get buffered output since this instance was created.
   */
  public toString(): string {
    return this.#buffer
  }
}
