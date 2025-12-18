import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import "multer"; // Import to ensure Express.Multer namespace is available

const s3Client = new S3Client({
    region: process.env.MINIO_REGION || "us-east-1",
    endpoint: process.env.MINIO_ENDPOINT, // e.g. http://fieldpro_minio:9000
    credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY || "",
    },
    forcePathStyle: true, // Required for MinIO
});

interface PresignedUrlParams {
    objectKey: string;
    contentType: string;
    expiresInSeconds?: number;
}


export async function getPresignedUploadUrl({
    objectKey,
    contentType,
    expiresInSeconds = 900,
}: PresignedUrlParams): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: process.env.MINIO_BUCKET,
        Key: objectKey,
        ContentType: contentType,
    });

    return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function getPresignedReadUrl(
    objectKey: string,
    expiresInSeconds = 3600 // 1 hour
): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const command = new GetObjectCommand({
        Bucket: process.env.MINIO_BUCKET,
        Key: objectKey,
    });
    return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function uploadFileToS3(
    key: string,
    body: Buffer,
    contentType: string
): Promise<void> {
    const command = new PutObjectCommand({
        Bucket: process.env.MINIO_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
    });
    await s3Client.send(command);
}

export async function uploadStopPhotos(
    files: Express.Multer.File[],
    context: { routeRunStopId: number; userOid: string; routeRunId: number; kind?: string }
): Promise<{ s3Key: string }[]> {
    const { routeRunStopId, routeRunId, kind = "completion" } = context;
    const results: { s3Key: string }[] = [];

    for (const file of files) {
        // Generate key: route-run-stops/{routeRunStopId}/{kind}/{timestamp}-{random}.{ext}
        // Updated to match signed-url pattern and include kind
        const timestamp = new Date().getTime();
        const random = Math.floor(Math.random() * 10000);
        // Sanitize original name or basic ext
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "-");

        // Use consistent path structure with signed-url flow
        const key = `route-run-stops/${routeRunStopId}/${kind}/${timestamp}-${random}-${safeName}`;

        await uploadFileToS3(key, file.buffer, file.mimetype);
        results.push({ s3Key: key });
    }

    return results;
}
