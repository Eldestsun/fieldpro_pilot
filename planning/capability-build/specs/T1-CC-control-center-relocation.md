# T1-CC — Control Center Relocation (Admin → Dispatch)

| Field | Value |
|-------|-------|
| ID | T1-CC |
| Capability | Relocate Control Center from Admin to Dispatch; collapse D-1 into the relocated CC |
| Surface | Cross (Admin loses, Dispatch gains) |
| Tier | 1 |
| Type | Code (frontend + backend) |
| Depends on | Role rename complete in code |
| Blocks | Dispatch surface demo story |
| Status | 🔴 Not started |
| Last updated | 2026-05-19 |

---

## Purpose

Control Center is the operational live-view of the day's runs, exceptions,
and difficulty. It is operational leadership work — it belongs on the
Dispatch surface, not Admin. The audit confirms it is gated Admin-only purely
as a historical policy choice, not because of any capability gap. Moving it
also collapses the audit's D-1 (live route monitoring) into one cohesive
Dispatch view: the relocated CC is the live monitoring surface, and
`LeadRouteDetail.tsx` (the existing drill-down) remains reachable from a CC
route card.

Users: Dispatch role (operational supervisors). Admin role loses access on
deploy — see Migration section below.

---

## Context

### What exists (verified)

- **Frontend route guard**: `frontend/src/App.tsx:262–264` registers
  `/admin/control-center` under `<RequireRole roles={["Admin"]}>`.
- **Frontend nav**: `App.tsx:133` (desktop) + `App.tsx:223` (mobile) — both
  inside the `isAdmin` block. There is no Dispatch (Lead) entry for CC.
- **Component**: `frontend/src/components/admin/AdminControlCenter.tsx`
  (483 lines, 30 s polling, 4-panel layout). Fully functional.
- **Backend ccRouter**: declared at
  `backend/src/modules/admin/adminRoutes.ts:992–993`, gated `requireAuth +
  requireAdmin`. Endpoints: `GET /overview` (line 1030), `GET /routes`
  (1128), `GET /exceptions` (1262), `GET /difficulty` (1372). Mounted at
  `/admin/control-center` (line 1497). Note that the parent guard at
  `adminRoutes.ts:18` already enforces Admin on the whole `/admin/*` tree —
  the `ccRouter.use(requireAdmin)` is redundant.
- **D-1 components**: `frontend/src/components/LeadRoutesPanel.tsx` (route
  list, opens detail) and `LeadRouteDetail.tsx` (stop list). Both mounted at
  `/routes` and `/routes/:routeRunId` under `RequireRole={["Lead", "Admin"]}`
  (`App.tsx:247–252`). These remain — `LeadRouteDetail` is the drill-down
  target from the relocated CC.

### Audit claims verified vs. corrected

- Audit cites `App.tsx:262` for the RequireRole — confirmed (route literally
  at line 262).
- Audit cites `adminRoutes.ts:984` for `ccRouter.use(requireAuth,
  requireAdmin)` — actual line is 993. Updated.
- Audit describes CC as gated "in two places" — technically gated in three:
  parent `/admin` middleware (line 18), explicit `ccRouter.use(requireAdmin)`
  (line 993), and the frontend route guard. The parent middleware is the
  binding one — moving the router out of `/admin/*` is what changes
  authorization.

---

## What to Build

Implementation order:

### 1. Backend — Endpoint relocation (decision: mirrored mount)

**Decision:** Add mirrored `/api/ops/control-center/*` mount, **not** widen
the existing Admin endpoints to include Dispatch.

**Rationale (tradeoff):**
- Widening the existing Admin endpoint to `["Lead", "Admin"]` is one-line
  smaller but couples the Admin and Dispatch authz models. Future Admin-only
  CC variants (e.g. cross-org rollup view) become impossible without forking.
- Mirrored mount keeps `/ops/*` as the canonical Dispatch namespace
  (consistent with `/ops/dashboard`, `/ops/pools`, `/ops/stops` at
  `App.tsx:265–273`) and leaves `/admin/control-center` removable in a
  follow-up cleanup once Admin demos confirm parity. The cost is one extra
  `adminRoutes.use(...)` line plus four lines exposing the same handlers.
- The ccRouter handler functions stay where they are; only the mount changes.

**Change**: in `adminRoutes.ts`:
- Replace `adminRoutes.use("/admin/control-center", ccRouter);` (line 1497)
  with a mount that goes through `/ops`. Because `adminRoutes` itself only
  hosts `/admin/*` paths, the cleanest move is to either (a) export the
  ccRouter from a new file and mount it on the `opsRoutes` router under
  `/ops/control-center`, or (b) mount it at the app level. **Prefer (a)**:
  extract ccRouter into `backend/src/modules/ops/controlCenterRoutes.ts`,
  mount it on `opsRoutes` with `requireAnyRole(["Lead", "Admin"])`.
- The extracted router uses `requireAuth + requireAnyRole(["Lead", "Admin"])`
  guards.
- Remove the Admin-only mount (`adminRoutes.use("/admin/control-center",
  ccRouter)` at line 1497) entirely. The path `/api/admin/control-center/*`
  goes away. Frontend updates in step 2 follow.

### 2. Frontend — Component relocation + API rewrite

- Move `frontend/src/components/admin/AdminControlCenter.tsx` →
  `frontend/src/components/ops/ControlCenter.tsx`. Rename exported component
  from `AdminControlCenter` to `ControlCenter`. Update imports in
  `App.tsx:18, 33`.
- Update API calls inside the component from
  `/api/admin/control-center/*` to `/api/ops/control-center/*`.
- In `App.tsx`:
  - Remove the `/admin/control-center` route (lines 262–264).
  - Add a new route `/ops/control-center` gated
    `<RequireRole roles={["Lead", "Admin"]}>` (mirroring the other `/ops/*`
    routes — Admin retains the route only for verification/spot-check
    purposes; Admin's primary nav no longer links to it).
- Drill-down: CC's existing "routes" panel renders route cards. Add an
  `onClick` to each card that navigates to `/routes/:routeRunId` — the
  existing `LeadRouteDetailRoute` (`App.tsx:250–252`) handles that path
  for both Lead and Admin. This is the D-1 collapse: the route list and
  drill-down both reach `LeadRouteDetail` from one entry point.

### 3. Nav restructure

In `App.tsx`:
- **Remove** the `/admin/control-center` `NavLink` from the `isAdmin` desktop
  block (line 133) and mobile block (line 223).
- **Add** a "Control Center" `NavLink` to the Dispatch (`isLead && !isAdmin`)
  block — desktop (~line 120) and mobile (~line 210). Pointing at
  `/ops/control-center`.
- **Dispatch default landing**: `DefaultRedirect` (`App.tsx:36–42`) currently
  sends Lead users to `/routes`. Leave that for the role rename workstream
  to decide. This spec does not change the default; CC is added as a nav
  entry alongside `/routes`. (See open question 1 in the index report.)

### 4. RBAC / auth

- New canonical Dispatch CC endpoints: `requireAuth +
  requireAnyRole(["Lead", "Admin"])`.
- Old Admin CC endpoints removed; the dropped Admin-only `/api/admin/
  control-center/*` paths return 404 after deploy.
- Frontend route guard: `<RequireRole roles={["Lead", "Admin"]}>`.

### 5. Audit logging

No new audit actions required. The CC endpoints are read-only aggregates and
were not audit-logged in the Admin version. Adding audit on a read-only
operational live-view would generate high-volume noise without a security
benefit; explicitly deferred.

### 6. Cleanup audit of Admin nav

After CC is removed, the Admin desktop nav has: Dashboard, Pools, Stops.
After T1-A5 lands, also: Audit Log. After T1-A6 lands, also: Export & Delete.
After T3-A3 lands, also: Users. No other items removed.

### 7. Migration concern (deploy hazard)

**Policy decision (2026-05-19): Path A — CC is Dispatch-only.** No
dual-role workaround in code. Admins do not see CC by default.

Admin users currently using CC lose the path entirely on deploy. Any
individual who needs continued operational live-view access must be
granted the Dispatch role in Entra in addition to Admin.

- **Founder pre-deploy to-do (blocking)**: identify the specific Admin
  accounts that need Dispatch role in Entra and assign before T1-CC
  ships. This is an Entra config task, not a code task.
- Document in changelog. Surface in release notes for the pilot.

---

## Data Model

No schema changes.

---

## API Contracts

### Removed

- `GET /api/admin/control-center/overview`
- `GET /api/admin/control-center/routes`
- `GET /api/admin/control-center/exceptions`
- `GET /api/admin/control-center/difficulty`

### Added (same shapes, new path)

- `GET /api/ops/control-center/overview` → `Lead + Admin`
- `GET /api/ops/control-center/routes` → `Lead + Admin`
- `GET /api/ops/control-center/exceptions` → `Lead + Admin`
- `GET /api/ops/control-center/difficulty` → `Lead + Admin`

Request and response shapes identical to the existing endpoints. OpenAPI
annotations move with the router.

---

## Labor Safety Constraint

The Control Center panels must not display worker identity. Current panels
display: pool, route ID, status, stop counts, hazard counts, severity
counts, difficulty aggregates. These are role-anonymous and remain so.
This spec is a relocation, not a content expansion — no new fields are
added.

If the relocated CC is later extended to include `assigned_user_oid` or any
worker identifier, that is a separate spec and would be blocked by the
labor safety guardrail in `CLAUDE.md`.

---

## Tests Required

- Backend: existing CC handler unit/integration tests run unchanged against
  the new `/ops/control-center/*` mount. Add an authz test confirming
  Dispatch (Lead) token receives 200 and Specialist (UL) token receives 403.
- Frontend: smoke test that Dispatch user sees the CC nav link and reaches
  the page; Admin user does **not** see the link in the Admin nav block;
  Specialist user is bounced by `RequireRole`.
- Drill-down: click a route card on the CC routes panel → navigate to
  `/routes/:routeRunId`. Component renders.

---

## Done Criteria

- [ ] ccRouter extracted to `backend/src/modules/ops/controlCenterRoutes.ts`
- [ ] New router gated `requireAuth + requireAnyRole(["Lead", "Admin"])`
- [ ] Old Admin-only mount removed from `adminRoutes.ts:1497`
- [ ] OpenAPI spec regenerated; old `/admin/control-center/*` paths gone
- [ ] Component moved to `frontend/src/components/ops/ControlCenter.tsx`
- [ ] All API calls in the component updated to `/api/ops/control-center/*`
- [ ] Route `/ops/control-center` registered with `RequireRole={["Lead",
      "Admin"]}`
- [ ] `/admin/control-center` route removed from `App.tsx`
- [ ] Admin nav: Control Center entry removed (desktop + mobile)
- [ ] Dispatch nav: Control Center entry added (desktop + mobile)
- [ ] Route card click on CC navigates to `/routes/:routeRunId`
- [ ] Authz tests pass: Lead 200, UL 403
- [ ] Frontend smoke tests pass for nav visibility per role
- [ ] Release note added flagging Admin loses CC nav; founder confirmed
      pilot admins hold Dispatch role if they need CC
- [ ] Changelog entry written

---

## Out of Scope

- D-1 polling enhancements on `LeadRoutesPanel` (route list) — those are
  superseded by the relocated CC which already polls at 30 s. The
  `/routes` list remains for direct drill-down but is no longer the
  primary live-view.
- Adding worker-identity fields to any CC panel
- Changing `DefaultRedirect` landing — separate decision
- Cross-org Admin CC variants — would require separate Admin-only mount

---

## Dependencies and Sequencing

- **Hard dependency**: role rename workstream complete. RBAC strings,
  nav labels, and the Entra role assignments referenced in §7 all use
  the new role names. T1-CC does not ship before the rename.
- Independent of T1-A5, T1-A6, T1-D4 (those three may ship in parallel
  with the rename; T1-CC may not).
- Unblocks: T2-D5 stop history view, which is reached from `LeadRouteDetail`
  and benefits from CC → detail being a single coherent flow.
