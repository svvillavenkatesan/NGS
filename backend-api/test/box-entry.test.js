import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { expandBoxTicket } = await import('../src/server.js');

const values = (number) => ({ number });

test('expands 2D BOX entries into unique permutations', () => {
  assert.deepEqual(expandBoxTicket(values('12'), true).map((item) => item.number), ['12', '21']);
  assert.deepEqual(expandBoxTicket(values('11'), true).map((item) => item.number), ['11']);
});

test('expands 3D and 4D BOX entries without duplicates', () => {
  assert.equal(expandBoxTicket(values('123'), true).length, 6);
  assert.equal(expandBoxTicket(values('112'), true).length, 3);
  assert.equal(expandBoxTicket(values('1234'), true).length, 24);
  assert.equal(expandBoxTicket(values('1123'), true).length, 12);
  assert.equal(expandBoxTicket(values('1122'), true).length, 6);
  assert.equal(expandBoxTicket(values('1112'), true).length, 4);
  assert.equal(expandBoxTicket(values('1111'), true).length, 1);
});

test('keeps straight and single-digit entries unchanged', () => {
  assert.deepEqual(expandBoxTicket(values('1234'), false).map((item) => item.number), ['1234']);
  assert.deepEqual(expandBoxTicket(values('7'), true).map((item) => item.number), ['7']);
});
