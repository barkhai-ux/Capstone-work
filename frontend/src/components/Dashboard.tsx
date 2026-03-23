import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Pie, Doughnut, Line } from 'react-chartjs-2';
import { GridLayout, type Layout } from 'react-grid-layout';
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
type WidgetType = 'chart' | 'text' | 'table';

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

const DATE_GROUPINGS = [
  { value: 'none', label: 'None' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

type DateGrouping = typeof DATE_GROUPINGS[number]['value'];

const TOP_N_OPTIONS = [
  { value: 0, label: 'All' },
  { value: 5, label: 'Top 5' },
  { value: 10, label: 'Top 10' },
  { value: 15, label: 'Top 15' },
  { value: 20, label: 'Top 20' },
  { value: 25, label: 'Top 25' },
] as const;

interface ChartWidgetConfig {
  id: string;
  widgetType: 'chart';
  chartType: ChartType;
  tableId: string;
  labelColumn: string;
  valueColumn: string;
  aggregation: Aggregation;
  topN: number;
  dateGrouping: DateGrouping;
  title: string;
  style: StyleConfig;
}

interface TextWidgetConfig {
  id: string;
  widgetType: 'text';
  title: string;
  content: string;
  style: StyleConfig;
}

interface TableWidgetConfig {
  id: string;
  widgetType: 'table';
  tableId: string;
  columns: string[];
  title: string;
  maxRows: number;
  style: StyleConfig;
}

type WidgetConfig = ChartWidgetConfig | TextWidgetConfig | TableWidgetConfig;

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

function resolveDateLabel(v: unknown, grouping: DateGrouping): string {
  let date: Date | null = null;
  if (v === null || v === undefined) return '(empty)';
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if ('days' in obj && typeof obj.days === 'number') date = new Date(obj.days * 86400000);
    else if ('micros' in obj && typeof obj.micros === 'number') date = new Date(Number(obj.micros) / 1000);
  }
  if (!date) {
    const parsed = new Date(String(v));
    if (!isNaN(parsed.getTime())) date = parsed;
  }
  if (!date) return String(v);

  switch (grouping) {
    case 'yearly': return String(date.getFullYear());
    case 'quarterly': return `${date.getFullYear()} Q${Math.floor(date.getMonth() / 3) + 1}`;
    case 'monthly': return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    default: return date.toISOString().slice(0, 10);
  }
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
  config: ChartWidgetConfig; tables: TableInfo[]; onEdit: () => void; onDelete: () => void;
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
    const dg = config.dateGrouping ?? 'none';
    const groups: Record<string, number[]> = {};
    for (const row of data) {
      const label = dg !== 'none' ? resolveDateLabel(row[config.labelColumn], dg) : resolveLabel(row[config.labelColumn]);
      const val = resolveValue(row[config.valueColumn]);
      if (!groups[label]) groups[label] = [];
      if (val !== null) groups[label].push(val);
    }
    const limit = config.topN ?? 0;
    const mapped = Object.entries(groups)
      .map(([label, vals]) => [label, aggregate(vals, config.aggregation)] as const);
    const sorted = dg !== 'none'
      ? mapped.sort((a, b) => a[0].localeCompare(b[0]))  // chronological for dates
      : mapped.sort((a, b) => b[1] - a[1]);               // by value for non-dates
    const entries = limit > 0 ? sorted.slice(0, limit) : sorted;
    const colors = s.chartColors.length > 0 ? s.chartColors : DEFAULT_COLORS;
    return {
      labels: entries.map(([l]) => l),
      datasets: [{
        label: `${config.aggregation.charAt(0).toUpperCase() + config.aggregation.slice(1)} of ${config.valueColumn}`,
        data: entries.map(([, v]) => Math.round(v * 100) / 100),
        backgroundColor: config.chartType === 'line' ? `${s.lineColor}18` : colors.slice(0, entries.length),
        borderColor: config.chartType === 'line' ? s.lineColor : config.chartType === 'bar' ? colors.slice(0, entries.length).map(c => c + 'cc') : colors.slice(0, entries.length),
        fill: config.chartType === 'line',
        borderWidth: config.chartType === 'line' ? 2.5 : (config.chartType === 'bar' ? 0 : 2),
        pointBackgroundColor: config.chartType === 'line' ? s.lineColor : undefined,
      }],
    };
  })();

  const tableName = tables.find((t) => t.id === config.tableId)?.name ?? '';

  const axisOpts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 600, easing: 'easeOutQuart' as const },
    plugins: {
      legend: { display: s.showLegend, position: s.legendPosition, labels: { font: { size: 10 }, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: { backgroundColor: '#1f2937', titleFont: { size: 11 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4 },
    },
    scales: {
      x: {
        title: { display: !!s.xAxisLabel, text: s.xAxisLabel, color: s.axisLabelColor, font: { size: s.axisLabelSize } },
        grid: { display: false },
        ticks: { font: { size: s.axisLabelSize - 1 }, color: s.axisLabelColor, maxRotation: 45 },
        border: { display: false },
      },
      y: {
        title: { display: !!s.yAxisLabel, text: s.yAxisLabel, color: s.axisLabelColor, font: { size: s.axisLabelSize } },
        grid: { color: s.gridColor, drawBorder: false },
        ticks: { font: { size: s.axisLabelSize - 1 }, color: s.axisLabelColor },
        border: { display: false },
      },
    },
    elements: {
      bar: { borderRadius: 4, borderSkipped: false as const },
      line: { tension: 0.35, borderWidth: 2.5 },
      point: { radius: 3, hoverRadius: 5, hitRadius: 8 },
    },
  };
  const circOpts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 600, easing: 'easeOutQuart' as const },
    plugins: {
      legend: { display: s.showLegend, position: s.legendPosition, labels: { boxWidth: 10, padding: 10, font: { size: 10 }, color: s.axisLabelColor, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: { backgroundColor: '#1f2937', titleFont: { size: 11 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4 },
    },
    elements: {
      arc: { borderWidth: 2, borderColor: s.bgColor },
    },
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden group shadow-sm hover:shadow-md transition-shadow"
      style={{ background: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: s.borderRadius }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 drag-handle cursor-grab active:cursor-grabbing">
        <div className="min-w-0">
          <h3 className="font-semibold truncate leading-tight" style={{ fontSize: s.titleSize, color: s.titleColor }}>{config.title}</h3>
          <p className="text-[10px] text-gray-400 truncate mt-0.5">{tableName} &middot; {config.aggregation}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onMouseDown={(e) => e.stopPropagation()} onClick={onEdit} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
          </button>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={onDelete} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className="flex-1 px-3 pb-3 pt-1 min-h-0">
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

// ── Text Widget ──

function TextWidget({ config, onDelete, onUpdate }: {
  config: TextWidgetConfig; onDelete: () => void; onUpdate: (cfg: TextWidgetConfig) => void;
}) {
  const s = config.style ?? DEFAULT_STYLE;
  return (
    <div className="h-full flex flex-col overflow-hidden group" style={{ background: s.bgColor, borderRadius: s.borderRadius }}>
      {/* Invisible drag handle at the top */}
      <div className="drag-handle cursor-grab active:cursor-grabbing h-3 flex-shrink-0 flex justify-end items-start pt-1 pr-1">
        <button onMouseDown={(e) => e.stopPropagation()} onClick={onDelete}
          className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <textarea
        value={config.content}
        onChange={(e) => onUpdate({ ...config, content: e.target.value })}
        placeholder="Click to type..."
        className="flex-1 w-full px-4 pb-3 text-[13px] leading-relaxed resize-none bg-transparent focus:outline-none"
        style={{ color: s.axisLabelColor }}
      />
    </div>
  );
}

// ── Table Widget ──

function DataTableWidget({ config, onDelete, onUpdate }: {
  config: TableWidgetConfig; onDelete: () => void; onUpdate: (cfg: TableWidgetConfig) => void;
}) {
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const s = config.style ?? DEFAULT_STYLE;

  useEffect(() => {
    if (!config.tableId || config.columns.length === 0) { setData(null); setLoading(false); return; }
    setLoading(true);
    api.getTableData(config.tableId, 1, config.maxRows || 50).then((res) => {
      if (res.success && res.data) setData(res.data.rows);
      else setData([]);
    }).finally(() => setLoading(false));
  }, [config.tableId, config.columns.length, config.maxRows]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const colData = e.dataTransfer.getData('application/column');
    if (!colData) return;
    try {
      const { tableId: srcTable, columnName } = JSON.parse(colData);
      if (config.columns.includes(columnName) && config.tableId === srcTable) return;
      const newTableId = config.tableId || srcTable;
      if (config.tableId && config.tableId !== srcTable) return; // different table
      onUpdate({ ...config, tableId: newTableId, columns: [...config.columns, columnName] });
    } catch { /* ignore */ }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };

  const removeColumn = (col: string) => {
    onUpdate({ ...config, columns: config.columns.filter((c) => c !== col) });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden group shadow-sm hover:shadow-md transition-shadow"
      style={{ background: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: s.borderRadius }}
      onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 drag-handle cursor-grab active:cursor-grabbing">
        <div className="min-w-0">
          <h3 className="font-semibold truncate leading-tight" style={{ fontSize: s.titleSize, color: s.titleColor }}>{config.title || 'Table'}</h3>
          {config.columns.length > 0 && (
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{data?.length ?? 0} rows</p>
          )}
        </div>
        <button onMouseDown={(e) => e.stopPropagation()} onClick={onDelete}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      {config.columns.length === 0 ? (
        <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-200 m-3 rounded-lg">
          <div className="text-center px-4">
            <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375" />
            </svg>
            <p className="text-[11px] text-gray-400">Drag columns here from the sidebar</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="h-full flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
          ) : !data || data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-400">No data</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0" style={{ background: s.bgColor }}>
                <tr>
                  {config.columns.map((col) => (
                    <th key={col} className="px-2 py-1.5 text-left font-semibold border-b group/th" style={{ color: s.titleColor, borderColor: s.borderColor }}>
                      <span className="flex items-center gap-1">
                        {col}
                        <button onClick={() => removeColumn(col)} className="opacity-0 group-hover/th:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50/50">
                    {config.columns.map((col) => (
                      <td key={col} className="px-2 py-1 border-b truncate max-w-[150px]" style={{ color: s.axisLabelColor, borderColor: s.borderColor }}>
                        {resolveLabel(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
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

function Toolbox({ tables, editing, onAdd, onAddMultiple, onUpdate, onCancelEdit }: {
  tables: TableInfo[];
  editing: WidgetConfig | null;
  onAdd: (cfg: WidgetConfig) => void;
  onAddMultiple: (cfgs: WidgetConfig[]) => void;
  onUpdate: (cfg: WidgetConfig) => void;
  onCancelEdit: () => void;
}) {
  const editingType: WidgetType = editing?.widgetType ?? 'chart';
  const [widgetType, setWidgetType] = useState<WidgetType>(editingType);

  // AI prompt state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiMode, setAiMode] = useState<'chart' | 'dashboard'>('chart');

  const parseChartWidget = (d: Record<string, unknown>): ChartWidgetConfig => ({
    id: crypto.randomUUID(),
    widgetType: 'chart',
    chartType: (d.chartType as ChartType) ?? 'bar',
    tableId: (d.tableId as string) ?? tables[0]?.id ?? '',
    labelColumn: (d.labelColumn as string) ?? '',
    valueColumn: (d.valueColumn as string) ?? '',
    aggregation: (d.aggregation as Aggregation) ?? 'sum',
    topN: typeof d.topN === 'number' ? d.topN : 0,
    dateGrouping: (d.dateGrouping as DateGrouping) ?? 'none',
    title: (d.title as string) ?? '',
    style: { ...DEFAULT_STYLE, ...((d.style as Partial<StyleConfig>) ?? {}) },
  });

  const parseTextWidget = (d: Record<string, unknown>): TextWidgetConfig => ({
    id: crypto.randomUUID(),
    widgetType: 'text',
    title: (d.title as string) ?? 'Insight',
    content: (d.content as string) ?? '',
    style: { ...DEFAULT_STYLE, ...((d.style as Partial<StyleConfig>) ?? {}) },
  });

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError('');
    try {
      if (aiMode === 'dashboard') {
        const res = await api.generateDashboard(aiPrompt.trim());
        if (res.success && res.data?.widgets) {
          const cfgs: WidgetConfig[] = res.data.widgets.map((d) => {
            if (d.widgetType === 'text') return parseTextWidget(d);
            return parseChartWidget(d);
          });
          onAddMultiple(cfgs);
          setAiPrompt('');
        } else {
          setAiError(res.error ?? 'Failed to generate dashboard');
        }
      } else {
        const res = await api.generateChart(aiPrompt.trim());
        if (res.success && res.data) {
          onAdd(parseChartWidget(res.data as Record<string, unknown>));
          setAiPrompt('');
        } else {
          setAiError(res.error ?? 'Failed to generate chart');
        }
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setAiLoading(false);
    }
  };

  // Chart state
  const [chartType, setChartType] = useState<ChartType>(editing?.widgetType === 'chart' ? editing.chartType : 'bar');
  const [tableId, setTableId] = useState(
    editing?.widgetType === 'chart' ? editing.tableId : editing?.widgetType === 'table' ? editing.tableId : (tables[0]?.id ?? '')
  );
  const [labelColumn, setLabelColumn] = useState(editing?.widgetType === 'chart' ? editing.labelColumn : '');
  const [valueColumn, setValueColumn] = useState(editing?.widgetType === 'chart' ? editing.valueColumn : '');
  const [aggregation, setAggregation] = useState<Aggregation>(editing?.widgetType === 'chart' ? editing.aggregation : 'sum');
  const [topN, setTopN] = useState<number>(editing?.widgetType === 'chart' ? (editing.topN ?? 0) : 0);
  const [dateGrouping, setDateGrouping] = useState<DateGrouping>(editing?.widgetType === 'chart' ? (editing.dateGrouping ?? 'none') : 'none');

  // Text state
  const [textContent, setTextContent] = useState(editing?.widgetType === 'text' ? editing.content : '');

  // Table state
  const [maxRows, setMaxRows] = useState(editing?.widgetType === 'table' ? editing.maxRows : 50);

  // Common state
  const [title, setTitle] = useState(editing?.title ?? '');
  const [style, setStyle] = useState<StyleConfig>(editing?.style ?? { ...DEFAULT_STYLE });

  useEffect(() => {
    if (editing) {
      setWidgetType(editing.widgetType ?? 'chart');
      setTitle(editing.title);
      setStyle(editing.style ?? { ...DEFAULT_STYLE });
      if (editing.widgetType === 'chart') {
        setChartType(editing.chartType); setTableId(editing.tableId);
        setLabelColumn(editing.labelColumn); setValueColumn(editing.valueColumn);
        setAggregation(editing.aggregation);
        setTopN(editing.topN ?? 0);
        setDateGrouping(editing.dateGrouping ?? 'none');
      } else if (editing.widgetType === 'text') {
        setTextContent(editing.content);
      } else if (editing.widgetType === 'table') {
        setTableId(editing.tableId);
        setMaxRows(editing.maxRows);
      }
    }
  }, [editing]);

  const selectedTable = tables.find((t) => t.id === tableId);
  const columns = selectedTable?.columns ?? [];

  useEffect(() => {
    if (!editing && columns.length > 0 && widgetType === 'chart') {
      const cat = columns.find((c) => c.type.toUpperCase() === 'VARCHAR');
      const num = columns.find((c) => ['INTEGER', 'DECIMAL', 'BIGINT', 'DOUBLE', 'FLOAT'].includes(c.type.toUpperCase()));
      setLabelColumn(cat?.name ?? columns[0].name);
      setValueColumn(num?.name ?? columns[0].name);
    }
  }, [tableId]);

  const updateStyle = (patch: Partial<StyleConfig>) => setStyle((s) => ({ ...s, ...patch }));

  const canSubmit = widgetType === 'text'
    ? true
    : widgetType === 'table'
    ? true
    : !!(tableId && labelColumn && valueColumn);

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (widgetType === 'chart') {
      const cfg: ChartWidgetConfig = {
        id: editing?.id ?? crypto.randomUUID(),
        widgetType: 'chart',
        chartType, tableId, labelColumn, valueColumn, aggregation, topN, dateGrouping,
        title: title || `${valueColumn} by ${labelColumn}`,
        style,
      };
      editing ? onUpdate(cfg) : onAdd(cfg);
    } else if (widgetType === 'text') {
      const cfg: TextWidgetConfig = {
        id: editing?.id ?? crypto.randomUUID(),
        widgetType: 'text',
        title: title || 'Text',
        content: textContent,
        style,
      };
      editing ? onUpdate(cfg) : onAdd(cfg);
    } else {
      const cfg: TableWidgetConfig = {
        id: editing?.id ?? crypto.randomUUID(),
        widgetType: 'table',
        tableId: '',
        columns: [],
        title: title || 'Table',
        maxRows,
        style,
      };
      editing ? onUpdate(cfg) : onAdd(cfg);
    }
    if (!editing) { setTitle(''); setTextContent(''); }
  };

  const isAxisChart = chartType === 'bar' || chartType === 'line';


  return (
    <div className="w-[270px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-[13px] font-semibold text-gray-800 mb-2">{editing ? 'Edit Widget' : 'Widget Builder'}</h2>
        {!editing && (
          <div className="flex gap-1">
            {([
              { type: 'chart' as WidgetType, label: 'Chart', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z' },
              { type: 'text' as WidgetType, label: 'Text', icon: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12' },
              { type: 'table' as WidgetType, label: 'Table', icon: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375' },
            ]).map(({ type, label, icon }) => (
              <button key={type} onClick={() => setWidgetType(type)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-medium transition-all ${
                  widgetType === type ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI Generation */}
      {!editing && (
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3.5 h-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            <span className="text-[11px] font-semibold text-purple-600 uppercase tracking-wider">AI Generate</span>
          </div>
          <div className="flex gap-1 mb-2">
            <button onClick={() => setAiMode('chart')}
              className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${
                aiMode === 'chart' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              Single Chart
            </button>
            <button onClick={() => setAiMode('dashboard')}
              className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${
                aiMode === 'dashboard' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              Full Dashboard
            </button>
          </div>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiGenerate(); } }}
            placeholder={aiMode === 'dashboard'
              ? 'e.g. Create a sales performance dashboard with dark blue theme'
              : 'e.g. Red bar chart showing top 10 customers by revenue'}
            rows={2}
            disabled={aiLoading}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400 resize-none placeholder:text-gray-300 disabled:opacity-50"
          />
          {aiError && <p className="text-[10px] text-red-500 mt-1">{aiError}</p>}
          <button
            onClick={handleAiGenerate}
            disabled={!aiPrompt.trim() || aiLoading}
            className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:text-gray-400 transition-colors"
          >
            {aiLoading ? (
              <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
            ) : (
              <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg> {aiMode === 'dashboard' ? 'Generate Dashboard' : 'Generate Chart'}</>
            )}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ── Chart Builder ── */}
        {widgetType === 'chart' && (
          <>
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
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Show</label>
                <div className="flex gap-1">
                  {TOP_N_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => setTopN(opt.value)}
                      className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${
                        topN === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {(() => {
                const selCol = columns.find((c) => c.name === labelColumn);
                const isDate = selCol && ['DATE', 'TIMESTAMP'].includes(selCol.type.toUpperCase());
                return isDate ? (
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Date Grouping</label>
                    <div className="flex gap-1">
                      {DATE_GROUPINGS.map((dg) => (
                        <button key={dg.value} onClick={() => setDateGrouping(dg.value)}
                          className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${
                            dateGrouping === dg.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {dg.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </Section>

            <Section title="Colors">
              <div>
                <span className="block text-[11px] text-gray-500 mb-1.5">Theme</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {COLOR_THEMES.map((theme) => (
                    <button key={theme.name}
                      onClick={() => updateStyle({ chartColors: [...theme.colors], chartColor: theme.colors[0], lineColor: theme.colors[0] })}
                      className={`flex flex-col items-center gap-1 px-1.5 py-1.5 rounded border text-[10px] transition-all hover:border-blue-400 ${
                        style.chartColors[0] === theme.colors[0] && style.chartColors[1] === theme.colors[1]
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}>
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
            </Section>

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
          </>
        )}

        {/* ── Text Builder ── */}
        {widgetType === 'text' && (
          <>
            <Section title="Content">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Text Content</label>
                <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Type your conclusion, notes, or analysis..."
                  rows={8}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
              </div>
            </Section>
          </>
        )}

        {/* ── Table Builder ── */}
        {widgetType === 'table' && (
          <>
            <Section title="Instructions">
              <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
                <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Add a blank table to the dashboard, then expand a table in the sidebar and <strong>drag columns</strong> onto it.
                </p>
              </div>
            </Section>
            <Section title="Settings">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Max Rows</span>
                <input type="number" min={5} max={500} value={maxRows} onChange={(e) => setMaxRows(Number(e.target.value))}
                  className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-600 text-center" />
              </div>
            </Section>
          </>
        )}

        {/* Common style sections */}
        <Section title="Header">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={widgetType === 'chart' && valueColumn && labelColumn ? `${valueColumn} by ${labelColumn}` : widgetType === 'text' ? 'Text' : selectedTable?.name ?? 'Title...'}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <ColorInput label="Title Color" value={style.titleColor} onChange={(v) => updateStyle({ titleColor: v })} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Title Size</span>
            <input type="number" min={9} max={24} value={style.titleSize} onChange={(e) => updateStyle({ titleSize: Number(e.target.value) })}
              className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-600 text-center" />
          </div>
        </Section>

        <Section title="Appearance" defaultOpen={false}>
          <ColorInput label="Background" value={style.bgColor} onChange={(v) => updateStyle({ bgColor: v })} />
          <ColorInput label="Border" value={style.borderColor} onChange={(v) => updateStyle({ borderColor: v })} />
          {widgetType === 'text' && (
            <ColorInput label="Text Color" value={style.axisLabelColor} onChange={(v) => updateStyle({ axisLabelColor: v })} />
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Border Radius</span>
            <input type="number" min={0} max={24} value={style.borderRadius} onChange={(e) => updateStyle({ borderRadius: Number(e.target.value) })}
              className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-600 text-center" />
          </div>
        </Section>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-200 space-y-2 flex-shrink-0">
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-400 transition-colors">
          {editing ? 'Update Widget' : 'Add to Dashboard'}
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
    const wt = cfg.widgetType ?? 'chart';
    const size = wt === 'text' ? { w: 3, h: 2 } : wt === 'table' ? { w: 6, h: 4 } : { w: 6, h: 4 };
    const newLayouts = { ...layouts, [cfg.id]: { x: 0, y: maxY, ...size } };
    save([...widgets, cfg], newLayouts);
  };

  const handleAddMultiple = (cfgs: WidgetConfig[]) => {
    let currentMaxY = widgets.reduce((m, w) => {
      const ly = layouts[w.id];
      return ly ? Math.max(m, ly.y + ly.h) : m;
    }, 0);
    const newLayouts = { ...layouts };
    let col = 0;
    for (const cfg of cfgs) {
      const wt = cfg.widgetType ?? 'chart';
      const size = wt === 'text' ? { w: 4, h: 2 } : { w: 6, h: 4 };
      newLayouts[cfg.id] = { x: col, y: currentMaxY, ...size };
      col += size.w;
      if (col >= 12) { col = 0; currentMaxY += size.h; }
    }
    save([...widgets, ...cfgs], newLayouts);
  };

  const handleUpdate = (cfg: WidgetConfig) => {
    save(widgets.map((w) => w.id === cfg.id ? cfg : w), layouts);
    setEditing(null);
  };

  const handleInlineUpdate = useCallback((cfg: WidgetConfig) => {
    setWidgets((prev) => {
      const next = prev.map((w) => w.id === cfg.id ? cfg : w);
      localStorage.setItem('dashboard_widgets', JSON.stringify(next));
      return next;
    });
  }, []);

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
      const wt = w.widgetType ?? 'chart';
      const defaultL = wt === 'text'
        ? { x: (i % 4) * 3, y: Math.floor(i / 4) * 2, w: 3, h: 2 }
        : { x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 };
      const l = layouts[w.id] ?? defaultL;
      const min = wt === 'text' ? { minW: 2, minH: 1 } : { minW: 3, minH: 3 };
      return { i: w.id, x: l.x, y: l.y, w: l.w, h: l.h, ...min };
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
            gridConfig={{ cols: 12, rowHeight: 60 }}
            dragConfig={{ enabled: true, handle: '.drag-handle' }}
            resizeConfig={{ enabled: true }}
            width={canvasWidth - 32}
            onLayoutChange={handleLayoutChange}
          >
            {widgets.map((w) => (
              <div key={w.id}>
                {(w.widgetType ?? 'chart') === 'chart' ? (
                  <ChartWidget config={w as ChartWidgetConfig} tables={tables} onEdit={() => setEditing(w)} onDelete={() => handleDelete(w.id)} />
                ) : w.widgetType === 'text' ? (
                  <TextWidget config={w as TextWidgetConfig} onDelete={() => handleDelete(w.id)} onUpdate={(c) => handleInlineUpdate(c)} />
                ) : (
                  <DataTableWidget config={w as TableWidgetConfig} onDelete={() => handleDelete(w.id)} onUpdate={(c) => handleInlineUpdate(c)} />
                )}
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {/* Right Sidebar Toolbox */}
      {tables.length > 0 && (
        <Toolbox tables={tables} editing={editing} onAdd={handleAdd} onAddMultiple={handleAddMultiple} onUpdate={handleUpdate} onCancelEdit={() => setEditing(null)} />
      )}
    </div>
  );
}
