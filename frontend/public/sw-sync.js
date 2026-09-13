/**
 * Attendance background-sync handler (classic script, loaded by the generated
 * workbox service worker via `importScripts`).
 *
 * Responsibilities:
 *  - Process the offline attendance queue (`attendance-offline` IndexedDB,
 *    store `attendanceQueue`) in creation order.
 *  - Ask an open page for the auth token via postMessage/MessageChannel; the
 *    token is never mirrored into IndexedDB.
 *  - POST each pending record to `/api/v1/attendance/scan` and record the
 *    outcome in the queue.
 *
 * Triggers:
 *  - The browser `sync` event (tag `sync-attendance`).
 *  - A `{ type: "SYNC_NOW" }` message from the page (used as the flush trigger
 *    when Background Sync is unavailable, e.g. Safari).
 */

const SYNC_TAG = "sync-attendance";
const QUEUE_DB_NAME = "attendance-offline";
const QUEUE_DB_VERSION = 1;
const TOKEN_TIMEOUT_MS = 3000;

let syncRunning = false;
const inFlightRecords = new Set();

self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    runAttendanceSync().then((result) => {
      if (result.needsRetry) {
        // Rejecting lets the browser schedule its own backoff retry.
        throw new Error("attendance-sync-retry");
      }
    })
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "SYNC_NOW") return;
  event.waitUntil(runAttendanceSync().catch(() => undefined));
});

async function runAttendanceSync() {
  if (syncRunning) return { skipped: true, needsRetry: false };
  syncRunning = true;
  try {
    const auth = await requestAuthFromClients();
    if (!auth || !auth.token) {
      return { skipped: true, needsRetry: false };
    }
    broadcastToClients({ type: "PWA_SYNC_START" });
    const result = await flushPendingScans(auth.token, auth.apiBase);
    console.log(
      `[sw-sync] flushed attendance queue in creation order ` +
        `(needsRetry=${result.needsRetry})`
    );
    broadcastToClients({
      type: "PWA_SYNC_END",
      needsRetry: result.needsRetry,
      skipped: result.skipped,
    });
    return result;
  } finally {
    syncRunning = false;
  }
}

function broadcastToClients(message) {
  if (!self.clients) return;
  self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) {
        try {
          client.postMessage(message);
        } catch (error) {
          // Ignore; the client may have disconnected.
        }
      }
    })
    .catch(() => undefined);
}

async function flushPendingScans(token, apiBase) {
  const db = await openQueueDB();
  let needsRetry = false;
  try {
    const pending = await getPendingRecords(db);
    for (const record of pending) {
      if (inFlightRecords.has(record.id)) continue;
      inFlightRecords.add(record.id);
      try {
        const outcome = await syncRecord(db, token, apiBase, record);
        if (outcome === "retry") needsRetry = true;
      } finally {
        inFlightRecords.delete(record.id);
      }
    }
    return { skipped: false, needsRetry };
  } finally {
    db.close();
  }
}

function getPendingRecords(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("attendanceQueue", "readonly");
    const store = tx.objectStore("attendanceQueue");
    const request = store.getAll();
    request.onsuccess = () => {
      const records = (request.result || []).filter((record) => !record.synced);
      records.sort((a, b) => {
        const byCreated =
          a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
        return byCreated !== 0
          ? byCreated
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0;
      });
      resolve(records);
    };
    request.onerror = () => reject(request.error);
  });
}

async function syncRecord(db, token, apiBase, record) {
  const url = `${apiBase}/api/v1/attendance/scan`;
  const now = () => new Date().toISOString();

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event_id: record.event_id,
        credential_value: record.credential_value,
        scan_method: record.scan_method,
      }),
    });
  } catch (error) {
    await markRecord(db, record.id, {
      retry_count: record.retry_count + 1,
      last_error: "network-error",
      last_retry_at: now(),
    });
    return "retry";
  }

  const status = response.status;

  if (status >= 200 && status < 300) {
    await markRecord(db, record.id, {
      synced: true,
      synced_at: now(),
      synced_at_server: now(),
      retry_count: 0,
      last_error: undefined,
      last_retry_at: undefined,
    });
    return "synced";
  }

  if (status === 409) {
    // Duplicate scan: treat as resolved so it is not re-sent.
    await markRecord(db, record.id, {
      synced: true,
      synced_at: now(),
      synced_at_server: now(),
      retry_count: 0,
      last_error: undefined,
      last_retry_at: undefined,
    });
    return "duplicate";
  }

  if (status === 401) {
    // Invalid/expired token: leave pending untouched; retried after re-login.
    return "unauthorized";
  }

  await markRecord(db, record.id, {
    retry_count: record.retry_count + 1,
    last_error: `http-${status}`,
    last_retry_at: now(),
  });
  return status >= 500 ? "retry" : "failed";
}

function markRecord(db, id, patch) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("attendanceQueue", "readwrite");
    const store = tx.objectStore("attendanceQueue");
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (!record) {
        resolve();
        return;
      }
      store.put({ ...record, ...patch });
    };
    getRequest.onerror = () => {
      tx.abort();
      reject(getRequest.error);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("attendanceQueue")) {
        const store = db.createObjectStore("attendanceQueue", { keyPath: "id" });
        store.createIndex("by-synced-created", ["synced", "created_at"]);
        store.createIndex("by-synced", "synced");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestAuthFromClients() {
  return new Promise((resolve) => {
    if (!self.clients) {
      resolve(null);
      return;
    }
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        if (!clients || clients.length === 0) {
          resolve(null);
          return;
        }
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) resolve(null);
        }, TOKEN_TIMEOUT_MS);
        for (const client of clients) {
          const channel = new MessageChannel();
          channel.port1.onmessage = (event) => {
            if (settled) return;
            const data = event.data || {};
            if (data.type === "PWA_SYNC_TOKEN") {
              settled = true;
              clearTimeout(timer);
              resolve({ token: data.token || "", apiBase: data.apiBase || "" });
            }
          };
          try {
            client.postMessage(
              { type: "PWA_SYNC_GET_TOKEN" },
              [channel.port2]
            );
          } catch (error) {
            // Try the next client.
          }
        }
      })
      .catch(() => resolve(null));
  });
}