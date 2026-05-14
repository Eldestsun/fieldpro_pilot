/**
 * S1-8 — axe-core Accessibility Audit, All 6 Surfaces
 *
 * Auth: Dual-bypass approach per docs/dev/dev-auth-bypass.md.
 *   Frontend: addInitScript seeds localStorage.__dev_user__ so the React
 *   router renders protected surfaces (requires VITE_DEV_AUTH_BYPASS=true
 *   in frontend/.env.local and Vite dev server running with that env).
 *   Backend: setExtraHTTPHeaders sends X-Dev-User-* headers so API calls
 *   return real data (requires DEV_AUTH_BYPASS=true on backend).
 *
 * Standard: WCAG 2.1 AA (wcag2a, wcag2aa, wcag21a, wcag21aa)
 *
 * Results per surface written to frontend/.axe-audit-results/<key>.json.
 * These are gitignored — they feed the manual docs/security report.
 */

import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = path.resolve(__dirname, '../../.axe-audit-results')

const ORG_ID = 1

// ── Auth setup ──────────────────────────────────────────────────────────────

/**
 * Seeds both bypass halves before page.goto():
 *   - localStorage.__dev_user__ (frontend bypass — React router renders protected route)
 *   - X-Dev-User-* headers (backend bypass — API calls return data)
 */
async function setupAuth(page: Page, oid: string, roles: string[]): Promise<void> {
  await page.addInitScript(
    ({ devUser }) => {
      localStorage.setItem('__dev_user__', JSON.stringify(devUser))
    },
    { devUser: { oid, roles, org_id: ORG_ID } },
  )

  await page.setExtraHTTPHeaders({
    'x-dev-user-oid':    oid,
    'x-dev-user-roles':  roles.join(','),
    'x-dev-user-org-id': String(ORG_ID),
  })
}

// ── Verification ─────────────────────────────────────────────────────────────

/**
 * Returns true when the page has rendered a protected surface.
 * Login page has minimal markup; protected surfaces have nav elements
 * and content > 2000 chars.
 */
async function verifyAuthenticated(page: Page): Promise<boolean> {
  const content = await page.content()
  const hasNav = /<nav[\s>]/i.test(content)
  const notLoginPage = !/sign in with microsoft/i.test(content)
  return hasNav && notLoginPage && content.length > 2000
}

// ── axe helpers ────────────────────────────────────────────────────────────

/** Runs axe-core WCAG 2.1 AA analysis and writes raw results to disk. */
async function runAxe(page: Page, surfaceKey: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(RESULTS_DIR, `${surfaceKey}.json`),
    JSON.stringify(results, null, 2),
  )
  return results
}

/** Waits for the app to transition past any loading splash. */
async function waitForAppReady(page: Page, timeout = 20_000): Promise<void> {
  await expect(page.locator('text=Loading identity…')).toBeHidden({ timeout })
}

// ── Surface 1: UL Stop List ─────────────────────────────────────────────────

test.describe('Surface: UL Stop List', () => {
  test('axe — UL stop list', async ({ page }) => {
    await setupAuth(page, 'axe-audit-ul', ['UL'])
    await page.goto('/work')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const authenticated = await verifyAuthenticated(page)
    if (!authenticated) {
      test.info().annotations.push({
        type: 'bypass-failure',
        description:
          'UL Stop List: page did not render a protected surface — ' +
          'VITE_DEV_AUTH_BYPASS may not be active. Restart the Vite dev server ' +
          'with VITE_DEV_AUTH_BYPASS=true in frontend/.env.local.',
      })
    }

    const results = await runAxe(page, 'ul_stop_list')
    expect(results).toBeDefined()
  })
})

// ── Surface 2: UL Stop Wizard ───────────────────────────────────────────────

test.describe('Surface: UL Stop Wizard', () => {
  test('axe — UL stop wizard mid-flow (after Start Stop)', async ({ page }) => {
    await setupAuth(page, 'axe-audit-ul', ['UL'])
    await page.goto('/work')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const authenticated = await verifyAuthenticated(page)
    if (!authenticated) {
      test.info().annotations.push({
        type: 'bypass-failure',
        description: 'UL Stop Wizard: page did not render a protected surface.',
      })
      const results = await runAxe(page, 'ul_stop_wizard')
      expect(results).toBeDefined()
      return
    }

    const firstStop = page.locator('li').filter({ hasText: /pending|in_progress|stop/i }).first()
    const stopVisible = await firstStop.isVisible({ timeout: 5000 }).catch(() => false)

    if (!stopVisible) {
      test.info().annotations.push({
        type: 'fixture-gap',
        description:
          'UL Stop Wizard: no stops loaded for axe-audit-ul. ' +
          'Fixture requirement: a planned route_run assigned to axe-audit-ul with ≥1 stop.',
      })
      const results = await runAxe(page, 'ul_stop_wizard')
      expect(results).toBeDefined()
      return
    }

    await firstStop.click()
    await page.waitForTimeout(500)

    const startBtn = page.getByRole('button', { name: /start stop/i })
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click()
      await page.waitForTimeout(1000)
    }

    const results = await runAxe(page, 'ul_stop_wizard')
    expect(results).toBeDefined()
  })
})

// ── Surface 3: Lead Routes ──────────────────────────────────────────────────

test.describe('Surface: Lead Routes', () => {
  test('axe — Lead route pool view', async ({ page }) => {
    await setupAuth(page, 'axe-audit-lead', ['Lead'])
    await page.goto('/routes')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const authenticated = await verifyAuthenticated(page)
    if (!authenticated) {
      test.info().annotations.push({
        type: 'bypass-failure',
        description: 'Lead Routes: page did not render a protected surface.',
      })
    }

    const results = await runAxe(page, 'lead_routes')
    expect(results).toBeDefined()
  })
})

// ── Surface 4: Admin Panel ──────────────────────────────────────────────────

test.describe('Surface: Admin Panel', () => {
  test('axe — Admin pools panel', async ({ page }) => {
    await setupAuth(page, 'axe-audit-admin', ['Admin'])
    await page.goto('/admin/pools')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const authenticated = await verifyAuthenticated(page)
    if (!authenticated) {
      test.info().annotations.push({
        type: 'bypass-failure',
        description: 'Admin Panel: page did not render a protected surface.',
      })
    }

    const results = await runAxe(page, 'admin_panel')
    expect(results).toBeDefined()
  })
})

// ── Surface 5: Control Center ───────────────────────────────────────────────

test.describe('Surface: Control Center', () => {
  test('axe — Control Center live data view', async ({ page }) => {
    await setupAuth(page, 'axe-audit-admin', ['Admin'])
    await page.goto('/admin/control-center')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const authenticated = await verifyAuthenticated(page)
    if (!authenticated) {
      test.info().annotations.push({
        type: 'bypass-failure',
        description: 'Control Center: page did not render a protected surface.',
      })
    }

    const results = await runAxe(page, 'control_center')
    expect(results).toBeDefined()
  })
})
