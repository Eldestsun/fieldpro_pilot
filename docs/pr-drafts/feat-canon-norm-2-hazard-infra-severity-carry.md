# PR Draft — CANON-NORM-2: carry hazard/infra severity into norm_severity + backfill

**Branch:** `feat/canon-norm-2-hazard-infra-severity-carry` → `main`
**Title:** `feat(canon-norm): carry hazard/infra severity into canonical norm_severity + backfill (CANON-NORM-2)`

---

**SIGNIFICANCE**

Makes canonical **lossless** for hazard severity. CANON-NORM-1 opened the receiver
(`severity_map={"field":"severity"}` on every presence registry row); this card actually
fills the pipe. The write path now threads the worker's severity into the observation
payload as a number, so the §4.2 normalizer carries it into
`core.observations.norm_severity` — and a backfill brings existing rows into the same
shape. Real hazard magnitude (which previously lived **only** in `public.hazards.severity`)
is now reconstructable from canonical. This is the prerequisite for the eventual
intelligence repoint (`riskMapService` reading real `norm_severity` instead of synthesizing
`1.0`/`COUNT(*)`) and for the separate adapter write-clip card.

**WHAT LANDED**

- **Write-side** (`observationService.ts`): hazard presence rows now carry
  `payload.severity` as a NUMBER, derived via the adapter's existing `toNumericSeverity`
  scale (exported from `hazardService.ts`) — the SAME number `public.hazards.severity`
  stores. The legacy `severity` text column write is preserved (additive). No severity
  → nothing threaded → `norm_severity` NULL (canonical does not replicate the adapter's
  synthetic default-of-1; no-manufactured-state, §4.4).
- **Backfill** (`20260617_canon_norm_2_backfill_hazard_infra_severity.sql`): joins existing
  presence observations back to `public.hazards` / `public.infrastructure_issues` on
  `visit_id`, carrying the adapter severity into `norm_severity` (`severity IS NOT NULL`,
  `norm_severity IS NULL` guards). Idempotent; rollback included.
- **Regression test** (`hazardSeverityCarry.test.ts`): real write chain —
  `"high" → norm_severity=3`, `3 → 3`, no-severity → NULL.

**Verification (live, dev DB)**

- Lossless reconstruction (before → after) — hazard visits 92, 96:
  `norm_severity NULL → 3`, matching `public.hazards.severity = 3` exactly.
- Backfill counts: 2 hazard presence rows with adapter severity → 2 now matching; infra
  rows with adapter severity = 0 (infra UPDATE = no-op).
- `tsc --noEmit` clean. Canonical suite **117 passed, 0 failed** (114 + 3 new).
- Labor safety: **0** identity columns on `core.observations`.

**HONEST RESIDUAL**

- **Infra severity is structurally absent** at the source today: `InfraIssueInput` carries
  no severity field, the adapter INSERT omits it, and every live
  `public.infrastructure_issues.severity` is NULL. So infra `norm_severity` stays NULL
  (lossless: NULL → NULL). If/when an infra capture surface emits severity, the
  CANON-NORM-1 receiver and this card's backfill already accept it — no further write-side
  change needed.
- **Hazard severity is per-visit, not per-hazard-type** (the safety flow captures one
  value applied to all hazard presences of the visit). The backfill joins on `visit_id`
  accordingly; the hazard-vs-infra presence type lists are enumerated explicitly because
  the registry does not encode that distinction (both are `obs_kind='presence'`).
- **Intelligence still synthesizes** hazard/infra severity (`riskMapService.ts`).
  Repointing it onto `norm_severity` is the follow-on reader card, not P1.
- **Adapter writes are NOT clipped** here — that is the separate clip card, after this
  merges (the adapter remains the live severity source until the reader repoint lands).

**STOP-BEFORE-MERGE**: branch pushed, PR not opened (founder opens PRs).
