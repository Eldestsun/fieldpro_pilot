import { S3Client, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

// ============================================================================
// AGENT-SMOKE-1 #4 — storage bootstrap: ensure the upload bucket exists.
//
// The photo path (signed-URL PUT via s3Client.ts) assumes MINIO_BUCKET exists;
// nothing in the deploy chain created it, so a fresh environment failed its
// first upload with a bucket-not-found only discoverable at runtime (the dev
// bucket was hand-created on 2026-08-17). This script runs in the boot chain
// (Dockerfile CMD: migrate → bootstrapStorage → index) with the same
// fail-visible discipline as the migration runner: a missing bucket that
// cannot be created exits non-zero and stops the boot, instead of deferring
// the failure to the first field upload.
//
// Behavior:
//   - HeadBucket succeeds            → no-op (idempotent; the normal prod case
//                                      where the bucket is pre-provisioned).
//   - HeadBucket 404 / NoSuchBucket  → CreateBucket (the dev/MinIO case).
//   - Anything else (bad endpoint, bad credentials, AccessDenied on create)
//                                    → log the specific failure, exit 1.
//
// Uses the same env contract as s3Client.ts (MINIO_ENDPOINT / MINIO_BUCKET /
// MINIO_ACCESS_KEY_ID / MINIO_SECRET_ACCESS_KEY / MINIO_REGION) — one config,
// two consumers, no drift.
// ============================================================================

async function main() {
    const bucket = process.env.MINIO_BUCKET;
    if (!bucket) {
        console.error("[bootstrapStorage] MINIO_BUCKET is not set — refusing to boot without a configured upload bucket.");
        process.exit(1);
    }

    const client = new S3Client({
        region: process.env.MINIO_REGION || "us-east-1",
        endpoint: process.env.MINIO_ENDPOINT,
        credentials: {
            accessKeyId: process.env.MINIO_ACCESS_KEY_ID || "",
            secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY || "",
        },
        forcePathStyle: true, // Required for MinIO
    });

    try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        console.log(`[bootstrapStorage] bucket "${bucket}" exists — nothing to do.`);
        return;
    } catch (err: any) {
        const status = err?.$metadata?.httpStatusCode;
        const code = err?.name || err?.Code || "";
        const isMissing = status === 404 || code === "NotFound" || code === "NoSuchBucket";
        if (!isMissing) {
            console.error(
                `[bootstrapStorage] cannot reach bucket "${bucket}" (endpoint=${process.env.MINIO_ENDPOINT}): ${code || err}`,
            );
            process.exit(1);
        }
    }

    try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`[bootstrapStorage] created bucket "${bucket}".`);
    } catch (err: any) {
        const code = err?.name || err?.Code || "";
        // Lost the create race, or another process made it first — that's success.
        if (code === "BucketAlreadyOwnedByYou" || code === "BucketAlreadyExists") {
            console.log(`[bootstrapStorage] bucket "${bucket}" already exists (created concurrently).`);
            return;
        }
        console.error(
            `[bootstrapStorage] bucket "${bucket}" is missing and could not be created (${code || err}). ` +
            `If this environment's storage is provisioned externally, create the bucket there and redeploy.`,
        );
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("[bootstrapStorage] unexpected failure:", err);
    process.exit(1);
});
