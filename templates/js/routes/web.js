import { Route } from '@atlex/core'

Route.get('/', (_req, res) => {
  res.json({ message: 'Welcome to Atlex' })
})
