import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { registerAttendanceSync, requestImmediateSync } from "./sync";

interface EventRecord {
  id: string;
  event_name: string;
  event_date: string;
  start_time?: string;
  end_time?: string;
  attendance_mode: "time_in_only" | "time_in_time_out";
  organization_id?: string;
  status: "draft" | "open" | "closed";
  created_at?: string;
  updated_at?: string;
}

interface CredentialRecord {
  id: string;
  attendee_id: string;
  credential_type: "nfc" | "qr";
  credential_value: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface QueueRecord {
  id: string;
  event_id: string;
  credential_value: string;
  scan_method: "nfc" | "qr" | "manual";
  client_timestamp: string;
  local_id: string;
  synced: boolean;
  synced_at?: string;
  retry_count: number;
  last_error?: string;
  last_retry_at?: string;
  created_at: string;
  synced_at_server?: string;
}

interface SyncMetaRecord {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

interface OfflineDB extends DBSchema {
  events: {
    key: string;
    value: EventRecord;
    indexes: { "by-status": "status" };
  };
  credentials: {
    key: string;
    value: CredentialRecord;
    indexes: { "by-credential-value": "credential_value"; "by-attendee-id": "attendee_id" };
  };
  attendanceQueue: {
    key: string;
    value: QueueRecord;
    indexes: {
      "by-event": "event_id";
      "by-synced": "synced";
      "by-credential": "credential_value";
      "by-created": "created_at";
      "by-synced-created": ["synced", "created_at"];
    };
  };
  syncMeta: {
    key: string;
    value: SyncMetaRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>("attendance-offline", 1, {
      upgrade(db) {
        const eventStore = db.createObjectStore("events", { keyPath: "id" });
        eventStore.createIndex("by-status", "status");

        const credentialStore = db.createObjectStore("credentials", { keyPath: "id" });
        credentialStore.createIndex("by-credential-value", "credential_value", { unique: true });
        credentialStore.createIndex("by-attendee-id", "attendee_id");

        const queueStore = db.createObjectStore("attendanceQueue", { keyPath: "id" });
        queueStore.createIndex("by-event", "event_id");
        queueStore.createIndex("by-synced", "synced");
        queueStore.createIndex("by-credential", "credential_value");
        queueStore.createIndex("by-created", "created_at");
        queueStore.createIndex("by-synced-created", ["synced", "created_at"]);

        db.createObjectStore("syncMeta", { keyPath: "id" });
      },
    });
    return dbPromise;
  }
  return dbPromise;
}

export async function getDBInstance(): Promise<IDBPDatabase<OfflineDB>> {
  return getDB();
}

export async function closeDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}

// Queue helpers

export interface QueuedScan {
  event_id: string;
  credential_value: string;
  scan_method: "nfc" | "qr" | "manual";
}

export interface QueuedScanRecord extends QueueRecord {}

export async function enqueueScan(scan: QueuedScan): Promise<string> {
  const db = await getDB();
  const local_id = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: QueueRecord = {
    id: local_id,
    event_id: scan.event_id,
    credential_value: scan.credential_value,
    scan_method: scan.scan_method,
    client_timestamp: new Date().toISOString(),
    local_id,
    synced: false,
    retry_count: 0,
    created_at: now,
  };

  await db.add("attendanceQueue", record);

  void registerAttendanceSync();
  if (navigator.onLine) {
    void requestImmediateSync();
  }

  return local_id;
}

export async function getPendingScans(): Promise<QueueRecord[]> {
  const db = await getDB();
  const all = await db.getAll("attendanceQueue");
  return all
    .filter((record) => !record.synced)
    .sort((a, b) => {
      const byCreated = a.created_at.localeCompare(b.created_at);
      return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id);
    });
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll("attendanceQueue");
  return all.filter((record) => !record.synced).length;
}

export async function markSynced(localId: string): Promise<void> {
  const db = await getDB();
  const record = await db.get("attendanceQueue", localId);
  if (!record) return;

  const updated: QueueRecord = {
    ...record,
    synced: true,
    synced_at: new Date().toISOString(),
    synced_at_server: new Date().toISOString(),
    retry_count: 0,
    last_error: undefined,
    last_retry_at: undefined,
  };
  await db.put("attendanceQueue", updated);
}

export async function markFailed(localId: string, error: string): Promise<void> {
  const db = await getDB();
  const record = await db.get("attendanceQueue", localId);
  if (!record) return;

  const updated: QueueRecord = {
    ...record,
    synced: false,
    retry_count: record.retry_count + 1,
    last_error: error,
    last_retry_at: new Date().toISOString(),
  };
  await db.put("attendanceQueue", updated);
}

export async function removeSyncedRecords(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const db = await getDB();
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const tx = db.transaction("attendanceQueue", "readwrite");
  let count = 0;

  for await (const cursor of tx.store.iterate()) {
    if (cursor.value.synced && cursor.value.synced_at && cursor.value.synced_at < cutoff) {
      await cursor.delete();
      count++;
    }
  }
  await tx.done;
  return count;
}

export async function getAllQueuedScans(): Promise<QueueRecord[]> {
  const db = await getDB();
  return db.getAll("attendanceQueue");
}

export async function clearQueue(): Promise<void> {
  const db = await getDB();
  await db.clear("attendanceQueue");
}

export async function getSyncMeta(key: string): Promise<string | undefined> {
  const db = await getDB();
  const record = await db.get("syncMeta", key);
  return record?.value;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put("syncMeta", { id: crypto.randomUUID(), key, value, updated_at: new Date().toISOString() });
}

export async function getEventById(eventId: string): Promise<EventRecord | undefined> {
  const db = await getDB();
  return db.get("events", eventId);
}

export async function getAllEvents(): Promise<EventRecord[]> {
  const db = await getDB();
  return db.getAll("events");
}

export async function upsertEvent(event: EventRecord): Promise<void> {
  const db = await getDB();
  await db.put("events", event);
}

export async function getCredentialsByEvent(eventId: string): Promise<CredentialRecord[]> {
  const db = await getDB();
  // We need to query by event_id, but credentials are indexed by attendee_id
  // For now, get all and filter - could optimize with additional index if needed
  const all = await db.getAll("credentials");
  return all.filter(c => c.attendee_id === eventId);
}

export async function upsertCredential(credential: CredentialRecord): Promise<void> {
  const db = await getDB();
  await db.put("credentials", credential);
}

export async function getCredentialByValue(value: string): Promise<CredentialRecord | undefined> {
  const db = await getDB();
  return db.getFromIndex("credentials", "by-credential-value", IDBKeyRange.only(value));
}

export async function getAllCredentials(): Promise<CredentialRecord[]> {
  const db = await getDB();
  return db.getAll("credentials");
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await Promise.all([
    db.clear("events"),
    db.clear("credentials"),
    db.clear("attendanceQueue"),
    db.clear("syncMeta"),
  ]);
}