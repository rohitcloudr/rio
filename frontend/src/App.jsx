import { useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import CallOverlay from './voice/CallOverlay.jsx';
import ModelPickerPopover from './ModelPickerPopover.jsx';
import { rioAlias } from './modelMeta.js';

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

function loadVoiceChoice() {
  try {
    const raw = localStorage.getItem('rioVoiceChoice');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function safeJson(r) {
  const text = await r.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const THEMES = ['earth', 'coastal'];
function loadInitialTheme() {
  const saved = localStorage.getItem('rioTheme');
  if (THEMES.includes(saved)) return saved;
  return 'earth';
}

export default function App() {
  const [userId, setUserId] = useState(getUserId);
  const [messages, setMessages] = useState([]);
  const [memories, setMemories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [choice, setChoice] = useState(loadModelChoice);
  const [voiceChoice, setVoiceChoice] = useState(loadVoiceChoice);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(loadInitialTheme);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessions, setSessions] = useState(loadSessions);
  const [inCall, setInCall] = useState(false);
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
      .then(safeJson)
      .then((d) => setMessages(d?.messages ?? []))
      .catch(() => {});
    refreshMemories();

    fetch('/api/providers')
      .then(safeJson)
      .then((d) => {
        const list = (d?.providers ?? []).filter((p) => p.available);
        setProviders(list);
        // No auto-default. choice stays null on first load; user must pick.
        // If a saved choice points to a model whose key is no longer set,
        // drop it back to null.
        setChoice((cur) => {
          if (!cur) return null;
          const stillAvail = list.find((p) => p.name === cur.provider && p.models.includes(cur.model));
          return stillAvail ? cur : null;
        });
        setVoiceChoice((cur) => {
          if (!cur) return null;
          const stillAvail = list.find((p) => p.name === cur.provider && p.models.includes(cur.model));
          return stillAvail ? cur : null;
        });
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (choice) localStorage.setItem('rioModelChoice', JSON.stringify(choice));
    else localStorage.removeItem('rioModelChoice');
  }, [choice]);

  useEffect(() => {
    if (voiceChoice) localStorage.setItem('rioVoiceChoice', JSON.stringify(voiceChoice));
    else localStorage.removeItem('rioVoiceChoice');
  }, [voiceChoice]);

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
        providerLabel: p.label,
        model: m,
        label: rioAlias(m),
      }))
    );
  }, [providers]);

  async function refreshMemories() {
    try {
      const r = await fetch(`/api/memory/${userId}`);
      const d = await safeJson(r);
      setMemories(d?.memories ?? []);
    } catch {}
  }

  async function send(textOverride, opts = {}) {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    setError(null);
    if (!textOverride) setInput('');

    const userMsg = { role: 'user', content: text, id: `tmp-${Date.now()}` };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const body = { userId, message: text };
      if (opts.voiceMode) {
        body.mode = 'voice';
        // If the user picked a specific model in the call overlay, pin it.
        // Otherwise leave provider/model unset → backend auto-cascades.
        if (voiceChoice) {
          body.provider = voiceChoice.provider;
          body.model = voiceChoice.model;
        }
      } else if (choice) {
        body.provider = choice.provider;
        body.model = choice.model;
      }
      let r;
      try {
        r = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        throw new Error('Cannot reach Rio backend. Make sure the server is running on port 8787.');
      }
      const data = await safeJson(r);
      if (!r.ok) {
        throw new Error(data?.error ?? `Server error (${r.status}). Try again or pick a different model.`);
      }
      if (!data || typeof data.reply !== 'string') {
        throw new Error('Got an empty response from Rio. Try again.');
      }

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.id === userMsg.id) {
          updated[updated.length - 1] = { ...last, emotion: data.emotion, intent: data.intent };
        }
        return [...updated, { role: 'assistant', content: data.reply, model: data.model }];
      });
      if (data.memorySaved) refreshMemories();
      return data.reply;
    } catch (e) {
      setError(e.message);
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      if (!textOverride) setInput(text);
      return null;
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

  const noProviders = modelOptions.length === 0;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <RioLogo />
          <h1>Rio</h1>
          <span className="brand-sub">your AI dost</span>
        </div>

        <div className="header-controls">
          <div className="model-picker">
            {noProviders ? (
              <span className="muted">No providers configured</span>
            ) : (
              <ModelPickerPopover
                value={choice}
                onChange={(next) => setChoice(next)}
                modelOptions={modelOptions}
                variant="light"
              />
            )}
          </div>

          <button
            className="icon-btn call-btn"
            onClick={() => setInCall(true)}
            title="Call Rio (voice mode)"
            aria-label="Start voice call"
          >
            <PhoneIcon />
          </button>

          <button
            className="icon-btn"
            onClick={clearChat}
            title="Clear current chat"
            aria-label="Clear chat"
          >
            <TrashIcon />
          </button>

          <button
            className="icon-btn theme-btn"
            onClick={() => setTheme((t) => (t === 'earth' ? 'coastal' : 'earth'))}
            title={theme === 'earth' ? 'Switch to Coastal palette' : 'Switch to Earth palette'}
            aria-label="Switch palette"
          >
            {theme === 'earth' ? <WaveIcon /> : <LeafIcon />}
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
              placeholder={inCall ? 'on call with Rio…' : 'kuch likh… (Enter to send, Shift+Enter for newline)'}
              rows={1}
              disabled={loading || noProviders || inCall}
            />
            <button
              className="send-btn"
              onClick={() => send()}
              disabled={loading || !input.trim() || noProviders || inCall}
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

      <CallOverlay
        isOpen={inCall}
        onClose={() => setInCall(false)}
        onTurn={(text) => send(text, { voiceMode: true })}
        modelOptions={modelOptions}
        voiceChoice={voiceChoice}
        onVoiceChoiceChange={setVoiceChoice}
      />
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
function RioLogo() {
  // Balance mark — yin-yang inside a soft halo.
  // Speaks to calm / mind / equilibrium, matching the project's wellness intent.
  // Mathematical SVG (only circles + arcs) so it renders precisely at every size.
  // Colors come from --logo-fg / --logo-bg so the mark retints per palette.
  return (
    <svg
      className="brand-logo"
      viewBox="0 0 100 100"
      width="40"
      height="40"
      aria-label="Rio logo"
      role="img"
    >
      {/* outer halo ring */}
      <circle cx="50" cy="50" r="48" fill="none" stroke="var(--logo-fg)" strokeWidth="1" opacity="0.18" />
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--logo-fg)" strokeWidth="0.6" opacity="0.10" />

      {/* yin-yang body — light side */}
      <circle cx="50" cy="50" r="38" fill="var(--logo-bg)" />

      {/* yin-yang body — dark S-half (right + bottom-left lobe) */}
      <path
        d="M 50 12 A 38 38 0 0 1 50 88 A 19 19 0 0 0 50 50 A 19 19 0 0 1 50 12 Z"
        fill="var(--logo-fg)"
      />

      {/* light dot inside the dark lobe */}
      <circle cx="50" cy="69" r="5" fill="var(--logo-bg)" />
      {/* dark dot inside the light lobe */}
      <circle cx="50" cy="31" r="5" fill="var(--logo-fg)" />

      {/* four cardinal aura ticks for a subtle meditative feel */}
      <circle cx="50" cy="3.5" r="1.4" fill="var(--logo-fg)" opacity="0.55" />
      <circle cx="50" cy="96.5" r="1.4" fill="var(--logo-fg)" opacity="0.55" />
      <circle cx="3.5" cy="50" r="1.1" fill="var(--logo-fg)" opacity="0.35" />
      <circle cx="96.5" cy="50" r="1.1" fill="var(--logo-fg)" opacity="0.35" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.8 2c1 5 .5 10-2.5 13a7 7 0 0 1-6.3 5z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
    </svg>
  );
}
function WaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
      <path d="M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
      <path d="M2 7c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
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
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
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
