import { pool, test, assert, assertEqual } from '../setup';
import { withOrgContext } from "../../src/db";
import { createDevAuthBypass, DEV_PERSONAS } from '../../src/middleware/devAuthBypass';
import { requireAnyRole } from '../../src/authz';

// GUARD-DEVBYPASS — the bypass mints identity ONLY from the compile-time
// persona registry. These tests prove:
//   • both env gates still hold (production / literal-'true' opt-in);
//   • the minted identity is the persona VERBATIM — no field is readable
//     from the request;
//   • the old X-Dev-User-* identity headers are DEAD: sending them mints
//     nothing (the containment regression tripwire);
//   • unknown/missing persona falls through to real auth;
//   • every bypass use writes an audit row recording the persona name only.

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

// ── Registry shape (the containment contract) ─────────────────────────────────

test('devAuthBypass: persona registry is frozen, fixed-org, and carries no Admin outside org 1', async () => {
  assert(Object.isFrozen(DEV_PERSONAS), 'DEV_PERSONAS must be frozen');
  for (const [name, p] of Object.entries(DEV_PERSONAS)) {
    assert(p.oid.startsWith('dev-persona-'), `${name}: oid must be a synthetic dev-persona-* value`);
    assert(p.org_id === 1 || p.org_id === 2, `${name}: org must be the dev org (1) or the empty outsider org (2)`);
    if (p.org_id !== 1) {
      assert(!p.roles.includes('Admin'), `${name}: no Admin persona outside org 1`);
    }
  }
});

// ── Middleware behaviour tests ─────────────────────────────────────────────────

test('devAuthBypass: persona header mints the fixed identity verbatim', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null in test env with bypass enabled');

  const req  = mockReq({ 'x-dev-persona': 'admin' });
  const next = nextFn();
  handler(req as any, mockRes() as any, next.fn);

  assert(next.wasCalled(), 'next() must be called');
  assertEqual((req.user as any)?.oid,    'dev-persona-admin', 'req.user.oid is the fixed persona oid');
  assertEqual((req.user as any)?.tid,    '00000000-0000-0000-0000-000000000000', 'req.user.tid (null UUID for dev bypass)');
  assertEqual((req.user as any)?.org_id, 1,                   'req.user.org_id is the persona\'s fixed org');
  assert(Array.isArray(req.roles),                            'req.roles must be an array');
  assertEqual(req.roles?.[0],            'Admin',             'req.roles[0] from the registry');
});

test('devAuthBypass: legacy X-Dev-User-* identity headers are DEAD — they mint nothing', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  // The exact pre-GUARD-DEVBYPASS escalation: arbitrary role + arbitrary org.
  const req  = mockReq({
    'x-dev-user-oid':    'attacker-oid',
    'x-dev-user-roles':  'Admin',
    'x-dev-user-org-id': '999',
  });
  const next = nextFn();
  handler(req as any, mockRes() as any, next.fn);

  assert(next.wasCalled(), 'next() must be called (fall-through to real auth)');
  assertEqual(req.user, undefined, 'legacy identity headers must mint NOTHING');
  assertEqual(req.roles, undefined, 'req.roles must remain unset');
});

test('devAuthBypass: persona identity ignores any accompanying identity headers', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  // Caller sends a persona AND tries to override org/roles via legacy headers.
  const req = mockReq({
    'x-dev-persona':     'specialist',
    'x-dev-user-roles':  'Admin',
    'x-dev-user-org-id': '999',
  });
  handler(req as any, mockRes() as any, () => {});

  assertEqual((req.user as any)?.oid,    'dev-persona-specialist', 'oid from registry');
  assertEqual((req.user as any)?.org_id, 1,                        'org from registry, not header');
  assertEqual(req.roles?.length, 1,                                'exactly the registry roles');
  assertEqual(req.roles?.[0],    'Specialist',                     'role from registry, not header');
});

test('devAuthBypass: unknown persona falls through without setting req.user', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  const req  = mockReq({ 'x-dev-persona': 'superuser' });
  const next = nextFn();
  handler(req as any, mockRes() as any, next.fn);

  assert(next.wasCalled(), 'next() must still be called (fall-through to real auth)');
  assertEqual(req.user, undefined, 'req.user must remain unset for an unknown persona');
  assertEqual(req.roles, undefined, 'req.roles must remain unset');
});

test('devAuthBypass: missing persona header falls through without setting req.user', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  const req  = mockReq({});
  const next = nextFn();
  handler(req as any, mockRes() as any, next.fn);

  assert(next.wasCalled(), 'next() must be called');
  assertEqual(req.user, undefined, 'req.user must remain unset when no persona is named');
});

test('devAuthBypass: downstream requireAnyRole works against persona roles', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  // Admin persona bypasses all role checks.
  const reqAdmin = mockReq({ 'x-dev-persona': 'admin' });
  handler(reqAdmin as any, mockRes() as any, () => {});
  const ulGuard = requireAnyRole(['UL']);
  const nextA = nextFn();
  const resA = mockRes();
  ulGuard(reqAdmin as any, resA as any, nextA.fn);
  assert(nextA.wasCalled(), 'Admin persona must pass any role guard');
  assertEqual(resA.statusCode(), undefined, 'no 403 for Admin persona');

  // Role-rename dual-accept: the specialist persona satisfies ["UL","Specialist"].
  const reqSpec = mockReq({ 'x-dev-persona': 'specialist' });
  handler(reqSpec as any, mockRes() as any, () => {});
  const specGuard = requireAnyRole(['UL', 'Specialist']);
  const nextB = nextFn();
  const resB = mockRes();
  specGuard(reqSpec as any, resB as any, nextB.fn);
  assert(nextB.wasCalled(), 'Specialist persona must satisfy ["UL","Specialist"] guard');
  assertEqual(resB.statusCode(), undefined, 'no 403 for Specialist persona');

  // Dispatch persona satisfies ["Lead","Dispatch","Admin"].
  const reqDisp = mockReq({ 'x-dev-persona': 'dispatch' });
  handler(reqDisp as any, mockRes() as any, () => {});
  const dispGuard = requireAnyRole(['Lead', 'Dispatch', 'Admin']);
  const nextC = nextFn();
  const resC = mockRes();
  dispGuard(reqDisp as any, resC as any, nextC.fn);
  assert(nextC.wasCalled(), 'Dispatch persona must satisfy ["Lead","Dispatch","Admin"] guard');
  assertEqual(resC.statusCode(), undefined, 'no 403 for Dispatch persona');
});

test('devAuthBypass: multi-role persona parsed from registry', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  const req = mockReq({ 'x-dev-persona': 'multi' });
  handler(req as any, mockRes() as any, () => {});

  assertEqual(req.roles?.length, 2, 'two roles from the multi persona');
  assert(req.roles?.includes('UL'),   'roles must include UL');
  assert(req.roles?.includes('Lead'), 'roles must include Lead');
});

// ── Audit log test (requires DB) ──────────────────────────────────────────────

test('devAuthBypass: audit_log entry written for every bypass use, persona name only in detail', async () => {
  const handler = createDevAuthBypass({ NODE_ENV: 'test', DEV_AUTH_BYPASS: 'true' });
  assert(handler !== null, 'handler must not be null');

  // Fixed persona OID — scope the assertion by time instead of a unique OID.
  const startedAt = new Date();
  const req = mockReq({ 'x-dev-persona': 'ul-legacy' });

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
         AND occurred_at >= $2
       ORDER BY occurred_at DESC
       LIMIT 1`,
      ['dev-persona-ul-legacy', startedAt]
    )
  );

  assertEqual(result.rowCount, 1, 'exactly one audit_log row must be written');
  assertEqual(result.rows[0].action, 'auth.dev_bypass', 'action must be auth.dev_bypass');
  // Labor-safety scrub: the OID is recorded in the actor_oid COLUMN (matched
  // above), never copied into detail. detail carries only the persona name —
  // the single request-supplied input.
  assertEqual(
    result.rows[0].detail?.['x-dev-persona'],
    'ul-legacy',
    'detail carries the persona name'
  );
  assertEqual(
    result.rows[0].detail?.['x-dev-user-oid'],
    undefined,
    'detail must NOT carry any OID'
  );
  assertEqual(
    result.rows[0].detail?.['x-dev-user-roles'],
    undefined,
    'the legacy roles-header key must be gone from detail'
  );
});
