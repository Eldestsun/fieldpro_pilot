import { test, expect, Page } from '@playwright/test'
import path from 'path'

// ── auth helper ───────────────────────────────────────────────────────────────
// MSAL uses popup auth; we navigate through the Microsoft login form.
// Credentials and test-account UPNs come from environment variables only —
// never hardcode credentials in this file.

async function signInAsUL(page: Page) {
  const email = process.env.E2E_UL_USER_EMAIL
  const password = process.env.E2E_UL_USER_PASSWORD
  if (!email || !password) throw new Error('E2E_UL_USER_EMAIL / E2E_UL_USER_PASSWORD not set')

  await page.goto('/work')

  // App redirects to login; click sign-in button
  await page.getByRole('button', { name: /sign in/i }).click()

  // Handle the MSAL popup
  const popup = await page.waitForEvent('popup')
  await popup.waitForLoadState('domcontentloaded')
  await popup.fill('input[type="email"]', email)
  await popup.getByRole('button', { name: /next/i }).click()
  await popup.fill('input[type="password"]', password)
  await popup.getByRole('button', { name: /sign in/i }).click()

  // "Stay signed in?" prompt — dismiss it
  const staySignedIn = popup.getByRole('button', { name: /no/i })
  if (await staySignedIn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await staySignedIn.click()
  }

  await popup.waitForEvent('close')

  // Wait for the app to load the work page
  await page.waitForURL('**/work', { timeout: 15_000 })
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('UL stop completion flow', () => {
  test('UL worker can complete a stop end to end', async ({ page }) => {
    await signInAsUL(page)

    // 3. Verify today's route loads with at least one stop
    await expect(page.locator('li[class*="cursor-pointer"]').first()).toBeVisible({ timeout: 10_000 })

    // 4. Click the first stop
    await page.locator('li[class*="cursor-pointer"]').first().click()

    // 5. Tap "Start Stop"
    await page.getByRole('button', { name: /Start Stop/i }).click()
    await expect(page.getByText('Cleaning Tasks')).toBeVisible()

    // 6. Complete checklist — use Spot Check mode (simplest happy path)
    await page.getByRole('button', { name: /PERFORM SPOT CHECK/i }).click()
    await expect(page.getByText(/SPOT CHECK ENABLED/i)).toBeVisible()

    // 7. No safety concerns — skip the safety report step (default: no concern)

    // 8. Take the after photo (upload a test PNG from the e2e fixtures dir)
    const afterPhotoInput = page.locator('#after-photo-upload')
    await afterPhotoInput.setInputFiles(
      path.join(__dirname, 'fixtures', 'test-photo.jpg')
    )

    // 9. Upload the queued file
    await page.getByRole('button', { name: /Upload Now/i }).click()

    // 10. Submit — Finish button becomes enabled
    await expect(page.getByRole('button', { name: /^Finish$/i })).toBeEnabled({ timeout: 8_000 })
    await page.getByRole('button', { name: /^Finish$/i }).click()

    // 11. Verify stop shows as "Done" in the list
    await page.getByRole('button', { name: /← Back/i }).click()
    await expect(page.getByText('Done').first()).toBeVisible({ timeout: 8_000 })

    // 12. Verify backend state via API
    const resp = await page.request.get('/api/secure/route-runs/today')
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    const completedStop = (body?.stops ?? []).find(
      (s: { status: string }) => s.status === 'done'
    )
    expect(completedStop).toBeDefined()
  })

  test('UL worker can skip a stop with hazard', async ({ page }) => {
    await signInAsUL(page)

    // Click the first pending stop
    await page.locator('li[class*="cursor-pointer"]').first().click()
    await page.getByRole('button', { name: /Start Stop/i }).click()

    // Open Safety report
    await page.getByRole('button', { name: /REPORT SAFETY/i }).click()
    await expect(page.getByText('Report Safety Concern')).toBeVisible()

    // Select a hazard
    await page.getByText('Encampment').click()

    // Upload a safety photo (required to skip)
    const safetyPhotoInput = page.locator('#safety-photo-upload-modal')
    await safetyPhotoInput.setInputFiles(
      path.join(__dirname, 'fixtures', 'test-photo.jpg')
    )
    await expect(page.getByText(/Photo Attached/i)).toBeVisible({ timeout: 5_000 })

    // Skip Stop
    await page.getByRole('button', { name: /Skip Stop/i }).first().click()
    // Confirm in the dialog
    await page.getByRole('button', { name: /Skip Stop/i }).last().click()

    // Verify stop shows as "Skipped"
    await page.getByRole('button', { name: /← Back/i }).click()
    await expect(page.getByText('Skipped').first()).toBeVisible({ timeout: 8_000 })

    // Verify backend state
    const resp = await page.request.get('/api/secure/route-runs/today')
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    const skippedStop = (body?.stops ?? []).find(
      (s: { status: string }) => s.status === 'skipped'
    )
    expect(skippedStop).toBeDefined()
  })
})
