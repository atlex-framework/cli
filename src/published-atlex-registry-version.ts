import { readCliPackageVersion } from './cli-package-version.js'

/**
 * Semver used for `@atlex/*` dependencies in scaffolded apps when using
 * **registry** mode (`atlex new` from a global install, `@atlex/create-atlex-app`).
 *
 * Derived from the installed CLI's own `package.json` so it stays in sync
 * automatically — no manual update needed on each release.
 */
export const PUBLISHED_ATLEX_PACKAGE_VERSION: string = readCliPackageVersion()
