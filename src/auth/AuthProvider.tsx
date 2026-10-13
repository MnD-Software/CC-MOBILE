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
import {
  clearWebsiteCheckoutSession,
  clearWebsitePaymentAttempt,
} from "@/features/commerce/website-checkout-session";
import { clearLegacyWebsiteOrderHistory } from "@/features/commerce/website-order-history";
import { clearPrivateQueryCache } from "./query-privacy";
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
  const signInAttempt = useRef(0);
  const expiry = useRef(0);
  const flight = useRef<Promise<void> | null>(null);
  const storageFlight = useRef<Promise<unknown>>(Promise.resolve());
  const sessionOwner = useRef<string | null>(null);
  const withStorage = useCallback(<T,>(operation: () => Promise<T>) => {
    const next = storageFlight.current.catch(() => undefined).then(operation);
    storageFlight.current = next;
    return next;
  }, []);
  const accept = useCallback(
    async (next: MobileSession, expected = generation.current) => {
      await withStorage(async () => {
        if (expected !== generation.current) return;
        await setStorageItem(REFRESH_KEY, next.refresh_token);
        if (expected !== generation.current) {
          await deleteStorageItem(REFRESH_KEY);
          return;
        }
        if (sessionOwner.current !== next.customer.id) clearAccessToken();
        sessionOwner.current = next.customer.id;
        setAccessToken(next.access_token);
        expiry.current = Date.now() + next.expires_in * 1000;
        setSession(next);
      });
    },
    [withStorage],
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
          clearAccessToken();
          sessionOwner.current = null;
          expiry.current = 0;
          setSession(null);
          clearPrivateQueryCache(cache);
          await withStorage(async () => {
            if (expected === generation.current)
              await deleteStorageItem(REFRESH_KEY);
          });
        }
        throw error;
      }
    })().finally(() => {
      flight.current = null;
    });
    return flight.current;
  }, [accept, cache, withStorage]);
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
      const attempt = ++signInAttempt.current;
      const beforeRefresh = generation.current;
      if (flight.current) await flight.current.catch(() => undefined);
      if (
        attempt !== signInAttempt.current ||
        beforeRefresh !== generation.current
      )
        return;
      const expected = ++generation.current;
      const next = await operation();
      if (expected !== generation.current) return;
      clearPrivateQueryCache(cache);
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
        ++signInAttempt.current;
        ++generation.current;
        clearAccessToken();
        sessionOwner.current = null;
        setSession(null);
        expiry.current = 0;
        clearPrivateQueryCache(cache);
        const token = await withStorage(async () => {
          const stored = await getStorageItem(REFRESH_KEY).catch(() => null);
          await Promise.all([
            deleteStorageItem(REFRESH_KEY),
            clearWebsiteCheckoutSession(),
            clearWebsitePaymentAttempt(),
            clearLegacyWebsiteOrderHistory(),
          ]);
          return stored;
        });
        if (token) await authApi.logout(token).catch(() => undefined);
      },
    }),
    [restoring, session, signIn, cache, withStorage],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
