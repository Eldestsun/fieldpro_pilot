
export interface StoredPhoto {
    localPhotoId: string;
    tenantId: string;
    oid: string;
    routeRunStopId: number; // Visit-instance identity
    kind: string;
    filename: string;
    contentType: string;
    blob: Blob;
    createdAt: string;
}

const DB_NAME = "fieldpro-offline";
const STORE_NAME = "photos";
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => console.error("[photoStore] open error", req.error);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "localPhotoId" });
            }
            // Ensure stopDrafts store exists (idempotent for photoStore consumers)
            if (!db.objectStoreNames.contains("stopDrafts")) {
                db.createObjectStore("stopDrafts", { keyPath: "id" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function putPhoto(params: {
    tenantId: string;
    oid: string;
    routeRunStopId: number;
    kind: string;
    filename: string;
    contentType: string;
    blob: Blob;
}): Promise<string> {
    // ISSUE-063: materialize the bytes NOW. A File from an <input> is a lazy
    // reference to the on-disk file; structured-cloning it into IndexedDB can
    // persist a snapshot that later reads as 0 bytes (proven: a replay
    // uploaded an empty multipart and drew 400 "File type not allowed").
    // Copying into a plain Blob makes the store own the bytes, and an
    // unreadable/empty source fails HERE — visibly, at capture time — instead
    // of as a doomed queued action.
    if (params.blob.size === 0) {
        throw new Error("Photo file is empty or unreadable — please re-take the photo.");
    }
    // (Response fallback: jsdom Blobs lack arrayBuffer(); browsers use the native call.)
    const bytes = typeof params.blob.arrayBuffer === "function"
        ? await params.blob.arrayBuffer()
        : await new Response(params.blob).arrayBuffer();
    if (bytes.byteLength === 0) {
        throw new Error("Photo file is empty or unreadable — please re-take the photo.");
    }

    const db = await openDB();
    const localPhotoId = crypto.randomUUID();
    const record: StoredPhoto = {
        localPhotoId,
        ...params,
        blob: new Blob([bytes], { type: params.contentType }),
        createdAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.onerror = () => console.error("[photoStore] tx error", tx.error);
        tx.onabort = () => console.error("[photoStore] tx abort", tx.error);

        const store = tx.objectStore(STORE_NAME);
        const req = store.add(record);
        req.onerror = () => console.error("[photoStore] put error", req.error);

        req.onsuccess = () => resolve(localPhotoId);
        // req.onerror is already set above, but the standard reject mapping is below:
        // Actually I should allow the reject to happen too.
        // User asked for: req.onerror = () => console.error(...)
        // Existing code: req.onerror = () => reject(req.error);
        // I can chain them or replace them?
        // JS `onerror` is a property, single handler.
        // I should call console.error AND reject.
        // But `req.addEventListener` is better?
        // `IDBRequest` supports `onerror` property.
        // I'll make the handler do both or add event listener.
        // The user snippet `req.onerror = ...` overwrites.
        // I'll combine them:
        // `req.onerror = () => { console.error(...); reject(req.error); }`
        // But user said "And for the add/put request: req.onerror = ...".
        // I'll implement combined.

        req.onerror = () => {
            console.error("[photoStore] put error", req.error);
            reject(req.error);
        };
    });
}

export async function getPhoto(localPhotoId: string): Promise<StoredPhoto | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(localPhotoId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function deletePhoto(localPhotoId: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(localPhotoId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function clearPhotosForUser(tenantId: string, oid: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();

        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return;
            const v = cursor.value as StoredPhoto;
            if (v.tenantId === tenantId && v.oid === oid) {
                cursor.delete();
            }
            cursor.continue();
        };

        req.onerror = () => reject(req.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
