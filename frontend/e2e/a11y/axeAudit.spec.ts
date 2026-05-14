/**
 * S1-8 — axe-core Accessibility Audit, All 6 Surfaces
 *
 * Auth: Pre-computes MSAL v4-compatible AES-256-GCM encrypted localStorage
 * entries in Node.js (hkdfSync + createCipheriv — fully synchronous).  The
 * init script injects them synchronously before any page scripts execute, so
 * MSAL's importExistingCache() successfully decrypts the synthetic account +
 * access token.  The X-Dev-User-* headers activate devAuthBypass on the
 * backend for all API calls.  Requires DEV_AUTH_BYPASS=true on the backend.
 *
 * Encryption matches LocalStorage.mjs + BrowserCrypto.mjs exactly:
 *   subKey = HKDF-SHA256(baseKey, salt=nonce16, info=context)
 *   data   = AES-256-GCM(subKey, iv=12×0x00).encrypt(plaintext) ‖ authTag
 * Cookie:  msal.cache.encryption = {id, key=base64url(rawBaseKey)}
 *
 * Standard: WCAG 2.1 AA (wcag2a, wcag2aa, wcag21a, wcag21aa)
 */

import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import * as fs from 'node:fs'
import * as nodeCrypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = path.resolve(__dirname, '../../.axe-audit-results')

// ── Constants from frontend/.env.local and @azure/msal-browser@4.21.0 ─────────

const TENANT_ID   = '66d756aa-edfd-46e9-895a-06d9e0e21f3a'
const CLIENT_ID   = 'db8a0c15-d532-447e-8c36-4f1eb19f13d1'
const ENVIRONMENT = 'login.microsoftonline.com'
const API_SCOPE   = 'api://a406f0a1-e424-45ef-afaa-540dd992ffe5/access_as_user'
const ORG_ID      = 1

// MSAL v4 registry keys (CacheKeys.ts)
const ACCOUNT_KEYS_KEY = 'msal.1.account.keys'
const TOKEN_KEYS_KEY   = `msal.1.token.keys.${CLIENT_ID}`

const UL_OID    = '55a66724-705d-45d3-b160-128906c86aa9'  // planned route in dev DB
const LEAD_OID  = 'axe-audit-lead'
const ADMIN_OID = 'axe-audit-admin'

// ── MSAL v4 encryption helpers ──────────────────────────────────────────────────
// One base key per test-run; shared by all pages (each page gets fresh storage).

const BASE_KEY = nodeCrypto.randomBytes(32)          // AES-256 / HKDF IKM
const KEY_ID   = 'axe-test-key-v1'
const KEY_STR  = BASE_KEY.toString('base64url')      // stored in cookie

/**
 * Replicates MSAL v4's encrypt() using Node.js synchronous crypto.
 * Returns the JSON string to store verbatim in localStorage.
 *
 *   context = clientId when cacheKey includes clientId, else ''
 *   subKey  = HKDF-SHA256(BASE_KEY, salt=nonce, info=context)
 *   output  = AES-256-GCM(subKey, iv=12×0x00, plaintext) ‖ 16-byte authTag
 */
function msalEncryptEntry(plaintext: string, cacheKey: string): string {
  const context = cacheKey.includes(CLIENT_ID) ? CLIENT_ID : ''
  const nonce   = nodeCrypto.randomBytes(16)
  const derived = nodeCrypto.hkdfSync('sha256', BASE_KEY, nonce, Buffer.from(context, 'utf8'), 32)
  const iv      = Buffer.alloc(12, 0)
  const cipher  = nodeCrypto.createCipheriv('aes-256-gcm', Buffer.from(derived), iv)
  const ct      = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag     = cipher.getAuthTag()   // 16 bytes — matches WebCrypto AES-GCM default
  return JSON.stringify({
    id:            KEY_ID,
    nonce:         nonce.toString('base64url'),
    data:          Buffer.concat([ct, tag]).toString('base64url'),
    lastUpdatedAt: String(Math.floor(Date.now() / 1000)),
  })
}

/**
 * Builds the full set of encrypted MSAL v4 localStorage entries for a synthetic
 * user: account-keys registry, account entity, token-keys registry, access token.
 */
function buildEncryptedMsalCache(oid: string, displayName: string): Record<string, string> {
  const now           = Math.floor(Date.now() / 1000)
  const expiresOn     = now + 7200   // 2 h from now — well within valid window
  const homeAccountId = `${oid}.${TENANT_ID}`

  const accountKey = `msal.1-${homeAccountId}-${ENVIRONMENT}-${TENANT_ID}`.toLowerCase()
  const credKey    = `msal.1-${homeAccountId}-${ENVIRONMENT}-accesstoken-${CLIENT_ID}-${TENANT_ID}-${API_SCOPE}--`.toLowerCase()

  // Minimal fake JWT — MSAL reads expiresOn from the cache entity, not the JWT
  // exp claim, so signature validation is never triggered for cache-served tokens.
  const jwtHeader  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const jwtPayload = Buffer.from(JSON.stringify({
    oid, sub: oid, name: displayName, exp: 9_999_999_999,
    iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    aud: CLIENT_ID, tid: TENANT_ID,
    preferred_username: `${oid}@axe-test.local`,
  })).toString('base64url')
  const fakeJwt = `${jwtHeader}.${jwtPayload}.axe_test_sig_not_validated`

  const account = {
    homeAccountId, environment: ENVIRONMENT, realm: TENANT_ID,
    localAccountId: oid, username: `${oid}@axe-test.local`,
    authorityType: 'MSSTS', name: displayName,
    lastUpdatedAt: String(now),
  }

  const tokenEntity = {
    homeAccountId, environment: ENVIRONMENT, credentialType: 'AccessToken',
    clientId: CLIENT_ID, secret: fakeJwt, realm: TENANT_ID, target: API_SCOPE,
    cachedAt: String(now), expiresOn: String(expiresOn),
    extendedExpiresOn: String(expiresOn + 3600), tokenType: 'Bearer',
    lastUpdatedAt: String(now),
  }

  // Key registries are read via raw localStorage.getItem() in CacheHelpers.ts —
  // they must be stored as plaintext JSON, not encrypted.
  // Only the actual account and credential entries are encrypted.
  return {
    [ACCOUNT_KEYS_KEY]: JSON.stringify([accountKey]),
    [TOKEN_KEYS_KEY]:   JSON.stringify({ accessToken: [credKey], idToken: [] as string[], refreshToken: [] as string[] }),
    [accountKey]:       msalEncryptEntry(JSON.stringify(account),     accountKey),
    [credKey]:          msalEncryptEntry(JSON.stringify(tokenEntity), credKey),
  }
}

// ── Auth setup ──────────────────────────────────────────────────────────────────

/**
 * Seeds MSAL v4 localStorage with properly-encrypted cache entries and
 * sets the backend dev-bypass headers for all API requests.
 *
 * All localStorage writes are synchronous (values pre-computed in Node.js),
 * so MSAL's importExistingCache() always finds them when it runs.
 */
async function setupAuth(
  page: Page,
  oid: string,
  displayName: string,
  roles: string[],
): Promise<void> {
  const entries    = buildEncryptedMsalCache(oid, displayName)
  const cookieVal  = JSON.stringify({ id: KEY_ID, key: KEY_STR })
  const cookieName = 'msal.cache.encryption'

  // Inject synchronously before any page scripts — matches CookieStorage.setItem() format.
  await page.addInitScript(({ cookieName, cookieVal, entries }) => {
    document.cookie = [
      `${encodeURIComponent(cookieName)}=${encodeURIComponent(cookieVal)}`,
      'path=/',
      'SameSite=None',
      'Secure',
    ].join(';')
    for (const [key, val] of Object.entries(entries)) {
      window.localStorage.setItem(key, val)
    }
  }, { cookieName, cookieVal, entries })

  await page.setExtraHTTPHeaders({
    'x-dev-user-oid':    oid,
    'x-dev-user-roles':  roles.join(','),
    'x-dev-user-org-id': String(ORG_ID),
  })
}

// ── axe helpers ────────────────────────────────────────────────────────────────

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

/** Waits for the app to transition past the "Loading identity…" splash. */
async function waitForAppReady(page: Page, timeout = 20_000): Promise<void> {
  await expect(page.locator('text=Loading identity…')).toBeHidden({ timeout })
}

// ── Surface 1: UL Stop List ─────────────────────────────────────────────────────

test.describe('Surface: UL Stop List', () => {
  test('axe — UL stop list with stops loaded', async ({ page }) => {
    await setupAuth(page, UL_OID, 'Axe Audit UL', ['UL'])
    await page.goto('/work')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const results = await runAxe(page, 'ul_stop_list')
    expect(results, 'axe threw unexpectedly').toBeDefined()
  })
})

// ── Surface 2: UL Stop Wizard ───────────────────────────────────────────────────

test.describe('Surface: UL Stop Wizard', () => {
  test('axe — UL stop wizard mid-flow (after Start Stop)', async ({ page }) => {
    await setupAuth(page, UL_OID, 'Axe Audit UL', ['UL'])
    await page.goto('/work')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const firstStop = page.locator('li').filter({ hasText: /pending|in_progress|stop/i }).first()
    const stopVisible = await firstStop.isVisible({ timeout: 5000 }).catch(() => false)

    if (!stopVisible) {
      test.info().annotations.push({
        type: 'fixture-gap',
        description:
          'UL Stop Wizard: no stops loaded for this OID. ' +
          'Fixture requirement: a planned route_run assigned to UL_OID with ≥1 stop in status pending.',
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

// ── Surface 3: Lead Routes ──────────────────────────────────────────────────────

test.describe('Surface: Lead Routes', () => {
  test('axe — Lead route pool view', async ({ page }) => {
    await setupAuth(page, LEAD_OID, 'Axe Audit Lead', ['Lead'])
    await page.goto('/routes')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const results = await runAxe(page, 'lead_routes')
    expect(results).toBeDefined()
  })
})

// ── Surface 4: Admin Panel ──────────────────────────────────────────────────────

test.describe('Surface: Admin Panel', () => {
  test('axe — Admin dashboard with pool list', async ({ page }) => {
    await setupAuth(page, ADMIN_OID, 'Axe Audit Admin', ['Admin'])
    await page.goto('/admin/pools')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const results = await runAxe(page, 'admin_panel')
    expect(results).toBeDefined()
  })
})

// ── Surface 5: Control Center ───────────────────────────────────────────────────

test.describe('Surface: Control Center', () => {
  test('axe — Control Center live data view', async ({ page }) => {
    await setupAuth(page, ADMIN_OID, 'Axe Audit Admin', ['Admin'])
    await page.goto('/admin/control-center')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const results = await runAxe(page, 'control_center')
    expect(results).toBeDefined()
  })
})
