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

  let sectionRequests = 0
  let failSectionRequests = true
  await page.route("**/*", async (route) => {
    if (!route.request().url().includes("academic-sections")) {
      await route.continue()
      return
    }
    sectionRequests += 1
    if (failSectionRequests) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated section request failure" }),
      })
      return
    }
    await route.continue()
  })

  await page.goto(`${href}/registration`)
  await expect(
    page.getByRole("alert").getByText(/Unable to load eligible sections/),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Save eligible sections" }),
  ).toBeDisabled()

  failSectionRequests = false
  await page.getByRole("button", { name: "Retry loading sections" }).click()
  await expect(
    page.getByRole("alert").getByText(/Unable to load eligible sections/),
  ).toHaveCount(0)
  expect(sectionRequests).toBeGreaterThanOrEqual(2)
})
