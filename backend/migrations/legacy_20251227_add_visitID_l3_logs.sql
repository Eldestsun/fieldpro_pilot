ALTER TABLE public.level3_logs
ADD COLUMN visit_id BIGINT NULL;

ALTER TABLE public.level3_logs
ADD CONSTRAINT level3_logs_visit_id_fkey
FOREIGN KEY (visit_id)
REFERENCES core.visits(id)
ON DELETE SET NULL;

CREATE INDEX idx_level3_logs_visit_id
ON public.level3_logs (visit_id);