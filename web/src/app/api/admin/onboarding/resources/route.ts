import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { onboardingSharedResources } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

const createSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().default(0),
})

export async function GET(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId")
  if (!organizationId) {
    return NextResponse.json({ success: false, error: "organizationId required" }, { status: 400 })
  }

  const rows = await db.select().from(onboardingSharedResources)
    .where(eq(onboardingSharedResources.organizationId, organizationId))
    .orderBy(onboardingSharedResources.sortOrder, onboardingSharedResources.name)

  return NextResponse.json({ success: true, data: rows })
}

export async function POST(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const [item] = await db.insert(onboardingSharedResources).values({
    organizationId: parsed.data.organizationId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    sortOrder: parsed.data.sortOrder,
  }).returning()

  return NextResponse.json({ success: true, data: item }, { status: 201 })
}
