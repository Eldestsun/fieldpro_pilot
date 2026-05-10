# R7 — Historical Backfill Framework (Scale Asset)

> **Goal**: Provide a configurable, org-agnostic backfill framework that future customer organizations can use to import existing operational history (paper logs, legacy CMMS exports, spreadsheets) into the canonical layer. Not needed for the KCM pilot — KCM's canonical layer will be populated organically through shadow-mode UL usage. Built as a scale and sales asset.
>
> **Status**: 🔴 Not started — low priority, not a pilot prerequisite
> **Depends on**: Tier 1 done (canonical write paths must be stable before a backfill framework targets them)
> **Blocks**: Nothing — pilot proceeds without this

---

## Context

The KCM pilot does not require historical data backfill. KCM has no paper collection data to import, and the dev database contains only local test data with no production value. The canonical layer will be populated organically as ULs use the application in shadow mode — condition intelligence accumulates from real field visits.

However, future customer organizations onboarding to BASELINE may have years of operational history in paper logs, spreadsheets, or legacy CMMS exports. The ability to import that history — so their risk maps and condition timelines are meaningful from day one — is a meaningful sales differentiator.

R7 is therefore scoped as a configurable backfill framework: a source-adapter pattern that accepts organization-specific input formats and maps them to canonical inserts. The framework is org-agnostic — it is not wired to KCM's clean_logs or any transit-specific schema. Each new customer would implement a thin adapter for their source format.

Priority: Build after pilot is in flight. Do not block any pilot work on this.

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/scripts/backfill/` (new directory) | Backfill framework |
| `backend/scripts/backfill/runner.ts` | Core runner — reads adapter, batches inserts, dry-run support |
| `backend/scripts/backfill/adapters/csv_adapter.ts` | Reference adapter for CSV input |
| `backend/scripts/backfill/adapters/README.md` | How to write a new source adapter |

No production code changes. Scripts only. Transit tables untouched.

---

## Framework Design

### Source Adapter Interface
Each adapter implements:
- `rows(): AsyncIterable<BackfillRow>` — yields normalized rows from the source
- `sourceDescription: string` — logged at runtime for audit trail

### BackfillRow shape

```typescript
interface BackfillRow {
  stop_id: string
  occurred_at: Date
  outcome: 'completed' | 'skipped'
  observations: Array<{
    type: string
    value: string
  }>
  evidence_keys?: string[]
  org_id: number
}
```

### Runner behavior
- Accepts an adapter instance and an org_id
- Supports --dry-run flag (logs what would be inserted, writes nothing)
- Processes in batches of 500
- All inserts use ON CONFLICT DO NOTHING (idempotent)
- Deterministic client_visit_id via UUIDv5 keyed on
  'backfill:{source}:{stop_id}:{occurred_at}'
- Logs row counts before and after each table

### What it does NOT do
- Does not read clean_logs, hazards, or any KCM-specific transit table
- Does not resolve user_id to OID (backfilled visits use a
  backfill_import sentinel for captured_by_oid)
- Does not modify or delete source data

---

## R7 Overall Done Definition

R7 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] `backend/scripts/backfill/runner.ts` exists with dry-run support
- [ ] `csv_adapter.ts` reference implementation exists and is documented
- [ ] `adapters/README.md` explains how to write a new adapter
- [ ] Runner tested against a sample CSV with --dry-run flag
- [ ] Full run with sample CSV populates core.visits and core.observations correctly
- [ ] Running twice produces no new rows (idempotent)
- [ ] No transit tables touched
- [ ] Changelog entry written

---

## Agent Launch Block

```
Ops task. Read CLAUDE.md, then planning/REFINEMENT_R7_HISTORICAL_BACKFILL.md.

Build a configurable, org-agnostic backfill framework under
backend/scripts/backfill/:

  - runner.ts: accepts an adapter instance and an org_id. Reads rows from
    the adapter, batches inserts (500/batch) into core.visits,
    core.observations, and core.evidence. Supports --dry-run.
    Uses deterministic UUIDv5 client_visit_id keyed on
    'backfill:{source}:{stop_id}:{occurred_at}'. All inserts
    ON CONFLICT DO NOTHING. Logs row counts before and after.

  - adapters/csv_adapter.ts: reference adapter that reads a CSV file
    and yields BackfillRow objects.

  - adapters/README.md: documents the adapter contract
    (rows() AsyncIterable + sourceDescription string) and explains how
    to write a new adapter for a different source format.

Do NOT read clean_logs, hazards, or any KCM-specific transit table.
Do NOT resolve user_id to OID — use the 'backfill_import' sentinel for
captured_by_oid. Do NOT modify or delete source data. Do NOT touch any
production service code.
```
