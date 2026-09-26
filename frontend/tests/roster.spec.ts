import { expect, test } from "@playwright/test"
import {
  clearQueue,
  getAllQueuedScans,
  getRoster,
  putRoster,
} from "@/data"
import type { RosterEntry, RosterRecord } from "@/data"
import { gotoApp, mockHttp, setToken } from "./helpers"

const rosterEntry = (overrides: Partial<RosterEntry> = {}): RosterEntry => ({
  event_id: "evt-1",
  attendee_id: "att-1",
  registration_status: "registered",
  person_name: "Jane Doe",
  student_number: "2026-0001",
  credentials: [
    {
      credential_type: "nfc",
      credential_value: "8F:49:5B:74",
      is_active: true,
    },
  ],
  ...overrides,
})

const seedRoster = async (page: Parameters<typeof putRoster>[0] extends never ? never : any, roster: RosterRecord) => {
  await page.evaluate(async (value) => {
    const { putRoster } = await import("/src/data/index.ts")
    await putRoster(value)
  }, roster)
}

const readQueue = async (page: any) =>
  page.evaluate(async () => {
    const { getAllQueuedScans } = await import("/src/data/index.ts")
    return getAllQueuedScans()
  })

test.describe("Offline roster caching and scanning", () => {
  test.beforeEach(async ({ page }) => {
    await clearQueue()
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
