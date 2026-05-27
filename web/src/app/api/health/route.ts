import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { redis } from "@/lib/redis"

export async function GET() {
  const checks: Record<string, string> = {}

  // Database check
  try {
    await db.execute(sql`SELECT 1`)
    checks.database = "ok"
  } catch {
    checks.database = "error"
  }

  // Redis check
  try {
    await redis.ping()
    checks.redis = "ok"
  } catch {
    checks.redis = "error"
  }

  const healthy = Object.values(checks).every((s) => s === "ok")

  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  )
}
