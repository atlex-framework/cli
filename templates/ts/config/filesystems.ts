import { env } from '@atlex/config'

export default {
  default: 'local',
  disks: {
    local: {
      driver: 'local' as const,
      root: 'storage/app',
      url: '/storage',
    },
    public: {
      driver: 'local' as const,
      root: 'storage/app/public',
      url: '/storage',
    },
    memory: {
      driver: 'memory' as const,
    },
    s3: {
      driver: 's3' as const,
      bucket: env('AWS_BUCKET', ''),
      region: env('AWS_DEFAULT_REGION', 'us-east-1'),
      url: env('AWS_URL', ''),
      endpoint: env('AWS_ENDPOINT', ''),
      forcePathStyle: env('AWS_USE_PATH_STYLE_ENDPOINT', false),
    },
  },
}
