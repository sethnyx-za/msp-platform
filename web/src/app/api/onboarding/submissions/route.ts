import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { onboardingSubmissions, organizations } from "@/lib/db/schema"
import { eq, desc, and, sql } from "drizzle-orm"
import { createSubmission, notifyMspOfSubmission } from "@/lib/services/onboarding"

const lineItemSchema = z.object({
  catalogItemId: z.string().uuid().nullable().optional(),
  category: z.enum(["computer", "peripheral", "monitor", "license", "service", "other"]),
  description: z.string().min(1).max(500),
  sku: z.string().max(100).nullable().optional(),
  supplier: z.string().max(255).nullable().optional(),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPrice: z.coerce.number().min(0),
  sortOrder: z.number().int().optional(),
})

const createSchema = z.object({
  starterFirstName: z.string().min(1).max(100),
  starterLastName: z.string().min(1).max(100),
  starterEmail: z.string().email().nullable().optional().or(z.literal("")),
  starterPhone: z.string().max(50).nullable().optional(),
  starterJobTitle: z.string().max(255).nullable().optional(),
  startDate: z.string().nullable().optional(),
  phoneExtension: z.string().max(20).nullable().optional(),
  lineItems: z.array(lineItemSchema).default([]),
  selectedLocationIds: z.array(z.string().uuid()).default([]),
  selectedResourceIds: z.array(z.string().uuid()).default([]),
  quoteNotes: z.string().nullable().optional(),
  action: z.enum(["draft", "submit"]).default("draft"),
})

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const orgId = req.headers.get("x-org-id")
  if (!orgId) return NextResponse.json({ success: false, error: "No org context" }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100)
  const offset = (page - 1) * limit

  const [rows, countResult] = await Promise.all([
    db.select().from(onboardingSubmissions)
      .where(eq(onboardingSubmissions.organizationId, orgId))
      .orderBy(desc(onboardingSubmissions.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(onboardingSubmissions)
      .where(eq(onboardingSubmissions.organizationId, orgId)),
  ])

  return NextResponse.json({
    success: true,
    data: rows,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
  })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const orgId = req.headers.get("x-org-id")
  if (!orgId) return NextResponse.json({ success: false, error: "No org context" }, { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const d = parsed.data
  const submission = await createSubmission({
    organizationId: orgId,
    submittedByUserId: userId,
    starterFirstName: d.starterFirstName,
    starterLastName: d.starterLastName,
    starterEmail: d.starterEmail || null,
    starterPhone: d.starterPhone ?? null,
    starterJobTitle: d.starterJobTitle ?? null,
    startDate: d.startDate ?? null,
    phoneExtension: d.phoneExtension ?? null,
    lineItems: d.lineItems,
    selectedLocationIds: d.selectedLocationIds,
    selectedResourceIds: d.selectedResourceIds,
    quoteNotes: d.quoteNotes ?? null,
    action: d.action,
  })

  // Fire-and-forget MSP notification on submit
  if (d.action === "submit") {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1)
    void notifyMspOfSubmission(submission.id, org?.name ?? "Unknown")
  }

  return NextResponse.json({ success: true, data: submission }, { status: 201 })
}
