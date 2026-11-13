'use strict';

const fs = require('fs');
const path = require('path');

function cleanupOrphanUploads(uploadsDir, messages) {
  if (!fs.existsSync(uploadsDir)) {
    return { removed: [] };
  }

  const referenced = new Set(
    (Array.isArray(messages) ? messages : [])
      .map(message => message && message.attachment_path)
      .filter(Boolean)
      .map(filePath => path.basename(String(filePath)))
  );

  const removed = [];

  for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
    if (!entry.isFile() || referenced.has(entry.name)) continue;

    try {
      fs.unlinkSync(path.join(uploadsDir, entry.name));
      removed.push(entry.name);
    } catch (err) {
      console.warn(`⚠️  No se pudo borrar el upload huerfano ${entry.name}:`, err.message);
    }
  }

  return { removed };
}

module.exports = { cleanupOrphanUploads };
