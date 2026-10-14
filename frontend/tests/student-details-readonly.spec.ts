import { expect, test } from "@playwright/test"

test("viewing student details never creates an attendee record", async ({
  page,
}) => {
  const sectionId = "00000000-0000-4000-8000-000000000001"
  const studentId = "00000000-0000-4000-8000-000000000002"
  const personId = "00000000-0000-4000-8000-000000000003"
  let attendeeLookupPersonId = ""
  let attendeeCreateRequests = 0

  await page.route(`**/api/v1/students/${studentId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: studentId,
        person_id: personId,
        student_number: "READONLY-001",
        person_name: "Test Student",
        academic_status: "regular",
        section_id: sectionId,
      }),
    })
  })

  await page.route(`**/api/v1/people/${personId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: personId,
        first_name: "Test",
        middle_name: "Middle",
        last_name: "Student",
        email: "test.student@example.com",
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

  await page.route("**/api/v1/attendees**", async (route) => {
    if (route.request().method() === "POST") {
      attendeeCreateRequests += 1
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-4000-8000-000000000004",
          person_id: personId,
          attendee_type: "student",
        }),
      })
      return
    }

    const url = new URL(route.request().url())
    attendeeLookupPersonId = url.searchParams.get("person_id") ?? ""
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], count: 0 }),
    })
  })

  await page.goto(`/sections/${sectionId}/students/${studentId}`)

  await expect(
    page.getByText("Student Information", { exact: true }),
  ).toBeVisible()
  await expect(page.getByText("READONLY-001", { exact: true })).toBeVisible()
  await expect(
    page.getByText(
      "This student is not linked to an attendee record, so NFC credential management is unavailable.",
      { exact: true },
    ),
  ).toBeVisible()
  await expect.poll(() => attendeeLookupPersonId).toBe(personId)
  expect(attendeeCreateRequests).toBe(0)
})
