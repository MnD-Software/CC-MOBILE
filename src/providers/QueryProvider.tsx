import { PropsWithChildren, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
export function QueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient({ defaultOptions: {
    queries: { staleTime: 60000, gcTime: 15 * 60000, retry: (count, error) => count < 1 && !(error instanceof ApiError && (error.status ?? 500) < 500), refetchOnWindowFocus: true },
    mutations: { retry: false },
  } }));
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const listener = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
    return () => listener.remove();
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
