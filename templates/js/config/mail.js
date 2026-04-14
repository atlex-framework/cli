import { env } from '@atlex/config'

export default {
  default: env('MAIL_MAILER', 'log'),
}
