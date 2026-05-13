import { useState, useEffect, useCallback } from 'react';
import { api, TableInfo, DatabaseRecord, setActiveDatabaseId, CleaningAnalysis } from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TableGrid from './components/TableGrid';
import AskData from './components/AskData';
import DataCleaning from './components/DataCleaning';
import UploadModal from './components/UploadModal';
import NormalizationModal from './components/NormalizationModal';
import StarSchemaModal from './components/StarSchemaModal';
import AuthPage from './components/AuthPage';
import LandingPage from './components/LandingPage';
import { Toast, ToastState } from './components/Toast';
import { useAuth } from './auth';
import { Conversation, loadConversations, saveConversations } from './lib/conversations';
import { readCache, writeCache, clearCache } from './lib/cache';

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
  const [view, setView] = useState<'dashboard' | 'table' | 'ask-data' | 'data-cleaning'>('dashboard');
  const [unauthView, setUnauthView] = useState<{ kind: 'landing' } | { kind: 'auth'; mode: 'signin' | 'signup' }>({ kind: 'landing' });
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [loading, setLoading] = useState(true);
  const [cleaningCache, setCleaningCache] = useState<Record<string, CleaningAnalysis>>({});
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    const c = loadConversations();
    return c.length > 0 ? c[0].id : null;
  });

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const handleNewConversation = () => {
    const newConvo: Conversation = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setConversations((prev) => [newConvo, ...prev]);
    setActiveConversationId(newConvo.id);
    setView('ask-data');
    setSelectedId(null);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setView('ask-data');
    setSelectedId(null);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      if (activeConversationId === id) {
        setActiveConversationId(updated[0]?.id ?? null);
      }
      return updated;
    });
  };

  const userId = session?.user.id ?? null;

  const loadTables = useCallback(async (opts?: { wipeOnFail?: boolean }) => {
    const res = await api.listTables();
    if (res.success && res.data) {
      setTables(res.data);
      if (userId && activeDbId) {
        writeCache(`tables:${userId}:${activeDbId}`, res.data);
      }
      return res.data;
    }
    // Only clear state on a real cold load; a background revalidate
    // failure must not blank what's already on screen.
    if (opts?.wipeOnFail) setTables([]);
    return [];
  }, [userId, activeDbId]);

  // Whenever the active database changes, mirror it into api.ts so every
  // request carries the X-Database-Id header.
  useEffect(() => {
    setActiveDatabaseId(activeDbId);
  }, [activeDbId]);

  // On sign-in: hydrate from cache instantly, then refetch in the background.
  // On sign-out: clear everything.
  useEffect(() => {
    if (!session) {
      setDatabases([]);
      setActiveDbId(null);
      setTables([]);
      setSelectedId(null);
      setLoading(false);
      clearCache();
      return;
    }
    const uid = session.user.id;
    const cached = readCache<{ databases: DatabaseRecord[]; defaultDatabaseId?: string }>(`databases:${uid}`);
    if (cached?.databases?.length) {
      setDatabases(cached.databases);
      setActiveDbId((prev) => prev ?? cached.databases[0]?.id ?? cached.defaultDatabaseId ?? null);
      setLoading(false);
    }

    let cancelled = false;
    (async () => {
      if (!cached?.databases?.length) setLoading(true);
      const res = await api.listDatabases();
      if (cancelled) return;
      if (res.success && res.data) {
        setDatabases(res.data.databases);
        writeCache(`databases:${uid}`, res.data);
        setActiveDbId((prev) => prev ?? res.data!.databases[0]?.id ?? res.data!.defaultDatabaseId ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session]);

  // Mirror database & table state back to the cache so mutations stay in sync.
  useEffect(() => {
    if (userId && databases.length) writeCache(`databases:${userId}`, { databases });
  }, [userId, databases]);

  useEffect(() => {
    if (userId && activeDbId) writeCache(`tables:${userId}:${activeDbId}`, tables);
  }, [userId, activeDbId, tables]);

  // When the active database changes, hydrate tables from cache instantly,
  // then refetch in the background.
  useEffect(() => {
    if (!session || !activeDbId) {
      setTables([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }
    const uid = session.user.id;
    const cached = readCache<TableInfo[]>(`tables:${uid}:${activeDbId}`);
    if (cached) {
      setTables(cached);
      setLoading(false);
      void loadTables();
    } else {
      setLoading(true);
      loadTables({ wipeOnFail: true }).finally(() => setLoading(false));
    }
  }, [session, activeDbId, loadTables]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (!session) {
    if (unauthView.kind === 'landing') {
      return (
        <LandingPage
          onSignIn={() => setUnauthView({ kind: 'auth', mode: 'signin' })}
          onSignUp={() => setUnauthView({ kind: 'auth', mode: 'signup' })}
        />
      );
    }
    return (
      <AuthPage
        initialMode={unauthView.mode}
        onBack={() => setUnauthView({ kind: 'landing' })}
      />
    );
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
    if (userId) clearCache(`tables:${userId}:${id}`);
    showToast('Database deleted');
  };

  const viewLabel =
    view === 'ask-data' ? 'Ask Your Data'
    : view === 'data-cleaning' ? 'Data Cleaning'
    : view === 'table' && selectedTable ? selectedTable.name
    : 'Dashboard';

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Sidebar
        databases={databases}
        activeDatabaseId={activeDbId}
        tables={tables}
        selectedId={selectedId}
        view={view}
        onSelect={(id) => { setSelectedId(id); setView('table'); }}
        onDashboard={() => { setView('dashboard'); setSelectedId(null); }}
        onAskData={() => { setView('ask-data'); setSelectedId(null); }}
        onDataCleaning={() => {
          if (!selectedId && tables.length > 0) setSelectedId(tables[0].id);
          setView('data-cleaning');
        }}
        onImport={() => setModal({ type: 'upload' })}
        onDelete={handleDelete}
        onNormalize={openNormalize}
        onStarSchema={openStarSchema}
        onSelectDatabase={handleSelectDatabase}
        onCreateDatabase={handleCreateDatabase}
        onRenameDatabase={handleRenameDatabase}
        onDeleteDatabase={handleDeleteDatabase}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="topbar">
          <div className="flex items-center gap-2 text-[13px] text-gray-600 min-w-0">
            <span className="text-gray-400">Workspace</span>
            <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-gray-900 font-medium truncate">{activeDatabase?.name ?? 'No database'}</span>
            {viewLabel !== 'Dashboard' || view !== 'dashboard' ? (
              <>
                <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <span className="text-gray-500 truncate">{viewLabel}</span>
              </>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5 text-[12.5px] text-gray-400 w-72">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103.5 10.5a7.5 7.5 0 0013.15 6.15z" />
              </svg>
              <span>Search tables, queries…</span>
              <span className="ml-auto text-[10px] border border-gray-200 rounded px-1 py-px bg-white text-gray-400">⌘K</span>
            </div>
            <div
              className="w-8 h-8 rounded-full text-white text-[11px] font-semibold flex items-center justify-center shadow-sm"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}
              title={session?.user.email ?? ''}
            >
              {(session?.user.email ?? '?').slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm" style={{ background: 'var(--page-bg)' }}>
              Loading...
            </div>
          ) : view === 'ask-data' ? (
            <AskData
              conversations={conversations}
              activeId={activeConversationId}
              setConversations={setConversations}
              setActiveId={setActiveConversationId}
              tables={tables}
            />
          ) : view === 'data-cleaning' && selectedTable ? (
            <DataCleaning
              table={selectedTable}
              onBack={() => setView('table')}
              onToast={(msg, type) => showToast(msg, type ?? 'success')}
              cachedAnalysis={cleaningCache[selectedTable.id] ?? null}
              onAnalysisChange={(a) =>
                setCleaningCache((prev) => {
                  if (a === null) {
                    const { [selectedTable.id]: _drop, ...rest } = prev;
                    return rest;
                  }
                  return { ...prev, [selectedTable.id]: a };
                })
              }
              onApplied={async () => {
                setCleaningCache((prev) => {
                  const { [selectedTable.id]: _drop, ...rest } = prev;
                  return rest;
                });
                await handleApplied();
              }}
            />
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
