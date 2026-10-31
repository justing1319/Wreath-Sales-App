import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUANTITY, total, summary, validateOrder, validateOrders, markOrdersPaid, toCSV } from './sales.js';

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
    { sales: 86, collected: 40, wreaths: 3, candles: 2, pending: 1 });
  assert.deepEqual(summary([]), { sales: 0, collected: 0, wreaths: 0, candles: 0, pending: 0 });
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
  assert.deepEqual(summary(paid), { sales: 92, collected: 92, wreaths: 2, candles: 4, pending: 1 });
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
