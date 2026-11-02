import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUANTITY, MAX_QR_LENGTH, MAX_DELIVERY_PHOTO_LENGTH, money, total, summary, paymentSummary, compareDeliveryOrders, validateOrder, validateOrders, markOrdersPaid, validateVenmoQR, validateDeliveryPhoto, toCSV } from './sales.js';

const order = overrides => ({
  id: 'test-order', name: 'Test Customer', address: '12 Example St', phone: '555-0100',
  wreaths: 1, candles: 2, payment: 'cash', paid: false, delivered: false,
  location: 'Front steps', notes: '', createdAt: '2026-10-31T12:00:00.000Z', ...overrides,
});

test('uses sheet header prices, not the inconsistent example total', () => {
  assert.equal(total(order()), 46);
  assert.equal(total(order({ candles: 0 })), 20);
  assert.equal(total(order({ wreaths: 0, candles: 1 })), 13);
});
test('aggregates payment and delivery independently', () => {
  assert.deepEqual(summary([order(), order({ id: 'second', wreaths: 2, candles: 0, paid: true, delivered: true })]),
    { sales: 86, collected: 40, donations: 0, wreaths: 3, candles: 2, pending: 1 });
  assert.deepEqual(summary([]), { sales: 0, collected: 0, donations: 0, wreaths: 0, candles: 0, pending: 0 });
});
test('validates every persisted order and backup', () => {
  assert.equal(validateOrder(order()).name, 'Test Customer');
  for (const invalid of [
    { name: ' ' }, { address: '' }, { wreaths: -1 }, { candles: 1.5 }, { wreaths: 1000 },
    { wreaths: 0, candles: 0 }, { paid: 'yes' }, { delivered: null }, { payment: 'other' },
    { createdAt: 'invalid' }, { notes: null }, { phone: 123 }, { id: '' },
  ]) assert.throws(() => validateOrder(order(invalid)));
  assert.throws(() => validateOrders({}));
  assert.throws(() => validateOrders([order(), order()]));
  assert.throws(() => validateOrders([null]));
  assert.equal(validateOrder(order({ wreaths: MAX_QUANTITY, candles: MAX_QUANTITY })).wreaths, 999);
  assert.throws(() => validateOrder(order({ candles: MAX_QUANTITY + 1 })));
});
test('marks existing and restored orders paid without changing other data', () => {
  const original = [order(), order({ id: 'second', payment: 'venmo', paid: true, delivered: true })];
  const paid = markOrdersPaid(original);
  assert.deepEqual(paid, original.map(item => ({ ...item, paid: true })));
  assert.equal(original[0].paid, false);
  assert.deepEqual(markOrdersPaid(paid), paid);
  assert.deepEqual(summary(paid), { sales: 92, collected: 92, donations: 0, wreaths: 2, candles: 4, pending: 1 });
  assert.ok(toCSV(paid).includes('"46","Yes","","","Yes","No"'));
  assert.throws(() => markOrdersPaid([order({ paid: 'yes' })]));
});
test('CSV preserves sheet fields, quotes, newlines, and protects formulas', () => {
  const csv = toCSV([order({ name: '=SUM(1,2)', notes: 'A "quote"\nand comma,', payment: 'venmo', paid: true })]);
  assert.ok(csv.startsWith('\uFEFF"Name","Address","Phone"'));
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"A ""quote""\nand comma,"'));
  assert.ok(csv.includes('"46","","","Yes","Yes","No","Front steps"'));
  for (const name of ['+command', '-command', '@command', ' \t=command']) {
    assert.ok(toCSV([order({ name })]).includes(`"'${name}"`));
  }
});
test('Venmo QR storage accepts only bounded embedded PNG images', () => {
  const prefix = 'data:image/png;base64,iVBORw0KGgo';
  assert.equal(validateVenmoQR(`${prefix}AAAA==`), `${prefix}AAAA==`);
  assert.equal(validateVenmoQR(prefix + 'A'.repeat(MAX_QR_LENGTH - prefix.length)).length, MAX_QR_LENGTH);
  for (const invalid of [
    null, 123, 'https://example.com/qr.png', 'javascript:alert(1)',
    'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,not-a-png',
    `${prefix}<script>`, prefix + 'A'.repeat(MAX_QR_LENGTH - prefix.length + 1),
  ]) assert.throws(() => validateVenmoQR(invalid));
});
test('delivery records support optional evidence and preserve it in backups', () => {
  const photo = 'data:image/jpeg;base64,/9j/AAAA==';
  const delivered = order({ delivered: true, deliveredAt: '2026-12-01T12:00:00.000Z', deliveryPhoto: photo });
  assert.deepEqual(validateOrders(JSON.parse(JSON.stringify([delivered]))), [delivered]);
  assert.equal(markOrdersPaid([delivered])[0].deliveryPhoto, photo);
  assert.equal(validateOrder(order({ delivered: true })).delivered, true);
  assert.equal(validateOrder(order({ deliveredAt: null, deliveryPhoto: null })).delivered, false);
  assert.ok(toCSV([delivered]).includes('"2026-12-01T12:00:00.000Z","Yes"'));
  assert.equal(summary([delivered, order({ id: 'pending' })]).pending, 1);
  for (const invalid of [
    { deliveryPhoto: photo }, { deliveredAt: '2026-12-01' },
    { delivered: true, deliveredAt: 'invalid' },
    { delivered: true, deliveryPhoto: 'https://example.com/photo.jpg' },
    { delivered: true, deliveryPhoto: 'data:image/svg+xml;base64,AAAA' },
  ]) assert.throws(() => validateOrder(order(invalid)));
});
test('delivery photos have an exact encoded size limit and safe image type', () => {
  const prefix = 'data:image/jpeg;base64,/9j/';
  assert.equal(validateDeliveryPhoto(prefix + 'A'.repeat(MAX_DELIVERY_PHOTO_LENGTH - prefix.length)).length, MAX_DELIVERY_PHOTO_LENGTH);
  assert.throws(() => validateDeliveryPhoto(prefix + 'A'.repeat(MAX_DELIVERY_PHOTO_LENGTH - prefix.length + 1)));
  assert.throws(() => validateDeliveryPhoto(null));
  assert.throws(() => validateDeliveryPhoto('javascript:alert(1)'));
});
test('donations include cents, work without goods, and do not require delivery', () => {
  assert.equal(money(20.1), '$20.10');
  assert.equal(money(20), '$20');
  const donationOnly = order({ wreaths: 0, candles: 0, donation: 10.25, address: '', paid: true });
  assert.equal(validateOrder(donationOnly), donationOnly);
  assert.equal(total(donationOnly), 10.25);
  assert.equal(total(order({ donation: 0.25 })), 46.25);
  assert.deepEqual(summary([donationOnly]), { sales: 10.25, collected: 10.25, donations: 10.25, wreaths: 0, candles: 0, pending: 0 });
  assert.equal(summary([donationOnly, order({ donation: 0.1 }), order({ donation: 0.2 })]).donations, 10.55);
  assert.equal(markOrdersPaid(JSON.parse(JSON.stringify([donationOnly])))[0].donation, 10.25);
  assert.ok(toCSV([donationOnly]).includes('"Not required"'));
  assert.ok(toCSV([donationOnly]).endsWith('"10.25"'));
  assert.equal(total(order()), 46);
  for (const donation of [-1, 0.001, NaN, Infinity, '10', null, 1000000]) {
    assert.throws(() => validateOrder(order({ donation })));
  }
  assert.throws(() => validateOrder(order({ donation: 10, address: '' })));
});
test('delivery route follows street, parity, and the requested number direction', () => {
  const addresses = [
    '1 Richard Road', '3 Richard Rd.', '11 RICHARD RD, Holliston MA',
    '20 Richard Road', '10 Richard Rd', '2 Richard Road',
    '22 Temi Rd', '12 Temi Road', '2 Temi Rd.',
    '1 Temi Road', '3 Temi Rd', '11 Temi Road',
    '2 Day Road', '10 Day Rd.', '100 Day Road',
    '1 Woods Crossing', '9 Woods Xing', '20 Woods Crossing',
    '12 Unknown Street', 'Richard Road', '4 Richard Roadway', '8 Temi Drive', '',
  ];
  const expected = addresses.map((address, i) => order({ id: String(i), address }));
  const shuffled = expected.filter((_, i) => i % 2).reverse().concat(expected.filter((_, i) => i % 2 === 0).reverse());
  const sorted = shuffled.toSorted(compareDeliveryOrders);
  assert.deepEqual(sorted.slice(0, 18).map(item => item.address), addresses.slice(0, 18));
  assert.deepEqual(new Set(sorted.slice(18).map(item => item.address)), new Set(addresses.slice(18)));
  assert.equal(sorted.length, addresses.length);
});
test('route sorting supports suffixes, apartments, unknown-address fallback, and stable ties', () => {
  const addresses = ['  1a richard rd.  ', '1B Richard Road', '3 Richard Rd Apt 2', '8 Temi Road, Holliston', '6 Temi Rd #1'];
  assert.deepEqual(addresses.toReversed().map(address => order({ address })).sort(compareDeliveryOrders).map(item => item.address), addresses);
  const old = order({ address: 'Other street', createdAt: '2026-10-01T00:00:00Z' });
  const recent = order({ address: 'No match', createdAt: '2026-11-01T00:00:00Z' });
  assert.deepEqual([old, recent].sort(compareDeliveryOrders), [recent, old]);
  assert.equal(compareDeliveryOrders(order(), order()), 0);
});
test('Scott Road runs low to high between the early and remaining odd Temi stops', () => {
  const addresses = [
    '2 Richard Road', '50 Temi Road', '2 Temi Road',
    '1 Temi Rd', '31 Temi Road', '33 Temi Road',
    '1 Scott Road', '2 SCOTT RD.', '10 Scott Rd, Holliston',
    '45 Temi Rd', '47 Temi Road', '2 Day Road', '1 Woods Crossing', '1 Other Road',
  ];
  assert.deepEqual(addresses.toReversed().map(address => order({ address })).sort(compareDeliveryOrders).map(item => item.address), addresses);
  const missingAnchors = ['31 Temi Road', '2 Scott Rd', '10 Scott Road', '47 Temi Road'];
  assert.deepEqual(missingAnchors.toReversed().map(address => order({ address })).sort(compareDeliveryOrders).map(item => item.address), missingAnchors);
});
test('payment report includes donations and separates checks from cash plus Venmo', () => {
  const orders = [
    order({ paid: true, payment: 'cash', donation: 0.1 }),
    order({ paid: true, payment: 'cash', donation: 0.2, delivered: true }),
    order({ paid: true, payment: 'venmo', donation: 5.25 }),
    order({ paid: true, payment: 'check' }),
    order({ paid: true, payment: 'venmo', wreaths: 0, candles: 0, donation: 10 }),
    order({ paid: false, payment: 'check', donation: 100 }),
  ];
  assert.deepEqual(paymentSummary(orders), { cash: 92.3, venmo: 61.25, check: 46, cashAndVenmo: 153.55, total: 199.55 });
  assert.deepEqual(paymentSummary([]), { cash: 0, venmo: 0, check: 0, cashAndVenmo: 0, total: 0 });
});
