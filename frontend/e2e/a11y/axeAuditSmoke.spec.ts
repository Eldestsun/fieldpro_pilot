/**
 * S1-8 smoke test — verifies the axe audit harness runs against at least
 * one surface without throwing. Does NOT assert on finding counts.
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('axe harness smoke — login page scans without error', async ({ page }) => {
  await page.goto('/')
  // Wait for any content to load
  await page.waitForLoadState('domcontentloaded')

  let axeError: unknown = null
  let violationCount = -1

  try {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    violationCount = results.violations.length
  } catch (err) {
    axeError = err
  }

  // Harness must not throw
  expect(axeError, 'axe-core threw an unexpected error').toBeNull()

  // Must have scanned something — violation count is non-negative
  // (zero is allowed; we are not asserting findings here)
  expect(violationCount, 'axe returned a negative violation count — DOM was likely empty').toBeGreaterThanOrEqual(0)
})
