# MCP Tools — Per-Server Reference

> Reference detail for the three MCP servers configured in `.mcp.json` and auto-approved
> in `.claude/settings.json`. The governing rule ("three servers configured + auto-approved;
> prefer them over bash equivalents") lives in `CLAUDE.md § MCP Tools`. This file holds the
> per-server usage detail moved out of CLAUDE.md during the 2026-06-16 rules-index restructure.

## `postgres`

Read-only structured access to `fieldpro_db` as **`mcp_readonly`** — the grant-walled
diagnostic role (NOSUPERUSER, NOBYPASSRLS, SELECT-only). This is the agent read path into
the DB, so its reach is a labor-safety property, not a convenience: the role's grants cover
only the 31-object identity-free canonical surface (14 `core.*` spine tables + views incl.
`v_observation_normalized`, 17 `public.*` inventory/config/export objects). Worker identity
is unreachable **by grant** — zero privileges on the `*_actor_audit` sidecars,
`identity_directory`, `route_runs`, or any OID-bearing column
(`CANONICAL_STATE_LAYER_DESIGN.md` §3.2; grant set owned by
`20260611_mcp_readonly_canonical_grant_provision.sql` + `20260612` + `20260617`).

- **Use for:** schema inspection, multi-step read queries, verifying canonical writes after API calls.
- **Prefer over:** `psql` bash commands for anything beyond a one-liner.
- **NOT for:** migrations/DDL (use the runner), or testing app-path RLS behavior as `fieldpro`.
- **Connection:** `postgresql://mcp_readonly:${MCP_READONLY_PASSWORD}@localhost:5432/fieldpro_db`
  — `.mcp.json` expands `MCP_READONLY_PASSWORD` from the shell environment at session start
  (same requirement as `GITHUB_PERSONAL_ACCESS_TOKEN`). The dev value lives in `backend/.env`
  (gitignored). If the variable is unset the tool simply fails to connect — down is the safe state.
- **Login provisioning (env-gated, NI-3):** the role's LOGIN attribute is owned by
  `backend/migrations/20260701_ni3_mcp_readonly_login_env_gated.sql`. A build whose migrate
  environment defines `MCP_READONLY_PASSWORD` gets `LOGIN` with that password; a build
  without it (the prod path — prod defines no such secret) actively asserts `NOLOGIN`.
  So "prod has no standing agent read login" is reproduced and re-asserted by the chain on
  every build, not promised.

### Org context — canonical reads are fail-closed (dev assumption: org 1)

RLS is fail-closed (MT-2): `mcp_readonly` is NOBYPASSRLS, so a session without org context
reads **0 rows** from org-scoped tables. That is correct and load-bearing (PATTERN-001 in
`docs/KNOWN_ISSUES.md`) — a query that forgets org context returns nothing, never
silently-wrong data. Every canonical read must therefore set org context **explicitly, in
the same tool call**:

```sql
SET app.current_org_id = '1';
SELECT count(*) FROM core.observations;
```

- The `SET` happens per session/per call, issued by the agent in the query text — it is
  deliberately **not** baked into the connection string or any config.
- `'1'` is a **DEV ASSUMPTION** (the single dev org) to revisit at multi-org — the same
  class as ISSUE-013's `resolveNumericOrgId` dev fallback
  (`backend/src/middleware/resolveOrgId.ts`; see `docs/KNOWN_ISSUES.md § ISSUE-013`).
- Dev-only by construction: the convention can only be exercised where the login exists,
  and the prod chain ships `mcp_readonly` NOLOGIN (see login provisioning above), so no
  prod session exists to issue the `SET`.
- The identity-free `public.*` export views (`export_stop_status_v1`,
  `export_pool_daily_summary_v1`, `export_route_run_origin_mix_v1`) read without org
  context — they are the sanctioned no-context path.

## `chrome-devtools-mcp`

Attaches to a running Chrome tab via Chrome DevTools Protocol. Can inspect network requests,
read console output, take screenshots, and interact with the page.

- **Use for:** inspecting API request/response payloads and status codes from live browser
  sessions, reading console errors, verifying frontend state.
- **Requires:** Chrome running with remote debugging enabled, or a tab already open at the target URL.
- **Not a replacement for:** the user's own browser session — attach to the user's tab, don't
  open a new one unless asked.

## `github`

Full GitHub API access via `@modelcontextprotocol/server-github`.

- **Use for:** creating PRs, reading/writing issues, checking CI status, reviewing PR comments,
  managing branches.
- **Requires:** `GITHUB_PERSONAL_ACCESS_TOKEN` set in the shell environment before starting Claude Code.
- **Prefer over:** `gh` CLI calls for multi-step GitHub workflows.
