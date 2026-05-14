import { test, assert, assertEqual } from "../setup";
import {
    detectMimeFromBytes,
    validateMimeBytes,
    validateFilename,
    generateStorageKey,
    UploadRejectedError,
} from "../../src/middleware/uploadValidation";

// --- Magic byte helpers ---

function jpegBuffer(): Buffer {
    const b = Buffer.alloc(16);
    b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
    return b;
}

function pngBuffer(): Buffer {
    const b = Buffer.alloc(16);
    b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47;
    b[4] = 0x0d; b[5] = 0x0a; b[6] = 0x1a; b[7] = 0x0a;
    return b;
}

function webpBuffer(): Buffer {
    const b = Buffer.alloc(16);
    // "RIFF"
    b[0] = 0x52; b[1] = 0x49; b[2] = 0x46; b[3] = 0x46;
    // file size placeholder
    b[4] = 0x00; b[5] = 0x00; b[6] = 0x00; b[7] = 0x00;
    // "WEBP"
    b[8] = 0x57; b[9] = 0x45; b[10] = 0x42; b[11] = 0x50;
    return b;
}

function pdfBuffer(): Buffer {
    // %PDF header — not an allowed image type
    return Buffer.from("%PDF-1.4 garbage bytes padded to twelve+", "ascii");
}

function fakeMulterFile(buf: Buffer): Express.Multer.File {
    return {
        buffer: buf,
        mimetype: "application/octet-stream",
        fieldname: "photos",
        originalname: "test.bin",
        encoding: "7bit",
        size: buf.length,
        stream: null as any,
        destination: "",
        filename: "",
        path: "",
    };
}

// --- detectMimeFromBytes ---

test("detectMimeFromBytes: identifies JPEG magic bytes", async () => {
    assertEqual(detectMimeFromBytes(jpegBuffer()), "image/jpeg", "JPEG detection");
});

test("detectMimeFromBytes: identifies PNG magic bytes", async () => {
    assertEqual(detectMimeFromBytes(pngBuffer()), "image/png", "PNG detection");
});

test("detectMimeFromBytes: identifies WebP magic bytes", async () => {
    assertEqual(detectMimeFromBytes(webpBuffer()), "image/webp", "WebP detection");
});

test("detectMimeFromBytes: returns null for PDF (not an allowed image)", async () => {
    assertEqual(detectMimeFromBytes(pdfBuffer()), null, "PDF not detected as image");
});

test("detectMimeFromBytes: returns null for buffer too short", async () => {
    assertEqual(detectMimeFromBytes(Buffer.alloc(4)), null, "short buffer returns null");
});

// --- validateMimeBytes ---

test("validateMimeBytes: accepts valid JPEG buffer", async () => {
    const mime = validateMimeBytes(fakeMulterFile(jpegBuffer()));
    assertEqual(mime, "image/jpeg", "JPEG accepted");
});

test("validateMimeBytes: throws mime_mismatch for PDF content (path traversal disguise)", async () => {
    let threw = false;
    try {
        validateMimeBytes(fakeMulterFile(pdfBuffer()));
    } catch (e) {
        threw = true;
        assert(e instanceof UploadRejectedError, "should be UploadRejectedError");
        assertEqual((e as UploadRejectedError).reason, "mime_mismatch", "reason should be mime_mismatch");
    }
    assert(threw, "validateMimeBytes should throw for non-image content");
});

// --- validateFilename ---

test("validateFilename: accepts a normal image filename", async () => {
    validateFilename("photo.jpg"); // should not throw
});

test("validateFilename: rejects path traversal with forward slash", async () => {
    let threw = false;
    try {
        validateFilename("../etc/passwd");
    } catch (e) {
        threw = true;
        assert(e instanceof UploadRejectedError, "should be UploadRejectedError");
        assertEqual((e as UploadRejectedError).reason, "invalid_filename", "reason should be invalid_filename");
    }
    assert(threw, "should reject path traversal with ..");
});

test("validateFilename: rejects backslash path traversal", async () => {
    let threw = false;
    try {
        validateFilename("..\\windows\\system32");
    } catch (e) {
        threw = true;
        assert(e instanceof UploadRejectedError, "should be UploadRejectedError");
        assertEqual((e as UploadRejectedError).reason, "invalid_filename", "reason should be invalid_filename");
    }
    assert(threw, "should reject backslash path traversal");
});

// --- generateStorageKey ---

test("generateStorageKey: key never contains client-provided filename", async () => {
    const clientFilename = "evil-../../../etc/passwd.jpg";
    const key = generateStorageKey(42, "completion", "image/jpeg");
    assert(!key.includes(clientFilename), "client filename must not appear in key");
    assert(!key.includes(".."), "key must not contain path traversal");
});

test("generateStorageKey: key matches expected prefix and UUID pattern", async () => {
    const key = generateStorageKey(99, "safety", "image/png");
    const uuidPattern = /^route-run-stops\/99\/safety\/[0-9a-f-]{36}\.png$/;
    assert(uuidPattern.test(key), `key "${key}" does not match UUID pattern`);
});

test("generateStorageKey: successive calls produce different keys", async () => {
    const k1 = generateStorageKey(1, "completion", "image/jpeg");
    const k2 = generateStorageKey(1, "completion", "image/jpeg");
    assert(k1 !== k2, "each call must produce a unique key");
});
