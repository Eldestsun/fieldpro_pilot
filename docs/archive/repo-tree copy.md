# Repository tree (excluding .git, node_modules, venv/.venv, __pycache__, IDE folders)

```
.
├── backend/
│   ├── dist/
│   │   ├── domains/
│   │   │   ├── observation/
│   │   │   │   ├── observationService.js
│   │   │   │   └── observationService.js.map
│   │   │   ├── routeRun/
│   │   │   │   ├── loaders/
│   │   │   │   │   ├── loadRouteRunById.js
│   │   │   │   │   └── loadRouteRunById.js.map
│   │   │   │   ├── operations/
│   │   │   │   │   ├── startRouteRunStop.js
│   │   │   │   │   └── startRouteRunStop.js.map
│   │   │   │   ├── routeOverrideService.js
│   │   │   │   ├── routeOverrideService.js.map
│   │   │   │   ├── routeRunService.js
│   │   │   │   └── routeRunService.js.map
│   │   │   ├── routeRunStop/
│   │   │   │   ├── cleanLogService.js
│   │   │   │   ├── cleanLogService.js.map
│   │   │   │   ├── hazardService.js
│   │   │   │   ├── hazardService.js.map
│   │   │   │   ├── infrastructureIssueService.js
│   │   │   │   ├── infrastructureIssueService.js.map
│   │   │   │   ├── stopPhotosService.js
│   │   │   │   └── stopPhotosService.js.map
│   │   │   └── visit/
│   │   │       ├── visitService.js
│   │   │       └── visitService.js.map
│   │   ├── intelligence/
│   │   │   ├── riskMapJob.js
│   │   │   ├── riskMapJob.js.map
│   │   │   ├── riskMapService.js
│   │   │   └── riskMapService.js.map
│   │   ├── modules/
│   │   │   ├── admin/
│   │   │   │   ├── adminRoutes.js
│   │   │   │   ├── adminRoutes.js.map
│   │   │   │   ├── resourceRoutes.js
│   │   │   │   └── resourceRoutes.js.map
│   │   │   ├── ops/
│   │   │   │   ├── opsRoutes.js
│   │   │   │   └── opsRoutes.js.map
│   │   │   ├── routeOverrides/
│   │   │   │   ├── routeOverrideRoutes.js
│   │   │   │   └── routeOverrideRoutes.js.map
│   │   │   ├── routes/
│   │   │   │   ├── routeRunRoutes.js
│   │   │   │   └── routeRunRoutes.js.map
│   │   │   └── work/
│   │   │       ├── routeRunStopRoutes.js
│   │   │       ├── routeRunStopRoutes.js.map
│   │   │       ├── stopRoutes.js
│   │   │       ├── stopRoutes.js.map
│   │   │       ├── ulRoutes.js
│   │   │       ├── ulRoutes.js.map
│   │   │       ├── uploadRoutes.js
│   │   │       └── uploadRoutes.js.map
│   │   ├── routes/
│   │   │   ├── devRoutes.js
│   │   │   ├── devRoutes.js.map
│   │   │   ├── healthRoutes.js
│   │   │   ├── healthRoutes.js.map
│   │   │   ├── routes.js
│   │   │   └── routes.js.map
│   │   ├── routing/
│   │   │   ├── corridorRefine.js
│   │   │   ├── corridorRefine.js.map
│   │   │   ├── curbsidePostOptimize.js
│   │   │   ├── curbsidePostOptimize.js.map
│   │   │   ├── routeCost.js
│   │   │   └── routeCost.js.map
│   │   ├── services/
│   │   │   ├── adminPoolService.js
│   │   │   ├── adminPoolService.js.map
│   │   │   ├── adminStopService.js
│   │   │   ├── adminStopService.js.map
│   │   │   ├── cleanLogService.js
│   │   │   ├── cleanLogService.js.map
│   │   │   ├── hazardService.js
│   │   │   ├── hazardService.js.map
│   │   │   ├── infrastructureIssueService.js
│   │   │   ├── infrastructureIssueService.js.map
│   │   │   ├── observationService.js
│   │   │   ├── observationService.js.map
│   │   │   ├── routeOverrideService.js
│   │   │   ├── routeOverrideService.js.map
│   │   │   ├── routeRunService.js
│   │   │   ├── routeRunService.js.map
│   │   │   ├── stopPhotosService.js
│   │   │   ├── stopPhotosService.js.map
│   │   │   ├── visitService.js
│   │   │   └── visitService.js.map
│   │   ├── .DS_Store
│   │   ├── app.js
│   │   ├── app.js.map
│   │   ├── authz.js
│   │   ├── authz.js.map
│   │   ├── db.js
│   │   ├── db.js.map
│   │   ├── index.js
│   │   ├── index.js.map
│   │   ├── osrm.js
│   │   ├── osrm.js.map
│   │   ├── osrmClient.js
│   │   ├── osrmClient.js.map
│   │   ├── run_migration_washed_can.js
│   │   ├── run_migration_washed_can.js.map
│   │   ├── s3Client.js
│   │   └── s3Client.js.map
│   ├── migrations/
│   │   ├── 20251203_add_details_to_hazards.sql
│   │   ├── 20251203_add_infrastructure_issue_fields.sql
│   │   ├── 20251206_add_lead_route_overrides.sql
│   │   ├── 20251208_mv_migration_patch_uniqueIndexForConcurrentRefresh.sql
│   │   ├── 20251208_mv_v1.sql
│   │   ├── 20251212_add_routr_run_stops.origin_type.sql
│   │   ├── 20251212_add_stops.priorityclass.sql
│   │   ├── 20251212_day7_mv_hardening_and_exports.sql
│   │   ├── 20251214_add_photo_keys.sql
│   │   ├── 20251216_add_washed_can.sql
│   │   ├── 20251221_phase5c_DB_asset_flip.sql
│   │   ├── 20251222_phase5c_convert_stops_RO_compat_view
│   │   ├── 20251222_phase5c_create_transit_stops.sql
│   │   ├── 20251222_phase5c_escape_hatch
│   │   ├── 20251222_phase5c_FK_transfer_transit_stops
│   │   ├── 20251223_001_route_run_identity.sql
│   │   ├── 20251223_002_identity_directory.sql
│   │   ├── 20251223_assign_user_oid_route_runs.sql
│   │   ├── 20251223_DevOnly_oid_backfill.sql
│   │   ├── 20251226_01_core_state_layer_spine.sql
│   │   ├── 20251226_add_passthrough_clean_logs.sql
│   │   ├── 20251226_add_passthrough_hazards.sql
│   │   ├── 20251226_add_passthrough_infrastructure.sql
│   │   ├── 20251226_add_passthrough_l3_logs.sql
│   │   ├── 20251226_add_passthrough_stop_photos.sql
│   │   ├── 20251226_add_passthrough_trash_volume_logs.sql
│   │   ├── 20251226_assignment_mapping_v1.sql
│   │   ├── 20251226_core_backfill_coreAsset_locations_from_transit_stop_assets.sql
│   │   ├── 20251226_core_canonical_mapping_views_v1.sql
│   │   ├── 20251226_core_enforc_org_id_consistency_trigger.sql
│   │   ├── 20251226_core_invariants.sql
│   │   ├── 20251226_core_mapping_views.sql
│   │   ├── 20251226_core_stop_2_location_view.sql
│   │   ├── 20251227_add_visitID_hazards.sql
│   │   ├── 20251227_add_visitID_infrastructure_issues.sql
│   │   ├── 20251227_add_visitID_l3_logs.sql
│   │   ├── 20251227_add_visitID_public_clean_logs.sql
│   │   ├── 20251227_add_visitID_stop_photos.sql
│   │   ├── 20251227_add_visitID_trash_volume_logs.sql
│   │   ├── 20261226_core_backfill_coreLocations_+_coreLocation_external_ids_v1.sql
│   │   ├── V1_add_stop_photos.sql
│   │   └── V20251202__intelligence_foundation.sql
│   ├── src/
│   │   ├── domains/
│   │   │   ├── observation/
│   │   │   │   └── observationService.ts
│   │   │   ├── routeRun/
│   │   │   │   ├── loaders/
│   │   │   │   │   └── loadRouteRunById.ts
│   │   │   │   ├── operations/
│   │   │   │   │   └── startRouteRunStop.ts
│   │   │   │   ├── routeOverrideService.ts
│   │   │   │   └── routeRunService.ts
│   │   │   ├── routeRunStop/
│   │   │   │   ├── cleanLogService.ts
│   │   │   │   ├── hazardService.ts
│   │   │   │   ├── infrastructureIssueService.ts
│   │   │   │   └── stopPhotosService.ts
│   │   │   └── visit/
│   │   │       └── visitService.ts
│   │   ├── intelligence/
│   │   │   ├── riskMapJob.ts
│   │   │   └── riskMapService.ts
│   │   ├── modules/
│   │   │   ├── admin/
│   │   │   │   ├── adminRoutes.ts
│   │   │   │   └── resourceRoutes.ts
│   │   │   ├── ops/
│   │   │   │   └── opsRoutes.ts
│   │   │   ├── routeOverrides/
│   │   │   │   └── routeOverrideRoutes.ts
│   │   │   ├── routes/
│   │   │   │   └── routeRunRoutes.ts
│   │   │   └── work/
│   │   │       ├── routeRunStopRoutes.ts
│   │   │       ├── stopRoutes.ts
│   │   │       ├── ulRoutes.ts
│   │   │       └── uploadRoutes.ts
│   │   ├── routes/
│   │   │   ├── devRoutes.ts
│   │   │   └── healthRoutes.ts
│   │   ├── routing/
│   │   │   ├── corridorRefine.ts
│   │   │   ├── curbsidePostOptimize.ts
│   │   │   └── routeCost.ts
│   │   ├── services/
│   │   │   ├── adminPoolService.ts
│   │   │   └── adminStopService.ts
│   │   ├── types/
│   │   │   └── express.d.ts
│   │   ├── app.ts
│   │   ├── authz.ts
│   │   ├── db.ts
│   │   ├── express.d.ts
│   │   ├── index.ts
│   │   ├── osrmClient.ts
│   │   ├── run_migration_washed_can.ts
│   │   └── s3Client.ts
│   ├── .DS_Store
│   ├── .env
│   ├── .env.example
│   ├── full_stop_update.csv
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── route_pool_seed.csv
│   ├── stops.cleaned.csv
│   ├── stops_name_update.csv
│   ├── test-photo.jpg
│   ├── test.txt
│   └── tsconfig.json
├── data/
│   ├── db/
│   │   ├── base/...
│   ├── osrm/
│   │   ├── seattle.osm.pbf
│   │   ├── seattle.osrm
│   │   ├── seattle.osrm.cell_metrics
│   │   ├── seattle.osrm.cells
│   │   ├── seattle.osrm.cnbg
│   │   ├── seattle.osrm.cnbg_to_ebg
│   │   ├── seattle.osrm.datasource_names
│   │   ├── seattle.osrm.ebg
│   │   ├── seattle.osrm.ebg_nodes
│   │   ├── seattle.osrm.edges
│   │   ├── seattle.osrm.enw
│   │   ├── seattle.osrm.fileIndex
│   │   ├── seattle.osrm.geometry
│   │   ├── seattle.osrm.icd
│   │   ├── seattle.osrm.maneuver_overrides
│   │   ├── seattle.osrm.mldgr
│   │   ├── seattle.osrm.names
│   │   ├── seattle.osrm.nbg_nodes
│   │   ├── seattle.osrm.partition
│   │   ├── seattle.osrm.properties
│   │   ├── seattle.osrm.ramIndex
│   │   ├── seattle.osrm.restrictions
│   │   ├── seattle.osrm.timestamp
│   │   ├── seattle.osrm.tld
│   │   ├── seattle.osrm.tls
│   │   ├── seattle.osrm.turn_duration_penalties
│   │   ├── seattle.osrm.turn_penalties_index
│   │   └── seattle.osrm.turn_weight_penalties
│   ├── .DS_Store
│   └── .gitkeep
├── db_dumps/
│   ├── 2025-12-26/
│   │   ├── db_dumps/
│   │   │   └── pg_schema_public_core.sql
│   │   ├── .DS_Store
│   │   ├── pg_objects_core.sql
│   │   ├── pg_objects_public.sql
│   │   ├── pg_schema_all.sql
│   │   ├── pg_schema_core.sql
│   │   └── pg_schema_public.sql
│   └── .DS_Store
├── docs/
│   ├── api/
│   ├── changelog/
│   ├── guides/
│   └── CONTEXT.md
├── frontend/
│   ├── dist/
│   │   ├── assets/
│   │   │   ├── index-C28r5HD8.js
│   │   │   └── index-CrtJunBn.css
│   │   ├── index.html
│   │   └── vite.svg
│   ├── public/
│   │   └── vite.svg
│   ├── src/
│   │   ├── api/
│   │   │   └── routeRuns.ts
│   │   ├── assets/
│   │   │   ├── invaria-baseline.svg
│   │   │   └── react.svg
│   │   ├── auth/
│   │   │   ├── AuthContext.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   └── RequireRole.tsx
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   │   ├── AdminControlCenter.tsx
│   │   │   │   ├── AdminDashboard.tsx
│   │   │   │   ├── AdminPoolsPanel.tsx
│   │   │   │   └── AdminStopsPanel.tsx
│   │   │   ├── common/
│   │   │   │   └── ImagePreviewModal.tsx
│   │   │   ├── today-route/
│   │   │   │   ├── RouteHeader.tsx
│   │   │   │   ├── StopChecklist.tsx
│   │   │   │   ├── StopDetail.tsx
│   │   │   │   ├── StopList.tsx
│   │   │   │   ├── StopListItem.tsx
│   │   │   │   └── UlLayout.tsx
│   │   │   ├── ui/
│   │   │   │   ├── OpsBadge.tsx
│   │   │   │   ├── OpsButton.tsx
│   │   │   │   ├── OpsCard.tsx
│   │   │   │   ├── OpsLayout.tsx
│   │   │   │   └── OpsTable.tsx
│   │   │   ├── work/
│   │   │   │   └── ULRouteMap.tsx
│   │   │   ├── LeadCompletedRouteDetail.tsx
│   │   │   ├── LeadRouteDetail.tsx
│   │   │   ├── LeadRoutesPanel.tsx
│   │   │   ├── RouteCreatePanel.tsx
│   │   │   ├── RouteSummary.tsx
│   │   │   └── TodayRouteView.tsx
│   │   ├── hooks/
│   │   │   ├── useCreateRoute.ts
│   │   │   └── useTodayRoute.ts
│   │   ├── offline/
│   │   │   ├── offlineQueue.ts
│   │   │   ├── OfflineSyncManager.tsx
│   │   │   ├── photoStore.ts
│   │   │   ├── stopDraftStore.ts
│   │   │   ├── todayRouteCache.ts
│   │   │   └── useSyncStatus.ts
│   │   ├── utils/
│   │   │   ├── formatStopLocation.ts
│   │   │   ├── identity.ts
│   │   │   ├── offlineMode.ts
│   │   │   └── sortStops.ts
│   │   ├── .DS_Store
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── main.tsx
│   │   ├── msalConfig.ts
│   │   └── vite-env.d.ts
│   ├── .env.example
│   ├── .env.local
│   ├── .gitignore
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── README.md
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── ops/
│   ├── deploy/
│   ├── monitoring/
│   ├── scripts/
│   └── CONTEXT.md
├── planning/
│   ├── architecture/
│   │   └── target_architecture.md
│   ├── decisions/
│   ├── specs/
│   └── CONTEXT.md
├── Scripts/
│   └── .DS_Store
├── .DS_Store
├── .env
├── .env.example
├── .gitignore
├── AGENTS.MD
├── baseline_pre_asset_refactor.fieldpro_db
├── BUILD_LOG.md
├── docker-compose.yml
├── GEMINI.md
├── package-lock.json
├── pg_state.sql
└── repo-tree.md
```
