import { useEffect, useState } from 'react';
import { api, TableInfo, TableData } from '../api';

interface TableGridProps {
  table: TableInfo;
  onNormalize: () => void;
  onStarSchema: () => void;
  onDelete: () => void;
}

function FieldTypeIcon({ type }: { type: string }) {
  const t = type.toUpperCase();
  if (t === 'INTEGER' || t === 'DECIMAL' || t === 'BIGINT' || t === 'DOUBLE' || t === 'FLOAT')
    return <span className="field-icon field-icon-number">#</span>;
  if (t === 'BOOLEAN')
    return <span className="field-icon field-icon-bool">✓</span>;
  if (t === 'DATE' || t === 'TIMESTAMP')
    return <span className="field-icon field-icon-date">⏱</span>;
  return <span className="field-icon field-icon-text">T</span>;
}

export default function TableGrid({ table, onNormalize, onStarSchema, onDelete }: TableGridProps) {
  const [data, setData] = useState<TableData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<Record<string, unknown> | null>(null);
  const pageSize = 100;

  useEffect(() => {
    setPage(1);
    setData(null);
    setExpandedRow(null);
  }, [table.id]);

  useEffect(() => {
    setLoading(true);
    api.getTableData(table.id, page, pageSize)
      .then((r) => { if (r.success && r.data) setData(r.data); })
      .finally(() => setLoading(false));
  }, [table.id, page]);

  const startRow = (page - 1) * pageSize;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white">
      {/* ── Toolbar (Baserow style) ── */}
      <div className="toolbar">
        <div className="flex items-center gap-1">
          {/* Grid view label */}
          <div className="toolbar-btn font-semibold text-gray-800">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125" />
            </svg>
            Grid
          </div>

          <div className="toolbar-sep" />

          {/* Action buttons */}
          <button onClick={onNormalize} className="toolbar-btn">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Normalize
          </button>
          <button onClick={onStarSchema} className="toolbar-btn">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            Star Schema
          </button>
          <button onClick={onDelete} className="toolbar-btn text-gray-400 hover:text-red-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        </div>

        {/* Right side - search */}
        <button className="toolbar-btn">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </button>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 overflow-auto relative min-h-0">
        {loading && !data ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading...</div>
        ) : data ? (
          <table className="grid-table">
            <thead>
              <tr>
                <th className="grid-rownum-header">
                  <input type="checkbox" className="w-3 h-3 accent-blue-500" readOnly />
                </th>
                {table.columns.map((col) => (
                  <th key={col.name} className="grid-header-cell">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <FieldTypeIcon type={col.type} />
                      <span className="truncate">{col.name}</span>
                    </div>
                    <svg className="w-3 h-3 text-gray-300 flex-shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr
                  key={i}
                  className="grid-row"
                  onClick={() => setExpandedRow(row)}
                >
                  <td className="grid-rownum">{startRow + i + 1}</td>
                  {data.columns.map((col) => (
                    <td key={col} className="grid-cell">
                      <span className="block truncate">{formatValue(row[col])}</span>
                    </td>
                  ))}
                </tr>
              ))}
              {/* Add row placeholder */}
              <tr className="grid-add-row">
                <td className="grid-rownum">
                  <svg className="w-3 h-3 text-gray-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </td>
                <td colSpan={table.columns.length} className="grid-cell text-gray-300 text-xs">
                </td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>

      {/* ── Footer (Baserow style) ── */}
      {data && (
        <div className="grid-footer">
          <div className="flex items-center gap-3">
            {/* Pagination */}
            <FooterBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </FooterBtn>
            <FooterBtn onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.totalPages}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </FooterBtn>
            <span className="text-[12px] text-gray-500">
              {data.pagination.totalRows.toLocaleString()} rows
              {data.pagination.totalPages > 1 && (
                <span className="text-gray-400 ml-1">
                  &middot; page {page}/{data.pagination.totalPages}
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* ── Row Detail Modal ── */}
      {expandedRow && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] bg-black/20"
          onClick={() => setExpandedRow(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[80vh] flex flex-col border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-[15px] font-semibold text-gray-900">Row Detail</h3>
              <button
                onClick={() => setExpandedRow(null)}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-3">
              {table.columns.map((col) => (
                <div key={col.name} className="flex gap-4 items-start">
                  <div className="w-[140px] flex-shrink-0 flex items-center gap-1.5 pt-0.5">
                    <FieldTypeIcon type={col.type} />
                    <span className="text-[13px] font-medium text-gray-500 truncate">{col.name}</span>
                  </div>
                  <div className="flex-1 text-[13px] text-gray-900 break-all min-h-[24px]">
                    {formatValue(expandedRow[col.name])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FooterBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      {children}
    </button>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toLocaleDateString();
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    // DuckDB DATE: {days: N} — days since Unix epoch (1970-01-01)
    if ('days' in obj && typeof obj.days === 'number') {
      const d = new Date(obj.days * 86400000);
      return d.toISOString().slice(0, 10);
    }
    // DuckDB TIMESTAMP: {micros: bigint} — microseconds since epoch
    if ('micros' in obj) {
      const micros = typeof obj.micros === 'bigint' ? Number(obj.micros) : Number(obj.micros);
      const d = new Date(micros / 1000);
      return d.toISOString().replace('T', ' ').slice(0, 19);
    }
    if ('toISOString' in obj && typeof obj.toISOString === 'function') return (obj.toISOString as () => string)();
    if ('year' in obj && 'month' in obj && 'day' in obj) {
      const y = obj.year, m = String(obj.month).padStart(2, '0'), d = String(obj.day).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    try { return JSON.stringify(v); } catch { return '[object]'; }
  }
  return String(v);
}
