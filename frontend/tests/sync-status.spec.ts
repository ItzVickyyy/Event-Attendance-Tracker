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

interface MockHttpResponse {
  status?: number
  json?: unknown
  abort?: boolean
}

interface SentScan {
  body: Record<string, unknown>
  authorization: string
}

interface MockHttpHandle {
  sent(): SentScan[]
  count(): number
  meRequested(): number
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
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
  mockHttp: (
    page: Page,
    scanResponder?: (
      body: Record<string, unknown>,
    ) => MockHttpResponse | Promise<MockHttpResponse>,
  ) => Promise<MockHttpHandle>
}>({
  mockHttp: async ({ context }, use) => {
    const browser = context.browser()
    if (!browser) throw new Error("no browser for browser-level CDP session")
    const cdp: CDPSession = await browser.newBrowserCDPSession()
    await use(async (page: Page, scanResponder?) => {
      const sent: SentScan[] = []
      let meRequested = 0
      await page.route("**/api/v1/users/me*", async (route) => {
        const request = route.request()
        if (request.method() === "OPTIONS") {
          await route.fulfill({ status: 204, headers: corsHeaders })
          return
        }
        meRequested += 1
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({ is_superuser: true, can_scan: true }),
        })
      })
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
              responseHeaders: Object.entries(corsHeaders).map(
                ([name, value]) => ({
                  name,
                  value,
                }),
              ),
            })
            return
          }
          const scanBody = (
            request.postData ? JSON.parse(request.postData) : {}
          ) as Record<string, unknown>
          const authHeader = Object.entries(request.headers).find(
            ([k]) => k.toLowerCase() === "authorization",
          )
          sent.push({
            body: scanBody,
            authorization: authHeader ? authHeader[1] : "",
          })
          const result = scanResponder
            ? await scanResponder(scanBody)
            : { status: 201, json: { ok: true } }
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
        meRequested: () => meRequested,
      }
    })
    await cdp.detach()
  },
})

async function setToken(
  page: Page,
  token = "test-access-token",
): Promise<void> {
  await page.evaluate(
    (value) => localStorage.setItem("access_token", value),
    token,
  )
}

async function getTrackerCard(
  page: Page,
): Promise<import("@playwright/test").Locator> {
  return page.getByTestId("sync-status")
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

async function notifyQueueChanged(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.dispatchEvent(new Event("pwa:queue-changed")),
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test.describe("Scanner sync status UI", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("shows all synced with an empty queue", async ({ page, mockHttp }) => {
    await mockHttp(page)
    await page.goto("/login")
    await setToken(page)
    await page.goto("/scanner")

    const card = await getTrackerCard(page)
    await expect(card).toBeVisible()
    await expect(card.getByText("All synced")).toBeVisible()
    await expect(card).not.toContainText("pending sync")
    await expect(card).not.toContainText("Offline")
  })

  test("shows the pending count and refreshes when the queue changes", async ({
    page,
    mockHttp,
  }) => {
    await mockHttp(page)
    await page.goto("/login")
    await setToken(page)
    await page.goto("/scanner")

    const card = await getTrackerCard(page)
    await expect(card.getByText("All synced")).toBeVisible()

    await seedRecords(page, [
      record({ id: "rec-a", credential_value: "CRED-A" }),
      record({ id: "rec-b", credential_value: "CRED-B" }),
    ])
    await notifyQueueChanged(page)

    await expect(card.getByText("2 pending sync")).toBeVisible()
    await expect(card).not.toContainText("All synced")
    await expect(card).not.toContainText("Offline")

    await seedRecords(page, [
      record({ id: "rec-c", credential_value: "CRED-C" }),
    ])
    await notifyQueueChanged(page)

    await expect(card.getByText("3 pending sync")).toBeVisible()
  })

  test("shows offline states with and without pending scans", async ({
    page,
    mockHttp,
  }) => {
    await mockHttp(page)
    await page.goto("/login")
    await setToken(page)
    await page.goto("/scanner")

    const card = await getTrackerCard(page)
    await expect(card.getByText("All synced")).toBeVisible()

    await page.context().setOffline(true)

    await expect(card.getByText("Offline")).toBeVisible()
    await expect(card.getByText("No pending scans")).toBeVisible()

    await seedRecords(page, [record({ id: "rec-offline" })])
    await notifyQueueChanged(page)

    await expect(card.getByText("Offline")).toBeVisible()
    await expect(card.getByText(/1 queued locally/)).toBeVisible()

    await page.context().setOffline(false)
    await expect(card).not.toContainText("Offline")
  })

  test("manual sync shows the syncing state and resolves to all synced", async ({
    page,
    mockHttp,
  }) => {
    let requestSeen = ""
    await mockHttp(page, async (body) => {
      requestSeen = (body.credential_value as string) ?? ""
      await sleep(1500)
      return { status: 201, json: { ok: true } }
    })
    await page.goto("/login")
    await setToken(page)
    await page.goto("/scanner")

    const card = await getTrackerCard(page)
    await expect(card.getByText("All synced")).toBeVisible()

    await seedRecords(page, [
      record({ id: "rec-syncing", credential_value: "CRED-1" }),
    ])
    await notifyQueueChanged(page)
    await expect(card.getByText("1 pending sync")).toBeVisible()

    await card.getByRole("button", { name: "Sync now" }).click()

    await expect(card.getByText(/Syncing 1 pending scan/)).toBeVisible()
    await expect.poll(() => requestSeen, { timeout: 15000 }).toBe("CRED-1")
    await expect(card.getByText("All synced")).toBeVisible()

    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(true)
    expect(queued.retry_count).toBe(0)
    expect(queued.last_error).toBeUndefined()
  })

  test("401 leaves the record pending without a failure flag", async ({
    page,
    mockHttp,
  }) => {
    await mockHttp(page, () => ({
      status: 401,
      json: { detail: "unauthorized" },
    }))
    await page.goto("/login")
    await setToken(page)
    await page.goto("/scanner")

    const card = await getTrackerCard(page)
    await seedRecords(page, [record({ id: "rec-unauth" })])
    await notifyQueueChanged(page)
    await expect(card.getByText("1 pending sync")).toBeVisible()

    await card.getByRole("button", { name: "Sync now" }).click()
    await expect.poll(() => page, { timeout: 15000 }).toBe(page)

    await expect(card.getByText("1 pending sync")).toBeVisible()
    await expect(card).not.toContainText("Some scans failed to sync")
    await expect(card).not.toContainText("All synced")

    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(false)
    expect(queued.retry_count).toBe(0)
    expect(queued.last_error).toBeUndefined()
  })

  test("403 marks the record failed and shows the failure in the card", async ({
    page,
    mockHttp,
  }) => {
    await mockHttp(page, () => ({
      status: 403,
      json: { detail: "forbidden" },
    }))
    await page.goto("/login")
    await setToken(page)
    await page.goto("/scanner")

    const card = await getTrackerCard(page)
    await seedRecords(page, [record({ id: "rec-forbidden" })])
    await notifyQueueChanged(page)
    await expect(card.getByText("1 pending sync")).toBeVisible()

    await card.getByRole("button", { name: "Sync now" }).click()
    await expect(
      card.getByText(/Some scans failed to sync \(http-403\)/),
    ).toBeVisible()
    await expect(card).not.toContainText("All synced")

    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(false)
    expect(queued.retry_count).toBe(1)
    expect(queued.last_error).toBe("http-403")
  })

  test("409 duplicates are treated as resolved and the card returns to all synced", async ({
    page,
    mockHttp,
  }) => {
    await mockHttp(page, () => ({
      status: 409,
      json: { detail: "already scanned" },
    }))
    await page.goto("/login")
    await setToken(page)
    await page.goto("/scanner")

    const card = await getTrackerCard(page)
    await seedRecords(page, [record({ id: "rec-dup" })])
    await notifyQueueChanged(page)
    await expect(card.getByText("1 pending sync")).toBeVisible()

    await card.getByRole("button", { name: "Sync now" }).click()
    await expect(card.getByText("All synced")).toBeVisible()

    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(true)
    expect(queued.retry_count).toBe(0)
    expect(queued.last_error).toBeUndefined()
  })

  test("manual retry recovers a previously failed record", async ({
    page,
    mockHttp,
  }) => {
    let calls = 0
    await mockHttp(page, () => {
      calls += 1
      return { status: 201, json: { ok: true } }
    })
    await page.goto("/login")
    await setToken(page)
    await page.goto("/scanner")

    const card = await getTrackerCard(page)
    await seedRecords(page, [
      record({
        id: "rec-retry",
        retry_count: 1,
        last_error: "http-403",
        last_retry_at: "2026-01-01T00:00:01.000Z",
      }),
    ])
    await notifyQueueChanged(page)

    await expect(
      card.getByText(/Some scans failed to sync \(http-403\)/),
    ).toBeVisible()

    await card.getByRole("button", { name: "Retry" }).click()
    await expect(card.getByText("All synced")).toBeVisible()

    expect(calls).toBe(1)
    const [queued] = await readQueue(page)
    expect(queued.synced).toBe(true)
    expect(queued.retry_count).toBe(0)
    expect(queued.last_error).toBeUndefined()
  })
})
