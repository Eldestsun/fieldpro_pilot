# BASELINE Incident Response Plan

**Document ID**: S2-3  
**Version**: 1.0  
**Date**: 2026-05-14  
**Owner**: Founder / System Owner, Invaria  
**Status**: Draft — pending founder review (S3-5)  
**Review cadence**: Annually, or after any P1 incident  
**Legal basis**: RCW 19.255.010 (WA data breach notification), TPRA contractual obligation to KCM IT

---

## 1. Purpose and Scope

This plan defines BASELINE's procedure for detecting, containing, notifying, and recovering from a security incident. It applies to all environments where BASELINE processes KCM operational data.

### 1.1 What Constitutes a Reportable Incident

A reportable incident is any event that results in, or is reasonably suspected to have resulted in:

- **Unauthorized access** to BASELINE application data, including route records, stop condition data, photos, or the audit log
- **Audit log exfiltration** — unauthorized read or copy of `audit_log` table contents outside the Admin-gated API endpoint
- **Credential compromise** — an Azure Entra identity used by BASELINE has been compromised, or a BASELINE API secret (database password, SFTP key, KMS key reference) has been exposed
- **Data corruption** affecting route run records, core observations, or core visits in a way that impairs operational truth
- **Ransomware or destructive attack** affecting the hosting environment or database
- **Unauthorized modification** of application code, configuration, or infrastructure

### 1.2 What Does Not Require This Plan

- Routine operational errors (failed route syncs, user-reported UI bugs) — handle via normal support process
- Dependency vulnerability discoveries with no active exploitation — handle as P3 (see §3.3)
- Planned maintenance windows or expected downtime

---

## 2. Severity Classification

| Level | Name | Criteria |
|-------|------|----------|
| **P1** | Active Breach | Confirmed unauthorized access to BASELINE data; confirmed credential compromise; active data exfiltration in progress; ransomware or destructive attack confirmed |
| **P2** | Suspected Breach | Anomalous access patterns detected but not yet confirmed as breach; unusual audit_log entries; failed login spike from unexpected geography or IP; SFTP destination receiving unexpected data |
| **P3** | Vulnerability Discovered | A security vulnerability is found but there is no evidence it has been exploited; dependency CVE reported (high or critical); penetration test finding |

### 2.1 P2 → P1 Promotion Criteria

Promote a P2 to P1 if any of the following are confirmed within 4 hours of initial detection:

- Evidence of data read or copy beyond expected access patterns in the audit_log
- An Azure Entra token issued to an unexpected identity is used to authenticate to BASELINE
- A DB connection from an IP or user not in the expected access set
- The SFTP destination has received data not matching the expected nightly export format or schedule

If P2 criteria are not met within 4 hours but anomalous activity continues, notify KCM IT within 48 hours and continue investigation.

---

## 3. Response Procedures

### 3.1 P1 — Active Breach Response

**Objective**: Contain the breach within 1 hour; notify KCM IT within 24 hours; preserve the audit trail throughout.

**Step 1 — Contain (within 15 minutes of confirmation)**
1. Revoke all Azure Entra application tokens: in Azure Entra admin portal, revoke all sign-in sessions for the BASELINE application registration
2. Rotate database credentials immediately: generate a new `fieldpro` role password; update the environment secret in the hosting platform; restart the application
3. Rotate SFTP key if SFTP destination may have been accessed improperly
4. If active DB exfiltration is in progress: take the application offline (scale to 0 instances or block all inbound traffic at the hosting platform level) to stop the data flow
5. Take a database snapshot immediately before any remediation — this is the forensic baseline

**Step 2 — Preserve Evidence (within 30 minutes of confirmation)**
1. Export the full `audit_log` table to a local file before any remediation query runs:
   ```
   PGPASSWORD=<pass> pg_dump -h <host> -U fieldpro -d fieldpro_db \
     -t audit_log --data-only -F csv > audit_log_export_$(date +%Y%m%d_%H%M%S).csv
   ```
2. Export Azure Entra sign-in logs for the past 30 days from the Azure portal (Entra ID → Monitoring → Sign-in logs → Download CSV)
3. Capture hosting platform access logs if available (server logs, connection logs)
4. Document the exact timestamp of discovery, the anomalous event observed, and every action taken with timestamps — this record is the incident timeline

**Step 3 — Internal Notification (within 1 hour)**
- Founder notifies themselves in writing (email or documented message) of the incident facts as known: what was detected, when, what data may be affected, what containment steps were taken
- This record serves as the internal log of the incident

**Step 4 — KCM IT Notification (within 24 hours of P1 confirmation)**
- Notify KCM IT Security Contact (see §5 Contact List) by the fastest available channel
- Notification must include:
  1. The date and time the incident was confirmed
  2. A description of what occurred (what data, what system, what access method)
  3. The scope of data potentially affected (which tables, which org_id, estimated date range)
  4. Containment actions already taken
  5. Status of the investigation (ongoing / resolved)
  6. Next contact point (founder contact for follow-up)
- Do not delay notification to complete the investigation — notify with available facts and update as findings develop

**Step 5 — WA AGO Notification (if applicable)**
- If the breach affects personal information (as defined in RCW 19.255.010) of more than 500 Washington residents:
  - Notify the Washington State Attorney General's Office via the online reporting portal: [AGO Breach Notification — verify current submission URL at atg.wa.gov]
  - Notification must include: company name, nature of breach, categories of personal information affected, number of residents affected (estimated), steps taken to mitigate
  - Note: Azure Entra OIDs are pseudonymous identifiers. Whether they qualify as "personal information" under RCW 19.255.010 depends on re-identifiability via the Azure Entra directory — treat as personal information for notification purposes
- If the breach affects fewer than 500 residents, AGO notification is not required but is permitted

**Step 6 — Post-Containment Monitoring**
- After credential rotation, monitor Azure Entra sign-in logs and the `audit_log` for further anomalous activity for 72 hours
- Run a dependency vulnerability scan (`pnpm audit --audit-level=high` in both workspaces) to confirm no newly exploitable dependency was the entry point
- Do not re-enable full access until monitoring confirms no ongoing unauthorized access

### 3.2 P2 — Suspected Breach Response

**Objective**: Determine within 4 hours whether the event meets P1 criteria. Document all findings.

1. Pull the last 24 hours of `audit_log` entries via the Admin audit log endpoint (`GET /api/admin/audit-log`) or direct DB query; look for unexpected actions, unexpected actor_oid values, or access at unexpected hours
2. Review Azure Entra sign-in logs for the BASELINE application registration: look for sign-ins from unexpected geographies, IP ranges, or user agent strings
3. Review hosting platform access logs if available
4. If P1 criteria are met at any point during investigation: promote to P1 and follow §3.1
5. If P1 criteria are not confirmed within 4 hours: document findings, continue monitoring, and notify KCM IT within 48 hours of initial detection with a factual summary of what was observed and what investigation was conducted
6. Log all investigation steps and findings in the incident timeline document

### 3.3 P3 — Vulnerability Discovered (Not Yet Exploited)

**Objective**: Remediate within the next sprint cycle; no mandatory external notification unless exploited.

1. Record the vulnerability: CVE identifier (if applicable), affected component, severity rating, discovery method
2. If a critical or high CVE is found in a direct dependency: update the dependency immediately (do not wait for the next sprint) and run the full test suite
3. If the vulnerability is in infrastructure or configuration: create a remediation task and schedule it in the next sprint
4. If the vulnerability is exploited before remediation is complete: promote to P1 or P2 as appropriate
5. No mandatory external notification for P3 unless KCM IT contractual terms require disclosure of discovered vulnerabilities — verify with KCM IT at pilot onboarding

---

## 4. Detection Sources

### 4.1 Current Posture (Demo — Render/Fly.io)

At demo posture, detection is manual and relies on two sources:

| Source | What to Check | How to Access |
|--------|---------------|---------------|
| **`audit_log` table** | Unexpected `action` values, unexpected `actor_oid`, access outside business hours, high-frequency reads | `GET /api/admin/audit-log` (Admin only) or direct DB query |
| **Azure Entra sign-in logs** | Failed login spikes, unexpected geographies, unexpected application registrations | Azure portal → Entra ID → Monitoring → Sign-in logs |

**Limitation**: At demo posture there is no automated alerting, no SIEM, and no real-time anomaly detection. The compensating control is manual log review: the founder should review the `audit_log` weekly and Azure Entra sign-in logs monthly during the demo period. If a suspicious event is discovered, this plan is activated.

**Manual log export procedure** (compensating control for missing SIEM): The founder exports the audit_log weekly as a CSV via `GET /api/admin/audit-log` and stores the export locally as a detection baseline. Deviations from expected patterns in week-over-week comparison are the primary P2 signal at demo posture.

### 4.2 Azure Commercial Posture

When BASELINE is hosted on Azure commercial (Azure App Service + Azure Database for PostgreSQL):

- **Azure Monitor**: configure alerts on database connection spikes, HTTP 401/403 error rate increases, and application restart events
- **Azure Security Center**: continuous vulnerability assessment for the Azure environment; alerts on anomalous access patterns
- **Azure Entra Identity Protection**: automated risk detection for compromised credentials, impossible travel, anonymous IP access
- Update this plan at pilot launch to add the specific Azure Monitor alert runbook and escalation path

### 4.3 Azure Government Posture

When hosted on Azure Government:

- **Azure Sentinel** SIEM becomes available; connect audit_log export and Azure Entra logs to Sentinel for automated correlation
- FedRAMP-Moderate IR control inheritance applies (IR-6, IR-7, IR-8)
- Notification chain may require additional WA State reporting channels — verify with KCM IT and WA OCIO at government hosting decision

---

## 5. Notification Chain

| Role | Notification Timing | Channel |
|------|---------------------|---------|
| **Founder** (first responder) | Immediate on P1 detection | Self-notification; primary incident controller |
| **KCM IT Security Contact** | Within 24 hours of P1 confirmation | [KCM IT Security Contact — to be populated at pilot onboarding] |
| **KCM Legal** | If breach involves KCM employee data or litigation risk | [KCM Legal Contact — to be populated at pilot onboarding] |
| **WA AGO** | If >500 WA residents' personal information affected | AGO online reporting portal (atg.wa.gov) |

> **Do not include personal names, phone numbers, or email addresses in this committed document.** Populate the contact fields in a separate internal contacts file at pilot onboarding and reference it here.

### 5.1 Notification Content Template (KCM IT)

```
Subject: BASELINE Security Incident Notification — [P1/P2] — [Date]

Organization: Invaria / BASELINE field operations system
System: BASELINE (KCM transit stop cleaning operations)
Incident confirmed: [Date and time, Pacific time]
Severity: [P1 — Active Breach / P2 — Suspected Breach]

What occurred:
[2–3 sentences describing what was detected, what system, what data]

Data potentially affected:
[Table names, org_id, estimated date range of affected records]

Containment actions taken:
[Bullet list of steps completed: credential rotation, token revocation, etc.]

Investigation status:
[Ongoing / Resolved — current findings as of notification time]

Next steps:
[What the founder is doing next; expected next update timeline]

Contact for follow-up:
[Founder — contact at pilot onboarding]
```

---

## 6. Evidence Preservation

Evidence must be preserved **before** any remediation action. Remediation that destroys evidence is not acceptable.

| Evidence Item | Preservation Method | Required For |
|---------------|---------------------|--------------|
| `audit_log` export | `pg_dump` or CSV export via Admin API before any DB queries | All P1 incidents |
| Azure Entra sign-in logs | Download from Azure portal (30-day window; export immediately — logs age out) | All P1 incidents |
| Hosting platform access logs | Download from hosting provider dashboard or CLI | P1 if hosting provides them |
| Database snapshot | Automated snapshot via hosting platform, or manual `pg_dump` of full DB | P1; preserve as forensic baseline |
| Incident timeline document | Running text document recording discovery time, all actions taken with timestamps, all findings | P1 and P2 |

**Chain of custody**: all exported evidence files should be named with a timestamp and stored in a location accessible only to the founder. Do not share raw evidence files externally without legal review.

---

## 7. Recovery Steps

After containment is confirmed and evidence is preserved:

1. **Credential rotation**: rotate all secrets that may have been exposed — DB password, SFTP private key, any application API secrets. Update environment secrets in the hosting platform.
2. **Token revocation**: confirm all Azure Entra tokens issued before the incident have been revoked (Azure portal → App registration → Revoke sessions).
3. **DB access review**: query `pg_stat_activity` and hosting platform connection logs to confirm no unexpected connections remain active.
4. **Dependency re-scan**: run `pnpm audit --audit-level=high` in both `backend/` and `frontend/` to confirm no newly disclosed CVE was the entry point.
5. **Re-audit after closure**: once the application is restored, run the audit_log to confirm no further unexpected actions are occurring.
6. **Notify KCM IT of closure**: send a closure notification with: confirmation that the breach is contained, what data was affected, what remediation was completed, and a summary of prevention measures being implemented.
7. **Post-mortem**: complete the post-mortem (§8) within 5 business days of incident closure.

---

## 8. Post-Mortem Template

Complete this template within 5 business days of P1 incident closure. Retain the completed post-mortem in the incident record.

```
# Post-Mortem: [Incident ID] — [Date]

## 1. Timeline
[Chronological list of events: discovery, detection, containment, notification,
recovery, closure. Include timestamps. Include all actions taken and by whom.]

## 2. Root Cause
[What was the root cause of the incident? Be specific:
  - Which system was the entry point?
  - What vulnerability or misconfiguration was exploited?
  - Was it a dependency CVE, a misconfigured access control, a credential leak,
    or something else?]

## 3. Impact
[What data was accessed, modified, or exfiltrated?
  - Which tables or records?
  - How many records?
  - Was any PII involved (Azure Entra OIDs, operational data)?
  - Was KCM operational data affected?
  - Was the audit_log itself affected?
  - What was the downtime or service disruption duration?]

## 4. Remediation
[What was done to resolve the incident?
  - What credentials were rotated?
  - What code or configuration was changed?
  - What external parties were notified and when?
  - Was the post-mortem shared with KCM IT?]

## 5. Prevention
[What will be done to prevent recurrence?
  - Specific sprint tasks to address the root cause
  - Monitoring or alerting improvements
  - Policy or procedure changes
  - Timeline for each prevention item]
```

---

## 9. Contact List (Populate at Pilot Onboarding)

| Role | Name | Contact Method | Backup Contact |
|------|------|----------------|----------------|
| Founder / First Responder | [Name — populate at onboarding] | [Method] | [Backup] |
| KCM IT Security Contact | [KCM IT Security Contact] | [Method] | [Backup] |
| KCM Legal | [KCM Legal Contact] | [Method] | [Backup] |
| WA AGO Reporting | N/A — online portal | atg.wa.gov breach reporting | — |

> Do not commit personal names, phone numbers, or email addresses to this document. Maintain a separate internal contacts reference and link to it from this table.

---

## 10. Review and Maintenance

- This plan is reviewed annually by the founder
- This plan is reviewed and updated after any P1 incident, incorporating post-mortem findings
- When the hosting platform is confirmed (S3-1), §4 (Detection Sources) and §5 (Notification Chain) must be updated to reflect Azure commercial or Azure Government detection capabilities
- When KCM IT contacts are confirmed at pilot onboarding, §9 (Contact List) must be populated in the internal contacts reference
- When S3-8 (secret rotation) is complete, update §7 to confirm the new credential baseline

---

*Reference: RCW 19.255.010 (Washington Data Breach Notification Act) | TPRA contractual requirements | planning/SECURITY_SPRINT_INDEX.md S2-3*
