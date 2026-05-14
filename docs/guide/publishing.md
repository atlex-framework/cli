# Publishing packages

This monorepo uses [Changesets](https://github.com/changesets/changesets) and GitHub Actions to version and publish **`@atlex/*`** packages to npm, including **`@atlex/create-atlex-app`** (the app scaffolder; directory `create-atlex-app/`).

## Prerequisites

1. **npm account** with permission to publish the **`@atlex`** scope (all published packages use that scope, including the scaffolder).
2. **npm token for CI** (required so `release.yml` can run `changeset publish` without `E403` / 2FA prompts):
   - **Classic:** type **Automation** (publishes while account 2FA is enabled), or
   - **Granular:** **Publish** on the **`@atlex/*`** packages you release, and enable **Bypass two-factor authentication (2FA)** for automation.
3. **GitHub repository secrets** (on the repo that runs release):
   - `NPM_TOKEN` — must be the token kind in (2), not a read-only or “publish without bypass” token.
4. **Local development** uses **pnpm** (`pnpm-lock.yaml` at the repo root). Install with [Corepack](https://nodejs.org/api/corepack.html): `corepack enable` then `corepack prepare pnpm@10.14.0 --activate`.

## GitHub Actions checklist

| Workflow    | File                            | Purpose                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI**      | `.github/workflows/ci.yml`      | On every PR/push to `main`: `pnpm install --frozen-lockfile`, `lint`, `format:check`, `typecheck`, `test:coverage`, `build`, `check-package-exports` (Node **20** and **22**). Optional `CODECOV_TOKEN` secret for Codecov uploads (step is non-fatal if missing).                            |
| **Release** | `.github/workflows/release.yml` | On push to `main`: install, build, then [changesets/action](https://github.com/changesets/action) runs `pnpm run version-packages` / `pnpm run release`. Needs `NPM_TOKEN` as above; sets `NODE_AUTH_TOKEN` and `NPM_CONFIG_PROVENANCE=true` with `id-token: write` for npm provenance in CI. |

To confirm CI locally, from the repo root run the same commands as `ci.yml` (after `pnpm install --frozen-lockfile`): `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm build`, `node scripts/check-package-exports.mjs`.

## One-time: npm org & provenance

- Keep `"publishConfig": { "access": "public" }` on published packages. Do **not** set `"provenance": true` in `package.json`: npm then **requires** OIDC provenance on every publish, which fails locally with `EUSAGE` / `Automatic provenance generation not supported for provider: null`.
- **GitHub Actions only:** `.github/workflows/release.yml` sets `NPM_CONFIG_PROVENANCE=true` (with `id-token: write`) so `changeset publish` from CI can attach OpenSSF provenance when the registry supports it.
- **Local** `pnpm run changeset:publish:dry-run` or `npm publish` runs without provenance; that is expected and avoids the error above.

## Day-to-day: ship a release

### 1. Merge work to `main`

Only the `main` branch runs the release workflow (see `.github/workflows/release.yml`).

### 2. Add a changeset

From the repository root:

```bash
pnpm changeset
```

Follow the prompts: choose which packages changed and whether the bump is **patch**, **minor**, or **major**. This creates a file under `.changesets/`.

Commit and push the changeset with your code (or in a dedicated PR).

### 3. Version PR or direct publish

When Changesets runs on `main`:

- If there are **pending changesets**, the action opens (or updates) a **“Version packages”** PR that bumps versions and updates `CHANGELOG.md`.
- When that PR is **merged** (or if versions were already bumped and there is nothing left to version), the action runs **`pnpm run release`** (`changeset publish`), which publishes to npm.

You do not manually run `npm publish` per package unless you are debugging; Changesets publishes all packages that have a new version.

### 4. Verify on npm

Check version badges on the [README](https://github.com/atlex-framework/atlex) or open each package on npm, e.g. `https://www.npmjs.com/package/@atlex/core`.

### 5. GitHub Releases (optional)

The release workflow can create per-package GitHub releases when `changesets/action` reports published packages (see `release.yml`). Adjust titles or notes there if your process requires it.

## Local dry-run (optional)

Changesets runs **`npm publish`** for each package. On **npm v7+**, `npm publish --dry-run` still **authenticates to the registry** for scoped packages (`@atlex/*`), even though nothing is uploaded ([npm/cli#2411](https://github.com/npm/cli/issues/2411)).

1. Put a publish-capable token in the environment (same as CI). `npm` reads **`NODE_AUTH_TOKEN`** or you can use **`NPM_TOKEN`** if your tooling sets it:

   ```bash
   export NODE_AUTH_TOKEN=npm_...   # recommended (matches GitHub Actions)
   # or:
   export NPM_TOKEN=npm_...
   ```

2. Run the wrapper (fails fast if you are not logged in and no token is set; it accepts **`npm login`** sessions via `npm whoami`):

   ```bash
   pnpm run changeset:publish:dry-run
   ```

   Or, after exporting `NPM_TOKEN` / `NODE_AUTH_TOKEN`, or running `npm login`:

   ```bash
   pnpm exec changeset publish --dry-run
   ```

**First publish:** `changeset publish` may log `Received 404 for npm info "@atlex/..."` — that only means the package name is not on npm yet; it is not an error.

**Packaging only (no registry auth):** run `pnpm run build` at the repo root (or `pnpm -r run build`), then `pnpm pack` inside a package directory, or rely on CI — there is no fully offline equivalent to `changeset publish --dry-run` without npm credentials.

Useful mainly to confirm packaging with real auth; CI with `NPM_TOKEN` is the source of truth.

## Troubleshooting

| Issue                                                                                        | What to check                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENEEDAUTH` in CI                                                                            | `NPM_TOKEN` secret missing or expired; token must allow publish to the scope.                                                                                                                     |
| `E403` / “Two-factor authentication or granular access token with bypass 2fa” in CI          | Use an **Automation** (classic) or **Granular** npm token with **Bypass 2FA** for the packages you publish (same requirement as local `changeset publish`).                                       |
| `E403` on **`@atlex/create-atlex-app`** (or other `@atlex/*`) with credentials / 2FA wording | Granular token missing **Publish** for that package or scope, missing **Bypass 2FA**, or wrong org. Prefer a classic **Automation** token for CI.                                                 |
| `ENEEDAUTH` locally on `changeset publish --dry-run`                                         | Export `NPM_TOKEN` (or `NODE_AUTH_TOKEN`) or run `npm login`. Dry-run still authenticates for scoped packages.                                                                                    |
| `EUSAGE` / `Automatic provenance generation not supported for provider: null`                | Caused by `"provenance": true` inside `publishConfig` when not on a supported CI OIDC provider. This repo omits that flag; use CI (`NPM_CONFIG_PROVENANCE=true` in `release.yml`) for provenance. |
| `npm warn Unknown project config "shamefully-hoist"`                                         | Pnpm-only settings live in `pnpm-workspace.yaml` (`settings:`), not in `.npmrc`, so `npm publish` does not warn.                                                                                  |
| Wrong version published                                                                      | Changeset bump type; ensure the right `.changesets/*.md` files were merged.                                                                                                                       |
| Package missing files                                                                        | `files` field in that package’s `package.json`; run `pnpm run build` before publish (CI does this).                                                                                               |

## Contributing vs. consuming

- **Contributors** to this repo: use **pnpm** at the root (`pnpm install`, `pnpm test`, `pnpm quality`).
- **App developers** installing Atlex: use **npm**, **pnpm**, or **yarn** (`npm install @atlex/core`, etc.) — see [Installation](./installation.md).
