'use strict';

const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

function normalizePhone(value) {
  if (value === undefined || value === null) return '';
  return String(value).split('@')[0].replace(/\D/g, '');
}

function isValidPhone(phone) {
  return typeof phone === 'string'
    && phone.length >= MIN_PHONE_DIGITS
    && phone.length <= MAX_PHONE_DIGITS;
}

function isPhoneLikeName(name) {
  const value = String(name || '').trim();
  if (!value) return false;
  if (!/^[+\d\s().-]+$/.test(value)) return false;
  return isValidPhone(normalizePhone(value));
}

function nameScore(name) {
  const value = String(name || '').trim();
  if (!value) return -1;

  const letters = (value.match(/\p{L}/gu) || []).length;
  const digits = (value.match(/\d/g) || []).length;
  let score = letters * 10 + value.length;

  if (digits > 0 && letters === 0) score -= 1000;
  if (value.startsWith('@')) score -= 500;

  return score;
}

function formatPhone(phone) {
  return phone ? `+${phone}` : '';
}

function pickName(contact, phone) {
  const candidates = [contact.name, contact.shortName, contact.pushname]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  if (candidates.length === 0) return formatPhone(phone);

  candidates.sort((a, b) => nameScore(b) - nameScore(a) || a.localeCompare(b));
  return candidates[0];
}

function resolveContactPhone(contact) {
  const id = contact.id || {};
  const serialized = typeof id._serialized === 'string' ? id._serialized : '';
  const isLid = id.server === 'lid' || serialized.endsWith('@lid');

  if (!isLid) {
    const phone = normalizePhone(contact.number);
    if (!phone) return { reason: 'noNumber' };
    if (!isValidPhone(phone)) return { reason: 'invalidNumber' };
    return { phone };
  }

  const phoneNumber = contact.phoneNumber;
  const lidPhone = typeof phoneNumber === 'string'
    ? phoneNumber
    : phoneNumber && (phoneNumber.user || phoneNumber._serialized);
  const resolvedFromLid = normalizePhone(lidPhone);
  if (isValidPhone(resolvedFromLid)) return { phone: resolvedFromLid };

  // El parche de Utils.js reemplaza el userid LID por el teléfono real.
  const number = normalizePhone(contact.number);
  if (number && number !== normalizePhone(id.user) && isValidPhone(number)) {
    return { phone: number };
  }

  if (isPhoneLikeName(contact.name)) {
    const phoneFromName = normalizePhone(contact.name);
    if (isValidPhone(phoneFromName)) return { phone: phoneFromName };
  }

  return { reason: 'unresolvedLid' };
}

function normalizeFallbackCache(fallbackCache) {
  const byPhone = new Map();

  for (const entry of Array.isArray(fallbackCache) ? fallbackCache : []) {
    if (!entry) continue;

    const phone = normalizePhone(entry.phone);
    if (!isValidPhone(phone)) continue;

    const name = typeof entry.name === 'string' && entry.name.trim()
      ? entry.name.trim()
      : formatPhone(phone);
    const existing = byPhone.get(phone);

    if (!existing || nameScore(name) > nameScore(existing.name)) {
      byPhone.set(phone, { name, phone });
    }
  }

  return [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function buildContactsCache(freshContacts, fallbackCache = []) {
  const stats = {
    raw: 0,
    groups: 0,
    me: 0,
    notSaved: 0,
    noName: 0,
    noNumber: 0,
    invalidNumber: 0,
    unresolvedLid: 0,
    duplicates: 0,
    kept: 0,
    usedFallback: false,
  };

  const fresh = Array.isArray(freshContacts) ? freshContacts : [];
  const fallback = normalizeFallbackCache(fallbackCache);

  if (fresh.length === 0) {
    stats.usedFallback = true;
    stats.kept = fallback.length;
    return { contacts: fallback, stats };
  }

  stats.raw = fresh.length;
  const byPhone = new Map();

  for (const contact of fresh) {
    if (!contact) continue;
    if (contact.isGroup) { stats.groups += 1; continue; }
    if (contact.isMe) { stats.me += 1; continue; }
    if (!contact.isMyContact) { stats.notSaved += 1; continue; }

    const resolved = resolveContactPhone(contact);
    if (resolved.reason) {
      stats[resolved.reason] += 1;
      continue;
    }

    const name = pickName(contact, resolved.phone);
    if (!name) {
      stats.noName += 1;
      continue;
    }

    const existing = byPhone.get(resolved.phone);
    if (existing) {
      stats.duplicates += 1;
      if (nameScore(name) > nameScore(existing.name)) {
        byPhone.set(resolved.phone, { name, phone: resolved.phone });
      }
      continue;
    }

    byPhone.set(resolved.phone, { name, phone: resolved.phone });
  }

  const contacts = [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (contacts.length === 0) {
    stats.usedFallback = true;
    stats.kept = fallback.length;
    return { contacts: fallback, stats };
  }

  stats.kept = contacts.length;
  return { contacts, stats };
}

module.exports = {
  buildContactsCache,
  normalizePhone,
  isValidPhone,
  nameScore,
  resolveContactPhone,
};
