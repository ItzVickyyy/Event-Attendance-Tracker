import { expect, test } from "@playwright/test"
import { randomEmail } from "./utils/random"

test("new event appears in the list without refreshing the page", async ({
  page,
}) => {
  await page.goto("/events")
  const eventName = `Immediate UI update ${randomEmail()}`

  await page.getByRole("button", { name: "Add Event" }).click()
  await page.getByLabel("Event Name").fill(eventName)
  await page
    .getByLabel("Event Date")
    .fill(new Date().toISOString().slice(0, 10))
  await page.getByRole("button", { name: "Create Event" }).click()

  await expect(page.getByText("Event created successfully")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("row").filter({ hasText: eventName }),
  ).toBeVisible()
})

test("registration page reports section loading failures and can retry", async ({
  page,
}) => {
  let failSectionRequests = false
  let interceptedSectionRequests = 0
  await page.route("**/*", async (route) => {
    if (route.request().url().includes("academic-sections")) {
      interceptedSectionRequests += 1
      if (failSectionRequests) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Simulated section request failure" }),
        })
        return
      }
    }
    await route.continue()
  })

  await page.goto("/events")
  const eventName = `Registration query failure ${randomEmail()}`

  await page.getByRole("button", { name: "Add Event" }).click()
  await page.getByLabel("Event Name").fill(eventName)
  await page
    .getByLabel("Event Date")
    .fill(new Date().toISOString().slice(0, 10))
  await page.getByRole("button", { name: "Create Event" }).click()

  await expect(page.getByText("Event created successfully")).toBeVisible()
  await page.keyboard.press("Escape")
  const eventLink = page.getByRole("link", { name: eventName })
  await expect(eventLink).toBeVisible()
  const href = await eventLink.getAttribute("href")
  expect(href).toBeTruthy()

  failSectionRequests = true
  await page.goto(`${href}/registration`)
  await expect.poll(() => interceptedSectionRequests).toBeGreaterThan(0)
  await expect(
    page.getByRole("alert").getByText(/Unable to load eligible sections/),
  ).toBeVisible({ timeout: 15000 })
  await expect(
    page.getByRole("button", { name: "Save eligible sections" }),
  ).toHaveCount(0)

  failSectionRequests = false
  await page.getByRole("button", { name: "Retry loading sections" }).click()
  await expect(
    page.getByRole("alert").getByText(/Unable to load eligible sections/),
  ).toHaveCount(0)
})

test("registration page reports event loading failures and can retry", async ({
  page,
}) => {
  let failEventRequests = false
  let eventId = ""
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (
      failEventRequests &&
      url.pathname.includes("/api/v1/events/") &&
      !url.pathname.includes("/registrations") &&
      url.pathname.endsWith(eventId)
    ) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated event request failure" }),
      })
      return
    }
    await route.continue()
  })

  await page.goto("/events")
  const eventName = `Event query failure ${randomEmail()}`

  await page.getByRole("button", { name: "Add Event" }).click()
  await page.getByLabel("Event Name").fill(eventName)
  await page
    .getByLabel("Event Date")
    .fill(new Date().toISOString().slice(0, 10))
  await page.getByRole("button", { name: "Create Event" }).click()

  await expect(page.getByText("Event created successfully")).toBeVisible()
  await page.keyboard.press("Escape")
  const eventLink = page.getByRole("link", { name: eventName })
  await expect(eventLink).toBeVisible()
  const href = await eventLink.getAttribute("href")
  expect(href).toBeTruthy()
  eventId = href!.split("/").filter(Boolean).at(-1)!
  failEventRequests = true

  await page.goto(`${href}/registration`)
  await expect(
    page.getByRole("alert").getByText("Unable to load event details."),
  ).toBeVisible({ timeout: 15000 })
  await expect(
    page.getByRole("button", { name: "Retry loading event" }),
  ).toBeVisible()

  failEventRequests = false
  await page.getByRole("button", { name: "Retry loading event" }).click()
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible()

  await page.getByRole("link", { name: "Event Details" }).click()
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible()
  await page.getByRole("link", { name: "Events", exact: true }).last().click()
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible()
  await expect(page.getByText("Oops")).toHaveCount(0)
})

test("event details distinguish server failures from missing events and can retry", async ({
  page,
}) => {
  let failEventRequests = false
  let eventId = ""
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (
      failEventRequests &&
      url.pathname.includes("/api/v1/events/") &&
      url.pathname.endsWith(eventId)
    ) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated event request failure" }),
      })
      return
    }
    await route.continue()
  })

  await page.goto("/events")
  const eventName = `Event details query failure ${randomEmail()}`

  await page.getByRole("button", { name: "Add Event" }).click()
  await page.getByLabel("Event Name").fill(eventName)
  await page
    .getByLabel("Event Date")
    .fill(new Date().toISOString().slice(0, 10))
  await page.getByRole("button", { name: "Create Event" }).click()

  await expect(page.getByText("Event created successfully")).toBeVisible()
  await page.keyboard.press("Escape")
  const eventLink = page.getByRole("link", { name: eventName })
  await expect(eventLink).toBeVisible()
  const href = await eventLink.getAttribute("href")
  expect(href).toBeTruthy()
  eventId = href!.split("/").filter(Boolean).at(-1)!
  failEventRequests = true

  await page.goto(href!)
  await expect(page.getByText("Unable to load event details.")).toBeVisible({
    timeout: 15000,
  })
  await expect(
    page.getByRole("button", { name: "Retry loading event" }),
  ).toBeVisible()
  await expect(page.getByText("Event not found.")).toHaveCount(0)

  failEventRequests = false
  await page.getByRole("button", { name: "Retry loading event" }).click()
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible()
})

test("Create Event Cancel closes without submitting", async ({ page }) => {
  await page.goto("/events")
  await page.getByRole("button", { name: "Add Event" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Event Name").fill(`Cancelled event ${randomEmail()}`)
  await dialog.getByRole("button", { name: "Cancel" }).click()

  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("event roster student search can navigate beyond the first ten matches", async ({
  page,
}) => {
  const searchRequests: string[] = []
  await page.route("**/api/v1/students/**", async (route) => {
    const url = new URL(route.request().url())
    if (!url.searchParams.has("search")) {
      await route.continue()
      return
    }
    searchRequests.push(url.search)
    const skip = Number(url.searchParams.get("skip") ?? 0)
    const data = Array.from({ length: Math.min(10, 12 - skip) }, (_, index) => {
      const studentNumber = skip + index + 1
      return {
        id: `student-${studentNumber}`,
        person_id: `person-${studentNumber}`,
        student_number: `TEST-${String(studentNumber).padStart(3, "0")}`,
        person_name: `Common Name ${studentNumber}`,
        first_name: "Common",
        last_name: `Name ${studentNumber}`,
      }
    })
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, count: 12 }),
    })
  })

  await page.goto("/events")
  const eventName = `Roster search pagination ${randomEmail()}`
  await page.getByRole("button", { name: "Add Event" }).click()
  await page.getByLabel("Event Name").fill(eventName)
  await page
    .getByLabel("Event Date")
    .fill(new Date().toISOString().slice(0, 10))
  await page.getByRole("button", { name: "Create Event" }).click()
  await expect(page.getByText("Event created successfully")).toBeVisible()
  await page.keyboard.press("Escape")

  const eventRow = page.getByRole("row").filter({ hasText: eventName })
  await expect(eventRow).toBeVisible()
  await eventRow.getByRole("button", { name: "Roster", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog
    .getByPlaceholder("Search student by name or student number...")
    .fill("Common Name")
  await expect(dialog.getByText("Common Name 1", { exact: true })).toBeVisible()
  await expect(dialog.getByText("Showing 1–10 of 12")).toBeVisible()

  await dialog.getByRole("button", { name: "Next" }).click()
  await expect(
    dialog.getByText("Common Name 11", { exact: true }),
  ).toBeVisible()
  await expect(dialog.getByText("Common Name 1", { exact: true })).toHaveCount(
    0,
  )
  await expect(dialog.getByText("Showing 11–12 of 12")).toBeVisible()
  expect(searchRequests.some((query) => query.includes("skip=10"))).toBeTruthy()
})

test("deleting an event closes its confirmation and removes only that event", async ({
  page,
}) => {
  await page.goto("/events")
  const eventName = `Delete confirmation regression ${randomEmail()}`

  await page.getByRole("button", { name: "Add Event" }).click()
  await page.getByLabel("Event Name").fill(eventName)
  await page
    .getByLabel("Event Date")
    .fill(new Date().toISOString().slice(0, 10))
  await page.getByRole("button", { name: "Create Event" }).click()
  await expect(page.getByText("Event created successfully")).toBeVisible()
  await page.keyboard.press("Escape")

  const eventRow = page.getByRole("row").filter({ hasText: eventName })
  await expect(eventRow).toBeVisible()
  await eventRow.getByRole("button", { name: `Delete ${eventName}` }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText(eventName)
  await dialog.getByRole("button", { name: "Delete", exact: true }).click()

  await expect(page.getByText("Event deleted successfully")).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(
    page.getByRole("row").filter({ hasText: eventName }),
  ).toHaveCount(0)
})

test("eligible sections save automatically when a section is selected", async ({
  page,
}) => {
  const sectionId = "00000000-0000-4000-8000-000000000321"
  let savedSectionIds: string[] | undefined
  await page.route("**/api/v1/academic-sections/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: sectionId,
            section_name: "Automatic Save Test Section",
            year_level: 1,
            academic_year: "2026-2027",
          },
        ],
        count: 1,
      }),
    })
  })
  await page.route("**/api/v1/events/*", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as {
        eligible_section_ids?: string[]
      }
      if (body.eligible_section_ids) {
        savedSectionIds = body.eligible_section_ids
      }
    }
    await route.continue()
  })

  await page.goto("/events")
  const eventName = `Automatic section save ${randomEmail()}`
  await page.getByRole("button", { name: "Add Event" }).click()
  await page.getByLabel("Event Name").fill(eventName)
  await page
    .getByLabel("Event Date")
    .fill(new Date().toISOString().slice(0, 10))
  await page.getByRole("button", { name: "Create Event" }).click()
  await expect(page.getByText("Event created successfully")).toBeVisible()
  await page.keyboard.press("Escape")

  const eventLink = page.getByRole("link", { name: eventName })
  await expect(eventLink).toBeVisible()
  const href = await eventLink.getAttribute("href")
  await page.goto(`${href}/registration`)
  const sectionCheckbox = page.getByRole("checkbox")
  await expect(sectionCheckbox).toHaveCount(1)
  await sectionCheckbox.check()
  await expect.poll(() => savedSectionIds).toEqual([sectionId])
})

test("eligible section auto-saves are serialized and the latest selection wins", async ({
  page,
}) => {
  const firstSectionId = "00000000-0000-4000-8000-000000000401"
  const secondSectionId = "00000000-0000-4000-8000-000000000402"
  let firstPatchStarted = false
  let releaseFirstPatch: (() => void) | undefined
  const firstPatchGate = new Promise<void>((resolve) => {
    releaseFirstPatch = resolve
  })
  const savedSectionIds: string[][] = []

  await page.route("**/api/v1/academic-sections/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: firstSectionId,
            section_name: "Auto Save Queue Test 1A",
            year_level: 1,
            academic_year: "2026-2027",
          },
          {
            id: secondSectionId,
            section_name: "Auto Save Queue Test 1B",
            year_level: 1,
            academic_year: "2026-2027",
          },
        ],
        count: 2,
      }),
    })
  })
  await page.route("**/api/v1/events/*", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue()
      return
    }
    const body = route.request().postDataJSON() as {
      eligible_section_ids?: string[]
    }
    if (!body.eligible_section_ids) {
      await route.continue()
      return
    }
    savedSectionIds.push(body.eligible_section_ids)
    if (savedSectionIds.length === 1) {
      firstPatchStarted = true
      await firstPatchGate
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "event-auto-save-queue" }),
    })
  })

  await page.goto("/events")
  const eventName = `Serialized section save ${randomEmail()}`
  await page.getByRole("button", { name: "Add Event" }).click()
  await page.getByLabel("Event Name").fill(eventName)
  await page.getByLabel("Event Date").fill(new Date().toISOString().slice(0, 10))
  await page.getByRole("button", { name: "Create Event" }).click()
  await expect(page.getByText("Event created successfully")).toBeVisible()
  await page.keyboard.press("Escape")

  const eventLink = page.getByRole("link", { name: eventName })
  await expect(eventLink).toBeVisible()
  const href = await eventLink.getAttribute("href")
  await page.goto(`${href}/registration`)

  const firstCheckbox = page.getByRole("checkbox").nth(0)
  const secondCheckbox = page.getByRole("checkbox").nth(1)
  await expect(firstCheckbox).toBeVisible()
  await expect(secondCheckbox).toBeVisible()
  await firstCheckbox.check()
  await expect.poll(() => firstPatchStarted).toBeTruthy()

  await secondCheckbox.check()
  await page.waitForTimeout(500)
  expect(savedSectionIds).toHaveLength(1)

  releaseFirstPatch?.()
  await expect.poll(() => savedSectionIds).toHaveLength(2)
  expect(savedSectionIds[0]).toEqual([firstSectionId])
  expect(savedSectionIds[1]).toEqual([firstSectionId, secondSectionId])
})
