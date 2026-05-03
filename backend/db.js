// Local SQLite (Node 24+ built-in node:sqlite) is the only supported storage backend.
// All driver functions live in db.sqlite.js; this file just re-exports them.
const impl = await import('./db.sqlite.js');

console.log(`[db] using ${impl.driver} backend`);

export const {
  ensureUser,
  saveMessage,
  getRecentMessages,
  getAllMessages,
  saveMemory,
  getTopMemories,
  deleteMemory,
} = impl;
