# 2026-07-01 — NI-3: mcp_readonly env-gated LOGIN + core USAGE + MCP config repoint (agent read path onto the identity wall)

**Type:** Ops / security posture (agent read path) · **Branch:** `fix/ni-3-mcp-readonly-login-repoint-usage`
**Spec:** NI-3 card (Notion `38d67f84`) Founder decision block — Option (a), per-session explicit `SET`, dev-only guard ·
**Closes:** drift class #4 of `docs/audit/2026-06-27-clean-build-vs-live-diff.md`, plus the two chain gaps the NI-3 recon found (no `core` USAGE; org-context story undefined).

## What changed

1. **`backend/migrations/20260701_ni3_mcp_readonly_login_env_gated.sql`** — codifies the
   `mcp_readonly` LOGIN attribute into the chain, env-gated. The runner exposes
   `MCP_READONLY_PASSWORD` as session GUC `app.mcp_readonly_password` (parameterized; secret
   never in SQL text or VC). Secret present at migrate time → `LOGIN PASSWORD` (dev path);
   absent/empty → actively asserts `NOLOGIN` (prod path — prod defines no such secret, so
   prod posture requires zero configuration and self-heals hand-set login drift). Posture
   assertion: resulting `rolcanlogin` must match the gate decision; role must never be
   SUPERUSER/BYPASSRLS.
2. **`backend/migrations/20260701_ni3_mcp_readonly_core_usage.sql`** — `GRANT USAGE ON
   SCHEMA core TO mcp_readonly` (unconditional, not env-gated: USAGE confers no read by
   itself; the LOGIN gate is the prod safety). Asserts USAGE present and CREATE absent.
   Without this the role's 14 `core.*` SELECT grants were dead ("permission denied for
   schema core"). The 31-object SELECT set itself is untouched.
3. **`backend/src/scripts/migrate.ts`** — additive: after connect, copies
   `MCP_READONLY_PASSWORD` from env into the session GUC (empty when unset → prod path).
4. **`.mcp.json`** — postgres MCP server repointed off `postgres:postgres` (superuser,
   RLS-bypassing; role absent post-rebuild so the tool was down) onto
   `postgresql://mcp_readonly:${MCP_READONLY_PASSWORD}@localhost:5432/fieldpro_db`.
   Labor-safety fix on the agent read path, not a convenience: agent reads now sit behind
   the grant wall. Takes effect at the next Claude Code session start; requires
   `MCP_READONLY_PASSWORD` exported in the launching shell (dev value in `backend/.env`,
   gitignored).
5. **`docs/dev/mcp-tools.md`** — postgres section rewritten: connects as `mcp_readonly`;
   canonical-SELECT-only + export views; identity unreachable by grant; org-context
   section documents the per-session explicit `SET app.current_org_id = '1'` (in the query
   text, never baked into the connection), flags `'1'` as a DEV ASSUMPTION to revisit at
   multi-org (same class as ISSUE-013's `resolveNumericOrgId` fallback,
   `backend/src/middleware/resolveOrgId.ts`), and notes the dev-only guard is inherited
   from the LOGIN gate — prod has no session that could issue the `SET`.

## Why

- The hand-set LOGIN was ISSUE-038/039-class out-of-band drift; the 2026-06-28 rebuild
  correctly regressed it and took the MCP read tooling down. Codifying it env-gated makes
  dev reproducible and prod provably NOLOGIN — "no standing agent read login in prod" is
  now re-asserted by the chain on every build.
- The old config connected agents as the `postgres` superuser — an RLS/identity-wall bypass
  on the agent read path (flagged by the Phase-0 recon). The repoint closes it structurally.
- Fail-closed stays load-bearing: a session that omits org context reads 0 rows, never
  silently-wrong data (PATTERN-001 discipline, per the founder ruling).

## Verification (proof gate, all 7 — full transcript in the dispatch paste-back)

- **Prod path:** fresh `postgres:14` + `db/init` bootstrap, full chain run WITHOUT
  `MCP_READONLY_PASSWORD` → exit 0, 32 recorded incl. both NI-3 files;
  `mcp_readonly rolcanlogin=f`; live login attempt refused. (Throwaway container.)
- **Dev path:** same rig WITH the secret → `rolcanlogin=t`, `rolsuper=f`, `rolbypassrls=f`;
  USAGE=t, CREATE=f on `core`.
- **Fail-closed:** as `mcp_readonly`, seeded test row visible only with explicit
  `SET app.current_org_id='1'` (1 row); without it, 0 rows, no error. Write attempt →
  permission denied.
- **Identity wall (live, as `mcp_readonly`):** 0 grants on `*_actor_audit`/`*identity*`/
  `route_runs`; 0 column ACLs; 0 OID/user columns on granted objects; granted-object count
  still 31; direct reads of `identity_directory`/`visit_actor_audit`/`route_runs` all
  refused.
- **Live dev:** both migrations applied via the runner and recorded (32 total);
  `rolcanlogin=t`; `public.bases` readable with org context (2 rows), canonical fail-closed
  without.
- **Config:** no `postgres:postgres` literal remains in `.mcp.json` or `docs/dev/`.

## Files touched

- `backend/migrations/20260701_ni3_mcp_readonly_core_usage.sql` (new)
- `backend/migrations/20260701_ni3_mcp_readonly_login_env_gated.sql` (new)
- `backend/src/scripts/migrate.ts` (additive GUC bridge)
- `.mcp.json` (repoint)
- `docs/dev/mcp-tools.md` (postgres section rewrite + org-context section)
- `docs/changelog/ops/2026-07-01-ni3-mcp-readonly-login-repoint-usage.md` (this file)
- `backend/.env` (local only, gitignored — `MCP_READONLY_PASSWORD` dev value; not committed)
