import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api, NormalizationAnalysis } from '../api';

interface NormalizationModalProps {
  open: boolean;
  tableId: string;
  tableName: string;
  onClose: () => void;
  onApplied: () => void;
}

export default function NormalizationModal({ open, tableId, tableName, onClose, onApplied }: NormalizationModalProps) {
  const [analysis, setAnalysis] = useState<NormalizationAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAnalysis(null);
    setError(null);
    setSuccess(null);
    setAnalyzing(true);
    api.analyzeNormalization(tableId)
      .then((r) => {
        if (r.success && r.data) {
          setAnalysis(r.data);
          if (r.data.dimensions.length === 0) setSuccess('No normalization opportunities found.');
        } else {
          setError(r.error || 'Analysis failed');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Analysis failed'))
      .finally(() => setAnalyzing(false));
  }, [open, tableId]);

  const handleApply = async (dims: { name: string; columns: string[]; primaryKey?: string }[]) => {
    setApplying(true);
    setError(null);
    try {
      const res = await api.applyNormalization(tableId, dims);
      if (res.success && res.data) {
        setSuccess(`Created ${res.data.lookupTablesCreated.length} dimension table(s): ${res.data.lookupTablesCreated.join(', ')}`);
        setAnalysis(null);
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
    <Modal open={open} onClose={onClose} title={`Normalize: ${tableName}`} width="max-w-2xl">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
      )}

      {analyzing && (
        <div className="text-center py-10">
          <div className="inline-block w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-500">AI is analyzing your data for normalization opportunities...</p>
        </div>
      )}

      {analysis && analysis.dimensions.length > 0 && (
        <div className="space-y-4">
          {analysis.overallRecommendation && (
            <p className="text-sm text-gray-600">{analysis.overallRecommendation}</p>
          )}

          {analysis.dimensions.map((dim) => (
            <div key={dim.name} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{dim.name}</span>
                    <ConfidenceBadge confidence={dim.confidence} />
                    <span className="text-xs text-gray-400">{dim.repetitionRate.toFixed(0)}% repetition</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{dim.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {dim.columns.map((col) => {
                      const stat = dim.columnStats?.find((s) => s.column === col);
                      return (
                        <span key={col} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">
                          {col}
                          {stat && <span className="text-gray-400">({stat.uniqueCount})</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <button
                  onClick={() => handleApply([{ name: dim.name, columns: dim.columns, primaryKey: dim.primaryKey }])}
                  disabled={applying}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 transition-colors flex-shrink-0"
                >
                  Apply
                </button>
              </div>
            </div>
          ))}

          {analysis.factColumns.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
              <span className="font-medium">Fact columns</span> (remain in main table): {analysis.factColumns.join(', ')}
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <p className="text-xs text-amber-600">This operation is destructive and cannot be undone.</p>
            <button
              onClick={() => handleApply(analysis.dimensions.map((d) => ({ name: d.name, columns: d.columns, primaryKey: d.primaryKey })))}
              disabled={applying}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
            >
              {applying ? 'Applying...' : 'Apply All'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ConfidenceBadge({ confidence }: { confidence: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const styles = {
    HIGH: 'bg-green-100 text-green-700',
    MEDIUM: 'bg-yellow-100 text-yellow-700',
    LOW: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${styles[confidence]}`}>
      {confidence}
    </span>
  );
}
