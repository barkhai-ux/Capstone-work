import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api, StarSchemaRecommendation } from '../api';

interface StarSchemaModalProps {
  open: boolean;
  tableId: string;
  tableName: string;
  onClose: () => void;
  onApplied: () => void;
}

export default function StarSchemaModal({ open, tableId, tableName, onClose, onApplied }: StarSchemaModalProps) {
  const [rec, setRec] = useState<StarSchemaRecommendation | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRec(null);
    setError(null);
    setSuccess(null);
    setAnalyzing(true);
    api.analyzeStarSchema(tableId)
      .then((r) => {
        if (r.success && r.data) setRec(r.data);
        else setError(r.error || 'Analysis failed');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Analysis failed'))
      .finally(() => setAnalyzing(false));
  }, [open, tableId]);

  const handleApply = async () => {
    if (!rec) return;
    setApplying(true);
    setError(null);
    try {
      const res = await api.applyStarSchema(rec.tableId, rec.factTable.name, rec.factTable.measures, rec.dimensions);
      if (res.success && res.data) {
        setSuccess(`Star schema created! Fact: "${res.data.factTable}", Dimensions: ${res.data.dimensionTables.join(', ')}`);
        setRec(null);
        onApplied();
      } else {
        setError(res.error || 'Failed to apply');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Star Schema: ${tableName}`} width="max-w-2xl">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
      )}

      {analyzing && (
        <div className="text-center py-10">
          <div className="inline-block w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-500">AI is designing your star schema...</p>
        </div>
      )}

      {rec && (
        <div className="space-y-5">
          {/* AI Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-blue-600 mb-1">AI Explanation</p>
            <p className="text-sm text-blue-900 whitespace-pre-line">{rec.aiExplanation}</p>
          </div>

          {/* Fact Table */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">FACT</span>
              <span className="font-semibold text-gray-900">{rec.factTable.name}</span>
            </div>
            {rec.factTable.description && (
              <p className="text-xs text-gray-500 mb-3">{rec.factTable.description}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Measures</p>
                <div className="flex flex-wrap gap-1">
                  {rec.factTable.measures.map((m) => (
                    <span key={m} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{m}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Foreign Keys</p>
                <div className="flex flex-wrap gap-1">
                  {rec.factTable.foreignKeys.map((fk) => (
                    <span key={fk} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{fk}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Dimensions */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
              Dimension Tables ({rec.dimensions.length})
            </p>
            <div className="space-y-2">
              {rec.dimensions.map((dim) => (
                <div key={dim.dimensionName} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">DIM</span>
                    <span className="font-medium text-gray-900 text-sm">{dim.dimensionName}</span>
                  </div>
                  {dim.description && (
                    <p className="text-xs text-gray-500 mb-2">{dim.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {dim.columns.map((col) => (
                      <span
                        key={col}
                        className={`px-2 py-0.5 rounded text-xs ${
                          col === dim.primaryKey
                            ? 'bg-yellow-100 text-yellow-800 font-medium'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {col}
                        {col === dim.primaryKey && <span className="ml-0.5 text-[9px]">PK</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warning + Apply */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            This operation is destructive: the original table will be replaced with the fact table. There is no undo.
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={applying}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
            >
              {applying ? 'Applying...' : 'Apply Star Schema'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
