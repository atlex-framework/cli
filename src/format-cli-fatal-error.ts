/**
 * Formats an unexpected CLI failure for stderr — message only, no stack traces.
 *
 * @param err - Thrown value from Commander actions or Node APIs.
 * @returns Single- or multi-line message suitable for printing.
 */
export function formatCliFatalErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code
    if (code === 'ECONNREFUSED') {
      const e = err as NodeJS.ErrnoException & { address?: unknown; port?: unknown }
      const dest =
        typeof e.address === 'string' && typeof e.port === 'number'
          ? `${e.address}:${e.port}`
          : 'remote host'
      return [
        '🚫 Connection refused',
        '',
        `Could not open a TCP connection to ${dest}.`,
        'If this is your database, ensure the server is running and matches your `.env` settings.',
        '',
        'Verify with: `atlex migrate:status`',
      ].join('\n')
    }
  }

  if (err instanceof Error) {
    return err.message
  }

  return String(err)
}

/**
 * Writes a human-readable fatal error line(s) to stderr (no stack trace).
 *
 * @param err - Thrown value.
 * @param stream - Destination stream (defaults to `process.stderr`).
 */
export function writeCliFatalError(
  err: unknown,
  stream: NodeJS.WritableStream = process.stderr,
): void {
  stream.write(`${formatCliFatalErrorMessage(err)}\n`)
}
