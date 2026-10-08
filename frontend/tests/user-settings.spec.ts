import { expect, test } from "@playwright/test"
import { createUser } from "./utils/privateApi"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser, logOutUser } from "./utils/user"

async function createAndLogInUser(page: import("@playwright/test").Page) {
  const email = randomEmail()
  const password = randomPassword()
  await createUser({ email, password })
  await logInUser(page, email, password)
  await page.goto("/account")
  await expect(page.getByRole("heading", { name: "My Account" })).toBeVisible()
  return { email, password }
}

test.describe("Account profile", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("User can update their personal information", async ({ page }) => {
    await createAndLogInUser(page)

    await page.getByLabel("First Name").fill("Updated")
    await page.getByLabel("Last Name").fill("Test User")
    await page.getByRole("button", { name: "Save changes" }).click()

    await expect(page.getByText("Account updated")).toBeVisible()
    await expect(page.getByLabel("First Name")).toHaveValue("Updated")
    await expect(page.getByLabel("Last Name")).toHaveValue("Test User")
  })

  test("Profile requires first and last names", async ({ page }) => {
    await createAndLogInUser(page)

    await page.getByLabel("First Name").fill(" ")
    await page.getByLabel("Last Name").fill("")
    await page.getByRole("button", { name: "Save changes" }).click()

    await expect(
      page.getByText("First name and last name are required"),
    ).toBeVisible()
  })

  test("Saved profile information persists after reload", async ({ page }) => {
    await createAndLogInUser(page)

    await page.getByLabel("First Name").fill("Persistent")
    await page.getByLabel("Last Name").fill("Profile")
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByText("Account updated")).toBeVisible()

    await page.reload()
    await expect(page.getByLabel("First Name")).toHaveValue("Persistent")
    await expect(page.getByLabel("Last Name")).toHaveValue("Profile")
  })
})

test.describe("Account security", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("User can change their password", async ({ page }) => {
    const { email, password } = await createAndLogInUser(page)
    const newPassword = randomPassword()

    await page.goto("/account/security")
    await page.getByLabel("Current password").fill(password)
    await page.getByLabel("New password").fill(newPassword)
    await page.getByLabel("Confirm new password").fill(newPassword)
    await page.getByRole("button", { name: "Change password" }).click()
    await expect(page.getByText("Password changed")).toBeVisible()

    await logOutUser(page)
    await logInUser(page, email, newPassword)
  })

  test("Password change rejects mismatched passwords", async ({ page }) => {
    const { password } = await createAndLogInUser(page)

    await page.goto("/account/security")
    await page.getByLabel("Current password").fill(password)
    await page.getByLabel("New password").fill(randomPassword())
    await page.getByLabel("Confirm new password").fill("different-password")
    await page.getByRole("button", { name: "Change password" }).click()

    await expect(page.getByText("New passwords do not match")).toBeVisible()
  })
})
