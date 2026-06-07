# ISSUE-018 Phase 0 — Context Preservation Note

**Date:** 2026-06-06
**Branch:** `feat/issue-018-intelligence-reader-wiring` (stays alive until ISSUE-031 lands
and ISSUE-018 resumes; likely restarted from a clean `main` then)
**Purpose:** Preserve the full Phase 0 discovery for ISSUE-018 so a future session has the
complete picture, not just the KNOWN_ISSUES headlines. Companion to the empirical adapter
audit: `docs/audit/2026-06-06-adapter-layer-information-content-audit.md`.

**Status of ISSUE-018:** PAUSED. Original scope (route intelligence reads through the
`intelligence_reader` role + lock down `fieldpro`) is blocked by a prerequisite —
**ISSUE-031** (clip the v0001 dual-write scaffolding so the transit adapter layer is
genuinely operationally inert). The adapter audit returned HYPOTHESIS WRONG: the adapter
carries a full parallel *identified* work record. Until that's removed, credential
isolation on the canonical layer doesn't deliver the *system-wide* labor-safety guarantee.

---

## 1. The four findings (the "D-decisions") and their resolutions

Phase 0 surfaced four decisions. Resolutions reached in chat with the founder:

### D-A — `audit_reader` is unwired; the lockdown step is blocked → **filed ISSUE-028**
- `audit_reader` exists but is **NOLOGIN** and not used by the app.
- The only legitimate sidecar readers — `exportDeleteRoutes.ts` and `scripts/sftpExport.ts`
  (both `LEFT JOIN` all four `core.*_actor_audit` sidecars; `oidCipher.ts` decrypts) —
  run as **`fieldpro`**.
- Therefore the ISSUE-018 mandated lockdown (revoke `fieldpro`'s sidecar `SELECT`) would
  **break export/delete** unless `audit_reader` is first given LOGIN + its own pool/helper
  and those two paths repointed.
- `exportDeleteRoutes` also needs sidecar **DELETE** (data-subject deletion) — lockdown is
  "revoke SELECT, keep INSERT + DELETE for the correct role," not a blanket revoke.
- **Resolution:** do not attempt the lockdown in the original 018 dispatch; treat audit_reader
  wiring as its own work (ISSUE-028), and re-scope after ISSUE-031 (the export surface and
  which tables carry identity change materially post-clip).

### D-B — PG14 view-owner privilege bridge → **filed ISSUE-029**
- DB is **PostgreSQL 14.18**. `security_invoker` views require **PG15+** (not available).
- The `core.v_*_transit` views are owned by `fieldpro` with `security_invoker` unset, so they
  execute underlying access **as the owner (`fieldpro`)**, not the querying role.
- Consequence: `intelligence_reader` reading these views reaches underlying tables with
  `fieldpro`'s privileges → partially moots DECISION 1's "separate credentials = separate
  grants" for view-routed reads.
- The canonical-sidecar labor-safety property still holds (no view exposes a sidecar;
  intelligence_reader has no sidecar grant; lockdown would close the rest).
- **Resolution:** accept on PG14 for now (the canonical guarantee holds); true per-role
  isolation on views needs PG15+ (`security_invoker=true` + direct base-table grants) or a
  view rewrite. Re-decide post-ISSUE-031, when the views likely collapse anyway.

### D-C — `v_clean_logs_transit.user_id` exposure + connection-pattern inconsistency → **filed ISSUE-030**
- `core.v_clean_logs_transit` exposes `user_id`; `core.v_hazards_transit` exposes
  `reported_by`. `intelligence_reader` already holds `SELECT` on both → it can read
  worker-attributed work data through them today.
- See §3 for the connection-pattern inventory.
- **Resolution:** combined into ISSUE-030; fix alongside the 018 repoint, which resumes
  post-031 (the view/table may not survive the clip).

### D-D — scope of "intelligence reads" to repoint
- Discovery showed the genuinely-pure, cleanly-repointable intelligence reads are narrow:
  `/admin/control-center/overview` and `/admin/control-center/difficulty`.
- The two services the dispatch named are **not pure reads** (see §4) and cannot move to
  `intelligence_reader`.
- **Resolution:** the whole question is mooted/superseded by ISSUE-031 — the read surface
  and the views change materially post-clip. Re-scope the 018 repoint after 031.

Plus the original ISSUE-018 dispatch's own follow-on: **Azure Key Vault credential
loading → filed ISSUE-027** (post-Azure; not blocking).

---

## 2. Current DB role state (verified live, 2026-06-06)

| Role | LOGIN | super | bypassrls | Notes |
|------|-------|-------|-----------|-------|
| `fieldpro` | yes | no | no | app role; full CRUD on sidecars; owns the `core.v_*_transit` views |
| `intelligence_reader` | **no** | no | no | **already holds SELECT** on canonical tables, all `core.v_*_transit` views, `stop_risk_snapshot`, `stop_effort_history`, `stops`, `transit_stop_assets`. Needs only LOGIN + app wiring. |
| `audit_reader` | **no** | no | no | exists but unwired (D-A / ISSUE-028) |
| `postgres` | yes | yes | yes | superuser |

`fieldpro` grants on each `core.*_actor_audit` sidecar: `SELECT, INSERT, UPDATE, DELETE`
(the lockdown target — see D-A for why it can't simply be revoked yet).

**Grant work is mostly already done** (the sidecar-extraction dispatch provisioned
`intelligence_reader`'s SELECT grants). The remaining 018 work was always: `ALTER ROLE
intelligence_reader LOGIN` + env-var creds + second pool + `withIntelligenceConnection`
helper + repoint reads + CI role fix (ISSUE-025). All now gated behind ISSUE-031.

---

## 3. Connection-pattern inventory (the intelligence/control-center reads)

Three inconsistent patterns across the admin reads — normalize during the 018 repoint:

| Endpoint / path | Reads | Connection pattern | Org context |
|---|---|---|---|
| `/admin/control-center/overview` | `core.v_clean_logs_transit`, `v_hazards_transit` | bare `pool.connect()` | **NONE** ⚠️ (would return 0 rows under non-super intelligence_reader + RLS) |
| `/admin/control-center/difficulty` | `core.v_clean_logs_transit`, `v_assignments_transit`, `v_locations_transit`, `stops` | bare `pool.connect()` + manual `set_config` | manual |
| `/admin/control-center/exceptions` | `route_run_stops`, `hazards`, `infrastructure_issues` | bare `pool.connect()` + manual `set_config` | manual |
| `/admin/control-center/routes` | `route_runs`, `route_run_stops`, `clean_logs` | `withOrgContext` | helper |
| `/admin/dashboard` | `stops`, `route_pools`, `route_runs` counts | `withOrgContext` | helper |

`/overview` having **no** org context is the sharpest gotcha: it works today only because
the connection is effectively single-org/elevated; under a non-superuser `intelligence_reader`
with RLS enforced it returns zero rows. Every repointed read must set org context via the
helper (PATTERN-001).

---

## 4. Intelligence-read inventory + the "reads-that-need-writes" finding

The dispatch expected MV reads, `v_observation_normalized` reads, and the two named services
as the primary read paths. Reality:

- **MVs are dead in code.** `stop_status_mv`, `cleanliness_risk_mv`, `infrastructure_risk_mv`,
  `level3_compliance_mv`, `safety_risk_mv` exist in schema but are **never read or refreshed**
  by any code (`grep _mv` / `REFRESH MATERIALIZED` → zero hits).
- **`v_observation_normalized` does not exist** (no definition in any migration).
- **The two named services are NOT pure reads:**
  - `riskMapService.rebuildStopRiskSnapshot` — read-write batch job: `TRUNCATE` + `INSERT …
    SELECT` over `core.observations`/`core.visits` into `stop_risk_snapshot` + a second INSERT
    into `stop_condition_history`, one transaction. Reads **no identity**. Cannot run as
    `intelligence_reader` (no INSERT/TRUNCATE grant); read and write are one statement.
    Invoked by `riskMapJob.ts` (CLI) + `POST /admin/intelligence/rebuild-risk-map`.
  - `cleanLogService.completeStop` — a **write transaction** (stop completion). Its only
    `core.observations` reads are `EXISTS(...)` subqueries embedded inside `INSERT INTO
    stop_effort_history … SELECT`. A writer, not a serving read.
- **The one pure serving read of risk** is `routeRunService.getCandidateStopsForPoolWithRisk`
  (`LEFT JOIN stop_risk_snapshot` — de-identified), but it's interleaved with route-generation
  writes via a caller-supplied client.

→ The genuinely-pure, cleanly-repointable reads are just `/overview` and `/difficulty`. This
is why D-D concluded the 018 repoint is narrow — and why ISSUE-031 (which reshapes all of
this) must come first.

---

## 5. The adapter audit (why ISSUE-018 paused) — one-paragraph recap

Full doc: `docs/audit/2026-06-06-adapter-layer-information-content-audit.md`. The founder's
hypothesis was that the transit adapter layer is operationally inert (routing/scaffolding
only). **HYPOTHESIS WRONG.** The primary log tables — `public.clean_logs` (`user_id`,
`cleaned_at`, task booleans, `duration_minutes`, `stop_id`), `public.hazards`/`infrastructure_issues`
(`reported_by`, `reported_at`), `public.level3_logs` (`user_id`), `public.stop_photos`
(`created_by_oid` plaintext), `public.route_runs`/`route_run_stops` (`assigned_user_oid`
plaintext, status, `completed_at`) — are actively dual-written with worker identity + work +
time + place, and `public.identity_directory` (OID→name+email) sits in the same slice. An
adapter-only analyst can reconstruct "Specialist X performed work W at time T on stop S" to
the named individual. Only `transit_stops` (pure reference) and the derived history tables
(`stop_effort_history`, `stop_condition_history` — no worker column) match the "inert" model.

---

## 6. Where to resume (for the future ISSUE-018 session)

1. ISSUE-031 must land first (adapter genuinely inert; views likely collapsed).
2. Then re-scope ISSUE-018 against the post-clip schema: `ALTER ROLE intelligence_reader
   LOGIN` + `INTELLIGENCE_DATABASE_URL` + second pool + `withIntelligenceConnection` helper
   (sets `app.current_org_id`) + repoint the surviving pure reads + normalize connection
   patterns (§3) + CI role fix (ISSUE-025).
3. Wire `audit_reader` (ISSUE-028) before locking down `fieldpro`'s sidecar SELECT.
4. Re-decide the PG14 view-owner question (ISSUE-029) against the post-clip view set.
5. ISSUE-027 (Key Vault) only when the Azure migration begins.

**Do not** restart 018 implementation before ISSUE-031 — the schema it targets is changing.
