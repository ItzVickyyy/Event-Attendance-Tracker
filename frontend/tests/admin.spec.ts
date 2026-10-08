import { expect, test } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"
import { createUser } from "./utils/privateApi"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser } from "./utils/user"

test("User accounts administration is accessible to a super admin", async ({
  page,
}) => {
  await page.goto("/administration/users")
  await expect(
    page.getByRole("heading", { name: "User Accounts" }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Add account" })).toBeVisible()
})

test("Create a class representative account", async ({ page }) => {
  await page.goto("/administration/users")
  const email = randomEmail()
  const password = randomPassword()

  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByPlaceholder("Full name").fill("Test Class Representative")
  await page.getByPlaceholder("name@example.com").fill(email)
  await page.getByPlaceholder("At least 8 characters").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page.getByText("Account created")).toBeVisible()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await expect(page.getByRole("row").filter({ hasText: email })).toBeVisible()
})

test("Super admin can create an admin account", async ({ page }) => {
  await page.goto("/administration/users")
  const email = randomEmail()
  const password = randomPassword()

  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByPlaceholder("name@example.com").fill(email)
  await page.getByPlaceholder("At least 8 characters").fill(password)
  await page.getByRole("combobox").click()
  await page.getByRole("option", { name: "admin", exact: true }).click()
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page.getByText("Account created")).toBeVisible()
  const row = page.getByRole("row").filter({ hasText: email })
  await expect(row).toBeVisible()
  await expect(row).toContainText("admin")
})

test("Cancel account creation closes the dialog", async ({ page }) => {
  await page.goto("/administration/users")
  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByPlaceholder("name@example.com").fill("cancelled@example.com")
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
})

test("Account creation requires a valid-length password", async ({ page }) => {
  await page.goto("/administration/users")
  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByPlaceholder("name@example.com").fill(randomEmail())
  await page.getByPlaceholder("At least 8 characters").fill("short")
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeDisabled()
})

test("Search filters user accounts", async ({ page }) => {
  await page.goto("/administration/users")
  const email = randomEmail()
  const password = randomPassword()

  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByPlaceholder("name@example.com").fill(email)
  await page.getByPlaceholder("At least 8 characters").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByText("Account created")).toBeVisible()

  await page.getByPlaceholder("Search users…").fill(email)
  await expect(page.getByRole("row").filter({ hasText: email })).toBeVisible()
  await page.getByPlaceholder("Search users…").fill("no-match-for-this-test")
  await expect(page.getByText("No users found.")).toBeVisible()
})

test.describe("Administration access control", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Non-admin cannot access user administration", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    await createUser({ email, password })
    await logInUser(page, email, password)
    await page.goto("/administration/users")
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(
      page.getByRole("heading", { name: "User Accounts" }),
    ).not.toBeVisible()
  })

  test("Super admin can access user administration", async ({ page }) => {
    await logInUser(page, firstSuperuser, firstSuperuserPassword)
    await page.goto("/administration/users")
    await expect(
      page.getByRole("heading", { name: "User Accounts" }),
    ).toBeVisible()
  })
})
