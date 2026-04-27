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

## Files

```
backend/
  server.js   — Express routes
  db.js       — SQLite schema + queries
  rio.js      — LLM orchestration, system prompt, JSON shape
  data/rio.db — auto-created SQLite file (gitignored)
frontend/
  src/App.jsx — entire chat UI
  src/App.css — styles
```

## Not included (yet)

- Voice replies / mic input
- Multiple chat threads
- Login (anyone visiting gets a localStorage user ID)
- Streaming token responses
