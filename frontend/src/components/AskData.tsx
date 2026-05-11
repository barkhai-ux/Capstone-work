import { useState, useRef, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { api, QueryResult, SnippetSummary, TableInfo } from '../api';
import { Conversation, Message } from '../lib/conversations';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut, Scatter, Radar, PolarArea } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, RadialLinearScale,
  BarElement, LineElement, PointElement, ArcElement,
  Filler, Tooltip, Legend
);

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

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

function ResultChart({ result }: { result: QueryResult }) {
  const { chartConfig, rows } = result;
  if (!chartConfig || rows.length === 0) return null;

  const labels = rows.map(r => formatValue((r as Record<string, unknown>)[chartConfig.labelColumn]));
  const values = rows.map(r => {
    const v = (r as Record<string, unknown>)[chartConfig.valueColumn];
    return typeof v === 'number' ? v : parseFloat(String(v)) || 0;
  });

  const isCircular = ['pie', 'doughnut', 'polarArea'].includes(chartConfig.chartType);
  const isLineType = chartConfig.chartType === 'line' || chartConfig.chartType === 'area';
  const isRadar = chartConfig.chartType === 'radar';

  const data = {
    labels,
    datasets: [{
      label: chartConfig.valueColumn,
      data: chartConfig.chartType === 'scatter'
        ? rows.map(r => ({
            x: parseFloat(String((r as Record<string, unknown>)[chartConfig.labelColumn])) || 0,
            y: parseFloat(String((r as Record<string, unknown>)[chartConfig.valueColumn])) || 0,
          }))
        : values,
      backgroundColor: isCircular
        ? CHART_COLORS.slice(0, Math.max(labels.length, 1)).concat(
            labels.length > CHART_COLORS.length
              ? Array(labels.length - CHART_COLORS.length).fill('#94a3b8')
              : []
          )
        : isLineType ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.8)',
      borderColor: isCircular
        ? '#ffffff'
        : '#3b82f6',
      borderWidth: isCircular ? 2 : 2,
      fill: chartConfig.chartType === 'area',
      tension: 0.3,
      pointRadius: chartConfig.chartType === 'scatter' ? 5 : 3,
      pointBackgroundColor: '#3b82f6',
      borderRadius: chartConfig.chartType === 'bar' ? 4 : 0,
    }],
  };

  const options: Record<string, unknown> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: isCircular, position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 11 } } },
      tooltip: { backgroundColor: '#1f2937', titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8 },
    },
  };

  if (!isCircular && !isRadar) {
    (options as Record<string, unknown>).scales = {
      y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 }, color: '#6b7280' } },
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#6b7280', maxRotation: 45 } },
    };
  }
  if (isRadar) {
    (options as Record<string, unknown>).scales = {
      r: { beginAtZero: true, grid: { color: '#e5e7eb' }, pointLabels: { font: { size: 11 } } },
    };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const chartMap: Record<string, React.ComponentType<any>> = {
    bar: Bar, line: Line, area: Line, pie: Pie,
    doughnut: Doughnut, scatter: Scatter, radar: Radar, polarArea: PolarArea,
  };
  const ChartComponent = chartMap[chartConfig.chartType] || Bar;

  return (
    <div className="h-72 px-2 pt-2">
      <ChartComponent data={data} options={options} />
    </div>
  );
}

interface AskDataProps {
  conversations: Conversation[];
  activeId: string | null;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  tables: TableInfo[];
}

const FOLLOW_UP_TEMPLATES = [
  'Compare with previous period',
  'Break down by category',
  'Show total revenue per region',
  'Filter to top 10 only',
];

export default function AskData({ conversations, activeId, setConversations, setActiveId, tables }: AskDataProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [snippets, setSnippets] = useState<SnippetSummary[]>([]);
  const [showSnippets, setShowSnippets] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [snippetName, setSnippetName] = useState('');
  const [chartViewMode, setChartViewMode] = useState<Record<string, 'chart' | 'summary'>>({});
  const [contextTableId, setContextTableId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeConvo = conversations.find(c => c.id === activeId) ?? null;
  const messages = activeConvo?.messages ?? [];

  const lastAssistantResult = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.result) return m;
    }
    return null;
  }, [messages]);

  const recentOutputs = useMemo(() => {
    const items: { id: string; question: string; convoId: string; convoTitle: string }[] = [];
    for (const c of conversations) {
      for (const m of c.messages) {
        if (m.role === 'assistant' && m.result) {
          items.push({ id: m.id, question: m.content, convoId: c.id, convoTitle: c.title });
        }
      }
    }
    return items.slice(-6).reverse();
  }, [conversations]);

  const setMsgViewMode = (id: string, mode: 'chart' | 'summary') =>
    setChartViewMode(prev => ({ ...prev, [id]: mode }));
  const getMsgViewMode = (id: string): 'chart' | 'summary' =>
    chartViewMode[id] ?? 'chart';

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
    <div className="flex-1 flex min-h-0" style={{ background: 'var(--page-bg)' }}>
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center">
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
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
              showSnippets ? 'bg-accent-soft text-accent-strong' : 'text-gray-500 hover:bg-gray-100'
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
              <div className="w-16 h-16 rounded-2xl bg-accent-soft flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-700 mb-1">Ask anything about your data</h2>
              <p className="text-sm text-gray-400 max-w-md mb-6">
                Type a question in natural language and get instant results from all your tables. No SQL needed.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  'Who are our top 10 customers?',
                  'Chart sales by category',
                  'Show the trend of orders over time',
                  'What is the average price by product type?',
                  'Visualize revenue distribution by region',
                  'List all rows where quantity is above 50',
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-500 hover:border-accent/40 hover:text-accent-strong transition-colors"
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
                      <div className="bg-accent text-white px-4 py-2.5 rounded-2xl rounded-br-md max-w-lg text-sm">
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
                            <div className="flex items-center gap-2">
                              {msg.result.responseType === 'chart' && msg.result.chartConfig && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-medium">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                  </svg>
                                  {msg.result.chartConfig.chartType}
                                </span>
                              )}
                              <span className="text-xs text-gray-500">
                                {msg.result.totalRows} row{msg.result.totalRows !== 1 ? 's' : ''} returned
                              </span>
                            </div>
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
                                    className="w-40 px-2 py-0.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent-ring"
                                  />
                                  <button
                                    onClick={() => handleSaveSnippet(msg)}
                                    disabled={!snippetName.trim()}
                                    className="px-2 py-0.5 text-[10px] font-medium bg-accent text-white rounded hover:opacity-90 disabled:bg-gray-300 transition-colors"
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
                                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-gray-400 hover:text-accent-strong hover:bg-accent-soft rounded transition-colors"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                                  </svg>
                                  Save snippet
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Chart view with Chart / Summary tabs */}
                          {msg.result.responseType === 'chart' && msg.result.chartConfig ? (
                            <div>
                              <div className="flex items-center gap-1 px-3 pt-3">
                                <div className="flex gap-1 p-1 rounded-lg bg-gray-100">
                                  {(['chart', 'summary'] as const).map(mode => (
                                    <button
                                      key={mode}
                                      onClick={() => setMsgViewMode(msg.id, mode)}
                                      className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors capitalize ${
                                        getMsgViewMode(msg.id) === mode
                                          ? 'bg-white text-gray-700 shadow-sm'
                                          : 'text-gray-500 hover:text-gray-700'
                                      }`}
                                    >
                                      {mode}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {getMsgViewMode(msg.id) === 'chart' ? (
                                <div className="flex flex-col lg:flex-row gap-3 px-2 pb-2">
                                  <div className="flex-1 min-w-0">
                                    <ResultChart result={msg.result} />
                                  </div>
                                  {msg.result.insight && (
                                    <aside className="lg:w-56 flex-shrink-0 mx-2 lg:mx-0 lg:mr-3 mb-3 lg:mb-0 mt-2">
                                      <div className="rounded-xl bg-accent-soft border border-accent/15 px-3.5 py-3 h-full">
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                          <svg className="w-3.5 h-3.5 text-accent-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                          </svg>
                                          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-accent-strong">Key insight</span>
                                        </div>
                                        <p className="text-[12px] text-gray-700 leading-relaxed">{msg.result.insight}</p>
                                      </div>
                                    </aside>
                                  )}
                                </div>
                              ) : (
                                <div className="overflow-x-auto max-h-72 border-t border-gray-100">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="bg-gray-50 sticky top-0">
                                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 w-10">#</th>
                                        {msg.result.columns.map(col => (
                                          <th key={col} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">{col}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {msg.result.rows.map((row, i) => (
                                        <tr key={i} className="hover:bg-accent-soft/40 transition-colors">
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
                              )}
                            </div>
                          ) : (
                            /* Table view */
                            <div className="overflow-x-auto max-h-80">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-50 sticky top-0">
                                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 w-10">#</th>
                                    {msg.result.columns.map(col => (
                                      <th key={col} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">{col}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {msg.result.rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-accent-soft/40 transition-colors">
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
                          )}

                          {/* Insight for table responses */}
                          {msg.result.responseType !== 'chart' && msg.result.insight && (
                            <div className="border-t border-gray-100 mx-4 my-2.5 pt-2.5 flex items-start gap-2">
                              <svg className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                              </svg>
                              <p className="text-xs text-gray-500">{msg.result.insight}</p>
                            </div>
                          )}
                        </div>
                      ) : null}
                      {lastAssistantResult && lastAssistantResult.id === msg.id && !loading && (
                        <div className="mt-3">
                          <div className="text-[11px] font-medium text-gray-400 mb-1.5">Try asking follow-up questions</div>
                          <div className="flex flex-wrap gap-1.5">
                            {FOLLOW_UP_TEMPLATES.map(t => (
                              <button
                                key={t}
                                onClick={() => { setInput(t); inputRef.current?.focus(); }}
                                className="px-3 py-1 bg-white border border-gray-200 rounded-full text-[11px] text-gray-600 hover:border-accent/40 hover:text-accent-strong transition-colors"
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
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
                        <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
            <div className="relative flex items-end bg-gray-50 border border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-accent-ring focus-within:border-accent transition-all">
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
                className="m-1.5 p-2 rounded-lg bg-accent text-white hover:opacity-90 disabled:bg-gray-300 disabled:text-gray-400 transition-colors flex-shrink-0"
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

      {/* Right rail: Data Context / Recent outputs / Tips */}
      <aside className="hidden xl:flex flex-col w-72 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Data context</div>
          <div className="relative">
            <select
              value={contextTableId}
              onChange={e => setContextTableId(e.target.value)}
              className="w-full appearance-none px-3 py-2 pr-8 text-[13px] text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-ring focus:border-accent"
            >
              <option value="">All tables ({tables.length})</option>
              {tables.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <svg className="w-3 h-3 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
          <p className="text-[10.5px] text-gray-400 mt-1.5 leading-relaxed">
            {contextTableId
              ? 'Suggested questions will reference this table.'
              : 'Questions search across every uploaded table.'}
          </p>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Recent outputs</div>
            {recentOutputs.length > 0 && (
              <span className="text-[10px] text-gray-300">{recentOutputs.length}</span>
            )}
          </div>
          {recentOutputs.length === 0 ? (
            <p className="text-[11.5px] text-gray-400 italic">No outputs yet — your saved answers appear here.</p>
          ) : (
            <ul className="space-y-1">
              {recentOutputs.map(o => (
                <li key={o.id}>
                  <button
                    onClick={() => setActiveId(o.convoId)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-gray-50 group"
                  >
                    <div className="text-[12px] text-gray-700 truncate group-hover:text-accent-strong">{o.question}</div>
                    <div className="text-[10px] text-gray-400 truncate mt-0.5">in {o.convoTitle}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Tips</div>
          <ul className="space-y-2 text-[11.5px] text-gray-500 leading-relaxed">
            <li className="flex gap-1.5">
              <span className="text-accent-strong mt-px">•</span>
              <span>Ask in plain language — &quot;average price by region&quot; works.</span>
            </li>
            <li className="flex gap-1.5">
              <span className="text-accent-strong mt-px">•</span>
              <span>Mention a chart type to control output: &quot;bar chart of sales by month&quot;.</span>
            </li>
            <li className="flex gap-1.5">
              <span className="text-accent-strong mt-px">•</span>
              <span>Use follow-ups to refine results without retyping context.</span>
            </li>
            <li className="flex gap-1.5">
              <span className="text-accent-strong mt-px">•</span>
              <span>Save useful answers as snippets to reuse them later.</span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
