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
        body: JSON.stringify({ detail: "Student is not enrolled in this section" }),
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
