import {
  test as base,
  type CDPSession,
  expect,
  type Page,
} from "@playwright/test"

const SCAN_URL = "http://localhost:8001/api/v1/attendance/scan*"

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

async function triggerSyncNow(page: Page): Promise<void> {
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: "SYNC_NOW" })
    }),
  )
}

test.describe("Attendance background sync", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("flushes pending records in creation order and marks them synced", async ({
    page,
    mockScan,
  }) => {
    const scan = await mockScan(page, () => ({
      status: 201,
      json: { ok: true },
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
    await triggerSyncNow(page)

    await expect.poll(() => scan.count(), { timeout: 15000 }).toBe(3)
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
      expect(queued.last_retry_at).toBeUndefined()
      expect(queued.synced_at).toBeTruthy()
      expect(queued.synced_at_server).toBeTruthy()
    }
  })

  test("409 duplicate scans are treated as resolved", async ({
    page,
    mockScan,
  }) => {
    const scan = await mockScan(page, () => ({
      status: 409,
      json: { detail: "already scanned" },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-dup" })])
    await triggerSyncNow(page)

    await expect.poll(() => scan.count(), { timeout: 15000 }).toBe(1)
    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(true)
    expect(queued.retry_count).toBe(0)
    expect(queued.last_error).toBeUndefined()
  })

  test("401 responses leave the record pending and untouched", async ({
    page,
    mockScan,
  }) => {
    const scan = await mockScan(page, () => ({
      status: 401,
      json: { detail: "unauthorized" },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-unauth" })])
    await triggerSyncNow(page)

    await expect.poll(() => scan.count(), { timeout: 15000 }).toBe(1)
    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(false)
    expect(queued.retry_count).toBe(0)
    expect(queued.last_error).toBeUndefined()
    expect(queued.last_retry_at).toBeUndefined()
  })

  test("client errors (403) mark the record failed but leave it pending", async ({
    page,
    mockScan,
  }) => {
    const scan = await mockScan(page, () => ({
      status: 403,
      json: { detail: "forbidden" },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-forbidden" })])
    await triggerSyncNow(page)

    await expect.poll(() => scan.count(), { timeout: 15000 }).toBe(1)
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
    const scan = await mockScan(page, () => ({
      status: 500,
      json: { detail: "boom" },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-500" })])
    await triggerSyncNow(page)

    await expect.poll(() => scan.count(), { timeout: 15000 }).toBe(1)
    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(false)
    expect(queued.retry_count).toBe(1)
    expect(queued.last_error).toBe("http-500")
    expect(queued.last_retry_at).toBeTruthy()
  })

  test("network failures mark the record as retryable", async ({
    page,
    mockScan,
  }) => {
    const scan = await mockScan(page, () => ({ abort: true }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-network" })])
    await triggerSyncNow(page)

    await expect.poll(() => scan.count(), { timeout: 15000 }).toBe(1)
    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(false)
    expect(queued.retry_count).toBe(1)
    expect(queued.last_error).toBe("network-error")
    expect(queued.last_retry_at).toBeTruthy()
  })

  test("synced records persist across a reload", async ({ page, mockScan }) => {
    const scan = await mockScan(page, () => ({
      status: 201,
      json: { ok: true },
    }))
    await gotoApp(page)
    await setToken(page)
    await seedRecords(page, [record({ id: "rec-persist" })])
    await triggerSyncNow(page)

    await expect.poll(() => scan.count(), { timeout: 15000 }).toBe(1)
    await page.reload()
    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(true)
  })
})
