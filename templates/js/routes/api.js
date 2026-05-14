import { Route } from '@atlex/core'

Route.group('/api', () => {
  Route.get('/health', (_req, res) => {
    res.json({ ok: true })
  })
})
import { Route } from '@atlex/core'

Route.group('/api', () => {
  Route.get('/health', (_req, res) => {
    res.json({ ok: true })
  })
})
