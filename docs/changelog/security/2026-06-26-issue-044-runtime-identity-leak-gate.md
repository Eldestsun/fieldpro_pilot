# ISSUE-044 — Runtime identity-leak regression gate (the audit keystone)

**Date:** 2026-06-26
**Type:** Security / labor-safety (worker non-attribution) — runtime regression gate
**Issue:** ISSUE-044 (P1.5-Guarantee-Activation, Blocker). Pairs with ISSUE-043. Source: `docs/audit/2026-06-24-enterprise-saas-readiness-audit.md` Punch 4 / Domain 5
**Branch:** `security/issue-044-runtime-identity-leak-gate` (off `origin/main` @ b0d75e4, which already contains the merged ISSUE-043 endpoint closures)

## Problem

BASELINE's labor-safety guarantee — *worker identity does not exist in the operational
/ intelligence layer* — was, before this, true because we were careful. The only
automated check was a **static, clean-logs-only** source guard
(`cleanLogsIdentity.test.ts`). Nothing exercised real API responses and asserted they
are identity-free. The audit named the missing runtime test its **keystone**: it turns
the guarantee from a promise into a build gate, and every future P2/P3/P4 response
surface inherits the check.

## Change

New suite **`backend/tests/canonical/runtimeIdentityLeak.test.ts`** (wired into the
runner via `tests/run.ts`, so CI's `pnpm test` runs it on every build). It boots the
real Express app in-process (`app.listen(0)`, zero new deps — Node global `fetch`),
authenticates callers via the existing dev-auth bypass, and probes every operational
read surface. It encodes a **policy**, not a happy-path scan:

- **MUST_BE_CLEAN endpoints** (Control Center overview/routes/exceptions/difficulty,
  admin + ops dashboards, pools, stops, route-runs, clean-logs, lead/todays-runs,
  resource pools, tenant config, route-overrides): the authorized-role body must carry
  **no worker identity**, and anonymous callers must be **rejected (401/403)**.
- **SANCTIONED endpoints** (the gated assignment detail `/lead/route-runs/:id`, the
  `/users` picker, the Admin `/admin/audit-log`, the worker self-view `/ul/todays-run`,
  the Admin audited export chain): identity is **permitted for the authorized role**,
  but the **gate is proven** — anonymous AND under-privileged callers are rejected and
  receive no identity (both directions). For `/lead/route-runs/:id` the suite also
  asserts identity **is** present for the authorized role, so the proof isn't vacuous.
- **COVERAGE meta-test**: walks the live Express router and **fails the build if any
  GET route is unclassified** (not in the probe registry and not in the documented
  EXEMPT list). This is what makes the gate catch *future* surfaces — a new P2/P3/P4
  GET endpoint cannot ship un-vetted. The file documents "HOW TO ADD A NEW SURFACE".
  It also fails if the registry references a route that no longer exists (no dead
  entries).
- **SCHEMA test**: every `*_effort_history` / `*_condition_history` table carries **no
  identity column** (`user_id`/`oid`/`*_oid`/`display_name`/…), extending the
  cleanLogsIdentity pattern one layer down so the structural guarantee can't be
  reintroduced in the intelligence schema.

### Detector design (precision so the gate stays trustworthy)

- Any populated `oid` or `*_oid` (assigned_user_oid, created_by_oid, captured_by_oid,
  actor_oid) is a hard leak. `employee_id` / `worker_name` likewise.
- `display_name` / `name` / `role` are flagged **only when they sit in the same object
  as an OID** (a person object like `assigned_user: {oid, display_name, role}`).
  Flagging them globally false-positives on benign labels — asset-type and
  observation-type config rows legitimately carry a `display_name` *label*, pools/stops
  carry names. In this codebase worker identity always travels next to its OID (the
  `loadRouteRunById` CONTROLLED EXCEPTION join is the only identity_directory join), so
  OID co-occurrence is the exact person-vs-label discriminator. (Verified: this is why
  `/admin/tenant/asset-types` and `/observation-types` pass — their `display_name` is a
  label with no sibling OID.)
- Legacy integer `route_runs.user_id` (`LEGACY_TRANSIT_USER_ID = 0`, no FK) is
  value-aware: flagged only if it ever carries a non-sentinel value. The DB confirms it
  is uniformly `0` today; the gate pins it there, so reintroducing integer worker
  identity goes red. (Dropping it from the route-run list responses is its own card.)

## Verification (run as the non-superuser `fieldpro` role — FORCE RLS enforced, same posture as CI's `fieldpro_test`)

- **GREEN:** full suite **147 passed, 0 failed** (≈28 new runtime-leak assertions),
  `tsc --noEmit` exit 0.
- **PROVEN to catch regressions (the keystone deliverable — red then green):**
  - **Demo 1 (identity re-added to a clean response):** injected
    `assigned_user_oid: "regression-demo-leak"` into the `/admin/dashboard` JSON →
    suite went **RED**: `/admin/dashboard: identity leaked to Admin:
    [{"path":"assigned_user_oid",...}]`. Reverted → **GREEN**.
  - **Demo 2 (ISSUE-043-class unauthenticated regression):** stripped
    `requireAuth, requireAnyRole([...])` off the sanctioned `GET /users` → suite went
    **RED**: `/users: anonymous call returned 200, expected 401/403`. Reverted →
    **GREEN**.
  Both demos were reverted; no demo residue remains in source (`grep` clean).
- **Allow-list both directions (sanctioned paths):** the sanctioned tests pass — anon
  and under-privileged are 401/403 (gate present), the authorized role reaches the
  surface, and `/lead/route-runs/:id` returns real identity for Dispatch — confirming
  the allow-list guards a genuinely identity-bearing surface.

## Files touched

- `backend/tests/canonical/runtimeIdentityLeak.test.ts` (new — the gate)
- `backend/tests/run.ts` (register the suite)
- `docs/changelog/security/2026-06-26-issue-044-runtime-identity-leak-gate.md` (this file)

No production code changed (the two demo edits were reverted). CI runs the gate via the
existing `pnpm test` step — no `ci.yml` change needed.
