ALTER TABLE public.trash_volume_logs
ADD COLUMN visit_id BIGINT NULL;

ALTER TABLE public.trash_volume_logs
ADD CONSTRAINT trash_volume_logs_visit_id_fkey
FOREIGN KEY (visit_id)
REFERENCES core.visits(id)
ON DELETE SET NULL;

CREATE INDEX idx_trash_volume_logs_visit_id
ON public.trash_volume_logs (visit_id);