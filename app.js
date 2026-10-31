import { STORAGE_KEY, money, total, summary, validateOrder, validateOrders, toCSV } from './sales.js';

const $ = selector => document.querySelector(selector);
const form = $('#order-form');
const dialog = $('#order-dialog');
let orders = [];
let storageAvailable = true;
let editingId = null;
let filter = 'all';
let installPrompt = null;
let toastTimer;

function notice(message) {
  $('#notice').textContent = message;
  $('#notice').hidden = false;
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  orders = saved === null ? [] : validateOrders(JSON.parse(saved));
  localStorage.setItem('pack47-storage-check', '1');
  localStorage.removeItem('pack47-storage-check');
} catch (error) {
  storageAvailable = false;
  notice(`Orders could not be loaded safely: ${error.message} Saving is disabled to protect existing data. Restore a valid backup or enable browser storage and reload.`);
}

function persist(nextOrders) {
  validateOrders(nextOrders);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextOrders));
  orders = nextOrders;
  storageAvailable = true;
  $('#notice').hidden = true;
  render();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  const sums = summary(orders);
  $('#sales').textContent = money(sums.sales);
  $('#order-count').textContent = `${orders.length} order${orders.length === 1 ? '' : 's'} this season`;
  $('#wreath-count').textContent = sums.wreaths;
  $('#candle-count').textContent = sums.candles;
  $('#pending-count').textContent = sums.pending;
  $('#collected').textContent = `${money(sums.collected)} collected`;
  $('#list-count').textContent = orders.length;
  $('#add-order').disabled = $('#first-order').disabled = !storageAvailable;
  $('#export').disabled = $('#backup').disabled = !storageAvailable || !orders.length;
  const query = $('#search').value.trim().toLowerCase();
  const visible = orders.filter(order => [order.name, order.address, order.phone].some(value => value.toLowerCase().includes(query)))
    .filter(order => filter === 'all' || (filter === 'unpaid' ? !order.paid : !order.delivered))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $('#orders').replaceChildren();
  $('#empty').hidden = orders.length > 0 || !storageAvailable;
  $('#no-results').hidden = !orders.length || visible.length > 0;
  for (const order of visible) {
    const card = element('article', 'order-card');
    const customer = element('div', 'customer');
    customer.append(element('strong', '', order.name), element('p', '', order.address));
    if (order.phone) {
      const phone = element('a', '', order.phone);
      phone.href = `tel:${order.phone.replace(/[^+\d]/g, '')}`;
      customer.append(phone);
    }
    if (order.location) customer.append(element('p', '', `Leave at: ${order.location}`));
    const items = element('div', 'items');
    items.append(element('span', '', `${order.wreaths} wreath${order.wreaths === 1 ? '' : 's'} · ${order.candles} candle${order.candles === 1 ? '' : 's'}`), element('strong', '', money(total(order))));
    const status = element('div', 'status');
    const paymentName = order.payment === 'venmo' ? 'Venmo' : order.payment === 'cash' ? 'Cash' : 'Check';
    status.append(element('span', `badge ${order.paid ? '' : 'waiting'}`, `${order.paid ? 'Paid' : 'Unpaid'} · ${paymentName}`),
      element('span', `badge ${order.delivered ? '' : 'waiting'}`, order.delivered ? 'Delivered' : 'To deliver'));
    const edit = element('button', 'button quiet edit-order', 'Edit');
    edit.setAttribute('aria-label', `Edit order for ${order.name}`);
    edit.disabled = !storageAvailable;
    edit.addEventListener('click', () => openOrder(order));
    card.append(customer, items, status, edit);
    $('#orders').append(card);
  }
}

function updateTotal() {
  const wreaths = Number(form.elements.wreaths.value);
  const candles = Number(form.elements.candles.value);
  $('#form-total').textContent = Number.isInteger(wreaths) && wreaths >= 0 && Number.isInteger(candles) && candles >= 0
    ? money(total({ wreaths, candles })) : 'Enter quantities';
}

function openOrder(order = null) {
  form.reset();
  editingId = order?.id ?? null;
  $('#dialog-title').textContent = order ? 'Edit order' : 'New order';
  $('#delete-order').hidden = !order;
  $('#form-error').hidden = true;
  if (order) {
    for (const key of ['name', 'address', 'phone', 'wreaths', 'candles', 'payment', 'location', 'notes']) form.elements[key].value = order[key];
    form.elements.paid.checked = order.paid;
    form.elements.delivered.checked = order.delivered;
  }
  updateTotal();
  dialog.showModal();
  form.elements.name.focus();
}

$('#add-order').addEventListener('click', () => openOrder());
$('#first-order').addEventListener('click', () => openOrder());
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#cancel-dialog').addEventListener('click', () => dialog.close());
form.elements.wreaths.addEventListener('input', updateTotal);
form.elements.candles.addEventListener('input', updateTotal);
form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const previous = orders.find(order => order.id === editingId);
    const order = {
      id: editingId ?? crypto.randomUUID(),
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      name: form.elements.name.value.trim(),
      address: form.elements.address.value.trim(),
      phone: form.elements.phone.value.trim(),
      wreaths: Number(form.elements.wreaths.value),
      candles: Number(form.elements.candles.value),
      payment: form.elements.payment.value,
      paid: form.elements.paid.checked,
      delivered: form.elements.delivered.checked,
      location: form.elements.location.value.trim(),
      notes: form.elements.notes.value.trim(),
    };
    validateOrder(order);
    persist(editingId ? orders.map(existing => existing.id === editingId ? order : existing) : [...orders, order]);
    dialog.close();
    toast(editingId ? 'Order updated' : 'Order saved on this device');
  } catch (error) {
    $('#form-error').textContent = `Order not saved: ${error.message}`;
    $('#form-error').hidden = false;
  }
});

$('#delete-order').addEventListener('click', () => {
  if (!confirm('Delete this order? This cannot be undone.')) return;
  try {
    persist(orders.filter(order => order.id !== editingId));
    dialog.close();
    toast('Order deleted');
  } catch (error) {
    $('#form-error').textContent = `Order not deleted: ${error.message}`;
    $('#form-error').hidden = false;
  }
});

$('#search').addEventListener('input', render);
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach(item => {
    item.classList.toggle('active', item === button);
    item.setAttribute('aria-pressed', String(item === button));
  });
  render();
}));

function download(content, type, extension) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `pack47-orders-${new Date().toISOString().slice(0, 10)}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

$('#export').addEventListener('click', () => {
  download(toCSV(orders), 'text/csv;charset=utf-8', 'csv');
  toast('Spreadsheet export requested');
});
$('#backup').addEventListener('click', () => {
  download(JSON.stringify({ app: 'pack47-evergreen', version: 1, orders }, null, 2), 'application/json', 'json');
  toast('Backup download requested. Keep the file somewhere safe.');
});
$('#restore').addEventListener('click', () => $('#backup-file').click());
$('#backup-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Backup must be smaller than 10 MB.');
    const backup = JSON.parse(await file.text());
    if (backup.app !== 'pack47-evergreen' || backup.version !== 1) throw new Error('Choose an Evergreen backup file.');
    validateOrders(backup.orders);
    if (!confirm(`Replace orders on this device with ${backup.orders.length} orders from this backup? Back up current orders first.`)) return;
    persist(backup.orders);
    toast('Backup restored');
  } catch (error) {
    notice(`Backup not restored: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});

window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  // A second open tab must not silently overwrite an in-progress edit.
  storageAvailable = false;
  if (dialog.open) dialog.close();
  notice('Orders changed in another tab or browser storage was cleared. Reload before making more changes.');
  render();
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});
$('#install').addEventListener('click', async () => {
  if (!installPrompt) {
    $('#install-dialog').showModal();
    return;
  }
  try {
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  } catch (error) {
    notice(`Installation could not start: ${error.message}`);
  }
});
$('#close-install').addEventListener('click', () => $('#install-dialog').close());
window.addEventListener('appinstalled', () => { $('#install').hidden = true; });
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) $('#install').hidden = true;

let offlineReady = false;
function connection() {
  $('#connection').textContent = offlineReady
    ? (navigator.onLine ? 'Offline ready · Saved on this device' : 'You are offline · Orders still save')
    : 'Offline mode not ready · Connect to finish setup';
}
window.addEventListener('online', connection);
window.addEventListener('offline', connection);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    offlineReady = true;
    connection();
  }).catch(error => {
    connection();
    notice(`Offline setup failed: ${error.message} Stay connected and reload to retry.`);
  });
} else {
  connection();
  notice('Offline installation needs HTTPS and a browser that supports service workers. Orders can still be saved while this page is open.');
}
render();
