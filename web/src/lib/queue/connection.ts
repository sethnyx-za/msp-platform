/**
 * BullMQ Redis connection factory
 *
 * BullMQ v5 bundles its own copy of ioredis. Passing our app's top-level
 * Redis instance causes a TypeScript structural mismatch between the two
 * ioredis versions. The correct pattern is to give BullMQ raw connection
 * options and let it create its own internal connection.
 *
 * Our app's singleton Redis client (src/lib/redis.ts) remains separate
 * and is used for auth, rate-limiting, and session caching.
 */

export interface BullMQConnectionOptions {
  host: string
  port: number
  password?: string
  username?: string
  tls?: Record<string, unknown>
  // Required by BullMQ workers
  maxRetriesPerRequest: null
  enableReadyCheck: boolean
}

/**
 * Parse REDIS_URL into BullMQ-compatible connection options.
 * BullMQ will create its own ioredis connection internally.
 */
export function getBullMQConnection(): BullMQConnectionOptions {
  const url = process.env.REDIS_URL
  if (!url) throw new Error("REDIS_URL environment variable is not set")

  const parsed = new URL(url)

  const opts: BullMQConnectionOptions = {
    host: parsed.hostname || "localhost",
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    maxRetriesPerRequest: null,  // Required by BullMQ
    enableReadyCheck: false,     // Required by BullMQ
  }

  if (parsed.password) {
    opts.password = decodeURIComponent(parsed.password)
  }
  if (parsed.username && parsed.username !== "default") {
    opts.username = decodeURIComponent(parsed.username)
  }
  if (parsed.protocol === "rediss:") {
    opts.tls = {}
  }

  return opts
}
