import { expect, test } from "@playwright/test"

test("settings modal saves account appearance preferences", async ({
  page,
}) => {
  await page.goto("/dashboard")
  await page.getByTestId("user-menu").click()
  await page.getByRole("menuitem", { name: "Settings" }).click()

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await expect(page.getByText("Visual Style", { exact: true })).toBeVisible()
  const appearanceSections = page.getByRole("navigation", {
    name: "Settings sections",
  })
  await expect(appearanceSections.getByRole("button")).toHaveText([
    "Appearance",
  ])
  await expect(
    appearanceSections.getByRole("button", { name: "Visual Style" }),
  ).toHaveCount(0)
  await expect(
    appearanceSections.getByRole("button", { name: "Theme Colors" }),
  ).toHaveCount(0)
  await expect(
    appearanceSections.getByRole("button", { name: "Advanced" }),
  ).toHaveCount(0)

  await page.getByLabel("Accent HEX color").fill("#ff6600")
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--primary"),
      ),
    )
    .toBe("#ff6600")

  await page.getByRole("button", { name: "Dark Mode" }).click()
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(true)

  await page.getByLabel("UI Font Size").selectOption("large")
  await page.getByRole("button", { name: "High Contrast" }).click()

  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.dataset.uiFontSize),
    )
    .toBe("large")
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.classList.contains("high-contrast"),
      ),
    )
    .toBe(true)

  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--primary"),
      ),
    )
    .toBe("#ff6600")
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(true)
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.dataset.uiFontSize),
    )
    .toBe("large")
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.classList.contains("high-contrast"),
      ),
    )
    .toBe(true)
})

test("top navigation theme button toggles light and dark modes without reverting", async ({
  page,
}) => {
  await page.goto("/dashboard")
  const wasDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  )

  const firstPreferencePatch = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/users/me/appearance-preferences") &&
      response.request().method() === "PATCH",
  )
  await page.getByTestId("top-nav-theme-toggle").click()
  const shouldBeDark = !wasDark
  const firstPatchResponse = await firstPreferencePatch
  expect(firstPatchResponse.ok()).toBeTruthy()
  await expect(firstPatchResponse.json()).resolves.toMatchObject({
    theme: shouldBeDark ? "dark" : "light",
  })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(shouldBeDark)
  await page.waitForTimeout(750)
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(shouldBeDark)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("vite-ui-theme")))
    .toBe(shouldBeDark ? "dark" : "light")

  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(shouldBeDark)

  const secondPreferencePatch = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/users/me/appearance-preferences") &&
      response.request().method() === "PATCH",
  )
  await page.getByTestId("top-nav-theme-toggle").click()
  const secondPatchResponse = await secondPreferencePatch
  expect(secondPatchResponse.ok()).toBeTruthy()
  await expect(secondPatchResponse.json()).resolves.toMatchObject({
    theme: wasDark ? "dark" : "light",
  })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(wasDark)
  await page.waitForTimeout(750)
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(wasDark)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("vite-ui-theme")))
    .toBe(wasDark ? "dark" : "light")
})

test("My Account opens in a modal without navigating away", async ({
  page,
}) => {
  await page.goto("/dashboard")
  await page.getByTestId("user-menu").click()
  await page.getByRole("menuitem", { name: "My Account" }).click()
  await expect(page.getByRole("heading", { name: "My Account" })).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(
    page.getByRole("navigation", { name: "Account sections" }),
  ).toBeVisible()
})
