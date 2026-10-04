import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFirebaseServices } from "./firebase-admin.mjs";

const ARRAY_KEYS = [
  "customers",
  "vendors",
  "products",
  "inventory_movements",
  "orders",
  "order_sourcing_lines",
  "payments",
  "shipments",
  "expenses",
  "gold_prices",
  "market_price_snapshots",
  "users",
  "audit_logs",
];

const snapshotByState = new WeakMap();
const jsonSnapshotByState = new WeakMap();

class StoreConflictError extends Error {
  constructor(message = "Dữ liệu vừa được người khác cập nhật. Vui lòng tải lại và thử lại.") {
    super(message);
    this.name = "StoreConflictError";
    this.statusCode = 409;
  }
}

function useFirestore() {
  return process.env.DATA_BACKEND === "firestore";
}

function collectionName(key) {
  return `${process.env.FIRESTORE_COLLECTION_PREFIX || ""}${key}`;
}

function metaCollection() {
  return collectionName("_trinket");
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function stableString(value) {
  return JSON.stringify(canonicalValue(value));
}

function documentId(item, index) {
  const candidate = item?.id || item?.uid || item?.karat || item?.code || "";
  if (candidate && !String(candidate).includes("/")) return String(candidate);
  return `row_${index}_${crypto.createHash("sha1").update(JSON.stringify(item || {})).digest("hex").slice(0, 12)}`;
}

function stateCollections(state) {
  return Object.fromEntries(ARRAY_KEYS.map((key) => {
    const rows = Array.isArray(state[key]) ? state[key] : [];
    const docs = new Map(rows.map((row, index) => {
      const id = documentId(row, index);
      return [id, { ...jsonClone(row), __order: index }];
    }));
    return [key, docs];
  }));
}

function stateRuntime(state) {
  const excluded = new Set(["schema_version", "settings", ...ARRAY_KEYS, "__actor"]);
  return Object.fromEntries(Object.entries(state)
    .filter(([key]) => !excluded.has(key))
    .map(([key, value]) => [key, jsonClone(value)]));
}

function captureSnapshot(state, revision = 0) {
  snapshotByState.set(state, {
    revision,
    collections: stateCollections(state),
    settings: jsonClone(state.settings || {}),
    runtime: stateRuntime(state),
  });
  return state;
}

function ensureJsonStore(seedPath, storePath) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  if (!fs.existsSync(storePath)) fs.copyFileSync(seedPath, storePath);
}

async function readJsonState({ seedPath, storePath }) {
  ensureJsonStore(seedPath, storePath);
  const source = fs.readFileSync(storePath, "utf8");
  const state = JSON.parse(source);
  jsonSnapshotByState.set(state, source);
  return state;
}

async function writeJsonState(state, { storePath }) {
  // Reads may overlap while requests await uploads/bodies. Never overwrite a newer local state.
  if (jsonSnapshotByState.get(state) !== fs.readFileSync(storePath, "utf8")) throw new StoreConflictError();
  const tempPath = `${storePath}.${process.pid}.tmp`;
  const source = `${JSON.stringify(state, null, 2)}\n`;
  fs.writeFileSync(tempPath, source);
  fs.renameSync(tempPath, storePath);
  jsonSnapshotByState.set(state, source);
  return state;
}

async function readFirestoreState() {
  const { firestore } = getFirebaseServices();
  const metaRef = firestore.collection(metaCollection()).doc("state");
  const settingsRef = firestore.collection(metaCollection()).doc("settings");
  const runtimeRef = firestore.collection(metaCollection()).doc("runtime");
  const [metaSnap, settingsSnap, runtimeSnap, ...collectionSnaps] = await Promise.all([
    metaRef.get(),
    settingsRef.get(),
    runtimeRef.get(),
    ...ARRAY_KEYS.map((key) => firestore.collection(collectionName(key)).get()),
  ]);

  if (!metaSnap.exists) {
    const error = new Error("Firestore chưa có dữ liệu Trinket. Hãy chạy script migration trước khi bật production.");
    error.statusCode = 503;
    throw error;
  }

  const state = {
    ...(runtimeSnap.exists ? runtimeSnap.data() : {}),
    schema_version: Number(metaSnap.data()?.schema_version || 1),
    settings: settingsSnap.exists ? settingsSnap.data() : {},
  };
  ARRAY_KEYS.forEach((key, index) => {
    state[key] = collectionSnaps[index].docs
      .map((doc) => ({ __docId: doc.id, ...doc.data() }))
      .sort((a, b) => Number(a.__order || 0) - Number(b.__order || 0))
      .map(({ __docId, __order, ...row }) => row);
  });

  return captureSnapshot(state, Number(metaSnap.data()?.revision || 0));
}

function changedDocuments(before, after) {
  const writes = [];
  const deletes = [];
  const ids = new Set([...(before?.keys() || []), ...(after?.keys() || [])]);
  ids.forEach((id) => {
    const previous = before?.get(id);
    const next = after?.get(id);
    if (!next) deletes.push(id);
    else if (!previous || stableString(previous) !== stableString(next)) writes.push([id, next]);
  });
  return { writes, deletes };
}

async function writeFirestoreState(state, actor = null) {
  const { firestore } = getFirebaseServices();
  const baseline = snapshotByState.get(state);
  if (!baseline) throw new StoreConflictError("Không tìm thấy phiên bản dữ liệu gốc để ghi Firestore.");

  const nextCollections = stateCollections(state);
  const changes = Object.fromEntries(ARRAY_KEYS.map((key) => [key, changedDocuments(baseline.collections[key], nextCollections[key])]));
  const settingsChanged = stableString(baseline.settings) !== stableString(state.settings || {});
  const nextRuntime = stateRuntime(state);
  const runtimeChanged = stableString(baseline.runtime) !== stableString(nextRuntime);
  const operationCount = Object.values(changes).reduce((sum, change) => sum + change.writes.length + change.deletes.length, 0)
    + (settingsChanged ? 1 : 0) + (runtimeChanged ? 1 : 0) + 1;
  if (operationCount > 450) {
    const error = new Error("Thay đổi vượt quá giới hạn batch an toàn của Firestore.");
    error.statusCode = 413;
    throw error;
  }

  const metaRef = firestore.collection(metaCollection()).doc("state");
  const settingsRef = firestore.collection(metaCollection()).doc("settings");
  const runtimeRef = firestore.collection(metaCollection()).doc("runtime");
  await firestore.runTransaction(async (transaction) => {
    const currentMeta = await transaction.get(metaRef);
    const currentRevision = Number(currentMeta.data()?.revision || 0);
    if (!currentMeta.exists || currentRevision !== baseline.revision) throw new StoreConflictError();

    ARRAY_KEYS.forEach((key) => {
      const collection = firestore.collection(collectionName(key));
      changes[key].writes.forEach(([id, value]) => transaction.set(collection.doc(id), value));
      changes[key].deletes.forEach((id) => transaction.delete(collection.doc(id)));
    });
    if (settingsChanged) transaction.set(settingsRef, jsonClone(state.settings || {}));
    if (runtimeChanged) transaction.set(runtimeRef, nextRuntime);
    transaction.set(metaRef, {
      schema_version: Number(state.schema_version || 1),
      revision: currentRevision + 1,
      updated_at: new Date().toISOString(),
      updated_by: actor?.uid || "system",
    }, { merge: true });
  });

  captureSnapshot(state, baseline.revision + 1);
  return state;
}

async function replaceCollection(firestore, key, rows, { clear = false } = {}) {
  const collection = firestore.collection(collectionName(key));
  const writer = firestore.bulkWriter();
  if (clear) {
    const existing = await collection.listDocuments();
    existing.forEach((ref) => writer.delete(ref));
  }
  rows.forEach((row, index) => writer.set(collection.doc(documentId(row, index)), { ...jsonClone(row), __order: index }));
  await writer.close();
}

async function importFirestoreState(state, { force = false, actor = "migration" } = {}) {
  const { firestore } = getFirebaseServices();
  const metaRef = firestore.collection(metaCollection()).doc("state");
  const existing = await metaRef.get();
  if (existing.exists && !force) {
    const error = new Error("Firestore đã có dữ liệu. Dùng --force chỉ sau khi đã backup và xác nhận ghi đè.");
    error.statusCode = 409;
    throw error;
  }

  await Promise.all(ARRAY_KEYS.map((key) => replaceCollection(firestore, key, Array.isArray(state[key]) ? state[key] : [], { clear: force })));
  await firestore.collection(metaCollection()).doc("settings").set(jsonClone(state.settings || {}));
  await firestore.collection(metaCollection()).doc("runtime").set(stateRuntime(state));
  await metaRef.set({
    schema_version: Number(state.schema_version || 1),
    revision: Number(existing.data()?.revision || 0) + 1,
    imported_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: actor,
  });
}

function createStore(options) {
  return {
    backend: useFirestore() ? "firestore" : "json",
    async read() {
      return useFirestore() ? readFirestoreState() : readJsonState(options);
    },
    async write(state, actor) {
      return useFirestore() ? writeFirestoreState(state, actor) : writeJsonState(state, options);
    },
    async importFirestore(state, importOptions) {
      return importFirestoreState(state, importOptions);
    },
  };
}

export {
  ARRAY_KEYS,
  StoreConflictError,
  createStore,
  importFirestoreState,
  useFirestore,
};
