# 2026-06-01 — Sidecar extraction: worker non-attribution made structural (§9 item 6)

Closes, at the DB level, §9 item 6 of `CANONICAL_STATE_LAYER_DESIGN.md` — the
deferred sidecar-extraction migration. Worker identity (canonical state layer
invariant #1) is now enforced by where columns live + DB role grants, not by
developer query discipline. Branch `feat/sidecar-extraction`; applied + verified
on the dev DB. Not pushed.

## What changed

### Schema (4 canonical tables → 4 no-grant identity sidecars)
- New migration `backend/migrations/20260530_sidecar_extraction_a_additive.sql`
  (additive, reversible): creates `core.{visit,observation,evidence,assignment}_actor_audit`
  on one documented template (`<entity>_id` PK FK `ON DELETE CASCADE`, `org_id`
  RLS-forced + guarded `org_isolation`, `actor_ref text NOT NULL`, optional
  `actor_ref_ciphertext`/`actor_ref_key_id`, `recorded_at`); backfills existing
  identity; drops `NOT NULL` on the canonical identity columns; provisions roles.
- New migration `backend/migrations/20260530_sidecar_extraction_b_drop.sql`
  (subtractive): drops the plaintext + S1-13 cipher identity columns —
  `core.visits.actor_oid`/`captured_by_oid_ciphertext`/`captured_by_oid_key_id`,
  `core.observations.created_by_oid`, `core.evidence.captured_by_oid`,
  `core.assignments.created_by_oid` — with a precondition guard that refuses to
  drop unless every identity-bearing row is covered by its sidecar.
- Rollback scripts under `backend/migrations/rollback/` (moved out of the runner's
  glob path so `npm run migrate` cannot auto-apply them).

### Roles (the structural boundary)
- `intelligence_reader` (NOLOGIN): SELECT on canonical/normalized/MV surfaces,
  **no grant** on any sidecar.
- `audit_reader` (NOLOGIN): SELECT on the four sidecars for legitimate audit/export.
- `fieldpro` (app): full DML on the sidecars (write paths + export/delete).

### S1-13 reconciliation (B2 — relocate, don't duplicate)
- The S1-13 KMS-envelope commitment (NIST SC-13/SC-28, mandatory `admin.oid_decrypt`
  audit log on every decrypt) is preserved by **relocating** the cipher columns
  into `core.visit_actor_audit`. `oidCipher.decrypt` is storage-agnostic (params
  in), so no functional repoint was needed — docstrings updated only. Cipher is
  populated only on `visit_actor_audit` (extending it to the other three sidecars
  is a tracked backfill, not a schema change).

### Code repoints (writers → sidecar; readers → join sidecar)
- Writers: `visitService.ts`, `observationService.ts` (insert + spot-check),
  `stopPhotosService.ts` (evidence), `routeRunService.ts` (assignments) — identity
  now written to the sidecar; canonical INSERTs no longer carry it.
- Legitimate-audit readers: `sftpExport.ts`, `exportDeleteRoutes.ts` export selects
  LEFT JOIN the sidecars and alias identity back to the original field names (export
  bundle format unchanged). DELETE relies on the sidecar `ON DELETE CASCADE`.
- `oidCipher.ts` docstrings repointed to the sidecar.

### Docs
- `CANONICAL_STATE_LAYER_DESIGN.md`: status banner + §3.2 note flipped from
  target → **VERIFIED at the DB level**; §9 item 6 → RESOLVED at the DB level.
- `CLAUDE.md`: required-read STATUS line updated (item 6 verified; §3.2 no longer
  target state; items 4/5 still deferred).
- `KNOWN_ISSUES.md`: **ISSUE-018** filed — app-connection wiring (route intelligence
  reads through `intelligence_reader`) is the remaining step before the boundary
  binds the running app.

## Verification
- Dry-run on a throwaway clone: full A → boundary test → B → B-rollback → A-rollback,
  lossless. (One bug found + fixed during the dry-run: a `RAISE` format-string typo
  in Migration A's assertion; the migration aborted and rolled back atomically;
  re-ran the full sequence clean.)
- Working dev DB, paused-checkpoint protocol: Migration A applied + stamped → real
  UI workflows (4 visits, 18 observations incl. the `mapInfraIssue` infra path, 4
  evidence, 4 new assignments) confirmed to write identity to the sidecars with
  canonical columns NULL → Phase 2 `SET ROLE` boundary tests (all four sidecars
  `permission denied` for `intelligence_reader`; canonical + MV reads work;
  `audit_reader` reads sidecars) → Migration B applied + stamped.
- Post-B: `SELECT actor_oid FROM core.visits` → `column does not exist`; sidecar
  still `permission denied`; audit join still recovers identity (backfill,
  swept-straggler, and new-code provenance all confirmed). `tsc --noEmit` clean;
  no runtime references to the dropped columns; backend log clean.

## Why
- Make canonical state layer invariant #1 (worker identity not readable by
  intelligence) a permission-layer guarantee, not a code-review rule — per
  `CANONICAL_STATE_LAYER_DESIGN.md` §2 #1 and §3.2, and the labor-safety guardrails
  in `CLAUDE.md`.

## Residual gap (honest)
The DB-level boundary is proven; the running app still queries as `fieldpro`, so
the guarantee binds intelligence reads only once they run as `intelligence_reader`
(ISSUE-018). The roles are `NOLOGIN` group roles pending that wiring.

## Files touched
- `backend/migrations/20260530_sidecar_extraction_a_additive.sql` (new)
- `backend/migrations/20260530_sidecar_extraction_b_drop.sql` (new)
- `backend/migrations/rollback/20260530_sidecar_extraction_a_rollback.sql` (new)
- `backend/migrations/rollback/20260530_sidecar_extraction_b_rollback.sql` (new)
- `backend/src/domains/visit/visitService.ts`
- `backend/src/domains/observation/observationService.ts`
- `backend/src/domains/routeRunStop/stopPhotosService.ts`
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/src/scripts/sftpExport.ts`
- `backend/src/modules/admin/exportDeleteRoutes.ts`
- `backend/src/lib/oidCipher.ts`
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`
- `docs/changelog/2026-06-01-sidecar-extraction.md` (this file)
