import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { Encrypter } from '@atlex/encryption'
import { cancel, confirm, intro, isCancel, outro, select, spinner } from '@clack/prompts'
import { Command } from 'commander'
import { execa } from 'execa'
import fs from 'fs-extra'

import { resolveProjectCwd } from '../projectCwd.js'
import { PUBLISHED_ATLEX_PACKAGE_VERSION } from '../published-atlex-registry-version.js'

type Language = 'ts' | 'js'

/** Scaffold always includes auth + queue; DB driver comes from `DB_DRIVER` / `.env`. */
interface NewOptions {
  language: Language
}

type DependencyMode = 'workspace' | 'file' | 'registry'

/** Docker build: from app dir only, or from repo root when using `file:../../atlex/...` deps. */
type DockerBuildYaml =
  | { mode: 'app' }
  | { mode: 'repo'; context: string; dockerfile: string; appPath: string }

function computeDockerBuild(
  depMode: DependencyMode,
  targetDir: string,
  atlexRoot: string,
): DockerBuildYaml {
  if (depMode !== 'file') {
    return { mode: 'app' }
  }
  const repoRoot = path.resolve(atlexRoot, '..')
  const context = posixify(path.relative(targetDir, repoRoot))
  const dockerfile = posixify(path.relative(repoRoot, path.join(targetDir, 'Dockerfile')))
  let appPath = posixify(path.relative(repoRoot, targetDir))
  if (appPath === '' || appPath === '.') {
    appPath = '.'
  }
  return { mode: 'repo', context, dockerfile, appPath }
}

function dockerAppBuildYaml(b: DockerBuildYaml): string {
  if (b.mode === 'app') {
    return '    build: .\n'
  }
  return `    build:
      context: ${b.context}
      dockerfile: ${b.dockerfile}
      args:
        APP_PATH: ${b.appPath}
`
}

type AtlexPackageName =
  | '@atlex/core'
  | '@atlex/orm'
  | '@atlex/testing'
  | '@atlex/auth'
  | '@atlex/queue'
  | '@atlex/cli'
  | '@atlex/config'
  | '@atlex/log'
  | '@atlex/storage'

/**
 * Builds the Atlex banner string for `atlex new`.
 *
 * Uses ANSI true-color escape codes when stdout is a TTY (brand violet #7c3aed).
 * Falls back to plain text in non-interactive environments (CI, pipes).
 *
 * Layout mirrors the logo SVG: a triangle "A" made from ╱╲ diagonals with a
 * bottom crossbar, next to the wordmark and tagline.
 */
function buildBanner(): string {
  const tty = process.stdout.isTTY === true

  // Brand palette (degrades to identity when not a TTY)
  const violet = (s: string): string => (tty ? `\x1b[38;2;124;58;237m${s}\x1b[0m` : s) // #7c3aed — primary
  const brand = (s: string): string => (tty ? `\x1b[1m\x1b[38;2;167;139;250m${s}\x1b[0m` : s) // bold #a78bfa — name
  const muted = (s: string): string => (tty ? `\x1b[38;2;148;130;186m${s}\x1b[0m` : s) // muted purple-grey — tagline

  // Triangle "A" icon — matches the ╱╲ shape in the brand logo SVG
  const r1 = `    ${violet('╱╲')}`
  const r2 = `   ${violet('╱  ╲')}   ${brand('atlex')}`
  const r3 = `  ${violet('╱────╲')}  ${muted('TypeScript Framework for Node.js')}`

  return ['', r1, r2, r3, ''].join('\n')
}

function ensureNotCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Cancelled.')
    process.exit(1)
  }
  return value
}

function formatSummary(targetDir: string, opts: NewOptions): string {
  const lines: string[] = []
  lines.push(`Directory: ${targetDir}`)
  lines.push(`Language: ${opts.language === 'ts' ? 'TypeScript' : 'JavaScript'}`)
  return lines.join('\n')
}

function dockerAuthEnvYaml(auth: boolean): string {
  if (!auth) return ''
  return `      JWT_SECRET: \${JWT_SECRET:-change-me}
      JWT_EXPIRES_IN: \${JWT_EXPIRES_IN:-1h}
`
}

function dockerAppDevVolumesAndCommand(dockerBuild: DockerBuildYaml): string {
  const cmd = '["npm", "run", "dev"]'
  if (dockerBuild.mode === 'app') {
    return `    volumes:
      - .:/app
      - /app/node_modules
    command: ${cmd}
`
  }
  const { appPath } = dockerBuild
  const mountPath = appPath === '.' ? '/workspace' : `/workspace/${appPath}`
  const modulesPath =
    appPath === '.' ? '/workspace/node_modules' : `/workspace/${appPath}/node_modules`
  return `    volumes:
      - .:${mountPath}
      - ${modulesPath}
    command: ${cmd}
`
}

/**
 * Single `docker-compose.yml`: PostgreSQL + app with bind-mount dev workflow.
 * For MySQL/SQLite run the app on the host (or adjust compose); set `DB_DRIVER` in `.env`.
 */
function dockerComposeYaml(auth: boolean, dockerBuild: DockerBuildYaml): string {
  const authEnv = dockerAuthEnvYaml(auth)
  const buildYaml = dockerAppBuildYaml(dockerBuild)
  const devAttach = dockerAppDevVolumesAndCommand(dockerBuild)
  const buildHint =
    dockerBuild.mode === 'repo'
      ? '# Build context is the repo root (see Dockerfile) so local `file:../../atlex/...` deps resolve.\n'
      : ''
  return `${buildHint}# PostgreSQL + app (live reload: bind mount + \`npm run dev\`).
# Start DB only: docker compose up -d db
# App + DB:      docker compose up --build
# In-container DB host is \`db\`; on the host use 127.0.0.1 and \`POSTGRES_PORT\` from compose.

services:
  app:
${buildYaml}    restart: unless-stopped
    ports:
      - "\${APP_PORT:-3000}:3000"
    environment:
      NODE_ENV: development
      PORT: "3000"
      HOST: "0.0.0.0"
      DB_DRIVER: pg
      DB_HOST: db
      DB_PORT: "5432"
      DB_DATABASE: atlex
      DB_SCHEMA: \${DB_SCHEMA:-public}
      DB_USERNAME: postgres
      DB_PASSWORD: postgres
${authEnv}    depends_on:
      db:
        condition: service_healthy
${devAttach}
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: atlex
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d atlex"]
      interval: 3s
      timeout: 5s
      retries: 15

volumes:
  postgres_data:
`
}

function dockerIgnoreSource(): string {
  return [
    'node_modules',
    'dist',
    '.git',
    '.env',
    '.env.*',
    '!.env.example',
    '*.md',
    '.DS_Store',
    'npm-debug.log*',
    'pnpm-debug.log*',
    'database.sqlite',
    '',
  ].join('\n')
}

function repoRootDockerignoreSource(): string {
  return [
    '# Slim context when building an app with file:../../atlex/... deps (docker compose context = repo root)',
    '**/node_modules',
    '**/.git',
    '**/dist',
    '**/*.tsbuildinfo',
    '.env',
    '.env.*',
    '!.env.example',
    '**/.DS_Store',
    'npm-debug.log*',
    'pnpm-debug.log*',
    '*.md',
    '',
  ].join('\n')
}

function dockerfileSource(language: Language, dockerBuild: DockerBuildYaml): string {
  if (dockerBuild.mode === 'repo') {
    const header = `# syntax=docker/dockerfile:1
# docker-compose uses build.context = repo root (parent of atlex/) and args.APP_PATH = path to this app.

`
    if (language === 'ts') {
      return (
        header +
        `FROM node:22-bookworm-slim
ARG APP_PATH=.

WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \\
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY atlex /workspace/atlex
WORKDIR /workspace/atlex
RUN find . -name '*.tsbuildinfo' -delete 2>/dev/null || true \\
  && printf '%s\\n' "allow-scripts=better-sqlite3" >> .npmrc \\
  && pnpm install --frozen-lockfile \\
  && pnpm exec tsc -b packages/core packages/orm packages/auth packages/queue \\
  && pnpm exec tsc -b cli \\
  && chmod +x /workspace/atlex/cli/dist/bin/atlex.js \\
  && ln -sf /workspace/atlex/cli/dist/bin/atlex.js /usr/local/bin/atlex

WORKDIR /workspace/\${APP_PATH}
COPY \${APP_PATH}/package.json \${APP_PATH}/pnpm-lock.yaml* \${APP_PATH}/package-lock.json* /workspace/\${APP_PATH}/
RUN printf '%s\\n' "allow-scripts=better-sqlite3" >> .npmrc \\
  && if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \\
  elif [ -f package-lock.json ]; then npm ci; \\
  else npm install; fi

COPY \${APP_PATH} /workspace/\${APP_PATH}/

RUN pnpm run build || npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
`
      )
    }

    return (
      header +
      `FROM node:22-bookworm-slim
ARG APP_PATH=.

WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \\
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY atlex /workspace/atlex
WORKDIR /workspace/atlex
RUN find . -name '*.tsbuildinfo' -delete 2>/dev/null || true \\
  && printf '%s\\n' "allow-scripts=better-sqlite3" >> .npmrc \\
  && pnpm install --frozen-lockfile \\
  && pnpm exec tsc -b packages/core packages/orm packages/auth packages/queue \\
  && pnpm exec tsc -b cli \\
  && chmod +x /workspace/atlex/cli/dist/bin/atlex.js \\
  && ln -sf /workspace/atlex/cli/dist/bin/atlex.js /usr/local/bin/atlex

WORKDIR /workspace/\${APP_PATH}
COPY \${APP_PATH}/package.json \${APP_PATH}/pnpm-lock.yaml* \${APP_PATH}/package-lock.json* /workspace/\${APP_PATH}/
RUN printf '%s\\n' "allow-scripts=better-sqlite3" >> .npmrc \\
  && if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \\
  elif [ -f package-lock.json ]; then npm ci; \\
  else npm install; fi

COPY \${APP_PATH} /workspace/\${APP_PATH}/

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "main.js"]
`
    )
  }

  const header = `# syntax=docker/dockerfile:1
# Standalone install (registry dependencies). For monorepo file: deps use the template generated with file: mode.

`

  if (language === 'ts') {
    return (
      header +
      `FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \\
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY package.json pnpm-lock.yaml* package-lock.json* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \\
  elif [ -f package-lock.json ]; then npm ci; \\
  else npm install; fi

COPY . .
RUN pnpm run build || npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
`
    )
  }

  return (
    header +
    `FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \\
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY package.json pnpm-lock.yaml* package-lock.json* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \\
  elif [ -f package-lock.json ]; then npm ci; \\
  else npm install; fi

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "main.js"]
`
  )
}

function databaseConfigSource(language: Language): string {
  if (language === 'ts') {
    return `import type { DatabaseConfig as OrmDatabaseConfig } from "@atlex/orm";\n\n/**\n * Database driver from \`DB_DRIVER\`: \`pg\` (default), \`mysql2\`, \`better-sqlite3\` (alias: \`sqlite\`).\n * Connection fields come from environment — see \`.env.example\`.\n */\nexport function getOrmDatabaseConfig(): OrmDatabaseConfig {\n  const raw = (process.env['DB_DRIVER'] ?? 'pg').toLowerCase().trim();\n  const driver =\n    raw === 'sqlite' || raw === 'better-sqlite3'\n      ? 'better-sqlite3'\n      : raw === 'mysql' || raw === 'mysql2'\n        ? 'mysql2'\n        : 'pg';\n\n  if (driver === 'better-sqlite3') {\n    return {\n      driver: 'better-sqlite3',\n      database: process.env['DATABASE_URL'] ?? 'database.sqlite',\n    };\n  }\n\n  if (driver === 'mysql2') {\n    const password = process.env['DB_PASSWORD'];\n    return {\n      driver: 'mysql2',\n      host: process.env['DB_HOST'] ?? '127.0.0.1',\n      port: Number(process.env['DB_PORT'] ?? '3306'),\n      database: process.env['DB_NAME'] ?? 'atlex',\n      username: process.env['DB_USER'] ?? 'root',\n      ...(password !== undefined && password !== '' ? { password } : {}),\n      ...(process.env['DB_DEBUG'] === 'true' ? { debug: true } : {}),\n    };\n  }\n\n  const password = process.env['DB_PASSWORD'];\n  const schema = process.env['DB_SCHEMA']?.trim() || 'public';\n  return {\n    driver: 'pg',\n    host: process.env['DB_HOST'] ?? '127.0.0.1',\n    port: Number(process.env['DB_PORT'] ?? '5432'),\n    database: process.env['DB_DATABASE'] ?? 'atlex',\n    schema,\n    username: process.env['DB_USERNAME'] ?? 'postgres',\n    ...(password !== undefined && password !== '' ? { password } : {}),\n    ...(process.env['DB_DEBUG'] === 'true' ? { debug: true } : {}),\n  };\n}\n`
  }

  return `/**\n * Database driver from \`DB_DRIVER\`: \`pg\` (default), \`mysql2\`, \`better-sqlite3\` or \`sqlite\`.\n *\n * @returns {import("@atlex/orm").DatabaseConfig}\n */\nexport function getOrmDatabaseConfig() {\n  const raw = (process.env['DB_DRIVER'] ?? 'pg').toLowerCase().trim();\n  const driver =\n    raw === 'sqlite' || raw === 'better-sqlite3'\n      ? 'better-sqlite3'\n      : raw === 'mysql' || raw === 'mysql2'\n        ? 'mysql2'\n        : 'pg';\n\n  if (driver === 'better-sqlite3') {\n    return {\n      driver: 'better-sqlite3',\n      database: process.env['DATABASE_URL'] ?? 'database.sqlite',\n    };\n  }\n\n  if (driver === 'mysql2') {\n    const password = process.env['DB_PASSWORD'];\n    return {\n      driver: 'mysql2',\n      host: process.env['DB_HOST'] ?? '127.0.0.1',\n      port: Number(process.env['DB_PORT'] ?? '3306'),\n      database: process.env['DB_NAME'] ?? 'atlex',\n      username: process.env['DB_USER'] ?? 'root',\n      ...(password !== undefined && password !== '' ? { password } : {}),\n      ...(process.env['DB_DEBUG'] === 'true' ? { debug: true } : {}),\n    };\n  }\n\n  const password = process.env['DB_PASSWORD'];\n  const schema = process.env['DB_SCHEMA']?.trim() || 'public';\n  return {\n    driver: 'pg',\n    host: process.env['DB_HOST'] ?? '127.0.0.1',\n    port: Number(process.env['DB_PORT'] ?? '5432'),\n    database: process.env['DB_DATABASE'] ?? 'atlex',\n    schema,\n    username: process.env['DB_USERNAME'] ?? 'postgres',\n    ...(password !== undefined && password !== '' ? { password } : {}),\n    ...(process.env['DB_DEBUG'] === 'true' ? { debug: true } : {}),\n  };\n}\n`
}

function bootstrapDatabaseSource(language: Language): string {
  if (language === 'ts') {
    return `import { config } from \"dotenv\";\nimport path from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport { ConnectionRegistry } from \"@atlex/orm\";\nimport { getOrmDatabaseConfig } from \"../config/database.js\";\n\n/** Load .env from app root without using process.cwd() (avoids uv_cwd ENOENT when the shell cwd is invalid). */\nconst __dirname = path.dirname(fileURLToPath(import.meta.url));\nconfig({ path: path.resolve(__dirname, \"..\", \".env\") });\n\n/** Registers the default connection from config + .env (import side effect). */\nConnectionRegistry.instance().register(\"default\", getOrmDatabaseConfig());\n`
  }
  return `import { config } from \"dotenv\";\nimport path from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport { ConnectionRegistry } from \"@atlex/orm\";\nimport { getOrmDatabaseConfig } from \"../config/database.js\";\n\nconst __dirname = path.dirname(fileURLToPath(import.meta.url));\nconfig({ path: path.resolve(__dirname, \"..\", \".env\") });\n\nConnectionRegistry.instance().register(\"default\", getOrmDatabaseConfig());\n`
}

function authConfigSource(language: Language): string {
  if (language === 'ts') {
    return `export type AuthConfig = {\n  jwt: {\n    secret: string;\n    expiresIn: string;\n  };\n};\n\nconst auth: AuthConfig = {\n  jwt: {\n    secret: process.env['JWT_SECRET'] ?? \"change-me\",\n    expiresIn: process.env['JWT_EXPIRES_IN'] ?? \"1h\"\n  }\n};\n\nexport default auth;\n`
  }

  return `/** @typedef {{ jwt: { secret: string, expiresIn: string } }} AuthConfig */\n\n/** @type {AuthConfig} */\nconst auth = {\n  jwt: {\n    secret: process.env['JWT_SECRET'] ?? \"change-me\",\n    expiresIn: process.env['JWT_EXPIRES_IN'] ?? \"1h\"\n  }\n};\n\nexport default auth;\n`
}

function appConfigSource(language: Language, appName: string): string {
  const nameLiteral = JSON.stringify(appName)
  if (language === 'ts') {
    return `export type AppConfig = {\n  appName: string;\n  env: \"development\" | \"test\" | \"production\";\n  port: number;\n};\n\nconst app: AppConfig = {\n  appName: process.env['APP_NAME'] ?? ${nameLiteral},\n  env: (process.env['NODE_ENV'] as AppConfig[\"env\"]) ?? \"development\",\n  port: Number(process.env['PORT'] ?? \"3000\")\n};\n\nexport default app;\n`
  }

  return `/** @typedef {{ appName: string, env: "development" | "test" | "production", port: number }} AppConfig */\n\n/** @type {AppConfig} */\nconst app = {\n  appName: process.env['APP_NAME'] ?? ${nameLiteral},\n  env: process.env['NODE_ENV'] ?? \"development\",\n  port: Number(process.env['PORT'] ?? \"3000\")\n};\n\nexport default app;\n`
}

function routesWebSource(language: Language): string {
  if (language === 'ts') {
    return `import type { Request, Response } from \"express\";\nimport { Route } from \"@atlex/core\";\n\nRoute.get(\"/\", (_req: Request, res: Response) => {\n  res.json({ message: \"Welcome to Atlex\" });\n});\n`
  }

  return `import { Route } from \"@atlex/core\";\n\nRoute.get(\"/\", (_req, res) => {\n  res.json({ message: \"Welcome to Atlex\" });\n});\n`
}

function mainSource(language: Language): string {
  if (language === 'ts') {
    return `import \"./bootstrap/database.js\";\nimport { Application } from \"@atlex/core\";\nimport appConfig from \"./config/app.js\";\nimport \"./routes/web.js\";\n\nconst app = new Application();\n\napp.boot();\napp.listen(appConfig.port, () => {\n  // eslint-disable-next-line no-console\n  console.log(\"Atlex listening on port \" + appConfig.port);\n});\n`
  }

  return `import \"./bootstrap/database.js\";\nimport { Application } from \"@atlex/core\";\nimport appConfig from \"./config/app.js\";\nimport \"./routes/web.js\";\n\nconst app = new Application();\n\napp.boot();\napp.listen(appConfig.port, () => {\n  // eslint-disable-next-line no-console\n  console.log(\`Atlex listening on port \${appConfig.port}\`);\n});\n`
}

function envExampleSource(appKey: string): string {
  const lines: string[] = []
  lines.push(`APP_KEY=${appKey}`)
  lines.push('')
  lines.push('APP_NAME=My Atlex App')
  lines.push('NODE_ENV=development')
  lines.push('PORT=3000')
  lines.push('')
  lines.push('# Driver: pg | mysql2 | better-sqlite3 (or sqlite)')
  lines.push('DB_DRIVER=pg')
  lines.push('')
  lines.push('# --- PostgreSQL (DB_DRIVER=pg) ---')
  lines.push('# With docker compose: DB_HOST=db inside the app container; on host use 127.0.0.1')
  lines.push('DB_HOST=127.0.0.1')
  lines.push('DB_PORT=5432')
  lines.push('DB_DATABASE=atlex')
  lines.push('DB_SCHEMA=public')
  lines.push('DB_USERNAME=postgres')
  lines.push('DB_PASSWORD=postgres')
  lines.push('')
  lines.push('# --- MySQL (DB_DRIVER=mysql2) ---')
  lines.push('# DB_HOST=127.0.0.1')
  lines.push('# DB_PORT=3306')
  lines.push('# DB_USER=root')
  lines.push('# DB_PASSWORD=atlex')
  lines.push('# DB_NAME=atlex')
  lines.push('')
  lines.push('# --- SQLite (DB_DRIVER=better-sqlite3) ---')
  lines.push('# DATABASE_URL=database.sqlite')
  lines.push('')
  lines.push('JWT_SECRET=change-me')
  lines.push('JWT_EXPIRES_IN=1h')
  return `${lines.join('\n')}\n`
}

function scaffoldProjectReadmeSource(appName: string, language: Language): string {
  const isTs = language === 'ts'
  const buildLines = isTs ? 'pnpm run build\n' : ''
  return [
    `# ${appName}`,
    '',
    'Atlex application scaffolded with `@atlex/create-atlex-app` / `npm create @atlex/atlex-app` or `atlex new`.',
    '',
    '## Quick start',
    '',
    '```bash',
    'pnpm install',
    `${buildLines}pnpm dev`,
    '```',
    '',
    'Then open http://localhost:3000',
    '',
    '## CLI',
    '',
    '- **Development:** `pnpm dev`',
    `- **Production:** ${isTs ? '`pnpm run build` then `pnpm start`' : '`pnpm start`'}`,
    '- **Migrations:** `pnpm run migrate`',
    '',
    'Full documentation: https://atlex.dev',
    '',
  ].join('\n')
}

function posixify(p: string): string {
  return p.split(path.sep).join(path.posix.sep)
}

function computeAtlexRoot(commandsDir: string): string {
  // src: atlex/cli/src/commands → up 3 = atlex/
  // dist: atlex/cli/dist/commands → up 3 = atlex/
  return path.resolve(commandsDir, '..', '..', '..')
}

function isInsideDir(childPath: string, parentPath: string): boolean {
  const rel = path.relative(parentPath, childPath)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function dependencyMode(targetDir: string, atlexRoot: string): DependencyMode {
  // If the app is generated under the monorepo root, workspace:* works.
  return isInsideDir(targetDir, atlexRoot) ? 'workspace' : 'file'
}

function atlexDep(
  pkg: AtlexPackageName,
  mode: DependencyMode,
  targetDir: string,
  atlexRoot: string,
): string {
  if (mode === 'registry') return PUBLISHED_ATLEX_PACKAGE_VERSION
  if (mode === 'workspace') return 'workspace:*'

  const pkgDir =
    pkg === '@atlex/cli'
      ? path.join(atlexRoot, 'cli')
      : path.join(atlexRoot, 'packages', pkg.replace('@atlex/', ''))
  const resolved = path.resolve(pkgDir)
  const rel = path.relative(targetDir, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return `file:${posixify(resolved)}`
  }
  return `file:${posixify(rel)}`
}

function atlexOverrides(
  mode: DependencyMode,
  targetDir: string,
  atlexRoot: string,
): Record<AtlexPackageName, string> | null {
  if (mode !== 'file') return null
  return {
    '@atlex/core': atlexDep('@atlex/core', mode, targetDir, atlexRoot),
    '@atlex/orm': atlexDep('@atlex/orm', mode, targetDir, atlexRoot),
    '@atlex/testing': atlexDep('@atlex/testing', mode, targetDir, atlexRoot),
    '@atlex/auth': atlexDep('@atlex/auth', mode, targetDir, atlexRoot),
    '@atlex/queue': atlexDep('@atlex/queue', mode, targetDir, atlexRoot),
    '@atlex/cli': atlexDep('@atlex/cli', mode, targetDir, atlexRoot),
    '@atlex/config': atlexDep('@atlex/config', mode, targetDir, atlexRoot),
    '@atlex/log': atlexDep('@atlex/log', mode, targetDir, atlexRoot),
    '@atlex/storage': atlexDep('@atlex/storage', mode, targetDir, atlexRoot),
  }
}

function templatePackageJson(
  language: Language,
  appName: string,
  opts: {
    dependencyMode: DependencyMode
    targetDir: string
    atlexRoot: string
  },
): string {
  const dependencies: Record<string, string> = {
    '@atlex/core': atlexDep('@atlex/core', opts.dependencyMode, opts.targetDir, opts.atlexRoot),
    '@atlex/config': atlexDep('@atlex/config', opts.dependencyMode, opts.targetDir, opts.atlexRoot),
    '@atlex/log': atlexDep('@atlex/log', opts.dependencyMode, opts.targetDir, opts.atlexRoot),
    '@atlex/storage': atlexDep(
      '@atlex/storage',
      opts.dependencyMode,
      opts.targetDir,
      opts.atlexRoot,
    ),
    '@atlex/orm': atlexDep('@atlex/orm', opts.dependencyMode, opts.targetDir, opts.atlexRoot),
    '@atlex/testing': atlexDep(
      '@atlex/testing',
      opts.dependencyMode,
      opts.targetDir,
      opts.atlexRoot,
    ),
    '@atlex/cli': atlexDep('@atlex/cli', opts.dependencyMode, opts.targetDir, opts.atlexRoot),
    '@atlex/auth': atlexDep('@atlex/auth', opts.dependencyMode, opts.targetDir, opts.atlexRoot),
    '@atlex/queue': atlexDep('@atlex/queue', opts.dependencyMode, opts.targetDir, opts.atlexRoot),
    dotenv: '^16.4.7',
  }

  const devDependencies: Record<string, string> =
    language === 'ts'
      ? {
          concurrently: '^9.2.1',
          nodemon: '^3.1.10',
          typescript: '^5.9.0',
          '@types/node': '^24.0.0',
          '@types/express': '^5.0.3',
          '@types/cors': '^2.8.19',
        }
      : {
          nodemon: '^3.1.10',
        }

  const tsWatchServe =
    'concurrently -k -n tsc,nodemon "tsc -p tsconfig.json -w" "nodemon --watch dist --ext js --exec \\"node --enable-source-maps dist/main.js\\""'
  const jsWatchServe = 'nodemon --watch . --ext js,json --exec node main.js'

  const scripts: Record<string, string> =
    language === 'ts'
      ? {
          build: 'tsc -p tsconfig.json',
          migrate: 'tsc -p tsconfig.json && atlex migrate',
          seed: 'tsc -p tsconfig.json && atlex db:seed',
          dev: tsWatchServe,
          start: 'node --enable-source-maps dist/main.js',
        }
      : {
          migrate: 'atlex migrate',
          seed: 'atlex db:seed',
          dev: jsWatchServe,
          start: 'node main.js',
        }

  scripts['docker:up'] = 'docker compose up -d'
  scripts['docker:down'] = 'docker compose down'
  scripts['docker:dev'] = 'docker compose up --build'
  scripts['migrate:docker'] = 'docker compose exec app atlex migrate'

  const overrides = atlexOverrides(opts.dependencyMode, opts.targetDir, opts.atlexRoot)
  const pkg = {
    name: appName,
    private: true,
    type: 'module',
    scripts,
    dependencies,
    devDependencies,
    ...(overrides !== null ? { pnpm: { overrides } } : {}),
  }

  return `${JSON.stringify(pkg, null, 2)}\n`
}

function tsconfigTemplateSource(): string {
  return `{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\",\n    \"module\": \"NodeNext\",\n    \"moduleResolution\": \"NodeNext\",\n    \"strict\": true,\n    \"rootDir\": \".\",\n    \"outDir\": \"dist\",\n    \"declaration\": false,\n    \"sourceMap\": true,\n    \"types\": [\"node\"]\n  },\n  \"include\": [\"app\", \"bootstrap\", \"config\", \"database\", \"routes\", \"main.ts\"]\n}\n`
}

function databaseSeederSource(language: Language): string {
  if (language === 'ts') {
    return [
      'import { Seeder } from "@atlex/orm";',
      '',
      '/**',
      ' * Application entry seeder — `atlex db:seed` (default `--class=DatabaseSeeder`).',
      ' */',
      'export default class DatabaseSeeder extends Seeder {',
      '  public async run(): Promise<void> {',
      '    //',
      '  }',
      '}',
      '',
    ].join('\n')
  }
  return [
    'import { Seeder } from "@atlex/orm";',
    '',
    '/**',
    ' * Application entry seeder — `atlex db:seed` (default `--class=DatabaseSeeder`).',
    ' */',
    'export default class DatabaseSeeder extends Seeder {',
    '  /**',
    "   * Seed the application's database.",
    '   */',
    '  async run() {',
    '    //',
    '  }',
    '}',
    '',
  ].join('\n')
}

async function generateProject(
  appName: string,
  targetDir: string,
  opts: NewOptions,
  depMode: DependencyMode,
): Promise<void> {
  const commandsDir = path.dirname(fileURLToPath(import.meta.url))
  const atlexRoot = computeAtlexRoot(commandsDir)
  const templateDir = path.resolve(commandsDir, '..', '..', 'templates', opts.language)

  await fs.ensureDir(targetDir)
  await fs.copy(templateDir, targetDir, { overwrite: true })

  const isTs = opts.language === 'ts'
  const ext = isTs ? 'ts' : 'js'

  await fs.outputFile(
    path.join(targetDir, 'config', `app.${ext}`),
    appConfigSource(opts.language, appName),
  )

  await fs.outputFile(
    path.join(targetDir, 'config', `database.${ext}`),
    databaseConfigSource(opts.language),
  )

  await fs.ensureDir(path.join(targetDir, 'bootstrap'))
  await fs.outputFile(
    path.join(targetDir, 'bootstrap', `database.${ext}`),
    bootstrapDatabaseSource(opts.language),
  )

  await fs.ensureDir(path.join(targetDir, 'database', 'migrations'))
  await fs.outputFile(path.join(targetDir, 'database', 'migrations', '.gitkeep'), '')

  await fs.ensureDir(path.join(targetDir, 'database', 'seeders'))
  await fs.ensureDir(path.join(targetDir, 'database', 'factories'))
  await fs.outputFile(path.join(targetDir, 'database', 'factories', '.gitkeep'), '')
  await fs.outputFile(
    path.join(targetDir, 'database', 'seeders', `DatabaseSeeder.${ext}`),
    databaseSeederSource(opts.language),
  )

  await fs.outputFile(
    path.join(targetDir, 'config', `auth.${ext}`),
    authConfigSource(opts.language),
  )

  await fs.outputFile(path.join(targetDir, 'routes', `web.${ext}`), routesWebSource(opts.language))

  await fs.outputFile(path.join(targetDir, `main.${ext}`), mainSource(opts.language))

  const appKey = Encrypter.generateKey()
  const envBody = envExampleSource(appKey)
  await fs.outputFile(path.join(targetDir, '.env.example'), envBody)
  await fs.outputFile(path.join(targetDir, '.env'), envBody)

  const dockerBuild = computeDockerBuild(depMode, targetDir, atlexRoot)
  if (depMode === 'file') {
    const repoRoot = path.resolve(atlexRoot, '..')
    const rootIgnorePath = path.join(repoRoot, '.dockerignore')
    if (!(await fs.pathExists(rootIgnorePath))) {
      await fs.outputFile(rootIgnorePath, repoRootDockerignoreSource())
    }
  }

  await fs.outputFile(
    path.join(targetDir, 'docker-compose.yml'),
    dockerComposeYaml(true, dockerBuild),
  )
  await fs.outputFile(
    path.join(targetDir, 'Dockerfile'),
    dockerfileSource(opts.language, dockerBuild),
  )
  await fs.outputFile(path.join(targetDir, '.dockerignore'), dockerIgnoreSource())

  await fs.outputFile(
    path.join(targetDir, 'package.json'),
    templatePackageJson(opts.language, appName, {
      dependencyMode: depMode,
      targetDir,
      atlexRoot,
    }),
  )

  await fs.outputFile(
    path.join(targetDir, 'README.md'),
    scaffoldProjectReadmeSource(appName, opts.language),
  )

  await (isTs
    ? fs.outputFile(path.join(targetDir, 'tsconfig.json'), tsconfigTemplateSource())
    : fs.remove(path.join(targetDir, 'tsconfig.json')))
}

async function runPnpmInstall(cwd: string): Promise<void> {
  await execa('pnpm', ['install', '--no-frozen-lockfile'], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  })
}

/** Language for a newly scaffolded application (`ts` or `js`). */
export type ScaffoldLanguage = Language

/** Options for {@link scaffoldNewApplication}. */
export interface ScaffoldNewApplicationOptions {
  /** `package.json` name and default `APP_NAME`. */
  appName: string
  /** Absolute path to the project directory. */
  targetDir: string
  language: ScaffoldLanguage
  /**
   * When `true`, pins every `@atlex/*` dependency to the published npm semver
   * (for published scaffolder / `npx @atlex/create-atlex-app`). When `false`, uses workspace or `file:` resolution like `atlex new`.
   */
  registryDependencies: boolean
  /** When `true`, runs `pnpm install` in the target directory after generating files. */
  runPnpmInstall: boolean
}

/**
 * Generate a new Atlex application on disk (shared by `atlex new` and `@atlex/create-atlex-app`).
 *
 * @param options - Directory, language, dependency mode, and whether to install packages.
 */
export async function scaffoldNewApplication(
  options: ScaffoldNewApplicationOptions,
): Promise<void> {
  const commandsDir = path.dirname(fileURLToPath(import.meta.url))
  const atlexRoot = computeAtlexRoot(commandsDir)
  const depMode: DependencyMode = options.registryDependencies
    ? 'registry'
    : dependencyMode(options.targetDir, atlexRoot)
  await generateProject(options.appName, options.targetDir, { language: options.language }, depMode)
  if (options.runPnpmInstall) {
    await runPnpmInstall(options.targetDir)
  }
}

export function newCommand(): Command {
  const cmd = new Command('new')

  cmd
    .description('Create a new Atlex application')
    .argument('<name>', 'application name / directory')
    .action(async (name: string) => {
      intro(buildBanner())

      const language = ensureNotCancelled(
        await select({
          message: 'Choose language',
          options: [
            { value: 'ts', label: 'TypeScript' },
            { value: 'js', label: 'JavaScript' },
          ],
        }),
      ) as Language

      const targetDir = path.resolve(resolveProjectCwd(), name)
      const opts: NewOptions = { language }
      const commandsDirForDeps = path.dirname(fileURLToPath(import.meta.url))
      const atlexRootForDeps = computeAtlexRoot(commandsDirForDeps)
      const depMode = dependencyMode(targetDir, atlexRootForDeps)

      const proceed = ensureNotCancelled(
        await confirm({
          message: `Create application?\n\n${formatSummary(targetDir, opts)}`,
          initialValue: true,
        }),
      )

      if (!proceed) {
        cancel('Cancelled.')
        return
      }

      if (await fs.pathExists(targetDir)) {
        const isEmpty = (await fs.readdir(targetDir)).length === 0
        if (!isEmpty) {
          cancel(`Directory is not empty: ${targetDir}`)
          process.exit(1)
        }
      }

      const gen = spinner()
      gen.start('Generating project...')
      await generateProject(name, targetDir, opts, depMode)
      gen.stop('Project generated.')

      const install = spinner()
      install.start('Running pnpm install...')
      await runPnpmInstall(targetDir)
      install.stop('Dependencies installed.')

      const steps = [
        `cd ${name}`,
        ...(opts.language === 'ts' ? ['pnpm run build'] : []),
        'atlex serve   (or: pnpm start)',
      ]

      outro(`Success!\n\nNext steps:\n- ${steps.join('\n- ')}\n`)
    })

  return cmd
}
