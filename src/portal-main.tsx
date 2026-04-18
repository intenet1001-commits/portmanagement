import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import PortalManager from './PortalManager';
import './index.css';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

function PortalApp() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((msg: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0b]">
      <PortalManager showToast={showToast} isVisible={true} />
      <div className="fixed top-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded text-sm text-white shadow-lg transition-all ${
              t.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<PortalApp />);
