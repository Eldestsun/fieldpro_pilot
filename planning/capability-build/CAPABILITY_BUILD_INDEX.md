# BASELINE Capability Build — Index

> Orchestration layer for the Dispatch and Admin capability builds following the role rename.
> Based on: `planning/DISPATCH_ADMIN_CAPABILITY_AUDIT.md` (2026-05-18)
> Prerequisite: Refactor (Tiers 1–8), Refinement (R1–R10), and Security Sprints 1+2 complete or stable.
> Last updated: 2026-05-19

---

## What This Track Is

The Refactor, Refinement, and Security tracks brought BASELINE to a functionally
complete, production-grade, procurement-compliant baseline. This track builds the
**capability surface** that pilot stakeholders interact with: the Dispatch and
Admin views that supervise field operations and govern the system.

It is scoped to existing surfaces. It does not introduce a new domain layer or
new sources of truth. Every capability here either (a) wires up an existing
backend endpoint to a missing UI, (b) closes a gap inside an existing panel, or
(c) relocates an existing capability to the correct operational surface.

The role rename is its own workstream and **lands first**. Some Tier 1 items
(T1-A5, T1-A6, T1-D4) and one Tier 2 item (T2-A2) carry no role-name strings
in user-facing copy and may ship in parallel with the rename. The rest
(T1-CC, T2-A7, T3-D3, T3-A3) have hard dependencies on the rename — see the
Tier Map. These specs use the new names (Specialist, Dispatch, Admin) for
clarity throughout — implementing renames inside this track is out of scope.

**Changelog directory** for this workstream:
`docs/changelog/capability-build/YYYY-MM-DD-{slug}.md`. Every spec lists a
changelog entry under its Done Criteria.

---

## Role Rename (locked)

| Old name | New name | Notes |
|----------|----------|-------|
| UL | Specialist | Field worker surface (no change here) |
| Lead | Dispatch | Operational leadership surface — gains Control Center |
| Admin | Admin | Governance surface — loses Control Center |

---

## Locked Architectural Decisions

1. **Control Center relocates from Admin to Dispatch.** Operational live-views
   belong to operational leadership. Admin loses the Control Center entirely.
   The audit's D-1 (live route monitoring) is collapsed INTO the relocated
   Control Center. The drill-down from a CC route card to `LeadRouteDetail`
   must be preserved. See `specs/T1-CC-control-center-relocation.md`.

2. **A-3 (user/role management) is reframed as a read-only user directory.**
   Azure Entra is the source of truth for role assignments. The app shows the
   users present in `identity_directory`, the role last reported by Entra, and
   last-seen timestamp. No role-write endpoint is built. See
   `specs/T3-A3-user-directory-readonly.md`.

3. **TPRA-blocking items jump the queue.** `A-5` (audit log viewer) and `A-6`
   (export-and-delete UI) are referenced in S2 policy documents as functioning
   controls. They lead Tier 1 so the policy documents stop overstating the
   demo-ready surface.

4. **Tier 4 items are explicitly post-pilot.** `A-4` route templates and the
   add/remove-live-stops portion of `D-4` are deferred. No specs are written
   for these in this track.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 Not started | No work begun |
| 🟡 In progress | Active development |
| 🟠 In review | Written, verification pending |
| 🟢 Done | All done-criteria verified |
| ⛔ Blocked / Deferred | Hard dependency unmet, or post-pilot scope |

---

## Tier Map

| ID | Capability | Surface | Type | Owner | Depends on | Status |
|----|-----------|---------|------|-------|------------|--------|
| **Tier 1 — TPRA-blocking + foundational** | | | | | | |
| T1-A5 | Audit log viewer UI | Admin | Code | Agent | S1-1, S1-3 (done) — parallel with rename | 🔴 Not started |
| T1-CC | Control Center relocation (Admin → Dispatch) | Cross (Admin/Dispatch) | Code | Agent | Role rename complete | 🔴 Not started |
| T1-A6 | Export-and-delete UI | Admin | Code | Agent | S1-4 (done) — parallel with rename | 🔴 Not started |
| T1-D4 | Reassign UI on live route runs | Dispatch | Code | Agent | API complete — parallel with rename | 🔴 Not started |
| **Tier 2 — High demo value, bounded scope** | | | | | | |
| T2-D5 | Stop-level history view | Dispatch | Code | Agent | None — pairs with T1-CC drill-down | 🔴 Not started |
| T2-A2 | Retire stop button | Admin | Code | Agent | API complete — parallel with rename | 🔴 Not started |
| T2-A7 | System health page | Admin | Code | Agent | Role rename complete | 🔴 Not started |
| **Tier 3 — Requires design conversation before build** | | | | | | |
| T3-D3 | Ad-hoc route creation | Dispatch | Code + migration | Agent | Role rename complete | 🔴 Not started |
| T3-A3 | User directory (read-only) | Admin | Code | Agent | Role rename complete | 🔴 Not started |
| **Tier 4 — Deferred post-pilot (no spec)** | | | | | | |
| A-4 | Route templates / schedules | Admin | — | — | New schema + cron | ⛔ Deferred post-pilot |
| D-4-add | Add/remove live stops on running runs | Dispatch | — | — | New backend + conflict handling | ⛔ Deferred post-pilot |

---

## Execution Order

```
Role rename workstream ──► (independent, lands first)
                            │
   ┌────────────────────────┴────────────────────────────────┐
   │ parallel-with-rename                gated on rename     │
   ▼                                     ▼
Tier 1                                  Tier 1
  T1-A5 — audit log viewer                T1-CC — Control Center relocation
  T1-A6 — export-and-delete UI                    (collapses D-1 + D-2)
  T1-D4 — reassign UI

Tier 2 parallel-with-rename            Tier 2 gated on rename
  T2-A2 — retire stop button             T2-A7 — system health page
                                                 (last_seen_role buckets)
                                         T2-D5 — stop history view
                                                 (drill-down via T1-CC)

Tier 3 (all gated on rename)
  T3-D3 — ad-hoc route creation (+ migration: __adhoc pool seed)
  T3-A3 — user directory (closes ISSUE-010)

Tier 4 (deferred post-pilot — no specs)
  A-4 route templates, D-4-add live-stop edit
```

---

## Critical Labor Safety Constraint

> No capability in this track may introduce worker identity into any
> operational surface. Live-monitoring views (route lists, Control Center
> panels, stop history) display only role-anonymous fields: pool, run ID,
> stop ID, status, counts, timestamps. They must not display
> `assigned_user_oid`, `captured_by_oid`, worker name, worker initials, or
> any field that resolves to a single named worker.

The **only** exception is the Admin-only Audit Log Viewer (T1-A5), where
`actor_oid` is the legitimate compliance field. That surface is enforced
Admin-only at the route guard and at the backend middleware on
`GET /api/admin/audit-log`.

The User Directory (T3-A3) is also Admin-only but does not display worker
performance — only identity-directory metadata (`display_name`, `email`,
`last_seen_role`, `last_seen_at`).

**Reference:** `planning/security/ADMIN_ACCESS_POLICY.md`.

---

## Founder To-Dos (out of code; pre-deploy)

| # | Task | Blocks |
|---|------|--------|
| F-1 | Identify Admin accounts that need Dispatch role in Entra and assign before T1-CC ships. Policy is Path A — CC is Dispatch-only; no dual-role code path. | T1-CC deploy |
| F-2 | Close ISSUE-010 with a pointer to `T3-A3-user-directory-readonly.md` once T3-A3 is dispatched or shipped. | Issue tracker hygiene |

---

## Spec Files

| Tier | ID | File |
|------|----|------|
| 1 | T1-A5 | `planning/capability-build/specs/T1-A5-audit-log-viewer.md` |
| 1 | T1-CC | `planning/capability-build/specs/T1-CC-control-center-relocation.md` |
| 1 | T1-A6 | `planning/capability-build/specs/T1-A6-export-and-delete-ui.md` |
| 1 | T1-D4 | `planning/capability-build/specs/T1-D4-reassign-ui.md` |
| 2 | T2-D5 | `planning/capability-build/specs/T2-D5-stop-history-view.md` |
| 2 | T2-A2 | `planning/capability-build/specs/T2-A2-retire-stop-button.md` |
| 2 | T2-A7 | `planning/capability-build/specs/T2-A7-system-health-page.md` |
| 3 | T3-D3 | `planning/capability-build/specs/T3-D3-adhoc-route-creation.md` |
| 3 | T3-A3 | `planning/capability-build/specs/T3-A3-user-directory-readonly.md` |
