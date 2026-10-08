import { expect, test, type Page } from "@playwright/test"
import { createUser } from "./utils/privateApi"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser, logOutUser } from "./utils/user"

async function logInAndCompleteRequiredPasswordChange(
  page: Page,
  email: string,
  initialPassword: string,
) {
  await logInUser(page, email, initialPassword)

  const passwordDialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Update Your Password" }),
  })
  if (await passwordDialog.isVisible()) {
    const password = randomPassword()
    await passwordDialog.getByLabel("Temporary password").fill(initialPassword)
    await passwordDialog.getByLabel("New password").fill(password)
    await passwordDialog.getByLabel("Confirm new password").fill(password)
    await passwordDialog
      .getByRole("button", { name: "Update Password" })
      .click()
    await expect(passwordDialog).not.toBeVisible()
    return password
  }

  return initialPassword
}

test.describe("Account profile", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("User can update their full name", async ({ page }) => {
    const email = randomEmail()
    const initialPassword = randomPassword()
    await createUser({ email, password: initialPassword })
    await logInAndCompleteRequiredPasswordChange(page, email, initialPassword)
    await page.goto("/account/profile")

    await expect(
      page.getByRole("heading", { name: "My Account" }),
    ).toBeVisible()
    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Full name").fill("Updated Test User")
    await page.getByRole("button", { name: "Save" }).click()

    await expect(page.getByText("User updated successfully")).toBeVisible()
    await expect(
      page.locator("form").getByText("Updated Test User", { exact: true }),
    ).toBeVisible()
  })

  test("Invalid email displays validation feedback", async ({ page }) => {
    const email = randomEmail()
    const initialPassword = randomPassword()
    await createUser({ email, password: initialPassword })
    await logInAndCompleteRequiredPasswordChange(page, email, initialPassword)
    await page.goto("/account/profile")

    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Email").fill("not-an-email")
    await page.getByLabel("Full name").click()
    await expect(page.getByText("Invalid email address")).toBeVisible()
  })

  test("Canceling profile edits restores the original values", async ({
    page,
  }) => {
    const email = randomEmail()
    const initialPassword = randomPassword()
    const user = await createUser({ email, password: initialPassword })
    await logInAndCompleteRequiredPasswordChange(
      page,
      email,
      initialPassword,
    )
    await page.goto("/account/profile")

    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Full name").fill("Unsaved Name")
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(
      page.locator("form").getByText(user.full_name as string, { exact: true }),
    ).toBeVisible()
  })
})

test.describe("Account security", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("User can change their password", async ({ page }) => {
    const email = randomEmail()
    const initialPassword = randomPassword()
    await createUser({ email, password: initialPassword })
    const password = await logInAndCompleteRequiredPasswordChange(
      page,
      email,
      initialPassword,
    )
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

  test("Password validation rejects weak and mismatched passwords", async ({
    page,
  }) => {
    const email = randomEmail()
    const initialPassword = randomPassword()
    await createUser({ email, password: initialPassword })
    const password = await logInAndCompleteRequiredPasswordChange(
      page,
      email,
      initialPassword,
    )
    await page.goto("/account/security")

    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill("weak")
    await page.getByTestId("confirm-password-input").fill("weak")
    await page.getByRole("button", { name: "Update Password" }).click()
    await expect(
      page.getByText("Password must be at least 8 characters"),
    ).toBeVisible()

    await page.getByTestId("new-password-input").fill(randomPassword())
    await page
      .getByTestId("confirm-password-input")
      .fill("different-password")
    await page.getByRole("button", { name: "Update Password" }).click()
    await expect(page.getByText("The passwords don't match")).toBeVisible()
  })
})
