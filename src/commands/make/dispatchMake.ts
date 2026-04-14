import process from 'node:process'

import { AtlexCliError } from '../../errors/AtlexCliError.js'

import { type MakeKind, type RunMakeOptions, runMakeCommand } from './runMakeCommand.js'

/**
 * Run a generator and exit cleanly on {@link AtlexCliError}.
 *
 * @param kind - Generator kind.
 * @param rawName - CLI name argument.
 * @param force - Overwrite when true.
 * @param makeOptions - Extra generator options (e.g. `withMigration` for models).
 */
export async function dispatchMake(
  kind: MakeKind,
  rawName: string,
  force: boolean,
  makeOptions?: RunMakeOptions,
): Promise<void> {
  try {
    await runMakeCommand(kind, rawName, force, makeOptions ?? {})
  } catch (err) {
    if (err instanceof AtlexCliError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}
