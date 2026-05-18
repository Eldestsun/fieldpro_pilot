# 2026-05-15 — Fix missing ssh2-sftp-client type declaration

## What changed
- Added `@types/ssh2-sftp-client@9.0.6` to `backend/devDependencies`.

## Why
- Render CI build failed: `error TS7016: Could not find a declaration file for
  module 'ssh2-sftp-client'`. The runtime package ships without bundled types;
  the DefinitelyTyped stub is required for `tsc` to compile `sftpExport.ts`.

## Files touched
- `backend/package.json`
- `backend/pnpm-lock.yaml`
