import { db } from "@/lib/db"
import {
  onboardingSubmissions, onboardingLineItems, onboardingAccessSelections,
  onboardingResourceSelections, onboardingApprovals, onboardingLocations,
  onboardingSharedResources, onboardingTicketConfigs, ateraMappings,
  mspBranding,
} from "@/lib/db/schema"
import { eq, and, desc, isNull, or, inArray } from "drizzle-orm"
import { createAteraTicket } from "@/lib/services/integrations/atera-client"
import {
  sendOnboardingSubmittedEmail, sendOnboardingApprovedEmail,
  sendOnboardingRejectedEmail, type OnboardingEmailData,
} from "@/lib/email"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineItemInput {
  catalogItemId?: string | null
  category: "computer" | "peripheral" | "monitor" | "license" | "service" | "other"
  description: string
  sku?: string | null
  supplier?: string | null
  quantity: number
  unitPrice: number
  sortOrder?: number
}

export interface CreateSubmissionInput {
  organizationId: string
  submittedByUserId?: string | null
  starterFirstName: string
  starterLastName: string
  starterEmail?: string | null
  starterPhone?: string | null
  starterJobTitle?: string | null
  startDate?: string | null
  phoneExtension?: string | null
  lineItems: LineItemInput[]
  selectedLocationIds: string[]
  selectedResourceIds: string[]
  quoteNotes?: string | null
  action: "draft" | "submit"
}

// ─── Options (locations + resources for a given org) ─────────────────────────

export async function getOnboardingOptions(organizationId: string) {
  const [locations, resources] = await Promise.all([
    db.select().from(onboardingLocations)
      .where(and(eq(onboardingLocations.organizationId, organizationId), eq(onboardingLocations.isActive, true)))
      .orderBy(onboardingLocations.sortOrder, onboardingLocations.name),
    db.select().from(onboardingSharedResources)
      .where(and(eq(onboardingSharedResources.organizationId, organizationId), eq(onboardingSharedResources.isActive, true)))
      .orderBy(onboardingSharedResources.sortOrder, onboardingSharedResources.name),
  ])
  return { locations, resources }
}

// ─── Create / Update submission ───────────────────────────────────────────────

export async function createSubmission(input: CreateSubmissionInput) {
  const totalQuotedPrice = input.lineItems
    .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    .toFixed(2)

  const status = input.action === "submit" ? "pending_approval" : "draft"
  const now = new Date()

  const [submission] = await db.insert(onboardingSubmissions).values({
    organizationId: input.organizationId,
    submittedByUserId: input.submittedByUserId ?? null,
    status,
    starterFirstName: input.starterFirstName,
    starterLastName: input.starterLastName,
    starterEmail: input.starterEmail ?? null,
    starterPhone: input.starterPhone ?? null,
    starterJobTitle: input.starterJobTitle ?? null,
    startDate: input.startDate ?? null,
    phoneExtension: input.phoneExtension ?? null,
    totalQuotedPrice: String(totalQuotedPrice),
    currency: "ZAR",
    quoteNotes: input.quoteNotes ?? null,
    submittedAt: status === "pending_approval" ? now : null,
  }).returning()

  await Promise.all([
    input.lineItems.length
      ? db.insert(onboardingLineItems).values(
          input.lineItems.map((item, i) => ({
            submissionId: submission.id,
            catalogItemId: item.catalogItemId ?? null,
            category: item.category,
            description: item.description,
            sku: item.sku ?? null,
            supplier: item.supplier ?? null,
            quantity: item.quantity,
            unitPrice: String(item.unitPrice),
            totalPrice: String((item.unitPrice * item.quantity).toFixed(2)),
            sortOrder: item.sortOrder ?? i,
          }))
        )
      : Promise.resolve(),
    input.selectedLocationIds.length
      ? db.insert(onboardingAccessSelections).values(
          input.selectedLocationIds.map((locationId) => ({
            submissionId: submission.id,
            locationId,
            granted: false,
          }))
        )
      : Promise.resolve(),
    input.selectedResourceIds.length
      ? db.insert(onboardingResourceSelections).values(
          input.selectedResourceIds.map((resourceId) => ({
            submissionId: submission.id,
            resourceId,
            granted: false,
          }))
        )
      : Promise.resolve(),
  ])

  return submission
}

export async function updateDraftSubmission(id: string, input: CreateSubmissionInput) {
  const totalQuotedPrice = input.lineItems
    .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    .toFixed(2)

  const status = input.action === "submit" ? "pending_approval" : "draft"
  const now = new Date()

  const [submission] = await db
    .update(onboardingSubmissions)
    .set({
      status,
      starterFirstName: input.starterFirstName,
      starterLastName: input.starterLastName,
      starterEmail: input.starterEmail ?? null,
      starterPhone: input.starterPhone ?? null,
      starterJobTitle: input.starterJobTitle ?? null,
      startDate: input.startDate ?? null,
      phoneExtension: input.phoneExtension ?? null,
      totalQuotedPrice: String(totalQuotedPrice),
      quoteNotes: input.quoteNotes ?? null,
      submittedAt: status === "pending_approval" ? now : null,
      updatedAt: now,
    })
    .where(eq(onboardingSubmissions.id, id))
    .returning()

  // Replace line items, access selections, resource selections
  await Promise.all([
    db.delete(onboardingLineItems).where(eq(onboardingLineItems.submissionId, id)),
    db.delete(onboardingAccessSelections).where(eq(onboardingAccessSelections.submissionId, id)),
    db.delete(onboardingResourceSelections).where(eq(onboardingResourceSelections.submissionId, id)),
  ])

  await Promise.all([
    input.lineItems.length
      ? db.insert(onboardingLineItems).values(
          input.lineItems.map((item, i) => ({
            submissionId: id,
            catalogItemId: item.catalogItemId ?? null,
            category: item.category,
            description: item.description,
            sku: item.sku ?? null,
            supplier: item.supplier ?? null,
            quantity: item.quantity,
            unitPrice: String(item.unitPrice),
            totalPrice: String((item.unitPrice * item.quantity).toFixed(2)),
            sortOrder: item.sortOrder ?? i,
          }))
        )
      : Promise.resolve(),
    input.selectedLocationIds.length
      ? db.insert(onboardingAccessSelections).values(
          input.selectedLocationIds.map((locationId) => ({
            submissionId: id,
            locationId,
            granted: false,
          }))
        )
      : Promise.resolve(),
    input.selectedResourceIds.length
      ? db.insert(onboardingResourceSelections).values(
          input.selectedResourceIds.map((resourceId) => ({
            submissionId: id,
            resourceId,
            granted: false,
          }))
        )
      : Promise.resolve(),
  ])

  return submission
}

// ─── Full submission detail ───────────────────────────────────────────────────

export async function getSubmissionWithDetails(id: string) {
  const [submission] = await db.select().from(onboardingSubmissions).where(eq(onboardingSubmissions.id, id)).limit(1)
  if (!submission) return null

  const [items, accessSels, resourceSels] = await Promise.all([
    db.select().from(onboardingLineItems)
      .where(eq(onboardingLineItems.submissionId, id))
      .orderBy(onboardingLineItems.sortOrder),
    db.select({
      id: onboardingAccessSelections.id,
      locationId: onboardingAccessSelections.locationId,
      granted: onboardingAccessSelections.granted,
      name: onboardingLocations.name,
      description: onboardingLocations.description,
    })
      .from(onboardingAccessSelections)
      .leftJoin(onboardingLocations, eq(onboardingAccessSelections.locationId, onboardingLocations.id))
      .where(eq(onboardingAccessSelections.submissionId, id)),
    db.select({
      id: onboardingResourceSelections.id,
      resourceId: onboardingResourceSelections.resourceId,
      granted: onboardingResourceSelections.granted,
      name: onboardingSharedResources.name,
      description: onboardingSharedResources.description,
    })
      .from(onboardingResourceSelections)
      .leftJoin(onboardingSharedResources, eq(onboardingResourceSelections.resourceId, onboardingSharedResources.id))
      .where(eq(onboardingResourceSelections.submissionId, id)),
  ])

  return { ...submission, lineItems: items, accessSelections: accessSels, resourceSelections: resourceSels }
}

// ─── Approval workflow ────────────────────────────────────────────────────────

async function getMspEmail(): Promise<string> {
  const [branding] = await db.select({ supportEmail: mspBranding.supportEmail }).from(mspBranding).limit(1)
  return branding?.supportEmail ?? process.env.MSP_SUPPORT_EMAIL ?? "support@msp.local"
}

async function buildEmailData(submissionId: string, orgName: string): Promise<OnboardingEmailData | null> {
  const detail = await getSubmissionWithDetails(submissionId)
  if (!detail) return null
  return {
    submissionId,
    starterFullName: `${detail.starterFirstName} ${detail.starterLastName}`,
    startDate: detail.startDate,
    jobTitle: detail.starterJobTitle,
    starterEmail: detail.starterEmail,
    organizationName: orgName,
    lineItems: detail.lineItems.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
    })),
    totalQuotedPrice: detail.totalQuotedPrice,
    currency: detail.currency ?? "ZAR",
    quoteNotes: detail.quoteNotes,
  }
}

export async function notifyMspOfSubmission(submissionId: string, orgName: string) {
  try {
    const [emailData, mspEmail] = await Promise.all([
      buildEmailData(submissionId, orgName),
      getMspEmail(),
    ])
    if (!emailData) return
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    await sendOnboardingSubmittedEmail(emailData, mspEmail, baseUrl)
  } catch (err) {
    console.error("[onboarding] Failed to send MSP notification email:", err)
  }
}

export async function approveSubmission(
  submissionId: string,
  actorUserId: string,
  orgId: string,
  orgName: string,
  notes?: string,
) {
  const now = new Date()

  // Transition to approved
  const [updated] = await db
    .update(onboardingSubmissions)
    .set({ status: "approved", updatedAt: now })
    .where(and(eq(onboardingSubmissions.id, submissionId), eq(onboardingSubmissions.status, "pending_approval")))
    .returning()

  if (!updated) throw new Error("Submission not found or not in pending_approval state")

  // Record approval
  await db.insert(onboardingApprovals).values({
    submissionId,
    approvedByUserId: actorUserId,
    action: "approved",
    notes: notes ?? null,
  })

  // Create Atera ticket (non-blocking — don't fail approval if ticket creation fails)
  let ateraTicketId: string | null = null
  try {
    const [mapping] = await db.select()
      .from(ateraMappings)
      .where(eq(ateraMappings.organizationId, orgId))
      .limit(1)

    if (mapping) {
      const customerId = parseInt(mapping.ateraCustomerId, 10)

      // Get ticket config (org-specific first, then global default)
      const configs = await db.select().from(onboardingTicketConfigs)
        .where(or(eq(onboardingTicketConfigs.organizationId, orgId), isNull(onboardingTicketConfigs.organizationId)))
        .limit(2)

      const config = configs.find((c) => c.organizationId === orgId) ?? configs[0]

      const starterName = `${updated.starterFirstName} ${updated.starterLastName}`
      const titleTemplate = config?.ticketTitleTemplate ?? "New Starter Onboarding: {{starter_name}}"
      const ticketTitle = titleTemplate.replace("{{starter_name}}", starterName)

      const detail = await getSubmissionWithDetails(submissionId)
      const itemLines = (detail?.lineItems ?? [])
        .map((i) => `  - ${i.description} (qty: ${i.quantity}, ${updated.currency ?? "ZAR"} ${parseFloat(i.unitPrice).toFixed(2)} each)`)
        .join("\n")

      const description = [
        `New Starter Onboarding Request`,
        ``,
        `Starter: ${starterName}`,
        updated.starterJobTitle ? `Job Title: ${updated.starterJobTitle}` : null,
        updated.startDate ? `Start Date: ${updated.startDate}` : null,
        updated.starterEmail ? `Email: ${updated.starterEmail}` : null,
        updated.starterPhone ? `Phone: ${updated.starterPhone}` : null,
        ``,
        `Equipment / Services:`,
        itemLines || `  None requested`,
        ``,
        `Total Quote: ${updated.currency ?? "ZAR"} ${parseFloat(updated.totalQuotedPrice ?? "0").toFixed(2)}`,
        updated.quoteNotes ? `\nNotes: ${updated.quoteNotes}` : null,
        notes ? `\nApproval Notes: ${notes}` : null,
      ].filter(Boolean).join("\n")

      const priorityMap: Record<string, "Low" | "Medium" | "High" | "Critical"> = {
        low: "Low", medium: "Medium", high: "High", critical: "Critical",
      }
      const priority = priorityMap[config?.ticketPriority ?? "medium"] ?? "Medium"

      const ticket = await createAteraTicket({
        TicketTitle: ticketTitle,
        Description: description,
        CustomerID: customerId,
        ContactName: `${updated.starterFirstName} ${updated.starterLastName}`,
        ContactEmail: updated.starterEmail ?? undefined,
        TicketType: "ServiceRequest",
        Priority: priority,
        TechnicianContactID: config?.ateraAssigneeTechnicianId
          ? parseInt(config.ateraAssigneeTechnicianId, 10)
          : undefined,
      })

      ateraTicketId = String(ticket.TicketID)

      await db.update(onboardingSubmissions)
        .set({ ateraTicketId, updatedAt: new Date() })
        .where(eq(onboardingSubmissions.id, submissionId))
    }
  } catch (err) {
    console.error("[onboarding] Failed to create Atera ticket:", err)
  }

  // Send approval email (non-blocking)
  try {
    const submitterEmail = updated.starterEmail
    if (submitterEmail) {
      const emailData = await buildEmailData(submissionId, orgName)
      if (emailData) {
        await sendOnboardingApprovedEmail(emailData, submitterEmail, ateraTicketId)
      }
    }
  } catch (err) {
    console.error("[onboarding] Failed to send approval email:", err)
  }

  return { ...updated, ateraTicketId }
}

export async function rejectSubmission(
  submissionId: string,
  actorUserId: string,
  orgName: string,
  rejectionReason: string,
  notes?: string,
) {
  const now = new Date()

  const [updated] = await db
    .update(onboardingSubmissions)
    .set({ status: "rejected", rejectionReason, updatedAt: now })
    .where(and(eq(onboardingSubmissions.id, submissionId), eq(onboardingSubmissions.status, "pending_approval")))
    .returning()

  if (!updated) throw new Error("Submission not found or not in pending_approval state")

  await db.insert(onboardingApprovals).values({
    submissionId,
    approvedByUserId: actorUserId,
    action: "rejected",
    notes: notes ?? null,
  })

  // Send rejection email (non-blocking)
  try {
    const submitterEmail = updated.starterEmail
    if (submitterEmail) {
      const emailData = await buildEmailData(submissionId, orgName)
      if (emailData) {
        await sendOnboardingRejectedEmail(emailData, submitterEmail, rejectionReason)
      }
    }
  } catch (err) {
    console.error("[onboarding] Failed to send rejection email:", err)
  }

  return updated
}
