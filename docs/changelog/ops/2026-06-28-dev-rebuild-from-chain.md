# Dev DB rebuilt from the migration chain — DRIFT class collapsed, P1.5 live-effective

**Date:** 2026-06-28 · **Type:** Ops (destructive dev rebuild — no code change) · **Branch:** `ops/dev-rebuild-from-chain` (changelog only; no fix-up migration was needed)
**Spec:** `docs/audit/2026-06-27-clean-build-vs-live-diff.md` (the closed-set diff this rebuild resolves) · **Pairs with:** the NI-1/NI-2/NI-4 seed pass (PR #68, merged) that made this non-destructive.

## What was done

Tore down the dev Postgres (`fieldpro_db`) and rebuilt it entirely from version control:
1. Full safety backup first (`pg_dump -Fc`, 2.4M, kept off-repo).
2. Stopped the container, cleared the `./data/db` bind mount, `docker compose up -d postgres` → fresh
   `initdb` ran `db/init/00_bootstrap_provisioner.sh` (creates `fieldpro_admin` BYPASSRLS/CREATEDB/
   CREATEROLE + member of `fieldpro`, pre-installs `pgcrypto`, downgrades `fieldpro` to NOSUPERUSER
   NOBYPASSRLS).
3. Ran the full chain via the runner as `fieldpro_admin` → **exit 0, 30 applied, 57 legacy skipped,
   "Migration run complete."** Nothing hand-applied.

This collapses the entire DRIFT class the recon bounded: MT-2 applies by construction, ownership goes
uniform, read-role grants are restored, and `schema_migrations` carries only the consolidated chain.

## Gate (both required, both confirmed before rebuilding)

- Both seed migrations (`20260628_seed_a_live_config.sql`, `20260628_seed_b_observation_type_registry.sql`)
  present on `origin/main` (seed PR #68 merged) — without them the rebuild would empty the registry.
- MT-2 migration (`20260627_mt2_rls_fail_closed.sql`) present on `origin/main`.

## Verification (all 7 + NI-3)

1. **MT-2 fail-closed is LIVE** (as non-super `fieldpro`): unset `app.current_org_id` → **0 rows**
   (`public.bases`, `core.observation_type_registry`); `=1` → org-1 rows (bases 2, registry 30); `=2`
   → only the throwaway org-2 probe row (bases 1, registry 0). `audit_log`/`export_delete_tokens`
   forced-RLS, empty post-rebuild. **Zero pass-all `COALESCE` branches** remain in `core`/`public`
   policies. (Throwaway org-2 + probe row seeded for the isolation proof, then deleted.)
2. **Ownership:** 79/82 objects owned by `fieldpro_admin`; **0 owned by `postgres`** — the recon's
   5 formerly-`postgres`-owned objects (`*_actor_audit` ×4 + `v_observation_normalized`) are now
   `fieldpro_admin`. The 3 still owned by `fieldpro` (`stop_status_mv`, `export_stop_status_v1`,
   `export_pool_daily_summary_v1`) are **chain-intended** — `20260613_p1_2` deliberately `SET ROLE
   fieldpro` / `OWNER TO fieldpro` for the MV refresh path; they reproduce on every clean build and
   were `fieldpro`-on-both in the recon diff (not drift).
3. **App role posture:** app connects as `fieldpro | rolsuper=f | rolbypassrls=f`.
4. **Read-role grants restored** (the 6 live was missing): `audit_reader` → the 4 `core.*_actor_audit`
   sidecars; `intelligence_reader` + `mcp_readonly` → `core.v_observation_normalized`. Totals:
   `audit_reader=8`, `intelligence_reader=20`, `mcp_readonly=30`. **Identity wall intact** —
   `mcp_readonly`/`intelligence_reader` have **0** grants on any `*_actor_audit` / `identity_directory`
   / `route_runs` (OID-bearing) object.
5. **Capture reproduced (non-destructive proof):** `observation_type_registry` = **30**;
   `core.asset_types` 1, `public.asset_types` 1, `bases` 2, `route_pools` 12 — all == pre-rebuild
   snapshot; `organizations` org-1 `tenant_uuid = 66d756aa-…`. Registry full-row md5
   **`bf97d8da4a6b9bac41eb6b779c0621d1`** — identical to the pre-rebuild snapshot. Normalizer
   functions (`loadRegistryRules` returns rules; trash_volume graded, presence passthrough).
6. **`schema_migrations` clean:** 30 recorded; every non-legacy chain file recorded; no
   applied-but-unrecorded and no recorded-but-unapplied drift.
7. **App smoke test:** backend up; `GET /api/health` ok; `GET /api/ops/pools` (dev-bypass org-1)
   returned the 12 org-1 route pools end-to-end via `resolveNumericOrgId → withOrgContext → RLS query
   as fieldpro`. RLS + org context working end-to-end on the rebuilt DB.

## NI-3 note (founder's call — not decided here)

The clean build makes **`mcp_readonly` NOLOGIN** (confirmed: `login=false`). This is expected. It was
**not** re-granted LOGIN. The postgres MCP read tooling will not reconnect until NI-3
(codify-vs-reprovision the `mcp_readonly` credential) is resolved by the founder.

## Scope / safety

Dev only. No production (none exists), no credential rotation, no Azure. Pre-rebuild backup retained.
Bulk dev data (KCM stop inventory, field captures, audit history) was intentionally not restored — a
dev rebuild starts those empty; re-ingest from source as needed.
