// Router: picks SQLite (local file) or Supabase (cloud) based on DB_DRIVER env var.
// Both implementations expose the same async-shaped functions.
const DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

const impl = await (DRIVER === 'supabase'
  ? import('./db.supabase.js')
  : import('./db.sqlite.js'));

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
