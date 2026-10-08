import { expect, test } from "@playwright/test"
import { createUser } from "./utils/privateApi"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser } from "./utils/user"

test("User Accounts page is accessible to Super Admin", async ({ page }) => {
  await page.goto("/administration/users")
  await expect(page.getByRole("heading", { name: "User Accounts" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Add account" })).toBeVisible()
})

test("Super Admin can create an account", async ({ page }) => {
  await page.goto("/administration/users")
  const email = randomEmail()
  const password = randomPassword()

  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByPlaceholder("Full name").fill("Test User Admin")
  await page.getByPlaceholder("name@example.com").fill(email)
  await page.getByPlaceholder("At least 8 characters").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page.getByText("Account created")).toBeVisible()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await expect(page.getByRole("row").filter({ hasText: email })).toBeVisible()
})

test("Account creation requires a valid email and minimum password length", async ({ page }) => {
  await page.goto("/administration/users")
  await page.getByRole("button", { name: "Add account" }).click()

  const createButton = page.getByRole("button", { name: "Create account" })
  await expect(createButton).toBeDisabled()
  await page.getByPlaceholder("name@example.com").fill("not-an-email")
  await page.getByPlaceholder("At least 8 characters").fill("short")
  await expect(createButton).toBeEnabled()
})

test("Cancel account creation closes the dialog without creating an account", async ({ page }) => {
  await page.goto("/administration/users")
  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByPlaceholder("name@example.com").fill("cancelled@example.com")
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await expect(page.getByRole("row").filter({ hasText: "cancelled@example.com" })).toHaveCount(0)
})

test.describe("Administration access control", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("A regular user cannot access User Accounts", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    await createUser({ email, password })
    await logInUser(page, email, password)

    await page.goto("/administration/users")
    await expect(page).not.toHaveURL(/\/administration\/users/)
    await expect(page.getByRole("heading", { name: "User Accounts" })).not.toBeVisible()
  })
})
