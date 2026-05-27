/**
 * BullMQ queue definitions
 *
 * All queues share the same Redis connection.
 * Workers are started via src/instrumentation.ts when the Next.js server boots.
 */

import { Queue, QueueEvents } from "bullmq"
import { getRedis } from "@/lib/redis"

// ─── Job payload types ────────────────────────────────────────────────────────

export interface SyncJobData {
  organizationId: string
  integrationType: "atera" | "unifi" | "uisp"
  triggeredBy?: "scheduler" | "manual"
}

export interface ReportJobData {
  reportId: string
  triggeredBy?: "manual" | "schedule"
  scheduleId?: string
}

// ─── Queue names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  SYNC: "integration-sync",
  REPORTS: "report-generation",
  IMAP: "imap-polling",
} as const

// ─── Singleton queues ─────────────────────────────────────────────────────────

let _syncQueue: Queue<SyncJobData> | null = null
let _syncQueueEvents: QueueEvents | null = null
let _reportQueue: Queue<ReportJobData> | null = null
let _imapQueue: Queue | null = null

export function getSyncQueue(): Queue<SyncJobData> {
  if (!_syncQueue) {
    _syncQueue = new Queue<SyncJobData>(QUEUE_NAMES.SYNC, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 }, // 5s, 10s, 20s
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    })
  }
  return _syncQueue
}

export function getSyncQueueEvents(): QueueEvents {
  if (!_syncQueueEvents) {
    _syncQueueEvents = new QueueEvents(QUEUE_NAMES.SYNC, {
      connection: getRedis(),
    })
  }
  return _syncQueueEvents
}

// ─── Helper: enqueue a one-off sync ──────────────────────────────────────────

export async function enqueueSyncJob(data: SyncJobData, delayMs = 0) {
  const queue = getSyncQueue()
  const jobId = `${data.integrationType}:${data.organizationId}:${Date.now()}`
  return queue.add(`${data.integrationType}-sync`, data, {
    jobId,
    delay: delayMs,
  })
}

// ─── Helper: set up repeatable sync for an org ────────────────────────────────

export async function scheduleRepeatableSync(
  organizationId: string,
  integrationType: SyncJobData["integrationType"],
  intervalMinutes: number
) {
  const queue = getSyncQueue()
  // BullMQ repeatable job key = name:pattern
  const jobName = `${integrationType}-sync`
  const repeatKey = `${integrationType}:${organizationId}`

  // Remove any existing repeatable job for this org+type first
  const repeatables = await queue.getRepeatableJobs()
  for (const job of repeatables) {
    if (job.key.includes(repeatKey)) {
      await queue.removeRepeatableByKey(job.key)
    }
  }

  // Add new repeatable job
  await queue.add(
    jobName,
    { organizationId, integrationType, triggeredBy: "scheduler" },
    {
      repeat: { every: intervalMinutes * 60 * 1000 },
      jobId: `repeat:${repeatKey}`,
    }
  )
}

export async function removeRepeatableSync(
  organizationId: string,
  integrationType: SyncJobData["integrationType"]
) {
  const queue = getSyncQueue()
  const repeatKey = `${integrationType}:${organizationId}`
  const repeatables = await queue.getRepeatableJobs()
  for (const job of repeatables) {
    if (job.key.includes(repeatKey)) {
      await queue.removeRepeatableByKey(job.key)
    }
  }
}

// ─── Report generation queue ──────────────────────────────────────────────────

export function getReportQueue(): Queue<ReportJobData> {
  if (!_reportQueue) {
    _reportQueue = new Queue<ReportJobData>(QUEUE_NAMES.REPORTS, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 10000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    })
  }
  return _reportQueue
}

export async function enqueueReportJob(data: ReportJobData) {
  const queue = getReportQueue()
  return queue.add("generate-report", data, {
    jobId: `report:${data.reportId}:${Date.now()}`,
  })
}

// ─── IMAP polling queue ───────────────────────────────────────────────────────

export function getImapQueue(): Queue {
  if (!_imapQueue) {
    _imapQueue = new Queue(QUEUE_NAMES.IMAP, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 2,
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    })
  }
  return _imapQueue
}

/** Register a repeatable IMAP polling job (every N minutes). */
export async function scheduleImapPolling(intervalMinutes = 5) {
  const queue = getImapQueue()
  // Remove existing repeatable job first
  const repeatables = await queue.getRepeatableJobs()
  for (const job of repeatables) {
    if (job.name === "poll-imap") {
      await queue.removeRepeatableByKey(job.key)
    }
  }
  await queue.add(
    "poll-imap",
    {},
    { repeat: { every: intervalMinutes * 60 * 1000 } }
  )
}
