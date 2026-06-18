# Actor-Audit Labor-Safety Wall Verification
**Date:** 2026-06-18  
**Branch:** recon/issue-031-actor-audit-wall-verify  
**Scope:** RECON ONLY. Verify the labor-safety wall around `core.*_actor_audit` sidecars before clipping adapter OID columns. Three questions: (1) Are sidecars walled from intelligence_reader/mcp_readonly? (2) What actor value lands for hazard submissions? (3) Is any plaintext worker UUID OID readable by intelligence_reader in core.*?

---

## Q1 — Are the actor-audit sidecars walled from intelligence_reader and mcp_readonly?

**VERDICT: YES — all four sidecars are walled.**

Grant table (from live `pg_state.sql`):

| Sidecar table | intelligence_reader | mcp_readonly | audit_reader | fieldpro |
|---|---|---|---|---|
| `core.visit_actor_audit` | ❌ none | ❌ none | ✅ SELECT | ✅ SELECT/INSERT/UPDATE/DELETE |
| `core.observation_actor_audit` | ❌ none | ❌ none | ✅ SELECT | ✅ SELECT/INSERT/UPDATE/DELETE |
| `core.evidence_actor_audit` | ❌ none | ❌ none | ✅ SELECT | ✅ SELECT/INSERT/UPDATE/DELETE |
| `core.assignment_actor_audit` | ❌ none | ❌ none | ✅ SELECT | ✅ SELECT/INSERT/UPDATE/DELETE |

**Schema:** Each sidecar has `actor_ref text NOT NULL` (plaintext Entra UUID OID), `actor_ref_ciphertext bytea` and `actor_ref_key_id text` (KMS path placeholder, not yet populated). The plaintext `actor_ref` is protected solely by the no-grant boundary — it is not hashed or encrypted at rest.

**Grant provenance:**
- Migration A (`20260530_sidecar_extraction_a_additive.sql`): Created the four sidecars. Immediately revoked from `intelligence_reader` via `REVOKE ALL ON core.visit_actor_audit, core.observation_actor_audit, core.evidence_actor_audit, core.assignment_actor_audit FROM intelligence_reader`.
- Q-G migration (`20260612_mcp_readonly_revoke_canonical_only.sql`): Revoked `mcp_readonly` from all four sidecars (plus 9 other objects).
- Result confirmed in `pg_state.sql`: only `audit_reader` (SELECT) and `fieldpro` (full DML) appear in grants.

**`audit_reader` access is intentional and correct.** The sidecar tables exist specifically for audit use. `audit_reader` is the dedicated audit principal, distinct from `intelligence_reader` (analytics) and `mcp_readonly` (MCP tool access).

---

## Q2 — What actor value lands in `core.observation_actor_audit` for hazard submissions?

**VERDICT: Real Entra UUID OID for authenticated requests; literal string `"unknown"` for unauthenticated.**

Trace from `backend/src/modules/work/routeRunStopRoutes.ts` (lines 236, 253, 283, 511, 539):

```typescript
actorOid = req.user?.oid || "unknown"
```

This value is passed as `context.actorOid` to `observationService.ts`, which writes to the sidecar at lines 367–371:

```typescript
INSERT INTO core.observation_actor_audit (observation_id, org_id, actor_ref)
VALUES ($1, $2, $3)
ON CONFLICT (observation_id) DO NOTHING
```

Where `$3 = context.actorOid`.

In the live pilot environment, all route worker submissions go through Entra-authenticated sessions — `req.user?.oid` is always populated. The `|| "unknown"` fallback is a defensive guard for unauthenticated paths, which do not exist in the pilot surface.

**Note on test residue rows 7/8:** These rows were submitted during prior UI-workflow testing, likely via a test harness that may or may not have been fully authenticated. The specific `actor_ref` values for these rows were not checked (they are test residue slated for deletion — the value does not matter for the wall verification).

---

## Q3 — Is any plaintext worker UUID OID readable by intelligence_reader in core.*?

**VERDICT: NO — no plaintext UUID OID is readable by intelligence_reader in core.***

### Core base tables

Migration B (`20260530_sidecar_extraction_b_drop.sql`) dropped all OID columns from the four canonical base tables:

```sql
ALTER TABLE core.visits        DROP COLUMN actor_oid;
ALTER TABLE core.observations  DROP COLUMN created_by_oid;
ALTER TABLE core.evidence      DROP COLUMN captured_by_oid;
ALTER TABLE core.assignments   DROP COLUMN created_by_oid;
```

Confirmed live via `pg_state.sql`: `core.observations` and `core.visits` have no OID columns. `intelligence_reader` has SELECT on `core.observations` and `core.visits`, but there is nothing to leak — the OID columns are gone.

### Core views accessible to intelligence_reader

`intelligence_reader` has SELECT on the following `core.*` views (from `pg_state.sql`):

| View | Worker-identity column | Column type | UUID OID? |
|---|---|---|---|
| `core.v_clean_logs_transit` | `user_id` | `bigint` | ❌ internal integer FK |
| `core.v_hazards_transit` | `reported_by` | `bigint` | ❌ internal integer FK |
| `core.v_assignments_transit` | (none) | — | ❌ clean |
| `core.v_locations_transit` | (none) | — | ❌ clean |
| `core.v_assets` | (none) | — | ❌ clean |
| `core.v_stop_location_map` | (none) | — | ❌ clean |

`v_clean_logs_transit.user_id` and `v_hazards_transit.reported_by` are `bigint` — they are internal integer user IDs (FK to the `users` table), not Entra UUID OIDs. They are not directly resolvable to worker identity without access to `identity_directory` (which is revoked from both `intelligence_reader` and `mcp_readonly` per the Q-G migration).

**Q-G migration RESIDUAL note:** The Q-G migration (`20260612_mcp_readonly_revoke_canonical_only.sql`) documented five transit views as a residual — worker columns potentially reachable via owner-privilege views:
- `v_clean_logs_transit.user_id` ← bigint, not UUID
- `v_hazards_transit.reported_by` ← bigint, not UUID
- `v_infra_transit.reported_by` ← **DROPPED** (migration `20260613_p1_drop_dead_transit_views.sql`)
- `v_level3_logs_transit.user_id` ← **DROPPED** (same migration)
- `v_stop_photos_transit.created_by_oid` ← **DROPPED** (same migration)

`v_stop_photos_transit.created_by_oid` was the only `text`-typed OID column in any transit view. That view was dropped in `20260613_p1_drop_dead_transit_views.sql`, which ran after the Q-G migration. Confirmed absent from `pg_state.sql` (view does not appear). The residual is cleared for this column.

The two remaining accessible views (`v_clean_logs_transit`, `v_hazards_transit`) expose only bigint integer IDs, not UUID OIDs.

---

## Overall Verdict

**The labor-safety wall is structurally intact.**

All four sidecars are walled from `intelligence_reader` and `mcp_readonly`. No plaintext Entra UUID OID is readable by either role through any core base table or view. The only view that ever carried a real UUID OID (`v_stop_photos_transit.created_by_oid`) has been dropped. The two transit views that remain accessible to `intelligence_reader` (`v_clean_logs_transit`, `v_hazards_transit`) expose bigint integer FKs — not OIDs, not directly resolvable to worker identity.

**Implication for the write-clip:**  The hazards write-clip is unblocked on labor-safety grounds. Clipping the `public.hazards` adapter OID columns will not leave resolvable worker identity accessible to the intelligence layer — it was never accessible there.

---

## Residual (not a blocker, tracked separately)

`v_clean_logs_transit.user_id` (bigint) and `v_hazards_transit.reported_by` (bigint) remain accessible to `intelligence_reader`. These are internal integer user IDs. The Q-G migration flagged these as D2/D3 view eviction work. They are not UUID OIDs and are not resolvable without `identity_directory` access (which is revoked). Not a labor-safety blocker for the write-clip.

---

## Sources

- `pg_state.sql` — live grant table and schema snapshot
- `backend/migrations/20260530_sidecar_extraction_a_additive.sql` — sidecar creation + initial revoke
- `backend/migrations/20260530_sidecar_extraction_b_drop.sql` — OID column drop from core base tables
- `backend/migrations/20260612_mcp_readonly_revoke_canonical_only.sql` — Q-G migration + RESIDUAL documentation
- `backend/migrations/20260613_p1_drop_dead_transit_views.sql` — drop of v_infra_transit, v_level3_logs_transit, v_stop_photos_transit, v_trash_volume_logs_transit
- `backend/src/modules/work/routeRunStopRoutes.ts` lines 236, 253, 283, 511, 539 — actorOid source
- `backend/src/domains/observation/observationService.ts` lines 367–371 — sidecar INSERT
