ALTER TABLE public.infrastructure_issues
ADD COLUMN visit_id BIGINT NULL;

ALTER TABLE public.infrastructure_issues
ADD CONSTRAINT infrastructure_issues_visit_id_fkey
FOREIGN KEY (visit_id)
REFERENCES core.visits(id)
ON DELETE SET NULL;

CREATE INDEX idx_infrastructure_issues_visit_id
ON public.infrastructure_issues (visit_id);