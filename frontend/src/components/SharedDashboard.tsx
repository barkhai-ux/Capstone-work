import { useEffect, useMemo, useState, useRef } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
  RadialLinearScale,
} from 'chart.js';
import { Bar, Pie, Doughnut, Line, Scatter, Radar, PolarArea } from 'react-chartjs-2';
import { GridLayout, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { api } from '../api';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement,
  RadialLinearScale, Title, Tooltip, Legend, Filler,
);

// ── Mirrors of the live-dashboard widget shapes (viewer is read-only). ──

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

const DEFAULT_COLORS = ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'];

const DEFAULT_STYLE: StyleConfig = {
  bgColor: '#ffffff', borderColor: '#e5e7eb', titleColor: '#1f2937', titleSize: 13,
  chartColor: '#3b82f6', chartColors: [...DEFAULT_COLORS], lineColor: '#3b82f6',
  gridColor: '#f3f4f6', axisLabelColor: '#6b7280', axisLabelSize: 11,
  xAxisLabel: '', yAxisLabel: '', showLegend: false, legendPosition: 'bottom',
  borderRadius: 12,
};

type Aggregation = 'sum' | 'avg' | 'count' | 'min' | 'max';
type DateGrouping = 'none' | 'yearly' | 'quarterly' | 'monthly';
type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'radar' | 'polarArea';

interface ChartWidget {
  id: string;
  widgetType: 'chart';
  chartType: ChartType;
  title: string;
  labelColumn: string;
  valueColumn: string;
  aggregation: Aggregation;
  topN: number;
  dateGrouping: DateGrouping;
  style?: StyleConfig;
}

interface TextWidget {
  id: string;
  widgetType: 'text';
  title: string;
  content: string;
  style?: StyleConfig;
}

type Widget = ChartWidget | TextWidget;

interface WidgetLayout { x: number; y: number; w: number; h: number; }

// ── Helpers (mirror Dashboard.tsx) ──

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
    if ('days' in obj && typeof obj.days === 'number') {
      return new Date(obj.days * 86400000).toISOString().slice(0, 10);
    }
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

// ── Chart widget (read-only, public-data-fetcher) ──

function SharedChartWidget({ token, config }: { token: string; config: ChartWidget }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preAggregated, setPreAggregated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getPublicSharedWidgetData(token, config.id).then((res) => {
      if (cancelled) return;
      if (!res.success || !res.data) {
        setError(res.error ?? 'Failed to load chart');
        setRows([]);
      } else {
        setRows(res.data.rows);
        setPreAggregated(res.data.type === 'joined' && config.chartType !== 'scatter');
      }
    }).catch(() => {
      if (cancelled) return;
      setError('Network error');
      setRows([]);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, config.id, config.chartType]);

  const s = config.style ?? DEFAULT_STYLE;
  const isLineOrArea = config.chartType === 'line' || config.chartType === 'area';

  const chartData = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    if (config.chartType === 'scatter') {
      const points: { x: number; y: number }[] = [];
      for (const row of rows) {
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
      entries = rows.map((row) => {
        const label = resolveLabel(row[config.labelColumn]);
        const val = resolveValue(row[config.valueColumn]) ?? 0;
        return [label, val] as const;
      });
    } else {
      const groups: Record<string, number[]> = {};
      for (const row of rows) {
        const label = dg !== 'none'
          ? resolveDateLabel(row[config.labelColumn], dg)
          : resolveLabel(row[config.labelColumn]);
        const val = resolveValue(row[config.valueColumn]);
        if (!groups[label]) groups[label] = [];
        if (val !== null) groups[label].push(val);
      }
      const limit = config.topN ?? 0;
      const mapped = Object.entries(groups).map(
        ([label, vals]) => [label, aggregate(vals, config.aggregation)] as const
      );
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
        backgroundColor: isLineOrArea
          ? `${s.lineColor}18`
          : config.chartType === 'radar'
            ? `${colors[0]}33`
            : colors.slice(0, entries.length),
        borderColor: isLineOrArea
          ? s.lineColor
          : config.chartType === 'radar'
            ? colors[0]
            : config.chartType === 'bar'
              ? colors.slice(0, entries.length).map((c) => c + 'cc')
              : colors.slice(0, entries.length),
        fill: isLineOrArea || config.chartType === 'radar',
        borderWidth: isLineOrArea ? 2.5 : config.chartType === 'radar' ? 2 : (config.chartType === 'bar' ? 0 : 2),
        pointBackgroundColor: isLineOrArea || config.chartType === 'radar' ? s.lineColor : undefined,
        pointRadius: config.chartType === 'radar' ? 3 : undefined,
      }],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, preAggregated, config, s]);

  // Chart.js options identical to the authenticated dashboard.
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
          callback: function (this: unknown, _val: unknown, index: number) {
            const label = (chartData as { labels?: unknown[] } | null)?.labels?.[index];
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
    elements: { arc: { borderWidth: 2, borderColor: s.bgColor } },
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
      className="h-full flex flex-col overflow-hidden shadow-sm"
      style={{ background: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: s.borderRadius }}
    >
      <div className="px-3 py-2.5 flex-shrink-0">
        <h3 className="font-semibold truncate leading-tight" style={{ fontSize: s.titleSize, color: s.titleColor }}>
          {config.title}
        </h3>
        <p className="text-[10px] text-gray-400 truncate mt-0.5">{config.aggregation}</p>
      </div>
      <div className="flex-1 px-3 pb-3 pt-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-xs text-red-500 px-2 text-center">{error}</div>
        ) : !chartData ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-400">No data</div>
        ) : config.chartType === 'bar' ? (
          <Bar data={chartData as never} options={axisOpts} />
        ) : config.chartType === 'line' || config.chartType === 'area' ? (
          <Line data={chartData as never} options={axisOpts} />
        ) : config.chartType === 'scatter' ? (
          <Scatter data={chartData as never} options={axisOpts} />
        ) : config.chartType === 'radar' ? (
          <Radar data={chartData as never} options={radarOpts} />
        ) : config.chartType === 'polarArea' ? (
          <PolarArea data={chartData as never} options={circOpts} />
        ) : config.chartType === 'pie' ? (
          <Pie data={chartData as never} options={circOpts} />
        ) : (
          <Doughnut data={chartData as never} options={circOpts} />
        )}
      </div>
    </div>
  );
}

function SharedTextWidget({ config }: { config: TextWidget }) {
  const s = config.style ?? DEFAULT_STYLE;
  return (
    <div
      className="h-full flex flex-col overflow-hidden shadow-sm"
      style={{ background: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: s.borderRadius }}
    >
      <div className="px-3 py-2 flex-shrink-0">
        <h3 className="font-semibold truncate leading-tight" style={{ fontSize: s.titleSize, color: s.titleColor }}>
          {config.title || 'Text'}
        </h3>
      </div>
      <div className="flex-1 w-full px-4 pb-3 text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: s.axisLabelColor }}>
        {config.content}
      </div>
    </div>
  );
}

// ── Main viewer ──

export default function SharedDashboard({ token }: { token: string }) {
  const [name, setName] = useState<string>('');
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [layouts, setLayouts] = useState<Record<string, WidgetLayout>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getPublicSharedDashboard(token).then((res) => {
      if (cancelled) return;
      if (!res.success || !res.data) {
        setError(res.error ?? 'This share link is no longer available');
      } else {
        setName(res.data.name);
        setWidgets(res.data.widgets as unknown as Widget[]);
        setLayouts((res.data.layouts ?? {}) as Record<string, WidgetLayout>);
      }
    }).catch(() => {
      if (!cancelled) setError('Network error');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const gridLayout: Layout = useMemo(() => {
    let nextY = 0;
    return widgets.map((w) => {
      const l = layouts[w.id];
      if (l) return { i: w.id, x: l.x, y: l.y, w: l.w, h: l.h };
      // Fallback for any widget without a saved layout: stack vertically.
      const item = { i: w.id, x: 0, y: nextY, w: 6, h: 4 };
      nextY += 4;
      return item;
    });
  }, [widgets, layouts]);

  const gridCfg = useMemo(() => ({ cols: 12, rowHeight: 60 }), []);
  const dragCfg = useMemo(() => ({ enabled: false }), []);
  const resizeCfg = useMemo(() => ({ enabled: false }), []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-400">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="text-base font-semibold text-gray-700">Share unavailable</div>
        <div className="mt-2 text-sm text-gray-500 text-center max-w-md">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-700 truncate">{name}</h2>
        <span className="text-[11px] text-gray-400">
          {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto text-[11px] text-gray-400">Shared dashboard</div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto">
        {widgets.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            This dashboard has no shareable widgets.
          </div>
        ) : (
          <GridLayout
            className="p-4"
            layout={gridLayout}
            gridConfig={gridCfg}
            dragConfig={dragCfg}
            resizeConfig={resizeCfg}
            width={Math.max(width - 32, 320)}
          >
            {widgets.map((w) => (
              <div key={w.id}>
                {w.widgetType === 'chart' ? (
                  <SharedChartWidget token={token} config={w} />
                ) : (
                  <SharedTextWidget config={w} />
                )}
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}
