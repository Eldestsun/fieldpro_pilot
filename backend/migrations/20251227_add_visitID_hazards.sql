ALTER TABLE public.hazards
ADD COLUMN visit_id BIGINT NULL;

ALTER TABLE public.hazards
ADD CONSTRAINT hazards_visit_id_fkey
FOREIGN KEY (visit_id)
REFERENCES core.visits(id)
ON DELETE SET NULL;

CREATE INDEX idx_hazards_visit_id
ON public.hazards (visit_id);