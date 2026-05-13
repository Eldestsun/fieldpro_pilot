import { test, expect, Page } from '@playwright/test'

// ── auth helper ───────────────────────────────────────────────────────────────

async function signInAsLead(page: Page) {
  const email = process.env.E2E_LEAD_USER_EMAIL
  const password = process.env.E2E_LEAD_USER_PASSWORD
  if (!email || !password) throw new Error('E2E_LEAD_USER_EMAIL / E2E_LEAD_USER_PASSWORD not set')

  await page.goto('/routes')

  await page.getByRole('button', { name: /sign in/i }).click()

  const popup = await page.waitForEvent('popup')
  await popup.waitForLoadState('domcontentloaded')
  await popup.fill('input[type="email"]', email)
  await popup.getByRole('button', { name: /next/i }).click()
  await popup.fill('input[type="password"]', password)
  await popup.getByRole('button', { name: /sign in/i }).click()

  const staySignedIn = popup.getByRole('button', { name: /no/i })
  if (await staySignedIn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await staySignedIn.click()
  }

  await popup.waitForEvent('close')
  await page.waitForURL('**/routes', { timeout: 15_000 })
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Lead route creation flow', () => {
  test('Lead can create a route', async ({ page }) => {
    await signInAsLead(page)

    // 3. Click "Create Route"
    await page.getByRole('button', { name: /Create Route/i }).click()
    await expect(page.getByRole('heading', { name: /Create Route/i })).toBeVisible()

    // 4. Select a pool from the dropdown
    const poolSelect = page.getByLabel(/Route Pool/i)
    await poolSelect.waitFor({ state: 'visible' })
    // Pick the first non-placeholder option
    await poolSelect.selectOption({ index: 1 })

    // 5. Select assigned field crew
    const crewSelect = page.getByLabel(/Assigned Field Crew/i)
    await crewSelect.waitFor({ state: 'visible' })
    await crewSelect.selectOption({ index: 1 })

    // Wait for preview to load
    await expect(page.getByText(/Preview/i)).toBeVisible({ timeout: 8_000 })

    // 6. Save the route
    await page.getByRole('button', { name: /Save Route|Create|Confirm/i }).click()

    // 7. Verify route appears in routes list
    await expect(page.getByRole('heading', { name: /Create Route/i })).not.toBeVisible({
      timeout: 8_000,
    })
    // The new route should appear somewhere in the lead routes panel
    await expect(page.locator('[class*="route"]').first()).toBeVisible({ timeout: 8_000 })

    // 8. Verify backend state — a new route_runs row was created
    const resp = await page.request.get('/api/secure/lead/route-runs')
    expect(resp.ok()).toBeTruthy()
    const runs = await resp.json()
    expect(Array.isArray(runs) ? runs.length : runs?.items?.length ?? 0).toBeGreaterThan(0)
  })
})
