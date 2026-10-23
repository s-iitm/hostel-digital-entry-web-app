import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  const signOut = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    if (!tokenStore.get()) return;
    api.get('/auth/me').then((r) => setUser(r.user)).catch(signOut).finally(() => setLoading(false));
  }, [signOut]);

  const accept = useCallback((r) => {
    tokenStore.set(r.token);
    setUser(r.user);
    return r.user;
  }, []);

  const value = useMemo(() => ({ user, loading, signOut, accept }), [user, loading, signOut, accept]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
