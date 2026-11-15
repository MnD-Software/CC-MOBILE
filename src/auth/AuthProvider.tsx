import { markAccountUnlocked } from "./session-unlock";
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
import { clearPrivateQueryCache } from "./query-privacy";
import { claimDeviceState, wipeLocalSession } from "./local-session";
import { restoreCanWait } from "./restore-policy";
import {
  connectivityState,
  subscribeToConnectivity,
} from "@/platform/connectivity";
const REFRESH_KEY = "cakecity.refresh-token";
type AuthContextValue = {
  customer: Customer | null;
  isGuest: boolean;
  restoring: boolean;
  login(email: string, password: string): Promise<void>;
  register(input: Parameters<typeof authApi.register>[0]): Promise<void>;
  completeGoogle(idToken: string): Promise<void>;
  updateProfile(
    input: Parameters<typeof authApi.updateProfile>[0],
  ): Promise<void>;
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
  const revoke = useCallback((token: string) => {
    void authApi.logout(token).catch(() => undefined);
  }, []);
  const accept = useCallback(
    async (next: MobileSession, expected = generation.current) => {
      await withStorage(async () => {
        // A session superseded by sign-out or an account switch is revoked so
        // its server session and push binding do not outlive the device copy.
        if (expected !== generation.current) return revoke(next.refresh_token);
        await setStorageItem(REFRESH_KEY, next.refresh_token);
        if (expected !== generation.current) {
          await deleteStorageItem(REFRESH_KEY);
          return revoke(next.refresh_token);
        }
        if (sessionOwner.current !== next.customer.id) clearAccessToken();
        claimDeviceState(next.customer.id);
        sessionOwner.current = next.customer.id;
        setAccessToken(next.access_token);
        expiry.current = Date.now() + next.expires_in * 1000;
        setSession(next);
      });
    },
    [revoke, withStorage],
  );
  /** Hides every private trace of the current session, memory first. */
  const dropLocalSession = useCallback(() => {
    const owner = sessionOwner.current;
    clearAccessToken();
    sessionOwner.current = null;
    expiry.current = 0;
    setSession(null);
    void import("@/native/rider-background")
      .then((m) => m.stopBackgroundSharing())
      .catch(() => undefined);
    return wipeLocalSession(cache, owner);
  }, [cache]);
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
          const cleanup = dropLocalSession();
          await withStorage(async () => {
            if (expected === generation.current)
              await deleteStorageItem(REFRESH_KEY);
            await cleanup;
          });
        }
        throw error;
      }
    })().finally(() => {
      flight.current = null;
    });
    return flight.current;
  }, [accept, dropLocalSession, withStorage]);
  useEffect(() => {
    setSessionRefresher(refresh);
    let mounted = true;
    // While a saved token cannot be checked (offline/service outage) the app
    // stays in its restoring state instead of bouncing to sign-in, and retries
    // on reconnect, on foreground and with a capped backoff.
    let waiting = false;
    let delay = 5_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const started = generation.current;
      void refresh().then(
        () => {
          waiting = false;
          if (mounted) setRestoring(false);
        },
        (error) => {
          waiting =
            mounted &&
            started === generation.current &&
            restoreCanWait(error);
          if (!waiting) {
            if (mounted) setRestoring(false);
            return;
          }
          timer = setTimeout(restore, delay);
          delay = Math.min(delay * 2, 60_000);
        },
      );
    };
    restore();
    const stopConnectivity = subscribeToConnectivity(() => {
      if (waiting && connectivityState() === "online") {
        delay = 5_000;
        restore();
      }
    });
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (waiting) restore();
      else if (!expiry.current || Date.now() > expiry.current - 60000)
        void getStorageItem(REFRESH_KEY)
          .then((token) => (token ? refresh() : undefined))
          .catch(() => undefined);
    });
    return () => {
      mounted = false;
      if (timer !== undefined) clearTimeout(timer);
      stopConnectivity();
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
      if (expected !== generation.current) return revoke(next.refresh_token);
      await import("@/native/rider-background")
        .then((m) => m.stopBackgroundSharing())
        .catch(() => undefined);
      if (expected !== generation.current) return revoke(next.refresh_token);
      clearPrivateQueryCache(cache);
      await accept(next, expected);
      if (expected === generation.current)
        markAccountUnlocked(next.customer.id);
    },
    [accept, cache, revoke],
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
      updateProfile: async (input) => {
        const expected = generation.current;
        const owner = sessionOwner.current;
        if (!owner) throw new Error("Please sign in to edit your profile.");
        const updated = await authApi.updateProfile(input);
        // A refresh started before the save may return older contact details.
        // Let it finish before applying the server-confirmed profile.
        if (flight.current) await flight.current.catch(() => undefined);
        if (
          expected !== generation.current ||
          owner !== sessionOwner.current ||
          updated.id !== owner
        )
          throw new Error("Your account changed. Open your profile again.");
        setSession((current) =>
          current?.customer.id === owner
            ? { ...current, customer: updated }
            : current,
        );
        void cache.invalidateQueries({ queryKey: ["club"] });
      },
      continueAsGuest: () => undefined,
      logout: async () => {
        ++signInAttempt.current;
        ++generation.current;
        const cleanup = dropLocalSession();
        const token = await withStorage(async () => {
          const stored = await getStorageItem(REFRESH_KEY).catch(() => null);
          await Promise.all([deleteStorageItem(REFRESH_KEY), cleanup]);
          return stored;
        });
        if (token) await authApi.logout(token).catch(() => undefined);
      },
    }),
    [restoring, session, signIn, cache, withStorage, dropLocalSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
