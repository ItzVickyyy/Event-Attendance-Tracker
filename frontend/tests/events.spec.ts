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
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (
        url.includes("academic-sections") &&
        window.sessionStorage.getItem("allow-section-retry") !== "true"
      ) {
        return new Response(
          JSON.stringify({ detail: "Simulated section request failure" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        )
      }
      return originalFetch(input, init)
    }
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

  await page.goto(`${href}/registration`)
  await expect(
    page.getByRole("alert").getByText(/Unable to load eligible sections/),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Save eligible sections" }),
  ).toBeDisabled()

  await page.evaluate(() => {
    window.sessionStorage.setItem("allow-section-retry", "true")
  })
  await page.getByRole("button", { name: "Retry loading sections" }).click()
  await expect(
    page.getByRole("alert").getByText(/Unable to load eligible sections/),
  ).toHaveCount(0)
})
