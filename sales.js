export const PRICES = Object.freeze({ wreaths: 20, candles: 13 });
export const MAX_QUANTITY = 999;
export const STORAGE_KEY = 'pack47-orders-v1';
export const VENMO_QR_KEY = 'pack47-venmo-qr-v1';
export const MAX_QR_LENGTH = 2 * 1024 * 1024;
export const MAX_DELIVERY_PHOTO_LENGTH = 2 * 1024 * 1024;
export const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
export const needsDelivery = order => order.wreaths + order.candles > 0;
const addMoney = (a, b) => (Math.round(a * 100) + Math.round(b * 100)) / 100;
export const total = order => addMoney(order.wreaths * PRICES.wreaths + order.candles * PRICES.candles, order.donation ?? 0);

function deliveryRoutePosition(address) {
  const match = address.trim().match(/^(\d+)([a-z]?)\s+(richard\s+(?:road|rd)|temi\s+(?:road|rd)|day\s+(?:road|rd)|woods\s+(?:crossing|xing))\.?(?=$|[\s,])/i);
  if (!match) return { group: 6, number: 0 };
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number)) return { group: 6, number: 0 };
  const street = match[3].toLowerCase();
  if (street.startsWith('richard')) return { group: number % 2 ? 0 : 1, number: number % 2 ? number : -number };
  if (street.startsWith('temi')) return { group: number % 2 ? 3 : 2, number: number % 2 ? number : -number };
  return { group: street.startsWith('day') ? 4 : 5, number };
}

export function compareDeliveryOrders(a, b) {
  const first = deliveryRoutePosition(a.address);
  const second = deliveryRoutePosition(b.address);
  return first.group - second.group || first.number - second.number ||
    (first.group === 6 ? b.createdAt.localeCompare(a.createdAt)
      : a.address.localeCompare(b.address, 'en', { numeric: true, sensitivity: 'base' }));
}

export function validateDonation(donation) {
  if (typeof donation !== 'number' || !Number.isFinite(donation) || donation < 0 || donation > 999999.99 ||
      Math.abs(donation * 100 - Math.round(donation * 100)) > 0.000001) {
    throw new Error('Donation must be between $0 and $999,999.99 with at most two decimal places.');
  }
  return donation;
}

export function validateVenmoQR(image) {
  if (typeof image !== 'string' || image.length > MAX_QR_LENGTH ||
      !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(image)) {
    throw new Error('Use a valid QR screenshot. If it is too large, crop it to the QR code and try again.');
  }
  return image;
}

export function validateDeliveryPhoto(image) {
  if (typeof image !== 'string' || image.length > MAX_DELIVERY_PHOTO_LENGTH ||
      !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image)) {
    throw new Error('Invalid or oversized delivery photo. Choose a smaller JPEG photo.');
  }
  return image;
}

export function validateOrder(order) {
  if (!order || typeof order !== 'object') throw new Error('Invalid order.');
  for (const field of ['id', 'name', 'address', 'phone', 'location', 'notes', 'createdAt']) {
    if (typeof order[field] !== 'string' || order[field].length > 2000) throw new Error(`Invalid ${field}.`);
  }
  if (!order.id || !order.name.trim() || (needsDelivery(order) && !order.address.trim()) || !Number.isFinite(Date.parse(order.createdAt))) {
    throw new Error('Each order needs a name and valid creation date. Orders with items also need an address.');
  }
  for (const field of ['wreaths', 'candles']) {
    if (!Number.isInteger(order[field]) || order[field] < 0 || order[field] > MAX_QUANTITY) {
      throw new Error(`Quantities must be whole numbers between 0 and ${MAX_QUANTITY}.`);
    }
  }
  const donation = validateDonation(order.donation === undefined ? 0 : order.donation);
  if (!needsDelivery(order) && donation === 0) throw new Error('Add a wreath, candle, or donation.');
  if (!['cash', 'check', 'venmo'].includes(order.payment)) throw new Error('Choose cash, check, or Venmo.');
  if (typeof order.paid !== 'boolean' || typeof order.delivered !== 'boolean') throw new Error('Invalid payment or delivery status.');
  if (order.deliveryPhoto !== undefined && order.deliveryPhoto !== null) validateDeliveryPhoto(order.deliveryPhoto);
  if (order.deliveredAt !== undefined && order.deliveredAt !== null &&
      (typeof order.deliveredAt !== 'string' || !Number.isFinite(Date.parse(order.deliveredAt)))) {
    throw new Error('Invalid delivery date.');
  }
  if (!order.delivered && (order.deliveryPhoto || order.deliveredAt)) throw new Error('Only delivered orders can have delivery evidence.');
  return order;
}

export function validateOrders(orders) {
  if (!Array.isArray(orders)) throw new Error('Orders must be a list.');
  const ids = new Set();
  for (const order of orders) {
    validateOrder(order);
    if (ids.has(order.id)) throw new Error('Backup contains duplicate orders.');
    ids.add(order.id);
  }
  return orders;
}

export function markOrdersPaid(orders) {
  return validateOrders(orders).map(order => ({ ...order, paid: true }));
}

export function summary(orders) {
  return orders.reduce((result, order) => ({
    sales: addMoney(result.sales, total(order)),
    collected: addMoney(result.collected, order.paid ? total(order) : 0),
    donations: addMoney(result.donations, order.donation ?? 0),
    wreaths: result.wreaths + order.wreaths,
    candles: result.candles + order.candles,
    pending: result.pending + Number(needsDelivery(order) && !order.delivered),
  }), { sales: 0, collected: 0, donations: 0, wreaths: 0, candles: 0, pending: 0 });
}

export function toCSV(orders) {
  const escape = value => {
    let text = String(value);
    // Prevent customer-entered text from becoming a spreadsheet formula.
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [['Name', 'Address', 'Phone', 'Wreaths', 'Candles', 'Total', 'Cash', 'Check', 'Venmo', 'Paid', 'Delivered', 'Delivery location', 'Notes', 'Order date', 'Delivery date', 'Delivery photo', 'Donation']];
  for (const order of orders) {
    rows.push([order.name, order.address, order.phone, order.wreaths, order.candles, total(order),
      order.payment === 'cash' ? 'Yes' : '', order.payment === 'check' ? 'Yes' : '',
      order.payment === 'venmo' ? 'Yes' : '', order.paid ? 'Yes' : 'No',
      !needsDelivery(order) ? 'Not required' : order.delivered ? 'Yes' : 'No', order.location, order.notes, order.createdAt,
      order.deliveredAt ?? '', order.deliveryPhoto ? 'Yes' : 'No', order.donation ?? 0]);
  }
  return '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n');
}
