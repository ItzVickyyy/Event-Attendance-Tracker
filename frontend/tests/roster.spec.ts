import {
  test as base,
  type CDPSession,
  expect,
  type Page,
} from "@playwright/test"

const SCAN_URL = "http://localhost:8001/api/v1/attendance/scan*"
const ROSTER_URL = "**/api/v1/events/evt-1/roster**"
const USERS_ME_URL = "**/api/v1/users/me*"

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

interface RosterEntryLike {
  event_id: string
  attendee_id: string
  registration_status: string
  person_name: string
  student_number?: string
  credentials: Array<{
    credential_type: "nfc" | "qr"
    credential_value: string
    is_active: boolean
  }>
}

interface RosterRecordLike {
  event_id: string
  entries: RosterEntryLike[]
  downloaded_at: string
  entry_count: number
  credential_count: number
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

function _record(overrides: Partial<QueueRecordLike> = {}): QueueRecordLike {
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

function rosterEntry(
  overrides: Partial<RosterEntryLike> = {},
): RosterEntryLike {
  return {
    event_id: "evt-1",
    attendee_id: "att-1",
    registration_status: "registered",
    person_name: "Jane Doe",
    student_number: "STU-123",
    credentials: [
      { credential_type: "nfc", credential_value: "CRED-1", is_active: true },
      { credential_type: "qr", credential_value: "QR-CRED-1", is_active: true },
    ],
    ...overrides,
  }
}

const test = base.extend<{
  mockHttp: (
    page: Page,
    rosterResponder?: (
      body: Record<string, unknown>,
    ) => MockHttpResponse | Promise<MockHttpResponse>,
  ) => Promise<MockHttpHandle>
}>({
  mockHttp: async ({ context }, use) => {
    const browser = context.browser()
    if (!browser) throw new Error("no browser for browser-level CDP session")
    const cdp: CDPSession = await browser.newBrowserCDPSession()
    await use(async (page: Page, rosterResponder?) => {
      const sent: SentScan[] = []
      let meRequested = 0
      await page.route(USERS_ME_URL, async (route) => {
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
      await page.route(ROSTER_URL, async (route) => {
        const request = route.request()
        if (request.method() === "OPTIONS") {
          await route.fulfill({ status: 204, headers: corsHeaders })
          return
        }
        const result = rosterResponder
          ? await rosterResponder({})
          : {
              status: 200,
              json: {
                data: [rosterEntry()],
                count: 1,
              },
            }
        if (result.abort) {
          await route.abort()
          return
        }
        await route.fulfill({
          status: result.status ?? 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify(result.json ?? {}),
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
          const responseBody = Buffer.from(
            JSON.stringify({ ok: true }),
          ).toString("base64")
          await cdp.send("Fetch.fulfillRequest", {
            requestId,
            responseCode: 201,
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

async function _seedRecords(
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

async function seedRoster(page: Page, roster: RosterRecordLike): Promise<void> {
  await page.evaluate(
    (r) =>
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
          const tx = db.transaction("rosters", "readwrite")
          tx.objectStore("rosters").add(r)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error)
        }
        request.onerror = () => reject(request.error)
      }),
    roster,
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

async function readRoster(page: Page): Promise<RosterRecordLike | undefined> {
  return page.evaluate(
    () =>
      new Promise<RosterRecordLike | undefined>((resolve, reject) => {
        const request = indexedDB.open("attendance-offline", 2)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction("rosters", "readonly")
          const getReq = tx.objectStore("rosters").get("evt-1")
          getReq.onsuccess = () => {
            const roster = getReq.result as RosterRecordLike | undefined
            db.close()
            resolve(roster)
          }
          getReq.onerror = () => reject(getReq.error)
        }
        request.onerror = () => reject(request.error)
      }),
  )
}

async function _notifyQueueChanged(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.dispatchEvent(new Event("pwa:queue-changed")),
  )
}

const _sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function getSyncStatusCard(page: Page) {
  return page.getByTestId("sync-status")
}

test.describe("Offline roster caching and scanning", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("downloads the roster and shows the count", async ({
    page,
    mockHttp,
  }) => {
    let rosterResponded = false
    await mockHttp(page, () => {
      rosterResponded = true
      return {
        status: 200,
        json: {
          data: [
            rosterEntry(),
            rosterEntry({ attendee_id: "att-2", person_name: "John Smith" }),
          ],
          count: 2,
        },
      }
    })
    await gotoApp(page)
    await setToken(page)
    await page.goto("/scanner?event_id=evt-1")

    const card = await getSyncStatusCard(page)
    await expect(card).toBeVisible()
    await expect(
      card.getByText("Roster not downloaded for this event"),
    ).toBeVisible()

    await card.getByRole("button", { name: "Download roster" }).click()
    await expect.poll(() => rosterResponded, { timeout: 10000 }).toBe(true)
    await expect(card.getByText("2 attendees on offline roster")).toBeVisible()

    const roster = await readRoster(page)
    expect(roster).toBeDefined()
    expect(roster?.event_id).toBe("evt-1")
    expect(roster?.entry_count).toBe(2)
    expect(roster?.credential_count).toBe(4)
  })

  test("shows roster already downloaded when present in IDB", async ({
    page,
    mockHttp,
  }) => {
    await mockHttp(page)
    await gotoApp(page)
    await setToken(page)
    await seedRoster(page, {
      event_id: "evt-1",
      entries: [
        rosterEntry({ attendee_id: "att-1", person_name: "Alice" }),
        rosterEntry({ attendee_id: "att-2", person_name: "Bob" }),
      ],
      downloaded_at: "2026-01-01T00:00:00.000Z",
      entry_count: 2,
      credential_count: 4,
    })
    await page.goto("/scanner?event_id=evt-1")

    const card = await getSyncStatusCard(page)
    await expect(card.getByText("2 attendees on offline roster")).toBeVisible()
    await expect(
      card.getByText("Roster not downloaded for this event"),
    ).not.toBeVisible()
  })

  test("queues a known offline scan with attendee name", async ({
    page,
    mockHttp,
  }) => {
    await mockHttp(page)
    await gotoApp(page)
    await setToken(page)
    await seedRoster(page, {
      event_id: "evt-1",
      entries: [
        rosterEntry({
          credentials: [
            {
              credential_type: "nfc",
              credential_value: "CRED-1",
              is_active: true,
            },
          ],
        }),
      ],
      downloaded_at: "2026-01-01T00:00:00.000Z",
      entry_count: 1,
      credential_count: 1,
    })
    await page.goto("/scanner?event_id=evt-1")

    const card = await getSyncStatusCard(page)
    await expect(card.getByText("1 attendees on offline roster")).toBeVisible()

    await page.context().setOffline(true)
    await expect(card.getByText("Offline", { exact: true })).toBeVisible()

    await page.fill('input[placeholder="8F:49:5B:74"]', "CRED-1")
    await page.keyboard.press("Enter")

    await expect(page.getByText("Scan queued - Jane Doe")).toBeVisible()

    const queue = await readQueue(page)
    expect(queue).toHaveLength(1)
    expect(queue[0].credential_value).toBe("CRED-1")
    expect(queue[0].synced).toBe(false)

    await page.context().setOffline(false)
  })

  test("does not queue scans for unknown credentials offline", async ({
    page,
    mockHttp,
  }) => {
    await mockHttp(page)
    await gotoApp(page)
    await setToken(page)
    await seedRoster(page, {
      event_id: "evt-1",
      entries: [
        rosterEntry({
          credentials: [
            {
              credential_type: "nfc",
              credential_value: "CRED-1",
              is_active: true,
            },
          ],
        }),
      ],
      downloaded_at: "2026-01-01T00:00:00.000Z",
      entry_count: 1,
      credential_count: 1,
    })
    await page.goto("/scanner?event_id=evt-1")

    const card = await getSyncStatusCard(page)
    await expect(card.getByText("1 attendees on offline roster")).toBeVisible()

    await page.context().setOffline(true)

    await page.fill('input[placeholder="8F:49:5B:74"]', "UNKNOWN-CRED")
    await page.keyboard.press("Enter")

    await expect(
      page.getByText("No offline roster entry for this credential"),
    ).toBeVisible()

    const queue = await readQueue(page)
    expect(queue).toHaveLength(0)

    await page.context().setOffline(false)
  })

  test("does not queue scans when no roster is downloaded offline", async ({
    page,
    mockHttp,
  }) => {
    await mockHttp(page)
    await gotoApp(page)
    await setToken(page)
    await page.goto("/scanner?event_id=evt-1")

    const card = await getSyncStatusCard(page)
    await expect(
      card.getByText("Roster not downloaded for this event"),
    ).toBeVisible()

    await page.context().setOffline(true)

    await page.fill('input[placeholder="8F:49:5B:74"]', "CRED-1")
    await page.keyboard.press("Enter")

    await expect(
      page.getByText("No offline roster entry for this credential"),
    ).toBeVisible()

    const queue = await readQueue(page)
    expect(queue).toHaveLength(0)

    await page.context().setOffline(false)
  })

  test("dedupes repeated offline scans", async ({ page, mockHttp }) => {
    await mockHttp(page)
    await gotoApp(page)
    await setToken(page)
    await seedRoster(page, {
      event_id: "evt-1",
      entries: [
        rosterEntry({
          credentials: [
            {
              credential_type: "nfc",
              credential_value: "CRED-1",
              is_active: true,
            },
          ],
        }),
      ],
      downloaded_at: "2026-01-01T00:00:00.000Z",
      entry_count: 1,
      credential_count: 1,
    })
    await page.goto("/scanner?event_id=evt-1")

    const card = await getSyncStatusCard(page)
    await expect(card.getByText("1 attendees on offline roster")).toBeVisible()

    await page.context().setOffline(true)

    await page.fill('input[placeholder="8F:49:5B:74"]', "CRED-1")
    await page.keyboard.press("Enter")
    await expect(page.getByText("Scan queued - Jane Doe")).toBeVisible()

    await page.fill('input[placeholder="8F:49:5B:74"]', "CRED-1")
    await page.keyboard.press("Enter")
    await expect(
      page.locator("main").getByText("Already queued for this attendee", { exact: true }),
    ).toBeVisible()

    const queue = await readQueue(page)
    expect(queue).toHaveLength(1)

    await page.context().setOffline(false)
  })
})
