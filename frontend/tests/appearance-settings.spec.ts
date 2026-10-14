import { expect, test } from "@playwright/test"

test("settings modal saves account appearance preferences", async ({
  page,
}) => {
  await page.goto("/dashboard")
  await page.getByTestId("user-menu").click()
  await page.getByRole("menuitem", { name: "Settings" }).click()

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Visual Style" }),
  ).toBeVisible()
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

test("top navigation theme button toggles light and dark modes", async ({
  page,
}) => {
  await page.goto("/dashboard")
  const wasDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  )
  await page.getByTestId("top-nav-theme-toggle").click()
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(!wasDark)
  await page.getByTestId("top-nav-theme-toggle").click()
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(wasDark)
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
