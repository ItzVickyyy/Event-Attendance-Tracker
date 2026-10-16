import { expect, test } from "@playwright/test"

test("section details distinguish server failures from missing sections and can retry", async ({
  page,
}) => {
  const sectionId = "550e8400-e29b-41d4-a716-446655440000"
  let failSectionRequest = true
  let interceptedRequests = 0

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (
      url.pathname.includes("/api/v1/academic-sections/") &&
      url.pathname !== "/api/v1/academic-sections/"
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
          id: sectionId,
          section_name: "WMAD 3A",
          program_id: "test-program",
          year_level: "3rd Year",
          academic_year: "2026-2027",
        }),
      })
      return
    }
    await route.continue()
  })

  await page.goto(`/sections/${sectionId}`)
  await expect.poll(() => interceptedRequests).toBeGreaterThan(0)
  await expect(page.getByText("Unable to load section details.")).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByText("Section not found.")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Retry loading section" }),
  ).toBeVisible()

  failSectionRequest = false
  await page.getByRole("button", { name: "Retry loading section" }).click()
  await expect(page.getByRole("heading", { name: "WMAD 3A" })).toBeVisible()
})

test("section students page distinguishes section loading failures and can retry", async ({
  page,
}) => {
  const sectionId = "550e8400-e29b-41d4-a716-446655440001"
  let failSectionRequest = true
  let interceptedRequests = 0

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (
      url.pathname.includes("/api/v1/academic-sections/") &&
      url.pathname !== "/api/v1/academic-sections/"
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
          id: sectionId,
          section_name: "WMAD 3A",
          program_id: "test-program",
          year_level: "3rd Year",
          academic_year: "2026-2027",
        }),
      })
      return
    }
    await route.continue()
  })

  await page.goto(`/sections/${sectionId}/students`)
  await expect.poll(() => interceptedRequests).toBeGreaterThan(0)
  await expect(page.getByText("Unable to load section details.")).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByText("Section not found.")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Retry loading section" }),
  ).toBeVisible()

  failSectionRequest = false
  await page.getByRole("button", { name: "Retry loading section" }).click()
  await expect(page.getByRole("heading", { name: "WMAD 3A" })).toBeVisible()
})


test("section roster paginates students and resets the page when filtering", async ({
  page,
}) => {
  const sectionId = "550e8400-e29b-41d4-a716-446655440010"
  const yearId = "550e8400-e29b-41d4-a716-446655440011"
  const students = Array.from({ length: 25 }, (_, index) => ({
    id: `650e8400-e29b-41d4-a716-${String(index + 1).padStart(12, "0")}`,
    student_number: `ROSTER-${String(index + 1).padStart(3, "0")}`,
    first_name: `Student`,
    last_name: `Example ${index + 1}`,
    middle_name: null,
    extension: null,
    student_status: "regular",
  }))

  await page.route("**/api/v1/academic-registry/**", async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith("/academic-years")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: yearId,
              academic_year: "2026-2027",
              is_current: true,
            },
          ],
        }),
      })
      return
    }
    if (url.pathname.endsWith(`/sections/${sectionId}/students`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: students, count: students.length }),
      })
      return
    }
    if (url.pathname.endsWith("/sections")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: sectionId,
              program_id: "750e8400-e29b-41d4-a716-446655440010",
              program_code: "BSIT",
              major_code: "WMAD",
              section_code: "3A",
              year_level: "3rd Year",
              academic_year_id: yearId,
              academic_year: "2026-2027",
              enrolled: students.length,
            },
          ],
          count: 1,
        }),
      })
      return
    }
    await route.continue()
  })
  await page.route("**/api/v1/academic-programs**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "750e8400-e29b-41d4-a716-446655440010",
            program_code: "BSIT",
            program_name: "Bachelor of Science in Information Technology",
          },
        ],
        count: 1,
      }),
    })
  })

  await page.goto("/sections")
  await page.getByTitle("Students").first().click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Page 1 of 3")).toBeVisible()
  await expect(dialog.getByText("ROSTER-001")).toBeVisible()
  await expect(dialog.getByText("ROSTER-010")).toBeVisible()
  await expect(dialog.getByText("ROSTER-011")).toHaveCount(0)

  await dialog.getByRole("button", { name: "Next" }).click()
  await expect(dialog.getByText("Page 2 of 3")).toBeVisible()
  await expect(dialog.getByText("ROSTER-011")).toBeVisible()
  await expect(dialog.getByText("ROSTER-001")).toHaveCount(0)

  await dialog.getByPlaceholder("Search by student number or name...").fill("ROSTER-024")
  await expect(dialog.getByText("Page 1 of 1")).toBeVisible()
  await expect(dialog.getByText("ROSTER-024")).toBeVisible()
})
