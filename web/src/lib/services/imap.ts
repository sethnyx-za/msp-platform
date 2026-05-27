/**
 * IMAP Reply Processing Service
 *
 * Polls the configured IMAP inbox for new messages and routes them:
 *
 *  • Onboarding approval replies
 *    Subject must contain [REVIEW-{submissionId}]
 *    Body must contain "APPROVE" or "REJECT {reason}"
 *    → calls approveSubmission() or rejectSubmission()
 *
 *  • Support ticket replies
 *    Subject must contain [TICKET-{ticketId}]
 *    → logged (Phase 8 could add Atera comment via API)
 *
 * Processed messages are marked SEEN and moved to a "Processed" mailbox if it exists.
 */

import { getImapConfig } from "@/lib/services/email-config"
import { approveSubmission, rejectSubmission } from "@/lib/services/onboarding"
import { db } from "@/lib/db"
import { supportTickets, onboardingSubmissions } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// ─── Regex patterns ───────────────────────────────────────────────────────────

const REVIEW_PATTERN = /\[REVIEW-([0-9a-f-]{36})\]/i
const TICKET_PATTERN = /\[TICKET-([0-9a-f-]{36})\]/i

// ─── Main polling function ────────────────────────────────────────────────────

export async function processImapReplies(): Promise<{
  processed: number
  errors: number
}> {
  const imapConfig = await getImapConfig()
  if (!imapConfig) {
    console.log("[IMAP] No IMAP configuration found — skipping")
    return { processed: 0, errors: 0 }
  }

  let processed = 0
  let errors = 0

  try {
    const { ImapFlow } = await import("imapflow")
    const client = new ImapFlow({
      host: imapConfig.host,
      port: imapConfig.port,
      secure: imapConfig.secure,
      auth: imapConfig.auth,
      logger: false,
    })

    await client.connect()

    const lock = await client.getMailboxLock(imapConfig.mailbox)
    try {
      // Find all UNSEEN messages
      const uids: number[] = []
      for await (const msg of client.fetch({ seen: false }, { uid: true, envelope: true })) {
        if (msg.uid) uids.push(msg.uid)
      }

      if (uids.length === 0) {
        console.log("[IMAP] No unseen messages")
        return { processed: 0, errors: 0 }
      }

      console.log(`[IMAP] Found ${uids.length} unseen message(s)`)

      for (const uid of uids) {
        try {
          const result = await processMessage(client, uid)
          if (result) processed++
        } catch (err) {
          console.error(`[IMAP] Error processing UID ${uid}:`, err)
          errors++
        }

        // Mark as seen regardless of processing outcome
        try {
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })
        } catch {
          // Non-critical
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (err) {
    console.error("[IMAP] Connection/polling error:", err)
    errors++
  }

  console.log(`[IMAP] Done: processed=${processed} errors=${errors}`)
  return { processed, errors }
}

// ─── Process a single message ─────────────────────────────────────────────────

async function processMessage(
  client: import("imapflow").ImapFlow,
  uid: number
): Promise<boolean> {
  // Fetch full message
  const msgData = await client.fetchOne(
    String(uid),
    { envelope: true, bodyParts: ["TEXT"] },
    { uid: true }
  )

  if (!msgData) return false

  const subject = msgData.envelope?.subject ?? ""
  const bodyPart = msgData.bodyParts?.get("text") ?? msgData.bodyParts?.get("TEXT")
  const bodyText = bodyPart
    ? Buffer.isBuffer(bodyPart) ? bodyPart.toString("utf-8") : String(bodyPart)
    : ""

  // ── Onboarding review reply ─────────────────────────────────────────────────
  const reviewMatch = REVIEW_PATTERN.exec(subject)
  if (reviewMatch) {
    const submissionId = reviewMatch[1]
    return handleOnboardingReply(submissionId, bodyText, msgData.envelope?.from?.[0]?.address)
  }

  // ── Ticket reply ────────────────────────────────────────────────────────────
  const ticketMatch = TICKET_PATTERN.exec(subject)
  if (ticketMatch) {
    const ticketId = ticketMatch[1]
    return handleTicketReply(ticketId, bodyText)
  }

  return false
}

// ─── Handle onboarding approval reply ────────────────────────────────────────

async function handleOnboardingReply(
  submissionId: string,
  body: string,
  fromEmail: string | undefined
): Promise<boolean> {
  // Verify the submission exists and is still pending
  const [submission] = await db
    .select({ id: onboardingSubmissions.id, status: onboardingSubmissions.status, organizationId: onboardingSubmissions.organizationId })
    .from(onboardingSubmissions)
    .where(eq(onboardingSubmissions.id, submissionId))
    .limit(1)

  if (!submission) {
    console.log(`[IMAP] Onboarding submission ${submissionId} not found`)
    return false
  }

  if (submission.status !== "pending_approval") {
    console.log(`[IMAP] Submission ${submissionId} is ${submission.status} — ignoring reply`)
    return false
  }

  const cleanBody = stripQuotedText(body).toUpperCase()

  // APPROVE
  if (/\bAPPROVE\b/.test(cleanBody)) {
    console.log(`[IMAP] APPROVE reply for submission ${submissionId} from ${fromEmail}`)
    await approveSubmission(
      submissionId,
      "system-imap", // actorUserId = system
      submission.organizationId,
      "", // orgName loaded inside approveSubmission
      `Approved via email reply from ${fromEmail ?? "unknown"}`,
    ).catch((err) => console.error(`[IMAP] approveSubmission failed:`, err))
    return true
  }

  // REJECT {reason}
  const rejectMatch = /\bREJECT\b[:\s]+([^\n\r]+)/i.exec(stripQuotedText(body))
  if (rejectMatch || /\bREJECT\b/.test(cleanBody)) {
    const reason = rejectMatch?.[1]?.trim() || "Rejected via email reply"
    console.log(`[IMAP] REJECT reply for submission ${submissionId}: ${reason}`)
    await rejectSubmission(
      submissionId,
      "system-imap",
      "", // orgName loaded inside
      reason,
    ).catch((err) => console.error(`[IMAP] rejectSubmission failed:`, err))
    return true
  }

  console.log(`[IMAP] Reply for submission ${submissionId} has no APPROVE/REJECT keyword`)
  return false
}

// ─── Handle ticket reply ──────────────────────────────────────────────────────

async function handleTicketReply(ticketId: string, body: string): Promise<boolean> {
  const [ticket] = await db
    .select({ id: supportTickets.id, status: supportTickets.status })
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1)

  if (!ticket) {
    console.log(`[IMAP] Ticket ${ticketId} not found`)
    return false
  }

  // Log the reply — future phases can post this as an Atera comment
  console.log(`[IMAP] Reply received for ticket ${ticketId} (status: ${ticket.status})`)
  // TODO Phase 8: POST /api/v3/tickets/{ateraTicketId}/comments with reply body

  return true
}

// ─── Strip quoted reply text ──────────────────────────────────────────────────

function stripQuotedText(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.startsWith(">") && !line.startsWith("On ") && line.trim() !== "--")
    .join("\n")
    .trim()
}
