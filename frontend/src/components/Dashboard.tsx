import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
  RadialLinearScale,
} from 'chart.js';
import { Bar, Pie, Doughnut, Line, Scatter, Radar, PolarArea } from 'react-chartjs-2';
import { GridLayout, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { QRCodeSVG } from 'qrcode.react';
import { api, TableInfo, DashboardRecord } from '../api';
import ConfirmDialog from './ConfirmDialog';
import { readCache, writeCache } from '../lib/cache';
import { supabase } from '../supabase';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, RadialLinearScale, Title, Tooltip, Legend, Filler);

// Tableau color palettes — see https://jrnold.github.io/ggthemes/reference/tableau_color_pal.html
const COLOR_THEMES: { name: string; colors: string[] }[] = [
  { name: 'Tableau 10', colors: ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'] },
  { name: 'Tableau 20', colors: ['#4E79A7', '#A0CBE8', '#F28E2B', '#FFBE7D', '#59A14F', '#8CD17D', '#B6992D', '#F1CE63', '#499894', '#86BCB6', '#E15759', '#FF9D9A', '#79706E', '#BAB0AC', '#D37295', '#FABFD2', '#B07AA1', '#D4A6C8', '#9D7660', '#D7B5A6'] },
  { name: 'Color Blind', colors: ['#1170AA', '#FC7D0B', '#A3ACB9', '#57606C', '#5FA2CE', '#C85200', '#7B848F', '#A3CCE9', '#FFBC79', '#C8D0D9'] },
  { name: 'Classic 10', colors: ['#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD', '#8C564B', '#E377C2', '#7F7F7F', '#BCBD22', '#17BECF'] },
  { name: 'Classic Medium', colors: ['#729ECE', '#FF9E4A', '#67BF5C', '#ED665D', '#AD8BC9', '#A8786E', '#ED97CA', '#A2A2A2', '#CDCC5D', '#6DCCDA'] },
  { name: 'Classic Light', colors: ['#AEC7E8', '#FFBB78', '#98DF8A', '#FF9896', '#C5B0D5', '#C49C94', '#F7B6D2', '#C7C7C7', '#DBDB8D', '#9EDAE5'] },
  { name: 'Seattle Grays', colors: ['#767F8B', '#B3B7B8', '#5B6770', '#D0D7DC', '#4C5460'] },
  { name: 'Traffic', colors: ['#B60A1C', '#E39802', '#309143', '#E03531', '#F0BD27', '#51B364', '#E8A29A', '#F6D37E', '#9BCB91'] },
  { name: 'Superfishel Stone', colors: ['#6388B4', '#FFAE34', '#EF6F6A', '#8CC2CA', '#55AD89', '#C3BC3F', '#BB7693', '#BAA094', '#A9B5AE', '#767676'] },
  { name: 'Jewel Bright', colors: ['#EB1E2C', '#FD6F30', '#F9A729', '#F9D23C', '#5FBB68', '#64CDCC', '#91DCEA', '#A4A4D5', '#BBC9E5'] },
];

const DEFAULT_COLORS = COLOR_THEMES[0].colors;

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

// ── Filters ──
const FILTER_OPS = [
  { value: '=',         label: '=' },
  { value: '!=',        label: '≠' },
  { value: '>',         label: '>' },
  { value: '>=',        label: '≥' },
  { value: '<',         label: '<' },
  { value: '<=',        label: '≤' },
  { value: 'contains',  label: 'contains' },
  { value: 'in',        label: 'in' },
  { value: 'notIn',     label: 'not in' },
  { value: 'isNull',    label: 'is empty' },
  { value: 'isNotNull', label: 'is not empty' },
] as const;

type FilterOp = typeof FILTER_OPS[number]['value'];

interface Filter {
  id: string;
  column: string;
  op: FilterOp;
  value: string;
}

function applyFilters(rows: Record<string, unknown>[], filters?: Filter[]): Record<string, unknown>[] {
  if (!filters || filters.length === 0) return rows;
  const active = filters.filter((f) => f.column && (f.op === 'isNull' || f.op === 'isNotNull' || f.value !== ''));
  if (active.length === 0) return rows;

  return rows.filter((row) => active.every((f) => matchFilter(row[f.column], f)));
}

function matchFilter(raw: unknown, f: Filter): boolean {
  if (f.op === 'isNull') return raw === null || raw === undefined || raw === '';
  if (f.op === 'isNotNull') return !(raw === null || raw === undefined || raw === '');

  const numeric = ['>', '>=', '<', '<='].includes(f.op);
  if (numeric) {
    const lhs = resolveValue(raw);
    const rhs = Number(f.value);
    if (lhs === null || isNaN(rhs)) return false;
    if (f.op === '>')  return lhs > rhs;
    if (f.op === '>=') return lhs >= rhs;
    if (f.op === '<')  return lhs < rhs;
    if (f.op === '<=') return lhs <= rhs;
  }

  const lhs = resolveLabel(raw);
  if (f.op === 'contains') return lhs.toLowerCase().includes(f.value.toLowerCase());

  if (f.op === 'in' || f.op === 'notIn') {
    const set = new Set(f.value.split(',').map((s) => s.trim()).filter(Boolean));
    const hit = set.has(lhs);
    return f.op === 'in' ? hit : !hit;
  }

  // = / != — string-compare with a numeric fallback so "5" matches 5
  if (f.op === '=' || f.op === '!=') {
    const lhsNum = resolveValue(raw);
    const rhsNum = Number(f.value);
    const equal = !isNaN(rhsNum) && lhsNum !== null
      ? lhsNum === rhsNum
      : lhs === f.value;
    return f.op === '=' ? equal : !equal;
  }

  return true;
}

interface ChartWidgetConfig {
  id: string;
  widgetType: 'chart';
  chartType: ChartType;
  tableIds: string[];
  /** @deprecated kept for backward compat with old saved configs */
  tableId?: string;
  /** When set, the labelColumn is read from this (typically dim) table and joined to the fact table server-side. */
  labelTableId?: string;
  labelColumn: string;
  valueColumn: string;
  aggregation: Aggregation;
  topN: number;
  dateGrouping: DateGrouping;
  filters?: Filter[];
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
  filters?: Filter[];
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

// ── Multi-dashboard persistence (Supabase-backed via /api/v1/dashboards) ──

interface DashboardInstance {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  layouts: Record<string, WidgetLayout>;
  createdAt: string;
}

const LEGACY_DASHBOARDS_KEY = 'dashboard_instances';

function recordToInstance(rec: DashboardRecord): DashboardInstance {
  return {
    id: rec.id,
    name: rec.name,
    widgets: (rec.widgets ?? []) as WidgetConfig[],
    layouts: (rec.layouts ?? {}) as Record<string, WidgetLayout>,
    createdAt: rec.created_at,
  };
}

// One-time migration: pull anything still sitting in localStorage from the
// pre-Supabase build and push it up to the user's account.
async function migrateLocalToSupabase(): Promise<void> {
  let legacy: DashboardInstance[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_DASHBOARDS_KEY);
    if (raw) legacy = JSON.parse(raw);
  } catch { /* ignore */ }

  if (legacy.length === 0) {
    // Older legacy: a single dashboard kept as widgets/layouts at the top level.
    try {
      const w = JSON.parse(localStorage.getItem('dashboard_widgets') ?? '[]');
      const l = JSON.parse(localStorage.getItem('dashboard_layouts') ?? '{}');
      if (Array.isArray(w) && w.length > 0) {
        legacy = [{
          id: crypto.randomUUID(),
          name: 'My Dashboard',
          widgets: w,
          layouts: l,
          createdAt: new Date().toISOString(),
        }];
      }
    } catch { /* ignore */ }
  }

  if (legacy.length === 0) return;

  for (const d of legacy) {
    await api.createDashboard({
      id: d.id,
      name: d.name,
      widgets: d.widgets,
      layouts: d.layouts,
    });
  }

  // Clear local copies so we don't migrate twice.
  localStorage.removeItem(LEGACY_DASHBOARDS_KEY);
  localStorage.removeItem('dashboard_widgets');
  localStorage.removeItem('dashboard_layouts');
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
  const factId = ids[0];
  const labelTableId = config.labelTableId && config.labelTableId !== factId ? config.labelTableId : undefined;
  // When a separate label table is set, the chart-data endpoint pre-aggregates server-side,
  // so the client-side reducer should not aggregate again.
  const preAggregated = !!labelTableId && config.chartType !== 'scatter';

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPartialData(false);

    // Joined path: fact table + dim table on the server, with FK→PK join + GROUP BY
    if (labelTableId && factId) {
      api.getChartData({
        factTableId: factId,
        labelTableId,
        labelColumn: config.labelColumn,
        valueColumn: config.valueColumn,
        aggregation: config.aggregation,
        topN: config.topN,
        dateGrouping: config.dateGrouping,
        chartType: config.chartType,
      })
        .then((res) => {
          if (res.success && res.data) {
            setData(res.data.rows);
          } else {
            setError(res.error ?? 'Failed to load chart data');
            setData([]);
          }
        })
        .catch(() => setData([]))
        .finally(() => setLoading(false));
      return;
    }

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
  }, [ids.join(','), labelTableId, config.labelColumn, config.valueColumn, config.aggregation, config.topN, config.dateGrouping, config.chartType]);

  const s = config.style ?? DEFAULT_STYLE;

  const isLineOrArea = config.chartType === 'line' || config.chartType === 'area';

  const filteredData = useMemo(() => applyFilters(data ?? [], config.filters), [data, config.filters]);

  const chartData = (() => {
    if (!filteredData || filteredData.length === 0) return null;

    // Scatter chart: raw x/y points, no grouping
    if (config.chartType === 'scatter') {
      const points: { x: number; y: number }[] = [];
      for (const row of filteredData) {
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
    let entries: (readonly [string, number])[];

    if (preAggregated) {
      // Server already grouped, aggregated, date-grouped, sorted, and applied topN.
      entries = filteredData
        .map(row => {
          const label = resolveLabel(row[config.labelColumn]);
          const val = resolveValue(row[config.valueColumn]) ?? 0;
          return [label, val] as const;
        });
    } else {
      const groups: Record<string, number[]> = {};
      for (const row of filteredData) {
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
      entries = limit > 0 ? sorted.slice(0, limit) : sorted;
    }
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
      onMouseMove={(e) => { if (e.buttons > 0) draggedRef.current = true; }}
      onClick={() => { if (!draggedRef.current) onEdit(); }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 drag-handle cursor-grab active:cursor-grabbing">
        <div className="min-w-0">
          <h3 className="font-semibold truncate leading-tight" style={{ fontSize: s.titleSize, color: s.titleColor }}>{config.title}</h3>
          <p className="text-[10px] text-gray-400 truncate mt-0.5">
            {tableName} &middot; {config.aggregation}
            {config.filters && config.filters.filter(f => f.column).length > 0 && (
              <> &middot; {config.filters.filter(f => f.column).length} filter{config.filters.filter(f => f.column).length === 1 ? '' : 's'}</>
            )}
            {partialData ? ' (first 500 rows)' : ''}
          </p>
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
    // Pull a wider window so filters have something to chew on; we slice
    // back down to maxRows after filtering.
    const fetchRows = Math.max(config.maxRows || 50, (config.filters?.length ?? 0) > 0 ? 500 : 0) || 50;
    api.getTableData(config.tableId, 1, fetchRows).then((res) => {
      if (res.success && res.data) setData(res.data.rows);
      else setData([]);
    }).finally(() => setLoading(false));
  }, [config.tableId, config.columns.length, config.maxRows, config.filters]);

  const filteredData = useMemo(() => {
    const filtered = applyFilters(data ?? [], config.filters);
    return filtered.slice(0, config.maxRows || 50);
  }, [data, config.filters, config.maxRows]);

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
      onMouseMove={(e) => { if (e.buttons > 0) draggedRef.current = true; }}
      onClick={() => { if (!draggedRef.current) onEdit(); }}>
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 drag-handle cursor-grab active:cursor-grabbing">
        <div className="min-w-0">
          <h3 className="font-semibold truncate leading-tight" style={{ fontSize: s.titleSize, color: s.titleColor }}>{config.title || 'Table'}</h3>
          {config.columns.length > 0 && (
            <p className="text-[10px] text-gray-400 truncate mt-0.5">
              {filteredData.length} rows
              {config.filters && config.filters.filter(f => f.column).length > 0 && (
                <> &middot; {config.filters.filter(f => f.column).length} filter{config.filters.filter(f => f.column).length === 1 ? '' : 's'}</>
              )}
            </p>
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
          ) : !filteredData || filteredData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-400">
              {(data?.length ?? 0) > 0 ? 'No rows match the filter' : 'No data'}
            </div>
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
                {filteredData.map((row, ri) => (
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
    const rawRows = tableData.get(tw.tableId) ?? [];
    const rows = applyFilters(rawRows, tw.filters);
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
  const rawRows: Record<string, unknown>[] = [];
  for (const id of ids) rawRows.push(...(tableData.get(id) ?? []));
  const mergedRows = applyFilters(rawRows, cw.filters);

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

// ── Recent Charts Strip (used in empty editor canvas) ──

function RecentChartsStrip({ widgets, tables, onClone }: {
  widgets: ChartWidgetConfig[];
  tables: TableInfo[];
  onClone: (cfg: ChartWidgetConfig) => void;
}) {
  const [tableData, setTableData] = useState<Map<string, Record<string, unknown>[]>>(() => new Map());
  const widgetIdsKey = widgets.map(w => w.id).join(',');

  useEffect(() => {
    if (widgets.length === 0) return;
    const needed = new Set<string>();
    for (const w of widgets) {
      for (const id of getTableIds(w)) {
        if (tables.some(t => t.id === id)) needed.add(id);
      }
    }
    const toFetch = [...needed].filter(id => !previewTableCache.has(id));
    const populate = () => {
      setTableData(new Map([...needed].map(id => [id, previewTableCache.get(id) ?? []])));
    };
    if (toFetch.length === 0) { populate(); return; }

    let cancelled = false;
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
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetIdsKey, tables]);

  if (widgets.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-semibold text-gray-700">Recently added charts</h3>
        <span className="text-[11px] text-gray-400">Click to add to this dashboard</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {widgets.map(w => (
          <button
            key={w.id}
            onClick={() => onClone({ ...w, id: crypto.randomUUID() })}
            className="group flex flex-col text-left rounded-xl border border-gray-200 bg-white tile-shadow hover:border-accent hover:shadow-md transition-all overflow-hidden"
          >
            <div className="h-24 px-2 pt-2 bg-gradient-to-br from-slate-50 to-white">
              <MiniWidgetContent widget={w} tableData={tableData} />
            </div>
            <div className="px-3 py-2 border-t border-gray-100">
              <p className="text-[12px] font-semibold text-gray-700 truncate">{w.title || `${w.valueColumn} by ${w.labelColumn}`}</p>
              <p className="text-[10.5px] text-gray-400 capitalize mt-0.5">{w.chartType} · {w.aggregation}</p>
            </div>
          </button>
        ))}
      </div>
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

type DashboardSortKey = 'updated' | 'name' | 'created';
type DashboardOwnerFilter = 'all' | 'me';

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
  const [sortKey, setSortKey] = useState<DashboardSortKey>('updated');
  const [ownerFilter, setOwnerFilter] = useState<DashboardOwnerFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  const getKpiDots = (db: DashboardInstance) => {
    const dots: { color: string; title: string }[] = [];
    const counts = {
      chart: db.widgets.filter(w => (w.widgetType ?? 'chart') === 'chart').length,
      table: db.widgets.filter(w => w.widgetType === 'table').length,
      text: db.widgets.filter(w => w.widgetType === 'text').length,
    };
    if (counts.chart) dots.push({ color: '#7c5cff', title: `${counts.chart} chart${counts.chart > 1 ? 's' : ''}` });
    if (counts.table) dots.push({ color: '#22c55e', title: `${counts.table} table${counts.table > 1 ? 's' : ''}` });
    if (counts.text) dots.push({ color: '#f59e0b', title: `${counts.text} text` });
    return dots;
  };

  const visibleDashboards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = dashboards;
    if (ownerFilter === 'me') list = list; // single-user app — same set
    if (q) list = list.filter(d => d.name.toLowerCase().includes(q));
    const sorted = [...list];
    if (sortKey === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortKey === 'created') {
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [dashboards, sortKey, ownerFilter, searchQuery]);

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--page-bg)' }}>
      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Workspace</div>
              <h1 className="text-[22px] font-bold text-gray-900 tracking-tight mt-1">Dashboards</h1>
              <p className="text-[13px] text-gray-500 mt-1">Create and explore dashboards to visualize your data and share insights.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-500">
                <span className="text-gray-400">Sort by</span>
                <select
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as DashboardSortKey)}
                  className="bg-transparent text-gray-700 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="updated">Last updated</option>
                  <option value="name">Name</option>
                  <option value="created">Created</option>
                </select>
              </label>
              <select
                value={ownerFilter}
                onChange={e => setOwnerFilter(e.target.value as DashboardOwnerFilter)}
                className="h-9 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-700 font-medium focus:outline-none cursor-pointer"
              >
                <option value="all">All owners</option>
                <option value="me">Me</option>
              </select>
              <button
                onClick={onNew}
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg bg-accent text-white text-[13px] font-medium shadow-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create dashboard
              </button>
            </div>
          </div>
          <div className="relative mt-4 max-w-sm">
            <svg className="w-4 h-4 text-gray-300 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.6-5.4a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search dashboards..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-[12.5px] text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-2">{dashboards.length} dashboard{dashboards.length === 1 ? '' : 's'} · {tables.length} table{tables.length === 1 ? '' : 's'} available</p>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {/* New Dashboard card */}
          <button
            onClick={onNew}
            className="group flex flex-col items-center justify-center text-center h-52 rounded-2xl dashed-card bg-white hover:border-accent hover:bg-accent-soft/40 transition-all cursor-pointer px-4"
          >
            <div className="w-12 h-12 rounded-xl bg-accent-soft group-hover:bg-accent-soft-active flex items-center justify-center mb-3 transition-colors">
              <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-gray-700 group-hover:text-accent-strong transition-colors">Create new dashboard</span>
            <span className="text-[11px] text-gray-400 mt-1">Start from scratch or use a template</span>
            <span className="mt-3 inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-accent text-white text-[11.5px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create dashboard
            </span>
          </button>

          {/* Dashboard cards */}
          {visibleDashboards.map(db => (
            <div
              key={db.id}
              className="group relative flex flex-col h-52 rounded-2xl border border-gray-200 bg-white tile-shadow hover:shadow-lg hover:border-accent transition-all cursor-pointer overflow-hidden fade-in"
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
                <div className="flex items-center justify-between mt-1.5 gap-2">
                  <div className="flex items-center gap-1 min-w-0" title={getWidgetSummary(db)}>
                    {getKpiDots(db).length > 0 ? (
                      getKpiDots(db).map((dot, i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: dot.color }}
                        />
                      ))
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-200 flex-shrink-0" />
                    )}
                    <span className="text-[10.5px] text-gray-400 ml-1 truncate">{formatDate(db.createdAt)}</span>
                  </div>
                  <span className="text-[9.5px] font-semibold text-gray-400 px-1.5 py-px rounded bg-gray-100 flex-shrink-0">You</span>
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

          {/* "No more dashboards" placeholder — only when at least one real dashboard exists */}
          {visibleDashboards.length > 0 && (
            <div className="flex flex-col items-center justify-center text-center h-52 rounded-2xl dashed-card bg-white/60 px-4">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-2">
                <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </div>
              <span className="text-[12px] font-semibold text-gray-500">No more dashboards</span>
              <span className="text-[10.5px] text-gray-400 mt-0.5">Create a new one to visualize more data.</span>
            </div>
          )}
        </div>

        {/* Empty filtered state */}
        {visibleDashboards.length === 0 && dashboards.length > 0 && (
          <div className="text-center text-[12px] text-gray-400 mt-6">No dashboards match your search.</div>
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

// ── Filter List ──

function FilterList({ columns, filters, onChange }: {
  columns: { name: string; type: string }[];
  filters: Filter[];
  onChange: (next: Filter[]) => void;
}) {
  const update = (id: string, patch: Partial<Filter>) =>
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: string) => onChange(filters.filter((f) => f.id !== id));
  const add = () =>
    onChange([
      ...filters,
      { id: crypto.randomUUID(), column: columns[0]?.name ?? '', op: '=', value: '' },
    ]);

  return (
    <div className="space-y-1.5">
      {filters.length === 0 && (
        <p className="text-[10px] text-gray-400 italic px-0.5">No filters — chart shows all rows.</p>
      )}
      {filters.map((f) => {
        const col = columns.find((c) => c.name === f.column);
        const isNumeric = col && ['INTEGER', 'DECIMAL', 'BIGINT', 'DOUBLE', 'FLOAT'].includes(col.type.toUpperCase());
        const valueDisabled = f.op === 'isNull' || f.op === 'isNotNull';
        return (
          <div key={f.id} className="flex items-center gap-1">
            <select
              value={f.column}
              onChange={(e) => update(f.id, { column: e.target.value })}
              className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded px-1.5 py-1 text-[10.5px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            <select
              value={f.op}
              onChange={(e) => update(f.id, { op: e.target.value as FilterOp })}
              className="bg-gray-50 border border-gray-200 rounded px-1 py-1 text-[10.5px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {FILTER_OPS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              type={isNumeric && ['>', '>=', '<', '<='].includes(f.op) ? 'number' : 'text'}
              value={f.value}
              onChange={(e) => update(f.id, { value: e.target.value })}
              disabled={valueDisabled}
              placeholder={f.op === 'in' || f.op === 'notIn' ? 'a, b, c' : valueDisabled ? '—' : 'value'}
              className="w-20 bg-gray-50 border border-gray-200 rounded px-1.5 py-1 text-[10.5px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
            />
            <button
              onClick={() => remove(f.id)}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              title="Remove filter"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
      <button
        onClick={add}
        disabled={columns.length === 0}
        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-gray-200 text-[10.5px] text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/40 transition-colors disabled:opacity-40"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add filter
      </button>
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
  const [chartTab, setChartTab] = useState<'type' | 'data' | 'configure'>(editing ? 'configure' : 'type');

  // AI prompt state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiMode, setAiMode] = useState<'chart' | 'dashboard'>('chart');

  const parseChartWidget = (d: Record<string, unknown>): ChartWidgetConfig => {
    const ids = Array.isArray(d.tableIds) ? (d.tableIds as string[]) : d.tableId ? [d.tableId as string] : [tables[0]?.id ?? ''];
    const rawFilters = Array.isArray(d.filters) ? d.filters as Partial<Filter>[] : [];
    const filters: Filter[] = rawFilters
      .filter((f) => f && typeof f.column === 'string')
      .map((f) => ({
        id: f.id ?? crypto.randomUUID(),
        column: f.column!,
        op: (f.op as FilterOp) ?? '=',
        value: typeof f.value === 'string' ? f.value : f.value != null ? String(f.value) : '',
      }));
    const labelTableId = typeof d.labelTableId === 'string' && d.labelTableId.length > 0
      ? d.labelTableId
      : undefined;
    return {
      id: crypto.randomUUID(),
      widgetType: 'chart',
      chartType: (d.chartType as ChartType) ?? 'bar',
      tableIds: ids,
      labelTableId,
      labelColumn: (d.labelColumn as string) ?? '',
      valueColumn: (d.valueColumn as string) ?? '',
      aggregation: (d.aggregation as Aggregation) ?? 'sum',
      topN: typeof d.topN === 'number' ? d.topN : 0,
      dateGrouping: (d.dateGrouping as DateGrouping) ?? 'none',
      filters,
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
  // Cross-table label join: when the labelColumn lives in a different table than the value column
  // (typical for AI-generated star-schema charts), labelTableId points to the dim table.
  const [labelTableId, setLabelTableId] = useState<string | undefined>(
    editing?.widgetType === 'chart' ? editing.labelTableId : undefined
  );
  const [labelColumn, setLabelColumn] = useState(editing?.widgetType === 'chart' ? editing.labelColumn : '');
  const [valueColumn, setValueColumn] = useState(editing?.widgetType === 'chart' ? editing.valueColumn : '');
  const [aggregation, setAggregation] = useState<Aggregation>(editing?.widgetType === 'chart' ? editing.aggregation : 'sum');
  const [topN, setTopN] = useState<number>(editing?.widgetType === 'chart' ? (editing.topN ?? 0) : 0);
  const [dateGrouping, setDateGrouping] = useState<DateGrouping>(editing?.widgetType === 'chart' ? (editing.dateGrouping ?? 'none') : 'none');
  const [filters, setFilters] = useState<Filter[]>(
    editing?.widgetType === 'chart' || editing?.widgetType === 'table'
      ? (editing.filters ?? [])
      : []
  );

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
      setChartTab('configure');
      if (editing.widgetType === 'chart') {
        setChartType(editing.chartType); setTableIds(getTableIds(editing));
        setLabelTableId(editing.labelTableId);
        setLabelColumn(editing.labelColumn); setValueColumn(editing.valueColumn);
        setAggregation(editing.aggregation);
        setTopN(editing.topN ?? 0);
        setDateGrouping(editing.dateGrouping ?? 'none');
        setFilters(editing.filters ?? []);
      } else if (editing.widgetType === 'text') {
        setTextContent(editing.content);
      } else if (editing.widgetType === 'table') {
        setTableIds(editing.tableId ? [editing.tableId] : []);
        setMaxRows(editing.maxRows);
        setFilters(editing.filters ?? []);
      }
    }
  }, [editing]);

  const selectedTables = tables.filter((t) => tableIds.includes(t.id));
  const labelTable = labelTableId ? tables.find((t) => t.id === labelTableId) ?? null : null;

  // Merge columns from all selected tables + the label table (if cross-table join), detect type conflicts
  const { columns, conflicts } = useMemo(() => {
    const colMap = new Map<string, { type: string; tables: string[] }>();
    const conflictList: string[] = [];
    const tablesForCols = [...selectedTables];
    if (labelTable && !tablesForCols.find((t) => t.id === labelTable.id)) {
      tablesForCols.push(labelTable);
    }
    for (const t of tablesForCols) {
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
  }, [selectedTables, labelTable]);

  useEffect(() => {
    // Don't auto-reset columns while editing — would clobber the AI's cross-table picks.
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

  const cleanFilters = filters.filter((f) => f.column);

  const handleSubmit = (keepForm = false) => {
    if (!canSubmit) return;
    if (widgetType === 'chart') {
      const effectiveLabelTableId =
        labelTableId && !tableIds.includes(labelTableId) ? labelTableId : undefined;
      const cfg: ChartWidgetConfig = {
        id: editing?.id ?? crypto.randomUUID(),
        widgetType: 'chart',
        chartType, tableIds,
        labelTableId: effectiveLabelTableId,
        labelColumn, valueColumn, aggregation, topN, dateGrouping,
        filters: cleanFilters,
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
        tableId: editing?.widgetType === 'table' ? editing.tableId : '',
        columns: editing?.widgetType === 'table' ? editing.columns : [],
        filters: cleanFilters,
        title: title || 'Table',
        maxRows,
        style,
      };
      editing ? onUpdate(cfg) : onAdd(cfg);
    }
    if (!editing && !keepForm) { setTitle(''); setTextContent(''); setFilters([]); }
  };

  // Live auto-apply edits: when editing an existing widget, push changes
  // to the parent on a short debounce so the user doesn't have to click
  // "Update Widget" after every tweak.
  const editingIdRef = useRef<string | null>(editing?.id ?? null);
  const skipNextAutoUpdate = useRef(false);
  useEffect(() => {
    if (editing?.id !== editingIdRef.current) {
      editingIdRef.current = editing?.id ?? null;
      skipNextAutoUpdate.current = true;
    }
  }, [editing?.id]);

  useEffect(() => {
    if (!editing) return;
    if (skipNextAutoUpdate.current) {
      skipNextAutoUpdate.current = false;
      return;
    }
    if (!canSubmit) return;
    const t = setTimeout(() => {
      if (widgetType === 'chart') {
        const effectiveLabelTableId =
          labelTableId && !tableIds.includes(labelTableId) ? labelTableId : undefined;
        onUpdate({
          id: editing.id,
          widgetType: 'chart',
          chartType, tableIds,
          labelTableId: effectiveLabelTableId,
          labelColumn, valueColumn, aggregation, topN, dateGrouping,
          filters: cleanFilters,
          title: title || `${valueColumn} by ${labelColumn}`,
          style,
        });
      } else if (widgetType === 'text') {
        onUpdate({
          id: editing.id,
          widgetType: 'text',
          title: title || 'Text',
          content: textContent,
          style,
        });
      } else if (widgetType === 'table') {
        onUpdate({
          id: editing.id,
          widgetType: 'table',
          tableId: editing.widgetType === 'table' ? editing.tableId : '',
          columns: editing.widgetType === 'table' ? editing.columns : [],
          filters: cleanFilters,
          title: title || 'Table',
          maxRows,
          style,
        });
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, widgetType, chartType, tableIds.join(','), labelTableId, labelColumn, valueColumn, aggregation, topN, dateGrouping, JSON.stringify(cleanFilters), textContent, maxRows, title, JSON.stringify(style), canSubmit]);

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
              data-ai-prompt
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
            {/* Tab bar: jumps to section anchors below */}
            <div className="px-4 pb-3 sticky top-0 z-10 bg-white pt-1">
              <div className="flex gap-1 p-1 rounded-lg bg-gray-100">
                {([
                  { value: 'type' as const, label: 'Chart Type', anchor: 'toolbox-section-type' },
                  { value: 'data' as const, label: 'Data', anchor: 'toolbox-section-data' },
                  { value: 'configure' as const, label: 'Configure', anchor: 'toolbox-section-configure' },
                ]).map(t => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setChartTab(t.value);
                      const el = document.getElementById(t.anchor);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                      chartTab === t.value
                        ? 'bg-white text-accent-strong shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section: Chart Type */}
            <div id="toolbox-section-type" className="px-4 pb-3 scroll-mt-14" data-toolbox-chart-types>
              <p className="text-[10px] text-gray-400 mb-2 uppercase tracking-wider font-semibold">Choose chart type</p>
              <div className="grid grid-cols-4 gap-1.5">
                {CHART_TYPES.map((ct) => (
                  <button key={ct.value} onClick={() => setChartType(ct.value)}
                    className={`flex flex-col items-center gap-0.5 py-2.5 rounded-lg border text-[10px] transition-all ${
                      chartType === ct.value ? 'border-accent bg-accent-soft text-accent-strong font-semibold shadow-sm ring-1 ring-accent/40' : 'border-gray-100 text-gray-400 hover:bg-gray-50 hover:border-gray-200'
                    }`}>
                    {CHART_ICON_MAP[ct.value](chartType === ct.value)}
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section: Data */}
            <div id="toolbox-section-data" className="px-4 pb-3 scroll-mt-14">
              <p className="text-[10px] text-gray-400 mb-2 uppercase tracking-wider font-semibold">Select your data</p>
              <div className="flex items-center gap-2 mb-2.5">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>
                <select value={tableIds[0] ?? ''} onChange={(e) => { setTableIds([e.target.value]); setLabelColumn(''); setValueColumn(''); }}
                  className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700 font-medium focus:outline-none focus:ring-1 focus:ring-accent truncate">
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

            {/* Section: Configure (Mapping) */}
            <div id="toolbox-section-configure" className="scroll-mt-14">
              <Section title="Configure your chart">
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
            </div>

            {/* Filters (always visible across tabs) */}
            <Section title={`Filters${cleanFilters.length > 0 ? ` (${cleanFilters.length})` : ''}`} defaultOpen={cleanFilters.length > 0}>
              <FilterList columns={columns} filters={filters} onChange={setFilters} />
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
          <>
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
            {editing?.widgetType === 'table' && columns.length > 0 && (
              <Section title={`Filters${cleanFilters.length > 0 ? ` (${cleanFilters.length})` : ''}`} defaultOpen={cleanFilters.length > 0}>
                <FilterList columns={columns} filters={filters} onChange={setFilters} />
              </Section>
            )}
          </>
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
      <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0 space-y-1.5">
        {editing ? (
          <>
            <button onClick={onCancelEdit}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-accent hover:opacity-95 transition-colors shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              Done
            </button>
            <p className="text-center text-[10.5px] text-gray-400 flex items-center justify-center gap-1">
              <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              Changes apply automatically
            </p>
          </>
        ) : (
          <>
            <button onClick={() => handleSubmit(false)} disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-accent hover:opacity-95 disabled:bg-gray-200 disabled:text-gray-400 transition-colors shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add to Dashboard
            </button>
            <button onClick={() => handleSubmit(true)} disabled={!canSubmit}
              className="w-full px-3 py-2 rounded-xl text-[11.5px] font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:border-gray-100 transition-colors">
              Add and configure another
            </button>
          </>
        )}
      </div>

      {/* ── Help footer ── */}
      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between text-[10.5px] text-gray-400 flex-shrink-0 bg-gray-50/40">
        <span className="truncate">Need help getting started?</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const el = document.querySelector('[data-ai-prompt]') as HTMLInputElement | null;
              setAiMode('chart');
              el?.focus();
            }}
            className="font-semibold text-purple-500 hover:text-purple-700 transition-colors"
          >
            Ask AI
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Share Button + Dialog ──

function ShareButton({ dashboardId }: { dashboardId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Look up an existing share whenever the dashboard id changes.
  useEffect(() => {
    setToken(null);
    setCopied(false);
    api.getDashboardShare(dashboardId).then((res) => {
      if (res.success && res.data?.share) setToken(res.data.share.token);
    });
  }, [dashboardId]);

  const shareUrl = token ? `${window.location.origin}/share/${token}` : '';

  const handleCreate = async () => {
    setLoading(true);
    const res = await api.createDashboardShare(dashboardId);
    setLoading(false);
    if (res.success && res.data) setToken(res.data.share.token);
  };

  const handleRevoke = async () => {
    if (!confirm('Revoke this share link? Anyone with the link will lose access.')) return;
    setLoading(true);
    const res = await api.revokeDashboardShare(dashboardId);
    setLoading(false);
    if (res.success) setToken(null);
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
        </svg>
        Share
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Share dashboard</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Anyone with the link can view the charts and text in this dashboard. Tables are not shared.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4">
              {token ? (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={shareUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 font-mono"
                    />
                    <button
                      onClick={handleCopy}
                      className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <div className="p-3 bg-white border border-gray-200 rounded-lg">
                      <QRCodeSVG
                        value={shareUrl}
                        size={180}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">Scan with a phone to open the dashboard</p>
                  </div>
                  <button
                    onClick={handleRevoke}
                    disabled={loading}
                    className="mt-3 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    Revoke link
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating link…' : 'Create share link'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Dashboard ──

// ── Empty editor canvas — "Build your chart" hero ──

function BuildYourChartEmpty({ dashboards, activeId, tables, onClone }: {
  dashboards: DashboardInstance[];
  activeId: string | null;
  tables: TableInfo[];
  onClone: (cfg: ChartWidgetConfig) => void;
}) {
  const recentCharts = useMemo(() => {
    const ordered = [...dashboards].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const seen = new Set<string>();
    const out: ChartWidgetConfig[] = [];
    for (const d of ordered) {
      if (d.id === activeId) continue;
      for (const w of d.widgets) {
        const wt = w.widgetType ?? 'chart';
        if (wt !== 'chart') continue;
        const cw = w as ChartWidgetConfig;
        const sig = `${cw.title}|${cw.chartType}|${cw.labelColumn}|${cw.valueColumn}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(cw);
        if (out.length >= 3) break;
      }
      if (out.length >= 3) break;
    }
    return out;
  }, [dashboards, activeId]);

  const focusToolbox = (selector: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = el.matches('input, textarea, select, button')
        ? el
        : (el.querySelector('input, textarea, select, button') as HTMLElement | null);
      focusable?.focus();
    });
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-400 font-semibold">New Dashboard</div>
        <h2 className="text-[20px] font-bold text-gray-900 tracking-tight">Build your chart</h2>
        <p className="text-[13px] text-gray-500 mt-1">Follow the steps on the right to choose a chart and add it to your dashboard.</p>

        {/* Two-card chooser */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
          <button
            onClick={() => focusToolbox('[data-toolbox-chart-types]')}
            className="group flex flex-col items-start text-left p-5 rounded-2xl border border-gray-200 bg-white tile-shadow hover:border-accent hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-accent-soft group-hover:bg-accent-soft-active flex items-center justify-center mb-3 transition-colors">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <span className="text-[13.5px] font-semibold text-gray-800">Add Chart</span>
            <span className="text-[11.5px] text-gray-500 mt-1">Choose chart type and configure data manually.</span>
          </button>
          <button
            onClick={() => focusToolbox('[data-ai-prompt]')}
            className="group flex flex-col items-start text-left p-5 rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50 to-indigo-50 hover:border-purple-300 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-white/80 border border-purple-100 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <span className="text-[13.5px] font-semibold text-gray-800">Generate with AI</span>
            <span className="text-[11.5px] text-gray-500 mt-1">Describe the insight you want to visualize.</span>
          </button>
        </div>

        {/* "Your dashboard is empty" subhead */}
        <div className="mt-8 rounded-2xl border border-dashed border-gray-200 bg-white/60 px-6 py-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-2">
            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="text-[13px] font-semibold text-gray-600">Your dashboard is empty</p>
          <p className="text-[11.5px] text-gray-400 mt-1">Add a chart or generate one with AI to start visualizing your data.</p>
        </div>

        <RecentChartsStrip widgets={recentCharts} tables={tables} onClone={onClone} />
      </div>
    </div>
  );
}

export default function Dashboard({ tables, onImport }: DashboardProps) {
  const [dashboards, setDashboards] = useState<DashboardInstance[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WidgetConfig | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);

  // Tracks which dashboard ids have already been pushed to Supabase so we know
  // whether to POST (create) or PUT (update) on the next save.
  const persistedIdsRef = useRef<Set<string>>(new Set());
  // Per-dashboard debounce timers for save bursts (drag, resize, edit).
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Skip pushing changes back to the server during the initial hydration.
  const hydratedRef = useRef(false);

  const activeDashboard = dashboards.find(d => d.id === activeId) ?? null;
  const widgets = activeDashboard?.widgets ?? [];
  const layouts = activeDashboard?.layouts ?? {};

  // Initial load: hydrate from the local cache instantly, then refetch
  // from Supabase in the background. Migrate any legacy localStorage entries.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = user?.id ?? null;
      const cacheKey = uid ? `dashboards:${uid}` : null;

      if (cacheKey) {
        const cached = readCache<DashboardRecord[]>(cacheKey);
        if (cached?.length) {
          const list = cached.map(recordToInstance);
          persistedIdsRef.current = new Set(list.map(d => d.id));
          setDashboards(list);
          hydratedRef.current = true;
        }
      }

      try { await migrateLocalToSupabase(); } catch { /* non-fatal */ }
      const res = await api.listDashboards();
      if (cancelled) return;
      if (res.success && res.data) {
        const list = res.data.map(recordToInstance);
        persistedIdsRef.current = new Set(list.map(d => d.id));
        setDashboards(list);
        if (cacheKey) writeCache(cacheKey, res.data);
      }
      hydratedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced save: whenever the dashboards array changes, sync each one to
  // Supabase. New ones are POSTed once; subsequent edits are PUTs.
  // Also mirror the array into the local cache so the next load is instant.
  useEffect(() => {
    if (!hydratedRef.current) return;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const records: DashboardRecord[] = dashboards.map(d => ({
          id: d.id,
          name: d.name,
          widgets: d.widgets,
          layouts: d.layouts,
          created_at: d.createdAt,
          updated_at: new Date().toISOString(),
        }));
        writeCache(`dashboards:${user.id}`, records);
      }
    });
    for (const d of dashboards) {
      const timer = saveTimersRef.current.get(d.id);
      if (timer) clearTimeout(timer);
      saveTimersRef.current.set(d.id, setTimeout(() => {
        if (persistedIdsRef.current.has(d.id)) {
          void api.updateDashboard(d.id, {
            name: d.name,
            widgets: d.widgets,
            layouts: d.layouts,
          });
        } else {
          persistedIdsRef.current.add(d.id);
          void api.createDashboard({
            id: d.id,
            name: d.name,
            widgets: d.widgets,
            layouts: d.layouts,
          });
        }
      }, 400));
    }
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
    persistedIdsRef.current.delete(dbId);
    const t = saveTimersRef.current.get(dbId);
    if (t) { clearTimeout(t); saveTimersRef.current.delete(dbId); }
    void api.deleteDashboard(dbId);
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
  const [renamingActive, setRenamingActive] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

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

  // No active dashboard — show Power BI-style home
  if (!activeDashboard) {
    return (
      <div className="flex-1 flex flex-col min-h-0" style={{ background: 'var(--page-bg)' }}>
        {tables.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="kpi-grad-1 tile-shadow rounded-2xl px-10 py-12 max-w-md w-full text-center fade-in">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-white/70 backdrop-blur border border-white/60 flex items-center justify-center mb-4 shadow-sm">
                <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <h3 className="text-[15px] font-semibold text-gray-900 mb-1">No data to visualize</h3>
              <p className="text-[13px] text-gray-500 mb-5">Import a CSV, Excel, or JSON file to start building charts.</p>
              <button onClick={onImport} className="inline-flex items-center gap-2 px-4 h-9 bg-accent text-white rounded-lg text-[13px] font-medium transition-colors shadow-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Import data
              </button>
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
        {renamingActive ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={e => setRenameDraft(e.target.value)}
            onBlur={() => {
              const next = renameDraft.trim() || activeDashboard.name;
              if (next !== activeDashboard.name) handleRenameDashboard(activeDashboard.id, next);
              setRenamingActive(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const next = renameDraft.trim() || activeDashboard.name;
                if (next !== activeDashboard.name) handleRenameDashboard(activeDashboard.id, next);
                setRenamingActive(false);
              }
              if (e.key === 'Escape') setRenamingActive(false);
            }}
            className="text-sm font-semibold text-gray-700 px-1.5 py-0.5 border border-accent/60 rounded-md focus:outline-none focus:ring-1 focus:ring-accent min-w-0"
          />
        ) : (
          <h2
            className="text-sm font-semibold text-gray-700 truncate cursor-pointer hover:text-accent-strong transition-colors"
            onClick={() => { setRenameDraft(activeDashboard.name); setRenamingActive(true); }}
            title="Click to rename"
          >
            {activeDashboard.name}
          </h2>
        )}
        <span className="text-[11px] text-gray-400">{widgets.length} widget{widgets.length !== 1 ? 's' : ''}</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1 text-[10.5px] text-gray-400" title="Changes save automatically">
            <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Saved
          </span>
          <ShareButton dashboardId={activeDashboard.id} />
        </div>
      </div>

      {/* Canvas + Toolbox */}
      <div className="flex-1 flex min-h-0">
        <div ref={canvasRef} className="flex-1 overflow-auto bg-gray-50 min-w-0" onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t === e.currentTarget || t.classList.contains('react-grid-layout') || t.classList.contains('p-4')) setEditing(null);
        }}>
          {widgets.length === 0 ? (
            <BuildYourChartEmpty
              dashboards={dashboards}
              activeId={activeId}
              tables={tables}
              onClone={handleAdd}
            />
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
