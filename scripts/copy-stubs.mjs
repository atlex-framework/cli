#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(here, '../src/stubs')
const dest = path.join(here, '../dist/stubs')

if (!fs.existsSync(src)) {
  console.error(`copy-stubs: missing source directory: ${src}`)
  process.exit(1)
}

fs.mkdirSync(dest, { recursive: true })
for (const name of fs.readdirSync(src)) {
  if (!name.endsWith('.stub')) continue
  fs.copyFileSync(path.join(src, name), path.join(dest, name))
}
