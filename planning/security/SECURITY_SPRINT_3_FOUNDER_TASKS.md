# Security Hardening Sprint 3 — Founder Tasks & Final Validation

> **Track**: Security Hardening & Procurement Compliance
> **Sprint**: 3 of 3 — Founder-required tasks
> **Estimated elapsed time**: ~1 week (external coordination dependent)
> **Prerequisite**: Sprint 1 code tasks complete; Sprint 2 policy docs drafted
> **Last updated**: 2026-05-12

---

## Sprint 3 Overview

Sprint 3 items cannot be delegated to a coding agent. Each requires the founder's direct involvement — either because it is an infrastructure decision, an organizational relationship, or a manual validation task that cannot be automated.

These are not large in number, but each is a hard gate on downstream work. **S3-1 (hosting decision) is the single most consequential decision in the entire hardening sprint.** It must be made before Sprint 2 can finalize the hosting-dependent policy documents (S2-1 through S2-4).

---

## S3-1 — Select and Configure Hosting Platform

**Type**: Infrastructure decision
**Blocks**: S2-1, S2-2, S2-3, S2-4, S3-2, S3-3
**Owner**: Founder

### The decision

Select one of the following hosting options:

| Option | FedRAMP Claim | Notes |
|--------|--------------|-------|
| **Azure Government** | FedRAMP-Moderate inheritable | Same Azure tooling as KCM Entra; preferred alignment with KCM IT |
| **AWS GovCloud** | FedRAMP-Moderate inheritable | Strong HA toolset; requires more integration work with Azure AD |
| **Standard managed hosting** | No FedRAMP claim | Lower cost; no FedRAMP inheritance; still meets KCM IT requirements if all controls documented |

### What this decision affects

- NIST SP 800-53 FedRAMP inheritance claims (S2-1)
- WA OCIO 141.10 alignment — physical security and cryptography sections (S2-2)
- Incident Response Plan — hosting provider contacts (S2-3)
- Business Continuity — backup strategy, HA configuration, SLA (S2-4)
- Actual DB backup setup (S3-2)
- Uptime SLA confirmation (S3-3)

### Configuration steps after selection

1. Provision the hosting environment
2. Deploy the Docker Compose stack (or container orchestration equivalent)
3. Configure HTTPS / TLS — obtain and mount certificate
4. Set all required environment variables (from `.env.example`)
5. Run the migration runner against the production DB
6. Verify the application is reachable at a stable HTTPS URL

### Done criteria

- [ ] Hosting platform selected and documented
- [ ] Application deployed and reachable at a stable HTTPS URL
- [ ] TLS certificate active
- [ ] All environment variables set (AZURE_CLIENT_ID, AZURE_TENANT_ID, DATABASE_URL, etc.)
- [ ] Migration runner executed successfully in production
- [ ] Notify agent to complete S2-1 through S2-4 with hosting details

---

## S3-2 — Configure Managed DB Backups + Multi-AZ

**Type**: Infrastructure
**Depends on**: S3-1
**Owner**: Founder

### What to configure

**Database backups**:
- Enable automated backups on the managed PostgreSQL service
- Set retention period: minimum 7 days (30 days recommended)
- Enable point-in-time recovery (PITR) if available on the selected platform
- Document the backup schedule and retention period for S2-4

**High availability**:
- Enable Multi-AZ deployment (Azure: zone-redundant; AWS: Multi-AZ)
- Verify automatic failover is configured
- Document the HA configuration for S2-4

### Done criteria

- [ ] Automated DB backups confirmed active
- [ ] Backup retention period documented
- [ ] Multi-AZ or zone-redundant configuration active
- [ ] Failover behavior documented
- [ ] Agent notified to complete S2-4 Business Continuity with actual configuration

---

## S3-3 — Confirm 99.9% Uptime SLA

**Type**: Infrastructure verification
**Depends on**: S3-1
**Owner**: Founder

### What to confirm

Obtain written SLA documentation from the hosting provider confirming:
- Uptime commitment (target: 99.9% = ~8.7 hours downtime/year)
- Exclusions (maintenance windows, force majeure)
- Remediation terms (service credits)

This documentation is referenced in the Business Continuity summary (S2-4) and the TPRA submission.

### Done criteria

- [ ] SLA documentation obtained from hosting provider
- [ ] Uptime commitment confirmed >= 99.9%
- [ ] SLA document saved to `docs/compliance/hosting-sla-confirmation.pdf` (or link)
- [ ] Agent notified to update S2-4 with confirmed SLA figures

---

## S3-4 — Manual Accessibility Testing

**Type**: QA
**Depends on**: S1-9 (code remediation complete)
**Owner**: Founder
**Estimated time**: 1–2 hours

### What to test

Automated axe-core audits (S1-8) cover approximately 30–40% of WCAG violations. This manual test covers the gaps that automated tools cannot detect: cognitive flow, screen reader behavior, and touch target usability on real devices.

### Test environment

- **iOS**: VoiceOver (Settings → Accessibility → VoiceOver)
- **Android**: TalkBack (Settings → Accessibility → TalkBack)
- Use the staging environment URL

### Test script — UL Mobile Stop Wizard (primary surface)

This is the highest-priority manual test. A field worker may use a screen reader on a county-issued device.

1. **Login flow**
   - Activate VoiceOver / TalkBack
   - Navigate to the BASELINE URL
   - Verify the MSAL login button is announced correctly
   - Complete login with a test Entra account
   - Verify landing on the UL stop list — confirm page title announced

2. **Stop list navigation**
   - Swipe through the stop list
   - Verify each stop card reads: stop name, status, any action button
   - Activate a stop to open the wizard

3. **Stop wizard — each step**
   - Verify step title is announced on arrival
   - Verify form inputs have labels announced
   - Verify selection controls (condition rating, hazard type) are announced
   - Verify the Next / Skip / Complete buttons are reachable and labeled
   - Complete a full stop flow

4. **Offline state**
   - Enable airplane mode mid-wizard
   - Verify offline indicator is announced
   - Complete the stop
   - Re-enable connectivity
   - Verify replay confirmation is announced

### Test script — Control Center (secondary surface)

1. Navigate to Control Center with Admin credentials on desktop
2. Tab through the route status cards
3. Verify route name, stop count, and status are all readable
4. Verify any live-updating regions use `aria-live` and are announced on update

### Recording findings

Document any issues found in `docs/accessibility/manual-test-YYYYMMDD.md`:
- Surface tested
- Device and OS version
- Issue description
- Severity (critical / serious / moderate)
- Screenshot or description

Pass findings to the agent for code remediation if critical or serious issues are found. Re-run S1-9 if new issues are discovered.

### Done criteria

- [ ] VoiceOver test on iOS completed against staging
- [ ] TalkBack test on Android completed against staging (if device available)
- [ ] UL stop wizard fully navigable with screen reader
- [ ] Findings documented in `docs/accessibility/manual-test-YYYYMMDD.md`
- [ ] Agent notified to remediate any critical/serious findings before S2-9 is finalized
- [ ] S2-9 WCAG Conformance Statement updated to reflect manual test results

---

## S3-5 — Review + Sign Off All Policy Documents

**Type**: Review
**Depends on**: All Sprint 2 documents complete
**Owner**: Founder

### What to review

Each S2 document requires a founder review pass before TPRA submission. Agent-drafted policy documents are accurate based on the codebase and architecture, but the founder must verify:

1. **Accuracy**: Does the document correctly describe how the system actually works?
2. **Commitments**: Are the SLAs, retention periods, and notification timelines commitments you can actually keep?
3. **Organizational alignment**: Does the language align with how KCM IT expects to see procurement documents written?
4. **Labor safety**: Does every data-handling document include the structural worker privacy guarantee?

### Review checklist

| Document | File | Status |
|----------|------|--------|
| NIST SP 800-53 Control Mapping | `docs/compliance/nist-sp-800-53-control-mapping.md` | ☐ Reviewed |
| WA OCIO 141.10 Alignment | `docs/compliance/wa-ocio-141-10-alignment.md` | ☐ Reviewed |
| Incident Response Plan | `docs/compliance/incident-response-plan.md` | ☐ Reviewed |
| Business Continuity Summary | `docs/compliance/business-continuity-summary.md` | ☐ Reviewed |
| Data Classification | `docs/compliance/data-classification.md` | ☐ Reviewed |
| Log Retention Policy | `docs/compliance/log-retention-policy.md` | ☐ Reviewed |
| Data Use Limitation Policy | `docs/compliance/data-use-limitation-policy.md` | ☐ Reviewed |
| ArcGIS Integration Roadmap | `docs/compliance/arcgis-integration-roadmap.md` | ☐ Reviewed |
| WCAG Conformance Statement | `docs/compliance/wcag-conformance-statement.md` | ☐ Reviewed |
| TPRA Questionnaire Answers | `docs/compliance/tpra-package/tpra-questionnaire-answers.md` | ☐ Reviewed |
| Integration Options Matrix | `docs/compliance/tpra-package/integration-options-matrix.md` | ☐ Reviewed |

### Done criteria

- [ ] All 11 documents reviewed
- [ ] Corrections passed back to agent for updates
- [ ] Final versions confirmed before TPRA assembly (S3-7)

---

## S3-6 — KCM Azure Entra Test Account

**Type**: External coordination
**Depends on**: None (can begin immediately)
**Owner**: Founder

### What to coordinate

The TPRA will ask for evidence that SSO integration works against the KCM Entra tenant. This requires a test account provisioned in the King County Azure Entra environment — not just the development/personal tenant.

This coordination must happen through existing organizational relationships. The request is:
> "We need a test Azure AD account in the KCM tenant for validating SSO integration as part of the TPRA submission process."

### Validation test (once account obtained)

Using the staging environment:
1. Log in with the KCM Entra test account
2. Verify the organization resolution chain (Entra tenant ID → org_id) works correctly
3. Verify the correct role is assigned
4. Test the full UL stop wizard flow with the KCM Entra account
5. Screenshot the successful authentication as evidence for the TPRA

### Done criteria

- [ ] KCM Entra test account obtained
- [ ] Successful login against staging environment documented
- [ ] Org resolution chain verified end-to-end
- [ ] Auth test evidence saved for TPRA package

---

## S3-7 — Final TPRA Package Assembly and Submission

**Type**: External
**Depends on**: All S2 docs + S3-5 (review) + S3-6 (Entra validation)
**Owner**: Founder

### What to assemble

The TPRA package is the complete submission to KCM IT for procurement approval. It includes:

**Cover document**: `docs/compliance/tpra-package/TPRA_COVER.md`
- Product overview (2 paragraphs)
- Compliance summary (one-sentence per area)
- Index of all attached documents
- Contact information

**Attached documents** (all from `docs/compliance/`):
- NIST SP 800-53 Control Mapping
- WA OCIO 141.10 Alignment Statement
- Incident Response Plan
- Business Continuity Summary
- Data Classification Document
- Log Retention Policy
- Data Use Limitation Policy
- WCAG 2.1 AA Conformance Statement
- TPRA Questionnaire Answers
- Integration Options Matrix
- Hosting SLA Confirmation
- Manual Accessibility Test Results

**Evidence attachments**:
- Screenshot of axe-core audit results (zero critical violations)
- Screenshot of successful KCM Entra SSO login on staging
- Screenshot of OpenAPI spec at `/api/docs`
- Screenshot of audit log endpoint working

### Submission

Submit through KCM IT's TPRA submission process. The founder should be present for any follow-up review meeting.

### Done criteria

- [ ] Cover document written
- [ ] All documents confirmed final (post S3-5 review)
- [ ] Evidence screenshots captured
- [ ] Package submitted to KCM IT
- [ ] Review meeting scheduled

---

## S3-8 — Rotate All Secrets Post-S1

**Type**: Ops
**Depends on**: S1-10 (dependency scan) + S1-11 (auth hardening) — run after S1 audit identifies any leaked values
**Owner**: Founder

### What to rotate

After the S1 code pass, rotate every credential that may have been exposed in source history, logs, or `.env` files — regardless of whether S1 found an active leak. Treat this as a standard post-audit hygiene step.

| Secret | Rotation path |
|--------|--------------|
| `DATABASE_URL` / DB password | Rotate in hosting platform DB console; update env var |
| `AZURE_CLIENT_SECRET` | Rotate in Azure Entra app registration → Certificates & secrets |
| `JWT_SECRET` (if used for confirm tokens) | Generate new value; deploy; existing confirm tokens invalidate |
| SFTP private key | Generate new keypair; update remote SFTP server authorized_keys |
| Any other values in `.env.production` | Rotate and redeploy |

### Implementation notes

- Never commit secrets to git. After rotation, verify `.gitignore` covers all `.env*` files except `.env.example`
- `.env.example` must contain only placeholder values — never real credentials
- Run `git log --all --full-history -- '*.env'` to verify no env files with real values were ever committed

### Done criteria

- [ ] All secrets rotated
- [ ] `.env.example` confirmed placeholder-only
- [ ] Git history checked for any committed env files with real values
- [ ] New values deployed to staging and production
- [ ] Changelog entry written

---

## S3-9 — GitHub Branch Protection on `main`

**Type**: Ops
**Depends on**: R8 CI pipeline complete
**Owner**: Founder

### What to configure

Enable branch protection on `main` in the GitHub repository settings. This enforces that no code reaches `main` without passing CI — satisfying the R8 done-criteria and hardening the change management posture for KCM IT review.

**Required settings:**
- Require status checks to pass before merging
  - Required check: backend integration tests (from R8 workflow)
  - Required check: Docker build (from R8 workflow)
- Require branches to be up to date before merging
- Do not allow bypassing the above settings (uncheck "Allow administrators to bypass")
- Require linear history (optional but recommended)

### Done criteria

- [ ] Branch protection rule active on `main`
- [ ] CI status checks listed as required
- [ ] Admin bypass disabled
- [ ] Verified: a PR with failing tests cannot be merged

---

## S3-10 — Container Registry Configuration

**Type**: Ops
**Depends on**: R8 CI pipeline complete
**Owner**: Founder

### What to configure

Set up the container registry that R8's CI pipeline pushes Docker images to. Either GitHub Container Registry (GHCR) or AWS ECR depending on the hosting platform chosen in S3-1.

**If Azure / GHCR:**
- Enable GHCR on the GitHub organization/personal account
- Create a `GHCR_TOKEN` GitHub Actions secret with package write permission
- Update the R8 workflow `docker/login-action` step with GHCR credentials

**If AWS GovCloud / ECR:**
- Create an ECR repository for `baseline-backend` and `baseline-frontend`
- Create an IAM user with ECR push permissions
- Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as GitHub Actions secrets
- Update the R8 workflow login step for ECR

### Done criteria

- [ ] Registry created and accessible
- [ ] GitHub Actions secrets configured
- [ ] R8 pipeline successfully pushes an image on a test run
- [ ] Registry URL documented in `.env.example` comments

---

## S3-11 — Azure Entra Domain Verification for Production

**Type**: External coordination
**Depends on**: S3-1 (hosting decision)
**Owner**: Founder

### What to verify

The production Azure Entra app registration must be verified against the production domain. For the pilot, this means confirming the app registration's Redirect URI matches the actual staging/production URL — not `localhost`.

Steps:
1. In Azure Entra (Azure AD) → App registrations → BASELINE app → Authentication
2. Update Redirect URIs to include the staging URL (`https://[staging-domain]/auth/callback`)
3. Remove any `localhost` redirect URIs from the production app registration (keep them only in a separate dev app registration)
4. Verify token issuance works end-to-end against the updated redirect URI using the KCM Entra test account (S3-6)

### Done criteria

- [ ] Production app registration redirect URIs updated to staging URL
- [ ] `localhost` redirect URIs removed from production registration
- [ ] End-to-end login test passes against updated registration
- [ ] Dev app registration (with localhost) kept separate

---

## Items the Founder Does Not Need to Do

For completeness — the following are **agent-executable** and do not require founder involvement:

- Sprint 1 all code tasks (S1-1 through S1-9)
- Sprint 2 all policy document drafts (S2-1 through S2-10)
- Dependency vulnerability scan (`npm audit` in backend/ and frontend/)
- Security header verification (CORS, CSP, HSTS)
- OpenAPI spec generation and hosting

The staging environment URL verification and multi-role auth testing are also agent-assistable once a staging URL exists — the founder provides the URL, the agent writes the test scripts.