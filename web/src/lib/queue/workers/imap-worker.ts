/**
 * BullMQ Worker — IMAP Polling
 *
 * Processes "imap-polling" queue jobs.
 * Each job calls processImapReplies() which connects to IMAP, reads unseen
 * messages, routes onboarding approval replies and ticket replies.
 *
 * A repeatable job is registered on boot via scheduleImapPolling().
 * Default interval: 5 minutes (configurable via IMAP_POLL_INTERVAL_MINUTES env).
 */

import { Worker } from "bullmq"
import { getBullMQConnection } from "../connection"
import { QUEUE_NAMES } from "../index"
import { processImapReplies } from "@/lib/services/imap"

let _worker: Worker | null = null

export function startImapWorker(): Worker {
  if (_worker) return _worker

  _worker = new Worker(
    QUEUE_NAMES.IMAP,
    async (job) => {
      console.log(`[ImapWorker] Polling IMAP inbox (job=${job.id})`)
      const result = await processImapReplies()
      console.log(`[ImapWorker] Poll complete: processed=${result.processed} errors=${result.errors}`)
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1, // Only one IMAP poll at a time
    }
  )

  _worker.on("completed", (job) => {
    console.log(`[ImapWorker] ✓ Job ${job.id} done`)
  })

  _worker.on("failed", (job, err) => {
    console.error(`[ImapWorker] ✗ Job ${job?.id} failed: ${err.message}`)
  })

  _worker.on("error", (err) => {
    console.error("[ImapWorker] Worker error:", err)
  })

  console.log("[ImapWorker] IMAP polling worker started")
  return _worker
}

export async function stopImapWorker() {
  if (_worker) {
    await _worker.close()
    _worker = null
  }
}
