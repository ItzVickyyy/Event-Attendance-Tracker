import {
  test as base,
  type CDPSession,
  expect,
  type Page,
} from "@playwright/test"

/**
 * Covers the page-context foreground sync fallback added in
 * `frontend/src/data/sync.ts` (`runForegroundSync` / `syncNow`), used when
 * no service worker is available to run background sync - e.g. `bun run
 * dev` for LAN/phone development, where `vite-plugin-pwa`'s
 * `devOptions.enabled` is intentionally `false` (see `development.md`).
 *
 * `background-sync.spec.ts` covers the existing service-worker path and is
 * unaffected by this change. These tests exercise the same
 * `attendanceQueue` IndexedDB store and the same outcome rules from the
 * opposite (no-service-worker) side, plus the mechanism-selection and
 * concurrency-lock logic that decides which path runs.
 */

const SCAN_URL = "**/api/v1/attendance/scan*"

interface QueueRecordLike {
  id: string
  event_id: string
  credential_value: string
  scan_method: string
  client_timestamp: string
  local_id: string
  synced: boolean
  synced_at?: string
  retry_count: number
  last_error?: string
  last_retry_at?: string
  created_at: string
  synced_at_server?: string
}

interface MockScanResponse {
  status?: number
  json?: unknown
  abort?: boolean
}

interface SentScan {
  body: Record<string, unknown>
  authorization: string
}

interface MockScanHandle {
  sent(): SentScan[]
  count(): number
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
}

function record(overrides: Partial<QueueRecordLike> = {}): QueueRecordLike {
  const created_at = "2026-01-01T00:00:00.000Z"
  return {
    id: "rec-1",
    event_id: "evt-1",
    credential_value: "CRED-1",
    scan_method: "qr",
    client_timestamp: created_at,
    local_id: "rec-1",
    synced: false,
    retry_count: 0,
    created_at,
    ...overrides,
  }
}

const test = base.extend<{
  mockScan: (
    page: Page,
    responder: (
      body: Record<string, unknown>,
    ) => MockScanResponse | Promise<MockScanResponse>,
  ) => Promise<MockScanHandle>
}>({
  mockScan: async ({ context }, use) => {
    const browser = context.browser()
    if (!browser) throw new Error("no browser for browser-level CDP session")
    const cdp: CDPSession = await browser.newBrowserCDPSession()
    await use(async (_page: Page, responder) => {
      const sent: SentScan[] = []
      await cdp.send("Fetch.enable", {
        patterns: [{ urlPattern: SCAN_URL, requestStage: "Request" }],
      })
      cdp.on(
        "Fetch.requestPaused",
        async (event: {
          requestId: string
          request: {
            method: string
            url: string
            postData?: string
            headers: Record<string, string>
          }
        }) => {
          const { requestId, request } = event
          if (request.method === "OPTIONS") {
            await cdp.send("Fetch.fulfillRequest", {
              requestId,
              responseCode: 204,
              responseHeaders: [
                {
                  name: "access-control-allow-origin",
                  value: corsHeaders["access-control-allow-origin"],
                },
                {
                  name: "access-control-allow-methods",
                  value: corsHeaders["access-control-allow-methods"],
                },
                {
                  name: "access-control-allow-headers",
                  value: corsHeaders["access-control-allow-headers"],
                },
              ],
            })
            return
          }
          const body = (
            request.postData ? JSON.parse(request.postData) : {}
          ) as Record<string, unknown>
          const authHeader = Object.entries(request.headers).find(
            ([k]) => k.toLowerCase() === "authorization",
          )
          sent.push({
            body,
            authorization: authHeader ? authHeader[1] : "",
          })
          const result = await responder(body)
          if (result.abort) {
            await cdp.send("Fetch.failRequest", {
              requestId,
              errorReason: "Failed",
            })
            return
          }
          const responseBody = Buffer.from(
            JSON.stringify(result.json ?? {}),
          ).toString("base64")
          await cdp.send("Fetch.fulfillRequest", {
            requestId,
            responseCode: result.status ?? 200,
            responseHeaders: [
              { name: "content-type", value: "application/json" },
              ...Object.entries(corsHeaders).map(([name, value]) => ({
                name,
                value,
              })),
            ],
            body: responseBody,
          })
        },
      )
      return {
        sent: () => sent,
        count: () => sent.length,
      }
    })
    await cdp.detach()
  },
})

async function gotoApp(page: Page): Promise<void> {
  await page.goto("/login")
}

async function setToken(
  page: Page,
  token = "test-access-token",
): Promise<void> {
  await page.evaluate(
    (value) => localStorage.setItem("access_token", value),
    token,
  )
}

async function seedRecords(
  page: Page,
  records: QueueRecordLike[],
): Promise<void> {
  await page.evaluate(
    (recs) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("attendance-offline", 2)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains("attendanceQueue")) {
            const store = db.createObjectStore("attendanceQueue", {
              keyPath: "id",
            })
            store.createIndex("by-synced-created", ["synced", "created_at"])
            store.createIndex("by-synced", "synced")
          }
          if (!db.objectStoreNames.contains("rosters")) {
            db.createObjectStore("rosters", { keyPath: "event_id" })
          }
        }
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction("attendanceQueue", "readwrite")
          const store = tx.objectStore("attendanceQueue")
          for (const rec of recs) store.add(rec)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error)
        }
        request.onerror = () => reject(request.error)
      }),
    records,
  )
}

async function readQueue(page: Page): Promise<QueueRecordLike[]> {
  return page.evaluate(
    () =>
      new Promise<QueueRecordLike[]>((resolve, reject) => {
        const request = indexedDB.open("attendance-offline", 2)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction("attendanceQueue", "readonly")
          const getAll = tx.objectStore("attendanceQueue").getAll()
          getAll.onsuccess = () => {
            const records = getAll.result as QueueRecordLike[]
            records.sort((a, b) =>
              a.created_at < b.created_at
                ? -1
                : a.created_at > b.created_at
                  ? 1
                  : 0,
            )
            db.close()
            resolve(records)
          }
          getAll.onerror = () => reject(getAll.error)
        }
        request.onerror = () => reject(request.error)
      }),
  )
}

/** Runs the foreground sync module function directly in page context. */
async function runForegroundSync(page: Page): Promise<{
  processedCount: number
  syncedCount: number
  needsRetry: boolean
  authRequired: boolean
}> {
  return page.evaluate(async () => {
    const syncModulePath = "/src/data/sync.ts"
    const mod = await import(syncModulePath)
    return mod.runForegroundSync()
  })
}

test.describe("Foreground sync fallback (no service worker)", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("there is no active service worker in dev, so syncNow selects the foreground path", async ({
    page,
  }) => {
    await gotoApp(page)
    const active = await page.evaluate(
      () =>
        "serviceWorker" in navigator && !!navigator.serviceWorker.controller,
    )
    expect(active).toBe(false)

    const mechanism = await page.evaluate(async () => {
      const syncModulePath = "/src/data/sync.ts"
      const mod = await import(syncModulePath)
      const active = await mod.isServiceWorkerSyncActive()
      return active ? "service-worker" : "foreground"
    })
    expect(mechanism).toBe("foreground")
  })

  test("processes multiple pending records in creation (FIFO) order", async ({
    page,
    mockScan,
  }) => {
    const scan = await mockScan(page, () => ({
      status: 201,
      json: { message: "ok", attendance: {}, attendee_id: "a" },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [
      record({
        id: "rec-a",
        credential_value: "CRED-A",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      record({
        id: "rec-b",
        credential_value: "CRED-B",
        created_at: "2026-01-01T00:00:01.000Z",
      }),
      record({
        id: "rec-c",
        credential_value: "CRED-C",
        created_at: "2026-01-01T00:00:02.000Z",
      }),
    ])

    const result = await runForegroundSync(page)

    expect(result.processedCount).toBe(3)
    expect(result.syncedCount).toBe(3)
    expect(scan.count()).toBe(3)
    expect(scan.sent().map((entry) => entry.body.credential_value)).toEqual([
      "CRED-A",
      "CRED-B",
      "CRED-C",
    ])
    for (const entry of scan.sent()) {
      expect(entry.authorization).toBe("Bearer test-access-token")
      expect(entry.body).toMatchObject({ event_id: "evt-1", scan_method: "qr" })
    }

    const queue = await readQueue(page)
    expect(queue).toHaveLength(3)
    for (const queued of queue) {
      expect(queued.synced).toBe(true)
      expect(queued.retry_count).toBe(0)
      expect(queued.last_error).toBeUndefined()
    }
  })

  test("success marks the record synced and decreases the pending count", async ({
    page,
    mockScan,
  }) => {
    await mockScan(page, () => ({
      status: 201,
      json: { message: "ok", attendance: {}, attendee_id: "a" },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-success" })])

    const result = await runForegroundSync(page)
    expect(result.syncedCount).toBe(1)

    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(true)
    expect(queued.synced_at).toBeTruthy()
    expect(queued.synced_at_server).toBeTruthy()
  })

  test("network failure keeps the record pending and updates retry metadata", async ({
    page,
    mockScan,
  }) => {
    const scan = await mockScan(page, () => ({ abort: true }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-network" })])

    const result = await runForegroundSync(page)
    expect(scan.count()).toBe(1)
    expect(result.needsRetry).toBe(true)
    expect(result.syncedCount).toBe(0)

    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(false)
    expect(queued.retry_count).toBe(1)
    expect(queued.last_error).toBe("network-error")
    expect(queued.last_retry_at).toBeTruthy()
  })

  test("401 leaves the record pending without incrementing retry metadata", async ({
    page,
    mockScan,
  }) => {
    await mockScan(page, () => ({
      status: 401,
      json: { detail: "unauthorized" },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-unauth" })])

    const result = await runForegroundSync(page)
    expect(result.authRequired).toBe(true)
    expect(result.syncedCount).toBe(0)

    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(false)
    expect(queued.retry_count).toBe(0)
    expect(queued.last_error).toBeUndefined()
    expect(queued.last_retry_at).toBeUndefined()
  })

  test("409 duplicate scans are treated as resolved", async ({
    page,
    mockScan,
  }) => {
    await mockScan(page, () => ({
      status: 409,
      json: { detail: "already scanned" },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-dup" })])

    const result = await runForegroundSync(page)
    expect(result.syncedCount).toBe(1)

    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(true)
    expect(queued.retry_count).toBe(0)
    expect(queued.last_error).toBeUndefined()
  })

  test("client errors (403) mark the record failed but leave it pending", async ({
    page,
    mockScan,
  }) => {
    await mockScan(page, () => ({
      status: 403,
      json: { detail: "forbidden" },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-forbidden" })])

    const result = await runForegroundSync(page)
    expect(result.needsRetry).toBe(false)
    expect(result.syncedCount).toBe(0)

    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(false)
    expect(queued.retry_count).toBe(1)
    expect(queued.last_error).toBe("http-403")
    expect(queued.last_retry_at).toBeTruthy()
  })

  test("server errors (500) mark the record as retryable", async ({
    page,
    mockScan,
  }) => {
    await mockScan(page, () => ({
      status: 500,
      json: { detail: "boom" },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-500" })])

    const result = await runForegroundSync(page)
    expect(result.needsRetry).toBe(true)
    expect(result.syncedCount).toBe(0)

    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(false)
    expect(queued.retry_count).toBe(1)
    expect(queued.last_error).toBe("http-500")
    expect(queued.last_retry_at).toBeTruthy()
  })

  test("two concurrent foreground sync calls never process the same record twice", async ({
    page,
    mockScan,
  }) => {
    let inFlight = 0
    let maxConcurrent = 0
    const scan = await mockScan(page, async () => {
      inFlight += 1
      maxConcurrent = Math.max(maxConcurrent, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 300))
      inFlight -= 1
      return {
        status: 201,
        json: { message: "ok", attendance: {}, attendee_id: "a" },
      }
    })
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [
      record({ id: "rec-x", credential_value: "CRED-X" }),
      record({ id: "rec-y", credential_value: "CRED-Y" }),
    ])

    // Fire two "Sync now" equivalents at once, simulating a double click or
    // a click racing the automatic online-trigger.
    const [first, second] = await page.evaluate(async () => {
      const syncModulePath = "/src/data/sync.ts"
      const mod = await import(syncModulePath)
      const a = mod.runForegroundSync()
      const b = mod.runForegroundSync()
      return Promise.all([a, b])
    })

    // Both calls resolve to the same underlying run (the lock is shared),
    // so each record is only ever sent to the backend once.
    expect(first.processedCount).toBe(2)
    expect(second.processedCount).toBe(2)
    expect(scan.count()).toBe(2)
    expect(new Set(scan.sent().map((e) => e.body.credential_value)).size).toBe(
      2,
    )

    const queue = await readQueue(page)
    expect(queue.every((q) => q.synced)).toBe(true)
  })
})
