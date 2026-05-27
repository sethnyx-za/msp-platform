/**
 * Email service — Phase 7: DB-aware transporter.
 *
 * Priority order:
 *  1. Active email_configs row in DB (SMTP, Zoho, Gmail OAuth2, M365 OAuth2)
 *  2. SMTP_* env vars fallback
 *  3. Console log in dev (no config at all)
 */

import nodemailer from "nodemailer"
import { buildTransporter, getFromAddress } from "@/lib/services/email-config"

export interface EmailAttachment {
  filename: string
  content: Buffer | string
  contentType?: string
}

interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  attachments?: EmailAttachment[]
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const [transporter, from] = await Promise.all([
    buildTransporter(),
    getFromAddress(),
  ])

  if (!transporter) {
    console.log("[email] No transport configured — logging to console:")
    console.log(`  To: ${Array.isArray(options.to) ? options.to.join(", ") : options.to}`)
    console.log(`  Subject: ${options.subject}`)
    console.log(`  Body: ${options.text ?? options.html.replace(/<[^>]+>/g, " ")}`)
    return
  }

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  })
}

// ─── Email templates ──────────────────────────────────────────────────────────

export function baseLayout(content: string, companyName = "MSP Platform"): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #1e40af; padding: 20px 32px; color: #fff; font-size: 18px; font-weight: 600; }
    .body { padding: 32px; color: #111827; font-size: 14px; line-height: 1.6; }
    .footer { padding: 16px 32px; background: #f3f4f6; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; }
    table.items { width: 100%; border-collapse: collapse; margin: 16px 0; }
    table.items th { text-align: left; font-weight: 600; font-size: 12px; color: #374151; border-bottom: 2px solid #e5e7eb; padding: 8px 4px; }
    table.items td { padding: 8px 4px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    .btn { display: inline-block; background: #1e40af; color: #fff !important; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-weight: 600; margin-top: 16px; }
    .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
    .value { font-size: 14px; font-weight: 500; color: #111827; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">${companyName}</div>
    <div class="body">${content}</div>
    <div class="footer">This is an automated message from ${companyName}. Please do not reply directly to this email.</div>
  </div>
</body>
</html>`
}

export interface OnboardingEmailData {
  submissionId: string
  starterFullName: string
  startDate: string | null
  jobTitle: string | null
  starterEmail: string | null
  organizationName: string
  lineItems: { description: string; quantity: number; unitPrice: string; totalPrice: string }[]
  totalQuotedPrice: string | null
  currency: string
  quoteNotes: string | null
}

export async function sendOnboardingSubmittedEmail(
  data: OnboardingEmailData,
  mspEmail: string,
  adminPortalUrl: string,
): Promise<void> {
  const itemsHtml = data.lineItems.length
    ? `<table class="items">
        <thead><tr>
          <th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th>
        </tr></thead>
        <tbody>
          ${data.lineItems.map((i) => `<tr>
            <td>${i.description}</td>
            <td>${i.quantity}</td>
            <td>${data.currency} ${parseFloat(i.unitPrice).toFixed(2)}</td>
            <td>${data.currency} ${parseFloat(i.totalPrice).toFixed(2)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <p><strong>Total: ${data.currency} ${parseFloat(data.totalQuotedPrice ?? "0").toFixed(2)}</strong></p>`
    : "<p><em>No equipment requested.</em></p>"

  const html = baseLayout(`
    <h2 style="margin-top:0">New Onboarding Request</h2>
    <p>A new onboarding request has been submitted and is awaiting your approval.</p>
    <div class="label">New Starter</div>
    <div class="value">${data.starterFullName}${data.jobTitle ? ` — ${data.jobTitle}` : ""}</div>
    <div class="label">Client</div>
    <div class="value">${data.organizationName}</div>
    <div class="label">Start Date</div>
    <div class="value">${data.startDate ?? "Not specified"}</div>
    ${data.starterEmail ? `<div class="label">Starter Email</div><div class="value">${data.starterEmail}</div>` : ""}
    <h3 style="margin-top:24px">Equipment &amp; Services</h3>
    ${itemsHtml}
    ${data.quoteNotes ? `<p><strong>Notes:</strong> ${data.quoteNotes}</p>` : ""}
    <a href="${adminPortalUrl}/admin/onboarding/${data.submissionId}" class="btn">Review Request</a>
  `)

  // Embed submissionId in subject so the IMAP worker can route email replies
  await sendEmail({
    to: mspEmail,
    subject: `[REVIEW-${data.submissionId}] New Onboarding: ${data.starterFullName} at ${data.organizationName}`,
    html,
  })
}

export async function sendOnboardingApprovedEmail(
  data: OnboardingEmailData,
  recipientEmail: string,
  ateraTicketId: string | null,
): Promise<void> {
  const html = baseLayout(`
    <h2 style="margin-top:0">Onboarding Request Approved</h2>
    <p>Great news! The onboarding request for <strong>${data.starterFullName}</strong> has been approved.</p>
    <div class="label">Client</div>
    <div class="value">${data.organizationName}</div>
    <div class="label">Start Date</div>
    <div class="value">${data.startDate ?? "To be confirmed"}</div>
    <div class="label">Job Title</div>
    <div class="value">${data.jobTitle ?? "Not specified"}</div>
    ${ateraTicketId ? `<div class="label">Atera Ticket</div><div class="value">#${ateraTicketId} — Your IT team will follow up with next steps.</div>` : ""}
    <p style="margin-top:24px">Our team will be in touch to arrange equipment delivery and system setup before the start date.</p>
  `)

  await sendEmail({
    to: recipientEmail,
    subject: `Onboarding Approved: ${data.starterFullName}`,
    html,
  })
}

export async function sendOnboardingRejectedEmail(
  data: OnboardingEmailData,
  recipientEmail: string,
  rejectionReason: string,
): Promise<void> {
  const html = baseLayout(`
    <h2 style="margin-top:0">Onboarding Request Update</h2>
    <p>The onboarding request for <strong>${data.starterFullName}</strong> at <strong>${data.organizationName}</strong> could not be approved at this time.</p>
    <div class="label">Reason</div>
    <div class="value" style="background:#fef2f2; border:1px solid #fee2e2; border-radius:4px; padding:12px; color:#991b1b;">${rejectionReason}</div>
    <p style="margin-top:24px">Please contact your account manager if you believe this was made in error or to discuss alternative options.</p>
  `)

  await sendEmail({
    to: recipientEmail,
    subject: `Onboarding Request Update: ${data.starterFullName}`,
    html,
  })
}

// ─── Ticket email templates ───────────────────────────────────────────────────

export async function sendTicketConfirmationEmail(opts: {
  ticketId: string
  ateraTicketId: string | null
  title: string
  description: string | null
  priority: string
  organizationName: string
  submitterEmail: string
  portalUrl: string
}): Promise<void> {
  const html = baseLayout(`
    <h2 style="margin-top:0">Support Ticket Created</h2>
    <p>Your support request has been received and a ticket has been created.</p>
    <div class="label">Ticket Title</div>
    <div class="value">${opts.title}</div>
    ${opts.ateraTicketId ? `<div class="label">Ticket Reference</div><div class="value">#${opts.ateraTicketId}</div>` : ""}
    <div class="label">Priority</div>
    <div class="value" style="text-transform:capitalize;">${opts.priority}</div>
    ${opts.description ? `<div class="label">Description</div><div class="value">${opts.description}</div>` : ""}
    <p style="margin-top:24px">Our team will review your request and respond as soon as possible. You can track the status of your ticket in the portal.</p>
    <a href="${opts.portalUrl}/tickets/${opts.ticketId}" class="btn">View Ticket</a>
  `)

  await sendEmail({
    to: opts.submitterEmail,
    // Embed ticket ID in subject so IMAP worker can route replies
    subject: `[TICKET-${opts.ticketId}] Support Ticket Created: ${opts.title}`,
    html,
  })
}

export async function sendTicketMspNotificationEmail(opts: {
  ticketId: string
  title: string
  description: string | null
  priority: string
  category: string | null
  organizationName: string
  submitterName: string
  mspEmail: string
  portalUrl: string
}): Promise<void> {
  const html = baseLayout(`
    <h2 style="margin-top:0">New Support Ticket</h2>
    <p>A new support ticket has been submitted.</p>
    <div class="label">Client</div>
    <div class="value">${opts.organizationName}</div>
    <div class="label">Submitted by</div>
    <div class="value">${opts.submitterName}</div>
    <div class="label">Title</div>
    <div class="value">${opts.title}</div>
    <div class="label">Priority</div>
    <div class="value" style="text-transform:capitalize;">${opts.priority}</div>
    ${opts.category ? `<div class="label">Category</div><div class="value">${opts.category}</div>` : ""}
    ${opts.description ? `<div class="label">Description</div><div class="value">${opts.description}</div>` : ""}
    <a href="${opts.portalUrl}/admin/tickets/${opts.ticketId}" class="btn">View Ticket</a>
  `)

  await sendEmail({
    to: opts.mspEmail,
    subject: `[TICKET-${opts.ticketId}] New Ticket from ${opts.organizationName}: ${opts.title}`,
    html,
  })
}
