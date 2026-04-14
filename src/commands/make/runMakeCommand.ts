import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AtlexCliError } from '../../errors/AtlexCliError.js'
import { resolveProjectCwd } from '../../projectCwd.js'
import { joinMakeOutputRelativePath, parseQualifiedMakeName } from '../../utils/makePath.js'
import {
  createTableMigrationNameForModel,
  formatMigrationTimestamp,
  pluralSnakeTableFromModelClass,
  stripTrailingSuffix,
  toPascalCase,
  toScreamingSnakeCase,
  toSnakeCase,
} from '../../utils/naming.js'
import {
  inferTableFromCreateMigration,
  resolveAppSourceExtension,
} from '../../utils/projectLanguage.js'

export type MakeKind =
  | 'controller'
  | 'command'
  | 'model'
  | 'migration'
  | 'middleware'
  | 'request'
  | 'resource'
  | 'collection'
  | 'service'
  | 'provider'
  | 'job'
  | 'mail'
  | 'event'
  | 'listener'
  | 'policy'
  | 'guard'
  | 'seeder'
  | 'factory'
  | 'config'
  | 'notification'

export interface ResolvedMakeSpec {
  className: string
  fileBase: string
  relativePath: string
  stub: string
  timestamp: string
  /** Present when migration name matches `create_*_table`. */
  migrationTable?: string
}

export interface RunMakeOptions {
  /** When true (make:model -m), also create the matching `create_*_table` migration. */
  withMigration?: boolean
  /** When true (`make:controller --api`), emit REST-style resource action stubs. */
  api?: boolean
  /** When true (`make:mail --markdown`), generate a `.md` view instead of `.html`. */
  markdown?: boolean
  /** When true (`make:event --broadcast`), generate a broadcastable event scaffold. */
  broadcast?: boolean
  /** When provided (`make:listener --event=UserRegistered`), import/wire the event. */
  event?: string
  /** When true (`make:listener --queued`), implement ShouldQueue + marker. */
  queued?: boolean
}

/**
 * Resolve the directory containing `.stub` templates (copied next to `dist/` on build).
 */
export function resolveStubsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../../stubs')
}

function assertNonEmptyName(raw: string, label: string): void {
  if (raw.trim().length === 0) {
    throw new AtlexCliError('E_INVALID_NAME', `Missing ${label}.`)
  }
}

function replaceStubTokens(content: string, tokens: Record<string, string>): string {
  let out = content
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{{${key}}}`).join(value)
  }
  if (/\{\{[A-Za-z]+\}\}/.test(out)) {
    throw new AtlexCliError(
      'E_STUB_TOKEN',
      'Stub still contains unreplaced {{tokens}} after generation.',
    )
  }
  return out
}

function stubFile(stubBase: string, ext: 'ts' | 'js'): string {
  return `${stubBase}.${ext}.stub`
}

function toKebabCaseFromPascalCase(input: string): string {
  // `WelcomeMail` -> `welcome-mail`, `Reset2FAMail` -> `reset2fa-mail`
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z0-9]+)/g, '$1-$2')
    .toLowerCase()
}

function buildClassBackedSpec(
  raw: string,
  options: { suffix: string; stubBase: string; relativeDir: string; ext: 'ts' | 'js' },
): Omit<ResolvedMakeSpec, 'timestamp' | 'migrationTable'> {
  assertNonEmptyName(raw, 'name')
  const { subdirectories, leafRaw } = parseQualifiedMakeName(raw)
  const pascal = toPascalCase(leafRaw)
  if (pascal.length === 0) {
    throw new AtlexCliError('E_INVALID_NAME', 'Name must contain at least one letter or number.')
  }
  const root = stripTrailingSuffix(pascal, options.suffix)
  if (root.length === 0) {
    throw new AtlexCliError(
      'E_INVALID_NAME',
      `Name is invalid after removing the "${options.suffix}" suffix.`,
    )
  }
  const className = options.suffix.length > 0 ? `${root}${options.suffix}` : root
  const fileBase = className
  const fileName = `${fileBase}.${options.ext}`
  const relativePath = joinMakeOutputRelativePath(options.relativeDir, subdirectories, fileName)
  return {
    className,
    fileBase,
    relativePath,
    stub: stubFile(options.stubBase, options.ext),
  }
}

function buildModelSpec(
  raw: string,
  ext: 'ts' | 'js',
): Omit<ResolvedMakeSpec, 'timestamp' | 'migrationTable'> {
  assertNonEmptyName(raw, 'name')
  const { subdirectories, leafRaw } = parseQualifiedMakeName(raw)
  const className = toPascalCase(leafRaw)
  if (className.length === 0) {
    throw new AtlexCliError('E_INVALID_NAME', 'Name must contain at least one letter or number.')
  }
  const fileBase = className
  const fileName = `${fileBase}.${ext}`
  const relativePath = joinMakeOutputRelativePath(
    path.join('app', 'Models'),
    subdirectories,
    fileName,
  )
  return {
    className,
    fileBase,
    relativePath,
    stub: stubFile('model', ext),
  }
}

function buildConfigSpec(raw: string, ext: 'ts' | 'js'): Omit<ResolvedMakeSpec, 'migrationTable'> {
  assertNonEmptyName(raw, 'name')
  const trimmed = raw.trim()
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    throw new AtlexCliError(
      'E_INVALID_NAME',
      'Config name must contain only letters, digits, and underscores.',
    )
  }
  return {
    className: trimmed,
    fileBase: trimmed,
    relativePath: path.join('config', `${trimmed}.${ext}`),
    stub: stubFile('config', ext),
    timestamp: '',
  }
}

function buildMigrationSpec(raw: string, ext: 'ts' | 'js'): ResolvedMakeSpec {
  assertNonEmptyName(raw, 'migration name')
  const trimmed = raw.trim()
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new AtlexCliError(
      'E_INVALID_NAME',
      'Migration names cannot contain path separators — use a snake_case name only (e.g. create_users_table).',
    )
  }
  const snake = toSnakeCase(trimmed)
  if (snake.length === 0) {
    throw new AtlexCliError(
      'E_INVALID_NAME',
      'Migration name must contain at least one letter or number.',
    )
  }
  if (!/^[a-z0-9_]+$/.test(snake)) {
    throw new AtlexCliError(
      'E_INVALID_NAME',
      'Migration name must be snake_case (letters, digits, underscores) after normalization.',
    )
  }
  const timestamp = formatMigrationTimestamp()
  const fileBase = `${timestamp}_${snake}`
  const className = toPascalCase(snake)
  const table = inferTableFromCreateMigration(snake)
  const stubBase = table !== null ? 'migration.create' : 'migration.blank'
  return {
    className,
    fileBase,
    relativePath: path.join('database', 'migrations', `${fileBase}.${ext}`),
    stub: stubFile(stubBase, ext),
    timestamp,
    ...(table !== null ? { migrationTable: table } : {}),
  }
}

function resolveSpec(
  kind: MakeKind,
  raw: string,
  ext: 'ts' | 'js',
  options: RunMakeOptions = {},
): ResolvedMakeSpec {
  switch (kind) {
    case 'controller': {
      const stubBase = options.api === true ? 'controller.api' : 'controller'
      const b = buildClassBackedSpec(raw, {
        suffix: 'Controller',
        stubBase,
        relativeDir: path.join('app', 'Http', 'Controllers'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'command': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Command',
        stubBase: 'command',
        relativeDir: path.join('app', 'Console', 'Commands'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'model': {
      const b = buildModelSpec(raw, ext)
      return { ...b, timestamp: '' }
    }
    case 'migration': {
      return buildMigrationSpec(raw, ext)
    }
    case 'middleware': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Middleware',
        stubBase: 'middleware',
        relativeDir: path.join('app', 'Http', 'Middleware'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'request': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Request',
        stubBase: 'request',
        relativeDir: path.join('app', 'Http', 'Requests'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'resource': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Resource',
        stubBase: 'resource',
        relativeDir: path.join('app', 'Http', 'Resources'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'collection': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Collection',
        stubBase: 'collection',
        relativeDir: path.join('app', 'Http', 'Resources'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'service': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Service',
        stubBase: 'service',
        relativeDir: path.join('app', 'Services'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'provider': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Provider',
        stubBase: 'provider',
        relativeDir: path.join('app', 'Providers'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'job': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Job',
        stubBase: 'job',
        relativeDir: path.join('app', 'Jobs'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'mail': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Mail',
        stubBase: 'mail',
        relativeDir: path.join('app', 'Mail'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'event': {
      assertNonEmptyName(raw, 'name')
      const { subdirectories, leafRaw } = parseQualifiedMakeName(raw)
      const className = toPascalCase(leafRaw)
      if (className.length === 0) {
        throw new AtlexCliError(
          'E_INVALID_NAME',
          'Name must contain at least one letter or number.',
        )
      }
      const fileBase = className
      const fileName = `${fileBase}.${ext}`
      const relativePath = joinMakeOutputRelativePath(
        path.join('app', 'Events'),
        subdirectories,
        fileName,
      )
      const stubBase = options.broadcast === true ? 'event.broadcast' : 'event'
      return { className, fileBase, relativePath, stub: stubFile(stubBase, ext), timestamp: '' }
    }
    case 'listener': {
      const b = buildClassBackedSpec(raw, {
        suffix: '',
        stubBase: options.queued === true ? 'listener.queued' : 'listener',
        relativeDir: path.join('app', 'Listeners'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'policy': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Policy',
        stubBase: 'policy',
        relativeDir: path.join('app', 'Policies'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'guard': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Guard',
        stubBase: 'guard',
        relativeDir: path.join('app', 'Guards'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'seeder': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Seeder',
        stubBase: 'seeder',
        relativeDir: path.join('database', 'seeders'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'factory': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Factory',
        stubBase: 'factory',
        relativeDir: path.join('database', 'factories'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    case 'config': {
      return buildConfigSpec(raw, ext)
    }
    case 'notification': {
      const b = buildClassBackedSpec(raw, {
        suffix: 'Notification',
        stubBase: 'notification',
        relativeDir: path.join('app', 'Notifications'),
        ext,
      })
      return { ...b, timestamp: '' }
    }
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

async function ensureBaseHttpController(cwd: string, ext: 'ts' | 'js'): Promise<void> {
  const relativePath = path.join('app', 'Http', 'Controllers', `Controller.${ext}`)
  const absolutePath = path.resolve(cwd, relativePath)
  if (existsSync(absolutePath)) {
    return
  }

  const stubsDir = resolveStubsDir()
  const stubPath = path.join(stubsDir, stubFile('http.controller', ext))
  if (!existsSync(stubPath)) {
    throw new AtlexCliError(
      'E_STUB_MISSING',
      `Stub not found: http.controller.${ext}.stub (looked in ${stubsDir}).`,
    )
  }

  const body = await readFile(stubPath, 'utf8')
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, body, 'utf8')
  console.log(`Created ${relativePath}`)
}

async function writeGeneratedFile(
  cwd: string,
  spec: ResolvedMakeSpec,
  kind: MakeKind,
  force: boolean,
  options: RunMakeOptions = {},
): Promise<void> {
  const absolutePath = path.resolve(cwd, spec.relativePath)

  if (existsSync(absolutePath) && !force) {
    throw new AtlexCliError(
      'E_FILE_EXISTS',
      `File already exists: ${spec.relativePath}\nUse --force to overwrite.`,
    )
  }

  const stubsDir = resolveStubsDir()
  const stubPath = path.join(stubsDir, spec.stub)
  if (!existsSync(stubPath)) {
    throw new AtlexCliError(
      'E_STUB_MISSING',
      `Stub not found: ${spec.stub} (looked in ${stubsDir}). Rebuild the CLI so stubs are copied to dist/stubs.`,
    )
  }

  const stubContent = await readFile(stubPath, 'utf8')
  const tokens: Record<string, string> = {
    ClassName: spec.className,
    FileName: spec.fileBase,
    Timestamp: spec.timestamp,
  }
  if (kind === 'command') {
    tokens.commandSignature = 'example:command'
    tokens.commandDescription = 'Describe the command'
  }
  if (kind === 'model') {
    tokens.TableName = pluralSnakeTableFromModelClass(spec.className)
  }
  if (kind === 'migration' && spec.migrationTable !== undefined) {
    tokens.TableName = spec.migrationTable
  }
  if (kind === 'factory') {
    const modelName = stripTrailingSuffix(spec.className, 'Factory')
    tokens.ModelName = modelName
    tokens.modelTable = pluralSnakeTableFromModelClass(modelName)
  }
  if (kind === 'mail') {
    tokens.ViewName = toKebabCaseFromPascalCase(spec.fileBase)
  }
  if (kind === 'config') {
    tokens.EnvPrefix = toScreamingSnakeCase(spec.fileBase)
  }
  if (kind === 'listener') {
    tokens.EventClass =
      typeof options.event === 'string' && options.event.trim().length > 0
        ? toPascalCase(options.event.trim())
        : 'Event'
  }
  const body = replaceStubTokens(stubContent, tokens)

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, body, 'utf8')
  console.log(`Created ${spec.relativePath}`)
}

async function writeGeneratedPlainFile(
  cwd: string,
  relativePath: string,
  stubName: string,
  force: boolean,
): Promise<void> {
  const absolutePath = path.resolve(cwd, relativePath)

  if (existsSync(absolutePath) && !force) {
    throw new AtlexCliError(
      'E_FILE_EXISTS',
      `File already exists: ${relativePath}\nUse --force to overwrite.`,
    )
  }

  const stubsDir = resolveStubsDir()
  const stubPath = path.join(stubsDir, stubName)
  if (!existsSync(stubPath)) {
    throw new AtlexCliError(
      'E_STUB_MISSING',
      `Stub not found: ${stubName} (looked in ${stubsDir}). Rebuild the CLI so stubs are copied to dist/stubs.`,
    )
  }

  const body = await readFile(stubPath, 'utf8')
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, body, 'utf8')
  console.log(`Created ${relativePath}`)
}

/**
 * Generate a framework file from a stub template.
 *
 * @param kind - Generator kind (determines path + naming rules).
 * @param rawName - User-provided name argument.
 * @param force - When true, overwrite an existing file.
 * @param options - Extra options (`withMigration` for `make:model`).
 * @throws AtlexCliError - User-facing failures (missing files, collisions, invalid names).
 */
export async function runMakeCommand(
  kind: MakeKind,
  rawName: string,
  force: boolean,
  options: RunMakeOptions = {},
): Promise<void> {
  const cwd = resolveProjectCwd()
  const ext = resolveAppSourceExtension(cwd)
  if (kind === 'controller') {
    await ensureBaseHttpController(cwd, ext)
  }
  const spec = resolveSpec(kind, rawName, ext, options)
  await writeGeneratedFile(cwd, spec, kind, force, options)

  if (kind === 'mail') {
    const viewBase = toKebabCaseFromPascalCase(spec.fileBase)
    const viewRelativeDir = path.join('resources', 'views', 'emails')
    const viewExt = options.markdown === true ? 'md' : 'html'
    const viewRelativePath = path.join(viewRelativeDir, `${viewBase}.${viewExt}`)
    const viewStub = options.markdown === true ? 'mail.view.md.stub' : 'mail.view.html.stub'
    await writeGeneratedPlainFile(cwd, viewRelativePath, viewStub, force)
  }

  if (kind === 'listener' && typeof options.event === 'string' && options.event.trim().length > 0) {
    // Best-effort: provide EventClass token used by stubs.
    // We can't validate existence here without loading app code.
  }

  if (kind === 'model' && options.withMigration === true) {
    const migrationStem = createTableMigrationNameForModel(spec.className)
    await runMakeCommand('migration', migrationStem, force, {})
  }
}

/**
 * Generate the standard `notifications` table migration (used by `notification:table`).
 *
 * @param force - Overwrite when true.
 */
export async function generateNotificationsTableMigration(force: boolean): Promise<void> {
  const cwd = resolveProjectCwd()
  const ext = resolveAppSourceExtension(cwd)
  const timestamp = formatMigrationTimestamp()
  const snake = 'create_notifications_table'
  const fileBase = `${timestamp}_${snake}`
  const spec: ResolvedMakeSpec = {
    className: toPascalCase(snake),
    fileBase,
    relativePath: path.join('database', 'migrations', `${fileBase}.${ext}`),
    stub: stubFile('migration.notifications', ext),
    timestamp,
  }
  await writeGeneratedFile(cwd, spec, 'migration', force, {})
}
