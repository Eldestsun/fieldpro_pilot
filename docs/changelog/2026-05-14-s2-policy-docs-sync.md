# 2026-05-14 — S2 Policy Docs Spec Sync

## What changed
- Rewrote `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md` from scratch — replaced a 3-deliverable stub with a full 10-section spec file aligned to the authoritative S2-1 through S2-10 list in `planning/SECURITY_SPRINT_INDEX.md`
- Each section includes: Purpose, Content requirements, Hosting context (where applicable), Done criteria
- Hosting scale path documented inline for S2-1 through S2-4 (demo → Azure commercial → Azure Government)
- S2-7 draws explicitly from `planning/security/ADMIN_ACCESS_POLICY.md` for labor safety framing
- S2-9 references actual axe-core audit findings from S1-8 and S1-9 changelogs; prerequisites from sprint index included
- S2-10 enumerates specific TPRA questionnaire sections (9 categories) and Integration Options Matrix rows (EAMS/Hexagon, SFTP, Azure Entra SSO, ArcGIS roadmap, KMS)
- Sprint 2 Done Definition and Dispatch Format added as footer sections

## Why
- The old stub was insufficient to dispatch any S2 task — an agent reading it would have no content requirements, no output file paths, and no done criteria
- Sprint 2 cannot begin until the hosting decision is made, but the spec can be written now so dispatch is immediate once S3-1 is resolved

## Files touched
- `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md` (rewritten)
