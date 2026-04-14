import { env } from '@atlex/config'

export default {
  default: env('LOG_CHANNEL', 'stdout'),

  channels: {
    stdout: {
      driver: 'console',
      level: 'debug',
      formatter: 'pretty',
    },

    file: {
      driver: 'file',
      path: 'storage/logs/atlex.log',
      level: 'debug',
      formatter: 'line',
    },

    daily: {
      driver: 'daily',
      path: 'storage/logs/atlex.log',
      level: 'debug',
      days: 14,
      formatter: 'line',
    },

    stack: {
      driver: 'stack',
      level: 'debug',
      channels: ['file', 'stdout'],
    },

    null: {
      driver: 'null',
      level: 'debug',
    },
  },
}
