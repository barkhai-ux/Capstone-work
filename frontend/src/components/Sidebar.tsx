import { useState, useRef, useEffect, FormEvent } from 'react';
import { TableInfo } from '../api';

interface SidebarProps {
  tables: TableInfo[];
  selectedId: string | null;
  view: 'dashboard' | 'table' | 'query';
  onSelect: (id: string) => void;
  onDashboard: () => void;
  onImport: () => void;
  onDelete: (id: string) => void;
  onNormalize: (id: string) => void;
  onStarSchema: (id: string) => void;
  onQuery: (tableId: string, question: string) => void;
  queryLoading: boolean;
}

export default function Sidebar({
  tables,
  selectedId,
  view,
  onSelect,
  onDashboard,
  onImport,
  onDelete,
  onNormalize,
  onStarSchema,
  onQuery,
  queryLoading,
}: SidebarProps) {
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [question, setQuestion] = useState('');
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const handleContext = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  return (
    <aside className="sidebar">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-[7px] bg-gray-100 rounded-md text-gray-400 text-[13px]">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <span>Search...</span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-1.5 pb-2">
        {/* Dashboard */}
        <div className="mt-1 px-1">
          <button
            onClick={onDashboard}
            className={`flex items-center gap-2 w-full px-2.5 py-[6px] rounded-md text-[13px] transition-colors ${
              view === 'dashboard'
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            Dashboard
          </button>
        </div>

        {/* Databases section */}
        <div className="mt-3">
          <div className="flex items-center justify-between px-2.5 mb-1">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Databases</span>
            <button
              onClick={onImport}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Import data"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>

          {/* Database group */}
          <div className="mb-1">
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] font-semibold text-gray-700">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
              </svg>
              DataForge
            </div>

            {/* Table list */}
            <div className="ml-4 space-y-px">
              {tables.length === 0 && (
                <div className="px-2.5 py-4 text-center text-[12px] text-gray-400">
                  No tables yet
                </div>
              )}
              {tables.map((t) => (
                <div key={t.id}>
                  <div
                    onClick={() => onSelect(t.id)}
                    onContextMenu={(e) => handleContext(e, t.id)}
                    className={`sidebar-table-item group ${selectedId === t.id && view !== 'dashboard' ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedTable(expandedTable === t.id ? null : t.id); }}
                      className="w-3 h-3 flex items-center justify-center flex-shrink-0 text-gray-400"
                    >
                      <svg className={`w-2.5 h-2.5 transition-transform ${expandedTable === t.id ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    <svg className="w-[14px] h-[14px] flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375" />
                    </svg>
                    <span className="truncate flex-1 text-left">{t.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleContext(e, t.id); }}
                      className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-all flex-shrink-0"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                  </div>
                  {expandedTable === t.id && t.columns && (
                    <div className="ml-7 space-y-px py-0.5">
                      {t.columns.map((col) => (
                        <div
                          key={col.name}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/column', JSON.stringify({ tableId: t.id, columnName: col.name }));
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          className="flex items-center gap-1.5 px-2 py-[3px] text-[11px] text-gray-500 hover:bg-gray-100 rounded cursor-grab active:cursor-grabbing"
                        >
                          <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
                          </svg>
                          <span className="truncate">{col.name}</span>
                          <span className="ml-auto text-[9px] text-gray-300 flex-shrink-0">{col.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* + New table */}
              <button
                onClick={onImport}
                className="flex items-center gap-2 w-full px-2.5 py-[6px] text-[13px] text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New table
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Query Section */}
      <div className="border-t border-gray-200 px-3 py-3">
        <div className="flex items-center gap-1.5 mb-2">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ask your data</span>
        </div>
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!question.trim() || !selectedId || queryLoading) return;
          onQuery(selectedId, question.trim());
        }}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (question.trim() && selectedId && !queryLoading) {
                  onQuery(selectedId, question.trim());
                }
              }
            }}
            placeholder={selectedId ? 'Ask a question about your data...' : 'Select a table first'}
            disabled={!selectedId || queryLoading}
            rows={3}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-[12px] text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!question.trim() || !selectedId || queryLoading}
            className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-3 py-[6px] rounded-lg text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-400 transition-colors"
          >
            {queryLoading ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Querying...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                Ask
              </>
            )}
          </button>
        </form>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => { onNormalize(contextMenu.id); setContextMenu(null); }}
            className="ctx-menu-item"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Normalize
          </button>
          <button
            onClick={() => { onStarSchema(contextMenu.id); setContextMenu(null); }}
            className="ctx-menu-item"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            Star Schema
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => { onDelete(contextMenu.id); setContextMenu(null); }}
            className="ctx-menu-item text-red-600 hover:bg-red-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </aside>
  );
}
