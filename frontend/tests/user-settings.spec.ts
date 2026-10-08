import { expect, test } from "@playwright/test"
import { createUser } from "./utils/privateApi"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser, logOutUser } from "./utils/user"

async function createAndLogInUser(page: import("@playwright/test").Page) {
  const email = randomEmail()
  const password = randomPassword()
  await createUser({ email, password })
  await logInUser(page, email, password)
  await page.goto("/account/profile")
  await expect(page.getByRole("heading", { name: "My Account" })).toBeVisible()
  return { email, password }
}

test.describe("Account profile", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("User can update their profile information", async ({ page }) => {
    await createAndLogInUser(page)

    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Full name").fill("Updated Test User")
    await page.getByRole("button", { name: "Save" }).click()

    await expect(page.getByText("User updated successfully")).toBeVisible()
    await expect(page.locator("form").getByText("Updated Test User")).toBeVisible()
  })

  test("Profile validates email format", async ({ page }) => {
    await createAndLogInUser(page)

    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Email").fill("invalid-email")
    await page.getByRole("button", { name: "Save" }).click()

    await expect(page.getByText("Invalid email address")).toBeVisible()
  })

  test("Saved profile information persists after reload", async ({ page }) => {
    await createAndLogInUser(page)

    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Full name").fill("Persistent Profile")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("User updated successfully")).toBeVisible()

    await page.reload()
    await expect(page.locator("form").getByText("Persistent Profile")).toBeVisible()
  })
})

test.describe("Account security", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("User can change their password", async ({ page }) => {
    const { email, password } = await createAndLogInUser(page)
    const newPassword = randomPassword()

    await page.goto("/account/security")
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill(newPassword)
    await page.getByTestId("confirm-password-input").fill(newPassword)
    await page.getByRole("button", { name: "Update Password" }).click()
    await expect(page.getByText("Password updated successfully")).toBeVisible()

    await logOutUser(page)
    await logInUser(page, email, newPassword)
  })

  test("Password change rejects mismatched passwords", async ({ page }) => {
    const { password } = await createAndLogInUser(page)

    await page.goto("/account/security")
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill(randomPassword())
    await page.getByTestId("confirm-password-input").fill("different-password")
    await page.getByRole("button", { name: "Update Password" }).click()

    await expect(page.getByText("The passwords don't match")).toBeVisible()
  })
})
