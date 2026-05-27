/**
 * Sync scheduler
 *
 * On server start, reads all integration_configs with syncEnabled=true
 * and not circuit-broken, then registers BullMQ repeatable jobs for each.
 *
 * Called from instrumentation.ts once on server boot.
 */

import { db } from "@/lib/db"
import { integrationConfigs, reportSchedules, reports, organizations } from "@/lib/db/schema"
import { eq, and, lte } from "drizzle-orm"
import { scheduleRepeatableSync, enqueueReportJob } from "./index"

export async function bootstrapSyncScheduler(): Promise<void> {
  try {
    // Load all enabled, non-broken integration configs
    const configs = await db
      .select()
      .from(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.syncEnabled, true),
          eq(integrationConfigs.circuitBroken, false)
        )
      )

    console.log(`[Scheduler] Bootstrapping ${configs.length} sync jobs...`)

    for (const config of configs) {
      // Only schedule types we have workers for
      if (!["atera", "unifi", "uisp"].includes(config.type)) continue

      await scheduleRepeatableSync(
        config.organizationId,
        config.type as "atera" | "unifi" | "uisp",
        config.syncIntervalMinutes
      )

      console.log(
        `[Scheduler] Scheduled ${config.type} sync for org=${config.organizationId} every ${config.syncIntervalMinutes}min`
      )
    }

    console.log("[Scheduler] Bootstrap complete")

    // Also kick off any overdue report schedules
    await checkDueReportSchedules()
  } catch (err) {
    // Scheduler failure should not crash the server
    console.error("[Scheduler] Bootstrap failed:", err)
  }
}

/**
 * Check for report schedules whose nextRunAt has passed and enqueue generation jobs.
 * Called on server boot and could also be called by a periodic heartbeat.
 */
export async function checkDueReportSchedules(): Promise<void> {
  try {
    const now = new Date()
    const dueSchedules = await db
      .select()
      .from(reportSchedules)
      .where(and(
        eq(reportSchedules.isActive, true),
        lte(reportSchedules.nextRunAt, now),
      ))

    if (dueSchedules.length === 0) return

    console.log(`[Scheduler] ${dueSchedules.length} report schedule(s) due`)

    for (const schedule of dueSchedules) {
      try {
        // Create a draft report record for this org
        const [org] = await db
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, schedule.organizationId))
          .limit(1)

        if (!org) continue

        const periodEnd = new Date()
        const periodStart = new Date()
        periodStart.setMonth(periodStart.getMonth() - 1)

        const [newReport] = await db.insert(reports).values({
          organizationId: schedule.organizationId,
          title: `${org.name} — ${periodStart.toLocaleString("default", { month: "long", year: "numeric" })} Report`,
          periodStart: periodStart.toISOString().split("T")[0],
          periodEnd: periodEnd.toISOString().split("T")[0],
          includesSubOrgs: schedule.includesSubOrgs,
          status: "draft",
        }).returning()

        await enqueueReportJob({
          reportId: newReport.id,
          triggeredBy: "schedule",
          scheduleId: schedule.id,
        })

        console.log(`[Scheduler] Enqueued report generation for schedule=${schedule.id}`)
      } catch (err) {
        console.error(`[Scheduler] Failed to process schedule ${schedule.id}:`, err)
      }
    }
  } catch (err) {
    console.error("[Scheduler] checkDueReportSchedules failed:", err)
  }
}
