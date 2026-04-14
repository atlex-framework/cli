import { env } from '@atlex/config'

export default {
  jwt: {
    secret: env('JWT_SECRET', 'change-me'),
    expiresIn: env('JWT_EXPIRES_IN', '1h'),
  },
}
