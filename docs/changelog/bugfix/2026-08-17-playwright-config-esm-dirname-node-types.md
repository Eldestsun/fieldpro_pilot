# 2026-08-17 — Playwright config: ESM `__dirname` crash + missing Node types

## What changed
- `frontend/playwright.config.ts` — derive `__dirname` from `import.meta.url`
  (`fileURLToPath`) instead of the CommonJS global; imports use `node:` specifiers.
- `frontend/e2e/ul-stop-completion.spec.ts` — same `__dirname` derivation for the
  fixture-photo path; `Page` imported as a type.
- `frontend/e2e/lead-route-creation.spec.ts` — `Page` imported as a type.
- `frontend/package.json` / `pnpm-lock.yaml` — add `@types/node` (devDependency).
- `frontend/tsconfig.e2e.json` (new) — extends `tsconfig.node.json`, covers
  `playwright.config.ts` + `e2e/` with Node types, so the IDE / `tsc` check these
  files with a real project instead of the inferred default.

## Why
- The frontend package is `"type": "module"`, so Playwright loads the config as ESM
  and `__dirname` is undefined → `ReferenceError` on every `playwright test` run
  (`axe:smoke`, `axe:audit`, E2E). Introduced by the CRED-ENVLOCAL `.env.local`
  autoload (3a65883); the same landmine sat in `ul-stop-completion.spec.ts`.
- The IDE surfaced it as `Cannot find module 'fs' / name '__dirname' / name 'process'`
  because the workspace had no `@types/node` and no tsconfig covered these files.
- Verified: `tsc -b` (app) exit 0, `tsc -p tsconfig.e2e.json` exit 0, `pnpm run build`
  exit 0, vitest 87/87, `playwright test --list` lists 9 tests, `axe:smoke` passes.
  ESLint problem count unchanged (175 pre-existing, none in touched files).
- Side effect to know: `pnpm add` re-keyed vite's `.pnpm` store dir (new `@types/node`
  peer), which 500s any already-running Vite dev server — restart `pnpm dev`.

## Files touched
- frontend/playwright.config.ts
- frontend/e2e/ul-stop-completion.spec.ts
- frontend/e2e/lead-route-creation.spec.ts
- frontend/package.json
- frontend/pnpm-lock.yaml
- frontend/tsconfig.e2e.json
- docs/changelog/bugfix/2026-08-17-playwright-config-esm-dirname-node-types.md
