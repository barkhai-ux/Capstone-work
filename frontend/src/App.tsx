import { useState, useEffect, useCallback } from 'react';
import { api, TableInfo, DatabaseRecord, setActiveDatabaseId } from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TableGrid from './components/TableGrid';
import AskData from './components/AskData';
import UploadModal from './components/UploadModal';
import NormalizationModal from './components/NormalizationModal';
import StarSchemaModal from './components/StarSchemaModal';
import AuthPage from './components/AuthPage';
import { Toast, ToastState } from './components/Toast';
import { useAuth } from './auth';

interface ModalState {
  type: 'upload' | 'normalize' | 'star-schema' | null;
  tableId?: string;
  tableName?: string;
}

export default function App() {
  const { session, loading: authLoading } = useAuth();
  const [databases, setDatabases] = useState<DatabaseRecord[]>([]);
  const [activeDbId, setActiveDbId] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ message, type, id: Date.now() });
  const [view, setView] = useState<'dashboard' | 'table' | 'ask-data'>('dashboard');
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [loading, setLoading] = useState(true);

  const loadTables = useCallback(async () => {
    const res = await api.listTables();
    if (res.success && res.data) {
      setTables(res.data);
      return res.data;
    }
    setTables([]);
    return [];
  }, []);

  // Whenever the active database changes, mirror it into api.ts so every
  // request carries the X-Database-Id header.
  useEffect(() => {
    setActiveDatabaseId(activeDbId);
  }, [activeDbId]);

  // On sign-in: load databases (auto-creating a default if needed) and pick
  // the first one. On sign-out: clear everything.
  useEffect(() => {
    if (!session) {
      setDatabases([]);
      setActiveDbId(null);
      setTables([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await api.listDatabases();
      if (cancelled) return;
      if (res.success && res.data) {
        setDatabases(res.data.databases);
        const first = res.data.databases[0]?.id ?? res.data.defaultDatabaseId;
        setActiveDbId(first ?? null);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  // Reload the table list whenever the active database changes.
  useEffect(() => {
    if (!session || !activeDbId) {
      setTables([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadTables().finally(() => setLoading(false));
  }, [session, activeDbId, loadTables]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  const selectedTable = tables.find((t) => t.id === selectedId) ?? null;
  const activeDatabase = databases.find((d) => d.id === activeDbId) ?? null;

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

  const handleSelectDatabase = (id: string) => {
    setActiveDbId(id);
    setSelectedId(null);
    setView('dashboard');
  };

  const handleCreateDatabase = async () => {
    const name = window.prompt('Name your new database:')?.trim();
    if (!name) return;
    const res = await api.createDatabase(name);
    if (res.success && res.data) {
      setDatabases((prev) => [...prev, res.data!]);
      setActiveDbId(res.data.id);
      showToast(`Created "${res.data.name}"`);
    } else {
      showToast(res.error ?? 'Could not create database', 'error');
    }
  };

  const handleRenameDatabase = async (id: string) => {
    const current = databases.find((d) => d.id === id);
    if (!current) return;
    const name = window.prompt('Rename database:', current.name)?.trim();
    if (!name || name === current.name) return;
    const res = await api.renameDatabase(id, name);
    if (res.success && res.data) {
      setDatabases((prev) => prev.map((d) => (d.id === id ? res.data! : d)));
      showToast('Renamed');
    } else {
      showToast(res.error ?? 'Could not rename', 'error');
    }
  };

  const handleDeleteDatabase = async (id: string) => {
    const current = databases.find((d) => d.id === id);
    if (!current) return;
    if (!confirm(`Delete database "${current.name}" and all its tables? This cannot be undone.`)) return;
    const res = await api.deleteDatabase(id);
    if (!res.success) {
      showToast(res.error ?? 'Could not delete', 'error');
      return;
    }
    setDatabases((prev) => {
      const next = prev.filter((d) => d.id !== id);
      if (activeDbId === id) {
        setActiveDbId(next[0]?.id ?? null);
        setSelectedId(null);
      }
      return next;
    });
    showToast('Database deleted');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        databases={databases}
        activeDatabaseId={activeDbId}
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
        onSelectDatabase={handleSelectDatabase}
        onCreateDatabase={handleCreateDatabase}
        onRenameDatabase={handleRenameDatabase}
        onDeleteDatabase={handleDeleteDatabase}
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
            onImport={() => setModal({ type: 'upload' })}
          />
        )}
      </div>

      {/* Modals */}
      <UploadModal
        open={modal.type === 'upload'}
        onClose={() => setModal({ type: null })}
        onSuccess={handleImportSuccess}
        databaseId={activeDbId}
        databaseName={activeDatabase?.name}
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
