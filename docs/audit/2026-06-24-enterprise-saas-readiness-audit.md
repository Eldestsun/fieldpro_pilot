# Enterprise SaaS Readiness Audit — BASELINE / FieldPro

**Date:** 2026-06-24
**Branch audited:** `refactor/role-provisioning-codify`
**Method:** Evidence-grounded. Every claim cites `file:line` or is marked "none found." Graded honestly against a **public transit agency security review**, not a generic startup checklist. Assessment only — no code changed.
**Grades:** `DONE` / `PARTIAL` / `MISSING` / `N/A`. Scaffolded-but-not-enforced = `PARTIAL`. Severity: `BLOCKER` / `IMPORTANT` / `NICE-TO-HAVE`.

---

## TL;DR

The **architecture is real and genuinely differentiated** — the labor-safety design is not vapor. The intelligence layer is structurally identity-free, the no-grant role wall exists with a build-time breach assertion, the audited decrypt path is built, and there is a test that fails loudly if clean-logs reintroduces a worker column. This is further along than most "privacy-by-architecture" claims ever get.

But the guarantee is **provable on paper, not yet provable on a running system.** Four concrete gaps break the end-to-end seal, and they are exactly the things a union rep or an agency security reviewer would find first:

1. The app connects to Postgres as a **superuser** on the default deploy → RLS (tenant isolation **and** the identity wall) is **not enforced at all**, and the policies are **fail-open** when org context is missing.
2. **Unauthenticated endpoints ship in production**, including one (`GET /route-runs/:id`) that returns a named worker's OID, and one (`/dev/generate-route-run`) that writes the live DB.
3. **Production OID-at-rest encryption is a throwing stub** — the Azure Key Vault adapter is `throw "not implemented"`.
4. **No backup/recovery** for the canonical state, on an ephemeral free-tier DB.

None are deep architectural problems. All four are "wire up what's already designed" work. But until they close, the founder cannot stand in front of the union and *prove* the guarantee on a live box — which is the whole sale.

---

## Differentiator Integrity Verdict

> **Does the code actually deliver the worker-identity-protection guarantee it claims, or is that still aspirational?**

**Mostly real, not yet sealed.** The guarantee is delivered *by design and at the schema layer*, and it is *testable* — but it is **not yet binding end-to-end on a running production system.**

**What is genuinely true (the moat is real):**
- The intelligence tables (`stop_effort_history`, `stop_condition_history`, `stop_risk_snapshot`) and all 5 risk MVs have **no `user_id`/`oid` column and no identity join** — verified column-by-column (`backend/migrations/00000000_consolidated_schema.sql:1287,1943,1982`; `riskMapService.ts` whole file). A SQL query against the intelligence layer *cannot* produce a per-worker profile.
- A **no-grant `intelligence_reader` role** exists, is `REVOKE`d on every identity sidecar, and a migration **`RAISE`s and fails the build** if any sidecar grant ever appears (`backend/migrations/20260530_sidecar_extraction_a_additive.sql:206-290`). This is a structural guarantee with a tripwire — excellent.
- The OID decrypt path is **mandatorily audited** (`admin.oid_decrypt` on every call, `oidCipher.ts:337-344`), Admin-gated, and there is exactly **one** documented `identity_directory` JOIN in the whole codebase (`loadRouteRunById.ts:70-78`), fenced and RLS-scoped so it fails closed cross-tenant.
- A test **fails loudly** if the clean-logs surface reintroduces identity (`backend/tests/canonical/cleanLogsIdentity.test.ts:104-140` asserts no `user_id`/`worker_id`/`employee_id` and no `clean_logs` join).

**What breaks the seal (must close before the claim is honest on a live system):**
- **LEAK — unauthenticated identity exposure.** `GET /api/route-runs/:id` (`routeRunRoutes.ts:703`) has **no `requireAuth`**, and `resolveNumericOrgId` falls back to org #1 for anonymous callers. It returns `assigned_user.{oid, display_name, role}` + `created_by.{oid, display_name}` (`loadRouteRunById.ts:140-148`). This is a direct worker-identity leak to an open endpoint. The authenticated twin (`/lead/route-runs/:id`, lines 188/214) is correctly gated — this transitional route just needs the same guard or removal.
- **NOT YET BINDING — the role wall isn't exercised.** The schema *can* enforce the no-grant wall, but the running app connects as `fieldpro` (`db.ts:9`), which holds broad grants and is **superuser on the default deploy** (below). So the structural seal lives in DDL but the app never passes through `intelligence_reader`. This is the tracked ISSUE-018/ISSUE-025 wiring gap. Until the app connects through a restricted role, the wall is real in the schema and theoretical at runtime.
- **NON-FUNCTIONAL — prod at-rest encryption.** `captured_by_oid` is meant to be envelope-encrypted, but in `NODE_ENV=production` the adapter is `AzureKeyVaultAdapter`, whose `wrapDek`/`unwrapDek` **throw "not implemented"** (`oidCipher.ts:181-195,201-202`). The encrypted-identity-at-rest protection does not operate in production.
- **UNPROVABLE — RLS off by default.** Because the app role is superuser on a fresh `docker-compose up`, RLS is bypassed entirely; and the policies are written fail-open (pass-all when org context is unset). So on a clean build, neither tenant isolation nor the identity wall is actually enforced — and "unprovable" is the worst possible state for the one guarantee the union must trust.

**Bottom line:** The founder built the hard part — a structurally identity-free intelligence layer with a tripwire and a test. That is the credible, defensible core. But three wiring gaps and one open endpoint mean a security reviewer who actually probes a running instance would find worker OIDs and a disabled RLS layer. The guarantee is ~70% delivered: the architecture is sound, the enforcement is not yet switched on. This is fixable in days, not months — but it is not done.

---

## Domain Scorecards

### DOMAIN 1 — Identity, authentication, access

| Item | Status | Severity | Evidence / Gap |
|---|---|---|---|
| Worker-identity non-surfacing — intelligence layer | **DONE** | — | No identity column/join in `stop_effort_history`/`stop_condition_history`/`stop_risk_snapshot`/MVs (`00000000_consolidated_schema.sql:1287,1943,1982`; `riskMapService.ts`). Tables carry "worker-safe by structure" comments. |
| Worker-identity non-surfacing — logs | **DONE** | — | No `console.*`/logger emits identity values (swept `backend/src`). |
| Worker-identity non-surfacing — UI | **DONE** | — | No operational dashboard renders worker identity; only the gated assignment dropdown (`RouteCreatePanel.tsx:69`) and the user's own MSAL OID. |
| Worker-identity non-surfacing — exports | **DONE (by design)** | — | Exports include `actor_oid` but the routers are Admin-gated + audited (`exportDeleteRoutes.ts:15-19`); `sftpExport.ts` is the sanctioned IT chain. EAM bridge explicitly strips identity (`populateEamBridge.ts:9`). |
| **Worker-identity non-surfacing — API responses** | **PARTIAL (LEAK)** | **BLOCKER** | `GET /route-runs/:id` unauthenticated, returns worker OID+name+role with org fallback (`routeRunRoutes.ts:698-720`, `loadRouteRunById.ts:140-148`). |
| No-grant intelligence role (structural wall) | **PARTIAL** | **BLOCKER** | Role + REVOKE + build-time RAISE exist (`20260530_sidecar_extraction_a_additive.sql:206-290`) but app connects as `fieldpro`, not `intelligence_reader` (`db.ts:9`). Not binding at runtime (ISSUE-018). |
| Audit chain integrity (identity → IT, logged, tamper-resistant) | **DONE** | — | `identity_directory` FORCE-RLS; mandatory `admin.oid_decrypt` audit (`oidCipher.ts:337`); Admin-gated audit-log read self-logs (`adminRoutes.ts:786,870`). |
| Authentication (real, enterprise SSO path) | **DONE** | — | Real Entra/MSAL, JWKS RS256, explicit `aud`/`iss`/`oid` claim assertion (`authz.ts:142-234`). OIDC today; SAML would be a new path but the IdP-federation model is already enterprise-correct. |
| RBAC enforced server-side | **PARTIAL** | **IMPORTANT** | `requireAnyRole` enforced router-wide on admin/ops/tenant/export (`authz.ts:237`; `adminRoutes.ts:19`, etc.) — genuinely server-side. But 4 endpoints bypass it (see Domain 3 item 4). |
| Session management (expiry/refresh/revocation) | **PARTIAL** | **IMPORTANT** | Token expiry validated (`authz.ts:194` clockTolerance). Refresh/silent flow handled by MSAL client-side. **No server-side session revocation / "kill this session"** — bearer JWTs are valid until expiry; no deny-list. |

### DOMAIN 2 — Data architecture & tenancy

| Item | Status | Severity | Evidence / Gap |
|---|---|---|---|
| Multi-tenancy model documented | **DONE** | — | Pooled (shared schema, single DB), org-isolated via Postgres RLS on `org_id`. 37 FORCE-RLS tables, 38 policies (`pg_state.sql:4213-4760`); per-request `withOrgContext` (`db.ts:18-39`, `resolveOrgId.ts:14-24`). |
| **Tenant isolation actually enforced** | **PARTIAL** | **BLOCKER** | (a) Policies **fail-open**: `COALESCE(current_setting('app.current_org_id',true),'')='' OR org_id=…` opens ALL rows when context unset (`pg_state.sql:4213` ×38). (b) Bare `pool.query()` on FORCE-RLS tables with no org context (`stopRoutes.ts:87,182,277`; `ulRoutes.ts:124`; `auditLog.ts:31`). (c) App role is **superuser on default deploy** → RLS bypassed (`docker-compose.yml:9`; mitigated only by an out-of-band bootstrap in `20260624_role_provisioning_codify.sql:31-40` not wired into compose). |
| Canonical state layer is the single source of truth | **PARTIAL** | **IMPORTANT** | `core.*` is the documented SoR and canonical writers exist, but evidence never reaches `core.evidence` (§5.6), `washed_can`/outcome/assignment_id/reason_code unpopulated (§5.1-5.3), observations emitted **post-commit on a separate connection** with no retry (§5.7, `cleanLogService.ts:169`→`observationService.ts:117`). Several state facts still live only in transit tables. (`current_state.md:36-90`) |
| Transit adapter boundary clean (portable to 2nd vertical) | **PARTIAL** | **IMPORTANT** | Transit bleeds into core services: `visitService.ts:40-42,75` filters `source_system='route_runs'`, API is `ensureVisitForRouteRunStop()`, joins `core.v_locations_transit` (transit-named view inside `core`). Grant boundary is clean (`transit` schema USAGE to `fieldpro` only) but service code still speaks transit. A 2nd adapter needs core edits today. |
| Data-model documentation for a security reviewer | **PARTIAL** | **IMPORTANT** | Strong design prose (`CANONICAL_STATE_LAYER_DESIGN.md`, `ADAPTER_BOUNDARY.md`, `pg_state.sql` with COMMENTs) but **no ERD, no column-level data dictionary / PII classification, no consolidated data-flow diagram** — exactly what an agency reviewer expects. |

### DOMAIN 3 — Security posture

| Item | Status | Severity | Evidence / Gap |
|---|---|---|---|
| Secrets management | **PARTIAL** | **IMPORTANT** | No real prod secret committed (tracked env files are templates: `backend/.env.ci`, `*.env.example`). But weak dev passwords ship in a `NODE_ENV=production` compose (`docker-compose.yml:10,24,96`) and app code falls back to `?? "fieldpro_pass"` (`db.ts:9`) instead of failing closed. No committed lockfile (gitignored) → non-reproducible dependency tree. |
| Input validation | **PARTIAL** | **IMPORTANT** | No schema-validation library (no zod/joi); hand-rolled per handler, inconsistent. `express.json()` has no body-size limit (`app.ts:31`). |
| SQL injection | **DONE** | — | Queries parameterized throughout; the one dynamic `${where}` is built from hardcoded fragments with bound values (`adminRoutes.ts:831-853`). No vector found. |
| Upload validation | **DONE** | — | Magic-byte sniffing, allowlist, path-traversal block, size cap (`uploadValidation.ts:3-75`). |
| Transport encryption (TLS/HSTS/helmet) | **MISSING** | **IMPORTANT** | No `helmet`, HSTS, HTTPS redirect, or `trust proxy` anywhere (repo-wide zero hits). TLS entirely delegated to Render edge. |
| At-rest encryption (identity records) | **PARTIAL (prod stub)** | **BLOCKER** | Envelope AES-256-GCM design is sound, but prod adapter throws "not implemented" (`oidCipher.ts:181-195,201`). Non-functional in production. |
| **Authorization on every endpoint** | **PARTIAL** | **BLOCKER** | 63-route table compiled. 4 unauthenticated: `POST /dev/generate-route-run` (no auth, **no env gate, writes live DB**, `devRoutes.ts:163` + unconditionally mounted `app.ts:45`); `GET /route-runs/:id` (`:703`, identity leak); `POST /routes/plan` (`:289`); `POST /route-runs/preview` (`:402`). Public-by-design: `/health`, `/openapi.json`. |
| Audit logging (security events) | **DONE** | **IMPORTANT (caveat)** | Logins, dev-bypass, OID-decrypt, audit-reads, exports logged. Append-only by structure (FORCE RLS + **no UPDATE policy**, `20260518_rls_phase3_structural_fixes.sql:53-75`). Caveats: audit writes are fire-and-forget so a *failure* is silent; DELETE allowed only inside the export-and-delete flow; fail-open SELECT branch when org context unset. |
| Security headers / rate limiting / CORS | **MISSING** | **IMPORTANT** | No helmet, no rate limiting. CORS `origin:true` + `credentials:true` (reflect-any-origin) — code comment itself says replace for prod (`app.ts:23-30`). |
| Dependency vulnerability scan | **PARTIAL** | **IMPORTANT** | No committed lockfile → cannot run a deterministic local SCA. CI gates `pnpm audit --audit-level=high` (`ci.yml:139,147`) and a prior report exists (`docs/security/dependency-audit-2026-05-13.md`), but the repo can't reproduce a pinned tree. |

### DOMAIN 4 — Compliance readiness (gap-to-certifiable, not certifying)

| Item | Status | Severity | Evidence / Gap |
|---|---|---|---|
| SOC 2 — access controls | **PARTIAL** | **IMPORTANT** | RBAC + RLS designed but not enforced on default deploy (Domain 2). |
| SOC 2 — audit logging | **DONE** | — | Append-only audit trail (Domain 3). Strong SOC 2 evidence source. |
| SOC 2 — encryption | **PARTIAL** | **BLOCKER** | At-rest identity encryption is a prod stub; no app-emitted TLS posture (Domain 3). |
| SOC 2 — change management evidence | **PARTIAL** | **NICE-TO-HAVE** | Migration ledger + changelog discipline + CI exist; no formal change-approval records. |
| Data retention & deletion | **DONE** | — | Export-and-delete flow with audited erasure (`exportDeleteRoutes.ts`); GDPR/records-request-shaped. |
| Public-sector specifics (FOIA, 508, retention) | **PARTIAL (research)** | **IMPORTANT** | Section 508: frontend has axe a11y audits (`frontend/.axe-audit-results`, e2e a11y specs) — partial. FOIA/records-retention implications of stored field data = **founder research item**, not resolvable in-repo. |

### DOMAIN 5 — Reliability & operations

| Item | Status | Severity | Evidence / Gap |
|---|---|---|---|
| Observability | **MISSING** | **IMPORTANT** | No structured logging/metrics/error-tracking; 120 raw `console.*`. `/health` is liveness-only — never touches DB/S3/OSRM (`healthRoutes.ts:30-32`), yet wired to Render health check. Blind in prod. |
| Global error handling | **MISSING** | **IMPORTANT** | No 4-arg Express error handler in `app.ts`; no `process.on('unhandledRejection'/'uncaughtException')`; no `pool.on('error')`. Some handlers return `err.message` to client (`resourceRoutes.ts:81-85`) — internal-detail leak. |
| Identity fails closed (not open) | **DONE** | — | Read path RLS-gated → cross-tenant returns `null`, never the foreign row (`loadRouteRunById.ts:111-119`); cache miss → null display name, never wrong identity. Fail-closed confirmed. |
| Backups & recovery | **MISSING** | **BLOCKER** | No backup/restore anywhere (`ops/`, `docs/ops/`, `render.yaml` swept). Prod DB on free-tier with 90-day expiry + no automated backups (`render.yaml:54-58`). No RPO/RTO. For "the canonical state layer," there is no recovery path. |
| Deployment & rollback | **PARTIAL** | **IMPORTANT** | Reproducible build: Dockerfiles + compose + render + CI exist. Migration runner is ordered + ledger-idempotent + atomic-on-failure (`migrate.ts:48,88-127`) but **forward-only** — rollback SQL for only 13/83 migrations, never invoked; deploy-staging is a stub. No release-rollback runbook. |
| Test coverage | **PARTIAL** | **IMPORTANT** | 20 backend canonical integration tests (real DB) + frontend vitest/Playwright/axe. **Identity guard exists** (`cleanLogsIdentity.test.ts`) — but only static, only clean-logs. No runtime "no `oid` in any dashboard/export response" assertion; no schema test that effort-history has no `user_id`. |

### DOMAIN 6 — Scale & performance *(lowest priority — single-agency pilot is not a scale test)*

| Item | Status | Severity | Evidence / Gap |
|---|---|---|---|
| Known bottlenecks | **PARTIAL** | **NICE-TO-HAVE** | Intelligence reads via materialized views (good); rebuild is admin-triggered (`adminRoutes.ts:948`). RLS adds per-query overhead. No load testing. No obvious unbounded N+1 surfaced, but not profiled. |
| Load assumptions | **PARTIAL** | **NICE-TO-HAVE** | Single DB, single OSRM, free-tier sizing. Implicitly single-agency scale. Fine for pilot; revisit before multi-agency. |

### DOMAIN 7 — Pilot-deployment readiness ("If a King County pilot started Monday, what breaks?")

| Item | Status | Severity | Evidence / Gap |
|---|---|---|---|
| Demo-to-production gap (Control Center + finish/stop flow) | **DONE (functionally)** | — | Control Center is real and end-to-end: `/admin/control-center/{overview,routes,exceptions,difficulty}` all Admin-gated (`adminRoutes.ts:1016-1378`), `AdminControlCenter.tsx` renders it, finish flow exists (`/route-runs/:id/finish`, `routeRunRoutes.ts:938`). The old "no working control center" gap is closed. |
| Operational data integrity on day one | **PARTIAL** | **IMPORTANT** | Canonical layer incomplete (evidence not in `core.evidence`, non-atomic observation emission) — risk maps/history may under-populate. |
| Single points of failure | **PARTIAL** | **IMPORTANT** | DB (no backup), OSRM (routing fails → degraded), S3/MinIO (photo path). No circuit breakers. A DB blip is invisible (liveness-only health). |
| "Leave my job" go/no-go threshold | **NOT MET** | **BLOCKER** | See go/no-go list below. |

---

## Blocker List (dependency order — fix top-down)

1. **Run the app as a non-superuser DB role with RLS enforced, and make policies fail-closed.**
   *Foundation. The identity wall, tenant isolation, and the no-grant role all rest on this.* Today: superuser on default deploy (`docker-compose.yml:9`) + fail-open policies (`pg_state.sql:4213`). Until this is true, nothing below is provable.
   → Wire the bootstrap from `20260624_role_provisioning_codify.sql` into the deploy; flip policy `OR`-open branches to fail-closed (or guarantee org context on every connection).

2. **Close the 4 unauthenticated endpoints.** `GET /route-runs/:id` (identity leak), `POST /dev/generate-route-run` (live DB write — also stop mounting `devRoutes` unconditionally, `app.ts:45`), `POST /routes/plan`, `POST /route-runs/preview`. The first is also the Domain-1 identity leak.

3. **Implement (or prove) production OID-at-rest encryption.** Replace the throwing `AzureKeyVaultAdapter` (`oidCipher.ts:181-195`) or gate prod boot so it cannot run with a non-functional cipher.

4. **Wire the app to connect through `intelligence_reader` for intelligence reads** (depends on #1). Makes the structural wall binding at runtime, not just in DDL (ISSUE-018).

5. **Backups + restore for the canonical DB** (depends on leaving free tier). Define RPO/RTO; test a restore. Move off 90-day-expiry free Postgres.

6. **Harden the HTTP edge:** helmet + HSTS, lock CORS to an allow-list, add rate limiting on the (now-authenticated) compute endpoints, add a global error handler that stops leaking `err.message`.

*Not blockers but on the same pass: observability (structured logs + real `/health`), runtime identity-leak test across dashboard/export responses + schema test on effort-history, ERD/data-dictionary for the security packet.*

---

## Prioritized Punch List (always do the top item next)

**Phase A — Make the guarantee true on a running box (the sale + the ethics):**
1. Switch the app's DB connection to a non-superuser role; confirm RLS is enforced (write a test that a missing-org-context query returns 0 rows, not all rows).
2. Flip RLS policies fail-open → fail-closed; eliminate bare `pool.query()` on FORCE-RLS tables or wrap in `withOrgContext`.
3. Add `requireAuth`/`requireAnyRole` to `GET /route-runs/:id`, `/routes/plan`, `/route-runs/preview`; env-gate or delete `/dev/generate-route-run` and stop mounting `devRoutes` in prod.
4. Add a runtime test that asserts **no `oid`/`user_id` appears in any Control Center or export API response**, and a schema test that `stop_effort_history`/`stop_condition_history` have no identity column. (Highest-value test in the repo — it turns the guarantee into a regression gate.)
5. Implement the Azure Key Vault cipher adapter, or fail-closed boot if it's absent in prod.
6. Wire intelligence reads through `intelligence_reader`.

**Phase B — Survive the security review:**
7. helmet + HSTS; CORS allow-list; rate limiting; global error handler (no `err.message` to clients).
8. Backups + tested restore; leave free-tier Postgres; define RPO/RTO.
9. Remove weak password fallbacks / dev creds from any `production` path; commit a lockfile for reproducible SCA.
10. Structured logging + real dependency-checking `/health`.

**Phase C — Make it legible to a buyer:**
11. ERD + column-level data dictionary with PII classification + a data-flow diagram showing the RLS/sidecar boundaries. (This is the artifact that lets a reviewer *see* the labor-safety architecture.)
12. Finish canonical completeness (evidence → `core.evidence`, atomic observation emission) so risk maps populate cleanly from day one.
13. Section 508 sign-off; FOIA/records-retention research (founder).

---

## "Leave my job" go/no-go list (minimum `DONE`, not `PARTIAL`)

Before staking employment on a deployment, **all** of these must be `DONE`:

- [ ] App runs as non-superuser; RLS enforced and **fail-closed** (Blocker 1) — *tenant isolation and the identity wall are real.*
- [ ] All 4 unauthenticated endpoints closed (Blocker 2) — *no worker OID reachable without auth.*
- [ ] Runtime identity-leak test green across dashboards + exports (Punch 4) — *the guarantee is a regression gate, not a promise.*
- [ ] Production OID encryption functional or fail-closed (Blocker 3).
- [ ] Backups configured + one successful restore drill (Blocker 5).
- [ ] Edge hardened: helmet/HSTS, CORS allow-list, global error handler (Blocker 6).

The Control Center, auth, audit trail, and the structural intelligence-layer design are already there. The remaining work is **switching on enforcement and proving it** — bounded, days-to-weeks, not a rebuild.
