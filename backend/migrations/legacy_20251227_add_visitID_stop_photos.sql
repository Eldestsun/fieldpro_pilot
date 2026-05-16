ALTER TABLE public.stop_photos
ADD COLUMN visit_id BIGINT NULL;

ALTER TABLE public.stop_photos
ADD CONSTRAINT stop_photos_visit_id_fkey
FOREIGN KEY (visit_id)
REFERENCES core.visits(id)
ON DELETE SET NULL;

CREATE INDEX idx_stop_photos_visit_id
ON public.stop_photos (visit_id);