import { expect, test } from "@playwright/test"

test("student search submits the entered query when Search is clicked", async ({
  page,
}) => {
  let searchedTerm = ""
  await page.route("**/api/v1/students**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.has("search")) {
      searchedTerm = url.searchParams.get("search") ?? ""
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { data: [], count: 0 } }),
      })
      return
    }
    await route.continue()
  })

  await page.goto("/sections")
  const search = page.getByRole("textbox", { name: "Search students" })
  await search.fill("  TEST-STUDENT-123  ")
  await page.getByRole("button", { name: "Search", exact: true }).click()

  await expect.poll(() => searchedTerm).toBe("TEST-STUDENT-123")
})

test("direct student details URL renders the nested details route", async ({
  page,
}) => {
  const sectionId = "00000000-0000-4000-8000-000000000001"
  const studentId = "00000000-0000-4000-8000-000000000002"
  const personId = "00000000-0000-4000-8000-000000000003"

  await page.route(`**/api/v1/students/${studentId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: studentId,
          person_id: personId,
          student_number: "TEST-STUDENT-123",
          person_name: "Test Student",
          academic_status: "regular",
          section_id: sectionId,
        },
      }),
    })
  })
  await page.route(
    `**/api/v1/academic-registry/students/${studentId}*`,
    async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Student is not enrolled in this section",
        }),
      })
    },
  )

  await page.goto(`/sections/${sectionId}/students/${studentId}`)

  await expect(
    page.getByText("Student is not part of this section.", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("Students in this section", { exact: true }),
  ).toHaveCount(0)
})

test("global student search paginates results and shows the section name", async ({
  page,
}) => {
  const sectionId = "00000000-0000-4000-8000-000000000001"
  const students = Array.from({ length: 26 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
    person_id: `10000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
    student_number: `TEST-${String(index + 1).padStart(3, "0")}`,
    person_name: `Kenneth Test ${index + 1}`,
    academic_status: "regular",
    section_id: sectionId,
  }))

  await page.route("**/api/v1/academic-registry/sections*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          data: [
            {
              id: sectionId,
              section_name: "BSIT 1A",
              section_code: "1A",
              program_id: "00000000-0000-4000-8000-000000000010",
              program_code: "BSIT",
              program_name: "Bachelor of Science in Information Technology",
              year_level: "1",
              academic_year_id: "00000000-0000-4000-8000-000000000011",
              academic_year: "2026-2027",
              enrolled: 26,
            },
          ],
          count: 1,
        },
      }),
    })
  })

  await page.route("**/api/v1/students**", async (route) => {
    const url = new URL(route.request().url())
    if (!url.searchParams.has("search")) {
      await route.continue()
      return
    }
    const skip = Number(url.searchParams.get("skip") ?? 0)
    const limit = Number(url.searchParams.get("limit") ?? 25)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          data: students.slice(skip, skip + limit),
          count: students.length,
        },
      }),
    })
  })

  await page.goto("/sections")
  await page.getByRole("textbox", { name: "Search students" }).fill("Kenneth")
  await page.getByRole("button", { name: "Search", exact: true }).click()

  await expect(page.getByText("BSIT 1A").first()).toBeVisible()
  await expect(page.getByText("Page 1 of 2")).toBeVisible()
  await expect(page.getByText("TEST-001")).toBeVisible()
  await expect(page.getByText("TEST-026")).toHaveCount(0)

  await page.getByRole("button", { name: "Next" }).click()

  await expect(page.getByText("Page 2 of 2")).toBeVisible()
  await expect(page.getByText("TEST-026")).toBeVisible()
  await expect(page.getByText("TEST-001")).toHaveCount(0)
})
