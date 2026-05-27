/**
 * BullMQ Worker — Integration Sync
 *
 * Single worker that handles all integration sync jobs.
 * Dispatches to the appropriate handler based on job.data.integrationType.
 *
 * Started by instrumentation.ts when the Next.js server boots.
 * Only runs in the Node.js runtime (not Edge).
 */

import { Worker } from "bullmq"
import { getRedis } from "@/lib/redis"
import { QUEUE_NAMES, type SyncJobData } from "./index"
import { runAteraSync } from "./workers/atera-worker"
import { runUnifiSync } from "./workers/unifi-worker"
import { runUispSync } from "./workers/uisp-worker"

let _worker: Worker<SyncJobData> | null = null

export function startSyncWorker(): Worker<SyncJobData> {
  if (_worker) return _worker

  _worker = new Worker<SyncJobData>(
    QUEUE_NAMES.SYNC,
    async (job) => {
      const { organizationId, integrationType, triggeredBy } = job.data

      console.log(
        `[Worker] Processing job=${job.id} type=${integrationType} org=${organizationId} trigger=${triggeredBy ?? "unknown"}`
      )

      switch (integrationType) {
        case "atera":
          await runAteraSync(organizationId)
          break
        case "unifi":
          await runUnifiSync(organizationId)
          break
        case "uisp":
          await runUispSync(organizationId)
          break
        default:
          console.warn(`[Worker] Unknown integrationType: ${integrationType}`)
      }
    },
    {
      connection: getRedis(),
      concurrency: 5, // Process up to 5 orgs in parallel
    }
  ) as unknown as Worker<SyncJobData>

  _worker.on("completed", (job) => {
    console.log(`[Worker] ✓ Job ${job.id} completed (${job.data.integrationType}:${job.data.organizationId})`)
  })

  _worker.on("failed", (job, err) => {
    console.error(
      `[Worker] ✗ Job ${job?.id} failed (${job?.data.integrationType}:${job?.data.organizationId}): ${err.message}`
    )
  })

  _worker.on("error", (err) => {
    console.error("[Worker] Worker error:", err)
  })

  console.log("[Worker] Integration sync worker started")
  return _worker
}

export async function stopSyncWorker() {
  if (_worker) {
    await _worker.close()
    _worker = null
    console.log("[Worker] Integration sync worker stopped")
  }
}
