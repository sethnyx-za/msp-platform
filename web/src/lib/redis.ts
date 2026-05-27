import Redis from "ioredis"

// ─── Singleton Redis client ───────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var _redis: Redis | undefined
}

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL
  if (!url) throw new Error("REDIS_URL environment variable is not set")

  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => {
      if (times > 10) return null  // stop retrying after 10 attempts
      return Math.min(times * 100, 3000)
    },
  })

  client.on("error", (err) => {
    // Log but don't crash — Redis errors should not bring down the app
    console.error("[Redis] Connection error:", err.message)
  })

  client.on("connect", () => {
    console.log("[Redis] Connected")
  })

  return client
}

export const redis =
  process.env.NODE_ENV === "production"
    ? createRedisClient()
    : (globalThis._redis ??= createRedisClient())

// ─── Typed key helpers ────────────────────────────────────────────────────────
// Centralised key names prevent typos and make it easy to find all Redis usage.

export const RedisKeys = {
  // Auth: MFA flow
  mfaPending: (key: string) => `mfa:pending:${key}`,      // value = userId, TTL 5 min
  mfaBypass: (key: string) => `mfa:bypass:${key}`,        // value = userId, TTL 2 min
  // Auth: login rate limiting
  loginAttempts: (identifier: string) => `login:attempts:${identifier}`,

  // Integration sync locks (prevent concurrent syncs for same client)
  syncLock: (orgId: string, type: string) => `sync:lock:${type}:${orgId}`,

  // Sync cache TTL markers
  syncCacheTs: (orgId: string, type: string) => `sync:ts:${type}:${orgId}`,

  // Session override (force-logout)
  sessionRevoked: (userId: string) => `session:revoked:${userId}`,
} as const
