# 2026-05-10 — R4 Sub-task E: Dead Letter and Retry Hardening

## What changed
- Added `retryCount?: number` field to the `OfflineAction` interface in `offlineQueue.ts`
- Added `RETRY_NEEDED_PHOTO_MISSING` branch in `runReplay` error handling: if the error is a missing-photo temporary failure and `retryCount < 3`, the action is reset to 'pending' with an incremented `retryCount` instead of being dead-lettered; on the 4th failure it falls through to 'failed' permanently
- `retryCount` is persisted in localStorage alongside the action so retry state survives app restart

## Why
- Previously, any COMPLETE_STOP or SKIP_STOP action blocked by a missing photo was permanently dead-lettered as 'failed' on the first replay attempt
- In offline replay order (UPLOAD_STOP_PHOTOS → COMPLETE_STOP), a transient photo-upload delay could permanently lose a stop completion that would have succeeded on the next pass
- Three retries gives the photo upload time to land without allowing infinite retry loops

## Files touched
- `frontend/src/offline/offlineQueue.ts`
