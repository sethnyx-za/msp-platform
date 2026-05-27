/**
 * BullMQ Worker — Report Generation
 *
 * Processes "report-generation" queue jobs.
 * Each job generates a PDF for a given reportId and optionally
 * emails it to the recipients defined by a schedule.
 *
 * Started by instrumentation.ts alongside the sync worker.
 */

import { Worker } from "bullmq"
import { getRedis } from "@/lib/redis"
import { QUEUE_NAMES, type ReportJobData } from "../index"
import { generateReportPdf, getReportPdfPath } from "@/lib/services/pdf"
import { db } from "@/lib/db"
import {
  reports, reportSchedules, reportDeliveryLogs, users,
  userOrganizationMemberships, organizations,
} from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"
import { sendEmail, baseLayout } from "@/lib/email"
import { readFile } from "fs/promises"
import { existsSync } from "fs"

let _worker: Worker<ReportJobData> | null = null

export function startReportWorker(): Worker<ReportJobData> {
  if (_worker) return _worker

  _worker = new Worker<ReportJobData>(
    QUEUE_NAMES.REPORTS,
    async (job) => {
      const { reportId, scheduleId } = job.data
      console.log(`[ReportWorker] Generating report ${reportId}`)

      // Generate the PDF
      const result = await generateReportPdf(reportId)

      if (!result.success) {
        throw new Error(result.error ?? "PDF generation failed")
      }

      // If triggered by a schedule, email recipients
      if (scheduleId) {
        await deliverReportToScheduleRecipients(reportId, scheduleId)
      }
    },
    {
      connection: getRedis(),
      concurrency: 2,
    }
  )

  _worker.on("completed", (job) => {
    console.log(`[ReportWorker] ✓ Report ${job.data.reportId} generated`)
  })

  _worker.on("failed", (job, err) => {
    console.error(`[ReportWorker] ✗ Report ${job?.data.reportId} failed: ${err.message}`)
  })

  _worker.on("error", (err) => {
    console.error("[ReportWorker] Worker error:", err)
  })

  console.log("[ReportWorker] Report generation worker started")
  return _worker
}

export async function stopReportWorker() {
  if (_worker) {
    await _worker.close()
    _worker = null
  }
}

// ─── Schedule delivery ────────────────────────────────────────────────────────

async function deliverReportToScheduleRecipients(reportId: string, scheduleId: string) {
  try {
    const [schedule] = await db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.id, scheduleId))
      .limit(1)

    if (!schedule) return

    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1)

    if (!report) return

    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, report.organizationId))
      .limit(1)

    const recipientIds = (schedule.recipientUserIds as string[]) ?? []
    if (recipientIds.length === 0) return

    // Get user emails
    const recipientUsers = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(inArray(users.id, recipientIds))

    // Read PDF buffer
    const pdfPath = getReportPdfPath(reportId)
    if (!existsSync(pdfPath)) return
    const pdfBuffer = await readFile(pdfPath)

    for (const recipient of recipientUsers) {
      if (!recipient.email) continue
      try {
        await sendEmail({
          to: recipient.email,
          subject: `Report Ready: ${report.title}`,
          html: baseLayout(`
            <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;">Your Report is Ready</h2>
            <p style="margin:0 0 12px;color:#374151;">Hi ${recipient.name ?? "there"},</p>
            <p style="margin:0 0 20px;color:#374151;">
              Your scheduled report <strong>${report.title}</strong> for <strong>${org?.name ?? ""}</strong>
              has been generated and is attached to this email.
            </p>
            <p style="color:#6b7280;font-size:13px;">Period: ${report.periodStart} – ${report.periodEnd}</p>
          `, "MSP Platform"),
          attachments: [
            {
              filename: `${report.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        })

        // Log successful delivery
        await db.insert(reportDeliveryLogs).values({
          reportId,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          status: "sent",
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        await db.insert(reportDeliveryLogs).values({
          reportId,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          status: "failed",
          errorMessage: message,
        })
      }
    }

    // Update schedule lastRunAt + calculate nextRunAt
    const nextRun = computeNextRunAt(schedule.frequency, schedule.scheduledDay)
    await db
      .update(reportSchedules)
      .set({ lastRunAt: new Date(), nextRunAt: nextRun, updatedAt: new Date() })
      .where(eq(reportSchedules.id, scheduleId))
  } catch (err) {
    console.error(`[ReportWorker] Failed to deliver report ${reportId}:`, err)
  }
}

function computeNextRunAt(
  frequency: "weekly" | "monthly" | "quarterly" | "on_demand",
  scheduledDay: number
): Date {
  const now = new Date()
  const next = new Date(now)

  if (frequency === "weekly") {
    // scheduledDay = 1 (Mon) – 7 (Sun)
    const current = now.getDay() || 7 // Convert 0=Sun to 7
    const diff = scheduledDay - current
    next.setDate(now.getDate() + (diff <= 0 ? diff + 7 : diff))
    next.setHours(6, 0, 0, 0)
  } else if (frequency === "monthly") {
    // scheduledDay = day of month (1–28)
    next.setMonth(now.getMonth() + 1)
    next.setDate(Math.min(scheduledDay, 28))
    next.setHours(6, 0, 0, 0)
  } else if (frequency === "quarterly") {
    next.setMonth(now.getMonth() + 3)
    next.setDate(Math.min(scheduledDay, 28))
    next.setHours(6, 0, 0, 0)
  } else {
    // on_demand — no automatic next run
    next.setFullYear(2099)
  }

  return next
}
