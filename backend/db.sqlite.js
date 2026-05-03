import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = resolve('data', 'rio.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    emotion TEXT,
    intent TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_user
    ON messages(user_id, created_at);

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    fact TEXT NOT NULL,
    importance INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_memories_user
    ON memories(user_id, importance DESC, created_at DESC);
`);

const stmts = {
  upsertUser: db.prepare(
    `INSERT INTO users (id, created_at) VALUES (?, ?)
     ON CONFLICT(id) DO NOTHING`
  ),
  insertMessage: db.prepare(
    `INSERT INTO messages (user_id, role, content, emotion, intent, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  recentMessages: db.prepare(
    `SELECT role, content, emotion, intent, created_at
     FROM messages WHERE user_id = ?
     ORDER BY created_at DESC LIMIT ?`
  ),
  allMessages: db.prepare(
    `SELECT id, role, content, emotion, intent, created_at
     FROM messages WHERE user_id = ?
     ORDER BY created_at ASC LIMIT ?`
  ),
  insertMemory: db.prepare(
    `INSERT INTO memories (user_id, fact, importance, created_at)
     VALUES (?, ?, ?, ?)`
  ),
  topMemories: db.prepare(
    `SELECT id, fact, importance, created_at
     FROM memories WHERE user_id = ?
     ORDER BY importance DESC, created_at DESC LIMIT ?`
  ),
  deleteMemory: db.prepare(`DELETE FROM memories WHERE id = ?`),
};

export async function ensureUser(userId) {
  stmts.upsertUser.run(userId, Date.now());
}

export async function saveMessage({ userId, role, content, emotion = null, intent = null }) {
  stmts.insertMessage.run(userId, role, content, emotion, intent, Date.now());
}

export async function getRecentMessages(userId, limit = 10) {
  return stmts.recentMessages.all(userId, limit).reverse();
}

export async function getAllMessages(userId, limit = 50) {
  return stmts.allMessages.all(userId, limit);
}

export async function saveMemory({ userId, fact, importance }) {
  stmts.insertMemory.run(userId, fact, importance, Date.now());
}

export async function getTopMemories(userId, limit = 15) {
  return stmts.topMemories.all(userId, limit);
}

export async function deleteMemory(id) {
  // Server may pass either a numeric id (sqlite) or a string id; coerce.
  const numId = /^\d+$/.test(String(id)) ? Number(id) : id;
  stmts.deleteMemory.run(numId);
}

export const driver = 'sqlite';
