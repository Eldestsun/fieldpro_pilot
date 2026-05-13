# S3 — Founder Tasks

> **Goal**: Complete the security tasks that require external accounts, credentials, or vendor interactions.
>
> **Status**: 🔴 Not started
> **Depends on**: S1 in progress
> **Blocks**: Nothing (parallel with S2)

---

## Task List

| Task | Owner | Notes |
|------|-------|-------|
| Rotate all staging/production secrets | Founder | After S1 audit identifies any leaked values |
| Enable GitHub branch protection on `main` | Founder | Require CI to pass before merge (R8 done-criteria) |
| Set up container registry (GHCR or ECR) | Founder | Required for R8 image push step |
| Domain verification for Azure Entra tenant | Founder | Required for production auth |
| TLS certificate management | Founder | Auto-renew via hosting provider or Let's Encrypt |
| Respond to vendor security questionnaires | Founder | KCM procurement process |

---

## Done Definition

S3 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] All production and staging secrets rotated post-S1
- [ ] GitHub branch protection enabled on `main` (R8 requirement satisfied)
- [ ] Container registry configured and tested with R8 pipeline
- [ ] Azure Entra tenant verified for production domain
- [ ] TLS in place for staging environment
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-s3-founder-tasks.md`
