import { useState, useCallback } from 'react';
import Modal from './Modal';
import { api, UploadPreview } from '../api';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ open, onClose, onSuccess }: UploadModalProps) {
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [tableName, setTableName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setPreview(null);
    setTableName('');
    setLoading(false);
    setError(null);
    setDragOver(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setPreview(null);
    setLoading(true);
    try {
      const res = await api.uploadFile(file);
      if (res.success && res.data) {
        setPreview(res.data);
        setTableName(res.data.suggestedTableName);
      } else {
        setError(res.error || 'Upload failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleCommit = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.commitUpload(preview.fileId, tableName || undefined);
      if (res.success) {
        reset();
        onSuccess();
      } else {
        setError(res.error || 'Import failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Data" width={preview ? 'max-w-3xl' : 'max-w-lg'}>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {!preview ? (
        /* Drop Zone */
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={loading}
          />
          <div className="space-y-2">
            <div className="mx-auto w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            {loading ? (
              <p className="text-gray-600 text-sm">Analyzing file...</p>
            ) : (
              <>
                <p className="text-gray-700 text-sm">
                  Drop a file here or <span className="text-blue-600 font-medium">browse</span>
                </p>
                <p className="text-gray-400 text-xs">CSV, Excel (.xlsx, .xls), or JSON &middot; Max 50 MB</p>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Preview */
        <div className="space-y-4">
          {/* Meta */}
          <div className="flex items-center justify-between gap-4 text-sm">
            <div>
              <span className="text-gray-400">File: </span>
              <span className="text-gray-900 font-medium">{preview.fileName}</span>
            </div>
            <div>
              <span className="text-gray-400">Rows: </span>
              <span className="text-gray-900 font-medium">{preview.totalRows.toLocaleString()}</span>
            </div>
          </div>

          {/* Table name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table name</label>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter table name"
            />
          </div>

          {/* Schema chips */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">
              Columns ({preview.columns.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {preview.columns.map((col) => (
                <span
                  key={col.name}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs"
                >
                  <span className="text-gray-700">{col.name}</span>
                  <span className="text-gray-400">{col.type}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Data preview */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[240px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {preview.columns.map((col) => (
                      <th key={col.name} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap border-b border-gray-200">
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      {preview.columns.map((col) => (
                        <td key={col.name} className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-[200px] truncate">
                          {String(row[col.name] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
            >
              {loading ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
