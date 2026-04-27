import { useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';

const EMOTION_EMOJI = {
  happy: '😊',
  sad: '😔',
  angry: '😠',
  anxious: '😟',
  excited: '🤩',
  love: '🥰',
  surprised: '😮',
  neutral: '🙂',
  confused: '😕',
  tired: '😴',
};

function getUserId() {
  let id = localStorage.getItem('rioUserId');
  if (!id) {
    id = nanoid();
    localStorage.setItem('rioUserId', id);
  }
  return id;
}

function loadModelChoice() {
  try {
    const raw = localStorage.getItem('rioModelChoice');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveModelChoice(choice) {
  if (choice) localStorage.setItem('rioModelChoice', JSON.stringify(choice));
}

export default function App() {
  const [userId] = useState(getUserId);
  const [messages, setMessages] = useState([]);
  const [memories, setMemories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [choice, setChoice] = useState(loadModelChoice);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetch(`/api/conversation/${userId}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {});
    refreshMemories();

    fetch('/api/providers')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.providers ?? []).filter((p) => p.available);
        setProviders(list);
        // if saved choice is no longer available, clear it
        setChoice((cur) => {
          if (!cur) return list[0] ? { provider: list[0].name, model: list[0].defaultModel } : null;
          const stillAvail = list.find((p) => p.name === cur.provider && p.models.includes(cur.model));
          return stillAvail ? cur : list[0] ? { provider: list[0].name, model: list[0].defaultModel } : null;
        });
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    saveModelChoice(choice);
  }, [choice]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // build flat list of (provider, model) options for the dropdown
  const modelOptions = useMemo(() => {
    return providers.flatMap((p) =>
      p.models.map((m) => ({
        value: `${p.name}::${m}`,
        provider: p.name,
        model: m,
        label: `${p.label} · ${m}`,
      }))
    );
  }, [providers]);

  async function refreshMemories() {
    try {
      const r = await fetch(`/api/memory/${userId}`);
      const d = await r.json();
      setMemories(d.memories ?? []);
    } catch {}
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput('');

    const userMsg = { role: 'user', content: text, id: `tmp-${Date.now()}` };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const body = { userId, message: text };
      if (choice) {
        body.provider = choice.provider;
        body.model = choice.model;
      }
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'request failed');

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.id === userMsg.id) {
          updated[updated.length - 1] = {
            ...last,
            emotion: data.emotion,
            intent: data.intent,
          };
        }
        return [...updated, { role: 'assistant', content: data.reply, model: data.model }];
      });

      if (data.memorySaved) refreshMemories();
    } catch (e) {
      setError(e.message);
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }

  async function deleteMemory(id) {
    await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onModelChange(e) {
    const opt = modelOptions.find((o) => o.value === e.target.value);
    if (opt) setChoice({ provider: opt.provider, model: opt.model });
  }

  const currentValue = choice ? `${choice.provider}::${choice.model}` : '';

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-dot" />
          <h1>Rio</h1>
          <span className="brand-sub">your AI dost</span>
        </div>

        <div className="model-picker">
          {modelOptions.length === 0 ? (
            <span className="muted">No providers configured. Add a key to backend/.env</span>
          ) : (
            <>
              <label htmlFor="model-select">Model:</label>
              <select id="model-select" value={currentValue} onChange={onModelChange}>
                {modelOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </header>

      <div className="layout">
        <main className="chat">
          <div className="chat-scroll" ref={scrollRef}>
            {messages.length === 0 && !loading && (
              <div className="empty">
                <p>arre, hi! 👋</p>
                <p className="empty-sub">kuch bhi bol — main sun rahi hoon.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <Bubble key={m.id ?? i} msg={m} />
            ))}
            {loading && <TypingDots />}
          </div>

          <div className="composer">
            {error && <div className="error">⚠ {error}</div>}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="kuch likh… (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={loading}
            />
            <button onClick={send} disabled={loading || !input.trim() || modelOptions.length === 0}>
              {loading ? '…' : 'Send'}
            </button>
          </div>
        </main>

        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>Memories</h2>
            <span className="count">{memories.length}</span>
          </div>
          {memories.length === 0 ? (
            <p className="muted">Rio will remember important things you share.</p>
          ) : (
            <ul className="memories">
              {memories.map((m) => (
                <li key={m.id}>
                  <span className="memory-fact">{m.fact}</span>
                  <span className="memory-meta">
                    <span className="importance">{'★'.repeat(m.importance)}</span>
                    <button
                      className="del"
                      onClick={() => deleteMemory(m.id)}
                      title="Forget this"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  const emoji = msg.emotion ? EMOTION_EMOJI[msg.emotion] ?? '' : '';
  return (
    <div className={`row ${isUser ? 'row-user' : 'row-rio'}`}>
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-rio'}`}>
        {msg.content}
      </div>
      {isUser && msg.emotion && (
        <div className="chip">
          {emoji} {msg.emotion}
          {msg.intent && <span className="chip-sep"> · {msg.intent}</span>}
        </div>
      )}
      {!isUser && msg.model && <div className="chip chip-model">{msg.model}</div>}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="row row-rio">
      <div className="bubble bubble-rio typing">
        <span /><span /><span />
      </div>
    </div>
  );
}
