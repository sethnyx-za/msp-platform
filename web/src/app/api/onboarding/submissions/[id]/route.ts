import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { onboardingSubmissions, organizations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import {
  getSubmissionWithDetails, updateDraftSubmission, notifyMspOfSubmission,
} from "@/lib/services/onboarding"

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

const updateSchema = z.object({
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

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  const userId = req.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const orgId = req.headers.get("x-org-id")
  const { id } = await params

  const detail = await getSubmissionWithDetails(id)
  if (!detail) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

  // Client users can only view their own org's submissions
  const isMsp = req.headers.get("x-is-msp-staff") === "true"
  if (!isMsp && detail.organizationId !== orgId) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json({ success: true, data: detail })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const userId = req.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const orgId = req.headers.get("x-org-id")
  const { id } = await params

  // Ensure submission exists and is in draft
  const [existing] = await db
    .select()
    .from(onboardingSubmissions)
    .where(and(eq(onboardingSubmissions.id, id), eq(onboardingSubmissions.status, "draft")))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found or not editable" }, { status: 404 })
  }

  // Only own org can edit
  if (existing.organizationId !== orgId) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const d = parsed.data
  const updated = await updateDraftSubmission(id, {
    organizationId: existing.organizationId,
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

  // Notify MSP if transitioning to pending
  if (d.action === "submit") {
    const [org] = await db.select({ name: organizations.name }).from(organizations)
      .where(eq(organizations.id, existing.organizationId)).limit(1)
    void notifyMspOfSubmission(id, org?.name ?? "Unknown")
  }

  return NextResponse.json({ success: true, data: updated })
}
