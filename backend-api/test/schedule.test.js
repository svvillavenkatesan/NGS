import test from 'node:test';
import assert from 'node:assert/strict';
import { findOpenSchedule, resultPublishReady } from '../src/services/schedule-engine.js';

const kerala = [{ id: 'show1', label: 'KL 3:00 PM', enabled: true, startTime: '00:01', endTime: '15:00' }];
const dear = [
  { id: 'show1', label: 'DEAR 1:00 PM', enabled: true, startTime: '00:01', endTime: '12:58' },
  { id: 'show2', label: 'DEAR 6:00 PM', enabled: true, startTime: '00:01', endTime: '17:58' },
  { id: 'show3', label: 'DEAR 8:00 PM', enabled: true, startTime: '00:01', endTime: '19:58' }
];

test('Kerala accepts entries only from 00:01 through 15:00', () => {
  assert.equal(findOpenSchedule(kerala, 0), null);
  assert.equal(findOpenSchedule(kerala, 1)?.id, 'show1');
  assert.equal(findOpenSchedule(kerala, 900)?.id, 'show1');
  assert.equal(findOpenSchedule(kerala, 901), null);
});

test('Dear defaults to the next closing show and supports explicit show selection', () => {
  assert.equal(findOpenSchedule(dear, 1)?.id, 'show1');
  assert.equal(findOpenSchedule(dear, 778)?.id, 'show1');
  assert.equal(findOpenSchedule(dear, 779)?.id, 'show2');
  assert.equal(findOpenSchedule(dear, 779, {}, 'show1'), null);
  assert.equal(findOpenSchedule(dear, 779, {}, 'show2')?.id, 'show2');
  assert.equal(findOpenSchedule(dear, 1078)?.id, 'show2');
  assert.equal(findOpenSchedule(dear, 1079)?.id, 'show3');
  assert.equal(findOpenSchedule(dear, 1198)?.id, 'show3');
  assert.equal(findOpenSchedule(dear, 1199), null);
});

test('Direct Seller grace extends only the selected show cutoff', () => {
  assert.equal(findOpenSchedule(dear, 1200), null);
  assert.equal(findOpenSchedule(dear, 1200, { show3: 2 })?.id, 'show3');
  assert.equal(findOpenSchedule(dear, 1201, { show3: 2 }), null);
});

test('Result publishing waits until one minute after entry close', () => {
  assert.equal(resultPublishReady(dear[0], '2026-08-27', '2026-08-27', 778), false);
  assert.equal(resultPublishReady(dear[0], '2026-08-27', '2026-08-27', 779), true);
  assert.equal(resultPublishReady(dear[0], '2026-08-27', '2026-08-27', 780, 2), false);
  assert.equal(resultPublishReady(dear[0], '2026-08-27', '2026-08-27', 781, 2), true);
  assert.equal(resultPublishReady(dear[0], '2026-08-28', '2026-08-27', 1200), false);
  assert.equal(resultPublishReady(dear[0], '2026-08-26', '2026-08-27', 1), true);
});
