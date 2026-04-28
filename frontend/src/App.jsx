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

const SAMPLE_PROMPTS = [
  'arre yaar kya scene hai?',
  'mujhe aaj kuch motivation chahiye',
  'mera fav drink filter coffee hai',
  'thoda Pune ke baare me bata',
];

const MODEL_ALIASES = {
  'gpt-4o': 'rio1.1',
  'gpt-4o-mini': 'rio1.2',
  'llama-3.3-70b-versatile': 'rio2.1',
  'llama-3.1-8b-instant': 'rio2.2',
  'mixtral-8x7b-32768': 'rio2.3',
  'gemini-2.5-flash': 'rio3.1',
  'gemini-2.5-pro': 'rio3.2',
  'gemini-2.0-flash': 'rio3.3',
  'openai/gpt-4o': 'rio4.1',
  'openai/gpt-4o-mini': 'rio4.2',
  'meta/Meta-Llama-3.1-70B-Instruct': 'rio4.3',
};

function rioAlias(model) {
  if (!model) return '';
  if (MODEL_ALIASES[model]) return MODEL_ALIASES[model];
  const tail = String(model).split('/').pop();
  return MODEL_ALIASES[tail] || 'rio';
}

function getUserId() {
  let id = localStorage.getItem('rioUserId');
  if (!id) {
    id = nanoid();
    localStorage.setItem('rioUserId', id);
  }
  return id;
}

function loadSessions() {
  try {
    const raw = localStorage.getItem('rioChatSessions');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveSessions(list) {
  try {
    localStorage.setItem('rioChatSessions', JSON.stringify(list));
  } catch {}
}

function timeAgo(t) {
  if (!t) return '';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd ago';
  return new Date(t).toLocaleDateString();
}

function loadModelChoice() {
  try {
    const raw = localStorage.getItem('rioModelChoice');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadInitialTheme() {
  const saved = localStorage.getItem('rioTheme');
  if (saved === 'light' || saved === 'dark') return saved;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export default function App() {
  const [userId, setUserId] = useState(getUserId);
  const [messages, setMessages] = useState([]);
  const [memories, setMemories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [choice, setChoice] = useState(loadModelChoice);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(loadInitialTheme);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessions, setSessions] = useState(loadSessions);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('rioTheme', theme);
  }, [theme]);

  // initial load
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
        setChoice((cur) => {
          if (!cur) return list[0] ? { provider: list[0].name, model: list[0].defaultModel } : null;
          const stillAvail = list.find((p) => p.name === cur.provider && p.models.includes(cur.model));
          return stillAvail ? cur : list[0] ? { provider: list[0].name, model: list[0].defaultModel } : null;
        });
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (choice) localStorage.setItem('rioModelChoice', JSON.stringify(choice));
  }, [choice]);

  // sync chat session metadata when messages change
  useEffect(() => {
    if (messages.length === 0) return;
    const firstUser = messages.find((m) => m.role === 'user');
    if (!firstUser) return;
    const title = (firstUser.content || '').slice(0, 60).trim() || 'Chat';
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === userId);
      const entry = {
        id: userId,
        title,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        msgCount: messages.length,
      };
      const next = [entry, ...prev.filter((s) => s.id !== userId)];
      saveSessions(next);
      return next;
    });
  }, [messages, userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  const modelOptions = useMemo(() => {
    return providers.flatMap((p) =>
      p.models.map((m) => ({
        value: `${p.name}::${m}`,
        provider: p.name,
        model: m,
        label: rioAlias(m),
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

  async function send(textOverride) {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    setError(null);
    if (!textOverride) setInput('');

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
          updated[updated.length - 1] = { ...last, emotion: data.emotion, intent: data.intent };
        }
        return [...updated, { role: 'assistant', content: data.reply, model: data.model }];
      });
      if (data.memorySaved) refreshMemories();
    } catch (e) {
      setError(e.message);
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      if (!textOverride) setInput(text);
    } finally {
      setLoading(false);
    }
  }

  async function deleteMemory(id) {
    await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  function newChat() {
    const newId = nanoid();
    localStorage.setItem('rioUserId', newId);
    setUserId(newId);
    setMessages([]);
    setMemories([]);
    setError(null);
    setDrawerOpen(false);
  }

  function clearChat() {
    if (!confirm('Clear this chat? It will be removed from your history.')) return;
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== userId);
      saveSessions(next);
      return next;
    });
    const newId = nanoid();
    localStorage.setItem('rioUserId', newId);
    setUserId(newId);
    setMessages([]);
    setMemories([]);
    setError(null);
  }

  function loadSession(id) {
    if (id === userId) {
      setDrawerOpen(false);
      return;
    }
    localStorage.setItem('rioUserId', id);
    setUserId(id);
    setMessages([]);
    setMemories([]);
    setError(null);
    setDrawerOpen(false);
  }

  function deleteSession(id, e) {
    e?.stopPropagation();
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSessions(next);
      return next;
    });
    if (id === userId) {
      const newId = nanoid();
      localStorage.setItem('rioUserId', newId);
      setUserId(newId);
      setMessages([]);
      setMemories([]);
      setError(null);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function editMessage(text) {
    setInput(text);
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      requestAnimationFrame(() => {
        ta.setSelectionRange(text.length, text.length);
        ta.scrollTop = ta.scrollHeight;
      });
    }
  }

  function onModelChange(e) {
    const opt = modelOptions.find((o) => o.value === e.target.value);
    if (opt) setChoice({ provider: opt.provider, model: opt.model });
  }

  const currentValue = choice ? `${choice.provider}::${choice.model}` : '';
  const noProviders = modelOptions.length === 0;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-dot" />
          <h1>Rio</h1>
          <span className="brand-sub">your AI dost</span>
        </div>

        <div className="header-controls">
          <div className="model-picker">
            {noProviders ? (
              <span className="muted">No providers configured</span>
            ) : (
              <>
                <label htmlFor="model-select">Model</label>
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

          <button
            className="icon-btn"
            onClick={clearChat}
            title="Clear current chat"
            aria-label="Clear chat"
          >
            <TrashIcon />
          </button>

          <button
            className="icon-btn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          <button
            className="icon-btn mobile-only"
            onClick={() => setDrawerOpen(true)}
            title="Show sidebar"
            aria-label="Show sidebar"
            style={{ display: 'none' }}
          >
            <MemoryIcon />
          </button>
        </div>
      </header>

      <div className="layout">
        <main className="chat">
          <div className="chat-scroll" ref={scrollRef}>
            {messages.length === 0 && !loading ? (
              <div className="empty">
                <div className="empty-emoji">👋</div>
                <h3>arre, hi!</h3>
                <p>main Rio hu — tera AI dost. kuch bhi bol, main sun rahi hu.</p>
                <div className="empty-prompts">
                  {SAMPLE_PROMPTS.map((p) => (
                    <button key={p} onClick={() => send(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => <Bubble key={m.id ?? i} msg={m} onEdit={editMessage} />)
            )}
            {loading && <TypingDots />}
          </div>

          <div className="composer">
            {error && <div className="error">⚠ {error}</div>}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="kuch likh… (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={loading || noProviders}
            />
            <button
              className="send-btn"
              onClick={() => send()}
              disabled={loading || !input.trim() || noProviders}
              aria-label="Send"
              title="Send"
            >
              <SendIcon />
            </button>
          </div>
        </main>

        {drawerOpen && <div className="backdrop" onClick={() => setDrawerOpen(false)} />}
        <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
          <button
            className="sidebar-close icon-btn"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close sidebar"
          >
            ×
          </button>

          <button className="new-chat-btn" onClick={newChat} title="Start a new chat">
            <NewChatIcon />
            <span>New chat</span>
          </button>

          <div className="sidebar-section">
            <div className="sidebar-head">
              <h2>Chat history</h2>
              {sessions.length > 0 && <span className="count">{sessions.length}</span>}
            </div>
            {sessions.length === 0 ? (
              <p className="muted">Your past chats will appear here.</p>
            ) : (
              <ul className="history">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className={`history-item ${s.id === userId ? 'active' : ''}`}
                    onClick={() => loadSession(s.id)}
                  >
                    <div className="history-text">
                      <span className="history-title">{s.title}</span>
                      <span className="history-meta">
                        {timeAgo(s.updatedAt)} · {s.msgCount} msg
                      </span>
                    </div>
                    <button
                      className="del"
                      onClick={(e) => deleteSession(s.id, e)}
                      title="Delete chat"
                      aria-label="Delete chat"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-head">
              <h2>Memories</h2>
              <span className="count">{memories.length}</span>
            </div>
            {memories.length === 0 ? (
              <p className="muted">Rio remembers important things you share — names, preferences, life events. They'll show up here.</p>
            ) : (
              <ul className="memories">
                {memories.map((m) => (
                  <li key={m.id}>
                    <span className="memory-fact">{m.fact}</span>
                    <span className="memory-meta">
                      <span className="importance">{'★'.repeat(m.importance)}</span>
                      <button className="del" onClick={() => deleteMemory(m.id)} title="Forget this">
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Bubble({ msg, onEdit }) {
  const isUser = msg.role === 'user';
  const emoji = msg.emotion ? EMOTION_EMOJI[msg.emotion] ?? '' : '';
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(msg.content);
      } else {
        const ta = document.createElement('textarea');
        ta.value = msg.content;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className={`row ${isUser ? 'row-user' : 'row-rio'}`}>
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-rio'}`}>{msg.content}</div>
      {isUser && (
        <div className="msg-actions">
          <button
            type="button"
            onClick={() => onEdit?.(msg.content)}
            title="Edit"
            aria-label="Edit message"
          >
            <EditIcon />
          </button>
          <button
            type="button"
            onClick={copy}
            title={copied ? 'Copied!' : 'Copy'}
            aria-label="Copy message"
            className={copied ? 'copied' : ''}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      )}
      {isUser && msg.emotion && (
        <div className="chip">
          {emoji} {msg.emotion}
          {msg.intent && <span className="chip-sep"> · {msg.intent}</span>}
        </div>
      )}
      {!isUser && msg.model && <div className="chip chip-model">{rioAlias(msg.model)}</div>}
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

/* ============== ICONS ============== */
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function NewChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
function MemoryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
