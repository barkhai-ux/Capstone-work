import { useEffect, useMemo, useState } from 'react';
import { api, TableInfo, CleaningKind, CleaningAnalysis } from '../api';

interface DataCleaningProps {
  table: TableInfo;
  onBack: () => void;
  onToast: (message: string, type?: 'success' | 'error') => void;
}

const ISSUE_LABELS: Record<CleaningKind, string> = {
  fill_missing: 'Missing values',
  remove_duplicates: 'Duplicate rows',
  standardize_dates: 'Inconsistent date formats',
  cap_outliers: 'Outliers',
  coerce_types: 'Data type mismatch',
};

const ISSUE_COLORS: Record<CleaningKind, { fg: string; bg: string; cellBg: string; cellRing: string }> = {
  fill_missing: { fg: '#dc2626', bg: '#fef2f2', cellBg: '#fee2e2', cellRing: '#fca5a5' },
  remove_duplicates: { fg: '#d97706', bg: '#fffbeb', cellBg: '#fef3c7', cellRing: '#fcd34d' },
  standardize_dates: { fg: '#7c3aed', bg: '#f5f3ff', cellBg: '#ede9fe', cellRing: '#c4b5fd' },
  cap_outliers: { fg: '#059669', bg: '#ecfdf5', cellBg: '#d1fae5', cellRing: '#6ee7b7' },
  coerce_types: { fg: '#db2777', bg: '#fdf2f8', cellBg: '#fce7f3', cellRing: '#f9a8d4' },
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return '[obj]'; }
  }
  return String(v);
}

function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

export default function DataCleaning({ table, onBack, onToast }: DataCleaningProps) {
  const [analysis, setAnalysis] = useState<CleaningAnalysis | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [analyzing, setAnalyzing] = useState(true);
  const [applying, setApplying] = useState(false);
  const [activeIssue, setActiveIssue] = useState<CleaningKind | 'all'>('all');
  const [dismissed, setDismissed] = useState<Set<CleaningKind>>(new Set());

  const reload = async () => {
    setAnalyzing(true);
    try {
      const [analyzeRes, rowsRes] = await Promise.all([
        api.analyzeCleaning(table.id),
        api.getTableData(table.id, 1, 200),
      ]);
      if (analyzeRes.success && analyzeRes.data) {
        setAnalysis(analyzeRes.data);
        setDismissed(new Set());
      } else {
        onToast(analyzeRes.error || 'Analysis failed', 'error');
      }
      if (rowsRes.success && rowsRes.data) setRows(rowsRes.data.rows);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Analysis failed', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.id]);

  const callApply = async (kinds: CleaningKind[]) => {
    if (kinds.length === 0) return;
    const unique = Array.from(new Set(kinds));
    setApplying(true);
    try {
      const res = await api.applyCleaning(table.id, unique);
      if (res.success && res.data) {
        const total = res.data.applied.reduce((s, a) => s + a.affected, 0);
        const labels: Record<CleaningKind, (n: number) => string> = {
          fill_missing: (n) => `Filled ${n} missing value${n === 1 ? '' : 's'}`,
          remove_duplicates: (n) => `Removed ${n} duplicate row${n === 1 ? '' : 's'}`,
          standardize_dates: (n) => `Standardized ${n} date${n === 1 ? '' : 's'}`,
          cap_outliers: (n) => `Capped ${n} outlier${n === 1 ? '' : 's'}`,
          coerce_types: (n) => `Coerced ${n} value${n === 1 ? '' : 's'}`,
        };
        const summary = res.data.applied.length === 1
          ? labels[res.data.applied[0].kind](res.data.applied[0].affected)
          : `Applied ${res.data.applied.length} fixes · ${total} change${total === 1 ? '' : 's'}`;
        onToast(total > 0 ? summary : 'Already clean — no rows changed');
        setDismissed((prev) => new Set([...prev, ...unique]));
        await reload();
      } else {
        onToast(res.error || 'Cleaning failed', 'error');
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Cleaning failed', 'error');
    } finally {
      setApplying(false);
    }
  };

  // Cell-level highlighting for the 200-row preview (visual only).
  const issuesByCell = useMemo(() => {
    const map = new Map<string, CleaningKind>();
    if (!analysis) return map;
    const fillCols = new Set(
      analysis.columns.filter((c) => c.issues.some((i) => i.kind === 'fill_missing')).map((c) => c.name)
    );
    rows.forEach((r, i) => {
      analysis.columns.forEach((c) => {
        if (fillCols.has(c.name) && isMissing(r[c.name])) {
          map.set(`${i}|${c.name}`, 'fill_missing');
        }
      });
    });
    return map;
  }, [rows, analysis]);

  const issueGroups = useMemo(() => {
    if (!analysis) return [];
    return (Object.keys(analysis.byKind) as CleaningKind[])
      .filter((k) => analysis.byKind[k] > 0)
      .map((k) => ({ kind: k, label: ISSUE_LABELS[k], count: analysis.byKind[k] }));
  }, [analysis]);

  const visibleSuggestions = useMemo(() => {
    if (!analysis) return [];
    return analysis.recommendations.filter((r) => !dismissed.has(r.kind));
  }, [analysis, dismissed]);

  const visibleRows = useMemo(() => rows.slice(0, 30), [rows]);

  const totalIssues = analysis?.totalIssues ?? 0;
  const qualityScore = analysis?.qualityScore ?? 100;
  const stats = {
    total: totalIssues,
    duplicates: analysis?.byKind.remove_duplicates ?? 0,
    missing: analysis?.byKind.fill_missing ?? 0,
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onBack} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <h1 className="text-[15px] font-semibold text-gray-900 truncate">Data Cleaning</h1>
          <span className="text-gray-300">/</span>
          <span className="text-[13px] text-gray-500 truncate">{table.name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onToast('Saved as new dataset')}
            className="px-3 py-1.5 text-[12px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Save as new dataset
          </button>
          <button
            onClick={() => onToast('Cleaned data exported')}
            className="px-3 py-1.5 text-[12px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Export cleaned data
          </button>
          <button
            disabled={totalIssues === 0 || applying || analyzing}
            onClick={() => callApply(issueGroups.map((g) => g.kind))}
            className="px-3.5 py-1.5 text-[12px] font-semibold text-white bg-accent hover:opacity-95 disabled:opacity-50 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
          >
            {applying ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            {applying ? 'Applying…' : `Apply ${totalIssues} fix${totalIssues === 1 ? '' : 'es'}`}
          </button>
        </div>
      </div>

      {/* ── Loading state ── */}
      {analyzing && !analysis ? (
        <AnalyzingState tableName={table.name} />
      ) : !analysis ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          Failed to load analysis. <button onClick={reload} className="ml-2 text-accent-strong underline">Retry</button>
        </div>
      ) : (
        <>
          {/* ── Stats row ── */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0 grid grid-cols-4 gap-4">
            <QualityGauge score={qualityScore} loading={analyzing} />
            <StatCard label="Issues" value={stats.total} accent="#dc2626" bg="#fef2f2" />
            <StatCard label="Duplicates" value={stats.duplicates} accent="#d97706" bg="#fffbeb" />
            <StatCard label="Missing values" value={stats.missing} accent="#7c3aed" bg="#f5f3ff" />
          </div>

          {/* ── Main 3-pane ── */}
          <div className="flex-1 flex min-h-0">
            {/* Issues sidebar */}
            <aside className="w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50/40 overflow-y-auto">
              <div className="px-4 pt-4 pb-2">
                <h3 className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-2.5">Issues detected</h3>
                <button
                  onClick={() => setActiveIssue('all')}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[12.5px] transition-colors ${
                    activeIssue === 'all' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-700 hover:bg-white/70'
                  }`}
                >
                  <span>All issues</span>
                  <span className="text-[10.5px] font-bold text-gray-400">{stats.total}</span>
                </button>
                <div className="space-y-0.5 mt-1">
                  {issueGroups.map((g) => {
                    const c = ISSUE_COLORS[g.kind];
                    const active = activeIssue === g.kind;
                    return (
                      <button
                        key={g.kind}
                        onClick={() => setActiveIssue(g.kind)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[12.5px] transition-colors ${
                          active ? 'bg-white shadow-sm font-medium' : 'text-gray-700 hover:bg-white/70'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.fg }} />
                          <span className="truncate" style={{ color: active ? c.fg : undefined }}>{g.label}</span>
                        </span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-px rounded-full flex-shrink-0"
                          style={{ background: c.bg, color: c.fg }}
                        >
                          {g.count}
                        </span>
                      </button>
                    );
                  })}
                  {issueGroups.length === 0 && (
                    <div className="text-[11.5px] text-emerald-600 px-2.5 py-2 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      No issues found
                    </div>
                  )}
                </div>
              </div>

              {/* Cleaning summary */}
              <div className="px-4 pt-4 pb-4 mt-2 border-t border-gray-200">
                <h4 className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-2">Cleaning summary</h4>
                <div className="space-y-1.5 text-[11.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Rows analyzed</span>
                    <span className="font-semibold text-gray-700">{analysis.rowCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Columns</span>
                    <span className="font-semibold text-gray-700">{analysis.columns.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Quality score</span>
                    <span className="font-semibold" style={{ color: qualityScore >= 80 ? '#059669' : qualityScore >= 50 ? '#d97706' : '#dc2626' }}>{qualityScore}%</span>
                  </div>
                </div>
              </div>
            </aside>

            {/* Table preview */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 flex-shrink-0 bg-white">
                <span className="text-[11.5px] text-gray-500">
                  Preview <span className="font-semibold text-gray-700">{visibleRows.length}</span> of <span className="font-semibold text-gray-700">{analysis.rowCount.toLocaleString()}</span> rows · <span className="text-accent-strong">analysis covers full table</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button className="px-2.5 py-1 text-[11.5px] text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-md flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                    Columns
                  </button>
                  <button className="px-2.5 py-1 text-[11.5px] text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-md flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                    </svg>
                    Filters
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10.5px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200 w-10">#</th>
                      {analysis.columns.map((c) => (
                        <th key={c.name} className="px-3 py-2 text-left text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-100">{i + 1}</td>
                        {analysis.columns.map((c) => {
                          const issue = issuesByCell.get(`${i}|${c.name}`);
                          const colors = issue ? ISSUE_COLORS[issue] : null;
                          const v = (row as Record<string, unknown>)[c.name];
                          const display = isMissing(v) ? '—' : formatValue(v);
                          return (
                            <td
                              key={c.name}
                              className="px-3 py-1.5 text-[12px] text-gray-700 border-b border-gray-100 whitespace-nowrap max-w-[260px] truncate"
                              style={colors ? { background: colors.cellBg, boxShadow: `inset 0 0 0 1px ${colors.cellRing}` } : undefined}
                              title={issue ? ISSUE_LABELS[issue] : ''}
                            >
                              <span style={isMissing(v) ? { color: '#9ca3af', fontStyle: 'italic' } : undefined}>{display}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI suggestions */}
            <aside className="w-72 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
              <div className="px-4 pt-4 pb-3 sticky top-0 bg-white border-b border-gray-100 z-10">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <h3 className="text-[13px] font-semibold text-gray-800">AI suggestions</h3>
                  {visibleSuggestions.length > 0 && (
                    <span className="ml-auto text-[10px] font-bold text-accent-strong bg-accent-soft px-1.5 py-0.5 rounded-full">
                      {visibleSuggestions.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                {visibleSuggestions.length === 0 ? (
                  <p className="text-[11.5px] text-gray-400 italic">No suggestions — your data looks clean.</p>
                ) : (
                  visibleSuggestions.map((s) => {
                    const c = ISSUE_COLORS[s.kind];
                    return (
                      <div key={s.kind} className="rounded-xl border border-gray-200 p-3 hover:shadow-sm transition-shadow">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span
                            className="px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wider"
                            style={{ background: c.bg, color: c.fg }}
                          >
                            Suggested fix
                          </span>
                        </div>
                        <div className="text-[12.5px] font-semibold text-gray-800 mb-1">{s.title}</div>
                        <p className="text-[11.5px] text-gray-500 leading-relaxed mb-2.5">{s.description}</p>
                        <div className="flex gap-1.5">
                          <button
                            disabled={applying}
                            onClick={() => callApply([s.kind])}
                            className="flex-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-accent hover:opacity-95 disabled:opacity-50 rounded-md transition-colors"
                          >
                            {applying ? 'Applying…' : 'Apply'}
                          </button>
                          <button
                            onClick={() => setDismissed((prev) => new Set([...prev, s.kind]))}
                            className="px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>
          </div>

          {/* ── Bottom bar ── */}
          <div className="px-6 py-3 border-t border-gray-200 flex-shrink-0 bg-gray-50/40 flex items-center gap-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              {issueGroups.slice(0, 4).map((g) => {
                const c = ISSUE_COLORS[g.kind];
                return (
                  <span
                    key={g.kind}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10.5px] font-semibold"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.fg }} />
                    {g.label}
                  </span>
                );
              })}
            </div>
            <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg max-w-2xl mx-auto">
              <svg className="w-3.5 h-3.5 text-accent-strong flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <p className="text-[11.5px] text-gray-600 truncate">
                <span className="font-semibold text-gray-800">AI summary:</span>{' '}
                {analysis.aiSummary
                  || (totalIssues === 0
                    ? 'Your data looks clean — no issues detected.'
                    : `We found ${totalIssues} issue${totalIssues === 1 ? '' : 's'} across ${issueGroups.length} categor${issueGroups.length === 1 ? 'y' : 'ies'}. Applying all fixes should raise your quality score to ~${Math.min(100, qualityScore + 15)}%.`)}
              </p>
            </div>
            <button
              onClick={() => onToast('Chat coming soon')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-accent-strong bg-accent-soft hover:bg-accent-soft-active rounded-lg transition-colors flex-shrink-0"
            >
              <span className="text-[10px]">Need help?</span>
              <span className="font-semibold">Chat with AI</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Loading state ────────────────────────────────────────────────

function AnalyzingState({ tableName }: { tableName: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center bg-gradient-to-br from-white via-accent-soft/20 to-white">
      <div className="relative w-16 h-16 mb-5">
        <div className="absolute inset-0 rounded-full border-2 border-accent-soft" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        <div className="absolute inset-2 rounded-full bg-accent-soft flex items-center justify-center">
          <svg className="w-5 h-5 text-accent-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
      </div>
      <h2 className="text-[17px] font-semibold text-gray-800 mb-1.5">Analyzing your data</h2>
      <p className="text-[13px] text-gray-500 mb-5 max-w-md">
        Running quality checks against the full <span className="font-medium text-gray-700">{tableName}</span> table.
        Counting nulls, finding duplicates, detecting outliers, and asking AI for recommendations.
      </p>
      <div className="space-y-2 max-w-xs w-full">
        {['Counting null values', 'Detecting duplicates', 'Profiling columns', 'Asking AI for fixes'].map((step, i) => (
          <div
            key={step}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-100 text-[12px] text-gray-600 animate-pulse"
            style={{ animationDelay: `${i * 200}ms`, animationDuration: '1.5s' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Quality gauge ────────────────────────────────────────────────

function QualityGauge({ score, loading }: { score: number; loading?: boolean }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white border border-gray-200 px-4 py-3">
      <div className="relative w-16 h-16 flex-shrink-0">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} stroke="#f3f4f6" strokeWidth="6" fill="none" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            stroke={color}
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {loading ? (
            <span className="w-3 h-3 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          ) : (
            <span className="text-[14px] font-bold" style={{ color }}>{score}%</span>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Data quality</div>
        <div className="text-[12px] text-gray-600">{score >= 80 ? 'Looks good' : score >= 50 ? 'Needs cleanup' : 'Lots of issues'}</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, bg }: { label: string; value: number; accent: string; bg: string }) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 px-4 py-3 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center text-[13px] font-bold flex-shrink-0"
        style={{ background: bg, color: accent }}
      >
        {value}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">{label}</div>
        <div className="text-[15px] font-bold text-gray-800">{value.toLocaleString()}</div>
      </div>
    </div>
  );
}
