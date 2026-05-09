BEGIN;

CREATE TABLE public.stop_photos (
    id                  BIGSERIAL PRIMARY KEY,
    route_run_stop_id   BIGINT NOT NULL REFERENCES public.route_run_stops(id) ON DELETE CASCADE,
    s3_key              TEXT NOT NULL,
    kind                TEXT NOT NULL DEFAULT 'generic',
    captured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_oid      TEXT NOT NULL
);

CREATE INDEX idx_stop_photos_route_run_stop_id
    ON public.stop_photos(route_run_stop_id);

COMMIT;