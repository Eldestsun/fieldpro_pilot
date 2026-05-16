# 2026-05-14 — S2-1 NIST SP 800-53 Control Mapping

## What changed
- Created `docs/security/nist-800-53-control-mapping.md` — complete NIST SP 800-53 Rev 5 control mapping (S2-1)
  - **9 control families covered**: AC (8 controls), AU (8 controls), IA (5 controls), SC (4 controls), SI (5 controls), CP (3 controls), IR (3 controls), SA (3 controls), PL (2 controls) — 41 controls total
  - **Status distribution**: 28 Implemented, 7 Partial, 4 Planned, 1 Not Applicable
  - **AC family**: AC-1 through AC-17 — `requireAnyRole` middleware, three-group Admin roster, RLS tenant isolation (Tier 7 + R11), labor safety structural guarantee documented under AC-2 and AC-5; operational leadership explicitly called out as Lead/UL with no audit access path
  - **AU family**: AU-2 through AU-12 — 12 wired action types enumerated; 2 pending gaps (user_role_change, audit_log_read) cited with ISSUE-010 reference; append-only RLS design documented under AU-9; 1-year retention cross-referenced to S2-6
  - **IA family**: IA-1 through IA-12 — Azure Entra MSAL + S1-11 `assertClaims` (aud/iss/oid/exp validation) documented; DevStaticKeyAdapter vs AzureKeyVaultAdapter stub distinction noted
  - **SC family**: SC-8 (HTTPS + SFTP key-based auth), SC-12 (AES-256-GCM envelope encryption stub gap noted), SC-13 (OID encryption implemented), SC-28 (Planned — hosting-dependent; application-layer OID encryption as mitigation at demo)
  - **SI family**: SI-2 (dependency audit — 0 HIGH/CRITICAL as of 2026-05-14, CI gate in place), SI-3 (magic byte detection + MIME whitelist + server-generated storage keys), SI-7 (SHA-256 SFTP sidecars), SI-10 (parameterized queries, input validation at all boundaries), SI-12 (cross-referenced to S2-6)
  - **CP family**: CP-9 Planned with provider-default gap stated; offline queue (`offlineQueue.ts`) noted as compensating control
  - **IR family**: IR-1 and IR-6 Planned pending S2-3; IR-4 Partial — detection sources in place (audit_log anomaly detection, Entra sign-in logs, CI vulnerability gate) but no formal escalation procedure yet
  - **SA family**: SA-5 (OpenAPI 3.0 spec, 53 paths, S1-5), SA-8 (security engineering principles: append-only by design, no plaintext OID at rest, server-generated keys, parameterized queries), SA-15 (CI pipeline, verify_rls/r11 scripts)
  - **PL family**: PL-2 (this document as system security plan), PL-4 (ADMIN_ACCESS_POLICY.md + S2-7 rules of behavior)
  - **Open gaps table**: 10 gaps listed with status, gap description, remediation reference, and target sprint/task
  - **Hosting upgrade path table**: 6 controls with explicit demo → Azure commercial → Azure Government transition states

## Why
- Security Sprint 2, item S2-1: KCM IT security staff and the TPRA evaluator use this document to determine which controls are satisfied, partially satisfied, or deferred, and to identify residual gaps requiring compensating controls or accepted risk
- Written at demo posture (Render/Fly.io); hosting-dependent controls noted inline with pilot upgrade path

## Files touched
- `docs/security/nist-800-53-control-mapping.md` (new)
- `docs/changelog/2026-05-14-s2-1-nist-mapping.md` (this file)
