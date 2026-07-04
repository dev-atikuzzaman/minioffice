/**
 * db.js — local-first data layer.
 * Wraps IndexedDB in a small promise-based API. This is Folio's "database":
 * every document, sheet and slide deck lives here, offline, with no server
 * round-trip required. See supabase/schema.sql for the optional cloud-sync
 * layer that mirrors this same shape.
 */

const DB_NAME = "folio";
const DB_VERSION = 1;
const STORE = "files";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function uid() {
  return "f_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

export const DEFAULTS = {
  doc: () => ({ html: "<p><br></p>" }),
  sheet: () => ({ cols: 12, rows: 40, cells: {} }),
  slide: () => ({
    theme: "aurora",
    slides: [
      {
        id: uid(),
        layout: "title",
        elements: [
          { id: uid(), role: "title", content: "" },
          { id: uid(), role: "subtitle", content: "" },
        ],
      },
    ],
  }),
};

export const Files = {
  async list(type) {
    const store = await tx(STORE, "readonly");
    return new Promise((resolve, reject) => {
      const out = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          if (!type || cur.value.type === type) out.push(cur.value);
          cur.continue();
        } else {
          out.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
  },

  async get(id) {
    const store = await tx(STORE, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async create(type, title) {
    const now = Date.now();
    const record = {
      id: uid(),
      type,
      title: title || defaultTitle(type),
      content: DEFAULTS[type](),
      createdAt: now,
      updatedAt: now,
    };
    const store = await tx(STORE, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.add(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  },

  async update(id, patch) {
    const store = await tx(STORE, "readwrite");
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result;
        if (!rec) return reject(new Error("Not found"));
        Object.assign(rec, patch, { updatedAt: Date.now() });
        const putReq = store.put(rec);
        putReq.onsuccess = () => resolve(rec);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  async duplicate(id) {
    const rec = await Files.get(id);
    if (!rec) throw new Error("Not found");
    const now = Date.now();
    const copy = {
      ...rec,
      id: uid(),
      title: rec.title + " copy",
      content: JSON.parse(JSON.stringify(rec.content)),
      createdAt: now,
      updatedAt: now,
    };
    const store = await tx(STORE, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.add(copy);
      req.onsuccess = () => resolve(copy);
      req.onerror = () => reject(req.error);
    });
  },

  async remove(id) {
    const store = await tx(STORE, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },
};

function defaultTitle(type) {
  if (type === "doc") return "Untitled document";
  if (type === "sheet") return "Untitled spreadsheet";
  return "Untitled presentation";
}

export async function storageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const { usage } = await navigator.storage.estimate();
      return usage || 0;
    } catch {
      return 0;
    }
  }
  return 0;
}
