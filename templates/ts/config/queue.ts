import { env } from '@atlex/config'

export default {
  default: env('QUEUE_CONNECTION', 'sync'),
}
