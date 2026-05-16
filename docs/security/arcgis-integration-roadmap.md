# BASELINE — ArcGIS Integration Roadmap Narrative

**Document**: S2-8
**Version**: 1.0
**Date**: 2026-05-14
**Status**: Pending founder review
**Audience**: KCM IT, TPRA evaluator, KCM GIS team
**Review cadence**: Before each significant release, or when KCM GIS team engagement begins

---

## 1. Executive Summary

ArcGIS is not currently integrated with BASELINE. This document describes what integration exists today, three options for a near-term integration path, and the specific data BASELINE would contribute to the KCM GIS environment.

The framing throughout is additive: BASELINE collects ground-truth field condition data that ArcGIS does not currently have. The integration options below are ways to deliver that data to ArcGIS, not to duplicate or compete with existing GIS infrastructure. KCM's existing ArcGIS investment grows more useful when it can display current stop condition state alongside its existing asset geometry — not by replacing any part of the GIS stack.

No worker identity data appears in any integration option described in this document. This is a schema-enforced constraint, not a configuration setting.

---

## 2. Current Integration Posture

### 2.1 What BASELINE Exports Today

BASELINE's current external data surface is built around two complementary components:

**SFTP Export Writer (S1-6)** — a nightly canonical-data snapshot script (`backend/src/scripts/sftpExport.ts`) that:

- Queries all canonical tables: `core.organizations`, `core.locations`, `core.assignments`, `core.visits`, `core.observations`, `core.evidence` (metadata only), `stop_effort_history`, `stop_condition_history`, and `eam_bridge_route_log`
- Produces two output files per organization: a full canonical JSON bundle (`.json.gz`) and a per-table CSV archive (`.tar.gz`)
- Generates SHA-256 sidecar files for both outputs, providing tamper evidence for the export pipeline
- Uploads to a KCM-controlled SFTP destination via key-based authentication and strict host-key checking
- Writes an `export.data_export` audit log entry on every run
- Explicitly excludes `audit_log` data — audit records leave the system only through the Admin audit export endpoints (S1-3, S1-4)

**EAM Bridge Route Log (S1-7)** — a structured integration table (`eam_bridge_route_log`) that aggregates completed route run data into a format suitable for EAMS work-order generation:

| Column | Content |
|--------|---------|
| `org_id` | Organization identifier |
| `route_run_id` | Foreign key to completed route run |
| `completed_at` | Timestamp of route completion |
| `stop_count` | Total stops serviced in the run |
| `exception_count` | Stops that generated an exception flag |
| `canonical_summary` | JSONB — per-stop status, route_pool_id, run_date |

`eam_bridge_route_log` contains no worker identity columns (`actor_oid`, `captured_by_oid`, `user_id`, `assigned_user_oid`). This is enforced by schema and verified by a dedicated test on every CI run.

`eam_bridge_route_log` is included in the nightly SFTP export payload and is therefore already flowing to the KCM-controlled SFTP destination.

### 2.2 What Is Not Yet Available

ArcGIS is not a current consumer of BASELINE data. No GeoJSON, feature service endpoint, or Esri-formatted export exists. The SFTP export payload is structured for EAMS ingestion, not for GIS feature layer consumption.

Stop locations are stored as `(lat, lon)` decimal degree fields on the `stops` table. The data is geospatially ready; there is no API endpoint or export format that currently delivers it to ArcGIS.

---

## 3. What BASELINE Would Contribute to ArcGIS

The following fields are available for ArcGIS integration from existing canonical tables. All are asset-keyed — none carry worker identity.

| Field | Source table | Notes |
|-------|-------------|-------|
| Stop location | `stops.lat`, `stops.lon` | Decimal degrees; geospatially ready |
| Stop ID / name | `stops.stop_id`, `stops.name` | Joins to all condition and effort tables |
| Current condition score | `stop_condition_history` | Keyed by `(stop_id, date)` — no worker column |
| Last service date | `stop_effort_history` | Keyed by `(stop_id, date)` — no worker column |
| Hazard flags | `stops.is_hotspot`, `stops.compactor`, `stops.has_trash` | Boolean asset attributes |
| Route completion status | `route_runs` | Completion flag, run date, stop count |
| Exception flags | `eam_bridge_route_log.exception_count` | Already flowing via SFTP |

**What BASELINE does not contribute**: Any field derived from `captured_by_oid`, `assigned_user_oid`, or any other worker-identifying attribute. ArcGIS-bound data is stop-keyed and date-keyed. No ArcGIS layer produced from BASELINE data can be used to profile an individual field worker.

---

## 4. Integration Options

### Option A — ArcGIS Feature Layer via REST API

**Mechanism**: Add a read-only `/api/stops/geojson` or `/api/stops/feature-service` endpoint to the BASELINE backend. The endpoint returns current stop condition data in GeoJSON or Esri Feature Service JSON format. ArcGIS Online or ArcGIS Enterprise consumes it as a live feature layer — data refreshes on each ArcGIS layer request.

**Advantages**:
- Near-real-time data — condition scores reflect the most recent field visit
- No additional file transfer infrastructure
- ArcGIS Online can consume a GeoJSON endpoint with minimal configuration

**Disadvantages**:
- Requires BASELINE's API to be network-accessible to KCM's ArcGIS Online or ArcGIS Enterprise instance — raises firewall, network policy, and authentication scope questions
- Adds a new authenticated surface; scope and token management with Azure Entra requires design work
- BASELINE must be running and reachable for the ArcGIS layer to refresh; an outage in BASELINE causes a stale GIS layer

**Security considerations**: The endpoint must require authentication; an unauthenticated public GeoJSON endpoint is not acceptable. OAuth 2.0 client-credential flow or a service principal scoped to the ArcGIS integration would be appropriate. Network policy between the KCM ArcGIS environment and the BASELINE API host must be explicitly defined.

---

### Option B — SFTP Extension to Include GeoJSON Stop Condition File

**Mechanism**: Extend the nightly SFTP export (S1-6) to produce an additional output file per organization: a GeoJSON `FeatureCollection` where each feature is a stop, with condition score, last service date, hazard flags, and route completion status as properties. The file lands at the KCM-controlled SFTP destination alongside the existing JSON and CSV bundles. The KCM GIS team ingests it into ArcGIS via their existing ETL or data pipeline.

**Advantages**:
- No new authentication integration — reuses the existing SFTP infrastructure (key-based auth, strict host-key checking, SHA-256 tamper evidence already in place)
- No new attack surface on the BASELINE API
- KCM GIS team controls ingestion cadence and format transformation; they are not dependent on BASELINE's API availability
- Consistent with the existing EAMS coexistence model — KCM-controlled pipeline, KCM-controlled destination

**Disadvantages**:
- Data is 24-hour-old at the point of ArcGIS layer refresh — not near-real-time
- Requires KCM GIS team to build or configure the ETL step from SFTP to ArcGIS feature layer (a modest but non-zero lift on their side)
- SFTP export failure (network, key rotation, SFTP host change) delays GIS data refresh

**Security considerations**: No new security considerations beyond the existing S1-6 posture. The GeoJSON file contains stop location, condition state, and hazard flags — classified as Internal per the Data Classification Document (S2-5). No PII. SHA-256 checksum generated alongside the file for integrity verification.

**This is the recommended near-term path** — see Section 5.

---

### Option C — Esri ArcGIS Maps SDK for JavaScript Embedded in Control Center

**Mechanism**: Replace the current SVG/canvas risk map in the BASELINE Control Center dashboard (`/admin/control-center`) with an Esri ArcGIS Maps SDK for JavaScript basemap. Stop condition markers are rendered on a KCM Esri basemap using the ArcGIS JS API, consuming BASELINE's own internal data directly in the browser.

**Advantages**:
- Highest visual quality — stop condition overlaid on KCM's actual asset basemap, satellite imagery, or transit route layer
- No backend change required — the SDK runs client-side and queries the BASELINE API internally
- Demonstrates a clear integration story to the TPRA evaluator in a live demo

**Disadvantages**:
- Esri SDK loaded from Esri CDN — introduces a supply chain dependency for an externally hosted JS library in a security-sensitive dashboard surface. CDN availability and integrity become operational dependencies.
- Requires an Esri account and API key for the ArcGIS Maps SDK; this may require coordination with KCM GIS team (they may have an enterprise license that covers this use)
- The current Control Center is functional; replacing the risk map visualization is a non-trivial frontend change
- Does not solve the ArcGIS data-sharing problem for the KCM GIS team — this option puts data on an Esri map in BASELINE's UI, not in KCM's ArcGIS environment

**Security considerations**: The Esri CDN must be added to the Content Security Policy for the Control Center surface. If Esri SDK versions are not pinned with integrity hashes, CSP `require-sri-for` or equivalent controls are advisable. KCM IT should review the SDK's data collection posture (telemetry, usage analytics) before deployment in a KCM-adjacent environment.

---

## 5. Recommended Near-Term Path: Option B (SFTP Extension)

**Option B is the lowest-friction path to ArcGIS integration and is recommended for the pilot phase.**

The SFTP export infrastructure (S1-6) is already built, tested, and in the TPRA package. The existing security posture — key-based auth, strict host-key checking, SHA-256 tamper evidence, no PII in payload — is already documented and reviewed. Extending the export to include a GeoJSON file is an additive change to a single script (`backend/src/scripts/sftpExport.ts`) with no new authentication integration and no new attack surface.

From the KCM GIS team's perspective, the SFTP extension follows the same pattern they likely already use for EAMS ETL and other nightly data feeds. It does not require KCM IT to open firewall rules to a new BASELINE API endpoint, and it does not create a runtime dependency between ArcGIS layer availability and BASELINE API uptime.

**Required for Option B**:
1. A KCM GIS team point of contact to define the GeoJSON schema expectations (field names, coordinate reference system — WGS84 / EPSG:4326 is the default from `stops.lat` / `stops.lon`)
2. A decision on how frequently the ArcGIS layer is refreshed from the SFTP file (daily is the current SFTP cadence; the GIS team may want a separate intra-day feed for operational use cases)
3. An update to the SFTP export script to generate the GeoJSON file alongside the existing outputs
4. SHA-256 checksum generation for the GeoJSON file (consistent with existing S1-6 practice)

Option B can be implemented in a single sprint once the KCM GIS team point of contact is identified.

---

## 6. Strategic Context: Why This Strengthens the Existing ArcGIS Investment

King County Metro's ArcGIS environment currently contains asset geometry for bus shelters — stop locations, routes, and supporting infrastructure. What it does not contain is current field condition state: whether a shelter was cleaned today, whether it has an active hazard flag, or when it was last serviced.

That gap exists because no system currently captures ground-truth field condition data in a form that ArcGIS can consume. EAMS records work orders, but work order completion does not equal verified field condition. A work order marked complete does not confirm that the shelter is clean, undamaged, or hazard-free.

BASELINE fills that gap structurally. Its `stop_condition_history` and `stop_effort_history` tables record verified field state at the point of observation — not at the point of work-order closure. When that data reaches ArcGIS via the SFTP extension, the KCM GIS team gains a condition layer they do not currently have and cannot easily derive from EAMS.

The pitch to KCM GIS is not "replace what you have." It is: "here is the field-truth layer that makes your existing basemap operationally useful for facilities maintenance."

---

## 7. Labor Safety Constraint

No worker identity data appears in any ArcGIS integration option described in this document.

The data BASELINE would contribute to ArcGIS — stop location, condition score, last service date, hazard flags, route completion status — is keyed by stop ID and date. The tables that hold this data (`stop_condition_history`, `stop_effort_history`, `core.observations`) contain no `user_id`, no `captured_by_oid`, and no worker name column. This is enforced by schema design, not by access control.

A KCM GIS analyst viewing BASELINE-derived stop condition data on an ArcGIS map sees: this stop was serviced on this date, its current condition score is X, and it has these active hazard flags. They do not see: which worker serviced it. This is intentional and permanent by architecture.

For the formal statement of the data use limitation and labor safety guarantee, see the Data Use Limitation Policy (S2-7) and `planning/security/ADMIN_ACCESS_POLICY.md`.

---

## 8. Dependencies and Next Steps

| Item | Owner | Status |
|------|-------|--------|
| KCM GIS team point of contact identified | Founder / KCM IT | Not started — prerequisite for Option B |
| Integration option selected (A, B, or C) | Founder + KCM GIS | Not started |
| SFTP GeoJSON extension implemented (Option B) | BASELINE engineering | Not started — one-sprint effort once option selected |
| ArcGIS Online / Enterprise API key / Esri account (Option A or C) | KCM GIS | Not started |
| Firewall / network policy for API access (Option A) | KCM IT | Not started |
| Esri SDK CSP policy update (Option C) | BASELINE engineering | Not started |

ArcGIS integration is **not in the current pilot scope**. This document is a readiness artifact for the conversation with KCM GIS. The SFTP infrastructure is ready to extend; the gap is a KCM GIS team engagement and a decision on integration option.

---

## 9. Document History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-05-14 | Initial narrative — S2-8. Reflects S1-6 SFTP export posture and S1-7 EAM bridge. |

---

## 10. References

| Document | Path |
|----------|------|
| S1-6 changelog (SFTP export writer) | `docs/changelog/2026-05-13-s1-6-sftp-export-writer.md` |
| S1-7 changelog (EAM bridge route log) | `docs/changelog/2026-05-13-s1-7-eam-bridge-route-log.md` |
| SFTP export script | `backend/src/scripts/sftpExport.ts` |
| EAM bridge populate script | `backend/src/scripts/populateEamBridge.ts` |
| Data Classification Document | `docs/security/data-classification.md` (S2-5) |
| Data Use Limitation Policy | `docs/security/data-use-limitation-policy.md` (S2-7) |
| Admin Access Policy | `planning/security/ADMIN_ACCESS_POLICY.md` |
| Log Retention Policy | `docs/security/log-retention-policy.md` (S2-6) |
