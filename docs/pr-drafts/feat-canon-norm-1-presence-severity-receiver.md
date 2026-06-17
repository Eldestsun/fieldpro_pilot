# PR Draft — CANON-NORM-1: presence-type severity receiver

**Branch:** `feat/canon-norm-1-presence-severity-receiver` → `main`
**Title:** `feat(canon-norm): presence-type severity receiver — open the norm_severity pipe (CANON-NORM-1)`

---

**SIGNIFICANCE**

Makes core *capable* of holding a worker-reported magnitude for presence-kind
observations. This is the **receiver / the pipe** — it unblocks the P2 picker UI
(Capability Build) which will later emit real magnitudes, and it lets intelligence
eventually read a real `norm_severity` for hazards/infra instead of synthesizing
`1.0` / `COUNT(*)`. No values, scale, or weighting are authored here; no data flows yet.

**WHAT LANDED**

- **Migration** (`20260617_canon_norm_p1_presence_severity_passthrough.sql`): on every
  `core.observation_type_registry` row with `obs_kind='presence'` (18 rows),
  set `severity_map = {"field":"severity"}` (a passthrough field-locator, same shape
  as `trash_volume`'s `{"field":"level"}`) and `payload_schema` declaring the optional
  integer `severity` field's shape (also fixes the structural part of ISSUE-017).
  `ok_rule` stays NULL (presence existence is the signal, never graded). Idempotent;
  rollback included.
- **No normalizer code change.** `evaluateSeverityMap` already reads `{field}`
  generically, so the new rule is honored by the existing write path
  (`loadRegistryRules` → `normalizeObservation` → INSERT `norm_severity`).
- **Regression test** (`presenceSeverityReceiver.test.ts`): real-chain dry-runs —
  `{severity:3}` → `norm_severity=3`; `{}` → `norm_severity IS NULL`.

**Verification (live)**

- `core.observations.norm_severity` = nullable `smallint` (pre-existing).
- 18/18 presence rows carry the passthrough + schema; `ok_rule` NULL on all.
- Canonical suite: **114 passed, 0 failed** (incl. 3 new receiver tests).
- No authored numeric values in any `severity_map` (all `{field:...}` locators).
- Labor safety: 0 identity columns on `core.observations`.

**HONEST RESIDUAL**

- The pipe carries no data until the **P2 picker UI** (Capability Build) emits a
  `severity` field on presence payloads — out of scope here by phase guard.
- Intelligence still synthesizes hazard/infra severity (`riskMapService.ts`); repointing
  readers onto `norm_severity` is surface work for Capability Build, not P1.
- `payload_schema` is declared but not yet enforced at the write path (no reader of
  `payload_schema` exists in `backend/src`); enforcement is a separate follow-on.
