'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildContactsCache,
  normalizePhone,
  resolveContactPhone,
} = require('../src/contacts');

function makeContact(overrides = {}) {
  const number = overrides.number ?? '5491100000000';

  return {
    id: { server: 'c.us', user: number, _serialized: `${number}@c.us` },
    number,
    name: '',
    shortName: '',
    pushname: '',
    isMyContact: true,
    isGroup: false,
    isMe: false,
    ...overrides,
  };
}

test('normaliza teléfonos a dígitos', () => {
  assert.equal(normalizePhone('+54 9 11 3126-0531'), '5491131260531');
  assert.equal(normalizePhone('5491131260531@c.us'), '5491131260531');
  assert.equal(normalizePhone(null), '');
});

test('deduplica por teléfono y prefiere el nombre más descriptivo', () => {
  const fresh = [
    makeContact({ number: '5491111111111', name: 'Clari Lopez' }),
    makeContact({ number: '5491111111111', name: 'Clarii Lopez' }),
    makeContact({ number: '5491111111111', name: '+54 9 11 1111-1111' }),
  ];

  const { contacts, stats } = buildContactsCache(fresh, []);

  assert.deepEqual(contacts, [{ name: 'Clarii Lopez', phone: '5491111111111' }]);
  assert.equal(stats.duplicates, 2);
  assert.equal(stats.kept, 1);
});

test('prefiere el nombre guardado por encima del pushname', () => {
  const fresh = [
    makeContact({
      number: '5493534148265',
      name: 'meli',
      pushname: 'melisa pastori',
    }),
  ];

  const { contacts } = buildContactsCache(fresh, []);

  assert.deepEqual(contacts, [{ name: 'meli', phone: '5493534148265' }]);
});

test('incluye solo contactos guardados y excluye grupos y cuenta propia', () => {
  const fresh = [
    makeContact({ number: '5491122222222', name: 'Ana' }),
    makeContact({ number: '5491133333333', name: 'Beta', isMyContact: false }),
    makeContact({ number: '5491144444444', name: 'Grupo', isGroup: true }),
    makeContact({ number: '5491155555555', name: 'Yo', isMe: true }),
  ];

  const { contacts, stats } = buildContactsCache(fresh, []);

  assert.deepEqual(contacts, [{ name: 'Ana', phone: '5491122222222' }]);
  assert.equal(stats.raw, 4);
  assert.equal(stats.notSaved, 1);
  assert.equal(stats.groups, 1);
  assert.equal(stats.me, 1);
});

test('resuelve LID usando phoneNumber', () => {
  const contact = makeContact({
    id: { server: 'lid', user: '123456789012345', _serialized: '123456789012345@lid' },
    number: '123456789012345',
    phoneNumber: { user: '5491166666666' },
    name: 'Karen',
  });

  const resolved = resolveContactPhone(contact);

  assert.deepEqual(resolved, { phone: '5491166666666' });
});

test('usa el número ya resuelto por el parche cuando el ID sigue siendo LID', () => {
  const contact = makeContact({
    id: { server: 'lid', user: '123456789012345', _serialized: '123456789012345@lid' },
    number: '5491177777777',
    name: 'Karen',
  });

  const resolved = resolveContactPhone(contact);

  assert.deepEqual(resolved, { phone: '5491177777777' });
});

test('usa un nombre con formato de teléfono cuando el LID no se pudo resolver', () => {
  const contact = makeContact({
    id: { server: 'lid', user: '123456789012345', _serialized: '123456789012345@lid' },
    number: '123456789012345',
    name: '+54 9 11 3126-0531',
  });

  const resolved = resolveContactPhone(contact);

  assert.deepEqual(resolved, { phone: '5491131260531' });
});

test('descarta LIDs sin teléfono real y sin nombre telefónico', () => {
  const contact = makeContact({
    id: { server: 'lid', user: '123456789012345', _serialized: '123456789012345@lid' },
    number: '123456789012345',
    name: 'Karen',
  });

  const { contacts, stats } = buildContactsCache([contact], []);

  assert.deepEqual(contacts, []);
  assert.equal(stats.unresolvedLid, 1);
});

test('usa el cache previo cuando no hay datos frescos', () => {
  const fallback = [
    { name: 'Viejo', phone: '5491188888888' },
    { name: 'Viejo Dos', phone: '5491188888888' },
  ];

  const { contacts, stats } = buildContactsCache([], fallback);

  assert.deepEqual(contacts, [{ name: 'Viejo Dos', phone: '5491188888888' }]);
  assert.equal(stats.usedFallback, true);
  assert.equal(stats.kept, 1);
});

test('usa el cache previo si el refresco no deja contactos válidos', () => {
  const fresh = [
    makeContact({ number: '5491133333333', name: 'Beta', isMyContact: false }),
  ];
  const fallback = [{ name: 'Viejo', phone: '5491188888888' }];

  const { contacts, stats } = buildContactsCache(fresh, fallback);

  assert.deepEqual(contacts, fallback);
  assert.equal(stats.usedFallback, true);
});

test('usa el teléfono formateado cuando el contacto guardado no tiene nombre', () => {
  const fresh = [
    makeContact({ number: '5491199999999', name: '', shortName: '', pushname: '' }),
  ];

  const { contacts } = buildContactsCache(fresh, []);

  assert.deepEqual(contacts, [{ name: '+5491199999999', phone: '5491199999999' }]);
});
