# Ops Workspace — Context

> **PROPOSED FOR RETIREMENT (2026-08-15, HYG-3 — founder call).** This directory has
> been empty except for this file since 2026-05-08; the subfolders the old version
> described (`/deploy`, `/monitoring`, `/scripts`) were never created. Real
> operational material lives elsewhere and should keep doing so:
>
> - Runbooks → `docs/ops/` (deploys, grant posture)
> - Dev environment how-tos → `docs/dev/`
> - Deterministic operational scripts → `backend/src/scripts/` (versioned, typed,
>   run via `pnpm`)
> - Deploy config → repo root (`docker-compose.yml`, `render.yaml`, `.github/`)
>
> If a future need arises for a true ops workspace (e.g. infra-as-code), recreate it
> deliberately with content — don't grow it here by default. Until then: put nothing
> in this directory. Founder may delete it outright when merging HYG-3.
