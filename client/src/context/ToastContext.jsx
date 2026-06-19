import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div style={{
        position: 'fixed', top: '20px', right: '20px',
        zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px'
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '14px 20px',
            borderRadius: '10px',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.9rem',
            animation: 'slideIn 0.3s ease',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            background: t.type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)'
              : t.type === 'error' ? 'linear-gradient(135deg, #ef4444, #dc2626)'
              : 'linear-gradient(135deg, #3b82f6, #2563eb)',
          }}>
            {t.type === 'success' ? 'âœ…' : t.type === 'error' ? 'âŒ' : 'â„¹ï¸'} {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
