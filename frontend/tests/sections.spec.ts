import { expect, test } from "@playwright/test"

test("section details distinguish server failures from missing sections and can retry", async ({
  page,
}) => {
  const sectionId = "section-query-failure-test"
  let failSectionRequest = true
  let interceptedRequests = 0

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (
      url.pathname.includes("/api/v1/academic-sections/") &&
      url.pathname.endsWith(sectionId)
    ) {
      interceptedRequests += 1
      if (failSectionRequest) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Simulated section request failure" }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: sectionId,
            section_name: "WMAD 3A",
            program_id: "test-program",
            year_level: "3rd Year",
            academic_year: "2026-2027",
          },
        }),
      })
      return
    }
    await route.continue()
  })

  await page.goto(`/sections/${sectionId}`)
  await expect.poll(() => interceptedRequests).toBeGreaterThan(0)
  await expect(
    page.getByText("Unable to load section details."),
  ).toBeVisible({ timeout: 15000 })
  await expect(page.getByText("Section not found.")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Retry loading section" }),
  ).toBeVisible()

  failSectionRequest = false
  await page.getByRole("button", { name: "Retry loading section" }).click()
  await expect(page.getByRole("heading", { name: "WMAD 3A" })).toBeVisible()
})
