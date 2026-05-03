// Shared model/provider metadata used by App.jsx and ModelPickerPopover.

export const MODEL_ALIASES = {
  // Groq
  'llama-3.3-70b-versatile': 'rio2.1',
  'llama-3.1-8b-instant': 'rio2.2',
  'gemma2-9b-it': 'rio2.3',
  // Gemini
  'gemini-2.5-flash': 'rio3.1',
  'gemini-2.5-pro': 'rio3.2',
  'gemini-2.0-flash': 'rio3.3',
  'gemini-1.5-flash': 'rio3.4',
  'gemini-1.5-pro': 'rio3.5',
  // GitHub Models
  'openai/gpt-4o': 'rio4.1',
  'openai/gpt-4o-mini': 'rio4.2',
  'meta/Meta-Llama-3.1-70B-Instruct': 'rio4.3',
  'mistral-ai/Mistral-large-2407': 'rio4.4',
};

export function rioAlias(model) {
  if (!model) return '';
  if (MODEL_ALIASES[model]) return MODEL_ALIASES[model];
  const tail = String(model).split('/').pop();
  return MODEL_ALIASES[tail] || 'rio';
}

// Friendly short name for the provider tabs in the popover.
export const PROVIDER_SHORT = {
  groq: 'Groq',
  gemini: 'Gemini',
  github: 'OpenAI',
};

// One-line tagline shown under each provider tab.
export const PROVIDER_TAGLINE = {
  groq: 'Llama / Gemma · ⚡ fastest',
  gemini: 'Google · best Hinglish',
  github: 'GPT-4o, Mistral · premium',
};

// Human-readable description for each model. Falls back to the model id.
export const MODEL_DESC = {
  'llama-3.3-70b-versatile': 'Llama 3.3 70B · best balance',
  'llama-3.1-8b-instant': 'Llama 3.1 8B · ultra-fast',
  'gemma2-9b-it': 'Gemma 2 9B · compact',
  'gemini-2.5-flash': 'Gemini 2.5 Flash · recommended',
  'gemini-2.5-pro': 'Gemini 2.5 Pro · best reasoning',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-1.5-flash': 'Gemini 1.5 Flash · legacy',
  'gemini-1.5-pro': 'Gemini 1.5 Pro · legacy',
  'openai/gpt-4o': 'GPT-4o · top quality',
  'openai/gpt-4o-mini': 'GPT-4o mini · cheaper',
  'meta/Meta-Llama-3.1-70B-Instruct': 'Llama 3.1 70B · open',
  'mistral-ai/Mistral-large-2407': 'Mistral Large',
};
