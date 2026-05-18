# 2026-05-13 — S1-12 File Upload Path Traversal & Validation Hardening

## What changed

### New: `backend/src/middleware/uploadValidation.ts`
Centralized upload validation utilities:
- `MAX_FILE_BYTES`: 25 MB hard cap (overridable via `UPLOAD_MAX_FILE_BYTES` env)
- `ALLOWED_MIME_TYPES`: whitelist — `image/jpeg`, `image/png`, `image/webp`, `image/heic` only
- `detectMimeFromBytes(buf)`: inline magic byte detection (JPEG, PNG, WebP, HEIC) — no external dep
- `validateMimeBytes(file)`: throws `UploadRejectedError("mime_mismatch")` if bytes don't match whitelist
- `validateFilename(filename)`: throws `UploadRejectedError("invalid_filename")` on `/`, `\`, `..`
- `generateStorageKey(routeRunStopId, kind, mime)`: server-generated `route-run-stops/{id}/{kind}/{uuid}.{ext}` — client filename never used
- `UploadRejectedError`: typed error class with `reason: "mime_mismatch" | "size_exceeded" | "invalid_filename"` for audit-safe logging

### Modified: `backend/src/s3Client.ts`
`uploadStopPhotos()` now calls `validateMimeBytes()` + `generateStorageKey()` instead of using `file.originalname` in the S3 key. Client filename is fully excluded from storage path.

### Modified: `backend/src/modules/work/ulRoutes.ts` (multipart upload path)
- multer configured with `limits: { fileSize: MAX_FILE_BYTES, files: 10 }`
- `upload.array()` wrapped in a Promise so `MulterError('LIMIT_FILE_SIZE')` → 413 instead of unhandled crash
- Per-file `validateMimeBytes()` loop before any S3 writes — first bad file short-circuits with 400
- `upload.rejected` audit entry written on size exceeded or MIME mismatch (reason in detail, no filename logged)

### Modified: `backend/src/modules/work/uploadRoutes.ts` (presigned URL path)
- `validateFilename()` check before key generation — path traversal in declared filename → 400 + audit entry
- `ALLOWED_MIME_TYPES` whitelist check on declared `contentType` — unknown type → 400 + audit entry
- `generateStorageKey()` replaces client-filename-derived key — object key is now UUID-based regardless of input

### Modified: `backend/src/modules/admin/adminRoutes.ts`
- `'upload.rejected'` added to `AUDIT_KNOWN_ACTIONS`

### New: `backend/tests/canonical/uploadValidation.test.ts`
12 unit tests — no DB or S3 required:
- Magic byte detection for JPEG, PNG, WebP; null for PDF and short buffers
- `validateMimeBytes` accepts JPEG, throws `mime_mismatch` for PDF content
- `validateFilename` accepts normal names, rejects `../etc/passwd` and backslash traversal
- `generateStorageKey` key never contains client filename, matches UUID pattern, unique per call

## Test baseline
- 35 passed, 15 failed (50 total)
- 15 failures are pre-existing ISSUE-009 fixture failures — unchanged

## Why
- S1-12: client-supplied filenames in S3 keys are a path traversal vector; server-generated UUID keys eliminate it structurally
- Magic byte detection prevents MIME type forgery (e.g. PHP script with `.jpg` extension)
- multer `fileSize` limit prevents unbounded memory allocation from large uploads; 413 response is spec-required
- Audit trail on rejections provides a signal for abuse detection without logging the offending filename

## Files touched
- `backend/src/middleware/uploadValidation.ts` (new)
- `backend/src/s3Client.ts`
- `backend/src/modules/work/ulRoutes.ts`
- `backend/src/modules/work/uploadRoutes.ts`
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/tests/canonical/uploadValidation.test.ts` (new)
- `backend/tests/run.ts`
- `docs/changelog/2026-05-13-s1-12-upload-hardening.md` (this file)
