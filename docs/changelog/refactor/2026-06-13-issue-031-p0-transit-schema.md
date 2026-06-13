# 2026-06-13 — ISSUE-031 P0: create the `transit.*` adapter schema

## What changed
- Created a new forward migration `backend/migrations/20260613_create_transit_schema.sql`
  and its rollback `backend/migrations/rollback/20260613_create_transit_schema_rollback.sql`.
- Forward migration:
  - `CREATE SCHEMA transit;`
  - `COMMENT ON SCHEMA transit` describing it as the transit-vertical adapter
    layer per DQ-1 (destination for the `v_*_transit` views evicted from `core`
    in P1/P4).
  - `GRANT USAGE ON SCHEMA transit TO fieldpro;` — the app role reads transit
    translation views.
  - Deliberately **no** `USAGE` grant to `intelligence_reader` or `mcp_readonly`,
    with an in-migration comment explaining the CANON-1 rationale.
- Rollback: `DROP SCHEMA transit RESTRICT;` — safe while the schema is empty;
  `RESTRICT` (not `CASCADE`) so the drop fails loudly if a later phase has
  already populated the schema.
- Applied to `fieldpro_db` as the `postgres` superuser. Pure scaffolding —
  empty schema, zero behavior change, no objects created, nothing reads it yet.

## Why
- ISSUE-031 P0, Step 0.1 of the migration sequence
  (`planning/architecture/2026-06-13-issue-031-migration-sequence.md`).
- DQ-1 decided the evicted transit translation views land in a dedicated
  `transit.*` schema rather than in `public` tagged as adapter objects, so the
  canonical↔vertical boundary (CANON-1) is enforced by **schema grant** —
  structural, visible in `\dn`, impossible to violate by accident — rather than
  by naming convention.
- It is the destination every later view-eviction step (P4) writes into, has no
  upstream dependency and no risk, so it is sequenced first and unblocks P4.
- Withholding `USAGE` from `intelligence_reader` and `mcp_readonly` keeps the
  intelligence/diagnostic roles structurally unable to reach a transit worker
  column through the adapter schema — a labor-safety guarantee at the permission
  layer.

## Phase verification (paste-back)
Run against `fieldpro_db` as superuser after apply (`postgres` MCP):

| Check | Query | Result |
|-------|-------|--------|
| 1 | `SELECT nspname FROM pg_namespace WHERE nspname='transit';` | `transit` |
| 2 | `SELECT has_schema_privilege('intelligence_reader','transit','USAGE');` | `false` |
| 3 | `SELECT has_schema_privilege('mcp_readonly','transit','USAGE');` | `false` |
| 4 | `SELECT has_schema_privilege('fieldpro','transit','USAGE');` | `true` |
| 5 | `SELECT count(*) FROM pg_class WHERE relnamespace='transit'::regnamespace;` | `0` |

Schema comment confirmed present via `obj_description('transit'::regnamespace,'pg_namespace')`.

## Files touched
- `backend/migrations/20260613_create_transit_schema.sql` (new)
- `backend/migrations/rollback/20260613_create_transit_schema_rollback.sql` (new)
- `docs/changelog/refactor/2026-06-13-issue-031-p0-transit-schema.md` (new)
