import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

// ─── Connection pool ───────────────────────────────────────────────────────────
// Re-uses the connection across hot reloads in development.

declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined
}

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

export const db = drizzle(client, {
  schema,
  logger: process.env.NODE_ENV === "development",
})

export type Database = typeof db
