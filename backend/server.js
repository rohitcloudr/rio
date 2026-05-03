import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  getAllMessages,
  getTopMemories,
  deleteMemory,
} from './db.js';
import { talkToRio, talkToRioAuto, listProviders } from './rio.js';
import { synthesizeSpeech } from './voice.js';

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
  const { userId, message, provider, model, mode } = req.body ?? {};
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId required' });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message required' });
  }

  const isVoice = mode === 'voice';
  // Voice mode auto-cascades only when the user hasn't pinned a specific model.
  // If they picked one in the call overlay, honour it and surface its errors directly.
  const useAuto = isVoice && !provider;

  try {
    const result = useAuto
      ? await talkToRioAuto(userId, message.trim())
      : await talkToRio(userId, message.trim(), provider, model);
    res.json(result);
  } catch (err) {
    console.error('[chat error]', err);
    const status = (err?.status >= 400 && err?.status < 600) ? err.status : 500;
    let userMsg;
    if (status === 429) {
      userMsg = useAuto
        ? 'Every voice provider is rate-limited right now. Wait a few seconds and try again.'
        : `Rate limit / quota hit on ${provider || 'current provider'}. Try a different model from the picker, or wait a bit.`;
    } else {
      userMsg = err?.message ?? 'unknown error';
    }
    res.status(status).json({
      error: userMsg,
      status,
      provider: provider || null,
      model: model || null,
    });
  }
});

app.get('/api/conversation/:userId', async (req, res) => {
  try {
    const messages = await getAllMessages(req.params.userId, 50);
    res.json({ messages });
  } catch (err) {
    console.error('[conversation error]', err);
    res.status(500).json({ error: err?.message ?? 'unknown error' });
  }
});

app.get('/api/memory/:userId', async (req, res) => {
  try {
    const memories = await getTopMemories(req.params.userId, 100);
    res.json({ memories });
  } catch (err) {
    console.error('[memory error]', err);
    res.status(500).json({ error: err?.message ?? 'unknown error' });
  }
});

app.post('/api/voice/tts', async (req, res) => {
  const { text, voice, lang } = req.body ?? {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text required' });
  }
  try {
    const result = await synthesizeSpeech(text, voice, lang);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    if (Buffer.isBuffer(result)) {
      res.end(result);
    } else if (result && typeof result.pipe === 'function') {
      result.pipe(res);
    } else if (result && typeof result.getReader === 'function') {
      const reader = result.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } else {
      const buf = Buffer.from(await new Response(result).arrayBuffer());
      res.end(buf);
    }
  } catch (err) {
    console.error('[tts error]', err);
    if (err?.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    if (err?.status === 429) {
      return res.status(429).json({
        error: 'TTS rate limit / quota hit. Browser fallback voice will be used.',
      });
    }
    res.status(500).json({ error: err?.message ?? 'tts failed' });
  }
});

app.delete('/api/memory/:id', async (req, res) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'invalid id' });
  try {
    await deleteMemory(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[delete memory error]', err);
    res.status(500).json({ error: err?.message ?? 'unknown error' });
  }
});

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  console.log(`Rio backend on :${PORT}`);
});
