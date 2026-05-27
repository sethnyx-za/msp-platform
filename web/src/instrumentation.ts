/**
 * Next.js Instrumentation Hook
 *
 * Called once when the server starts. We use this to:
 * 1. Start the BullMQ sync worker (processes queued jobs)
 * 2. Bootstrap the sync scheduler (registers repeatable jobs)
 *
 * This file MUST be in src/ (or root) and export a `register` function.
 * It only runs in the Node.js runtime, not Edge.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run in Node.js runtime (not Edge, not build-time)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Starting background services...")

    try {
      // Dynamic imports to avoid Edge runtime issues
      const { startSyncWorker } = await import("@/lib/queue/worker")
      const { startReportWorker } = await import("@/lib/queue/workers/report-worker")
      const { startImapWorker } = await import("@/lib/queue/workers/imap-worker")
      const { bootstrapSyncScheduler } = await import("@/lib/queue/scheduler")
      const { scheduleImapPolling } = await import("@/lib/queue")

      // Start the BullMQ workers
      startSyncWorker()
      startReportWorker()
      startImapWorker()

      // Give workers a moment to connect before scheduling
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Bootstrap repeatable sync jobs from DB
      await bootstrapSyncScheduler()

      // Schedule IMAP polling (default 5 min, override with IMAP_POLL_INTERVAL_MINUTES)
      const imapInterval = parseInt(process.env.IMAP_POLL_INTERVAL_MINUTES ?? "5")
      await scheduleImapPolling(imapInterval).catch((err) => {
        console.warn("[Instrumentation] IMAP scheduling failed (no IMAP config yet):", err)
      })
    } catch (err) {
      // Background service failures should not crash the app
      console.error("[Instrumentation] Failed to start background services:", err)
    }
  }
}
