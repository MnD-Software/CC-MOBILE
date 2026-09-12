import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  clearAccessToken,
  setAccessToken,
  setSessionRefresher,
} from "@/api/client";
import {
  deleteStorageItem,
  getStorageItem,
  setStorageItem,
} from "./secure-storage";
import { authApi, Customer, MobileSession } from "./api";
const REFRESH_KEY = "cakecity.refresh-token";
type AuthContextValue = {
  customer: Customer | null;
  isGuest: boolean;
  restoring: boolean;
  login(email: string, password: string): Promise<void>;
  register(input: Parameters<typeof authApi.register>[0]): Promise<void>;
  completeGoogle(idToken: string): Promise<void>;
  continueAsGuest(): void;
  logout(): Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const cache = useQueryClient();
  const [session, setSession] = useState<MobileSession | null>(null);
  const [restoring, setRestoring] = useState(true);
  const generation = useRef(0);
  const expiry = useRef(0);
  const flight = useRef<Promise<void> | null>(null);
  const accept = useCallback(
    async (next: MobileSession, expected = generation.current) => {
      if (expected !== generation.current) return;
      await setStorageItem(REFRESH_KEY, next.refresh_token);
      if (expected !== generation.current) {
        await deleteStorageItem(REFRESH_KEY);
        return;
      }
      setAccessToken(next.access_token);
      expiry.current = Date.now() + next.expires_in * 1000;
      setSession(next);
    },
    [],
  );
  const refresh = useCallback(() => {
    if (flight.current) return flight.current;
    const expected = generation.current;
    flight.current = (async () => {
      try {
        const token = await getStorageItem(REFRESH_KEY);
        if (!token)
          throw new ApiError("Please sign in to continue.", {
            code: "AUTH_REQUIRED",
            status: 401,
          });
        await accept(await authApi.refresh(token), expected);
      } catch (error) {
        // Network failure must not destroy a valid refresh session.
        if (
          error instanceof ApiError &&
          [401, 403].includes(error.status ?? 0) &&
          expected === generation.current
        ) {
          await deleteStorageItem(REFRESH_KEY);
          clearAccessToken();
          setSession(null);
          cache.clear();
        }
        throw error;
      }
    })().finally(() => {
      flight.current = null;
    });
    return flight.current;
  }, [accept, cache]);
  useEffect(() => {
    setSessionRefresher(refresh);
    void refresh()
      .catch(() => undefined)
      .finally(() => setRestoring(false));
    const listener = AppState.addEventListener("change", (state) => {
      if (
        state === "active" &&
        (!expiry.current || Date.now() > expiry.current - 60000)
      )
        void getStorageItem(REFRESH_KEY)
          .then((token) => (token ? refresh() : undefined))
          .catch(() => undefined);
    });
    return () => {
      setSessionRefresher(null);
      listener.remove();
    };
  }, [refresh]);
  const signIn = useCallback(
    async (operation: () => Promise<MobileSession>) => {
      const expected = ++generation.current;
      if (flight.current) await flight.current.catch(() => undefined);
      const next = await operation();
      cache.clear();
      await accept(next, expected);
    },
    [accept, cache],
  );
  const value = useMemo<AuthContextValue>(
    () => ({
      customer: session?.customer ?? null,
      isGuest: !session,
      restoring,
      login: (email, password) =>
        signIn(() => authApi.login(email.trim().toLowerCase(), password)),
      register: (input) => signIn(() => authApi.register(input)),
      completeGoogle: (token) => signIn(() => authApi.google(token)),
      continueAsGuest: () => undefined,
      logout: async () => {
        ++generation.current;
        const token = await getStorageItem(REFRESH_KEY);
        clearAccessToken();
        setSession(null);
        expiry.current = 0;
        cache.clear();
        await deleteStorageItem(REFRESH_KEY);
        if (token) await authApi.logout(token).catch(() => undefined);
      },
    }),
    [restoring, session, signIn, cache],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
