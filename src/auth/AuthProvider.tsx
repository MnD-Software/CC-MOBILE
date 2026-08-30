import { deleteStorageItem, getStorageItem, setStorageItem } from './secure-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearAccessToken, setAccessToken } from '@/api/client';
import { authApi, Customer, MobileSession } from './api';

const REFRESH_KEY = 'cakecity.refresh-token';

type AuthContextValue = {
  customer: Customer | null;
  isGuest: boolean;
  restoring: boolean;
  login(email: string, password: string): Promise<void>;
  register(input: Parameters<typeof authApi.register>[0]): Promise<void>;
  completeGoogle(idToken: string): Promise<void>;
  startPreviewAccount(): void;
  continueAsGuest(): void;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [restoring, setRestoring] = useState(true);

  const accept = useCallback(async (next: MobileSession) => {
    await setStorageItem(REFRESH_KEY, next.refresh_token);
    setAccessToken(next.access_token);
    setIsGuest(false);
    setSession(next);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const refreshToken = await getStorageItem(REFRESH_KEY);
        if (refreshToken) await accept(await authApi.refresh(refreshToken));
      } catch {
        await deleteStorageItem(REFRESH_KEY);
        clearAccessToken();
      } finally {
        setRestoring(false);
      }
    })();
  }, [accept]);

  const value = useMemo<AuthContextValue>(() => ({
    customer: session?.customer ?? null,
    isGuest,
    restoring,
    login: async (email, password) => accept(await authApi.login(email.trim().toLowerCase(), password)),
    register: async (input) => accept(await authApi.register(input)),
    completeGoogle: async (idToken) => accept(await authApi.google(idToken)),
    startPreviewAccount: () => {
      void deleteStorageItem(REFRESH_KEY);
      clearAccessToken();
      setIsGuest(false);
      setSession({
        access_token: 'preview-access-token',
        refresh_token: 'preview-refresh-token',
        token_type: 'bearer',
        expires_in: 0,
        customer: {
          id: 'preview-customer',
          email: 'preview@cakecity.co.ke',
          first_name: 'Preview',
          last_name: 'Customer',
          phone: null,
          role: 'preview',
        },
      });
    },
    continueAsGuest: () => {
      void deleteStorageItem(REFRESH_KEY);
      clearAccessToken();
      setSession(null);
      setIsGuest(true);
    },
    logout: async () => {
      const refreshToken = await getStorageItem(REFRESH_KEY);
      try { if (refreshToken) await authApi.logout(refreshToken); }
      finally {
        await deleteStorageItem(REFRESH_KEY);
        clearAccessToken();
        setSession(null);
        setIsGuest(false);
      }
    },
  }), [accept, isGuest, restoring, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
