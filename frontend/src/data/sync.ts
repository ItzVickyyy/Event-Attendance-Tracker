import { AxiosError } from "axios"
import { AttendanceService } from "@/client"
import {
  getPendingScans,
  markFailed,
  markSynced,
  QUEUE_CHANGED_EVENT,
} from "./index"

export const SYNC_TAG = "sync-attendance"

declare global {
  interface ServiceWorkerRegistration {
    sync?: {
      register(tag: string): Promise<void>
    }
  }
}

/**
 * Resolves to the current registration only when one actually exists.
 *
 * `navigator.serviceWorker.ready` never resolves unless something has
 * registered a service worker; awaiting it directly hangs forever in
 * environments where nothing ever registers one (e.g. Vite dev, where
 * `vite-plugin-pwa`'s `devOptions.enabled` is `false`). `getRegistration()`
 * resolves immediately either way, so it is used as a cheap pre-check
 * before falling through to `ready` (which is still the correct way to
 * wait out the brief install/activate race in production).
 */
async function getExistingRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null
  }
  try {
    const existing = await navigator.serviceWorker.getRegistration()
    if (!existing) return null
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/**
 * True only when a service worker is registered, active, and controlling
 * this page — i.e. Background Sync / `SYNC_NOW` messaging can actually run.
 * `"serviceWorker" in navigator` alone is not enough: the API exists in
 * every modern browser regardless of whether anything is registered.
 */
export async function isServiceWorkerSyncActive(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false
  }
  if (!navigator.serviceWorker.controller) {
    return false
  }
  const registration = await getExistingRegistration()
  return Boolean(registration?.active)
}

export async function registerAttendanceSync(): Promise<boolean> {
  try {
    const registration = await getExistingRegistration()
    if (!registration) return false
    if (typeof registration.sync?.register === "function") {
      await registration.sync.register(SYNC_TAG)
      return true
    }
  } catch {
    // Background Sync is unavailable; the foreground fallback still syncs.
  }
  return false
}

/**
 * Posts the SYNC_NOW trigger to an active worker. Returns whether a worker
 * was actually available to receive it, so callers can fall back instead of
 * waiting on a message that will never come.
 */
export async function requestImmediateSync(): Promise<boolean> {
  try {
    const registration = await getExistingRegistration()
    if (!registration?.active) return false
    registration.active.postMessage({ type: "SYNC_NOW" })
    return true
  } catch {
    // Ignore; the queue stays pending until the next trigger.
  }
  return false
}

export interface SyncStatusInfo {
  needsRetry: boolean
  skipped: boolean
}

export function setupSyncStatusListener(handlers: {
  onSyncStart?: () => void
  onSyncEnd?: (info: SyncStatusInfo) => void
}): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => {}
  }
  const onMessage = (event: MessageEvent) => {
    const data = event.data as
      | { type?: string; needsRetry?: boolean; skipped?: boolean }
      | undefined
    if (data?.type === "PWA_SYNC_START") {
      handlers.onSyncStart?.()
    } else if (data?.type === "PWA_SYNC_END") {
      handlers.onSyncEnd?.({
        needsRetry: Boolean(data.needsRetry),
        skipped: Boolean(data.skipped),
      })
    }
  }
  navigator.serviceWorker.addEventListener("message", onMessage)
  return () => navigator.serviceWorker.removeEventListener("message", onMessage)
}

export function setupSyncMessageHandlers(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return
  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: string } | undefined
    if (data?.type !== "PWA_SYNC_GET_TOKEN") return
    const port = event.ports?.[0]
    if (!port) return
    port.postMessage({
      type: "PWA_SYNC_TOKEN",
      token: localStorage.getItem("access_token") ?? "",
      apiBase: import.meta.env.VITE_API_URL ?? "",
    })
  })
}

// ---------------------------------------------------------------------------
// Foreground sync fallback
//
// Used when no service worker is available to run background sync (Vite
// dev / LAN-phone development). Operates on the exact same `attendanceQueue`
// IndexedDB store as `public/sw-sync.js` and applies the same per-record
// outcome rules, so the queue ends up in an identical state regardless of
// which mechanism processed it. It does not create a second queue and does
// not duplicate attendance records.
// ---------------------------------------------------------------------------

export interface ForegroundSyncResult {
  /** Number of records that were pending at the start of this run. */
  processedCount: number
  /** Number of those records now synced (including 409 duplicates). */
  syncedCount: number
  /** True if any record failed in a way worth a user-visible retry hint. */
  needsRetry: boolean
  /** True if any record could not sync because of a missing/expired token. */
  authRequired: boolean
}

type RecordOutcome =
  | "synced"
  | "duplicate"
  | "unauthorized"
  | "failed"
  | "retry"

let foregroundSyncPromise: Promise<ForegroundSyncResult> | null = null

/**
 * Flushes the pending attendance queue directly from page context.
 *
 * Safe to call repeatedly and from multiple UI triggers at once: concurrent
 * calls share a single in-memory lock (`foregroundSyncPromise`) so two
 * "Sync now" clicks - or a click racing the automatic online-trigger in
 * `main.tsx` - can never start two overlapping foreground loops and never
 * process the same queue record twice.
 */
export function runForegroundSync(): Promise<ForegroundSyncResult> {
  if (foregroundSyncPromise) {
    return foregroundSyncPromise
  }
  const run = executeForegroundSync().finally(() => {
    foregroundSyncPromise = null
  })
  foregroundSyncPromise = run
  return run
}

async function executeForegroundSync(): Promise<ForegroundSyncResult> {
  const pending = await getPendingScans()
  let syncedCount = 0
  let needsRetry = false
  let authRequired = false

  // getPendingScans() already returns records sorted FIFO by created_at
  // (falling back to id), so processing them in order here is deterministic.
  for (const record of pending) {
    const outcome = await syncOneQueuedRecord(record)
    if (outcome === "synced" || outcome === "duplicate") syncedCount += 1
    if (outcome === "retry") needsRetry = true
    if (outcome === "unauthorized") authRequired = true
  }

  if (pending.length > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT))
  }

  return {
    processedCount: pending.length,
    syncedCount,
    needsRetry,
    authRequired,
  }
}

async function syncOneQueuedRecord(
  record: Awaited<ReturnType<typeof getPendingScans>>[number],
): Promise<RecordOutcome> {
  try {
    const response = await AttendanceService.scanAttendance({
      body: {
        event_id: record.event_id,
        credential_value: record.credential_value,
        scan_method: record.scan_method,
      },
    })
    const serverTimestamp =
      response.data?.attendance?.time_in ??
      response.data?.attendance?.created_at ??
      undefined
    await markSynced(record.id, {
      serverTimestamp: serverTimestamp ?? undefined,
    })
    return "synced"
  } catch (error) {
    if (
      !(error instanceof AxiosError) ||
      error.response?.status === undefined
    ) {
      // No HTTP response at all: a genuine network failure. Keep the
      // record pending and bump its retry metadata, same as sw-sync.js.
      await markFailed(record.id, "network-error")
      return "retry"
    }

    const status = error.response.status

    if (status === 409) {
      // Duplicate scan: the same resolution the service worker applies.
      await markSynced(record.id)
      return "duplicate"
    }

    if (status === 401) {
      // Invalid/expired token: leave the record pending and untouched.
      // It is retried automatically once the user has a valid session
      // again; never mark it synced on an auth failure.
      return "unauthorized"
    }

    await markFailed(record.id, `http-${status}`)
    return status >= 500 ? "retry" : "failed"
  }
}

export interface SyncNowResult {
  mechanism: "service-worker" | "foreground"
  authRequired: boolean
  needsRetry: boolean
}

/**
 * Single entry point for a manual "Sync now" trigger (or any other
 * on-demand sync request). Selects the correct mechanism:
 *
 *  - If a service worker is actually registered, active, and controlling
 *    the page, this uses the existing production Background Sync /
 *    `SYNC_NOW` messaging path unchanged. Completion is still reported
 *    asynchronously via the `PWA_SYNC_END` message (see
 *    `setupSyncStatusListener`) exactly as before this change.
 *  - Otherwise (no active service worker - e.g. Vite dev / LAN-phone
 *    development) it runs the foreground fallback and awaits its actual
 *    completion, so callers never need a fixed timeout to know when the
 *    sync operation is done.
 */
export async function syncNow(): Promise<SyncNowResult> {
  if (await isServiceWorkerSyncActive()) {
    await registerAttendanceSync()
    const delivered = await requestImmediateSync()
    if (delivered) {
      return {
        mechanism: "service-worker",
        authRequired: false,
        needsRetry: false,
      }
    }
    // The worker stopped controlling the page between the check above and
    // now (e.g. an update just took over) - fall back rather than leave
    // the caller waiting on a message that will never arrive.
  }
  const result = await runForegroundSync()
  return {
    mechanism: "foreground",
    authRequired: result.authRequired,
    needsRetry: result.needsRetry,
  }
}
