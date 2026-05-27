/**
 * Run this script to apply pending migrations.
 * Called automatically in the Docker container on startup.
 * Usage: npx tsx src/lib/db/migrate.ts
 */
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import path from "path"

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }

  console.log("🔄 Running database migrations...")

  const client = postgres(connectionString, { max: 1 })
  const db = drizzle(client)

  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/lib/db/migrations"),
  })

  console.log("✅ Migrations complete")
  await client.end()
}

runMigrations().catch((err) => {
  console.error("❌ Migration failed:", err)
  process.exit(1)
})
