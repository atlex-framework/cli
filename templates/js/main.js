import './bootstrap/database.js'
import { Application } from '@atlex/core'
import { ConfigServiceProvider, config } from '@atlex/config'
import { LogServiceProvider } from '@atlex/log'
import './routes/web.js'

const app = new Application()
app.register(new ConfigServiceProvider())
app.register(new LogServiceProvider())
app.boot()

const portRaw = config('app.port', 3000)
const port = typeof portRaw === 'number' ? portRaw : Number(portRaw)
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Atlex listening on port ${String(port)}`)
})
