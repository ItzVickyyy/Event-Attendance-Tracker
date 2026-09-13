import { type DBSchema, type IDBPDatabase, openDB } from "idb"
import { registerAttendanceSync, requestImmediateSync } from "./sync"

export const QUEUE_CHANGED_EVENT = "pwa:queue-changed"
export const ROSTER_CHANGED_EVENT = "pwa:roster-changed"

interface EventRecord {
  id: string
  event_name: string
  event_date: string
  start_time?: string
  end_time?: string
  attendance_mode: "time_in_only" | "time_in_time_out"
  organization_id?: string
  status: "draft" | "open" | "closed"
  created_at?: string
  updated_at?: string
}

interface CredentialRecord {
  id: string
  attendee_id: string
  credential_type: "nfc" | "qr"
  credential_value: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

interface QueueRecord {
  id: string
  event_id: string
  credential_value: string
  scan_method: "nfc" | "qr" | "manual"
  client_timestamp: string
  local_id: string
  synced: boolean
  synced_at?: string
  retry_count: number
  last_error?: string
  last_retry_at?: string
  created_at: string
  synced_at_server?: string
}

interface SyncMetaRecord {
  id: string
  key: string
  value: string
  updated_at: string
}

interface RosterCredentialRecord {
  credential_type: "nfc" | "qr"
  credential_value: string
  is_active: boolean
}

interface RosterEntryRecord {
  event_id: string
  attendee_id: string
  registration_status: string
  person_name: string
  student_number?: string
  credentials: RosterCredentialRecord[]
}

interface RosterRecord {
  event_id: string
  entries: RosterEntryRecord[]
  downloaded_at: string
  entry_count: number
  credential_count: number
}

interface OfflineDB extends DBSchema {
  events: {
    key: string
    value: EventRecord
    indexes: { "by-status": "status" }
  }
  credentials: {
    key: string
    value: CredentialRecord
    indexes: {
      "by-credential-value": "credential_value"
      "by-attendee-id": "attendee_id"
    }
  }
  attendanceQueue: {
    key: string
    value: QueueRecord
    indexes: {
      "by-event": "event_id"
      "by-synced": "synced"
      "by-credential": "credential_value"
      "by-created": "created_at"
      "by-synced-created": ["synced", "created_at"]
    }
  }
  syncMeta: {
    key: string
    value: SyncMetaRecord
  }
  rosters: {
    key: string
    value: RosterRecord
  }
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null

export function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>("attendance-offline", 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("events")) {
          const eventStore = db.createObjectStore("events", { keyPath: "id" })
          eventStore.createIndex("by-status", "status")
        }

        if (!db.objectStoreNames.contains("credentials")) {
          const credentialStore = db.createObjectStore("credentials", {
            keyPath: "id",
          })
          credentialStore.createIndex(
            "by-credential-value",
            "credential_value",
            { unique: true },
          )
          credentialStore.createIndex("by-attendee-id", "attendee_id")
        }

        if (!db.objectStoreNames.contains("attendanceQueue")) {
          const queueStore = db.createObjectStore("attendanceQueue", {
            keyPath: "id",
          })
          queueStore.createIndex("by-event", "event_id")
          queueStore.createIndex("by-synced", "synced")
          queueStore.createIndex("by-credential", "credential_value")
          queueStore.createIndex("by-created", "created_at")
          queueStore.createIndex("by-synced-created", ["synced", "created_at"])
        }

        if (!db.objectStoreNames.contains("syncMeta")) {
          db.createObjectStore("syncMeta", { keyPath: "id" })
        }

        if (!db.objectStoreNames.contains("rosters")) {
          db.createObjectStore("rosters", { keyPath: "event_id" })
        }
      },
    })
    return dbPromise
  }
  return dbPromise
}

export async function getDBInstance(): Promise<IDBPDatabase<OfflineDB>> {
  return getDB()
}

export async function closeDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
}

// Queue helpers

export interface QueuedScan {
  event_id: string
  credential_value: string
  scan_method: "nfc" | "qr" | "manual"
}

export interface QueuedScanRecord extends QueueRecord {}

export async function enqueueScan(scan: QueuedScan): Promise<string> {
  const db = await getDB()
  const local_id = crypto.randomUUID()
  const now = new Date().toISOString()

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
  }

  await db.add("attendanceQueue", record)

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT))
  }

  void registerAttendanceSync()
  if (navigator.onLine) {
    void requestImmediateSync()
  }

  return local_id
}

export async function getPendingScans(): Promise<QueueRecord[]> {
  const db = await getDB()
  const all = await db.getAll("attendanceQueue")
  return all
    .filter((record) => !record.synced)
    .sort((a, b) => {
      const byCreated = a.created_at.localeCompare(b.created_at)
      return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id)
    })
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB()
  const all = await db.getAll("attendanceQueue")
  return all.filter((record) => !record.synced).length
}

export async function markSynced(localId: string): Promise<void> {
  const db = await getDB()
  const record = await db.get("attendanceQueue", localId)
  if (!record) return

  const updated: QueueRecord = {
    ...record,
    synced: true,
    synced_at: new Date().toISOString(),
    synced_at_server: new Date().toISOString(),
    retry_count: 0,
    last_error: undefined,
    last_retry_at: undefined,
  }
  await db.put("attendanceQueue", updated)
}

export async function markFailed(
  localId: string,
  error: string,
): Promise<void> {
  const db = await getDB()
  const record = await db.get("attendanceQueue", localId)
  if (!record) return

  const updated: QueueRecord = {
    ...record,
    synced: false,
    retry_count: record.retry_count + 1,
    last_error: error,
    last_retry_at: new Date().toISOString(),
  }
  await db.put("attendanceQueue", updated)
}

export async function removeSyncedRecords(
  olderThanMs: number = 7 * 24 * 60 * 60 * 1000,
): Promise<number> {
  const db = await getDB()
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()
  const tx = db.transaction("attendanceQueue", "readwrite")
  let count = 0

  for await (const cursor of tx.store.iterate()) {
    if (
      cursor.value.synced &&
      cursor.value.synced_at &&
      cursor.value.synced_at < cutoff
    ) {
      await cursor.delete()
      count++
    }
  }
  await tx.done
  return count
}

export async function getAllQueuedScans(): Promise<QueueRecord[]> {
  const db = await getDB()
  return db.getAll("attendanceQueue")
}

export async function clearQueue(): Promise<void> {
  const db = await getDB()
  await db.clear("attendanceQueue")
}

export async function getSyncMeta(key: string): Promise<string | undefined> {
  const db = await getDB()
  const record = await db.get("syncMeta", key)
  return record?.value
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  const db = await getDB()
  await db.put("syncMeta", {
    id: crypto.randomUUID(),
    key,
    value,
    updated_at: new Date().toISOString(),
  })
}

export async function getEventById(
  eventId: string,
): Promise<EventRecord | undefined> {
  const db = await getDB()
  return db.get("events", eventId)
}

export async function getAllEvents(): Promise<EventRecord[]> {
  const db = await getDB()
  return db.getAll("events")
}

export async function upsertEvent(event: EventRecord): Promise<void> {
  const db = await getDB()
  await db.put("events", event)
}

export async function getCredentialsByEvent(
  eventId: string,
): Promise<CredentialRecord[]> {
  const db = await getDB()
  // We need to query by event_id, but credentials are indexed by attendee_id
  // For now, get all and filter - could optimize with additional index if needed
  const all = await db.getAll("credentials")
  return all.filter((c) => c.attendee_id === eventId)
}

export async function upsertCredential(
  credential: CredentialRecord,
): Promise<void> {
  const db = await getDB()
  await db.put("credentials", credential)
}

export async function getCredentialByValue(
  value: string,
): Promise<CredentialRecord | undefined> {
  const db = await getDB()
  return db.getFromIndex(
    "credentials",
    "by-credential-value",
    IDBKeyRange.only(value),
  )
}

export async function getAllCredentials(): Promise<CredentialRecord[]> {
  const db = await getDB()
  return db.getAll("credentials")
}

export async function getRoster(
  eventId: string,
): Promise<RosterRecord | undefined> {
  const db = await getDB()
  return db.get("rosters", eventId)
}

export async function putRoster(roster: RosterRecord): Promise<void> {
  const db = await getDB()
  await db.put("rosters", roster)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ROSTER_CHANGED_EVENT))
  }
}

export async function removeRoster(eventId: string): Promise<void> {
  const db = await getDB()
  await db.delete("rosters", eventId)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ROSTER_CHANGED_EVENT))
  }
}

export async function getAllRosters(): Promise<RosterRecord[]> {
  const db = await getDB()
  return db.getAll("rosters")
}

export async function getRosterEntryByCredential(
  eventId: string,
  credentialValue: string,
): Promise<RosterEntryRecord | undefined> {
  const roster = await getRoster(eventId)
  if (!roster) return undefined
  const normalized = credentialValue.toUpperCase()
  return roster.entries.find((entry) =>
    entry.credentials.some(
      (credential) =>
        credential.is_active &&
        credential.credential_value.toUpperCase() === normalized,
    ),
  )
}

export async function clearAllData(): Promise<void> {
  const db = await getDB()
  await Promise.all([
    db.clear("events"),
    db.clear("credentials"),
    db.clear("attendanceQueue"),
    db.clear("syncMeta"),
    db.clear("rosters"),
  ])
}
