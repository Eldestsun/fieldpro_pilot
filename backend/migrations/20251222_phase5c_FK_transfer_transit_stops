BEGIN;

-- DROP old FKs (adjust names if yours differ)
ALTER TABLE public.clean_logs DROP CONSTRAINT IF EXISTS clean_logs_stop_id_fkey;
ALTER TABLE public.route_run_stops DROP CONSTRAINT IF EXISTS route_run_stops_stop_id_fkey;
ALTER TABLE public.hazards DROP CONSTRAINT IF EXISTS hazards_stop_id_fkey;
ALTER TABLE public.infrastructure_issues DROP CONSTRAINT IF EXISTS infrastructure_issues_stop_id_fkey;
ALTER TABLE public.trash_volume_logs DROP CONSTRAINT IF EXISTS trash_volume_logs_stop_id_fkey;
ALTER TABLE public.level3_logs DROP CONSTRAINT IF EXISTS level3_logs_stop_id_fkey;
ALTER TABLE public.stop_scoring_history DROP CONSTRAINT IF EXISTS stop_scoring_history_stop_id_fkey;
ALTER TABLE public.stop_risk_snapshot DROP CONSTRAINT IF EXISTS stop_risk_snapshot_stop_id_fkey;

-- ADD new FKs to transit_stops(stop_id)
ALTER TABLE public.clean_logs
  ADD CONSTRAINT clean_logs_stop_id_fkey
  FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) NOT VALID;

ALTER TABLE public.route_run_stops
  ADD CONSTRAINT route_run_stops_stop_id_fkey
  FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) NOT VALID;

ALTER TABLE public.hazards
  ADD CONSTRAINT hazards_stop_id_fkey
  FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) NOT VALID;

ALTER TABLE public.infrastructure_issues
  ADD CONSTRAINT infrastructure_issues_stop_id_fkey
  FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) NOT VALID;

ALTER TABLE public.trash_volume_logs
  ADD CONSTRAINT trash_volume_logs_stop_id_fkey
  FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) NOT VALID;

ALTER TABLE public.level3_logs
  ADD CONSTRAINT level3_logs_stop_id_fkey
  FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) NOT VALID;

ALTER TABLE public.stop_scoring_history
  ADD CONSTRAINT stop_scoring_history_stop_id_fkey
  FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) NOT VALID;

ALTER TABLE public.stop_risk_snapshot
  ADD CONSTRAINT stop_risk_snapshot_stop_id_fkey
  FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id) NOT VALID;

COMMIT;

-- validate outside transaction if you want (often safer operationally)
ALTER TABLE public.clean_logs VALIDATE CONSTRAINT clean_logs_stop_id_fkey;
ALTER TABLE public.route_run_stops VALIDATE CONSTRAINT route_run_stops_stop_id_fkey;
ALTER TABLE public.hazards VALIDATE CONSTRAINT hazards_stop_id_fkey;
ALTER TABLE public.infrastructure_issues VALIDATE CONSTRAINT infrastructure_issues_stop_id_fkey;
ALTER TABLE public.trash_volume_logs VALIDATE CONSTRAINT trash_volume_logs_stop_id_fkey;
ALTER TABLE public.level3_logs VALIDATE CONSTRAINT level3_logs_stop_id_fkey;
ALTER TABLE public.stop_scoring_history VALIDATE CONSTRAINT stop_scoring_history_stop_id_fkey;
ALTER TABLE public.stop_risk_snapshot VALIDATE CONSTRAINT stop_risk_snapshot_stop_id_fkey;