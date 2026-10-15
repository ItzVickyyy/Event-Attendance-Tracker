import { expect, test } from "@playwright/test"

test("student search runs automatically after typing", async ({ page }) => {
  let searchedTerm = ""
  await page.route("**/api/v1/students**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.has("search")) {
      searchedTerm = url.searchParams.get("search") ?? ""
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], count: 0 }),
      })
      return
    }
    await route.continue()
  })

  await page.goto("/sections")
  const search = page.getByRole("textbox", { name: "Search students" })
  await search.fill("  TEST-STUDENT-123  ")

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
        id: studentId,
        person_id: personId,
        student_number: "TEST-STUDENT-123",
        person_name: "Test Student",
        academic_status: "regular",
        section_id: sectionId,
      }),
    })
  })
  await page.route("**/api/v1/attendees**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "00000000-0000-4000-8000-000000000004",
            person_id: personId,
            attendee_type: "student",
          },
        ],
        count: 1,
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

test("global student search shows the full program, major, and section name", async ({
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
        data: [
          {
            id: sectionId,
            section_name: "3A",
            section_code: "3A",
            program_id: "00000000-0000-4000-8000-000000000010",
            program_code: "BSIT",
            program_name: "Bachelor of Science in Information Technology",
            major_code: "WMAD",
            major_name: "Web and Mobile Application Development",
            year_level: "1",
            academic_year_id: "00000000-0000-4000-8000-000000000011",
            academic_year: "2026-2027",
            enrolled: 26,
          },
        ],
        count: 1,
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
        data: students.slice(skip, skip + limit),
        count: students.length,
      }),
    })
  })

  await page.goto("/sections")
  await page.getByRole("textbox", { name: "Search students" }).fill("Kenneth")

  await expect(page.getByText("BSIT WMAD 3A").first()).toBeVisible()
  await expect(page.getByText("Page 1 of 2")).toBeVisible()
  await expect(page.getByText("TEST-001")).toBeVisible()
  await expect(page.getByText("TEST-026")).toHaveCount(0)

  await page.getByRole("button", { name: "Next" }).click()

  await expect(page.getByText("Page 2 of 2")).toBeVisible()
  await expect(page.getByText("TEST-026")).toBeVisible()
  await expect(page.getByText("TEST-001")).toHaveCount(0)
})

test("section search requests matches beyond the loaded roster page", async ({
  page,
}) => {
  const sectionId = "00000000-0000-4000-8000-000000000001"
  const studentId = "00000000-0000-4000-8000-000000000099"
  let searchedTerm = ""

  await page.route(
    `**/api/v1/academic-sections/${sectionId}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: sectionId,
          section_name: "BSIT 1A",
          section_code: "1A",
          program_id: "00000000-0000-4000-8000-000000000010",
          year_level: "1",
          academic_year: "2026-2027",
        }),
      })
    },
  )
  await page.route("**/api/v1/academic-programs/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "00000000-0000-4000-8000-000000000010",
            program_code: "BSIT",
            program_name: "Bachelor of Science in Information Technology",
          },
        ],
        count: 1,
      }),
    })
  })
  await page.route("**/api/v1/students**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("section_id") !== sectionId) {
      await route.continue()
      return
    }
    searchedTerm = url.searchParams.get("search") ?? ""
    const rows = searchedTerm
      ? [
          {
            id: studentId,
            person_id: "00000000-0000-4000-8000-000000000098",
            student_number: "MIDDLE-ONLY-001",
            person_name: "Alex Example",
            academic_status: "regular",
            section_id: sectionId,
          },
        ]
      : Array.from({ length: 25 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
          person_id: `10000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
          student_number: `ROSTER-${String(index + 1).padStart(3, "0")}`,
          person_name: `Student ${index + 1}`,
          academic_status: "regular",
          section_id: sectionId,
        }))
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: rows, count: rows.length }),
    })
  })

  await page.goto(`/sections/${sectionId}/students`)
  await page
    .getByRole("textbox", { name: "Filter students in section" })
    .fill("MiddleNameOnly")

  await expect.poll(() => searchedTerm).toBe("MiddleNameOnly")
  await expect(page.getByText("MIDDLE-ONLY-001")).toBeVisible()
  await expect(page.getByText("ROSTER-001")).toHaveCount(0)
})

test("global student search restores its query and page after viewing details", async ({
  page,
}) => {
  const sectionId = "00000000-0000-4000-8000-000000000001"
  const studentId = "00000000-0000-4000-8000-000000000026"
  const personId = "10000000-0000-4000-8000-000000000026"
  const students = Array.from({ length: 26 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    person_id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    student_number: `RETURN-${String(index + 1).padStart(3, "0")}`,
    person_name: `Search Student ${index + 1}`,
    academic_status: "regular",
    section_id: sectionId,
  }))

  await page.route("**/api/v1/students**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.has("search")) {
      const skip = Number(url.searchParams.get("skip") ?? 0)
      const limit = Number(url.searchParams.get("limit") ?? 25)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: students.slice(skip, skip + limit),
          count: students.length,
        }),
      })
      return
    }
    await route.continue()
  })
  await page.route(`**/api/v1/students/${studentId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: studentId,
        person_id: personId,
        student_number: "RETURN-026",
        person_name: "Search Student 26",
        academic_status: "regular",
        section_id: sectionId,
      }),
    })
  })
  await page.route("**/api/v1/academic-registry/sections*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: sectionId,
            section_name: "BSIT 2A",
            section_code: "2A",
            program_id: "00000000-0000-4000-8000-000000000010",
            program_code: "BSIT",
            program_name: "Bachelor of Science in Information Technology",
            year_level: "2",
            academic_year_id: "00000000-0000-4000-8000-000000000011",
            academic_year: "2026-2027",
            enrolled: 26,
          },
        ],
        count: 1,
      }),
    })
  })
  await page.route(`**/api/v1/people/${personId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: personId,
        first_name: "Search",
        last_name: "Student 26",
        email: "student26@example.com",
      }),
    })
  })
  await page.route(
    `**/api/v1/academic-registry/students/${studentId}*`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ student_status: "regular" }),
      })
    },
  )
  await page.route(
    `**/api/v1/academic-sections/${sectionId}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: sectionId,
          section_name: "BSIT 2A",
          section_code: "2A",
          program_id: "00000000-0000-4000-8000-000000000010",
          year_level: "2",
          academic_year: "2026-2027",
        }),
      })
    },
  )
  await page.route("**/api/v1/academic-programs/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "00000000-0000-4000-8000-000000000010",
            program_code: "BSIT",
            program_name: "Bachelor of Science in Information Technology",
          },
        ],
        count: 1,
      }),
    })
  })
  await page.route("**/api/v1/attendees**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], count: 0 }),
    })
  })

  await page.goto("/sections")
  await page
    .getByRole("textbox", { name: "Search students" })
    .fill("Search Student")
  await expect(page.getByText("Page 1 of 2")).toBeVisible()
  await page.getByRole("button", { name: "Next" }).click()
  await expect(page.getByText("RETURN-026")).toBeVisible()
  await page.getByRole("link", { name: "View details" }).click()

  await expect(
    page.getByText("Student Information", { exact: true }),
  ).toBeVisible()
  await page.getByRole("link", { name: "Back to student search" }).click()

  await expect(
    page.getByRole("textbox", { name: "Search students" }),
  ).toHaveValue("Search Student")
  await expect(page.getByText("Page 2 of 2")).toBeVisible()
  await expect(page.getByText("RETURN-026")).toBeVisible()
  await expect(page.getByText("RETURN-001")).toHaveCount(0)
})
