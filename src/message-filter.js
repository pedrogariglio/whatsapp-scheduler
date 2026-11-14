'use strict';

function shouldHandleOwnMessage(message, { ownCus, ownLid, botIsReplying } = {}) {
  if (!message || !message.fromMe) return false;
  if (message.hasQuotedMsg) return false;
  if (botIsReplying) return false;
  if (!ownCus) return false;

  const remote = message.id && message.id.remote;
  const from = message.from;

  return remote === ownCus
    || remote === ownLid
    || (from === ownCus && (message.to === ownCus || message.to === ownLid));
}

module.exports = { shouldHandleOwnMessage };
