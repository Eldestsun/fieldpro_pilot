ALTER TABLE public.clean_logs
ADD COLUMN visit_id BIGINT NULL;

ALTER TABLE public.clean_logs
ADD CONSTRAINT clean_logs_visit_id_fkey
FOREIGN KEY (visit_id)
REFERENCES core.visits(id)
ON DELETE SET NULL;

CREATE INDEX idx_clean_logs_visit_id
ON public.clean_logs (visit_id);