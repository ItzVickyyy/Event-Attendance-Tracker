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
  ).toBeDisabled()

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

test("event modal Cancel buttons close without submitting or deleting", async ({
  page,
}) => {
  await page.goto("/events")
  const eventName = `Cancel button regression ${randomEmail()}`

  await page.getByRole("button", { name: "Add Event" }).click()
  let dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("link", { name: eventName })).toHaveCount(0)

  await page.getByRole("button", { name: "Add Event" }).click()
  dialog = page.getByRole("dialog")
  await dialog.getByLabel("Event Name").fill(eventName)
  await dialog
    .getByLabel("Event Date")
    .fill(new Date().toISOString().slice(0, 10))
  await dialog.getByRole("button", { name: "Create Event" }).click()
  await expect(page.getByText("Event created successfully")).toBeVisible()
  await expect(page.getByRole("link", { name: eventName })).toBeVisible()

  const eventRow = page.getByRole("row").filter({ hasText: eventName })
  await eventRow.getByRole("button").nth(2).click()
  dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(eventRow).toBeVisible()

  await eventRow.getByRole("button").nth(3).click()
  dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(eventRow).toBeVisible()
})

