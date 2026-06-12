# 2026-06-11 — KNOWN_ISSUES.md backfill: ISSUE-027 through ISSUE-031

## What changed
- Appended five new issue entries to `docs/KNOWN_ISSUES.md` (append-only; no existing entry renumbered, rewritten, or restatused):
  - **ISSUE-027** — Azure Key Vault credential loading / `AzureKeyVaultAdapter` is a stub (`oidCipher.ts` lines ~138–146). Open, medium. Ties to S1-13 + ADR Q-E + S3-1 (Azure Enterprise).
  - **ISSUE-028** — `audit_reader` role is NOLOGIN / unwired; export channel still reads sidecars as `fieldpro`. Open, medium. Ties to ADR Q-F.
  - **ISSUE-029** — PostgreSQL 14 blocks PG15+ `security_invoker` views and the PostGIS geometry path. Open, deferred post-pilot, low (non-foreclosure only). Ties to ADR MV-2.
  - **ISSUE-030** — Six `core.v_*_transit` log views are SELECT-granted to `intelligence_reader` (labor-safety surface widening). Open, medium. Ties to ADR CANON-1.
  - **ISSUE-031** — Umbrella issue: complete the canonical migration / clip work-attribution. Open, HIGH, design-settled but blocked on founder DQ-1..DQ-5 + the unwritten migration-sequence artifact. Lists Q-A/B, Q-C, Q-D, Q-E, Q-F, Q-G, CANON-1 as sub-items with ADR IDs and current execution state, plus the verified Q1/Q2/Q3/Q4/Q6 findings.
- Recorded under ISSUE-031 the **missing canonical-core inventory** documentation gap: `docs/audit/2026-06-06-canonical-core-complete-inventory.md` is cited as CORE-INV by the ADR and the boundary reconciliation but does not exist on disk. Flagged as "restore from the founder's copy — do NOT regenerate."
- Cross-referenced the relevant ADR decision ID (Q-A/B, Q-C, Q-D, Q-E, Q-F, Q-G, CANON-1, MV-2) inside each new entry body so the linkage to `planning/architecture/2026-06-07-issue-031-redesign-adr.md` is explicit.

## Why
- The live repo audit (`2026-06-11-live-repo-audit.md` §13) identified the absence of ISSUE-027–031 as the single largest index gap: the ADR, both 2026-06-06 inventories, the boundary reconciliation, CLAUDE.md, and the audit's own pre-verified block all reference these IDs as if they already existed in the tracker.
- Without real IDs, the ISSUE-031 settled-decision set (Q-A…Q-G, CANON-1) carried no tracking and would not appear on any Kanban built from the index files — making the design-settled adapter migration work undispatchable.
- This restores internal consistency to the issue tracker and makes the ISSUE-031 work dispatchable with concrete IDs and explicit ADR linkage.

## Scope / discipline
- Documentation only. No code, no schema, no migrations, no role/grant changes.
- One file edited: `docs/KNOWN_ISSUES.md` (append-only). Existing entries 001–026 untouched.
- The canonical-core inventory file was NOT recreated (the founder holds the authoritative copy); only the gap is noted for resolution.

## Verification
- Pre-edit grep confirmed: ISSUE-020–026 present, ISSUE-027–031 absent (matches audit §13).
- Post-edit, the open ISSUE IDs in `docs/KNOWN_ISSUES.md` are:
  006, 008, 010, 013, 014, 015, 016, 017, 018, 024, 025, 026, **027, 028, 029, 030, 031**, plus PATTERN-001.
  (001, 002, 003, 004, 005, 007, 009, 011, 012, 019, 020, 021, 022, 023 are Fixed/Closed.)

## Files touched
- `docs/KNOWN_ISSUES.md` (appended ISSUE-027, 028, 029, 030, 031)
- `docs/changelog/2026-06-11-known-issues-027-031-backfill.md` (this file)
