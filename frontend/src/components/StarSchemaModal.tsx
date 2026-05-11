import { useEffect, useMemo, useRef, useState } from 'react';
import { api, StarSchemaRecommendation, DimensionRecommendation } from '../api';

interface StarSchemaModalProps {
  open: boolean;
  tableId: string;
  tableName: string;
  onClose: () => void;
  onApplied: () => void;
}

const BENEFITS = [
  'Faster query performance',
  'Better data consistency',
  'Easier to maintain',
  'Scalable for future data',
];

export default function StarSchemaModal({ open, tableId, tableName, onClose, onApplied }: StarSchemaModalProps) {
  const [rec, setRec] = useState<StarSchemaRecommendation | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setRec(null);
    setError(null);
    setSuccess(null);
    setActiveTable(null);
    setAnalyzing(true);
    api.analyzeStarSchema(tableId)
      .then((r) => {
        if (r.success && r.data) {
          setRec(r.data);
          setActiveTable(r.data.factTable.name);
        } else {
          setError(r.error || 'Analysis failed');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Analysis failed'))
      .finally(() => setAnalyzing(false));
  }, [open, tableId]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const handleApply = async () => {
    if (!rec) return;
    setApplying(true);
    setError(null);
    try {
      const res = await api.applyStarSchema(rec.tableId, rec.factTable.name, rec.factTable.measures, rec.dimensions);
      if (res.success && res.data) {
        setSuccess(`Star schema created — fact "${res.data.factTable}", dimensions: ${res.data.dimensionTables.join(', ')}`);
        setRec(null);
        onApplied();
      } else {
        setError(res.error || 'Failed to apply');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-accent-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
            <h2 className="text-[15px] font-semibold text-gray-900 truncate">
              Star Schema Recommendation for <span className="text-accent-strong">{tableName}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Loading / error states */}
        {analyzing && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-accent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">AI is designing your star schema…</p>
          </div>
        )}

        {!analyzing && error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zm0-12a9 9 0 100 18 9 9 0 000-18z" />
              </svg>
            </div>
            <p className="text-sm text-red-600 max-w-md">{error}</p>
            <button onClick={onClose} className="text-[12px] text-gray-500 hover:text-gray-800 mt-1">Close</button>
          </div>
        )}

        {!analyzing && !error && success && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-sm text-gray-700 max-w-md">{success}</p>
            <button onClick={onClose} className="mt-2 px-4 py-2 rounded-lg text-[12.5px] font-semibold bg-accent text-white hover:opacity-95 transition-colors">Done</button>
          </div>
        )}

        {!analyzing && !error && rec && (
          <>
            <div className="flex-1 flex min-h-0">
              <SummaryPane rec={rec} activeTable={activeTable} onPickTable={setActiveTable} />
              <DiagramPane rec={rec} activeTable={activeTable} onPickTable={setActiveTable} />
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 flex-shrink-0">
              <div className="mx-6 my-3 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-[12px] text-amber-800">
                <svg className="w-4 h-4 mt-px text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z" />
                </svg>
                <div>
                  <span className="font-semibold">This will restructure your tables.</span>
                  {' '}A backup snapshot will be created before applying the changes.
                </div>
              </div>
              <div className="px-6 pb-4 flex items-center justify-between">
                <button className="text-[12px] text-gray-500 hover:text-gray-800 font-medium flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75L12 18.75l9.75-6M2.25 9l9.75 6 9.75-6L12 3 2.25 9z" />
                  </svg>
                  Preview SQL
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-[12.5px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className="px-4 py-2 rounded-lg text-[12.5px] font-semibold text-white bg-accent hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    {applying ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Applying…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        Apply Schema
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Summary Pane ────────────────────────────────────────────────

function SummaryPane({
  rec,
  activeTable,
  onPickTable,
}: {
  rec: StarSchemaRecommendation;
  activeTable: string | null;
  onPickTable: (name: string) => void;
}) {
  const totalCols = rec.dimensions.reduce((s, d) => s + d.columns.length, 0);
  const summaryBullets = [
    `Created 1 fact table: ${rec.factTable.name}`,
    `Identified ${rec.dimensions.length} dimension table${rec.dimensions.length === 1 ? '' : 's'}`,
    `Reorganized ${totalCols} column${totalCols === 1 ? '' : 's'} into dimensions`,
    `Linked via ${rec.factTable.foreignKeys.length} foreign key${rec.factTable.foreignKeys.length === 1 ? '' : 's'}`,
  ];

  const changePreview = useMemo(() => {
    const items: { col: string; from: string; to: string }[] = [];
    for (const d of rec.dimensions) {
      for (const c of d.columns) {
        if (c === d.primaryKey) continue;
        items.push({ col: c, from: rec.tableName, to: d.dimensionName });
      }
    }
    return items.slice(0, 6);
  }, [rec]);

  return (
    <aside className="w-[320px] flex-shrink-0 border-r border-gray-200 bg-gray-50/40 overflow-y-auto">
      {/* AI Summary */}
      <section className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-accent-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <h3 className="text-[13px] font-semibold text-gray-800">AI Summary</h3>
        </div>
        <p className="text-[11.5px] text-gray-500 leading-relaxed mb-3">
          We analyzed your table and created a star schema. Click on a table in the diagram
          to view fact and dimension details.
        </p>
        <ul className="space-y-1.5">
          {summaryBullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[12px] text-gray-700">
              <svg className="w-3.5 h-3.5 mt-0.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Benefits */}
      <section className="px-5 pt-3 pb-4 border-t border-gray-200">
        <h3 className="text-[13px] font-semibold text-gray-800 mb-2">Benefits</h3>
        <ul className="space-y-1.5">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-2 text-[12px] text-gray-700">
              <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {b}
            </li>
          ))}
        </ul>
      </section>

      {/* Table breakdown */}
      <section className="px-5 pt-3 pb-4 border-t border-gray-200">
        <h3 className="text-[13px] font-semibold text-gray-800 mb-2.5">Table breakdown</h3>
        <div className="space-y-1.5">
          <button
            onClick={() => onPickTable(rec.factTable.name)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12px] transition-colors ${
              activeTable === rec.factTable.name ? 'bg-accent-soft text-accent-strong' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="px-1.5 py-px bg-accent text-white rounded text-[9px] font-bold">FACT</span>
              <span className="font-medium">{rec.factTable.name}</span>
            </span>
            <span className="text-[10px] text-gray-400">{rec.factTable.measures.length} measures</span>
          </button>
          {rec.dimensions.map((d) => (
            <button
              key={d.dimensionName}
              onClick={() => onPickTable(d.dimensionName)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12px] transition-colors ${
                activeTable === d.dimensionName ? 'bg-accent-soft text-accent-strong' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="px-1.5 py-px bg-violet-100 text-violet-700 rounded text-[9px] font-bold">DIM</span>
                <span className="font-medium">{d.dimensionName}</span>
              </span>
              <span className="text-[10px] text-gray-400">{d.columns.length} cols</span>
            </button>
          ))}
        </div>
      </section>

      {/* Change preview */}
      {changePreview.length > 0 && (
        <section className="px-5 pt-3 pb-5 border-t border-gray-200">
          <h3 className="text-[13px] font-semibold text-gray-800 mb-2.5">Change preview</h3>
          <ul className="space-y-1.5">
            {changePreview.map((c) => (
              <li key={c.col} className="text-[11.5px] text-gray-600 flex items-center gap-1.5 truncate">
                <span className="font-medium text-gray-800 truncate">{c.col}</span>
                <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <span className="text-accent-strong truncate">{c.to}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

// ─── Diagram Pane ────────────────────────────────────────────────

function DiagramPane({
  rec,
  activeTable,
  onPickTable,
}: {
  rec: StarSchemaRecommendation;
  activeTable: string | null;
  onPickTable: (name: string) => void;
}) {
  const dims = rec.dimensions;
  const positions = useMemo(() => {
    const center = { x: 50, y: 50 };
    const radiusX = dims.length <= 2 ? 30 : 36;
    const radiusY = dims.length <= 2 ? 0 : 30;
    return dims.map((d, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / dims.length;
      return {
        dim: d,
        x: center.x + radiusX * Math.cos(angle),
        y: center.y + radiusY * Math.sin(angle),
      };
    });
  }, [dims]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h3 className="text-[13px] font-semibold text-gray-800">Schema Diagram</h3>
        <span
          className="px-2 py-0.5 rounded-md text-[10.5px] font-bold uppercase tracking-wider"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
        >
          Star Schema
        </span>
      </div>
      <div className="flex-1 relative px-6 pb-6 min-h-0 overflow-auto">
        <div
          className="relative w-full h-full min-h-[420px] rounded-xl border border-dashed border-gray-200 bg-gradient-to-br from-gray-50/50 to-white"
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {positions.map((p) => (
              <line
                key={p.dim.dimensionName}
                x1="50%"
                y1="50%"
                x2={`${p.x}%`}
                y2={`${p.y}%`}
                stroke="var(--accent-soft-active)"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            ))}
          </svg>

          {/* Fact table */}
          <FactCard
            rec={rec}
            active={activeTable === rec.factTable.name}
            onClick={() => onPickTable(rec.factTable.name)}
          />

          {/* Dimensions */}
          {positions.map((p) => (
            <DimCard
              key={p.dim.dimensionName}
              dim={p.dim}
              active={activeTable === p.dim.dimensionName}
              onClick={() => onPickTable(p.dim.dimensionName)}
              style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FactCard({
  rec,
  active,
  onClick,
}: {
  rec: StarSchemaRecommendation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-44 text-left rounded-xl shadow-md border-2 bg-white transition-all hover:shadow-lg ${
        active ? 'border-accent ring-4 ring-accent/15' : 'border-accent'
      }`}
    >
      <div
        className="px-3 py-1.5 rounded-t-[10px] text-white flex items-center gap-1.5"
        style={{ background: 'var(--accent)' }}
      >
        <span className="text-[9px] font-bold uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded">FACT</span>
        <span className="text-[12px] font-semibold truncate">{rec.factTable.name}</span>
      </div>
      <div className="px-3 py-2 space-y-1">
        {rec.factTable.foreignKeys.slice(0, 3).map((k) => (
          <div key={k} className="flex items-center gap-1.5 text-[10.5px] text-gray-600 truncate">
            <span className="px-1 py-px rounded bg-amber-50 text-amber-700 text-[8px] font-bold">FK</span>
            <span className="truncate">{k}</span>
          </div>
        ))}
        {rec.factTable.measures.slice(0, 3).map((m) => (
          <div key={m} className="flex items-center gap-1.5 text-[10.5px] text-gray-600 truncate">
            <span className="px-1 py-px rounded bg-emerald-50 text-emerald-700 text-[8px] font-bold">M</span>
            <span className="truncate">{m}</span>
          </div>
        ))}
        {rec.factTable.measures.length + rec.factTable.foreignKeys.length > 6 && (
          <div className="text-[10px] text-gray-400 pl-1">
            +{rec.factTable.measures.length + rec.factTable.foreignKeys.length - 6} more
          </div>
        )}
      </div>
    </button>
  );
}

function DimCard({
  dim,
  active,
  onClick,
  style,
}: {
  dim: DimensionRecommendation;
  active: boolean;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      style={style}
      className={`absolute w-40 text-left rounded-xl shadow-md border bg-white transition-all hover:shadow-lg ${
        active ? 'border-violet-400 ring-4 ring-violet-200/50' : 'border-violet-200'
      }`}
    >
      <div className="px-3 py-1.5 rounded-t-[10px] bg-violet-50 flex items-center gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wider bg-violet-200 text-violet-800 px-1.5 py-0.5 rounded">DIM</span>
        <span className="text-[11.5px] font-semibold text-violet-900 truncate">{dim.dimensionName}</span>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        {dim.columns.slice(0, 4).map((c) => (
          <div key={c} className="flex items-center gap-1.5 text-[10.5px] text-gray-600 truncate">
            {c === dim.primaryKey ? (
              <span className="px-1 py-px rounded bg-yellow-50 text-yellow-700 text-[8px] font-bold flex-shrink-0">PK</span>
            ) : (
              <span className="w-2 h-px bg-gray-300 flex-shrink-0" />
            )}
            <span className="truncate">{c}</span>
          </div>
        ))}
        {dim.columns.length > 4 && (
          <div className="text-[10px] text-gray-400 pl-1">+{dim.columns.length - 4} more</div>
        )}
      </div>
    </button>
  );
}
