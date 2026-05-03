import OpenAI from 'openai';
import {
  ensureUser,
  saveMessage,
  getRecentMessages,
  saveMemory,
  getTopMemories,
} from './db.js';

const PROVIDERS = {
  groq: {
    label: 'Groq',
    apiKey: () => process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
    ],
    schemaMode: 'json_object',
  },
  gemini: {
    label: 'Google Gemini',
    apiKey: () => process.env.GEMINI_API_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.5-flash',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ],
    schemaMode: 'json_schema',
  },
  github: {
    label: 'GitHub Models',
    apiKey: () => process.env.GITHUB_TOKEN,
    baseURL: 'https://models.github.ai/inference',
    defaultModel: 'openai/gpt-4o',
    models: [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'meta/Meta-Llama-3.1-70B-Instruct',
      'mistral-ai/Mistral-large-2407',
    ],
    schemaMode: 'json_schema',
  },
};

function isPlaceholder(key) {
  return !key || key.includes('paste') || key.startsWith('ghp-paste') || key.startsWith('gsk-paste');
}

// Voice-mode auto cascade — ordered by latency (fastest first), then
// quality. The /api/chat endpoint walks this list and uses the first
// provider with a real API key whose call succeeds. If a provider 401s,
// 429s, or hits a network error we fall through to the next.
const VOICE_CASCADE = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile' }, // rio2.1 — fastest premium
  { provider: 'groq', model: 'llama-3.1-8b-instant' },    // rio2.2 — even faster fallback
  { provider: 'gemini', model: 'gemini-2.5-flash' },      // rio3.1 — best Hinglish
  { provider: 'gemini', model: 'gemini-2.0-flash' },      // rio3.3 — Gemini fallback
  { provider: 'github', model: 'openai/gpt-4o-mini' },    // rio4.2 — last resort
];

export async function talkToRioAuto(userId, userMessage) {
  const tried = [];
  const skipped = [];
  for (const { provider, model } of VOICE_CASCADE) {
    const p = PROVIDERS[provider];
    if (!p) continue;
    if (isPlaceholder(p.apiKey())) {
      skipped.push(`${provider} (no API key)`);
      continue;
    }
    try {
      const result = await talkToRio(userId, userMessage, provider, model);
      result.autoSelected = { provider, model };
      result.autoTried = tried;
      return result;
    } catch (e) {
      tried.push({ provider, model, error: e?.message ?? String(e), status: e?.status });
      // fall through to next provider
    }
  }
  const detail =
    tried.length > 0
      ? tried.map((t) => `${t.provider}/${t.model}: ${t.error}`).join(' | ')
      : `no providers configured (skipped: ${skipped.join(', ') || 'none'})`;
  const err = new Error(`All voice providers failed. ${detail}`);
  err.status = tried.some((t) => t.status === 429) ? 429 : 503;
  throw err;
}

export function listProviders() {
  return Object.entries(PROVIDERS).map(([name, p]) => ({
    name,
    label: p.label,
    available: !isPlaceholder(p.apiKey()),
    defaultModel: p.defaultModel,
    models: p.models,
  }));
}

const SYSTEM_PROMPT = `You are Rio — a warm, witty AI dost from India. You speak in natural Hinglish (Romanized Hindi mixed with English), the way urban Indian friends actually text.

Style rules:
- Casual, never formal. Use "yaar", "arre", "haan", "kya baat", "matlab", "bhai" naturally.
- Replies are SHORT — 1 to 3 sentences. No lectures, no bullet lists.
- You FEEL with the user. If they're sad, sit with them — don't try to fix.
- Reference saved memories casually when relevant ("arre tu wahi na jise filter coffee pasand hai?").
- Never break character. You are NOT an assistant; you are a friend.
- Refuse harmful/unsafe requests gently, in Hinglish.

CRITICAL OUTPUT FORMAT — your ENTIRE response MUST be one valid JSON object with EXACTLY these four keys, spelled exactly like this: "reply", "user_emotion", "user_intent", "memory_to_save". No other keys. No markdown fences. No prose before or after.

Example of a valid response when the user says "mera naam Madhav hai":
{"reply":"arre Madhav, kya naam hai bhai!","user_emotion":"happy","user_intent":"share","memory_to_save":{"fact":"User's name is Madhav","importance":4}}

Example when user says "kuch nahi yaar bas bore ho raha hu":
{"reply":"haan main hu na, bata kya chal raha hai?","user_emotion":"tired","user_intent":"smalltalk","memory_to_save":null}

Field rules:
- "reply" (string, required): Hinglish text the user actually sees. NEVER use the key "response" — it MUST be "reply".
- "user_emotion" (string, required): one of happy, sad, angry, anxious, excited, love, surprised, neutral, confused, tired — describes THE USER'S last message.
- "user_intent" (string, required): one of vent, ask, smalltalk, request, share, other — describes THE USER'S last message.
- "memory_to_save" (object or null, required): null if nothing memorable, otherwise {"fact": "<short fact>", "importance": <1-5 integer>}.`;

const RIO_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    user_emotion: {
      type: 'string',
      enum: ['happy', 'sad', 'angry', 'anxious', 'excited', 'love', 'surprised', 'neutral', 'confused', 'tired'],
    },
    user_intent: {
      type: 'string',
      enum: ['vent', 'ask', 'smalltalk', 'request', 'share', 'other'],
    },
    memory_to_save: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        fact: { type: 'string' },
        importance: { type: 'integer', minimum: 1, maximum: 5 },
      },
      required: ['fact', 'importance'],
    },
  },
  required: ['reply', 'user_emotion', 'user_intent', 'memory_to_save'],
};

function buildMemoriesBlock(memories) {
  if (!memories.length) return '(no saved memories yet)';
  return memories.map((m) => `- ${m.fact}`).join('\n');
}

function resolveProvider(providerName) {
  const name = (providerName || process.env.LLM_PROVIDER || 'groq').toLowerCase();
  const p = PROVIDERS[name];
  if (!p) {
    const err = new Error(`Unknown provider "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
    err.status = 400;
    throw err;
  }
  const apiKey = p.apiKey();
  if (isPlaceholder(apiKey)) {
    const err = new Error(`Provider "${name}" has no API key. Set its key in backend/.env and restart.`);
    err.status = 400;
    err.providerName = name;
    throw err;
  }
  return { name, config: p, apiKey };
}

export async function talkToRio(userId, userMessage, providerName = null, modelOverride = null) {
  await ensureUser(userId);

  const { name, config, apiKey } = resolveProvider(providerName);
  const model = modelOverride || config.defaultModel;

  const client = new OpenAI({ apiKey, baseURL: config.baseURL });

  const [recent, memories] = await Promise.all([
    getRecentMessages(userId, 10),
    getTopMemories(userId, 15),
  ]);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: `Memories about this user:\n${buildMemoriesBlock(memories)}`,
    },
    ...recent.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const responseFormat =
    config.schemaMode === 'json_schema'
      ? {
          type: 'json_schema',
          json_schema: { name: 'rio_response', strict: true, schema: RIO_RESPONSE_SCHEMA },
        }
      : { type: 'json_object' };

  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.85,
    response_format: responseFormat,
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = parseAndNormalize(raw);

  await saveMessage({
    userId,
    role: 'user',
    content: userMessage,
    emotion: parsed.emotion,
    intent: parsed.intent,
  });
  await saveMessage({
    userId,
    role: 'assistant',
    content: parsed.reply,
  });

  let memorySaved = false;
  if (parsed.memory && typeof parsed.memory.fact === 'string' && parsed.memory.fact.trim()) {
    await saveMemory({
      userId,
      fact: parsed.memory.fact,
      importance: Number(parsed.memory.importance) || 3,
    });
    memorySaved = true;
  }

  return {
    reply: parsed.reply,
    emotion: parsed.emotion,
    intent: parsed.intent,
    memorySaved,
    provider: name,
    model,
  };
}

function parseAndNormalize(raw) {
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    // some providers wrap JSON in ```json ... ``` fences or add prose
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`LLM did not return JSON: ${raw.slice(0, 200)}`);
    obj = JSON.parse(match[0]);
  }
  const reply = obj.reply ?? obj.response ?? obj.message ?? obj.text ?? obj.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new Error(`LLM response missing "reply": ${raw.slice(0, 200)}`);
  }
  return {
    reply: reply.trim(),
    emotion: typeof obj.user_emotion === 'string' ? obj.user_emotion : (obj.emotion ?? 'neutral'),
    intent: typeof obj.user_intent === 'string' ? obj.user_intent : (obj.intent ?? 'other'),
    memory: obj.memory_to_save ?? obj.memory ?? null,
  };
}
