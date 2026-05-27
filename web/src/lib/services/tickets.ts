/**
 * Support Ticket Service
 *
 * Handles ticket creation, Atera integration, and status syncing.
 * Atera ticket creation is non-blocking — if the API call fails, the local
 * ticket is still created and ateraTicketId remains null.
 */

import { db } from "@/lib/db"
import {
  supportTickets, ateraMappings, mspBranding, users,
  userOrganizationMemberships, organizations,
} from "@/lib/db/schema"
import { eq, and, desc, ilike, or } from "drizzle-orm"
import {
  createAteraTicket,
  getAteraTicket,
  listAteraTickets,
  type AteraTicket,
} from "@/lib/services/integrations/atera-client"
import {
  sendTicketConfirmationEmail,
  sendTicketMspNotificationEmail,
} from "@/lib/email"

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketPriority = "low" | "medium" | "high" | "critical"
export type TicketStatus = "open" | "in_progress" | "pending_customer" | "resolved" | "closed"

export interface CreateTicketInput {
  title: string
  description?: string
  category?: string
  priority?: TicketPriority
}

// ─── Atera status mapping ─────────────────────────────────────────────────────

const ATERA_PRIORITY_MAP: Record<TicketPriority, "Low" | "Medium" | "High" | "Critical"> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
}

function mapAteraStatus(ateraStatus: string): TicketStatus {
  const s = ateraStatus.toLowerCase()
  if (s.includes("pending customer")) return "pending_customer"
  if (s.includes("pending")) return "in_progress"
  if (s.includes("resolved")) return "resolved"
  if (s.includes("closed")) return "closed"
  if (s.includes("in progress")) return "in_progress"
  return "open"
}

// ─── Create ticket ────────────────────────────────────────────────────────────

export async function createTicket(
  input: CreateTicketInput,
  organizationId: string,
  submittedByUserId: string,
): Promise<typeof supportTickets.$inferSelect> {
  const priority = input.priority ?? "medium"

  // 1. Create local ticket record
  const [ticket] = await db.insert(supportTickets).values({
    organizationId,
    submittedByUserId,
    title: input.title,
    description: input.description ?? null,
    category: input.category ?? null,
    priority,
    status: "open",
  }).returning()

  // 2. Create Atera ticket (non-blocking)
  ;(async () => {
    try {
      const [mapping] = await db
        .select()
        .from(ateraMappings)
        .where(eq(ateraMappings.organizationId, organizationId))
        .limit(1)

      if (!mapping) return

      const customerId = parseInt(mapping.ateraCustomerId, 10)
      if (isNaN(customerId)) return

      // Get submitter details for Atera contact fields
      const [submitter] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, submittedByUserId))
        .limit(1)

      const ateraTicket = await createAteraTicket({
        TicketTitle: input.title,
        Description: input.description ?? input.title,
        CustomerID: customerId,
        ContactName: submitter?.name ?? undefined,
        ContactEmail: submitter?.email ?? undefined,
        Priority: ATERA_PRIORITY_MAP[priority],
        TicketType: "ServiceRequest",
      })

      await db
        .update(supportTickets)
        .set({
          ateraTicketId: String(ateraTicket.TicketID),
          ateraData: ateraTicket as unknown as Record<string, unknown>,
          ateraSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticket.id))
    } catch (err) {
      console.error(`[Tickets] Failed to create Atera ticket for ${ticket.id}:`, err)
    }
  })()

  // 3. Send emails (non-blocking)
  ;(async () => {
    try {
      const [branding] = await db.select().from(mspBranding).limit(1)
      const portalUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
      const mspSupportEmail = branding?.supportEmail ?? process.env.MSP_SUPPORT_EMAIL

      const [submitter] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, submittedByUserId))
        .limit(1)

      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1)

      if (submitter?.email) {
        await sendTicketConfirmationEmail({
          ticketId: ticket.id,
          ateraTicketId: null, // Will be updated async when Atera ticket is created
          title: ticket.title,
          description: ticket.description,
          priority: ticket.priority,
          organizationName: org?.name ?? "",
          submitterEmail: submitter.email,
          portalUrl,
        }).catch(console.error)
      }

      if (mspSupportEmail) {
        await sendTicketMspNotificationEmail({
          ticketId: ticket.id,
          title: ticket.title,
          description: ticket.description,
          priority: ticket.priority,
          category: ticket.category,
          organizationName: org?.name ?? "",
          submitterName: submitter?.name ?? "Unknown",
          mspEmail: mspSupportEmail,
          portalUrl,
        }).catch(console.error)
      }
    } catch (err) {
      console.error(`[Tickets] Email notification failed for ${ticket.id}:`, err)
    }
  })()

  return ticket
}

// ─── Sync ticket status from Atera ───────────────────────────────────────────

export async function syncTicketFromAtera(localTicketId: string): Promise<void> {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, localTicketId))
    .limit(1)

  if (!ticket?.ateraTicketId) return

  try {
    const ateraTicket = await getAteraTicket(parseInt(ticket.ateraTicketId, 10))
    const newStatus = mapAteraStatus(ateraTicket.TicketStatus)

    const updates: Record<string, unknown> = {
      status: newStatus,
      ateraAssigneeName: null,
      ateraData: ateraTicket as unknown as Record<string, unknown>,
      ateraSyncedAt: new Date(),
      updatedAt: new Date(),
    }

    if (newStatus === "resolved" && !ticket.resolvedAt) updates.resolvedAt = new Date()
    if (newStatus === "closed" && !ticket.closedAt) updates.closedAt = new Date()

    await db.update(supportTickets).set(updates).where(eq(supportTickets.id, localTicketId))
  } catch (err) {
    console.error(`[Tickets] Failed to sync ticket ${localTicketId} from Atera:`, err)
  }
}

// ─── Bulk sync tickets for an org from Atera ─────────────────────────────────

export async function syncOrgTicketsFromAtera(organizationId: string): Promise<number> {
  const [mapping] = await db
    .select()
    .from(ateraMappings)
    .where(eq(ateraMappings.organizationId, organizationId))
    .limit(1)

  if (!mapping) return 0

  const customerId = parseInt(mapping.ateraCustomerId, 10)
  if (isNaN(customerId)) return 0

  let synced = 0
  try {
    const ateraTickets = await listAteraTickets(customerId)

    for (const at of ateraTickets) {
      const ateraTicketId = String(at.TicketID)
      const newStatus = mapAteraStatus(at.TicketStatus)

      // Find matching local ticket
      const [local] = await db
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.organizationId, organizationId),
          eq(supportTickets.ateraTicketId, ateraTicketId),
        ))
        .limit(1)

      if (local) {
        const updates: Record<string, unknown> = {
          status: newStatus,
          ateraData: at as unknown as Record<string, unknown>,
          ateraSyncedAt: new Date(),
          updatedAt: new Date(),
        }
        if (newStatus === "resolved" && !local.resolvedAt) updates.resolvedAt = new Date()
        if (newStatus === "closed" && !local.closedAt) updates.closedAt = new Date()

        await db.update(supportTickets).set(updates).where(eq(supportTickets.id, local.id))
        synced++
      }
    }
  } catch (err) {
    console.error(`[Tickets] Bulk sync failed for org ${organizationId}:`, err)
  }

  return synced
}
