# 2026-07-06 — Phase 1 (ISSUE-058): encrypt the four sidecar write paths, sentinel `actor_ref`

**Branch:** `security/canonical-identity-at-rest-hardening` (Phase 1 of the canonical
identity-at-rest hardening effort)
**Type:** Security — labor-safety / identity-at-rest
**Scope:** Backend write paths + their tests. **No schema, no migration, no backfill.**

## What changed

The forensic verdict (CASE 1) found the raw worker OID stored in plaintext in `actor_ref`
across all four `core.*_actor_audit` sidecars — byte-identical to the JWT claim, and only
`visit_actor_audit` even carried a ciphertext copy alongside. Phase 1 makes the ciphertext
the **only** copy of the OID at every sidecar write: `actor_ref` now holds a fixed
non-identifying sentinel `'encrypted'`, and the real OID lives only in
`actor_ref_ciphertext` (with `actor_ref_key_id`).

Per the founder ruling this is **Option 3 (hybrid)**: encrypt the sidecars now, defer the
`identity_directory` keying decision. `authz.ts` (which writes `identity_directory`) is
frozen and untouched.

### The five INSERT sites (four tables)

- `src/domains/visit/visitService.ts:172` — already wrote ciphertext (the S1-13 reference
  impl); flipped the `actor_ref` bind `params.actorOid` → `'encrypted'`.
- `src/domains/observation/observationService.ts:381` (main insert) and `:444` (spot-check
  path) — added `encrypt()`, extended the column list, bound sentinel + ciphertext + keyId.
- `src/domains/routeRunStop/stopPhotosService.ts:95` (evidence) — same; `encrypt()` hoisted
  once above the per-photo loop (one actor per batch).
- `src/domains/routeRun/routeRunService.ts:459` (assignment) — same; one `encrypt()` for the
  batch, sentinel applied to every `UNNEST`ed row.

Each site carries an in-code ISSUE-058 labor-safety comment: `actor_ref` holds a
non-identifying sentinel; the OID lives only in `actor_ref_ciphertext`; never write an
identifying value here.

### Reason-label discipline

`encrypt(plaintext, reason)` currently does `void reason` — the label is reserved for the
future decrypt audit trail. Each site passes a distinct, semantically meaningful label so
that trail is legible the moment the decrypt path goes live: `visit_create` (existing),
`observation_create`, `observation_spotcheck`, `evidence_capture`, `assignment_create`.

## Interim state (deliberate, ruled acceptable)

The two `actor_ref` readers — `exportDeleteRoutes.ts` (A6 bundle) and `sftpExport.ts` — are
**not** changed here. They keep reading `actor_ref`, which for **new** rows is now the
sentinel `'encrypted'`, so those exports emit the sentinel instead of the OID until they are
switched to the audited `decrypt()` path (tracked separately). An export emitting a sentinel
is strictly safer than one emitting a plaintext OID. `decrypt()` had zero runtime callers
before this phase; it becomes live-needed the moment a reader is switched.

## No migration / no backfill — existing rows unchanged

This phase is **write-path only**. The cipher columns already existed on all four sidecars
(the 2026-05-30 additive migration), so there is **no `ALTER TABLE`**. Existing rows keep
their plaintext `actor_ref` until **Phase 2**, which performs the encrypt-then-null backfill
and **waits on KMS (Azure Key Vault) proof** before running — the dev static-key adapter is
not a production key custodian. Until Phase 2, the sidecars are a mix: new rows sentinel-only,
old rows plaintext.

## Proof

- **Grep:** no `INSERT INTO core.*_actor_audit` binds a raw OID variable to `actor_ref`;
  all five bind the literal `'encrypted'`. Each `encrypt()` call receives the raw OID.
- **Runtime (seeded-then-deleted, real write paths):** drove all five production writers;
  every sidecar row showed `actor_ref = 'encrypted'`, `actor_ref_ciphertext` populated
  (`key_id = dev-static-v1`), and `decrypt(actor_ref_ciphertext) === '<input oid>'` —
  MATCH=true at all five. All seeded rows deleted; residual 0. (The decrypt audit trail
  fail-closed on the proof's synthetic tenant and — by design — did not suppress the
  plaintext, so the proof left no `admin.oid_decrypt` residue.)
- **Tests:** full backend suite **158 passed, 0 failed** (was 156; +2 new observation-sidecar
  tests). Three existing tests updated to the new contract: `oidCipher.test.ts` and
  `evidence.test.ts` (real writers — flipped `actor_ref` OID→sentinel, added a decrypt
  round-trip); `assignments.test.ts` (its local production-mirror `planAssignments` copy
  updated to the new SQL + assertion flipped, keeping it a faithful reproduction).
- **tsc `--noEmit`:** clean.

## Files touched

- `backend/src/domains/visit/visitService.ts`
- `backend/src/domains/observation/observationService.ts`
- `backend/src/domains/routeRunStop/stopPhotosService.ts`
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/tests/canonical/oidCipher.test.ts`
- `backend/tests/canonical/evidence.test.ts`
- `backend/tests/canonical/assignments.test.ts`
- `backend/tests/canonical/observations.test.ts`
