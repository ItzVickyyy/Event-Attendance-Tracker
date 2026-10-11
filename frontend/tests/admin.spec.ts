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

test("Generic account creation does not offer Class Representative role", async ({
  page,
}) => {
  await page.goto("/administration/users")
  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByRole("combobox").nth(2).click()
  await expect(
    page.getByRole("option", { name: "Class Representative", exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Cancel" }).click()
})

test("Create a class representative account with an assigned section", async ({
  page,
}) => {
  await page.goto("/administration/class-representatives")
  const email = randomEmail()

  await page
    .getByRole("button", { name: "Create Class Representative" })
    .click()
  await page.getByLabel("First Name").fill("Test")
  await page.getByLabel("Middle Initial").fill("A")
  await page.getByLabel("Last Name").fill("Representative")
  await page.getByLabel("Email").fill(email)

  await page.getByRole("combobox").nth(0).click()
  await page.getByRole("option", { name: /2026-2027/ }).click()
  await page.getByRole("combobox").nth(1).click()
  await page.getByRole("option", { name: /BSIT WMAD 3A/ }).click()
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(
    page.getByText("Class Representative account created"),
  ).toBeVisible()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  const row = page.getByRole("row").filter({ hasText: email })
  await expect(row).toBeVisible()
  await expect(row).toContainText("WMAD 3A")

  await page.goto("/administration/users")
  await page.getByPlaceholder("Search by name, email, or position").fill(email)
  const accountRow = page.getByRole("row").filter({ hasText: email })
  await accountRow.getByRole("combobox").click()
  await expect(
    page.getByRole("option", { name: "Class Representative", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("option", { name: "Student", exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press("Escape")
  await accountRow.getByRole("button", { name: "Edit" }).click()
  const dialog = page.getByRole("dialog")
  const systemRole = dialog.getByRole("combobox").nth(2)
  await expect(systemRole).toContainText("Class Representative")
  await systemRole.click()
  await expect(
    page.getByRole("option", {
      name: "Class Representative",
      exact: true,
    }),
  ).toBeVisible()
})

test("Super admin can create an officer account with a position", async ({
  page,
}) => {
  await page.goto("/administration/users")
  const email = randomEmail()
  const studentId = `OFFICER-${randomEmail()
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 10)}`
  const position = `Recording Secretary ${studentId.slice(-5)}`

  await page.getByRole("button", { name: "Manage positions" }).click()
  await page.getByPlaceholder("e.g. Recording Secretary").fill(position)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByText(position, { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Close" }).last().click()

  await page.getByRole("button", { name: "Add account" }).click()
  await page.locator("#officer-student-number").fill(studentId)
  await page.locator("#officer-first-name").fill("Juan")
  await page.locator("#officer-middle-initial").fill("D")
  await page.locator("#officer-last-name").fill("Dela Cruz")
  await page.getByPlaceholder("name@example.com").fill(email)
  await page.getByRole("combobox").nth(0).click()
  await page.getByRole("option", { name: /2026-2027/ }).click()
  await page.getByRole("combobox").nth(1).click()
  await page.getByRole("option", { name: /BSIT WMAD 3A/ }).click()
  await page.getByRole("combobox").nth(2).click()
  await page.getByRole("option", { name: "Admin", exact: true }).click()
  await page.getByRole("combobox").nth(3).click()
  await page.getByRole("option", { name: position, exact: true }).click()
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page.getByText("Account created")).toBeVisible()
  const row = page.getByRole("row").filter({ hasText: email })
  await expect(row).toBeVisible()
  await expect(row).toContainText("Admin")
  await expect(row).toContainText(position)
  await row.getByRole("combobox").click()
  await expect(
    page.getByRole("option", { name: "Admin", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("option", { name: "Super Admin", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("option", { name: "Student", exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("option", { name: "Class Representative", exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press("Escape")
})

test("Cancel account creation closes the dialog", async ({ page }) => {
  await page.goto("/administration/users")
  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByPlaceholder("name@example.com").fill("cancelled@example.com")
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
})

test("Officer account creation requires identity and academic details", async ({
  page,
}) => {
  await page.goto("/administration/users")
  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByPlaceholder("name@example.com").fill(randomEmail())
  await page.locator("#officer-student-number").fill("INCOMPLETE-OFFICER")
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeDisabled()
})

test("Search filters officer accounts by email and position", async ({
  page,
}) => {
  await page.goto("/administration/users")
  const email = randomEmail()
  const studentId = `SEARCH-${randomEmail()
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 10)}`
  const position = `Event Coordinator ${studentId.slice(-5)}`

  await page.getByRole("button", { name: "Manage positions" }).click()
  await page.getByPlaceholder("e.g. Recording Secretary").fill(position)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("button", { name: "Close" }).last().click()

  await page.getByRole("button", { name: "Add account" }).click()
  await page.locator("#officer-student-number").fill(studentId)
  await page.locator("#officer-first-name").fill("Search")
  await page.locator("#officer-last-name").fill("Officer")
  await page.getByPlaceholder("name@example.com").fill(email)
  await page.getByRole("combobox").nth(0).click()
  await page.getByRole("option", { name: /2026-2027/ }).click()
  await page.getByRole("combobox").nth(1).click()
  await page.getByRole("option", { name: /BSIT WMAD 3A/ }).click()
  await page.getByRole("combobox").nth(3).click()
  await page.getByRole("option", { name: position, exact: true }).click()
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByText("Account created")).toBeVisible()

  await page.getByPlaceholder("Search by name, email, or position").fill(email)
  const row = page.getByRole("row").filter({ hasText: email })
  await expect(row).toBeVisible()
  await expect(row).toContainText("Admin")
  await expect(row).toContainText(position)
  await page
    .getByPlaceholder("Search by name, email, or position")
    .fill("no-match-for-this-test")
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

test("Scanner Permissions page is removed from administration", async ({
  page,
}) => {
  await page.goto("/administration")
  await expect(
    page.getByRole("heading", { name: "Administration" }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: /Scanner Permissions/ }),
  ).toHaveCount(0)

  await page.goto("/administration/scanner-permissions")
  await expect(
    page.getByRole("heading", { name: "Scanner Permissions" }),
  ).toHaveCount(0)
})

test("Event details route renders when opened directly", async ({ page }) => {
  await page.goto("/events/00000000-0000-0000-0000-000000000000")
  await expect(page.getByText("Loading event…")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Events", exact: true }),
  ).toHaveCount(0)
})

test("Academic year selector stays open after changing the selected year", async ({
  page,
}) => {
  await page.goto("/dashboard")
  await page.getByRole("button", { name: /Academic Year:/ }).click()
  const years = page.getByRole("menuitemradio")
  const count = await years.count()
  test.skip(count < 2, "At least two academic years are required")
  await years.nth(1).click()
  await expect(years.nth(1)).toBeVisible()
})

test("Super admin can validate and import officer accounts from CSV", async ({
  page,
}) => {
  await page.goto("/administration/users")
  const email = randomEmail()
  const studentId = `IMPORT-${randomEmail()
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 10)}`
  const position = `Auditor ${studentId.slice(-5)}`

  await page.getByRole("button", { name: "Manage positions" }).click()
  await page.getByPlaceholder("e.g. Recording Secretary").fill(position)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("button", { name: "Close" }).last().click()

  await page.getByRole("button", { name: "Import accounts" }).click()
  const csv = [
    "Student ID,First Name,Middle Initial,Last Name,Extension,Academic Year,Section,Email,Organization,Role,Position",
    `${studentId},Jamie,Q,Importer,,2026-2027,BSIT WMAD 3A,${email},CCS Student Council,Admin,${position}`,
  ].join("\n")
  await page.locator("#officer-import-file").setInputFiles({
    name: "officers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  })
  await page.getByRole("button", { name: "Validate file" }).click()
  await expect(page.getByText("Validated 1 officer rows")).toBeVisible()
  await expect(page.getByText("Valid rows: 1")).toBeVisible()
  await page
    .getByRole("button", { name: "Import accounts", exact: true })
    .last()
    .click()
  await expect(page.getByText("Imported 1 officer account(s)")).toBeVisible()

  await page.getByPlaceholder("Search by name, email, or position").fill(email)
  const row = page.getByRole("row").filter({ hasText: email })
  await expect(row).toBeVisible()
  await expect(row).toContainText(position)
})

test("Edit account matches Add Account fields without a password field", async ({
  page,
}) => {
  const email = randomEmail()
  await createUser({ email, password: randomPassword() })

  await page.goto("/administration/users")
  await page.getByPlaceholder("Search by name, email, or position").fill(email)
  const row = page.getByRole("row").filter({ hasText: email })
  await expect(row).toBeVisible()
  await row.getByRole("button", { name: "Edit" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Student ID *")).toBeVisible()
  await expect(dialog.getByText("First Name *")).toBeVisible()
  await expect(dialog.getByText("Middle Initial")).toBeVisible()
  await expect(dialog.getByText("Last Name *")).toBeVisible()
  await expect(dialog.getByText("Academic Year *")).toBeVisible()
  await expect(dialog.getByText("Section *")).toBeVisible()
  await expect(dialog.getByText("Organization *")).toBeVisible()
  await expect(dialog.getByText("System Role *")).toBeVisible()
  await expect(dialog.getByText("Position *")).toBeVisible()
  await expect(dialog.getByText("New Password")).toHaveCount(0)
})
