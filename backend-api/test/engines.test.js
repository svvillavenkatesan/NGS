import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTicket } from '../src/services/prize-engine.js';
import { calculateBonus } from '../src/services/bonus-engine.js';
import { calculateTierProfits, validatePricingHierarchy } from '../src/services/pricing-engine.js';

const fourDigit = { type: 'FOUR_DIGIT', prizes: { four: 50000, three: 10000, two: 2000, one: 500 } };
test('awards the DABC four-digit prize from a four-digit result', () => assert.equal(evaluateTicket('5846', '5846', fourDigit).prize, 50000));
test('awards trailing matches', () => assert.equal(evaluateTicket('1846', '5846', fourDigit).prize, 10000));
test('supports pair and single schemes', () => {
  assert.equal(evaluateTicket('84', '5846', { type: 'TWO_DIGIT' }, 'AB').prize, 1000);
  assert.equal(evaluateTicket('86', '5846', { type: 'TWO_DIGIT', premium: true }, 'AC').prize, 2000);
  assert.equal(evaluateTicket('6', '5846', { type: 'ONE_DIGIT', premium: true }, 'C').prize, 250);
});
test('ALL schemes match every position-specific pair and single', () => {
  for (const pair of ['84', '86', '46']) assert.equal(evaluateTicket(pair, '5846', { type: 'TWO_DIGIT' }, 'ALL').prize, 1000);
  for (const single of ['8', '4', '6']) assert.equal(evaluateTicket(single, '5846', { type: 'ONE_DIGIT' }, 'ALL').prize, 100);
  assert.equal(evaluateTicket('85', '5846', { type: 'TWO_DIGIT' }, 'ALL').isWinner, false);
});
test('rejects an inverted price chain', () => assert.throws(() => validatePricingHierarchy({ baseRate: 10, distributorRate: 9, sellerRate: 12 }), RangeError));
test('calculates optional target bonus', () => assert.deepEqual(calculateBonus(100, 2500, { enabled: true, targetSales: 100, percentage: 20 }), { eligible: true, targetSales: 100, percentage: 20, bonusAmount: 500, netProfit: 2000 }));
test('calculates tier profits', () => assert.deepEqual(calculateTierProfits({ quantity: 10, baseRate: 10, distributorRate: 12, sellerRate: 15, customerRate: 20 }), { admin: 20, distributor: 30, subDistributor: null, seller: 50 }));
