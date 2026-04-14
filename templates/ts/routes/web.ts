import type { Request, Response } from 'express'
import { Route } from '@atlex/core'

Route.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Welcome to Atlex' })
})
