# 2026-07-06 — Phase 3: scrub worker OIDs from `audit_log.detail`

**Branch:** `security/canonical-identity-at-rest-hardening` (Phase 3 of the canonical
identity-at-rest hardening effort; first commit on the branch)
**Type:** Security — labor-safety / identity-at-rest
**Scope:** Backend write paths only. No schema, no migration, no grant, no backfill.

## What changed

Worker Azure Entra OIDs were landing verbatim in the `audit_log.detail` JSONB at four
write sites. The OID is already recorded in the sanctioned `actor_oid` column and the
route in `resource_id`; the worker↔route fact is separately held (and being encrypted
in Phases 1–2) in `core.assignment_actor_audit`. Copying the worker OID into `detail`
was redundant plaintext identity, doubling the surface to protect. All four sites now
omit it.

- **`src/modules/routes/routeRunRoutes.ts:679`** (`assignment.create`, route-creation
  path) — `detail: { assigned_user_oid, pool_id }` → `detail: { pool_id }`.
- **`src/modules/routes/routeRunRoutes.ts:1047`** (`assignment.cancel`) —
  `detail: { previous_assigned_user_oid }` → `detail: {}`.
- **`src/modules/routes/routeRunRoutes.ts:1062`** (`assignment.reassign` /
  `assignment.create`) — `detail: { previous_assigned_user_oid, new_assigned_user_oid }`
  → `detail: {}`.
- **`src/middleware/devAuthBypass.ts:93`** (`auth.dev_bypass`) — dropped
  `x-dev-user-oid` (redundant with the row's `actor_oid`) and `x-dev-user-org-id`
  (redundant with `org_id`); retained the non-identity `x-dev-user-roles`.

Each site carries an in-code labor-safety comment so the omission is not "helpfully"
restored by a later edit.

## Treatment decision (founder-ruled)

Drop, not encrypt, at all four sites; skip a backfill of existing rows; include the
dev-bypass site. Rationale: no consumer reads these `detail` fields (verified — the only
`audit_log.detail` references in the codebase are the write sites; the A5 viewer returns
`detail` as an opaque column and never parses OID keys); the accountable actor and the
route are already in dedicated columns; an encrypted copy would render as ciphertext in
the A5 viewer for no gain.

## Backfill: none

The three assignment sites had **0** existing rows carrying a worker OID in `detail` (the
reassign/cancel/create audit paths had never fired in dev). The 269 existing
`auth.dev_bypass` rows carry only dev-synthetic identifiers on a path that is
prod-unreachable (`createDevAuthBypass` returns `null` when `NODE_ENV==='production'`).
No backfill migration was warranted; write-path fix only.

## Proof

- **Grep:** no OID-shaped field (`assigned_user_oid`, `previous_/new_assigned_user_oid`,
  `x-dev-user-oid`, `x-dev-user-org-id`, `captured_by_oid`, `user_oid`) remains in any
  `detail` block across `src/`.
- **Runtime (seeded-then-deleted):** exercised the updated dev-bypass middleware — the
  landed row had `actor_oid = "phase3-proof-devbypass"`, `org_id = 1`,
  `detail = {"x-dev-user-roles":"Specialist"}` (no OID, no org). The
  `assignment.reassign` detail literal the handler now emits (`{}`) was likewise
  confirmed to carry no worker OID. Both seeded rows deleted afterward via the bypassrls
  admin role (the `audit_log` append-only policy blocks app-role DELETE by design);
  0 rows remain.
- **Tests:** full backend suite **156 passed, 0 failed**. `devAuthBypass.test.ts` audit
  assertion flipped from "detail must record the x-dev-user-oid header verbatim" to
  asserting the OID and org are absent from `detail` and only the roles header remains.
- **tsc `--noEmit`:** clean.

## Governance follow-up (docs-truthing — for the founder to file)

`planning/security/ADMIN_ACCESS_POLICY.md` §"Why the Audit Log Cannot Be Misused"
currently sanctions these fields ("the audit record captures who was previously assigned
and who is now assigned"). Dropping them **strengthens** that section's argument — the
audit log now truly cannot reconstruct worker history — but the wording is stale and
should be re-truthed. Not edited here (governance doc, founder-owned); flagged like the
A6 spec correction.

## Files touched

- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/middleware/devAuthBypass.ts`
- `backend/tests/canonical/devAuthBypass.test.ts`
