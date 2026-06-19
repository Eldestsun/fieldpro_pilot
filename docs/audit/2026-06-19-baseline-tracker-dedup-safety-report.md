# BASELINE Work Tracker — Duplicate-Board Dedup Safety Report

**Date:** 2026-06-19
**Author:** Claude Code (Notion MCP, read-mostly)
**Trigger:** Dispatch to close out ISSUE-031 on the board + resolve the accidental duplicate "BASELINE Work Tracker (1)".
**Outcome:** ISSUE-031 close-out **DONE**. Board deduplication **investigated and STOPPED short of deletion** — see "Why deletion was not performed."

---

## The two boards

| | Original (SURVIVOR) | Vestigial copy |
|---|---|---|
| DB title | BASELINE Work Tracker | BASELINE Work Tracker **(1)** |
| Database id | `0d42108e-af06-4512-b364-f8f392cff15f` | `38467f84-1a52-805f-a3d4-fe83c68907a5` |
| Data-source / collection | `51c4c465-1c45-499d-95fb-255167de3650` | `b5667f84-1a52-82d6-a339-07983e90f79f` |
| Schema | identical | identical (structural clone) |
| Card timestamps observed | live, spread across the work (…05:37, 06:27, **07:37, 07:38, 08:09**) | **every observed card stamped `2026-06-19T01:56`** |

**Survivor decision: the ORIGINAL (`51c4c465`).** This is both the task default and is confirmed by evidence: the newest version of every card examined lives in the original, and the original holds the newest cards outright (registry-cleanup @07:38, ISSUE-031 close-out @08:09). "(1)" reads as a **frozen point-in-time snapshot taken at 01:56** — a subset, not a board anyone has worked in since.

---

## PHASE 0 — Diff (best-effort; see enumeration caveat)

**Cards confirmed present in BOTH boards, content identical, original = same-or-newer:**

| Issue / card | Original (survivor) | "(1)" copy | Verdict |
|---|---|---|---|
| ISSUE-031 "Clip six work-attribution tables…" | `37d67f84…c99374a26fc8` (now @08:09, Status **Done**) | `42c67f84…0f88c8` (@01:56, stale) | Original ahead |
| ISSUE-034 needs_facilities founder decision | `38367f84…f7b11b` (Won't Do) | `76267f84…832a` (@01:56) | Original = canonical |
| ISSUE-035 reader-repoint punch-list | `38367f84…9388e8f33696d6b1` (@06:27, now tightened) | `1a667f84…db06` (@01:56) | Original ahead |
| **ISSUE-036 stop_photos OID pilot-gate** | `38367f84…b3a5c928b7a4509d` (@06-18 22:24, full content) | `b4467f84…b5f2` (@01:56, full content) | **Both have it, identical — original is canonical** |
| ISSUE-031-CLEANUP registry retire | `38467f84…610ce` (@07:38) | *(none observed)* | **Original only** |
| stop_photos write-side identity clip | *(twin expected)* | `f8467f84…b3f5` (@01:56) | both observed |
| Severity capture UI picker | `38167f84…b258` | `3cb67f84…df5a` (@01:56) | both observed |
| Infra payload backfill | — | `bd567f84…7773` (@01:56) | "(1)" observed; twin likely in original |
| Author ISSUE-031 migration-sequence | `37d67f84…3617` | `49967f84…afc0` (@01:56) | both observed |
| Finish Canonical State Layer (norm shape) | `37f67f84…ee96` | `f8167f84…ccf5` (@01:56) | both observed |
| P1 Control Center reads → canonical | `37e67f84…6a99` | `b7567f84…b9b7` (@01:56) | both observed |
| T1-CC-b Control Center repoint | — | `bc467f84…db3e` (@01:56) | "(1)" observed; twin likely in original |
| D3 evict transit views | `37d67f84…20a2` | `05767f84…4ded` (@01:56) | both observed |
| DQ-5 issue boundaries | `7c867f84…89d0` | *(same id appears under both via search)* | both observed |

**The task's specific worry — "ISSUE-036 may be unique to (1)" — is FALSE.** ISSUE-036 exists in the survivor (`38367f84…509d`, parent collection `51c4c465`) with full content identical to the "(1)" copy. The survivor already holds it.

**Cards found unique to "(1)":** **none.** Every "(1)" card examined has a twin in the original, and every "(1)" card carries the single `01:56` copy timestamp — i.e. nothing was created or edited *inside* "(1)" after the copy. No card in "(1)" is ahead of its original twin on any field examined.

**Cards unique to the original (survivor):** at least the **ISSUE-031-CLEANUP registry-retire** card (@07:38) and the post-01:56 edits to ISSUE-031 / ISSUE-035. These are exactly the cards/edits that postdate the 01:56 copy — present only where work continued (the original).

---

## PHASE 1 — Reconcile into survivor

**No reconciliation copies were required or made.** Rationale: no card unique to "(1)" was found, and "(1)" is not ahead of the original on any examined card. Copying "(1)" cards into the survivor would only manufacture a *third* set of duplicates. The two specifically-named must-preserve items are already in the survivor:
- **ISSUE-036** — present, full content. ✔
- **Registry-cleanup (ISSUE-031-CLEANUP)** — present, @07:38. ✔

---

## PHASE 2 — Delete the vestigial copy — **NOT PERFORMED (by rule + by tool limit)**

### Why deletion was not performed

1. **The Notion MCP exposes no delete or archive/trash primitive.** Available tools are create/fetch/search/update/move/duplicate only. There is no way to delete or trash a database (or move it to trash) through the MCP. `notion-update-page` operates on page *content/properties*, not on database lifecycle. So deletion is **not mechanically possible** from this session regardless of safety.
2. **The HARD RULE forbids it without exhaustive proof, which the MCP cannot provide.** The rule: "Do NOT delete until you have *proven* every card/change unique to the to-be-deleted board has been copied into the survivor… if anything is ambiguous, STOP and report." The MCP has **no row-enumeration / query primitive** — `notion-fetch` on a database returns schema only, and `notion-search` is ranked and non-exhaustive. I therefore **cannot prove** that "(1)" contains zero unique cards; I can only show that every card I *sampled* has a survivor twin. Strong evidence (uniform 01:56 timestamps, every sampled card twinned), but not the exhaustive proof the rule demands. Per the rule, that means **STOP and report**, not delete.

### Recommended manual close-out (for a human in the Notion UI — trivial there)

1. Open **BASELINE Work Tracker (1)** (`38467f84-1a52-805f-a3d4-fe83c68907a5`) in the Notion UI.
2. Sort its table by Last-edited time. Confirm **no card was edited after `2026-06-19 01:56`** (i.e. nothing was worked there post-copy). The UI shows the full row set — the exhaustive check the MCP can't do.
3. Spot-check that each "(1)" card has a same-named twin in the original (`0d42108e…`). The diff table above is the starting checklist.
4. Once confirmed, **delete the "(1)" database** from the UI (right-click → Delete, or move to Trash). This is the irreversible step — do it only after steps 2–3 pass.

If any "(1)" card turns out to have a post-01:56 edit or no twin, copy it into the original first, then delete.

---

## PHASE 3 — ISSUE-031 close-out (DONE, on the survivor)

All edits applied to the **original** board and verified by re-fetch:

- **ISSUE-031** (`37d67f84…c99374a26fc8`): **Status Review → Done.** Current-state block now reads *"ALL Stage-2 write-clips COMPLETE + MERGED. Capstone MERGED. P1 scope DONE — PRs #41–#46 all merged to main 2026-06-19. ISSUE-031 CLOSED."* The stale *"PR not yet opened by Adam"* line is replaced with *"PR #46 MERGED to main 2026-06-19 (merge commit c094877)."* Capstone header now *"DONE + MERGED (PR #46)."* Deferred items (Stage-3 drops, ISSUE-035 repoints, ISSUE-036 pilot-gate, registry cleanup) preserved.
- **ISSUE-035** (`38367f84…9388e8f33696d6b1`): `is_exception` wording tightened — *"Evaluates false for all POST-CLIP rows… `hazard_id` is NULL on every row written since the hazards clip (live 2026-06-19: **2/12** route_run_stops still carry a non-NULL hazard_id — frozen pre-clip legacy rows, no correctness impact, gone at Stage-3 drop); `infra_issue_id` never written (live: **0/12**)… repoint rebuilds the whole derivation from canonical EXISTS."*
- **ISSUE-034** (`38367f84…f7b11b`): confirmed already **Won't Do** (needs_facilities dropped by founder decision). No edit needed.

---

## Cards I could NOT confidently adjudicate (surfaced, not guessed)

- **Completeness of "(1)".** I cannot certify via MCP that "(1)" holds *nothing* unique — only that every sampled card is twinned and 01:56-stamped. This is the single open item gating safe deletion; it needs the UI check above. Reported rather than assumed.
- A few twins above are marked "twin likely in original" where I saw the "(1)" copy via search but did not separately fetch the original twin. None showed any sign of being "(1)"-unique; flagged for completeness.
