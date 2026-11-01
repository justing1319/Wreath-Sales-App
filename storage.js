import { STORAGE_KEY, markOrdersPaid } from './sales.js';

let database;

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('pack47-evergreen', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('data');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other Evergreen tabs, then reload to finish storage setup.'));
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }
  return database;
}

export async function loadOrders() {
  const db = await openDatabase();
  const snapshot = await new Promise((resolve, reject) => {
    const transaction = db.transaction('data', 'readonly');
    const request = transaction.objectStore('data').get('orders');
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error ?? new Error('Orders could not be read.'));
  });
  if (snapshot !== undefined) {
    if (typeof snapshot.revision !== 'string') throw new Error('Invalid saved order revision.');
    try {
      return { orders: markOrdersPaid(snapshot.orders), revision: snapshot.revision };
    } catch (error) {
      error.revision = snapshot.revision;
      throw error;
    }
  }
  // Import older versions only when the new database has no order snapshot.
  const legacy = localStorage.getItem(STORAGE_KEY);
  const orders = legacy === null ? [] : markOrdersPaid(JSON.parse(legacy));
  const revision = await saveOrders(orders, null);
  return { orders, revision };
}

export async function saveOrders(orders, expectedRevision) {
  const paidOrders = markOrdersPaid(orders);
  const db = await openDatabase();
  const revision = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('data', 'readwrite');
    const store = transaction.objectStore('data');
    const request = store.get('orders');
    let conflict;
    request.onsuccess = () => {
      if ((request.result?.revision ?? null) !== expectedRevision) {
        conflict = new Error('Orders changed in another tab. Reload before saving to avoid overwriting them.');
        transaction.abort();
        return;
      }
      store.put({ orders: paidOrders, revision }, 'orders');
    };
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(conflict ?? transaction.error ?? new Error('Orders were not saved.'));
  });
  return revision;
}
