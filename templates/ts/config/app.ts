import { env } from '@atlex/config'

export default {
  name: env('APP_NAME', 'Atlex'),
  env: env('APP_ENV', 'development'),
  debug: env('APP_DEBUG', false),
  key: env('APP_KEY'),
  previous_keys: env('APP_PREVIOUS_KEYS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  url: env('APP_URL', 'http://localhost:3000'),
  port: env('PORT', 3000),
  timezone: env('TZ', 'UTC'),
  locale: env('APP_LOCALE', 'en'),
  fallback_locale: env('APP_FALLBACK_LOCALE', 'en'),
}
