export const SYNC_TAG = "sync-attendance"

declare global {
  interface ServiceWorkerRegistration {
    sync?: {
      register(tag: string): Promise<void>
    }
  }
}

export async function registerAttendanceSync(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return false
    }
    const registration = await navigator.serviceWorker.ready
    if (typeof registration.sync?.register === "function") {
      await registration.sync.register(SYNC_TAG)
      return true
    }
  } catch {
    // Background Sync is unavailable; the page-side flush below still syncs.
  }
  return false
}

export async function requestImmediateSync(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return
    }
    const registration = await navigator.serviceWorker.ready
    registration.active?.postMessage({ type: "SYNC_NOW" })
  } catch {
    // Ignore; the queue stays pending until the next trigger.
  }
}

export function setupSyncMessageHandlers(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
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