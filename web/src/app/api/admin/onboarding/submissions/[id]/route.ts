import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { onboardingSubmissions, organizations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import {
  getSubmissionWithDetails, approveSubmission, rejectSubmission,
} from "@/lib/services/onboarding"

interface RouteContext { params: Promise<{ id: string }> }

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    rejectionReason: z.string().min(1).max(1000),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal("complete"),
  }),
  z.object({
    action: z.literal("cancel"),
  }),
])

export async function GET(req: NextRequest, { params }: RouteContext) {
  const guard = guardMsp(req)
  if (guard) return guard

  const { id } = await params
  const detail = await getSubmissionWithDetails(id)
  if (!detail) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true, data: detail })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id") ?? ""
  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Get org name for emails
  const [sub] = await db.select({
    organizationId: onboardingSubmissions.organizationId,
    status: onboardingSubmissions.status,
  }).from(onboardingSubmissions).where(eq(onboardingSubmissions.id, id)).limit(1)

  if (!sub) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

  const [org] = await db.select({ name: organizations.name }).from(organizations)
    .where(eq(organizations.id, sub.organizationId)).limit(1)
  const orgName = org?.name ?? "Unknown"

  switch (parsed.data.action) {
    case "approve": {
      const result = await approveSubmission(id, actorId, sub.organizationId, orgName, parsed.data.notes)
      return NextResponse.json({ success: true, data: result })
    }
    case "reject": {
      const result = await rejectSubmission(id, actorId, orgName, parsed.data.rejectionReason, parsed.data.notes)
      return NextResponse.json({ success: true, data: result })
    }
    case "complete": {
      const [updated] = await db
        .update(onboardingSubmissions)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(onboardingSubmissions.id, id))
        .returning()
      return NextResponse.json({ success: true, data: updated })
    }
    case "cancel": {
      const [updated] = await db
        .update(onboardingSubmissions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(onboardingSubmissions.id, id))
        .returning()
      return NextResponse.json({ success: true, data: updated })
    }
  }
}
