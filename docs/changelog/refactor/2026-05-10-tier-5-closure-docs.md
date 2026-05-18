# 2026-05-10 — Tier 5 Closure: Index caveat + adapter boundary docs

## What changed
- Added Tier 5 status note to `planning/REFACTOR_INDEX.md` under the Tier 5 summary: documents that Change 2 (`assignment_id` on new visits) was verified structurally, runtime verification deferred to first authenticated field session
- Updated `public.assets` entry in `ADAPTER_BOUNDARY.md` section 2 to document its dual role as canonical FK target and `org_id` source for canonical writes (`core.assignments`, `core.visits`)
- Added new section 2b "Bridge Views" to `ADAPTER_BOUNDARY.md` documenting `core.v_locations_transit`: schema, column semantics, Tier 5 usage, and contamination classification

## Why
- Tier 5 verification revealed two undocumented surfaces (`public.assets` as org_id source, `core.v_locations_transit` as stop→location translation view) that future agents and developers need to understand when writing canonical writes
- The caveat note ensures the deferred runtime verification is not forgotten when the first authenticated field session occurs

## Files touched
- `planning/REFACTOR_INDEX.md` — Tier 5 status caveat
- `planning/architecture/ADAPTER_BOUNDARY.md` — public.assets update + core.v_locations_transit section
