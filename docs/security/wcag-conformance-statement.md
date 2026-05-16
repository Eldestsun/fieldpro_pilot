# BASELINE — WCAG 2.1 AA Conformance Statement

> **Document type**: Security and accessibility policy artifact
> **Sprint item**: S2-9
> **Status**: Active — automated conformance confirmed; manual screen reader testing pending (S3-4)
> **Last updated**: 2026-05-14
> **Input to**: S2-10 (TPRA Package — Accessibility section)
> **Audit report**: `docs/security/axe-audit-2026-05-14.md`

---

## 1. Conformance Level Claimed

**WCAG 2.1 Level AA** — automated scan conformance across all six application surfaces, as of 2026-05-14.

This statement reflects the post-remediation state following Sprint 1 tasks S1-8 (audit) and S1-9 (remediation + manual checks). Zero automated violations remain across all six surfaces. Two items are noted as known deviations or pending follow-up in section 6; neither constitutes a Level AA failure under the WCAG 2.1 specification.

**This statement does not claim full WCAG 2.1 AA conformance** pending completion of manual screen reader testing (VoiceOver / TalkBack). S3-4 (Founder task) will conduct that run before pilot launch. The statement will be updated with VoiceOver findings when S3-4 is complete. See section 6 for the specific items flagged for manual verification.

---

## 2. Audit Methodology

### 2.1 Automated Testing

**Tool**: `@axe-core/playwright` v4.11.3
**Runner**: `@playwright/test` v1.60.0
**Runtime**: Node.js v24.5.0
**Standard**: WCAG 2.1 AA (axe rule tags: `wcag2a`, `wcag2aa`, `wcag21aa`)
**Spec file**: `frontend/e2e/a11y/axeAudit.spec.ts`
**Auth mechanism**: Dual dev-bypass — `localStorage.__dev_user__` (frontend) + `X-Dev-User-*` headers (backend); authentication verified per surface by landmark-rule pass and DOM length check against login page

The automated audit runs axe-core against the fully rendered DOM of each surface. axe-core tests for violations of WCAG 2.1 A and AA criteria that are mechanically determinable: contrast ratios, ARIA usage, keyboard focusability, list structure, form labeling, and image alternatives. It cannot test focus management behavior, screen reader announcement order, or color-only state in dynamic CSS states.

### 2.2 Manual Accessibility Checks

Conducted alongside S1-9 remediation on 2026-05-14. Covered the following check categories:

| Check | Standard reference | Method |
|-------|--------------------|--------|
| Focus trap on modal dialogs | WCAG 2.4.3, 4.1.2 | Code review + keyboard walkthrough |
| Logical focus order | WCAG 2.4.3 | DOM structure review |
| Touch target size | WCAG 2.5.5 (AAA), WCAG 2.5.8 (AA) | Visual measurement |
| Viewport reflow at 320px | WCAG 1.4.10 (AA) | Browser resize test |
| Color-only state indication | WCAG 1.3.3, 1.4.1 (AA) | UI and code review |
| VoiceOver spot-check | WCAG 1.3.1, 4.1.2 (AA) | Identified; manual run pending (S3-4) |

### 2.3 Fixture Data

The UL Stop List and UL Stop Wizard surfaces require a live route assignment to render interactive content. The initial S1-8 scan found these surfaces in empty state; a fixture was seeded for the S1-9 re-audit:

- Route run ID: 712
- Pool: SE
- Status: `in_progress`
- Assigned OID: `axe-audit-ul`
- Stop count: 3

All subsequent UL scans used this fixture. Results reflect populated stop rows, status badges, the stop detail panel, and wizard actions.

---

## 3. Surfaces Audited

Six application surfaces were audited. All six were scanned in their authenticated operational state using the dev-bypass mechanism. Authentication was verified on each surface.

| # | Surface | URL | Role | Auth verified |
|---|---------|-----|------|--------------|
| 1 | Login / Auth Flow | `/` | Unauthenticated | N/A |
| 2 | UL Stop List | `/work` | UL (with fixture data — route_run 712, 3 stops) | Yes |
| 3 | UL Stop Detail / Wizard | `/work` (stop opened) | UL | Yes |
| 4 | Lead Routes Dashboard | `/routes` | Lead | Yes |
| 5 | Admin Panel | `/admin/pools` | Admin | Yes |
| 6 | Control Center | `/admin/control-center` | Admin | Yes |

The Audit Log viewer (`GET /api/admin/audit-log`) is an API endpoint that returns JSON or CSV, not an HTML surface. It does not generate a rendered UI and is not applicable to WCAG visual and interaction criteria. Access controls for the audit log endpoint are documented in `docs/security/data-classification.md` (S2-5).

---

## 4. Violation History and Remediation Record

### 4.1 S1-8 Initial Scan — Confirmed Violations

The initial automated scan (S1-8, 2026-05-14) found **4 confirmed violations** across four surfaces, all rated serious (no critical violations). The UL surfaces were scanned in empty state at this stage.

| Violation | Rule | WCAG criterion | Surface | Nodes |
|-----------|------|----------------|---------|-------|
| Version badge insufficient contrast (`#94a3b8` on white, ratio 2.56:1) | `color-contrast` | 1.4.3 AA | Login | 1 |
| Secondary and empty-state text insufficient contrast (`text-gray-300` on white, ratio 1.47:1) | `color-contrast` | 1.4.3 AA | Control Center | 4 |
| Horizontal-scroll tables not keyboard-focusable | `scrollable-region-focusable` | 2.1.1 AA | Lead Routes | 2 |
| Horizontal-scroll table not keyboard-focusable | `scrollable-region-focusable` | 2.1.1 AA | Control Center | 1 |

Two additional `color-contrast` findings were marked **incomplete** (axe could not resolve contrast ratio due to dynamic `hover:bg-gray-50` row background). These were resolved manually: text-gray-800 on bg-gray-50 hover yields 7.78:1 — confirmed pass.

### 4.2 S1-9 UL Re-audit — Additional Violations Found and Fixed

After fixture data was seeded, the UL surfaces were re-scanned with populated stop rows. **3 additional violations** were found and fixed in-session.

| Violation | Rule | WCAG criterion | Surface | Nodes |
|-----------|------|----------------|---------|-------|
| Invalid `<div>` wrapper between `<ul>` and `<li>` | `list` | 1.3.1 AA | UL Stop List | 1 |
| Skipped-stop badge insufficient contrast (`text-gray-500` on `bg-gray-100`, ratio 4.39:1) | `color-contrast` | 1.4.3 AA | UL Stop List | 1 |
| Sync status colors insufficient contrast (`text-green-600`, `text-amber-600` on `bg-gray-50`, ratios ~3.0:1) | `color-contrast` | 1.4.3 AA | UL Stop List / Route Header | 2 |

### 4.3 Post-Remediation State

**Total violations found**: 7 (4 confirmed in S1-8 + 3 new in UL re-audit)
**Total violations resolved**: 7
**Remaining automated violations as of 2026-05-14**: **0**

Post-remediation axe-core scan: **5/5 tests pass across all surfaces.**

### 4.4 Remediation Detail

**S1-8 fixes (Part A):**

| Fix | File |
|-----|------|
| Login version badge: `color: "#94a3b8"` → `"#64748b"` (slate-500, 4.6:1) | `frontend/src/auth/LoginPage.tsx` |
| Control Center: 5× `text-gray-300` → `text-gray-500` (4.6:1) on empty-state and secondary-label text | `frontend/src/components/admin/AdminControlCenter.tsx` |
| DataTable: `tabIndex={0}` on `overflow-x-auto` wrapper; sort icon `text-gray-300` → `text-gray-500` | `frontend/src/components/ui/DataTable.tsx` |
| OpsTable: `tabIndex={0}` on `overflow-x-auto` wrapper | `frontend/src/components/ui/OpsTable.tsx` |

**S1-9 UL re-audit fixes (Part B):**

| Fix | File |
|-----|------|
| Removed invalid `<div>` wrapper between `<ul>` and `<li>`; added `id` prop to `<li>` | `frontend/src/components/today-route/StopList.tsx`, `StopListItem.tsx` |
| Skipped badge: `text-gray-500` → `text-gray-600` (5.7:1) | `frontend/src/components/today-route/StopListItem.tsx` |
| Route header sync status: `text-green-600` → `text-green-800` (5.98:1); `text-amber-600` → `text-amber-800` (6.06:1) | `frontend/src/components/today-route/RouteHeader.tsx` |

**S1-9 manual fixes (Part C):**

| Fix | File |
|-----|------|
| ConfirmDialog: added `role="dialog"`, `aria-modal="true"`, `aria-labelledby` + matching `id` on `<h3>` | `frontend/src/components/ui/ConfirmDialog.tsx` |
| ImagePreviewModal: added `role="dialog"`, `aria-modal="true"`, `aria-label` | `frontend/src/components/common/ImagePreviewModal.tsx` |
| ConflictResolutionModal: added `role="dialog"`, `aria-modal="true"`, `aria-labelledby` + matching `id` on `<h2>`; bumped close/dismiss/copy buttons to `minHeight: '44px'` | `frontend/src/components/ui/ConflictResolutionModal.tsx` |
| StopDetail Safety Modal: added `role="dialog"`, `aria-modal="true"`, `aria-labelledby` + matching `id` | `frontend/src/components/today-route/StopDetail.tsx` |
| StopDetail Infra Modal: added `role="dialog"`, `aria-modal="true"`, `aria-labelledby` + matching `id` | `frontend/src/components/today-route/StopDetail.tsx` |
| Back to Route button: added `min-h-[44px] flex items-center` | `frontend/src/components/today-route/StopDetail.tsx` |
| Trash volume toggle buttons: added `aria-pressed={checklist.trashVolume === val}` to each button | `frontend/src/components/today-route/StopDetail.tsx` |

---

## 5. Per-Surface Post-Remediation Status

### Surface 1 — Login / Auth Flow (`/`)

**Post-remediation axe result**: 0 violations
**Manual checks**: N/A (unauthenticated, no interactive session)
**Status**: Conforms — WCAG 2.1 AA

The version badge contrast fix (`#94a3b8` → `#64748b`, ratio 4.6:1) resolved the only violation on this surface.

---

### Surface 2 — UL Stop List (`/work`, with fixture data)

**Post-remediation axe result**: 0 violations
**Manual checks**: Focus order PASS; `<ul>/<li>` list structure corrected; status badge contrasts verified
**Status**: Conforms — WCAG 2.1 AA

Stop rows, status badges ("Pending", "Done", "Skipped"), and the route header sync indicator all pass contrast checks post-remediation. List structure is valid HTML.

---

### Surface 3 — UL Stop Detail / Wizard (`/work`, stop opened)

**Post-remediation axe result**: 0 violations
**Manual checks**: ARIA attributes applied to Safety and Infra modals; `aria-pressed` on trash volume buttons; Back to Route button touch target corrected; checklist items use native `<input type="checkbox">`
**Status**: Conforms — WCAG 2.1 AA (automated); one follow-up item noted (section 6.1)

The wizard is the primary operational surface for field workers (route specialists) and received the most manual review attention. Programmatic toggle state (trash volume) is now exposed via `aria-pressed`. All five modal dialogs on UL surfaces have ARIA dialog roles and labels. Checklist state is conveyed through native checkbox semantics.

---

### Surface 4 — Lead Routes Dashboard (`/routes`)

**Post-remediation axe result**: 0 violations
**Manual checks**: Keyboard focusability of horizontal-scroll tables confirmed via `tabIndex={0}`; table cell contrast manually verified (7.78:1 on hover background)
**Status**: Conforms — WCAG 2.1 AA

Both horizontal-scroll table wrappers on this surface received `tabIndex={0}`. Keyboard users can now reach and scroll table content.

---

### Surface 5 — Admin Panel (`/admin/pools`)

**Post-remediation axe result**: 0 violations (no violations in initial S1-8 scan either)
**Manual checks**: No issues identified
**Status**: Conforms — WCAG 2.1 AA

Audit confidence is moderate — pool list rendered with route data visible during scan. No interactive form violations were found.

---

### Surface 6 — Control Center (`/admin/control-center`)

**Post-remediation axe result**: 0 violations
**Manual checks**: Empty-state text contrast corrected; scrollable table focusability corrected; incomplete table-cell contrast finding manually resolved (pass)
**Status**: Conforms — WCAG 2.1 AA

All five `text-gray-300` → `text-gray-500` replacements on this surface addressed both the confirmed violations and the incomplete contrast candidate. The horizontal-scroll table wrapper received `tabIndex={0}`.

---

## 6. Known Deviations and Open Items

This section discloses items that were identified during the S1-9 audit and have not been fully resolved. Neither item constitutes a WCAG 2.1 Level AA failure; both are disclosed here for transparency.

### 6.1 Modal Focus Management — useEffect Focus Traps Not Yet Implemented

**Affected components**: `ConfirmDialog.tsx`, `ImagePreviewModal.tsx`, `ConflictResolutionModal.tsx`, `StopDetail.tsx` Safety Modal, `StopDetail.tsx` Infra Modal

**Current state**: All five modal components have `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` applied (S1-9 Part C). Dialog semantics are correct. Dialogs are dismissible via Escape key and backdrop click.

**What is not implemented**: `useEffect`-based focus management — specifically: moving keyboard focus to the first interactive element when a dialog opens, containing Tab and Shift+Tab within the open dialog, and returning focus to the trigger element when the dialog closes.

**WCAG assessment**: WCAG 2.4.3 (Focus Order, AA) requires that focus order within a dialog be logical and that the dialog not trap focus in a way that prevents keyboard navigation. The absence of a programmatic focus trap does not itself create an AA failure — it is the presence of a focus trap that blocks exit which fails 2.4.3. ARIA Authoring Practices Guide recommends focus management as a best practice; it is not mandated as a WCAG AA criterion. axe-core does not flag missing focus management as a violation.

**Status**: Not an AA failure. Flagged for follow-up (S2-9 prerequisite 1). Will be implemented as a useEffect-based focus utility before pilot launch.

### 6.2 Photo Thumbnail Remove Button Touch Target

**Affected component**: `StopDetail.tsx` photo strip overlay

**Current state**: The remove button on uploaded photo thumbnails is `w-5 h-5` (20×20px). It cannot be expanded to 44×44px without visually obscuring the thumbnail it overlays.

**WCAG assessment**: WCAG 2.5.5 (Target Size) is **Level AAA** — it requires a minimum 44×44px touch target but is not a Level AA requirement. WCAG 2.1 Level AA does not mandate a minimum touch target size. This is therefore not a Level AA deviation.

**Status**: Not an AA failure. Noted for product design consideration. This button is only reachable after a user selects a photo for upload (pre-submission state, not the primary workflow path).

### 6.3 VoiceOver / TalkBack Manual Screen Reader Testing — Pending

**Status**: Not yet completed. Manual screen reader testing is a Founder task (S3-4), scheduled before pilot launch.

**What was identified for manual verification**:
- UL Stop List: verify that the `<ul>` list announces N items and each `<li>` announces stop number, address, and status badge text
- StopDetail Safety Modal: verify VoiceOver announces "Report Safety Concern, dialog" on open with the ARIA fixes applied; verify focus behavior
- ConflictResolutionModal: verify "Stops needing attention, dialog" announced on open
- Trash volume buttons: verify `aria-pressed` state changes are announced by screen reader

**Conformance impact**: The ARIA fixes applied in S1-9 are prerequisites for correct screen reader behavior. Whether those fixes produce correct VoiceOver / TalkBack announcements in practice will be determined by S3-4. If S3-4 findings reveal additional remediation requirements, this document will be updated and a supplemental remediation task dispatched.

This statement will not be finalized or signed off until S3-4 is complete and its findings are incorporated (S3-5).

---

## 7. Testing Tools and Versions

| Tool | Version | Purpose |
|------|---------|---------|
| `@axe-core/playwright` | 4.11.3 | Automated WCAG 2.1 AA rule scanning |
| `@playwright/test` | 1.60.0 | Browser automation and test runner |
| Node.js | 24.5.0 | Runtime |
| macOS VoiceOver | Pending S3-4 | Manual screen reader testing |
| Android TalkBack | Pending S3-4 | Manual screen reader testing (field device posture) |

Audit was run on macOS 14 (Sonoma) using Playwright's Chromium browser. axe-core tag set: `wcag2a`, `wcag2aa`, `wcag21aa`. No `wcag22aa` tags were included; WCAG 2.2 AA is not claimed.

---

## 8. Statement Date and Review

**Statement date**: 2026-05-14 (automated audit and manual checks complete)
**Pending before finalization**: S3-4 (VoiceOver/TalkBack run) + S3-5 (founder sign-off)
**Next review date**: Before each significant release or at minimum annually

Changes that trigger a mandatory re-audit before this statement can stand:
- Any modification to a surface in section 3
- Addition of a new application surface
- Any change to ARIA attributes, color tokens, or layout structure in audited components
- Any schema or data change that affects what content is rendered in the UL, Lead, or Admin surfaces

---

## 9. Scope and Limitations

This statement covers the six surfaces listed in section 3 as they existed on 2026-05-14 with the fixture data described in section 2.3.

**Not in scope**: The BASELINE backend API (JSON/CSV responses), developer tooling, internal admin scripts. These are not user-facing surfaces subject to WCAG.

**Not claimed**: WCAG 2.2 AA; WCAG 2.1 AAA; Section 508 (the application is not currently classified as a federal system); WAC 388-823 applicability has not been formally determined — KCM IT should verify whether this regulation applies to BASELINE based on how the system is classified within KCM's technology inventory.

**Automated tooling limitations**: axe-core detects approximately 30–40% of WCAG success criteria. It cannot test focus management behavior, screen reader announcement order, cognitive load, or the user experience of assistive technology in live use. Manual testing (section 2.2) and screen reader testing (S3-4) address these gaps.
