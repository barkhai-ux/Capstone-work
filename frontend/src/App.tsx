import { useState, useEffect, useCallback } from 'react';
import { api, TableInfo, QueryResult } from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TableGrid from './components/TableGrid';
import UploadModal from './components/UploadModal';
import NormalizationModal from './components/NormalizationModal';
import StarSchemaModal from './components/StarSchemaModal';

interface ModalState {
  type: 'upload' | 'normalize' | 'star-schema' | null;
  tableId?: string;
  tableName?: string;
}

function formatQueryValue(v: unknown): string {
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

function QueryResultsView({ result, error, onClose }: { result: QueryResult | null; error: string | null; onClose: () => void }) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
          Query Results
          {result && <span className="text-xs text-gray-400 font-normal">({result.totalRows} row{result.totalRows !== 1 ? 's' : ''})</span>}
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Back to table
        </button>
      </div>

      {error ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      ) : result && result.rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          No results found
        </div>
      ) : result ? (
        <div className="flex-1 overflow-auto min-h-0">
          <table className="grid-table">
            <thead>
              <tr>
                <th className="row-number-cell">#</th>
                {result.columns.map((col) => (
                  <th key={col}>
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{col}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  <td className="row-number-cell">{i + 1}</td>
                  {result.columns.map((col) => (
                    <td key={col}>{formatQueryValue((row as Record<string, unknown>)[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'table' | 'query'>('dashboard');
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [loading, setLoading] = useState(true);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const loadTables = useCallback(async () => {
    const res = await api.listTables();
    if (res.success && res.data) {
      setTables(res.data);
      return res.data;
    }
    return [];
  }, []);

  useEffect(() => {
    loadTables().finally(() => setLoading(false));
  }, []);

  const selectedTable = tables.find((t) => t.id === selectedId) ?? null;

  const handleImportSuccess = async () => {
    setModal({ type: null });
    const t = await loadTables();
    if (t.length > 0) {
      setSelectedId(t[t.length - 1].id);
      setView('table');
    }
  };

  const handleDelete = async (id: string) => {
    const name = tables.find((t) => t.id === id)?.name;
    if (!confirm(`Delete table "${name}"? This cannot be undone.`)) return;
    const res = await api.deleteTable(id);
    if (res.success) {
      const updated = tables.filter((t) => t.id !== id);
      setTables(updated);
      if (selectedId === id) setSelectedId(updated[0]?.id ?? null);
    }
  };

  const handleApplied = async () => {
    const t = await loadTables();
    // Keep selection if table still exists, else select first
    if (!t.find((tb) => tb.id === selectedId)) {
      setSelectedId(t[0]?.id ?? null);
    }
  };

  const openNormalize = (id: string) => {
    const t = tables.find((tb) => tb.id === id);
    if (t) setModal({ type: 'normalize', tableId: id, tableName: t.name });
  };

  const openStarSchema = (id: string) => {
    const t = tables.find((tb) => tb.id === id);
    if (t) setModal({ type: 'star-schema', tableId: id, tableName: t.name });
  };

  const handleQuery = async (tableId: string, question: string) => {
    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);
    setView('query');
    try {
      const res = await api.queryTable(tableId, question);
      if (res.success && res.data) {
        setQueryResult(res.data);
      } else {
        setQueryError(res.error ?? res.message ?? 'Query failed');
      }
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tables={tables}
        selectedId={selectedId}
        view={view}
        onSelect={(id) => { setSelectedId(id); setView('table'); setQueryResult(null); setQueryError(null); }}
        onDashboard={() => { setView('dashboard'); setSelectedId(null); setQueryResult(null); setQueryError(null); }}
        onImport={() => setModal({ type: 'upload' })}
        onDelete={handleDelete}
        onNormalize={openNormalize}
        onStarSchema={openStarSchema}
        onQuery={handleQuery}
        queryLoading={queryLoading}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
            Loading...
          </div>
        ) : view === 'query' && (queryResult || queryError || queryLoading) ? (
          queryLoading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-sm text-gray-400">Querying your data...</span>
              </div>
            </div>
          ) : (
            <QueryResultsView
              result={queryResult}
              error={queryError}
              onClose={() => { setQueryResult(null); setQueryError(null); setView(selectedId ? 'table' : 'dashboard'); }}
            />
          )
        ) : view === 'table' && selectedTable ? (
          <TableGrid
            table={selectedTable}
            onNormalize={() => openNormalize(selectedTable.id)}
            onStarSchema={() => openStarSchema(selectedTable.id)}
            onDelete={() => handleDelete(selectedTable.id)}
          />
        ) : (
          <Dashboard
            tables={tables}
            onSelectTable={() => {}}
            onImport={() => setModal({ type: 'upload' })}
          />
        )}
      </div>

      {/* Modals */}
      <UploadModal
        open={modal.type === 'upload'}
        onClose={() => setModal({ type: null })}
        onSuccess={handleImportSuccess}
      />

      {modal.type === 'normalize' && modal.tableId && modal.tableName && (
        <NormalizationModal
          open
          tableId={modal.tableId}
          tableName={modal.tableName}
          onClose={() => setModal({ type: null })}
          onApplied={handleApplied}
        />
      )}

      {modal.type === 'star-schema' && modal.tableId && modal.tableName && (
        <StarSchemaModal
          open
          tableId={modal.tableId}
          tableName={modal.tableName}
          onClose={() => setModal({ type: null })}
          onApplied={handleApplied}
        />
      )}
    </div>
  );
}
