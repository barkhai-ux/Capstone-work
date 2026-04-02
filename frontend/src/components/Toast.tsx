import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onDone: () => void;
}

export function Toast({ message, type, onDone }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className={`fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${
      type === 'success' ? 'bg-green-600' : 'bg-red-600'
    }`}>
      {message}
    </div>
  );
}

export interface ToastState {
  message: string;
  type: 'success' | 'error';
  id: number;
}
