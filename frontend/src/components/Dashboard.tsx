import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
  RadialLinearScale,
} from 'chart.js';
import { Bar, Pie, Doughnut, Line, Scatter, Radar, PolarArea } from 'react-chartjs-2';
import { GridLayout, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { api, TableInfo } from '../api';
import ConfirmDialog from './ConfirmDialog';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, RadialLinearScale, Title, Tooltip, Legend, Filler);

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
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'doughnut', label: 'Doughnut' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'radar', label: 'Radar' },
  { value: 'polarArea', label: 'Polar' },
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
  tableIds: string[];
  /** @deprecated kept for backward compat with old saved configs */
  tableId?: string;
  labelColumn: string;
  valueColumn: string;
  aggregation: Aggregation;
  topN: number;
  dateGrouping: DateGrouping;
  title: string;
  style: StyleConfig;
}

/** Resolve tableIds from config, handling legacy single tableId */
function getTableIds(config: ChartWidgetConfig): string[] {
  if (config.tableIds && config.tableIds.length > 0) return config.tableIds;
  if (config.tableId) return [config.tableId];
  return [];
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
  onImport: () => void;
}

// ── Multi-dashboard persistence ──

interface DashboardInstance {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  layouts: Record<string, WidgetLayout>;
  createdAt: string;
}

const DASHBOARDS_KEY = 'dashboard_instances';

function loadDashboards(): DashboardInstance[] {
  try {
    const raw = localStorage.getItem(DASHBOARDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDashboards(dashboards: DashboardInstance[]) {
  localStorage.setItem(DASHBOARDS_KEY, JSON.stringify(dashboards));
}

function migrateIfNeeded(): DashboardInstance[] {
  const existing = loadDashboards();
  if (existing.length > 0) return existing;

  let legacyWidgets: WidgetConfig[] = [];
  let legacyLayouts: Record<string, WidgetLayout> = {};
  try {
    legacyWidgets = JSON.parse(localStorage.getItem('dashboard_widgets') ?? '[]');
    legacyLayouts = JSON.parse(localStorage.getItem('dashboard_layouts') ?? '{}');
  } catch { /* ignore */ }

  if (legacyWidgets.length === 0) return [];

  const migrated: DashboardInstance = {
    id: crypto.randomUUID(),
    name: 'My Dashboard',
    widgets: legacyWidgets,
    layouts: legacyLayouts,
    createdAt: new Date().toISOString(),
  };

  const dashboards = [migrated];
  saveDashboards(dashboards);
  localStorage.removeItem('dashboard_widgets');
  localStorage.removeItem('dashboard_layouts');

  return dashboards;
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
function AreaIcon({ active }: { active?: boolean }) {
  return (<svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18h19.5V11.25L16.12 14.07a11.95 11.95 0 00-2.814-1.263L9 11.25 2.25 18z" opacity={0.3} /></svg>);
}
function ScatterIcon({ active }: { active?: boolean }) {
  return (<svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="16" r="1.5" /><circle cx="9" cy="10" r="1.5" /><circle cx="14" cy="14" r="1.5" /><circle cx="11" cy="6" r="1.5" /><circle cx="18" cy="8" r="1.5" /><circle cx="17" cy="17" r="1.5" /><circle cx="7" cy="19" r="1.5" /></svg>);
}
function RadarIcon({ active }: { active?: boolean }) {
  return (<svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><polygon points="12,2 20,8.5 17.5,18 6.5,18 4,8.5" /><polygon points="12,7 16,10.5 14.5,15 9.5,15 8,10.5" /></svg>);
}
function PolarIcon({ active }: { active?: boolean }) {
  return (<svg className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="9" /><line x1="12" y1="3" x2="12" y2="21" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="5.5" y1="5.5" x2="18.5" y2="18.5" /><line x1="18.5" y1="5.5" x2="5.5" y2="18.5" /></svg>);
}

const CHART_ICON_MAP: Record<ChartType, (a: boolean) => JSX.Element> = {
  bar: (a) => <BarIcon active={a} />, line: (a) => <LineIcon active={a} />,
  area: (a) => <AreaIcon active={a} />, pie: (a) => <PieIcon active={a} />,
  doughnut: (a) => <DoughnutIcon active={a} />, scatter: (a) => <ScatterIcon active={a} />,
  radar: (a) => <RadarIcon active={a} />, polarArea: (a) => <PolarIcon active={a} />,
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
  const draggedRef = useRef(false);
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialData, setPartialData] = useState(false);

  const ids = getTableIds(config);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPartialData(false);

    // Check for column type conflicts across selected tables
    if (ids.length > 1) {
      const colTypes = new Map<string, string>();
      for (const id of ids) {
        const t = tables.find((tb) => tb.id === id);
        if (!t) continue;
        for (const c of t.columns) {
          const existing = colTypes.get(c.name);
          if (existing && existing.toUpperCase() !== c.type.toUpperCase()) {
            setError(`Column "${c.name}" has conflicting types across tables`);
            setLoading(false);
            return;
          }
          colTypes.set(c.name, c.type);
        }
      }
    }

    Promise.all(ids.map((id) => api.getTableData(id, 1, 500)))
      .then((results) => {
        const merged: Record<string, unknown>[] = [];
        let capped = false;
        for (const res of results) {
          if (res.success && res.data) {
            merged.push(...res.data.rows);
            if (res.data.pagination && res.data.pagination.totalRows > 500) capped = true;
          }
        }
        setPartialData(capped);
        setData(merged);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [ids.join(',')]);

  const s = config.style ?? DEFAULT_STYLE;

  const isLineOrArea = config.chartType === 'line' || config.chartType === 'area';

  const chartData = (() => {
    if (!data || data.length === 0) return null;

    // Scatter chart: raw x/y points, no grouping
    if (config.chartType === 'scatter') {
      const points: { x: number; y: number }[] = [];
      for (const row of data) {
        const x = resolveValue(row[config.labelColumn]);
        const y = resolveValue(row[config.valueColumn]);
        if (x !== null && y !== null) points.push({ x, y });
      }
      const limit = config.topN ?? 0;
      const sliced = limit > 0 ? points.slice(0, limit) : points;
      const colors = s.chartColors.length > 0 ? s.chartColors : DEFAULT_COLORS;
      return {
        datasets: [{
          label: `${config.labelColumn} vs ${config.valueColumn}`,
          data: sliced,
          backgroundColor: colors[0] + '99',
          borderColor: colors[0],
          pointBackgroundColor: colors[0],
          pointRadius: 4,
          pointHoverRadius: 6,
        }],
      };
    }

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
      ? mapped.sort((a, b) => a[0].localeCompare(b[0]))
      : mapped.sort((a, b) => b[1] - a[1]);
    const entries = limit > 0 ? sorted.slice(0, limit) : sorted;
    const colors = s.chartColors.length > 0 ? s.chartColors : DEFAULT_COLORS;
    return {
      labels: entries.map(([l]) => l),
      datasets: [{
        label: `${config.aggregation.charAt(0).toUpperCase() + config.aggregation.slice(1)} of ${config.valueColumn}`,
        data: entries.map(([, v]) => Math.round(v * 100) / 100),
        backgroundColor: isLineOrArea ? `${s.lineColor}18` : config.chartType === 'radar' ? `${colors[0]}33` : colors.slice(0, entries.length),
        borderColor: isLineOrArea ? s.lineColor : config.chartType === 'radar' ? colors[0] : config.chartType === 'bar' ? colors.slice(0, entries.length).map(c => c + 'cc') : colors.slice(0, entries.length),
        fill: isLineOrArea || config.chartType === 'radar',
        borderWidth: isLineOrArea ? 2.5 : config.chartType === 'radar' ? 2 : (config.chartType === 'bar' ? 0 : 2),
        pointBackgroundColor: isLineOrArea || config.chartType === 'radar' ? s.lineColor : undefined,
        pointRadius: config.chartType === 'radar' ? 3 : undefined,
      }],
    };
  })() as any;

  const tableName = ids.map((id) => tables.find((t) => t.id === id)?.name).filter(Boolean).join(', ') || '';

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
        ticks: {
          font: { size: s.axisLabelSize - 1 },
          color: s.axisLabelColor,
          maxRotation: 45,
          callback: function(this: unknown, _val: unknown, index: number) {
            const label = chartData?.labels?.[index];
            const str = typeof label === 'string' ? label : String(label ?? '');
            return str.length > 16 ? str.slice(0, 16) + '...' : str;
          },
        },
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
  const radarOpts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 600, easing: 'easeOutQuart' as const },
    plugins: {
      legend: { display: s.showLegend, position: s.legendPosition, labels: { font: { size: 10 }, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: { backgroundColor: '#1f2937', titleFont: { size: 11 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4 },
    },
    scales: {
      r: {
        grid: { color: s.gridColor },
        pointLabels: { font: { size: s.axisLabelSize }, color: s.axisLabelColor },
        ticks: { font: { size: s.axisLabelSize - 1 }, color: s.axisLabelColor, backdropColor: 'transparent' },
      },
    },
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden group shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      style={{ background: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: s.borderRadius }}
      onMouseDown={() => { draggedRef.current = false; }}
      onMouseMove={() => { draggedRef.current = true; }}
      onClick={() => { if (!draggedRef.current) onEdit(); }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 drag-handle cursor-grab active:cursor-grabbing">
        <div className="min-w-0">
          <h3 className="font-semibold truncate leading-tight" style={{ fontSize: s.titleSize, color: s.titleColor }}>{config.title}</h3>
          <p className="text-[10px] text-gray-400 truncate mt-0.5">{tableName} &middot; {config.aggregation}{partialData ? ' (first 500 rows)' : ''}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete widget" className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className="flex-1 px-3 pb-3 pt-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-xs text-red-500 px-2 text-center">{error}</div>
        ) : !chartData ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-400">No data</div>
        ) : config.chartType === 'bar' ? (
          <Bar data={chartData} options={axisOpts} />
        ) : config.chartType === 'line' || config.chartType === 'area' ? (
          <Line data={chartData} options={axisOpts} />
        ) : config.chartType === 'scatter' ? (
          <Scatter data={chartData} options={axisOpts} />
        ) : config.chartType === 'radar' ? (
          <Radar data={chartData} options={radarOpts} />
        ) : config.chartType === 'polarArea' ? (
          <PolarArea data={chartData} options={circOpts} />
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

function TextWidget({ config, onEdit, onDelete, onUpdate }: {
  config: TextWidgetConfig; onEdit: () => void; onDelete: () => void; onUpdate: (cfg: TextWidgetConfig) => void;
}) {
  const s = config.style ?? DEFAULT_STYLE;
  return (
    <div className="h-full flex flex-col overflow-hidden group shadow-sm hover:shadow-md transition-shadow" style={{ background: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: s.borderRadius }}>
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 drag-handle cursor-grab active:cursor-grabbing">
        <h3 className="font-semibold truncate leading-tight cursor-pointer hover:text-blue-600 transition-colors" style={{ fontSize: s.titleSize, color: s.titleColor }} onMouseDown={(e) => e.stopPropagation()} onClick={onEdit}>{config.title || 'Text'}</h3>
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onMouseDown={(e) => e.stopPropagation()} onClick={onDelete} aria-label="Delete widget"
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
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

function DataTableWidget({ config, onEdit, onDelete, onUpdate }: {
  config: TableWidgetConfig; onEdit: () => void; onDelete: () => void; onUpdate: (cfg: TableWidgetConfig) => void;
}) {
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const s = config.style ?? DEFAULT_STYLE;
  const draggedRef = useRef(false);

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
    <div className="h-full flex flex-col overflow-hidden group shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      style={{ background: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: s.borderRadius }}
      onDrop={handleDrop} onDragOver={handleDragOver}
      onMouseDown={() => { draggedRef.current = false; }}
      onMouseMove={() => { draggedRef.current = true; }}
      onClick={() => { if (!draggedRef.current) onEdit(); }}>
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 drag-handle cursor-grab active:cursor-grabbing">
        <div className="min-w-0">
          <h3 className="font-semibold truncate leading-tight" style={{ fontSize: s.titleSize, color: s.titleColor }}>{config.title || 'Table'}</h3>
          {config.columns.length > 0 && (
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{data?.length ?? 0} rows</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete widget"
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
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

// ── Preview Cache (in-memory, session-scoped) ──

const previewTableCache = new Map<string, Record<string, unknown>[]>();

/** Number of rows to fetch per table for card preview thumbnails (lightweight strategy). */
const PREVIEW_ROW_LIMIT = 20;
/** Max chart entries (groups) shown in a preview thumbnail. */
const PREVIEW_CHART_ENTRIES = 8;
/** Max scatter plot points shown in a preview thumbnail. */
const PREVIEW_SCATTER_POINTS = 20;
/** Max columns shown in a table widget preview. */
const PREVIEW_TABLE_COLS = 3;
/** Max rows shown in a table widget preview. */
const PREVIEW_TABLE_ROWS = 4;
/** Max characters shown in a text widget preview. */
const PREVIEW_TEXT_LENGTH = 140;
/** Max number of widgets shown in the card grid thumbnail. */
const PREVIEW_MAX_WIDGETS = 6;
/** Number of grid columns in the dashboard layout (matches the react-grid-layout cols config). */
const PREVIEW_GRID_COLS = 12;

// ── Mini widget chart options (shared, animation-free) ──

const miniAxisOpts = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: { x: { display: false }, y: { display: false } },
  elements: {
    bar: { borderRadius: 2, borderSkipped: false as const },
    line: { tension: 0.35, borderWidth: 1.5 },
    point: { radius: 0 },
  },
};

const miniRadarOpts = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: { r: { display: false } },
  elements: { line: { tension: 0.35, borderWidth: 1.5 }, point: { radius: 0 } },
};

const miniCircOpts = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  elements: { arc: { borderWidth: 1 } },
};

// ── MiniWidgetContent: renders the inner content of a single mini widget cell ──

function MiniWidgetContent({ widget, tableData }: {
  widget: WidgetConfig;
  tableData: Map<string, Record<string, unknown>[]>;
}) {
  const wt = widget.widgetType ?? 'chart';

  if (wt === 'text') {
    const tw = widget as TextWidgetConfig;
    return (
      <div className="w-full h-full flex flex-col justify-start overflow-hidden p-1">
        {tw.title && (
          <p className="text-[7px] font-semibold text-gray-600 truncate leading-tight">{tw.title}</p>
        )}
        {tw.content ? (
          <p className="text-[6px] text-gray-400 leading-snug line-clamp-3 whitespace-pre-line mt-0.5">
            {tw.content.slice(0, PREVIEW_TEXT_LENGTH)}
          </p>
        ) : (
          <p className="text-[6px] italic text-gray-300">No content</p>
        )}
      </div>
    );
  }

  if (wt === 'table') {
    const tw = widget as TableWidgetConfig;
    const rows = tableData.get(tw.tableId) ?? [];
    const cols = tw.columns.slice(0, PREVIEW_TABLE_COLS);
    const previewRows = rows.slice(0, PREVIEW_TABLE_ROWS);

    if (cols.length === 0 || previewRows.length === 0) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <p className="text-[7px] text-gray-300">No data</p>
        </div>
      );
    }

    return (
      <div className="w-full h-full overflow-hidden p-0.5">
        <table className="w-full text-[6px] border-collapse">
          <thead>
            <tr>
              {cols.map(col => (
                <th key={col} className="px-0.5 py-px text-left font-semibold text-gray-400 truncate border-b border-gray-100 bg-gray-50/60">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri}>
                {cols.map(col => (
                  <td key={col} className="px-0.5 py-px truncate text-gray-500 border-b border-gray-50 max-w-[40px]">
                    {resolveLabel(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Chart widget
  const cw = widget as ChartWidgetConfig;
  const ids = getTableIds(cw);
  const mergedRows: Record<string, unknown>[] = [];
  for (const id of ids) mergedRows.push(...(tableData.get(id) ?? []));

  if (mergedRows.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-[7px] text-gray-300">No data</p>
      </div>
    );
  }

  const previewColors = (cw.style?.chartColors?.length > 0 ? cw.style.chartColors : DEFAULT_COLORS);
  const previewLineColor = cw.style?.lineColor ?? DEFAULT_COLORS[0];
  const isLineOrAreaPreview = cw.chartType === 'line' || cw.chartType === 'area';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let miniChartData: any;

  if (cw.chartType === 'scatter') {
    const points: { x: number; y: number }[] = [];
    for (const row of mergedRows) {
      const x = resolveValue(row[cw.labelColumn]);
      const y = resolveValue(row[cw.valueColumn]);
      if (x !== null && y !== null) points.push({ x, y });
    }
    miniChartData = {
      datasets: [{
        data: points.slice(0, PREVIEW_SCATTER_POINTS),
        backgroundColor: previewColors[0] + '99',
        borderColor: previewColors[0],
        pointRadius: 2,
      }],
    };
  } else {
    const dg = cw.dateGrouping ?? 'none';
    const groups: Record<string, number[]> = {};
    for (const row of mergedRows) {
      const label = dg !== 'none' ? resolveDateLabel(row[cw.labelColumn], dg) : resolveLabel(row[cw.labelColumn]);
      const val = resolveValue(row[cw.valueColumn]);
      if (!groups[label]) groups[label] = [];
      if (val !== null) groups[label].push(val);
    }
    const entries = Object.entries(groups)
      .map(([l, vals]) => [l, aggregate(vals, cw.aggregation)] as const)
      .slice(0, PREVIEW_CHART_ENTRIES);
    miniChartData = {
      labels: entries.map(([l]) => l),
      datasets: [{
        data: entries.map(([, v]) => Math.round(v * 100) / 100),
        backgroundColor: isLineOrAreaPreview
          ? `${previewLineColor}18`
          : (cw.chartType === 'radar' ? `${previewColors[0]}33` : previewColors.slice(0, entries.length)),
        borderColor: isLineOrAreaPreview ? previewLineColor : previewColors.slice(0, entries.length),
        fill: isLineOrAreaPreview || cw.chartType === 'radar',
        borderWidth: isLineOrAreaPreview ? 1.5 : 1,
        pointRadius: 0,
      }],
    };
  }

  return (
    <div className="w-full h-full">
      {cw.chartType === 'bar' ? (
        <Bar data={miniChartData} options={miniAxisOpts} />
      ) : isLineOrAreaPreview ? (
        <Line data={miniChartData} options={miniAxisOpts} />
      ) : cw.chartType === 'scatter' ? (
        <Scatter data={miniChartData} options={miniAxisOpts} />
      ) : cw.chartType === 'radar' ? (
        <Radar data={miniChartData} options={miniRadarOpts} />
      ) : cw.chartType === 'polarArea' ? (
        <PolarArea data={miniChartData} options={miniCircOpts} />
      ) : cw.chartType === 'pie' ? (
        <Pie data={miniChartData} options={miniCircOpts} />
      ) : (
        <Doughnut data={miniChartData} options={miniCircOpts} />
      )}
    </div>
  );
}

// ── Dashboard Card Preview ──

function DashboardCardPreview({ dashboard, tables }: {
  dashboard: DashboardInstance;
  tables: TableInfo[];
}) {
  const widgetsToPreview = dashboard.widgets.slice(0, PREVIEW_MAX_WIDGETS);
  const [tableData, setTableData] = useState<Map<string, Record<string, unknown>[]>>(() => new Map());
  const [loading, setLoading] = useState(false);

  const widgetIdsKey = widgetsToPreview.map(w => w.id).join(',');

  useEffect(() => {
    const needed = new Set<string>();
    for (const w of widgetsToPreview) {
      const wt = w.widgetType ?? 'chart';
      if (wt === 'chart') {
        for (const id of getTableIds(w as ChartWidgetConfig)) {
          if (tables.some(t => t.id === id)) needed.add(id);
        }
      } else if (wt === 'table') {
        const tableId = (w as TableWidgetConfig).tableId;
        if (tableId && tables.some(t => t.id === tableId)) needed.add(tableId);
      }
    }

    const toFetch = [...needed].filter(id => !previewTableCache.has(id));

    const populate = () => {
      setTableData(new Map([...needed].map(id => [id, previewTableCache.get(id) ?? []])));
    };

    if (toFetch.length === 0) {
      populate();
      return;
    }

    let cancelled = false;
    setLoading(true);
    Promise.all(
      toFetch.map(id =>
        api.getTableData(id, 1, PREVIEW_ROW_LIMIT)
          .then(res => ({ id, rows: (res.success && res.data ? res.data.rows : []) as Record<string, unknown>[] }))
          .catch(() => ({ id, rows: [] as Record<string, unknown>[] }))
      )
    ).then(results => {
      if (cancelled) return;
      for (const { id, rows } of results) previewTableCache.set(id, rows);
      populate();
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetIdsKey, tables]);

  if (widgetsToPreview.length === 0) {
    return (
      <div className="text-center">
        <svg className="w-8 h-8 text-gray-200 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <p className="text-[10px] text-gray-300 mt-1">No widgets yet</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Compute the total vertical extent of all preview widgets using their saved layout positions.
  // Fall back to default grid positions when layout data is missing.
  let totalGridHeight = 0;
  widgetsToPreview.forEach((w, i) => {
    const saved = dashboard.layouts[w.id];
    const wt = w.widgetType ?? 'chart';
    const l = saved ?? (wt === 'text'
      ? { x: (i % 4) * 3, y: Math.floor(i / 4) * 2, w: 3, h: 2 }
      : { x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 });
    totalGridHeight = Math.max(totalGridHeight, l.y + l.h);
  });
  if (totalGridHeight === 0) totalGridHeight = 4;

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ minHeight: 0 }}>
      {widgetsToPreview.map((w, i) => {
        const saved = dashboard.layouts[w.id];
        const wt = w.widgetType ?? 'chart';
        const l = saved ?? (wt === 'text'
          ? { x: (i % 4) * 3, y: Math.floor(i / 4) * 2, w: 3, h: 2 }
          : { x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 });

        const leftPct = (l.x / PREVIEW_GRID_COLS) * 100;
        const topPct = (l.y / totalGridHeight) * 100;
        const widthPct = (l.w / PREVIEW_GRID_COLS) * 100;
        const heightPct = (l.h / totalGridHeight) * 100;

        const bg = (w as ChartWidgetConfig | TextWidgetConfig | TableWidgetConfig).style?.bgColor ?? '#ffffff';

        return (
          <div
            key={w.id}
            className="absolute overflow-hidden"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
              padding: '1.5px',
            }}
          >
            <div
              className="w-full h-full overflow-hidden rounded-sm"
              style={{
                background: bg,
                border: '1px solid #e5e7eb',
              }}
            >
              <MiniWidgetContent widget={w} tableData={tableData} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Dashboard Home (Power BI style card grid) ──

function DashboardHome({ dashboards, tables, onSelect, onNew, onDelete, onRename }: {
  dashboards: DashboardInstance[];
  tables: TableInfo[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const getWidgetSummary = (db: DashboardInstance) => {
    const charts = db.widgets.filter(w => (w.widgetType ?? 'chart') === 'chart').length;
    const texts = db.widgets.filter(w => w.widgetType === 'text').length;
    const tables = db.widgets.filter(w => w.widgetType === 'table').length;
    const parts: string[] = [];
    if (charts > 0) parts.push(`${charts} chart${charts > 1 ? 's' : ''}`);
    if (tables > 0) parts.push(`${tables} table${tables > 1 ? 's' : ''}`);
    if (texts > 0) parts.push(`${texts} text`);
    return parts.length > 0 ? parts.join(', ') : 'Empty';
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-gray-800">Dashboards</h1>
          <p className="text-sm text-gray-400 mt-1">Create and manage your data dashboards</p>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {/* New Dashboard card */}
          <button
            onClick={onNew}
            className="group flex flex-col items-center justify-center h-52 rounded-xl border-2 border-dashed border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-500 group-hover:text-blue-600 transition-colors">New Dashboard</span>
          </button>

          {/* Dashboard cards */}
          {dashboards.map(db => (
            <div
              key={db.id}
              className="group relative flex flex-col h-52 rounded-xl border border-gray-200 bg-white hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer overflow-hidden"
              onClick={() => onSelect(db.id)}
            >
              {/* Preview area */}
              <div className="flex-1 bg-gradient-to-br from-slate-50 to-white relative min-h-0 overflow-hidden">
                <div className="absolute inset-2">
                  <DashboardCardPreview dashboard={db} tables={tables} />
                </div>
              </div>

              {/* Card footer */}
              <div className="px-3 py-2.5 border-t border-gray-100">
                {renamingId === db.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onBlur={() => { onRename(db.id, renameValue.trim() || db.name); setRenamingId(null); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onRename(db.id, renameValue.trim() || db.name); setRenamingId(null); }
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="w-full px-1.5 py-0.5 text-sm font-semibold border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                ) : (
                  <h3
                    className="text-sm font-semibold text-gray-700 truncate"
                    onDoubleClick={e => { e.stopPropagation(); setRenamingId(db.id); setRenameValue(db.name); }}
                  >
                    {db.name}
                  </h3>
                )}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-gray-400">{getWidgetSummary(db)}</span>
                  <span className="text-[10px] text-gray-300">{formatDate(db.createdAt)}</span>
                </div>
              </div>

              {/* Hover action buttons */}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); setRenamingId(db.id); setRenameValue(db.name); }}
                  className="w-7 h-7 rounded-lg bg-white/90 border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors"
                  title="Rename"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                </button>
                {deletingId === db.id ? (
                  <div onClick={e => e.stopPropagation()} className="flex items-center gap-1 px-2 py-1 bg-white rounded-lg border border-red-200 shadow-sm">
                    <span className="text-[10px] text-gray-500">Delete?</span>
                    <button onClick={() => { onDelete(db.id); setDeletingId(null); }}
                      className="text-[10px] font-semibold text-red-600 hover:underline">Yes</button>
                    <button onClick={() => setDeletingId(null)}
                      className="text-[10px] text-gray-400 hover:underline">No</button>
                  </div>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); setDeletingId(db.id); }}
                    className="w-7 h-7 rounded-lg bg-white/90 border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
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

  const parseChartWidget = (d: Record<string, unknown>): ChartWidgetConfig => {
    const ids = Array.isArray(d.tableIds) ? (d.tableIds as string[]) : d.tableId ? [d.tableId as string] : [tables[0]?.id ?? ''];
    return {
      id: crypto.randomUUID(),
      widgetType: 'chart',
      chartType: (d.chartType as ChartType) ?? 'bar',
      tableIds: ids,
      labelColumn: (d.labelColumn as string) ?? '',
      valueColumn: (d.valueColumn as string) ?? '',
      aggregation: (d.aggregation as Aggregation) ?? 'sum',
      topN: typeof d.topN === 'number' ? d.topN : 0,
      dateGrouping: (d.dateGrouping as DateGrouping) ?? 'none',
      title: (d.title as string) ?? '',
      style: { ...DEFAULT_STYLE, ...((d.style as Partial<StyleConfig>) ?? {}) },
    };
  };

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

  // Prefer original_ tables for charting, fall back to first table
  const defaultTableId = useMemo(() => {
    if (tables.length === 0) return '';
    const orig = tables.find((t) => t.name.startsWith('original_'));
    return orig?.id ?? tables[0].id;
  }, [tables]);

  // Chart state
  const [chartType, setChartType] = useState<ChartType>(editing?.widgetType === 'chart' ? editing.chartType : 'bar');
  const [tableIds, setTableIds] = useState<string[]>(
    editing?.widgetType === 'chart' ? getTableIds(editing) : editing?.widgetType === 'table' ? [editing.tableId] : (defaultTableId ? [defaultTableId] : [])
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
        setChartType(editing.chartType); setTableIds(getTableIds(editing));
        setLabelColumn(editing.labelColumn); setValueColumn(editing.valueColumn);
        setAggregation(editing.aggregation);
        setTopN(editing.topN ?? 0);
        setDateGrouping(editing.dateGrouping ?? 'none');
      } else if (editing.widgetType === 'text') {
        setTextContent(editing.content);
      } else if (editing.widgetType === 'table') {
        setTableIds(editing.tableId ? [editing.tableId] : []);
        setMaxRows(editing.maxRows);
      }
    }
  }, [editing]);

  const selectedTables = tables.filter((t) => tableIds.includes(t.id));

  // Merge columns from all selected tables, detect type conflicts
  const { columns, conflicts } = useMemo(() => {
    const colMap = new Map<string, { type: string; tables: string[] }>();
    const conflictList: string[] = [];
    for (const t of selectedTables) {
      for (const c of t.columns) {
        const existing = colMap.get(c.name);
        if (existing) {
          existing.tables.push(t.name);
          if (existing.type.toUpperCase() !== c.type.toUpperCase() && !conflictList.includes(c.name)) {
            conflictList.push(c.name);
          }
        } else {
          colMap.set(c.name, { type: c.type, tables: [t.name] });
        }
      }
    }
    const cols = Array.from(colMap.entries()).map(([name, { type }]) => ({ name, type, nullable: true }));
    return { columns: cols, conflicts: conflictList };
  }, [selectedTables]);

  useEffect(() => {
    if (!editing && columns.length > 0 && widgetType === 'chart') {
      const cat = columns.find((c) => c.type.toUpperCase() === 'VARCHAR');
      const num = columns.find((c) => ['INTEGER', 'DECIMAL', 'BIGINT', 'DOUBLE', 'FLOAT'].includes(c.type.toUpperCase()));
      setLabelColumn(cat?.name ?? columns[0].name);
      setValueColumn(num?.name ?? columns[0].name);
    }
  }, [tableIds.join(',')]);

  const updateStyle = (patch: Partial<StyleConfig>) => setStyle((s) => ({ ...s, ...patch }));

  const canSubmit = widgetType === 'text'
    ? true
    : widgetType === 'table'
    ? true
    : !!(tableIds.length > 0 && labelColumn && valueColumn && conflicts.length === 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (widgetType === 'chart') {
      const cfg: ChartWidgetConfig = {
        id: editing?.id ?? crypto.randomUUID(),
        widgetType: 'chart',
        chartType, tableIds, labelColumn, valueColumn, aggregation, topN, dateGrouping,
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

  const isAxisChart = chartType === 'bar' || chartType === 'line' || chartType === 'area' || chartType === 'scatter';


  const activeTableName = selectedTables[0]?.name ?? '';
  const numericCols = columns.filter((c) => ['INTEGER', 'DECIMAL', 'BIGINT', 'DOUBLE', 'FLOAT'].includes(c.type.toUpperCase()));
  const categoryCols = columns.filter((c) => !['INTEGER', 'DECIMAL', 'BIGINT', 'DOUBLE', 'FLOAT'].includes(c.type.toUpperCase()));

  return (
    <div className="w-[280px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col min-h-0">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 flex-shrink-0">
        {editing ? (
          <div className="flex items-center gap-2 mb-3">
            <button onClick={onCancelEdit} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            </button>
            <h2 className="text-[14px] font-bold text-gray-800">Edit Widget</h2>
          </div>
        ) : (
          <>
            <h2 className="text-[14px] font-bold text-gray-800 mb-3">Add Widget</h2>
            <div className="flex gap-1.5">
              {([
                { type: 'chart' as WidgetType, label: 'Chart', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z' },
                { type: 'text' as WidgetType, label: 'Text', icon: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12' },
                { type: 'table' as WidgetType, label: 'Table', icon: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375' },
              ]).map(({ type, label, icon }) => (
                <button key={type} onClick={() => setWidgetType(type)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all ${
                    widgetType === type ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'
                  }`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── AI Generation (compact) ── */}
      {!editing && (
        <div className="mx-4 mb-3 p-2.5 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 flex-shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3.5 h-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <span className="text-[11px] font-semibold text-purple-700">AI Generate</span>
            <div className="ml-auto flex gap-1">
              <button onClick={() => setAiMode('chart')}
                className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-all ${
                  aiMode === 'chart' ? 'bg-purple-600 text-white' : 'text-purple-400 hover:text-purple-600'}`}>
                Chart
              </button>
              <button onClick={() => setAiMode('dashboard')}
                className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-all ${
                  aiMode === 'dashboard' ? 'bg-purple-600 text-white' : 'text-purple-400 hover:text-purple-600'}`}>
                Dashboard
              </button>
            </div>
          </div>
          <div className="flex gap-1.5">
            <input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAiGenerate(); } }}
              placeholder={aiMode === 'dashboard' ? 'Describe your dashboard...' : 'Describe your chart...'}
              disabled={aiLoading}
              className="flex-1 min-w-0 border border-purple-200 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400 placeholder:text-gray-300 disabled:opacity-50"
            />
            <button
              onClick={handleAiGenerate}
              disabled={!aiPrompt.trim() || aiLoading}
              className="w-8 h-8 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white flex items-center justify-center transition-colors flex-shrink-0"
            >
              {aiLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              )}
            </button>
          </div>
          {aiError && <p className="text-[10px] text-red-500 mt-1.5">{aiError}</p>}
        </div>
      )}

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Chart Builder ── */}
        {widgetType === 'chart' && (
          <>
            {/* Table selector — single dropdown, auto-selects original */}
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2 mb-2.5">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>
                <select value={tableIds[0] ?? ''} onChange={(e) => { setTableIds([e.target.value]); setLabelColumn(''); setValueColumn(''); }}
                  className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-400 truncate">
                  {[...tables].sort((a, b) => {
                    const aOrig = a.name.startsWith('original_') ? 0 : 1;
                    const bOrig = b.name.startsWith('original_') ? 0 : 1;
                    return aOrig - bOrig || a.name.localeCompare(b.name);
                  }).map((t) => (
                    <option key={t.id} value={t.id}>{t.name.startsWith('original_') ? `${t.name.slice(9)} (original)` : t.name}</option>
                  ))}
                </select>
              </div>
              {activeTableName && (
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <span>{columns.length} columns</span>
                  <span>&middot;</span>
                  <span>{numericCols.length} numeric</span>
                  <span>&middot;</span>
                  <span>{categoryCols.length} category</span>
                </div>
              )}
            </div>

            {/* Chart type grid */}
            <div className="px-4 pb-3">
              <div className="grid grid-cols-4 gap-1.5">
                {CHART_TYPES.map((ct) => (
                  <button key={ct.value} onClick={() => setChartType(ct.value)}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-lg border text-[10px] transition-all ${
                      chartType === ct.value ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'border-gray-100 text-gray-400 hover:bg-gray-50 hover:border-gray-200'
                    }`}>
                    {CHART_ICON_MAP[ct.value](chartType === ct.value)}
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mapping */}
            <Section title="Mapping">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider font-semibold">{isAxisChart ? 'X-Axis' : 'Category'}</label>
                  <select value={labelColumn} onChange={(e) => setLabelColumn(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="">Select...</option>
                    {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider font-semibold">{isAxisChart ? 'Y-Axis' : 'Value'}</label>
                  <select value={valueColumn} onChange={(e) => setValueColumn(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="">Select...</option>
                    {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider font-semibold">Aggregation</label>
                <div className="flex gap-1">
                  {AGGREGATIONS.map((a) => (
                    <button key={a.value} onClick={() => setAggregation(a.value)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                        aggregation === a.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider font-semibold">Limit</label>
                <div className="flex gap-1">
                  {TOP_N_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => setTopN(opt.value)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                        topN === opt.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
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
                    <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider font-semibold">Date Grouping</label>
                    <div className="flex gap-1">
                      {DATE_GROUPINGS.map((dg) => (
                        <button key={dg.value} onClick={() => setDateGrouping(dg.value)}
                          className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                            dateGrouping === dg.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                          {dg.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </Section>

            {/* Style */}
            <Section title="Style" defaultOpen={false}>
              <div>
                <span className="block text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">Color Theme</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {COLOR_THEMES.map((theme) => (
                    <button key={theme.name}
                      onClick={() => updateStyle({ chartColors: [...theme.colors], chartColor: theme.colors[0], lineColor: theme.colors[0] })}
                      className={`flex flex-col items-center gap-1 px-1.5 py-1.5 rounded-lg border text-[9px] transition-all hover:border-blue-400 ${
                        style.chartColors[0] === theme.colors[0] && style.chartColors[1] === theme.colors[1]
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-100 text-gray-400 hover:bg-gray-50'
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
                  <span className="block text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">Custom Colors</span>
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
                <span className="text-[11px] text-gray-500">Show Legend</span>
                <button onClick={() => updateStyle({ showLegend: !style.showLegend })}
                  className={`w-8 h-[18px] rounded-full transition-colors relative ${style.showLegend ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <div className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-all ${style.showLegend ? 'left-[16px]' : 'left-[2px]'}`} />
                </button>
              </div>
              {style.showLegend && (
                <div className="flex gap-1">
                  {(['top', 'bottom', 'left', 'right'] as const).map((p) => (
                    <button key={p} onClick={() => updateStyle({ legendPosition: p })}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-semibold capitalize transition-all ${
                        style.legendPosition === p ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
              {isAxisChart && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">X Label</label>
                      <input value={style.xAxisLabel} onChange={(e) => updateStyle({ xAxisLabel: e.target.value })}
                        placeholder="e.g. Category" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Y Label</label>
                      <input value={style.yAxisLabel} onChange={(e) => updateStyle({ yAxisLabel: e.target.value })}
                        placeholder="e.g. Revenue" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                  </div>
                  <ColorInput label="Grid Color" value={style.gridColor} onChange={(v) => updateStyle({ gridColor: v })} />
                </>
              )}
            </Section>
          </>
        )}

        {/* ── Text Builder ── */}
        {widgetType === 'text' && (
          <div className="px-4 pb-3">
            <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)}
              placeholder="Type your notes, insights, or analysis..."
              rows={10}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none leading-relaxed" />
          </div>
        )}

        {/* ── Table Builder ── */}
        {widgetType === 'table' && (
          <div className="px-4 pb-3 space-y-3">
            <div className="flex items-start gap-2 p-2.5 bg-blue-50 rounded-xl">
              <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Add this widget, then <strong>drag columns</strong> from the sidebar onto it.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500">Max Rows</span>
              <input type="number" min={5} max={500} value={maxRows} onChange={(e) => setMaxRows(Number(e.target.value))}
                className="w-16 bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1 text-[11px] text-gray-600 text-center focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>
        )}

        {/* Common: Title */}
        <Section title="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={widgetType === 'chart' && valueColumn && labelColumn ? `${valueColumn} by ${labelColumn}` : widgetType === 'text' ? 'Text' : selectedTables[0]?.name ?? 'Title...'}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Section>

        {/* Common: Appearance */}
        <Section title="Appearance" defaultOpen={false}>
          <ColorInput label="Background" value={style.bgColor} onChange={(v) => updateStyle({ bgColor: v })} />
          <ColorInput label="Border" value={style.borderColor} onChange={(v) => updateStyle({ borderColor: v })} />
          <ColorInput label="Title Color" value={style.titleColor} onChange={(v) => updateStyle({ titleColor: v })} />
          {widgetType === 'text' && (
            <ColorInput label="Text Color" value={style.axisLabelColor} onChange={(v) => updateStyle({ axisLabelColor: v })} />
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Corner Radius</span>
            <input type="number" min={0} max={24} value={style.borderRadius} onChange={(e) => updateStyle({ borderRadius: Number(e.target.value) })}
              className="w-14 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-600 text-center" />
          </div>
        </Section>
      </div>

      {/* ── Action Button ── */}
      <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors shadow-sm">
          {editing ? (
            <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> Update Widget</>
          ) : (
            <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg> Add to Dashboard</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Dashboard ──

export default function Dashboard({ tables, onImport }: DashboardProps) {
  const [dashboards, setDashboards] = useState<DashboardInstance[]>(migrateIfNeeded);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WidgetConfig | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);

  const activeDashboard = dashboards.find(d => d.id === activeId) ?? null;
  const widgets = activeDashboard?.widgets ?? [];
  const layouts = activeDashboard?.layouts ?? {};

  useEffect(() => {
    saveDashboards(dashboards);
  }, [dashboards]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setCanvasWidth(e.contentRect.width);
    });
    ro.observe(el);
    setCanvasWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [activeId]);

  const updateActiveDashboard = useCallback((w: WidgetConfig[], l: Record<string, WidgetLayout>) => {
    if (!activeId) return;
    setDashboards(prev => prev.map(d =>
      d.id === activeId ? { ...d, widgets: w, layouts: l } : d
    ));
  }, [activeId]);

  // Dashboard CRUD
  const handleNewDashboard = () => {
    const newDb: DashboardInstance = {
      id: crypto.randomUUID(),
      name: 'New Dashboard',
      widgets: [],
      layouts: {},
      createdAt: new Date().toISOString(),
    };
    setDashboards(prev => [newDb, ...prev]);
    setActiveId(newDb.id);
    setEditing(null);
  };

  const handleDeleteDashboard = (dbId: string) => {
    setDashboards(prev => {
      const updated = prev.filter(d => d.id !== dbId);
      if (activeId === dbId) {
        setActiveId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  };

  const handleSelectDashboard = (dbId: string) => {
    setActiveId(dbId);
    setEditing(null);
  };

  const handleBackToHome = () => {
    setActiveId(null);
    setEditing(null);
  };

  const handleRenameDashboard = (dbId: string, name: string) => {
    setDashboards(prev => prev.map(d =>
      d.id === dbId ? { ...d, name } : d
    ));
  };

  // Widget handlers
  const handleAdd = (cfg: WidgetConfig) => {
    const maxY = widgets.reduce((m, w) => {
      const ly = layouts[w.id];
      return ly ? Math.max(m, ly.y + ly.h) : m;
    }, 0);
    const wt = cfg.widgetType ?? 'chart';
    const size = wt === 'text' ? { w: 3, h: 2 } : wt === 'table' ? { w: 6, h: 4 } : { w: 6, h: 4 };
    const newLayouts = { ...layouts, [cfg.id]: { x: 0, y: maxY, ...size } };
    updateActiveDashboard([...widgets, cfg], newLayouts);
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
    updateActiveDashboard([...widgets, ...cfgs], newLayouts);
  };

  const handleUpdate = (cfg: WidgetConfig) => {
    updateActiveDashboard(widgets.map((w) => w.id === cfg.id ? cfg : w), layouts);
    setEditing(null);
  };

  const handleInlineUpdate = useCallback((cfg: WidgetConfig) => {
    setDashboards(prev => prev.map(d =>
      d.id === activeId
        ? { ...d, widgets: d.widgets.map(w => w.id === cfg.id ? cfg : w) }
        : d
    ));
  }, [activeId]);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const confirmDeleteWidget = () => {
    const id = pendingDeleteId;
    if (!id) return;
    const nl = { ...layouts }; delete nl[id];
    updateActiveDashboard(widgets.filter((w) => w.id !== id), nl);
    if (editing?.id === id) setEditing(null);
    setPendingDeleteId(null);
  };

  const handleLayoutChange = useCallback((layout: Layout) => {
    const nl: Record<string, WidgetLayout> = {};
    for (const l of layout) nl[l.i] = { x: l.x, y: l.y, w: l.w, h: l.h };
    setDashboards(prev => prev.map(d =>
      d.id === activeId ? { ...d, layouts: nl } : d
    ));
  }, [activeId]);

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

  const gridCfg = useMemo(() => ({ cols: 12, rowHeight: 60 }), []);
  const dragCfg = useMemo(() => ({ enabled: true, handle: '.drag-handle' }), []);
  const resizeCfg = useMemo(() => ({ enabled: true }), []);

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

  // No active dashboard — show Power BI-style home
  if (!activeDashboard) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {tables.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-600 mb-1">No data to visualize</h3>
              <p className="text-xs text-gray-400 mb-4">Import data first to start building charts</p>
              <button onClick={onImport} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors">Import Data</button>
            </div>
          </div>
        ) : (
          <DashboardHome
            dashboards={dashboards}
            tables={tables}
            onSelect={handleSelectDashboard}
            onNew={handleNewDashboard}
            onDelete={handleDeleteDashboard}
            onRename={handleRenameDashboard}
          />
        )}
      </div>
    );
  }

  // Active dashboard — show canvas view
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top bar with back button and dashboard name */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
        <button
          onClick={handleBackToHome}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Dashboards
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <h2 className="text-sm font-semibold text-gray-700 truncate">{activeDashboard.name}</h2>
        <span className="text-[11px] text-gray-400">{widgets.length} widget{widgets.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Canvas + Toolbox */}
      <div className="flex-1 flex min-h-0">
        <div ref={canvasRef} className="flex-1 overflow-auto bg-gray-50 min-w-0" onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t === e.currentTarget || t.classList.contains('react-grid-layout') || t.classList.contains('p-4')) setEditing(null);
        }}>
          {widgets.length === 0 ? (
            emptyState('Your dashboard is empty', 'Configure a chart in the toolbox and click "Add to Dashboard"')
          ) : (
            <GridLayout
              className="p-4"
              layout={gridLayout}
              gridConfig={gridCfg}
              dragConfig={dragCfg}
              resizeConfig={resizeCfg}
              width={canvasWidth - 32}
              onLayoutChange={handleLayoutChange}
            >
              {widgets.map((w) => (
                <div key={w.id}>
                  {(w.widgetType ?? 'chart') === 'chart' ? (
                    <ChartWidget config={w as ChartWidgetConfig} tables={tables} onEdit={() => setEditing(w)} onDelete={() => handleDelete(w.id)} />
                  ) : w.widgetType === 'text' ? (
                    <TextWidget config={w as TextWidgetConfig} onEdit={() => setEditing(w)} onDelete={() => handleDelete(w.id)} onUpdate={(c) => handleInlineUpdate(c)} />
                  ) : (
                    <DataTableWidget config={w as TableWidgetConfig} onEdit={() => setEditing(w)} onDelete={() => handleDelete(w.id)} onUpdate={(c) => handleInlineUpdate(c)} />
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

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete widget"
        message="This widget will be removed from the dashboard. You can't undo this."
        confirmLabel="Delete"
        onConfirm={confirmDeleteWidget}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
