import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Pie, Doughnut, Line } from 'react-chartjs-2';
import { GridLayout, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { api, TableInfo } from '../api';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#84cc16', '#e11d48', '#0ea5e9', '#d946ef', '#22c55e',
];

const COLOR_THEMES: { name: string; colors: string[] }[] = [
  { name: 'Default', colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'] },
  { name: 'Ocean', colors: ['#0ea5e9', '#06b6d4', '#14b8a6', '#0d9488', '#0891b2', '#0284c7', '#0369a1', '#155e75', '#164e63', '#1e3a5f'] },
  { name: 'Sunset', colors: ['#f97316', '#ef4444', '#ec4899', '#f59e0b', '#e11d48', '#f43f5e', '#fb923c', '#fbbf24', '#dc2626', '#db2777'] },
  { name: 'Forest', colors: ['#22c55e', '#16a34a', '#15803d', '#4ade80', '#86efac', '#065f46', '#10b981', '#059669', '#047857', '#166534'] },
  { name: 'Purple', colors: ['#8b5cf6', '#7c3aed', '#6d28d9', '#a78bfa', '#c4b5fd', '#6366f1', '#4f46e5', '#4338ca', '#d946ef', '#a855f7'] },
  { name: 'Pastel', colors: ['#93c5fd', '#86efac', '#fde68a', '#fca5a5', '#c4b5fd', '#fbcfe8', '#a5f3fc', '#fed7aa', '#99f6e4', '#a5b4fc'] },
  { name: 'Neon', colors: ['#00ff87', '#00d4ff', '#ff00e5', '#ffee00', '#ff6b00', '#00ffcc', '#7b61ff', '#ff3d71', '#00e5ff', '#b2ff59'] },
  { name: 'Earth', colors: ['#92400e', '#b45309', '#a16207', '#854d0e', '#78716c', '#6d4c41', '#8d6e63', '#a1887f', '#bcaaa4', '#d7ccc8'] },
  { name: 'Monochrome', colors: ['#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#111827', '#334155', '#475569', '#64748b'] },
];

const CHART_TYPES = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'pie', label: 'Pie' },
  { value: 'doughnut', label: 'Doughnut' },
] as const;

const AGGREGATIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Avg' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
] as const;

type ChartType = typeof CHART_TYPES[number]['value'];
type Aggregation = typeof AGGREGATIONS[number]['value'];

interface StyleConfig {
  bgColor: string;
  borderColor: string;
  titleColor: string;
  titleSize: number;
  chartColor: string;
  chartColors: string[];
  lineColor: string;
  gridColor: string;
  axisLabelColor: string;
  axisLabelSize: number;
  xAxisLabel: string;
  yAxisLabel: string;
  showLegend: boolean;
  legendPosition: 'top' | 'bottom' | 'left' | 'right';
  borderRadius: number;
}

const DEFAULT_STYLE: StyleConfig = {
  bgColor: '#ffffff',
  borderColor: '#e5e7eb',
  titleColor: '#1f2937',
  titleSize: 13,
  chartColor: '#3b82f6',
  chartColors: [...DEFAULT_COLORS],
  lineColor: '#3b82f6',
  gridColor: '#f3f4f6',
  axisLabelColor: '#6b7280',
  axisLabelSize: 11,
  xAxisLabel: '',
  yAxisLabel: '',
  showLegend: false,
  legendPosition: 'bottom',
  borderRadius: 12,
};

interface WidgetConfig {
  id: string;
  chartType: ChartType;
  tableId: string;
  labelColumn: string;
  valueColumn: string;
  aggregation: Aggregation;
  title: string;
  style: StyleConfig;
}

interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DashboardProps {
  tables: TableInfo[];
  onSelectTable: (id: string) => void;
  onImport: () => void;
}

function resolveValue(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if ('days' in obj && typeof obj.days === 'number') return obj.days;
    if ('micros' in obj) return Number(obj.micros) / 1e6;
  }
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function resolveLabel(v: unknown): string {
  if (v === null || v === undefined) return '(empty)';
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if ('days' in obj && typeof obj.days === 'number') return new Date(obj.days * 86400000).toISOString().slice(0, 10);
  }
  return String(v);
}

function aggregate(values: number[], agg: Aggregation): number {
  if (values.length === 0) return 0;
  switch (agg) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'count': return values.length;
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
  }
}

// ── Chart Type Icons ──

function BarIcon({ active }: { active?: boolean }) {
  return (<svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>);
}
function LineIcon({ active }: { active?: boolean }) {
  return (<svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>);
}
function PieIcon({ active }: { active?: boolean }) {
  return (<svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" /></svg>);
}
function DoughnutIcon({ active }: { active?: boolean }) {
  return (<svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>);
}

const CHART_ICON_MAP: Record<ChartType, (a: boolean) => JSX.Element> = {
  bar: (a) => <BarIcon active={a} />, line: (a) => <LineIcon active={a} />,
  pie: (a) => <PieIcon active={a} />, doughnut: (a) => <DoughnutIcon active={a} />,
};

// ── Color Input ──

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-gray-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-[68px] border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-600 font-mono" />
      </div>
    </div>
  );
}

// ── Chart Widget ──

function ChartWidget({ config, tables, onEdit, onDelete }: {
  config: WidgetConfig; tables: TableInfo[]; onEdit: () => void; onDelete: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getTableData(config.tableId, 1, 500).then((res) => {
      if (res.success && res.data) setData(res.data.rows);
      else setData([]);
    }).finally(() => setLoading(false));
  }, [config.tableId]);

  const s = config.style ?? DEFAULT_STYLE;

  const chartData = (() => {
    if (!data || data.length === 0) return null;
    const groups: Record<string, number[]> = {};
    for (const row of data) {
      const label = resolveLabel(row[config.labelColumn]);
      const val = resolveValue(row[config.valueColumn]);
      if (!groups[label]) groups[label] = [];
      if (val !== null) groups[label].push(val);
    }
    const entries = Object.entries(groups)
      .map(([label, vals]) => [label, aggregate(vals, config.aggregation)] as const)
      .sort((a, b) => b[1] - a[1]).slice(0, 25);
    const colors = s.chartColors.length > 0 ? s.chartColors : DEFAULT_COLORS;
    return {
      labels: entries.map(([l]) => l),
      datasets: [{
        label: `${config.aggregation.charAt(0).toUpperCase() + config.aggregation.slice(1)} of ${config.valueColumn}`,
        data: entries.map(([, v]) => Math.round(v * 100) / 100),
        backgroundColor: config.chartType === 'line' ? `${s.lineColor}20` : colors.slice(0, entries.length),
        borderColor: config.chartType === 'line' ? s.lineColor : config.chartType === 'bar' ? colors.slice(0, entries.length) : undefined,
        fill: config.chartType === 'line',
        borderWidth: config.chartType === 'line' ? 2 : 0,
        tension: 0.3,
      }],
    };
  })();

  const tableName = tables.find((t) => t.id === config.tableId)?.name ?? '';

  const axisOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: s.showLegend, position: s.legendPosition, labels: { font: { size: 10 } } },
      tooltip: { backgroundColor: '#1f2937', padding: 8, cornerRadius: 6 },
    },
    scales: {
      x: {
        title: { display: !!s.xAxisLabel, text: s.xAxisLabel, color: s.axisLabelColor, font: { size: s.axisLabelSize } },
        grid: { display: false },
        ticks: { font: { size: s.axisLabelSize - 1 }, color: s.axisLabelColor, maxRotation: 45 },
      },
      y: {
        title: { display: !!s.yAxisLabel, text: s.yAxisLabel, color: s.axisLabelColor, font: { size: s.axisLabelSize } },
        grid: { color: s.gridColor },
        ticks: { font: { size: s.axisLabelSize - 1 }, color: s.axisLabelColor },
      },
    },
  };
  const circOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: s.showLegend, position: s.legendPosition, labels: { boxWidth: 10, padding: 8, font: { size: 10 }, color: s.axisLabelColor } },
      tooltip: { backgroundColor: '#1f2937', padding: 8, cornerRadius: 6 },
    },
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: s.borderRadius }}
    >
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 drag-handle cursor-grab active:cursor-grabbing" style={{ borderBottom: `1px solid ${s.borderColor}` }}>
        <div className="min-w-0">
          <h3 className="font-semibold truncate" style={{ fontSize: s.titleSize, color: s.titleColor }}>{config.title}</h3>
          <p className="text-[10px] text-gray-400 truncate">{tableName} &middot; {config.aggregation}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onMouseDown={(e) => e.stopPropagation()} onClick={onEdit} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
          </button>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={onDelete} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className="flex-1 p-3 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
        ) : !chartData ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-400">No data</div>
        ) : config.chartType === 'bar' ? (
          <Bar data={chartData} options={axisOpts} />
        ) : config.chartType === 'line' ? (
          <Line data={chartData} options={axisOpts} />
        ) : config.chartType === 'pie' ? (
          <Pie data={chartData} options={circOpts} />
        ) : (
          <Doughnut data={chartData} options={circOpts} />
        )}
      </div>
    </div>
  );
}

// ── Toolbox Sections ──

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hover:bg-gray-50">
        {title}
        <svg className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="px-4 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

// ── Toolbox ──

function Toolbox({ tables, editing, onAdd, onUpdate, onCancelEdit }: {
  tables: TableInfo[];
  editing: WidgetConfig | null;
  onAdd: (cfg: WidgetConfig) => void;
  onUpdate: (cfg: WidgetConfig) => void;
  onCancelEdit: () => void;
}) {
  const [chartType, setChartType] = useState<ChartType>(editing?.chartType ?? 'bar');
  const [tableId, setTableId] = useState(editing?.tableId ?? (tables[0]?.id ?? ''));
  const [labelColumn, setLabelColumn] = useState(editing?.labelColumn ?? '');
  const [valueColumn, setValueColumn] = useState(editing?.valueColumn ?? '');
  const [aggregation, setAggregation] = useState<Aggregation>(editing?.aggregation ?? 'sum');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [style, setStyle] = useState<StyleConfig>(editing?.style ?? { ...DEFAULT_STYLE });

  useEffect(() => {
    if (editing) {
      setChartType(editing.chartType); setTableId(editing.tableId);
      setLabelColumn(editing.labelColumn); setValueColumn(editing.valueColumn);
      setAggregation(editing.aggregation); setTitle(editing.title);
      setStyle(editing.style ?? { ...DEFAULT_STYLE });
    }
  }, [editing]);

  const selectedTable = tables.find((t) => t.id === tableId);
  const columns = selectedTable?.columns ?? [];

  useEffect(() => {
    if (!editing && columns.length > 0) {
      const cat = columns.find((c) => c.type.toUpperCase() === 'VARCHAR');
      const num = columns.find((c) => ['INTEGER', 'DECIMAL', 'BIGINT', 'DOUBLE', 'FLOAT'].includes(c.type.toUpperCase()));
      setLabelColumn(cat?.name ?? columns[0].name);
      setValueColumn(num?.name ?? columns[0].name);
    }
  }, [tableId]);

  const updateStyle = (patch: Partial<StyleConfig>) => setStyle((s) => ({ ...s, ...patch }));
  const canSubmit = tableId && labelColumn && valueColumn;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const cfg: WidgetConfig = {
      id: editing?.id ?? crypto.randomUUID(),
      chartType, tableId, labelColumn, valueColumn, aggregation,
      title: title || `${valueColumn} by ${labelColumn}`,
      style,
    };
    editing ? onUpdate(cfg) : onAdd(cfg);
    if (!editing) setTitle('');
  };

  const isAxisChart = chartType === 'bar' || chartType === 'line';

  return (
    <div className="w-[270px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-[13px] font-semibold text-gray-800">{editing ? 'Edit Chart' : 'Chart Builder'}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Data section */}
        <Section title="Data">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Chart Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {CHART_TYPES.map((ct) => (
                <button key={ct.value} onClick={() => setChartType(ct.value)}
                  className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-[10px] transition-all ${
                    chartType === ct.value ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                  {CHART_ICON_MAP[ct.value](chartType === ct.value)}
                  {ct.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Data Source</label>
            <select value={tableId} onChange={(e) => { setTableId(e.target.value); setLabelColumn(''); setValueColumn(''); }}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
              {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">{isAxisChart ? 'X-Axis' : 'Category'}</label>
            <select value={labelColumn} onChange={(e) => setLabelColumn(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="">Select...</option>
              {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">{isAxisChart ? 'Y-Axis' : 'Value'}</label>
            <select value={valueColumn} onChange={(e) => setValueColumn(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="">Select...</option>
              {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Aggregation</label>
            <div className="flex gap-1">
              {AGGREGATIONS.map((a) => (
                <button key={a.value} onClick={() => setAggregation(a.value)}
                  className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${
                    aggregation === a.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Header */}
        <Section title="Header">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={valueColumn && labelColumn ? `${valueColumn} by ${labelColumn}` : 'Chart title...'}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <ColorInput label="Title Color" value={style.titleColor} onChange={(v) => updateStyle({ titleColor: v })} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Title Size</span>
            <input type="number" min={9} max={24} value={style.titleSize} onChange={(e) => updateStyle({ titleSize: Number(e.target.value) })}
              className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-600 text-center" />
          </div>
        </Section>

        {/* Colors */}
        <Section title="Colors">
          {/* Theme presets */}
          <div>
            <span className="block text-[11px] text-gray-500 mb-1.5">Theme</span>
            <div className="grid grid-cols-3 gap-1.5">
              {COLOR_THEMES.map((theme) => (
                <button
                  key={theme.name}
                  onClick={() => updateStyle({ chartColors: [...theme.colors], chartColor: theme.colors[0], lineColor: theme.colors[0] })}
                  className={`flex flex-col items-center gap-1 px-1.5 py-1.5 rounded border text-[10px] transition-all hover:border-blue-400 ${
                    style.chartColors[0] === theme.colors[0] && style.chartColors[1] === theme.colors[1]
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex gap-px">
                    {theme.colors.slice(0, 5).map((c, i) => (
                      <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  {theme.name}
                </button>
              ))}
            </div>
          </div>
          <ColorInput label="Background" value={style.bgColor} onChange={(v) => updateStyle({ bgColor: v })} />
          <ColorInput label="Border" value={style.borderColor} onChange={(v) => updateStyle({ borderColor: v })} />
          {chartType === 'line' ? (
            <ColorInput label="Line Color" value={style.lineColor} onChange={(v) => updateStyle({ lineColor: v })} />
          ) : (
            <div>
              <span className="block text-[11px] text-gray-500 mb-1.5">Chart Colors</span>
              <div className="flex flex-wrap gap-1">
                {style.chartColors.slice(0, 10).map((c, i) => (
                  <input key={i} type="color" value={c}
                    onChange={(e) => { const nc = [...style.chartColors]; nc[i] = e.target.value; updateStyle({ chartColors: nc }); }}
                    className="w-5 h-5 rounded border border-gray-200 cursor-pointer p-0" />
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Border Radius</span>
            <input type="number" min={0} max={24} value={style.borderRadius} onChange={(e) => updateStyle({ borderRadius: Number(e.target.value) })}
              className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-600 text-center" />
          </div>
        </Section>

        {/* Axis & Labels (only for bar/line) */}
        {isAxisChart && (
          <Section title="Axis Labels" defaultOpen={false}>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">X-Axis Label</label>
              <input value={style.xAxisLabel} onChange={(e) => updateStyle({ xAxisLabel: e.target.value })}
                placeholder="e.g. Category" className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Y-Axis Label</label>
              <input value={style.yAxisLabel} onChange={(e) => updateStyle({ yAxisLabel: e.target.value })}
                placeholder="e.g. Revenue ($)" className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <ColorInput label="Axis Text Color" value={style.axisLabelColor} onChange={(v) => updateStyle({ axisLabelColor: v })} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500">Axis Font Size</span>
              <input type="number" min={8} max={18} value={style.axisLabelSize} onChange={(e) => updateStyle({ axisLabelSize: Number(e.target.value) })}
                className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-600 text-center" />
            </div>
            <ColorInput label="Grid Color" value={style.gridColor} onChange={(v) => updateStyle({ gridColor: v })} />
          </Section>
        )}

        {/* Legend */}
        <Section title="Legend" defaultOpen={false}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Show Legend</span>
            <button onClick={() => updateStyle({ showLegend: !style.showLegend })}
              className={`w-8 h-[18px] rounded-full transition-colors relative ${style.showLegend ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <div className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-all ${style.showLegend ? 'left-[16px]' : 'left-[2px]'}`} />
            </button>
          </div>
          {style.showLegend && (
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Position</label>
              <div className="flex gap-1">
                {(['top', 'bottom', 'left', 'right'] as const).map((p) => (
                  <button key={p} onClick={() => updateStyle({ legendPosition: p })}
                    className={`flex-1 py-1 rounded text-[10px] font-medium capitalize transition-all ${
                      style.legendPosition === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-200 space-y-2 flex-shrink-0">
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-400 transition-colors">
          {editing ? 'Update Chart' : 'Add to Dashboard'}
        </button>
        {editing && (
          <button onClick={onCancelEdit} className="w-full px-3 py-1.5 rounded-lg text-[12px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            Cancel Editing
          </button>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ──

export default function Dashboard({ tables, onImport }: DashboardProps) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
    try { return JSON.parse(localStorage.getItem('dashboard_widgets') ?? '[]'); } catch { return []; }
  });
  const [layouts, setLayouts] = useState<Record<string, WidgetLayout>>(() => {
    try { return JSON.parse(localStorage.getItem('dashboard_layouts') ?? '{}'); } catch { return {}; }
  });
  const [editing, setEditing] = useState<WidgetConfig | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setCanvasWidth(e.contentRect.width);
    });
    ro.observe(el);
    setCanvasWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const save = useCallback((w: WidgetConfig[], l: Record<string, WidgetLayout>) => {
    setWidgets(w); setLayouts(l);
    localStorage.setItem('dashboard_widgets', JSON.stringify(w));
    localStorage.setItem('dashboard_layouts', JSON.stringify(l));
  }, []);

  const handleAdd = (cfg: WidgetConfig) => {
    const maxY = widgets.reduce((m, w) => {
      const ly = layouts[w.id];
      return ly ? Math.max(m, ly.y + ly.h) : m;
    }, 0);
    const newLayouts = { ...layouts, [cfg.id]: { x: 0, y: maxY, w: 6, h: 4 } };
    save([...widgets, cfg], newLayouts);
  };

  const handleUpdate = (cfg: WidgetConfig) => {
    save(widgets.map((w) => w.id === cfg.id ? cfg : w), layouts);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    const nl = { ...layouts }; delete nl[id];
    save(widgets.filter((w) => w.id !== id), nl);
    if (editing?.id === id) setEditing(null);
  };

  const handleLayoutChange = useCallback((layout: Layout) => {
    const nl: Record<string, WidgetLayout> = {};
    for (const l of layout) nl[l.i] = { x: l.x, y: l.y, w: l.w, h: l.h };
    setLayouts(nl);
    localStorage.setItem('dashboard_layouts', JSON.stringify(nl));
  }, []);

  const gridLayout = useMemo(() =>
    widgets.map((w, i) => {
      const l = layouts[w.id] ?? { x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 };
      return { i: w.id, x: l.x, y: l.y, w: l.w, h: l.h, minW: 3, minH: 3 };
    }),
  [widgets, layouts]);

  const emptyState = (title: string, desc: string, action?: JSX.Element) => (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-600 mb-1">{title}</h3>
        <p className="text-xs text-gray-400 mb-4">{desc}</p>
        {action}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex min-h-0">
      {/* Canvas */}
      <div ref={canvasRef} className="flex-1 overflow-auto bg-gray-50 min-w-0">
        {tables.length === 0 ? (
          emptyState('No data to visualize', 'Import data first to start building charts',
            <button onClick={onImport} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors">Import Data</button>
          )
        ) : widgets.length === 0 ? (
          emptyState('Your dashboard is empty', 'Configure a chart in the toolbox and click "Add to Dashboard"')
        ) : (
          <GridLayout
            className="p-4"
            layout={gridLayout}
            cols={12}
            rowHeight={60}
            width={canvasWidth - 32}
            draggableHandle=".drag-handle"
            onLayoutChange={handleLayoutChange}
            isResizable
            isDraggable
          >
            {widgets.map((w) => (
              <div key={w.id}>
                <ChartWidget
                  config={w}
                  tables={tables}
                  onEdit={() => setEditing(w)}
                  onDelete={() => handleDelete(w.id)}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {/* Right Sidebar Toolbox */}
      {tables.length > 0 && (
        <Toolbox tables={tables} editing={editing} onAdd={handleAdd} onUpdate={handleUpdate} onCancelEdit={() => setEditing(null)} />
      )}
    </div>
  );
}
