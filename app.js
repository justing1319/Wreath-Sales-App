import { STORAGE_KEY, MAX_QUANTITY, VENMO_QR_KEY, money, total, summary, validateOrder, validateOrders, markOrdersPaid, validateVenmoQR, validateDeliveryPhoto, toCSV } from './sales.js';
import { loadOrders, saveOrders } from './storage.js';
import { readImage } from './images.js';

const $ = selector => document.querySelector(selector);
const form = $('#order-form');
const dialog = $('#order-dialog');
const deleteDialog = $('#delete-dialog');
const venmoDialog = $('#venmo-dialog');
const deliveryDialog = $('#delivery-dialog');
for (const field of ['wreaths', 'candles']) {
  const options = document.createDocumentFragment();
  for (let quantity = 1; quantity <= MAX_QUANTITY; quantity++) {
    options.append(new Option(String(quantity), String(quantity)));
  }
  form.elements[field].append(options);
}
let orders = [];
let storageAvailable = false;
let revision = null;
let saving = false;
let loading = true;
let mode = 'sales';
let deliveryId = null;
let deliveryPhoto = null;
let deliveryBusy = false;
const orderChannel = 'BroadcastChannel' in window ? new BroadcastChannel('pack47-orders') : null;
let editingId = null;
let deletingId = null;
let filter = 'all';
let installPrompt = null;
let toastTimer;
let venmoQR = null;
let qrUploading = false;

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

async function persist(nextOrders) {
  if (saving) throw new Error('Another change is still saving. Please wait.');
  const paidOrders = markOrdersPaid(nextOrders);
  saving = true;
  render();
  try {
    revision = await saveOrders(paidOrders, revision);
    orders = paidOrders;
    storageAvailable = true;
    $('#notice').hidden = true;
    orderChannel?.postMessage({ revision });
  } finally {
    saving = false;
    render();
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function loadVenmoQR() {
  try {
    const image = localStorage.getItem(VENMO_QR_KEY);
    venmoQR = image === null ? null : validateVenmoQR(image);
  } catch (error) {
    venmoQR = null;
    notice(`Venmo QR code could not be loaded: ${error.message} Upload the screenshot again to replace it.`);
  }
}

function updateVenmoDialog() {
  $('#venmo-image').hidden = !venmoQR;
  $('#venmo-empty').hidden = Boolean(venmoQR);
  if (venmoQR) $('#venmo-image').src = venmoQR;
  else $('#venmo-image').removeAttribute('src');
  $('#venmo-upload-label').textContent = venmoQR ? 'Replace QR screenshot' : 'Upload QR screenshot';
}

function openVenmo(order = null) {
  $('#venmo-context').textContent = order
    ? `${order.name || 'This order'} · ${money(total(order))}`
    : 'One shared code for all fundraiser orders';
  $('#venmo-error').hidden = true;
  updateVenmoDialog();
  venmoDialog.showModal();
}

function updateVenmoLink() {
  $('#order-venmo').hidden = form.elements.payment.value !== 'venmo';
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
  $('#add-order').disabled = $('#first-order').disabled = !storageAvailable || saving;
  $('#export').disabled = $('#backup').disabled = !storageAvailable || saving || !orders.length;
  $('#restore').disabled = saving || loading;
  $('#order-form button[type=submit]').disabled = saving;
  $('#delete-order').disabled = saving;
  $('#confirm-delete').disabled = saving || !deletingId ||
    $('#delete-confirmation').value !== orders.find(order => order.id === deletingId)?.name;
  $('#section-title').textContent = mode === 'delivery' ? 'Your deliveries' : 'Your orders';
  $('#section-description').textContent = mode === 'delivery'
    ? `${sums.pending} to deliver · ${orders.length - sums.pending} delivered`
    : 'From the first doorstep to the last delivery.';
  $('#add-order').hidden = mode === 'delivery';
  $('[data-filter=delivered]').hidden = mode !== 'delivery';
  document.querySelectorAll('.filter').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
    button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
  });
  updateDeliveryControls();
  updateVenmoLink();
  const query = $('#search').value.trim().toLowerCase();
  const visible = orders.filter(order => [order.name, order.address, order.phone].some(value => value.toLowerCase().includes(query)))
    .filter(order => filter === 'all' || (filter === 'pending' ? !order.delivered : order.delivered))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $('#orders').replaceChildren();
  $('#empty').hidden = orders.length > 0 || !storageAvailable;
  $('#no-results').hidden = !orders.length || visible.length > 0;
  $('#first-order').hidden = mode === 'delivery';
  $('#empty-title').textContent = mode === 'delivery' ? 'No orders to deliver yet' : 'Your next sale starts here';
  $('#empty-description').textContent = mode === 'delivery'
    ? 'Collect orders in Sales mode, then return here for the delivery round.'
    : 'Add your first order and leave the paper sheet at home.';
  $('#no-results').textContent = mode === 'delivery' && filter === 'pending' && !query
    ? 'All orders delivered. Switch to Delivered to view delivery records and photos.'
    : 'No matching orders. Try another search or filter.';
  for (const order of visible) {
    const card = element('article', `order-card${mode === 'delivery' ? ' delivery-card' : ''}`);
    const customer = element('div', 'customer');
    customer.append(element('strong', '', order.name), element('p', '', order.address));
    if (order.phone) {
      const phone = element('a', '', order.phone);
      phone.href = `tel:${order.phone.replace(/[^+\d]/g, '')}`;
      customer.append(phone);
    }
    if (order.location) customer.append(element('p', '', `Leave at: ${order.location}`));
    if (mode === 'delivery' && order.notes) customer.append(element('p', '', `Notes: ${order.notes}`));
    const items = element('div', 'items');
    items.append(element('span', '', `${order.wreaths} wreath${order.wreaths === 1 ? '' : 's'} · ${order.candles} candle${order.candles === 1 ? '' : 's'}`), element('strong', '', money(total(order))));
    const status = element('div', 'status');
    const paymentName = order.payment === 'venmo' ? 'Venmo' : order.payment === 'cash' ? 'Cash' : 'Check';
    status.append(element('span', 'badge', paymentName),
      element('span', `badge ${order.delivered ? '' : 'waiting'}`, order.delivered ? 'Delivered' : 'To deliver'));
    if (mode === 'delivery' && order.deliveryPhoto) status.append(element('span', 'badge', 'Photo saved'));
    if (order.payment === 'venmo') {
      const qrLink = element('button', 'venmo-link', 'Show Venmo QR');
      qrLink.setAttribute('aria-label', `Show Venmo QR for ${order.name}`);
      qrLink.addEventListener('click', () => openVenmo(order));
      status.append(qrLink);
    }
    const edit = element('button', mode === 'delivery' ? 'button green delivery-action' : 'button quiet edit-order',
      mode === 'delivery' ? (order.delivered ? 'View delivery' : 'Deliver') : 'Edit');
    edit.setAttribute('aria-label', `${mode === 'delivery' ? 'Open delivery' : 'Edit order'} for ${order.name}`);
    edit.disabled = !storageAvailable || saving;
    edit.addEventListener('click', () => mode === 'delivery' ? openDelivery(order) : openOrder(order));
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
  }
  updateTotal();
  updateVenmoLink();
  dialog.showModal();
  form.elements.name.focus();
}

$('#add-order').addEventListener('click', () => openOrder());
$('#first-order').addEventListener('click', () => openOrder());
$('#close-dialog').addEventListener('click', () => { if (!saving) dialog.close(); });
$('#cancel-dialog').addEventListener('click', () => { if (!saving) dialog.close(); });
form.elements.wreaths.addEventListener('change', updateTotal);
form.elements.candles.addEventListener('change', updateTotal);
form.elements.payment.addEventListener('change', updateVenmoLink);
$('#order-venmo').addEventListener('click', () => openVenmo({
  name: form.elements.name.value.trim(),
  wreaths: Number(form.elements.wreaths.value),
  candles: Number(form.elements.candles.value),
}));
$('#manage-venmo').addEventListener('click', () => openVenmo());
$('#close-venmo').addEventListener('click', () => venmoDialog.close());
$('#venmo-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file || qrUploading) return;
  qrUploading = true;
  $('#venmo-file').disabled = true;
  $('#venmo-error').hidden = true;
  $('#venmo-upload-status').textContent = 'Saving QR screenshot...';
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      throw new Error('Choose a PNG, JPEG, or WebP screenshot.');
    }
    if (file.size > 10 * 1024 * 1024) throw new Error('Screenshot must be smaller than 10 MB.');
    const qr = validateVenmoQR(await readImage(file, { format: 'image/png', maxDimension: 1600 }));
    localStorage.setItem(VENMO_QR_KEY, qr);
    venmoQR = qr;
    updateVenmoDialog();
    render();
    $('#venmo-upload-status').textContent = 'Saved on this device. Check the account and QR code before accepting payment.';
  } catch (error) {
    $('#venmo-upload-status').textContent = '';
    $('#venmo-error').textContent = `QR screenshot not saved: ${error.message}`;
    $('#venmo-error').hidden = false;
  } finally {
    qrUploading = false;
    $('#venmo-file').disabled = false;
    event.target.value = '';
  }
});
$('#venmo-image').addEventListener('error', () => {
  $('#venmo-error').textContent = 'The saved screenshot could not be displayed. Upload a new QR screenshot.';
  $('#venmo-error').hidden = false;
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (saving) return;
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
      paid: true,
      delivered: previous?.delivered ?? false,
      deliveredAt: previous?.deliveredAt ?? null,
      deliveryPhoto: previous?.deliveryPhoto ?? null,
      location: form.elements.location.value.trim(),
      notes: form.elements.notes.value.trim(),
    };
    validateOrder(order);
    await persist(editingId ? orders.map(existing => existing.id === editingId ? order : existing) : [...orders, order]);
    dialog.close();
    toast(editingId ? 'Order updated' : 'Order saved on this device');
  } catch (error) {
    $('#form-error').textContent = `Order not saved: ${error.message}`;
    $('#form-error').hidden = false;
  }
});

$('#delete-order').addEventListener('click', () => {
  const order = orders.find(order => order.id === editingId);
  if (!order) {
    $('#form-error').textContent = 'Order not found. Reload before trying again.';
    $('#form-error').hidden = false;
    return;
  }
  deletingId = order.id;
  $('#delete-form').reset();
  $('#delete-name').textContent = order.name;
  $('#delete-error').hidden = true;
  $('#confirm-delete').disabled = true;
  deleteDialog.showModal();
  $('#delete-confirmation').focus();
});

$('#delete-confirmation').addEventListener('input', () => {
  const order = orders.find(order => order.id === deletingId);
  $('#confirm-delete').disabled = !order || $('#delete-confirmation').value !== order.name;
});
$('#cancel-delete').addEventListener('click', () => { if (!saving) deleteDialog.close(); });
$('#close-delete').addEventListener('click', () => { if (!saving) deleteDialog.close(); });
deleteDialog.addEventListener('close', () => {
  deletingId = null;
  $('#delete-form').reset();
  $('#confirm-delete').disabled = true;
});
$('#delete-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (saving) return;
  try {
    const order = orders.find(order => order.id === deletingId);
    if (!order || $('#delete-confirmation').value !== order.name) {
      throw new Error("Type the customer's full name exactly as shown.");
    }
    await persist(orders.filter(order => order.id !== deletingId));
    deleteDialog.close();
    dialog.close();
    toast('Order deleted');
  } catch (error) {
    $('#delete-error').textContent = `Order not deleted: ${error.message}`;
    $('#delete-error').hidden = false;
  }
});

$('#search').addEventListener('input', render);
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  render();
}));

function switchMode(nextMode) {
  mode = nextMode;
  filter = mode === 'delivery' ? 'pending' : 'all';
  $('#search').value = '';
  for (const value of ['sales', 'delivery']) {
    $(`#${value}-mode`).className = `button ${mode === value ? 'green' : 'quiet'}`;
    $(`#${value}-mode`).setAttribute('aria-pressed', String(mode === value));
  }
  render();
}
$('#sales-mode').addEventListener('click', () => switchMode('sales'));
$('#delivery-mode').addEventListener('click', () => switchMode('delivery'));

function updateDeliveryControls() {
  const order = orders.find(order => order.id === deliveryId);
  const busy = deliveryBusy || saving;
  $('#delivery-photo-controls').disabled = busy;
  $('#save-delivery').disabled = busy || !storageAvailable;
  $('#undo-delivery').disabled = busy || !storageAvailable;
  $('#close-delivery').disabled = $('#cancel-delivery').disabled = busy;
  $('#undo-delivery').hidden = !order?.delivered;
  $('#save-delivery').textContent = order?.delivered ? 'Save delivery photo'
    : deliveryPhoto ? 'Save photo & mark delivered' : 'Mark delivered without photo';
  if (order?.delivered && deliveryPhoto === (order.deliveryPhoto ?? null)) $('#save-delivery').disabled = true;
}

function openDelivery(order) {
  deliveryId = order.id;
  deliveryPhoto = order.deliveryPhoto ?? null;
  $('#delivery-form').reset();
  $('#delivery-title').textContent = order.delivered ? 'Delivery record' : 'Record delivery';
  $('#delivery-error').hidden = true;
  $('#delivery-progress').textContent = '';
  $('#delivery-details').replaceChildren(
    element('strong', '', order.name), element('p', '', order.address),
    element('p', '', `${order.wreaths} wreaths · ${order.candles} candles`),
    element('p', '', `Leave at: ${order.location || 'No location specified'}`),
    element('p', '', order.notes ? `Notes: ${order.notes}` : ''),
  );
  if (order.phone) {
    const phone = element('a', '', order.phone);
    phone.href = `tel:${order.phone.replace(/[^+\d]/g, '')}`;
    $('#delivery-details').append(phone);
  }
  $('#delivery-status').textContent = order.delivered
    ? `Delivered${order.deliveredAt ? ` on ${new Date(order.deliveredAt).toLocaleString()}` : ' (from an earlier record)'}`
    : 'Not yet delivered. Save after leaving the items.';
  showDeliveryPhoto();
  updateDeliveryControls();
  deliveryDialog.showModal();
}

function showDeliveryPhoto() {
  $('#delivery-image').hidden = !deliveryPhoto;
  if (deliveryPhoto) $('#delivery-image').src = deliveryPhoto;
  else $('#delivery-image').removeAttribute('src');
}

async function chooseDeliveryPhoto(event) {
  const file = event.target.files[0];
  if (!file || deliveryBusy || saving) return;
  deliveryBusy = true;
  $('#delivery-error').hidden = true;
  $('#delivery-progress').textContent = 'Preparing photo...';
  updateDeliveryControls();
  try {
    deliveryPhoto = validateDeliveryPhoto(await readImage(file));
    showDeliveryPhoto();
    $('#delivery-progress').textContent = 'Photo ready. Tap Save to record this delivery.';
  } catch (error) {
    $('#delivery-progress').textContent = '';
    $('#delivery-error').textContent = `Photo not added: ${error.message}`;
    $('#delivery-error').hidden = false;
  } finally {
    deliveryBusy = false;
    event.target.value = '';
    updateDeliveryControls();
  }
}
$('#delivery-camera').addEventListener('change', chooseDeliveryPhoto);
$('#delivery-file').addEventListener('change', chooseDeliveryPhoto);
$('#delivery-image').addEventListener('error', () => {
  $('#delivery-error').textContent = 'This delivery photo could not be displayed. Choose a replacement photo.';
  $('#delivery-error').hidden = false;
});

function closeDelivery() {
  if (deliveryBusy || saving) return;
  if (deliveryPhoto !== (orders.find(order => order.id === deliveryId)?.deliveryPhoto ?? null) &&
      !confirm('Discard this unsaved delivery photo?')) return;
  deliveryDialog.close();
}
$('#close-delivery').addEventListener('click', closeDelivery);
$('#cancel-delivery').addEventListener('click', closeDelivery);
deliveryDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeDelivery();
});
deliveryDialog.addEventListener('close', () => {
  deliveryId = null;
  deliveryPhoto = null;
  $('#delivery-image').removeAttribute('src');
});
for (const modal of [dialog, deleteDialog]) modal.addEventListener('cancel', event => {
  if (saving) event.preventDefault();
});

$('#delivery-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (deliveryBusy || saving) return;
  try {
    const order = orders.find(order => order.id === deliveryId);
    if (!order) throw new Error('Order not found. Reload before trying again.');
    const updated = { ...order, delivered: true, deliveredAt: order.deliveredAt ?? new Date().toISOString(), deliveryPhoto };
    await persist(orders.map(existing => existing.id === deliveryId ? updated : existing));
    deliveryDialog.close();
    toast('Delivery saved on this device');
  } catch (error) {
    $('#delivery-error').textContent = `Delivery not saved: ${error.message}`;
    $('#delivery-error').hidden = false;
  }
});
$('#undo-delivery').addEventListener('click', async () => {
  if (saving || deliveryBusy || !confirm('Mark this order as not delivered? Its delivery date and photo will be removed.')) return;
  try {
    const order = orders.find(order => order.id === deliveryId);
    if (!order) throw new Error('Order not found. Reload before trying again.');
    await persist(orders.map(existing => existing.id === deliveryId
      ? { ...existing, delivered: false, deliveredAt: null, deliveryPhoto: null } : existing));
    deliveryDialog.close();
    toast('Order returned to the delivery list');
  } catch (error) {
    $('#delivery-error').textContent = `Delivery not changed: ${error.message}`;
    $('#delivery-error').hidden = false;
  }
});

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
  download(JSON.stringify({ app: 'pack47-evergreen', version: 2, orders }, null, 2), 'application/json', 'json');
  toast('Backup download requested. Keep the file somewhere safe.');
});
$('#restore').addEventListener('click', () => $('#backup-file').click());
$('#backup-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file || saving) return;
  try {
    if (file.size > 100 * 1024 * 1024) throw new Error('Backup must be smaller than 100 MB.');
    const backup = JSON.parse(await file.text());
    if (backup.app !== 'pack47-evergreen' || ![1, 2].includes(backup.version)) throw new Error('Choose an Evergreen backup file.');
    validateOrders(backup.orders);
    if (!confirm(`Replace orders on this device with ${backup.orders.length} orders from this backup? All restored orders will be marked paid. Back up current orders first.`)) return;
    await persist(backup.orders);
    toast('Backup restored');
  } catch (error) {
    notice(`Backup not restored: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});

function invalidateOrders() {
  storageAvailable = false;
  if (deleteDialog.open) deleteDialog.close();
  if (dialog.open) dialog.close();
  if (venmoDialog.open) venmoDialog.close();
  if (deliveryDialog.open && !deliveryBusy) deliveryDialog.close();
  notice('Orders changed in another tab or browser storage was cleared. Reload before making more changes.');
  render();
}
if (orderChannel) orderChannel.onmessage = event => {
  if (event.data.revision !== revision) invalidateOrders();
};
window.addEventListener('storage', event => {
  if (event.key === VENMO_QR_KEY) {
    loadVenmoQR();
    updateVenmoDialog();
    render();
    return;
  }
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  if (event.key === null) {
    loadVenmoQR();
    updateVenmoDialog();
  }
  invalidateOrders();
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
loadVenmoQR();
render();
try {
  const snapshot = await loadOrders();
  orders = snapshot.orders;
  revision = snapshot.revision;
  storageAvailable = true;
} catch (error) {
  if (typeof error.revision === 'string') revision = error.revision;
  notice(`Orders could not be loaded safely: ${error.message} Saving is disabled to protect existing data. Restore a valid backup or enable browser storage and reload.`);
}
loading = false;
render();
