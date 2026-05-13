# S1 — Code Gaps

> **Goal**: Identify and close application-layer security gaps before the pilot goes live with real agency users.
>
> **Status**: 🔴 Not started — unblocked (Tier 7 RLS done)
> **Depends on**: Tier 7 (RLS enforced at DB layer)
> **Blocks**: S2, S3 (policy docs should reflect actual code posture)

---

## Scope

- Input validation on all API endpoints (body, params, query)
- Secrets management audit — no secrets in code, env, or logs
- Dependency vulnerability scan (`pnpm audit`)
- Auth hardening — token validation completeness, JWKS cache, clock skew
- RLS verification that every query path goes through `withOrgContext()`
- File upload validation (MIME type, size limits, path traversal)

---

## Done Definition

S1 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] `pnpm audit` passes with no high/critical vulnerabilities
- [ ] All API route handlers validate input at boundaries
- [ ] No secrets appear in source files, `.env.example`, or logs
- [ ] Auth token validation covers `aud`, `iss`, `exp`, `oid` claims
- [ ] All file upload paths reject non-image MIME types and enforce size limits
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-s1-code-gaps.md`
