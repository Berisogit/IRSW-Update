
const CACHE_NAME = 'irsw-v7-stable';
const DB_NAME = 'IRSW_OFFLINE_DB';
const STORE_NAME = 'offline_orders';

let isSyncing = false;

const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js'
];

/**
 * Initializes/Opens the atomic storage node with safety checks
 */
function openDB() {
  return new Promise((resolve, reject) => {
    try {
      if (!self.indexedDB) {
        const err = new Error('IndexedDB not supported in this environment');
        console.error('[SW DB] Critical Error:', err.message);
        return reject(err);
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          console.debug('[SW DB] Init: Object store created:', STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => {
        console.error('[SW DB] Connection Failure:', request.error);
        reject(request.error);
      };
    } catch (e) {
      console.error('[SW DB] Exception during startup:', e);
      reject(e);
    }
  });
}

/**
 * Persists order payload to local cache
 */
async function saveOrderLocally(orderData) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add({ data: orderData, timestamp: Date.now(), synced: false });
      
      tx.oncomplete = () => {
        console.debug('[SW Storage] Sync Queue: Order buffered successfully');
        resolve();
      };
      tx.onerror = () => {
        const err = tx.error || new Error('Storage Transaction Aborted');
        console.error('[SW Storage] Write Error:', err);
        reject(err);
      };
    });
  } catch (err) {
    console.error("[SW Storage] High-level Write Failure:", err.message);
    throw err;
  }
}

/**
 * Retrieves un-synchronized orders from storage
 */
async function getQueuedOrders() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => {
        console.error('[SW Sync] Read Request Error:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error("[SW Sync] Retrieval Operation Aborted:", err.message);
    return [];
  }
}

/**
 * Purges sync queue after successful transmission
 */
async function clearQueuedOrders() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      
      tx.oncomplete = () => {
        console.debug('[SW Storage] Queue Cleanup: Purge success');
        resolve();
      };
      tx.onerror = () => {
        const err = tx.error || new Error('Cleanup Transaction Aborted');
        console.error('[SW Storage] Purge Error:', err);
        reject(err);
      };
    });
  } catch (err) {
    console.error("[SW Storage] High-level Purge Failure:", err.message);
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  if (self.caches) {
    event.waitUntil(caches.open(CACHE_NAME).then(c => {
      return Promise.all(STATIC_ASSETS.map(url => {
        const isExternal = url.startsWith('http');
        const request = new Request(url, isExternal ? { mode: 'no-cors' } : {});
        return c.add(request).catch(err => {
          console.debug(`[SW Cache] Skipped Resource ${url}:`, err.message);
        });
      }));
    }));
  }
});

self.addEventListener('activate', (event) => {
  if (self.caches) {
    event.waitUntil(caches.keys().then(keys => 
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    ));
  }
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle Order Syncing Node
  if (url.pathname.includes('/api/sync-order') && request.method === 'POST') {
    event.respondWith(
      fetch(request.clone()).catch(async (fetchErr) => {
        console.warn('[SW Network] Sync-order uplink failed. Fallback to local buffer.');
        try {
          const body = await request.clone().json();
          await saveOrderLocally(body);
          return new Response(JSON.stringify({ offline: true, buffered: true }), { 
            headers: { 'Content-Type': 'application/json' } 
          });
        } catch (storageErr) {
          console.error('[SW Storage] Critical: Buffer failed during offline event:', storageErr.message);
          return new Response(JSON.stringify({ error: 'Local storage failure', detail: storageErr.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })
    );
    return;
  }

  // Only handle HTTP/HTTPS GET requests for caching
  if (request.method !== 'GET' || !url.protocol.startsWith('http') || !self.caches) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const networked = fetch(request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(e => {
            console.debug('[SW Cache] Persistence error:', e.message);
          });
        }
        return res;
      }).catch(e => {
        console.debug('[SW Fetch] Request failed, serving cached copy:', url.pathname);
        return cached;
      });
      return cached || networked;
    })
  );
});

/**
 * Background Sync Simulation Node
 */
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'CHECK_SYNC' && !isSyncing) {
    isSyncing = true;
    console.debug('[SW Sync] Uplink detected. Processing buffered signals...');
    try {
      const queued = await getQueuedOrders();
      if (queued.length > 0) {
        const clients = await self.clients.matchAll();
        if (clients.length === 0) {
          console.warn('[SW Sync] No active UI layers detected for message propagation.');
          isSyncing = false;
          return;
        }
        clients.forEach(c => c.postMessage({ 
          type: 'SYNC_ORDERS', 
          orders: queued.map(q => q.data),
          count: queued.length
        }));
        await clearQueuedOrders();
        console.debug(`[SW Sync] Operation successful. Synchronized ${queued.length} orders.`);
      } else {
        console.debug('[SW Sync] Queue empty. No pending signals.');
      }
    } catch (err) {
      console.error("[SW Sync] Critical protocol interruption:", err.message);
    } finally {
      isSyncing = false;
    }
  }
});
