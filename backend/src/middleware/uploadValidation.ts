import { randomUUID } from "crypto";

export const MAX_FILE_BYTES = Number(process.env.UPLOAD_MAX_FILE_BYTES ?? 25 * 1024 * 1024);

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export type RejectionReason = "mime_mismatch" | "size_exceeded" | "invalid_filename";

export class UploadRejectedError extends Error {
  constructor(public readonly reason: RejectionReason) {
    super(reason);
    this.name = "UploadRejectedError";
  }
}

export function detectMimeFromBytes(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";

  // WebP: "RIFF" at 0..3 and "WEBP" at 8..11
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";

  // HEIC: "ftyp" at bytes 4..7, brand at 8..11 (heic, heis, mif1, msf1)
  if (
    buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70
  ) {
    const brand = buf.slice(8, 12).toString("ascii");
    if (["heic", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
  }

  return null;
}

export function validateMimeBytes(file: Express.Multer.File): string {
  const detected = detectMimeFromBytes(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected)) {
    throw new UploadRejectedError("mime_mismatch");
  }
  return detected;
}

export function validateFilename(filename: string): void {
  if (
    !filename ||
    typeof filename !== "string" ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..")
  ) {
    throw new UploadRejectedError("invalid_filename");
  }
}

export function generateStorageKey(
  routeRunStopId: number,
  kind: string,
  mime: string
): string {
  const ext = EXT_MAP[mime] ?? "bin";
  return `route-run-stops/${routeRunStopId}/${kind}/${randomUUID()}.${ext}`;
}
