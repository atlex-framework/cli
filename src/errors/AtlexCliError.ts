/**
 * Typed CLI failure for user-facing messages (no stack traces in normal flows).
 */
export class AtlexCliError extends Error {
  public readonly code: string

  /**
   * @param code - Stable machine-readable code (e.g. `E_FILE_EXISTS`).
   * @param message - Human-readable message shown to the user.
   */
  public constructor(code: string, message: string) {
    super(message)
    this.name = 'AtlexCliError'
    this.code = code
  }
}
