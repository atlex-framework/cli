import { env } from '@atlex/config'

export default {
  default: env('CACHE_DRIVER', 'file'),
}
