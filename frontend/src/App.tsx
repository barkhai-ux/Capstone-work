import { useState, useEffect, useCallback } from 'react';
import { api, TableInfo } from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TableGrid from './components/TableGrid';
import AskData from './components/AskData';
import UploadModal from './components/UploadModal';
import NormalizationModal from './components/NormalizationModal';
import StarSchemaModal from './components/StarSchemaModal';
import { Toast, ToastState } from './components/Toast';

interface ModalState {
  type: 'upload' | 'normalize' | 'star-schema' | null;
  tableId?: string;
  tableName?: string;
}

export default function App() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'table' | 'ask-data'>('dashboard');
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [loading, setLoading] = useState(true);

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
      showToast('Table deleted');
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tables={tables}
        selectedId={selectedId}
        view={view}
        onSelect={(id) => { setSelectedId(id); setView('table'); }}
        onDashboard={() => { setView('dashboard'); setSelectedId(null); }}
        onAskData={() => { setView('ask-data'); setSelectedId(null); }}
        onImport={() => setModal({ type: 'upload' })}
        onDelete={handleDelete}
        onNormalize={openNormalize}
        onStarSchema={openStarSchema}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
            Loading...
          </div>
        ) : view === 'ask-data' ? (
          <AskData />
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

      {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
