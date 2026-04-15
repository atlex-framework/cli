# API Reference

Atlex is delivered as focused npm packages. Each package exports its public TypeScript API from `dist/index.js` with accompanying `.d.ts` files.

## Core packages

| Package                | Responsibility                                        |
| ---------------------- | ----------------------------------------------------- |
| `@atlex/core`          | Application, routing, middleware, IoC, HTTP pipeline  |
| `@atlex/orm`           | Models, migrations, query builder, factories, seeders |
| `@atlex/auth`          | Authentication, guards, hashing                       |
| `@atlex/queue`         | Jobs, workers, failed job tables                      |
| `@atlex/mail`          | Mailables, transports                                 |
| `@atlex/cache`         | Cache stores and tagging                              |
| `@atlex/config`        | Configuration repository                              |
| `@atlex/log`           | Logging channels                                      |
| `@atlex/storage`       | Cloud and local filesystem disks                      |
| `@atlex/encryption`    | Symmetric encryption utilities                        |
| `@atlex/notifications` | Multi-channel notifications                           |
| `@atlex/testing`       | Test harness utilities                                |

## CLI

`@atlex/cli` exposes the `atlex` binary for generators, migrations, queues, scheduling, and serving apps.

## Source of truth

For signatures and generics, browse the published `.d.ts` files on npm or the GitHub repository's `packages/*/src` directories.
