import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

// ─── Lazy connection pool ─────────────────────────────────────────────────────
// The connection is created on first use, not at module load time.
// This prevents Next.js from throwing during the build's "Collecting page data"
// phase when DATABASE_URL is not available in the build container.

declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined
  // eslint-disable-next-line no-var
  var _db: ReturnType<typeof drizzle<typeof schema>> | undefined
}

function createDb() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set")
  }

  // In development, reuse the connection across hot reloads to avoid exhausting
  // the connection pool. In production, create a fresh pool.
  const client =
    process.env.NODE_ENV === "production"
      ? postgres(connectionString, {
          max: 20,
          idle_timeout: 30,
          connect_timeout: 10,
        })
      : (globalThis._pgClient ??= postgres(connectionString, {
          max: 5,
          idle_timeout: 30,
        }))

  return drizzle(client, {
    schema,
    logger: process.env.NODE_ENV === "development",
  })
}

// Lazily-initialised singleton — safe to import anywhere.
// The actual Postgres connection is only opened when db.select/insert/etc is called.
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop: string | symbol) {
    const instance = (globalThis._db ??= createDb())
    return Reflect.get(instance, prop)
  },
})

export type Database = ReturnType<typeof createDb>
