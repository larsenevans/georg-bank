export type HealthDatabaseStatus = 'ok' | 'unreachable' | 'unconfigured'

export type HealthReadinessInput = {
  database: HealthDatabaseStatus
  hasBetterAuthSecret: boolean
  betterAuthUrlConfigured: boolean
  pinConfigured: boolean
  guestConfigured: boolean
}

/**
 * Service is ready when core infra is up and at least one auth path works.
 * Invalid/missing guest env is informational in PIN-only deployments — it must
 * not force 503 when the database is reachable and APP_PIN is configured.
 */
export function computeHealthOk(input: HealthReadinessInput): boolean {
  const coreReady =
    input.database === 'ok' &&
    input.hasBetterAuthSecret &&
    input.betterAuthUrlConfigured

  if (!coreReady) {
    return false
  }

  return input.pinConfigured || input.guestConfigured
}
