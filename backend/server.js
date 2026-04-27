import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  getAllMessages,
  getTopMemories,
  deleteMemory,
} from './db.js';
import { talkToRio, listProviders } from './rio.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/providers', (_req, res) => {
  res.json({ providers: listProviders() });
});

app.post('/api/chat', async (req, res) => {
  const { userId, message, provider, model } = req.body ?? {};
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId required' });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message required' });
  }

  try {
    const result = await talkToRio(userId, message.trim(), provider, model);
    res.json(result);
  } catch (err) {
    console.error('[chat error]', err);
    if (err?.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    if (err?.status === 429) {
      return res.status(429).json({
        error: `Rate limit / quota hit on ${provider || 'current provider'}. Try a different model from the picker, or wait a bit.`,
      });
    }
    res.status(500).json({ error: err?.message ?? 'unknown error' });
  }
});

app.get('/api/conversation/:userId', (req, res) => {
  const messages = getAllMessages(req.params.userId, 50);
  res.json({ messages });
});

app.get('/api/memory/:userId', (req, res) => {
  const memories = getTopMemories(req.params.userId, 100);
  res.json({ memories });
});

app.delete('/api/memory/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
  deleteMemory(id);
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  console.log(`Rio backend on :${PORT}`);
});
