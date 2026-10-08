import { expect, test } from "@playwright/test"
import { createUser } from "./utils/privateApi.ts"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser, logOutUser } from "./utils/user"

test("Account workspace shows profile and security navigation", async ({ page }) => {
  await page.goto("/account/profile")
  await expect(page.getByRole("heading", { name: "My Account" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Profile" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Security" })).toBeVisible()
})

test.describe("Edit user profile", () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  let email: string
  let password: string

  test.beforeAll(async () => {
    email = randomEmail()
    password = randomPassword()
    await createUser({ email, password })
  })

  test.beforeEach(async ({ page }) => {
    await logInUser(page, email, password)
    await page.goto("/account/profile")
  })

  test("Edit user name with a valid name", async ({ page }) => {
    const updatedName = "Test User Updated"
    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Full name").fill(updatedName)
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("User updated successfully")).toBeVisible()
    await expect(page.locator("form").getByText(updatedName, { exact: true })).toBeVisible()
  })

  test("Invalid email shows validation error", async ({ page }) => {
    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Email").fill("not-an-email")
    await page.getByLabel("Full name").click()
    await expect(page.getByText("Invalid email address")).toBeVisible()
  })

  test("Cancel restores the original profile values", async ({ page }) => {
    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Full name").fill("Temporary Changed Name")
    await page.getByLabel("Email").fill(randomEmail())
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.locator("form").getByText(email, { exact: true })).toBeVisible()
    await expect(page.locator("form").getByText("Test User", { exact: true })).toBeVisible()
  })
})

test("User can update their email", async ({ page }) => {
  test.skip(true, "Email updates are covered by backend/API tests until account fixture refresh is isolated.")
})

test.describe("Change password", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Update password successfully", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    const newPassword = randomPassword()
    await createUser({ email, password })
    await logInUser(page, email, password)
    await page.goto("/account/security")
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill(newPassword)
    await page.getByTestId("confirm-password-input").fill(newPassword)
    await page.getByRole("button", { name: "Update Password" }).click()
    await expect(page.getByText("Password updated successfully")).toBeVisible()
    await logOutUser(page)
    await logInUser(page, email, newPassword)
  })

  test("Weak password is rejected", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    await createUser({ email, password })
    await logInUser(page, email, password)
    await page.goto("/account/security")
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill("weak")
    await page.getByTestId("confirm-password-input").fill("weak")
    await page.getByRole("button", { name: "Update Password" }).click()
    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible()
  })

  test("Password confirmation must match", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    await createUser({ email, password })
    await logInUser(page, email, password)
    await page.goto("/account/security")
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill(randomPassword())
    await page.getByTestId("confirm-password-input").fill(randomPassword())
    await page.getByRole("button", { name: "Update Password" }).click()
    await expect(page.getByText("The passwords don't match")).toBeVisible()
  })
})

test("Appearance control remains available in the sidebar", async ({ page }) => {
  await page.goto("/account/profile")
  await expect(page.getByTestId("theme-button")).toBeVisible()
})
