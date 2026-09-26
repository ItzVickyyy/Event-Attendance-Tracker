    })
    await page.goto("/scanner?event_id=evt-1")

    const card = await getSyncStatusCard(page)
    await expect(card.getByText("1 attendees on offline roster")).toBeVisible()

    await page.context().setOffline(true)

    await page.fill('input[placeholder="8F:49:5B:74"]', "CRED-1")
    await page.keyboard.press("Enter")
    await expect(page.getByText("Scan queued - Jane Doe")).toBeVisible()

    await page.fill('input[placeholder="8F:49:5B:74"]', "CRED-1")
    await page.keyboard.press("Enter")
    await expect(
      page.getByText("Already queued for this attendee", { exact: true }),
    ).toBeVisible()

    const queue = await readQueue(page)
    expect(queue).toHaveLength(1)

    await page.context().setOffline(false)
  })
})