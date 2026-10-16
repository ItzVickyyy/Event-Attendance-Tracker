import { expect, test } from "@playwright/test"

test("correcting attendance refreshes the records table", async ({ page }) => {
  const academicYearId = "550e8400-e29b-41d4-a716-446655440100"
  const eventId = "550e8400-e29b-41d4-a716-446655440101"
  const attendanceId = "550e8400-e29b-41d4-a716-446655440102"
  let attendanceStatus = "present"
  let attendanceReads = 0

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path.includes("/attendance-corrections")) {
      if (request.method() === "POST") {
        const body = request.postDataJSON()
        attendanceStatus = body.new_status ?? attendanceStatus
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: "550e8400-e29b-41d4-a716-446655440103",
              reason: body.reason,
              old_status: "present",
              new_status: attendanceStatus,
              corrected_at: new Date().toISOString(),
            },
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            data: [],
            count: 0,
          },
        }),
      })
      return
    }

    if (path.includes("/academic-registry/academic-years")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: academicYearId,
              label: "2026-2027",
              start_year: 2026,
              end_year: 2027,
              is_current: true,
            },
          ],
        }),
      })
      return
    }

    if (path.includes("/events")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            data: [
              {
                id: eventId,
                event_name: "Attendance Correction Regression",
                event_date: "2026-10-16",
                status: "open",
                attendance_mode: "time_in_only",
              },
            ],
            count: 1,
          },
        }),
      })
      return
    }

    if (path.includes("/attendance")) {
      attendanceReads += 1
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            data: [
              {
                id: attendanceId,
                event_id: eventId,
                event_name: "Attendance Correction Regression",
                person_name: "Regression Test Student",
                student_number: "TEST-100",
                time_in: "2026-10-16T08:00:00Z",
                time_out: null,
                status: attendanceStatus,
                scan_method: "qr",
                created_at: "2026-10-16T08:00:00Z",
              },
            ],
            count: 1,
          },
        }),
      })
      return
    }

    await route.continue()
  })

  await page.goto("/records")
  await expect(
    page.getByText("Regression Test Student", { exact: true }),
  ).toBeVisible()
  await expect(page.getByText("present", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Correct" }).click()
  await page.getByRole("menuitem", { name: "Correct Record" }).click()
  await page.getByLabel("Reason for Correction").fill("Regression test correction")
  await page.getByRole("combobox").last().click()
  await page.getByRole("option", { name: "Incomplete" }).click()
  await page.getByRole("button", { name: "Save Correction" }).click()

  await expect(page.getByText("Attendance record corrected successfully")).toBeVisible()
  await expect(page.getByText("incomplete", { exact: true })).toBeVisible()
  expect(attendanceReads).toBeGreaterThan(1)
})
