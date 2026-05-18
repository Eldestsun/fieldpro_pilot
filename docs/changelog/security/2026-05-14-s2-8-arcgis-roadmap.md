# 2026-05-14 — S2-8 ArcGIS Integration Roadmap Narrative

## What changed
- Created `docs/security/arcgis-integration-roadmap.md` — TPRA roadmap narrative for ArcGIS integration (S2-8)
  - Current state: ArcGIS not integrated; existing external data surface is the SFTP nightly export (S1-6, all canonical tables including `eam_bridge_route_log`) and the EAM bridge route log (S1-7)
  - Three integration options documented with trade-offs:
    - **Option A** — ArcGIS Feature Layer via REST API (`/api/stops/geojson`): near-real-time, but introduces new authenticated API surface and network policy dependency
    - **Option B** — SFTP extension to include GeoJSON stop condition file: reuses existing S1-6 infrastructure (key-based auth, strict host-key, SHA-256 tamper evidence), no new attack surface, KCM GIS controls ingestion
    - **Option C** — Esri ArcGIS Maps SDK embedded in Control Center: highest visual fidelity, but adds CDN supply chain dependency and does not deliver data to KCM's ArcGIS environment
  - **Option B recommended** as lowest-friction near-term path; prerequisite is a KCM GIS team point of contact
  - Data inventory for integration: stop location (`stops.lat/lon`), condition score (`stop_condition_history`), last service date (`stop_effort_history`), hazard flags (`is_hotspot`, `compactor`, `has_trash`), route completion status (`route_runs`), exception count (`eam_bridge_route_log`)
  - Security considerations per option included
  - Labor safety hard constraint stated: all integration data is stop-keyed and date-keyed; no worker identity column exists in any contributing table — schema-enforced, not access-control-enforced
  - Strategic framing: BASELINE adds the field-condition truth layer that ArcGIS doesn't currently have; not a replacement for any existing GIS investment

## Why
- Security Sprint 2, item S2-8: KCM IT and the TPRA evaluator will ask how BASELINE integrates with or complements the ArcGIS investment; this document provides an honest, specific roadmap narrative
- Positions BASELINE as additive to the KCM GIS environment rather than a competing data surface
- Hosting-independent: all options described are platform-agnostic

## Files touched
- `docs/security/arcgis-integration-roadmap.md` (new)
- `docs/changelog/2026-05-14-s2-8-arcgis-roadmap.md` (this file)
