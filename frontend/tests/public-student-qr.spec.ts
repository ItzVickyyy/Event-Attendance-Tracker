import { expect, test } from "@playwright/test"

test.describe("Public student QR code", () => {
  test("generates and downloads the QR locally without contacting a third-party service", async ({
    page,
  }) => {
    const externalQrRequests: string[] = []
    page.on("request", (request) => {
      if (request.url().includes("api.qrserver.com")) {
        externalQrRequests.push(request.url())
      }
    })

    await page.route("**/api/v1/public/student-qr", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          student_number: "2024-00001",
          full_name: "Sample Student",
          section: "BSIT 3A",
          credential_value: "student-credential-test-value",
        }),
      })
    })

    await page.goto("/get-my-qr")
    await page.getByLabel("Student Number").fill("2024-00001")
    await page.getByLabel("First Name").fill("Sample")
    await page.getByLabel("Last Name").fill("Student")
    await page.getByRole("button", { name: "Find My QR Code" }).click()

    const canvas = page.locator("canvas")
    await expect(canvas).toBeVisible()
    await expect(page.getByText("Sample Student")).toBeVisible()

    const canvasInfo = await canvas.evaluate((element) => {
      const qr = element as HTMLCanvasElement
      const context = qr.getContext("2d")
      if (!context) throw new Error("QR canvas context is unavailable")
      const pixels = context.getImageData(0, 0, qr.width, qr.height).data
      let nonWhitePixels = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (
          pixels[index] < 250 ||
          pixels[index + 1] < 250 ||
          pixels[index + 2] < 250
        ) {
          nonWhitePixels += 1
        }
      }
      return { width: qr.width, height: qr.height, nonWhitePixels }
    })

    expect(canvasInfo.width).toBe(600)
    expect(canvasInfo.height).toBe(600)
    expect(canvasInfo.nonWhitePixels).toBeGreaterThan(1000)

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Download QR" }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe("2024-00001-QR.png")
    expect(externalQrRequests).toEqual([])
  })
})
