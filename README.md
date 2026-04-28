# Rio — AI Dost (Hinglish Chatbot)

A web chatbot inspired by [rio.ai](https://rio.ai). Chats in Hinglish, detects emotion + intent, and remembers facts about you across conversations.

**Stack:** React (Vite) + Node.js (Express) + SQLite (built-in `node:sqlite`) + OpenAI GPT-4o **or** Groq (switch via env var).

---

## Setup

You need **Node.js 24+** (uses the built-in `node:sqlite` module — no native compile required).

```bash
# 1. Install backend
cd backend
npm install
cp .env.example .env
# edit .env and paste your API key on the matching line

# 2. Install frontend (new terminal)
cd frontend
npm install
```

## Run

Two terminals:

```bash
# terminal 1 — backend
cd backend
npm run dev          # or: node server.js
# → "Rio backend on :8787"

# terminal 2 — frontend
cd frontend
npm run dev
# → http://localhost:5173
```

Open http://localhost:5173 and start chatting.

---

## Switching between OpenAI and Groq

Both providers use the same OpenAI-compatible API, so swapping is just env config — no code changes.

In `backend/.env`:

```ini
# use OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# OR use Groq (free tier available)
LLM_PROVIDER=groq
GROQ_API_KEY=gsk-...

# optional model override
# LLM_MODEL=llama-3.1-8b-instant
```

Get a Groq key at **https://console.groq.com** → API Keys. Free tier has generous per-day limits. Models include:
- `llama-3.3-70b-versatile` (default — best quality)
- `llama-3.1-8b-instant` (fastest, cheapest)
- `mixtral-8x7b-32768` (longer context)

Restart the backend after changing `.env`.

## How it works

1. You type a message → frontend POSTs to `/api/chat` with your `userId` (auto-generated, saved in `localStorage`).
2. Backend pulls last 10 messages + top 15 saved memories from SQLite.
3. One LLM call returns structured JSON: `{ reply, user_emotion, user_intent, memory_to_save }`.
4. User message + Rio's reply + new memory (if any) are saved to SQLite.
5. Frontend renders Rio's reply and an emotion chip on your message.

The "Memories" sidebar shows what Rio has chosen to remember. Click × to forget.

## API

| Method | Path | Body / Returns |
|---|---|---|
| `POST` | `/api/chat` | `{userId, message}` → `{reply, emotion, intent, memorySaved}` |
| `GET` | `/api/conversation/:userId` | last 50 messages |
| `GET` | `/api/memory/:userId` | all memories for user |
| `DELETE` | `/api/memory/:id` | delete one memory |
| `GET` | `/api/health` | `{ok: true}` |

<<<<<<< HEAD
## Database — local SQLite or cloud Supabase

Set `DB_DRIVER` in `backend/.env`:

```ini
DB_DRIVER=sqlite     # local file at backend/data/rio.db (default — no setup)
# or
DB_DRIVER=supabase   # cloud Postgres (requires SUPABASE_URL + service_role key)
```

### Switching to Supabase
1. Create a free project at https://supabase.com.
2. Run this SQL in the project's SQL Editor:
   ```sql
   CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, created_at BIGINT NOT NULL);
   CREATE TABLE messages (id BIGSERIAL PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, role TEXT, content TEXT, emotion TEXT, intent TEXT, created_at BIGINT NOT NULL);
   CREATE INDEX idx_messages_user ON messages(user_id, created_at);
   CREATE TABLE memories (id BIGSERIAL PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, fact TEXT, importance SMALLINT CHECK (importance BETWEEN 1 AND 5), created_at BIGINT NOT NULL);
   CREATE INDEX idx_memories_user ON memories(user_id, importance DESC, created_at DESC);
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;
   ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
   ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
   ```
3. Project Settings → API → copy **Project URL** and the **service_role** (or new "secret") key.
4. Paste into `backend/.env`:
   ```ini
   DB_DRIVER=supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
5. Restart backend. Look for `[db] using supabase backend` in logs.

> ⚠ **Use the service_role / secret key only**, not the publishable/anon key. RLS is enabled; the publishable key won't have access. The secret key bypasses RLS — keep it server-side only.

=======
>>>>>>> 786c0049af409a8f55b2e30d04cb507323e12116
## Files

```
backend/
<<<<<<< HEAD
  server.js        — Express routes
  rio.js           — LLM orchestration, system prompt, JSON shape
  db.js            — router (picks sqlite or supabase by DB_DRIVER)
  db.sqlite.js     — local SQLite implementation
  db.supabase.js   — Supabase Postgres implementation
  data/rio.db      — auto-created SQLite file (gitignored)
frontend/
  src/App.jsx — entire chat UI + theme + model picker
  src/App.css — light/dark theme styles
=======
  server.js   — Express routes
  db.js       — SQLite schema + queries
  rio.js      — LLM orchestration, system prompt, JSON shape
  data/rio.db — auto-created SQLite file (gitignored)
frontend/
  src/App.jsx — entire chat UI
  src/App.css — styles
>>>>>>> 786c0049af409a8f55b2e30d04cb507323e12116
```

## Not included (yet)

- Voice replies / mic input
- Multiple chat threads
- Login (anyone visiting gets a localStorage user ID)
- Streaming token responses
