import { canonicalLedgerEvent, photoRetentionState } from "./ledger.mjs";

const DB_NAME = "kiranaflow-pilot-v1";
const DB_VERSION = 2;

function requestResult(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function transactionDone(transaction) { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); transaction.onerror = () => reject(transaction.error); }); }

export function openPilotStore() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) { reject(new Error("IndexedDB is not available in this browser")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("ledger")) db.createObjectStore("ledger", { keyPath: "eventId" });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "photoId" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("catalogue")) db.createObjectStore("catalogue", { keyPath: "sku" });
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}

export async function loadShopProfile(db) { const tx=db.transaction("settings","readonly"),done=transactionDone(tx),row=await requestResult(tx.objectStore("settings").get("shop"));await done;return row??null; }
export async function saveShopProfile(db, profile) { const tx=db.transaction("settings","readwrite"),done=transactionDone(tx);tx.objectStore("settings").put({key:"shop",...profile});await done; }
export async function loadCatalogue(db) { const tx=db.transaction("catalogue","readonly"),done=transactionDone(tx),rows=await requestResult(tx.objectStore("catalogue").getAll());await done;return rows.sort((a,b)=>a.name.localeCompare(b.name)); }
export async function replaceCatalogue(db, products) { const tx=db.transaction("catalogue","readwrite"),done=transactionDone(tx),store=tx.objectStore("catalogue");store.clear();for(const product of products)store.put(product);await done; }
export async function replaceLedger(db, events) { const canonical=events.map(canonicalLedgerEvent),tx=db.transaction("ledger","readwrite"),done=transactionDone(tx),store=tx.objectStore("ledger");store.clear();for(const event of canonical)store.put(event);await done; }

export async function loadLedger(db) { const tx = db.transaction("ledger", "readonly"), done = transactionDone(tx); const rows = await requestResult(tx.objectStore("ledger").getAll()); await done; return rows; }

export async function appendLedger(db, input) {
  const event = canonicalLedgerEvent(input), tx = db.transaction("ledger", "readwrite"), done = transactionDone(tx); tx.objectStore("ledger").add(event); await done; return event;
}

export async function saveRegisterPhoto(db, { photoId, file, uploadedAt }) {
  const row = { photoId, file, fileName: file.name, mimeType: file.type, size: file.size, uploadedAt, status: "PENDING_VERIFICATION", verifiedAt: null };
  const tx = db.transaction("photos", "readwrite"), done = transactionDone(tx); tx.objectStore("photos").add(row); await done; return row;
}

export async function markRegisterPhotoVerified(db, photoId, verifiedAt) {
  const tx = db.transaction("photos", "readwrite"), done = transactionDone(tx), store = tx.objectStore("photos"); const row = await requestResult(store.get(photoId)); if (!row) { tx.abort(); throw new Error("Register photo not found"); }
  row.status = "VERIFIED"; row.verifiedAt = verifiedAt; store.put(row); await done; return row;
}

export async function listPhotoMetadata(db) { const tx = db.transaction("photos", "readonly"), done = transactionDone(tx); const rows = await requestResult(tx.objectStore("photos").getAll()); await done; return rows.map(({ file, ...metadata }) => metadata); }

export async function purgeExpiredRegisterPhotos(db, nowIso) {
  const tx = db.transaction("photos", "readwrite"), done = transactionDone(tx), store = tx.objectStore("photos"), rows = await requestResult(store.getAll()); const deleted = [];
  for (const row of rows) if (photoRetentionState(row, nowIso).deletable) { store.delete(row.photoId); deleted.push(row.photoId); }
  await done; return Object.freeze(deleted);
}
