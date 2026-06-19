import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

// â”€â”€ Session helpers (sessionStorage = per-tab, no cross-tab leakage) â”€â”€
const SESSION_USER_KEY = 'wms_user';
const SESSION_TOKEN_KEY = 'wms_token';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from THIS tab's sessionStorage on mount
  const checkAuth = useCallback(() => {
    const storedUser = sessionStorage.getItem(SESSION_USER_KEY);
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // On app load, restore session from sessionStorage for this tab only.
    // NOTE: The 'storage' event only fires for localStorage and is intentionally
    // omitted here â€” each tab must remain fully independent.
    checkAuth();
  }, [checkAuth]);

  // On login â†’ persist to this tab's sessionStorage only
  const login = (userData, token) => {
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(userData));
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    setUser(userData);
  };

  // On logout â†’ clear ONLY this tab's sessionStorage
  const logout = () => {
    api.clearCache();
    sessionStorage.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
