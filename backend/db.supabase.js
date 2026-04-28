import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || url.includes('YOUR-PROJECT') || serviceKey.includes('paste')) {
  throw new Error(
    'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env, or set DB_DRIVER=sqlite to use the local fallback.'
  );
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function unwrap(label, { data, error }) {
  if (error) {
    const e = new Error(`Supabase ${label} failed: ${error.message}`);
    e.cause = error;
    throw e;
  }
  return data;
}

export async function ensureUser(userId) {
  unwrap(
    'upsert user',
    await supabase
      .from('users')
      .upsert({ id: userId, created_at: Date.now() }, { onConflict: 'id', ignoreDuplicates: true })
  );
}

export async function saveMessage({ userId, role, content, emotion = null, intent = null }) {
  unwrap(
    'insert message',
    await supabase.from('messages').insert({
      user_id: userId,
      role,
      content,
      emotion,
      intent,
      created_at: Date.now(),
    })
  );
}

export async function getRecentMessages(userId, limit = 10) {
  const data = unwrap(
    'select recent messages',
    await supabase
      .from('messages')
      .select('role, content, emotion, intent, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
  );
  return (data ?? []).reverse(); // oldest-first for prompt building
}

export async function getAllMessages(userId, limit = 50) {
  const data = unwrap(
    'select all messages',
    await supabase
      .from('messages')
      .select('id, role, content, emotion, intent, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(limit)
  );
  return data ?? [];
}

export async function saveMemory({ userId, fact, importance }) {
  unwrap(
    'insert memory',
    await supabase.from('memories').insert({
      user_id: userId,
      fact,
      importance,
      created_at: Date.now(),
    })
  );
}

export async function getTopMemories(userId, limit = 15) {
  const data = unwrap(
    'select top memories',
    await supabase
      .from('memories')
      .select('id, fact, importance, created_at')
      .eq('user_id', userId)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
  );
  return data ?? [];
}

export async function deleteMemory(id) {
  unwrap('delete memory', await supabase.from('memories').delete().eq('id', id));
}

export const driver = 'supabase';
