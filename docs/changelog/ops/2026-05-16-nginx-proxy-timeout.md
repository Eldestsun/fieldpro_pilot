# 2026-05-16 — Increase nginx proxy timeouts for backend cold starts

## What changed
- Replaced `proxy_read_timeout 60s` with `proxy_connect_timeout 120s`, `proxy_send_timeout 120s`, and `proxy_read_timeout 120s` in the `/api` location block of `frontend/nginx.conf.template`
- Added `proxy_next_upstream_timeout 0` to prevent nginx from cutting off retry attempts prematurely

## Why
- Render free-tier backend spins down after inactivity; cold-start wake time exceeds the previous 60s read timeout, causing nginx to return a 502 before the backend is ready

## Files touched
- `frontend/nginx.conf.template`
