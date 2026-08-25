import { computeHealthOk } from '@/lib/health-readiness'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

const core = {
  database: 'ok' as const,
  hasBetterAuthSecret: true,
  betterAuthUrlConfigured: true,
}

assert(
  computeHealthOk({
    ...core,
    pinConfigured: true,
    guestConfigured: false,
  }),
  'PIN-only prod: invalid guest must not block readiness'
)

assert(
  computeHealthOk({
    ...core,
    pinConfigured: true,
    guestConfigured: true,
  }),
  'PIN + valid guest should stay ready'
)

assert(
  computeHealthOk({
    ...core,
    pinConfigured: false,
    guestConfigured: true,
  }),
  'guest-only deployments should stay ready when guest env is valid'
)

assert(
  !computeHealthOk({
    ...core,
    pinConfigured: false,
    guestConfigured: false,
  }),
  'no auth path configured should not be ready'
)

assert(
  !computeHealthOk({
    ...core,
    database: 'unreachable',
    pinConfigured: true,
    guestConfigured: true,
  }),
  'unreachable database should not be ready'
)

assert(
  !computeHealthOk({
    ...core,
    hasBetterAuthSecret: false,
    pinConfigured: true,
    guestConfigured: true,
  }),
  'missing BETTER_AUTH_SECRET should not be ready'
)

assert(
  !computeHealthOk({
    ...core,
    betterAuthUrlConfigured: false,
    pinConfigured: true,
    guestConfigured: true,
  }),
  'missing BETTER_AUTH_URL should not be ready'
)

console.log('health-readiness.test.ts: all assertions passed')
