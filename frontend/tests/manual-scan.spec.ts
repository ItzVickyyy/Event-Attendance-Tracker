import {
  test as base,
  type CDPSession,
  expect,
  type Page,
} from "@playwright/test"

const SCAN_MANUAL_URL = "http://localhost:8001/api/v1/attendance/scan-manual*"
const STUDENTS_SEARCH_URL = "**/api/v1/students**"
const ATTENDEES_FILTER_URL = "**/api/v1/attendees**"
const USERS_ME_URL = "**/api/v1/users/me*"

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

function studentEntry(
  overrides: Partial<{
    id: string
    person_id: string
    student_number: string
    person_name: string
    attendee_id: string | null
  }> = {},
) {
  return {
    id: overrides.id ?? `stu-${Math.random().toString(36).slice(2, 8)}`,
    person_id:
      overrides.person_id ?? `per-${Math.random().toString(36).slice(2, 8)}`,
    student_number:
      overrides.student_number ??
      `STU-${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")}`,
    person_name: overrides.person_name ?? "Test Student",
    attendee_id: overrides.attendee_id ?? null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    section_id: null,
    ...overrides,
  }
}

function attendeeEntry(
  overrides: Partial<{
    id: string
    person_id: string
    attendee_type: string
  }> = {},
) {
  return {
    id: overrides.id ?? `att-${Math.random().toString(36).slice(2, 8)}`,
    person_id:
      overrides.person_id ?? `per-${Math.random().toString(36).slice(2, 8)}`,
    attendee_type: overrides.attendee_type ?? "student",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function studentsResponse(
  data: ReturnType<typeof studentEntry>[],
  count?: number,
) {
  return {
    data,
    count: count ?? data.length,
  }
}

function attendeesResponse(
  data: ReturnType<typeof attendeeEntry>[],
  count?: number,
) {
  return {
    data,
    count: count ?? data.length,
  }
}

const test = base.extend<{
  mockHttp: (
    page: Page,
    scanResponder?: (
      body: Record<string, unknown>,
    ) => MockHttpResponse | Promise<MockHttpResponse>,
    studentsResponder?: (
      query: Record<string, unknown>,
    ) => MockHttpResponse | Promise<MockHttpResponse>,
    attendeesResponder?: (
      query: Record<string, unknown>,
    ) => MockHttpResponse | Promise<MockHttpResponse>,
  ) => Promise<MockHttpHandle>
}>({
  mockHttp: async ({ context }, use) => {
    const browser = context.browser()
    if (!browser) throw new Error("no browser for browser-level CDP session")
    const cdp: CDPSession = await browser.newBrowserCDPSession()
    await use(
      async (
        page: Page,
        scanResponder?,
        studentsResponder?,
        attendeesResponder?,
      ) => {
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
        await page.route(STUDENTS_SEARCH_URL, async (route) => {
          const request = route.request()
          if (request.method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers: corsHeaders })
            return
          }
          const url = new URL(request.url())
          const query: Record<string, unknown> = {}
          url.searchParams.forEach((value, key) => {
            query[key] = value
          })
          const result = studentsResponder
            ? await studentsResponder(query)
            : { status: 200, json: studentsResponse([studentEntry()]) }
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
        await page.route(ATTENDEES_FILTER_URL, async (route) => {
          const request = route.request()
          if (request.method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers: corsHeaders })
            return
          }
          const url = new URL(request.url())
          const query: Record<string, unknown> = {}
          url.searchParams.forEach((value, key) => {
            query[key] = value
          })
          const result = attendeesResponder
            ? await attendeesResponder(query)
            : { status: 200, json: attendeesResponse([attendeeEntry()]) }
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
          patterns: [{ urlPattern: SCAN_MANUAL_URL, requestStage: "Request" }],
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
      },
    )
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

test.describe("Manual attendance scan", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("single student search and successful manual scan", async ({
    page,
    mockHttp,
  }) => {
    const personId = "per-123"
    const studentId = "stu-456"
    const attendeeId = "att-789"
    const studentNumber = "STU-0001"
    const studentName = "Alice Student"

    const handle = await mockHttp(
      page,
      async (body) => {
        expect(body.event_id).toBe("evt-1")
        expect(body.attendee_id).toBe(attendeeId)
        expect(body.scan_method).toBe("manual")
        return {
          status: 200,
          json: {
            message: "Time-In Recorded",
            attendance: {
              id: "attn-1",
              registration_id: "reg-1",
              time_in: "2026-09-15T10:00:00.000Z",
              time_out: null,
              status: "present",
              scan_method: "manual",
              scanned_by: "user-1",
              created_at: "2026-09-15T10:00:00.000Z",
              updated_at: "2026-09-15T10:00:00.000Z",
            },
            attendee_id: attendeeId,
            person_name: studentName,
            student_number: studentNumber,
          },
        }
      },
      async () => ({
        status: 200,
        json: studentsResponse([
          studentEntry({
            id: studentId,
            person_id: personId,
            student_number: studentNumber,
            person_name: studentName,
            attendee_id: attendeeId,
          }),
        ]),
      }),
      async (query) => {
        expect(query.person_id).toBe(personId)
        return {
          status: 200,
          json: attendeesResponse([
            attendeeEntry({
              id: attendeeId,
              person_id: personId,
              attendee_type: "student",
            }),
          ]),
        }
      },
    )

    await gotoApp(page)
    await setToken(page)
    await page.goto("/scanner?event_id=evt-1")

    await page.fill(
      'input[placeholder="Search by student number or name..."]',
      "Alice",
    )
    await page.getByRole("button", { name: "Search" }).click()

    await expect(
      page.getByText("Recorded Alice Student (Time-In Recorded)"),
    ).toBeVisible({ timeout: 10000 })

    const scans = handle.sent()
    expect(scans).toHaveLength(1)
    expect(scans[0].body.attendee_id).toBe(attendeeId)
    expect(scans[0].body.scan_method).toBe("manual")
  })

  test("multiple matching students shows picker and selects correct attendee", async ({
    page,
    mockHttp,
  }) => {
    const personId1 = "per-111"
    const personId2 = "per-222"
    const studentId1 = "stu-111"
    const studentId2 = "stu-222"
    const attendeeId1 = "att-111"
    const attendeeId2 = "att-222"

    const handle = await mockHttp(
      page,
      async (body) => {
        expect(body.event_id).toBe("evt-1")
        expect(body.attendee_id).toBe(attendeeId2)
        expect(body.scan_method).toBe("manual")
        return {
          status: 200,
          json: {
            message: "Time-In Recorded",
            attendance: {
              id: "attn-2",
              registration_id: "reg-2",
              time_in: "2026-09-15T10:00:00.000Z",
              time_out: null,
              status: "present",
              scan_method: "manual",
              scanned_by: "user-1",
              created_at: "2026-09-15T10:00:00.000Z",
              updated_at: "2026-09-15T10:00:00.000Z",
            },
            attendee_id: attendeeId2,
            person_name: "Bob Student",
            student_number: "STU-0002",
          },
        }
      },
      async () => ({
        status: 200,
        json: studentsResponse([
          studentEntry({
            id: studentId1,
            person_id: personId1,
            student_number: "STU-0001",
            person_name: "Alice Student",
            attendee_id: attendeeId1,
          }),
          studentEntry({
            id: studentId2,
            person_id: personId2,
            student_number: "STU-0002",
            person_name: "Bob Student",
            attendee_id: attendeeId2,
          }),
        ]),
      }),
      async (query) => {
        if (query.person_id === personId2) {
          return {
            status: 200,
            json: attendeesResponse([
              attendeeEntry({
                id: attendeeId2,
                person_id: personId2,
                attendee_type: "student",
              }),
            ]),
          }
        }
        return {
          status: 200,
          json: attendeesResponse([
            attendeeEntry({
              id: attendeeId1,
              person_id: personId1,
              attendee_type: "student",
            }),
          ]),
        }
      },
    )

    await gotoApp(page)
    await setToken(page)
    await page.goto("/scanner?event_id=evt-1")

    await page.fill(
      'input[placeholder="Search by student number or name..."]',
      "Student",
    )
    await page.getByRole("button", { name: "Search" }).click()

    await expect(page.getByText("Alice Student")).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText("Bob Student")).toBeVisible()
    await expect(page.getByText("STU-0001")).toBeVisible()
    await expect(page.getByText("STU-0002")).toBeVisible()

    await page.getByRole("button", { name: "Bob Student" }).click()

    await expect(
      page.getByText("Recorded Bob Student (Time-In Recorded)"),
    ).toBeVisible({ timeout: 10000 })

    const scans = handle.sent()
    expect(scans).toHaveLength(1)
    expect(scans[0].body.attendee_id).toBe(attendeeId2)
  })

  test("manual scan error handling - duplicate scan (409)", async ({
    page,
    mockHttp,
  }) => {
    const personId = "per-333"
    const studentId = "stu-333"
    const attendeeId = "att-333"
    const studentNumber = "STU-0003"
    const studentName = "Charlie Student"

    await mockHttp(
      page,
      async (body) => {
        expect(body.event_id).toBe("evt-1")
        expect(body.attendee_id).toBe(attendeeId)
        expect(body.scan_method).toBe("manual")
        return {
          status: 409,
          json: {
            detail:
              "Already recorded for this attendee. Existing scan: In: 2026-09-15T09:00:00.000Z",
          },
        }
      },
      async (query) => {
        // Return Charlie for "Charlie" search, empty for "Another" search
        const search = query.search as string | undefined
        if (!search || search.toLowerCase().includes("charlie")) {
          return {
            status: 200,
            json: studentsResponse([
              studentEntry({
                id: studentId,
                person_id: personId,
                student_number: studentNumber,
                person_name: studentName,
                attendee_id: attendeeId,
              }),
            ]),
          }
        }
        return { status: 200, json: studentsResponse([]) }
      },
      async (query) => {
        expect(query.person_id).toBe(personId)
        return {
          status: 200,
          json: attendeesResponse([
            attendeeEntry({
              id: attendeeId,
              person_id: personId,
              attendee_type: "student",
            }),
          ]),
        }
      },
    )

    await gotoApp(page)
    await setToken(page)
    await page.goto("/scanner?event_id=evt-1")

    await page.fill(
      'input[placeholder="Search by student number or name..."]',
      "Charlie",
    )
    await page.getByRole("button", { name: "Search" }).click()

    await expect(page.getByText("Already recorded")).toBeVisible({
      timeout: 10000,
    })

    await page.fill(
      'input[placeholder="Search by student number or name..."]',
      "Another",
    )
    await page.getByRole("button", { name: "Search" }).click()

    await expect(page.getByText("No student found")).toBeVisible()
  })

  test("no student found error handling", async ({ page, mockHttp }) => {
    await mockHttp(
      page,
      async () => {
        throw new Error("Should not reach scan endpoint")
      },
      async () => ({
        status: 200,
        json: studentsResponse([]),
      }),
    )

    await gotoApp(page)
    await setToken(page)
    await page.goto("/scanner?event_id=evt-1")

    await page.fill(
      'input[placeholder="Search by student number or name..."]',
      "NonexistentStudent123",
    )
    await page.getByRole("button", { name: "Search" }).click()

    await expect(page.getByText("No student found")).toBeVisible({
      timeout: 10000,
    })

    await page.fill(
      'input[placeholder="Search by student number or name..."]',
      "ValidStudent",
    )
    await page.getByRole("button", { name: "Search" }).click()

    await expect(
      page.locator('input[placeholder="Search by student number or name..."]'),
    ).toBeVisible()
  })

  test("no attendee record found for student", async ({ page, mockHttp }) => {
    const personId = "per-444"
    const studentId = "stu-444"
    const studentNumber = "STU-0004"
    const studentName = "Diana Student"

    await mockHttp(
      page,
      async () => {
        throw new Error("Should not reach scan endpoint")
      },
      async () => ({
        status: 200,
        json: studentsResponse([
          studentEntry({
            id: studentId,
            person_id: personId,
            student_number: studentNumber,
            person_name: studentName,
            attendee_id: null,
          }),
        ]),
      }),
      async (query) => {
        expect(query.person_id).toBe(personId)
        return {
          status: 200,
          json: attendeesResponse([]),
        }
      },
    )

    await gotoApp(page)
    await setToken(page)
    await page.goto("/scanner?event_id=evt-1")

    await page.fill(
      'input[placeholder="Search by student number or name..."]',
      "Diana",
    )
    await page.getByRole("button", { name: "Search" }).click()

    await expect(
      page.getByText("No attendee record found for this student"),
    ).toBeVisible({ timeout: 10000 })

    await page.fill(
      'input[placeholder="Search by student number or name..."]',
      "AnotherStudent",
    )
    await page.getByRole("button", { name: "Search" }).click()

    await expect(
      page.locator('input[placeholder="Search by student number or name..."]'),
    ).toBeVisible()
  })
})
