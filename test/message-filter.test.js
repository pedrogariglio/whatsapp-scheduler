'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldHandleOwnMessage } = require('../src/message-filter');

const ownCus = '5491100000000@c.us';
const ownLid = '123456789012345@lid';

function makeMessage(overrides = {}) {
  return {
    fromMe: true,
    hasQuotedMsg: false,
    from: ownCus,
    to: ownCus,
    id: { remote: ownCus },
    ...overrides,
  };
}

test('acepta un mensaje en el chat propio por c.us', () => {
  assert.equal(
    shouldHandleOwnMessage(makeMessage(), { ownCus, ownLid, botIsReplying: false }),
    true,
  );
});

test('acepta un mensaje en el chat propio por lid', () => {
  assert.equal(
    shouldHandleOwnMessage(
      makeMessage({ id: { remote: ownLid }, from: ownLid, to: ownLid }),
      { ownCus, ownLid, botIsReplying: false },
    ),
    true,
  );
});

test('acepta un mensaje de la cuenta propia hacia el lid propio', () => {
  assert.equal(
    shouldHandleOwnMessage(
      makeMessage({ from: ownCus, to: ownLid, id: { remote: ownLid } }),
      { ownCus, ownLid, botIsReplying: false },
    ),
    true,
  );
});

test('rechaza mensajes de terceros', () => {
  assert.equal(
    shouldHandleOwnMessage(
      makeMessage({ id: { remote: '5491111111111@c.us' }, to: '5491111111111@c.us' }),
      { ownCus, ownLid, botIsReplying: false },
    ),
    false,
  );
});

test('rechaza mensajes propios mientras el bot esta respondiendo', () => {
  assert.equal(
    shouldHandleOwnMessage(makeMessage(), { ownCus, ownLid, botIsReplying: true }),
    false,
  );
});

test('rechaza mensajes no enviados por la cuenta propia', () => {
  assert.equal(
    shouldHandleOwnMessage(makeMessage({ fromMe: false }), { ownCus, ownLid, botIsReplying: false }),
    false,
  );
});

test('rechaza mensajes con cita', () => {
  assert.equal(
    shouldHandleOwnMessage(makeMessage({ hasQuotedMsg: true }), { ownCus, ownLid, botIsReplying: false }),
    false,
  );
});

test('rechaza si falta la cuenta propia', () => {
  assert.equal(
    shouldHandleOwnMessage(makeMessage(), { ownLid, botIsReplying: false }),
    false,
  );
});
