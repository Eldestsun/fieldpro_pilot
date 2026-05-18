# 2026-05-17 — nginx proxy_pass path fix — /api/* routes 404 on Render

## What changed
- `frontend/nginx.conf.template` (production): changed `proxy_pass ${BACKEND_URL}` to `proxy_pass ${BACKEND_URL}/api/`. The trailing-slash path is now explicit.
- `frontend/nginx.conf` (local docker-compose): same proxy_pass fix. Also synced timeout settings from the b72091d cold-start fix: `proxy_connect_timeout 120s`, `proxy_send_timeout 120s`, `proxy_read_timeout 120s` (was 60s), `proxy_next_upstream_timeout 0`.

## Why
- nginx treats `proxy_pass http://host` (no URI) differently from `proxy_pass http://host/` (URI with trailing slash). With no URI, nginx forwards the full original request path unchanged. With a URI (even just `/`), nginx strips the matched location prefix from the request path and substitutes the proxy_pass URI.
- `location /api/ { proxy_pass ${BACKEND_URL}; }` is safe when BACKEND_URL has no trailing slash, but silently breaks when it does: a request to `/api/secure/ping` would be forwarded as `/secure/ping`, which has no handler on the backend and returns 404.
- Making the path explicit — `proxy_pass ${BACKEND_URL}/api/;` — removes the dependency on BACKEND_URL's trailing-slash formatting. nginx strips the location prefix `/api/` and appends the remaining path to `/api/`, always forwarding `/api/secure/ping` as `/api/secure/ping`.
- `nginx.conf` was missing the b72091d timeout increases (still at 60s read timeout). Both files should match so local docker-compose tests cold-start behavior consistently.

## Files touched
- `frontend/nginx.conf.template`
- `frontend/nginx.conf`
- `docs/changelog/2026-05-17-nginx-config-audit.md` (this file)
