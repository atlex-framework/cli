import type { Request, Response } from 'express'
import { Route } from '@atlex/core'

Route.group('/api', () => {
  Route.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true })
  })
})
import type { Request, Response } from 'express'
import { Route } from '@atlex/core'

Route.group('/api', () => {
  Route.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true })
  })
})
