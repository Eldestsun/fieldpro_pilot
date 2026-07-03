import { pool, test, assert, assertEqual } from '../setup';
import { withOrgContext } from "../../src/db";
import { createDevAuthBypass } from '../../src/middleware/devAuthBypass';
import { requireAnyRole } from '../../src/authz';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Minimal Express req mock — headers are already lower-cased by Node HTTP. */
function mockReq(headers: Record<string, string> = {}) {
  return {
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    ),
    ip: '127.0.0.1',
    user: undefined as any,
    roles: undefined as string[] | undefined,
  };
}

/** Minimal Express res mock — records status code if used. */
function mockRes() {
  let code: number | undefined;
  return {
    statusCode: () => code,
    status: (c: number) => {
      code = c;
      return { json: (_: unknown) => {} };
    },
  };
}

/** Returns a next() callback and a flag to check whether it was called. */
function nextFn() {
  let called = false;
  const fn = () => { called = true; };
  return { fn, wasCalled: () => called };
}

// ── Gate tests (no DB) ────────────────────────────────────────────────────────

test('devAuthBypass: returns null when NODE_ENV=production', async () => {
  const result = createDevAuthBypass({ NODE_ENV: 'production', DEV_AUTH_BYPASS: 'true' });
  assertEqual(result, null, 'must return null in production regardless of DEV_AUTH_BYPASS');
});

test('devAuthBypass: returns null when DEV_AUTH_BYPASS is unset', async () => {
  const result = createDevAuthBypass({ NODE_ENV: 'development', DEV_AUTH_BYPASS: undefined });
  assertEqual(result, null, 'must return null when DEV_AUTH_BYPASS is not set');
});

test('devAuthBypass: returns null when DEV_AUTH_BYPASS="1"', async () => {
  const result = createDevAuthBypass({ NODE_ENV: 'development', DEV_AUTH_BYPASS: '1' });
  assertEqual(result, null, 'must require the literal string "true" — "1" must not activate');
});

test('devAuthBypass: returns null when DEV_AUTH_BYPASS="TRUE" (case sensitive)', async () => {
  const result = createDevAuthBypass({ NODE_ENV: 'development', DEV_AUTH_BYPASS: 'TRUE' });
  assertEqual(result, null, 'DEV_AUTH_BYPASS check is case-sensitive — "TRUE" must not activate');
});

// ── Middleware behaviour tests ─────────────────────────────────────────────────

test('devAuthBypass: with valid headers populates req.user and req.roles', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null in test env with bypass enabled');

  const req  = mockReq({
    'x-dev-user-oid':    'synthetic-oid-001',
    'x-dev-user-roles':  'Admin',
    'x-dev-user-org-id': '42',
  });
  const next = nextFn();
  handler(req as any, mockRes() as any, next.fn);

  assert(next.wasCalled(), 'next() must be called');
  assertEqual((req.user as any)?.oid,    'synthetic-oid-001', 'req.user.oid');
  assertEqual((req.user as any)?.tid,    '00000000-0000-0000-0000-000000000000', 'req.user.tid (null UUID for dev bypass)');
  assertEqual((req.user as any)?.org_id, 42,                   'req.user.org_id parsed as int');
  assert(Array.isArray(req.roles),                             'req.roles must be an array');
  assertEqual(req.roles?.[0],            'Admin',              'req.roles[0]');
});

test('devAuthBypass: with valid headers, downstream requireAnyRole([Admin]) passes', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  const req = mockReq({
    'x-dev-user-oid':    'synthetic-oid-role-check',
    'x-dev-user-roles':  'Admin',
    'x-dev-user-org-id': '1',
  });

  // Populate req via bypass
  const bypassNext = nextFn();
  handler(req as any, mockRes() as any, bypassNext.fn);
  assert(bypassNext.wasCalled(), 'bypass next() must be called');

  // requireAnyRole must now pass
  const roleMiddleware = requireAnyRole(['UL']); // Admin bypasses all role checks
  const roleNext       = nextFn();
  const res            = mockRes();
  roleMiddleware(req as any, res as any, roleNext.fn);

  assert(roleNext.wasCalled(), 'requireAnyRole must call next() when Admin role present');
  assertEqual(res.statusCode(), undefined, 'no 403 must be emitted');
});

test('devAuthBypass: with valid headers, multi-role header parsed correctly', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  const req  = mockReq({
    'x-dev-user-oid':    'synthetic-oid-multi',
    'x-dev-user-roles':  'UL,Lead',
    'x-dev-user-org-id': '7',
  });
  handler(req as any, mockRes() as any, () => {});

  assertEqual(req.roles?.length, 2, 'two roles must be parsed');
  assert(req.roles?.includes('UL'),   'roles must include UL');
  assert(req.roles?.includes('Lead'), 'roles must include Lead');
});

// Role rename Phase 1 — dual-accept verification.
// A token claim carrying the *new* role string ('Specialist' / 'Dispatch')
// must be accepted by a guard whose required-list still contains both old
// and new strings.  This locks in the dual-accept window and will be
// tightened in Phase 3 (single new-string only).
test('devAuthBypass: requireAnyRole accepts new role strings (Specialist, Dispatch)', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  // 1. Specialist must satisfy a guard configured for ["UL", "Specialist"]
  const reqA = mockReq({
    'x-dev-user-oid':    'rename-specialist',
    'x-dev-user-roles':  'Specialist',
    'x-dev-user-org-id': '1',
  });
  handler(reqA as any, mockRes() as any, () => {});
  const specialistGuard = requireAnyRole(['UL', 'Specialist']);
  const nextA = nextFn();
  const resA  = mockRes();
  specialistGuard(reqA as any, resA as any, nextA.fn);
  assert(nextA.wasCalled(),               'Specialist must satisfy ["UL","Specialist"] guard');
  assertEqual(resA.statusCode(), undefined, 'no 403 must be emitted for Specialist');

  // 2. Dispatch must satisfy a guard configured for ["Lead", "Dispatch", "Admin"]
  const reqB = mockReq({
    'x-dev-user-oid':    'rename-dispatch',
    'x-dev-user-roles':  'Dispatch',
    'x-dev-user-org-id': '1',
  });
  handler(reqB as any, mockRes() as any, () => {});
  const dispatchGuard = requireAnyRole(['Lead', 'Dispatch', 'Admin']);
  const nextB = nextFn();
  const resB  = mockRes();
  dispatchGuard(reqB as any, resB as any, nextB.fn);
  assert(nextB.wasCalled(),               'Dispatch must satisfy ["Lead","Dispatch","Admin"] guard');
  assertEqual(resB.statusCode(), undefined, 'no 403 must be emitted for Dispatch');
});

test('devAuthBypass: missing X-Dev-User-Oid passes through without setting req.user', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  const req  = mockReq({
    // OID header deliberately absent
    'x-dev-user-roles':  'Admin',
    'x-dev-user-org-id': '1',
  });
  const next = nextFn();
  handler(req as any, mockRes() as any, next.fn);

  assert(next.wasCalled(), 'next() must still be called (fall-through to real auth)');
  assertEqual(req.user, undefined, 'req.user must remain unset when a header is missing');
  assertEqual(req.roles, undefined, 'req.roles must remain unset when a header is missing');
});

test('devAuthBypass: missing X-Dev-User-Roles passes through without setting req.user', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  const req  = mockReq({
    'x-dev-user-oid':    'synthetic-oid-partial',
    // Roles header absent
    'x-dev-user-org-id': '1',
  });
  const next = nextFn();
  handler(req as any, mockRes() as any, next.fn);

  assert(next.wasCalled(), 'next() must be called');
  assertEqual(req.user, undefined, 'req.user must remain unset');
});

// ── Audit log test (requires DB) ──────────────────────────────────────────────

test('devAuthBypass: audit_log entry written for every bypass use', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  // Use a unique OID so this test row is unambiguous
  const uniqueOid = `dev-bypass-audit-${Date.now()}`;
  const req       = mockReq({
    'x-dev-user-oid':    uniqueOid,
    'x-dev-user-roles':  'UL',
    'x-dev-user-org-id': '1',
  });

  const next = nextFn();
  handler(req as any, mockRes() as any, next.fn);
  assert(next.wasCalled(), 'next() must be called before audit write');

  // Fire-and-forget audit write — give it 300 ms to land on the local DB
  await sleep(300);

  // ISSUE-057 (bucket B): audit_log is fail-closed — read with org context.
  const result = await withOrgContext(1, (c) =>
    c.query(
      `SELECT action, detail
       FROM audit_log
       WHERE actor_oid = $1 AND action = 'auth.dev_bypass'
       ORDER BY occurred_at DESC
       LIMIT 1`,
      [uniqueOid]
    )
  );

  assertEqual(result.rowCount, 1, 'exactly one audit_log row must be written');
  assertEqual(result.rows[0].action, 'auth.dev_bypass', 'action must be auth.dev_bypass');
  assertEqual(
    result.rows[0].detail?.['x-dev-user-oid'],
    uniqueOid,
    'detail must record the x-dev-user-oid header verbatim'
  );
});
