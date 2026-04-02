import { useState, useRef, useEffect, useCallback, FormEvent } from 'react';
import { api, QueryResult, SnippetSummary } from '../api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  result?: QueryResult;
  error?: string;
  savedAs?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
}

const STORAGE_KEY = 'askdata_conversations';

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convos: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if ('days' in obj && typeof obj.days === 'number') {
      return new Date(obj.days * 86400000).toISOString().slice(0, 10);
    }
    if ('micros' in obj) {
      return new Date(Number(obj.micros) / 1000).toISOString().replace('T', ' ').slice(0, 19);
    }
    try { return JSON.stringify(v); } catch { return '[object]'; }
  }
  return String(v);
}

export default function AskData() {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(() => {
    const convos = loadConversations();
    return convos.length > 0 ? convos[0].id : null;
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [snippets, setSnippets] = useState<SnippetSummary[]>([]);
  const [showSnippets, setShowSnippets] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [snippetName, setSnippetName] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeConvo = conversations.find(c => c.id === activeId) ?? null;
  const messages = activeConvo?.messages ?? [];

  // Persist conversations to localStorage whenever they change
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  const loadSnippets = async () => {
    const res = await api.listSnippets();
    if (res.success && res.data) setSnippets(res.data);
  };

  useEffect(() => {
    loadSnippets();
  }, []);

  const updateConvoMessages = useCallback((convoId: string, updater: (prev: Message[]) => Message[]) => {
    setConversations(prev => prev.map(c =>
      c.id === convoId ? { ...c, messages: updater(c.messages) } : c
    ));
  }, []);

  const handleNewChat = () => {
    const newConvo: Conversation = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setConversations(prev => [newConvo, ...prev]);
    setActiveId(newConvo.id);
    setInput('');
    setSavingId(null);
    setSnippetName('');
  };

  const handleDeleteConversation = (convoId: string) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== convoId);
      if (activeId === convoId) {
        setActiveId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
    setDeletingId(null);
  };

  const handleSelectConversation = (convoId: string) => {
    setActiveId(convoId);
    setSavingId(null);
    setSnippetName('');
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = input.trim();
    if (!q || loading) return;

    // If no active conversation, create one
    let targetId = activeId;
    if (!targetId) {
      const newConvo: Conversation = {
        id: crypto.randomUUID(),
        title: q.length > 50 ? q.slice(0, 50) + '...' : q,
        messages: [],
        createdAt: new Date().toISOString(),
      };
      setConversations(prev => [newConvo, ...prev]);
      targetId = newConvo.id;
      setActiveId(targetId);
    }

    const convoId = targetId;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: q };

    // Update title if this is the first message in a "New Chat"
    setConversations(prev => prev.map(c => {
      if (c.id === convoId) {
        const isNewTitle = c.title === 'New Chat' && c.messages.length === 0;
        return {
          ...c,
          title: isNewTitle ? (q.length > 50 ? q.slice(0, 50) + '...' : q) : c.title,
          messages: [...c.messages, userMsg],
        };
      }
      return c;
    }));

    setInput('');
    setLoading(true);

    try {
      // Build conversation history from previous messages for context
      const currentMessages = conversations.find(c => c.id === convoId)?.messages ?? [];
      const history: { role: 'user' | 'assistant'; content: string }[] = [];
      for (const m of currentMessages) {
        if (m.role === 'user') {
          history.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant' && m.result) {
          const colList = m.result.columns.join(', ');
          history.push({ role: 'assistant', content: `Query returned ${m.result.totalRows} rows with columns: ${colList}` });
        }
      }
      const recentHistory = history.slice(-20);

      const res = await api.queryData(q, recentHistory.length > 0 ? recentHistory : undefined);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: q,
      };
      if (res.success && res.data) {
        assistantMsg.result = res.data;
      } else {
        assistantMsg.error = res.error ?? res.message ?? 'Query failed';
      }
      updateConvoMessages(convoId, prev => [...prev, assistantMsg]);
    } catch (err) {
      updateConvoMessages(convoId, prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: q,
        error: err instanceof Error ? err.message : 'Query failed',
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSaveSnippet = async (msg: Message) => {
    if (!msg.result || !snippetName.trim() || !activeId) return;
    const res = await api.saveSnippet(
      snippetName.trim(),
      msg.content,
      msg.result.columns,
      msg.result.rows
    );
    if (res.success) {
      updateConvoMessages(activeId, prev =>
        prev.map(m => m.id === msg.id ? { ...m, savedAs: snippetName.trim() } : m)
      );
      setSavingId(null);
      setSnippetName('');
      loadSnippets();
    }
  };

  const handleDeleteSnippet = async (id: string) => {
    const res = await api.deleteSnippet(id);
    if (res.success) {
      setSnippets(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleLoadSnippet = async (snippet: SnippetSummary) => {
    if (!activeId) return;
    const res = await api.getSnippet(snippet.id);
    if (res.success && res.data) {
      const d = res.data;
      updateConvoMessages(activeId, prev => [
        ...prev,
        { id: Date.now().toString(), role: 'user', content: d.question },
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: d.question,
          result: { columns: d.columns, rows: d.rows, totalRows: d.rowCount },
          savedAs: d.name,
        },
      ]);
      setShowSnippets(false);
    }
  };

  return (
    <div className="flex-1 flex min-h-0 bg-gray-50">
      {/* Conversation sidebar */}
      {showSidebar && (
        <div className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-0">
          {/* Sidebar header */}
          <div className="px-3 py-3 border-b border-gray-200">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Chat
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {conversations.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-gray-400">No conversations yet</p>
                <p className="text-[10px] text-gray-300 mt-1">Start a new chat to begin</p>
              </div>
            ) : (
              <div className="py-1.5">
                {conversations.map(convo => (
                  <div
                    key={convo.id}
                    className={`group relative flex items-center mx-1.5 mb-0.5 rounded-lg transition-colors ${
                      activeId === convo.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <button
                      onClick={() => handleSelectConversation(convo.id)}
                      className="flex-1 text-left px-3 py-2.5 min-w-0"
                    >
                      <div className="text-xs font-medium truncate">{convo.title}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {convo.messages.length === 0
                          ? 'Empty'
                          : `${Math.ceil(convo.messages.length / 2)} message${Math.ceil(convo.messages.length / 2) !== 1 ? 's' : ''}`
                        }
                      </div>
                    </button>

                    {/* Delete button */}
                    {deletingId === convo.id ? (
                      <div className="flex items-center gap-1 pr-2">
                        <button
                          onClick={() => handleDeleteConversation(convo.id)}
                          className="px-1.5 py-0.5 text-[10px] font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(convo.id)}
                        className="p-1.5 mr-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-800">
                {activeConvo ? activeConvo.title : 'Ask Your Data'}
              </h1>
              <p className="text-[11px] text-gray-400">Ask questions in natural language across all your tables</p>
            </div>
          </div>
          <button
            onClick={() => { setShowSnippets(!showSnippets); if (!showSnippets) loadSnippets(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showSnippets ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
            Saved Snippets {snippets.length > 0 && `(${snippets.length})`}
          </button>
        </div>

        {/* Snippets panel */}
        {showSnippets && (
          <div className="bg-white border-b border-gray-200 px-6 py-3 max-h-48 overflow-y-auto">
            {snippets.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">No saved snippets yet</p>
            ) : (
              <div className="space-y-1.5">
                {snippets.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg group">
                    <button
                      onClick={() => handleLoadSnippet(s)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="text-xs font-medium text-gray-700 truncate">{s.name}</div>
                      <div className="text-[10px] text-gray-400 truncate">{s.question} -- {s.rowCount} rows</div>
                    </button>
                    <button
                      onClick={() => handleDeleteSnippet(s.id)}
                      className="ml-2 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-700 mb-1">Ask anything about your data</h2>
              <p className="text-sm text-gray-400 max-w-md mb-6">
                Type a question in natural language and get instant results from all your tables. No SQL needed.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  'Show me the top 10 rows',
                  'What are the total sales by category?',
                  'How many unique customers are there?',
                  'Show the average price by product type',
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
              {messages.map(msg => (
                <div key={msg.id}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end mb-1">
                      <div className="bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-br-md max-w-lg text-sm">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {msg.error ? (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                          <div className="flex items-center gap-2 mb-1">
                            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                            </svg>
                            <span className="text-xs font-medium text-red-600">Error</span>
                          </div>
                          <p className="text-sm text-red-600">{msg.error}</p>
                        </div>
                      ) : msg.result ? (
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          {/* Result header */}
                          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                            <span className="text-xs text-gray-500">
                              {msg.result.totalRows} row{msg.result.totalRows !== 1 ? 's' : ''} returned
                            </span>
                            <div className="flex items-center gap-1.5">
                              {msg.savedAs ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 rounded text-[10px] font-medium">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                  Saved as &quot;{msg.savedAs}&quot;
                                </span>
                              ) : savingId === msg.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={snippetName}
                                    onChange={e => setSnippetName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveSnippet(msg); if (e.key === 'Escape') { setSavingId(null); setSnippetName(''); } }}
                                    placeholder="Snippet name..."
                                    autoFocus
                                    className="w-40 px-2 py-0.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                  <button
                                    onClick={() => handleSaveSnippet(msg)}
                                    disabled={!snippetName.trim()}
                                    className="px-2 py-0.5 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => { setSavingId(null); setSnippetName(''); }}
                                    className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setSavingId(msg.id); setSnippetName(''); }}
                                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                                  </svg>
                                  Save snippet
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Data table */}
                          <div className="overflow-x-auto max-h-80">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 sticky top-0">
                                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 w-10">#</th>
                                  {msg.result.columns.map(col => (
                                    <th key={col} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {msg.result.rows.map((row, i) => (
                                  <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                                    <td className="px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-100">{i + 1}</td>
                                    {msg.result!.columns.map(col => (
                                      <td key={col} className="px-3 py-1.5 text-xs text-gray-700 border-b border-gray-100 whitespace-nowrap max-w-[300px] truncate">
                                        {formatValue((row as Record<string, unknown>)[col])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <div className="flex items-start gap-3">
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-gray-400">Analyzing your data...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="relative flex items-end bg-gray-50 border border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-blue-400 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Ask a question about your data..."
                disabled={loading}
                rows={1}
                className="flex-1 bg-transparent px-4 py-3 text-sm text-gray-700 placeholder-gray-400 resize-none focus:outline-none disabled:opacity-50 max-h-32"
                style={{ minHeight: '44px' }}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="m-1.5 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-400 transition-colors flex-shrink-0"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-2">
              Queries all your uploaded tables automatically. Press Enter to send.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
