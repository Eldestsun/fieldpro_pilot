export interface StopDraft {
    draftVersion: 1;
    updatedAt: string;
    routeRunStopId: number;
    routeRunId?: number; // Added for scope validation
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

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => {
            console.error("[stopDraftStore] open error", req.error);
            reject(req.error);
        };
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
        req.onsuccess = () => {
            dbInstance = req.result;
            // Handle connection closing (e.g. from other tabs or deleteDatabase calls)
            dbInstance.onversionchange = () => {
                dbInstance?.close();
                dbInstance = null;
            };
            dbInstance.onclose = () => {
                dbInstance = null;
            };
            resolve(dbInstance);
        };
    });
}

export function closeStopDraftDB() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}

function getDraftKey(tenantId: string, oid: string, routeRunStopId: number | string): string {
    return `${tenantId}:${oid}:${routeRunStopId}`;
}

export async function saveStopDraft(params: {
    tenantId: string;
    oid: string;
    routeRunStopId: number;
    draft: Omit<StopDraft, "updatedAt" | "draftVersion"> & { routeRunId?: number };
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
    currentRouteRunId?: number; // Optional check
}): Promise<StopDraft | null> {
    const { tenantId, oid, routeRunStopId, currentRouteRunId } = params;
    if (!tenantId || !oid) return null;

    const db = await openDB();
    const id = getDraftKey(tenantId, oid, routeRunStopId);

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);

        req.onsuccess = () => {
            const draft = req.result as StopDraft;
            if (!draft) {
                resolve(null);
                return;
            }

            // 1. Validate Scope (prevent zombie drafts from previous runs with same stop ID)
            if (currentRouteRunId !== undefined && draft.routeRunId !== undefined) {
                if (draft.routeRunId !== currentRouteRunId) {
                    console.warn("[loadStopDraft] Discarding draft due to routeRunId mismatch", { draftRun: draft.routeRunId, currentRun: currentRouteRunId });
                    resolve(null);
                    return;
                }
            }

            // 2. Validate TTL (24 hours)
            const draftTime = new Date(draft.updatedAt).getTime();
            const now = Date.now();
            const hoursOld = (now - draftTime) / (1000 * 60 * 60);

            if (hoursOld > 24) {
                console.warn("[loadStopDraft] Discarding expired draft", { ageHours: hoursOld });
                resolve(null); // Optionally delete it here too?
                return;
            }

            resolve(draft);
        };
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
