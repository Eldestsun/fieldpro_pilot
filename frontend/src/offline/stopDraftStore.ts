export interface StopDraft {
    draftVersion: 1;
    updatedAt: string;
    routeRunStopId: number;
    stepIndex: number;
    stepKey?: string;

    // Partial wizard state
    checklist?: any;
    trashVolume?: number;
    safety?: any;
    infra?: any;
}

const DB_NAME = "fieldpro-offline";
const STORE_NAME = "stopDrafts";
const DB_VERSION = 2; // Bumped to 2 to include new store

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => console.error("[stopDraftStore] open error", req.error);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            // Ensure photos store exists (if we started from scratch here)
            if (!db.objectStoreNames.contains("photos")) {
                db.createObjectStore("photos", { keyPath: "localPhotoId" });
            }
            // Ensure stopDrafts store exists
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function getDraftKey(tenantId: string, oid: string, routeRunStopId: number | string): string {
    return `${tenantId}:${oid}:${routeRunStopId}`;
}

export async function saveStopDraft(params: {
    tenantId: string;
    oid: string;
    routeRunStopId: number;
    draft: Omit<StopDraft, "updatedAt" | "draftVersion">;
}): Promise<void> {
    const { tenantId, oid, routeRunStopId, draft } = params;
    if (!tenantId || !oid) return;

    const db = await openDB();
    const id = getDraftKey(tenantId, oid, routeRunStopId);

    const record = {
        id,
        ...draft,
        draftVersion: 1,
        updatedAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function loadStopDraft(params: {
    tenantId: string;
    oid: string;
    routeRunStopId: number;
}): Promise<StopDraft | null> {
    const { tenantId, oid, routeRunStopId } = params;
    if (!tenantId || !oid) return null;

    const db = await openDB();
    const id = getDraftKey(tenantId, oid, routeRunStopId);

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function clearStopDraft(params: {
    tenantId: string;
    oid: string;
    routeRunStopId: number;
}): Promise<void> {
    const { tenantId, oid, routeRunStopId } = params;
    if (!tenantId || !oid) return;

    const db = await openDB();
    const id = getDraftKey(tenantId, oid, routeRunStopId);

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function clearDraftsForUser(tenantId: string, oid: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();

        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return;
            const key = cursor.key as string;
            // Key format: `${tenantId}:${oid}:${routeRunStopId}`
            const prefix = `${tenantId}:${oid}:`;
            if (key.startsWith(prefix)) {
                cursor.delete();
            }
            cursor.continue();
        };

        req.onerror = () => reject(req.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
