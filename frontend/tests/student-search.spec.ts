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
  await expect(page.getByText("No students match your search.")).toBeVisible()
})
