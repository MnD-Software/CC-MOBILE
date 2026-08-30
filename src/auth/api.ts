import { env } from '@/config/env';

export type Customer = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
};

export type MobileSession = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  customer: Customer;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type ErrorPayload = {
  detail?: unknown;
  message?: unknown;
  error?: unknown;
};

const AUTH_TIMEOUT_MS = 15_000;

function readableError(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string' && entry.trim());
    return typeof first === 'string' ? first : null;
  }
  if (typeof value === 'object' && value !== null && 'msg' in value) {
    const message = (value as { msg?: unknown }).msg;
    return typeof message === 'string' && message.trim() ? message : null;
  }
  return null;
}

function fallbackMessage(status: number): string {
  if (status === 409) return 'This account already exists. Please sign in instead.';
  if (status === 422) return 'Please check your signup details and try again.';
  if (status >= 500) return 'Cake City signup is temporarily unavailable. Please try again shortly.';
  return 'Cake City could not complete the request.';
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as ErrorPayload | null;
      const message = readableError(payload?.detail) ?? readableError(payload?.message) ?? readableError(payload?.error);
      throw new ApiError(response.status, message ?? fallbackMessage(response.status));
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, 'Cake City took too long to respond. You can use the preview customer while the API is checked.');
    }
    throw new ApiError(0, 'Unable to reach the Cake City API. Check the API URL, Wi-Fi, or use the preview customer for UI testing.');
  } finally {
    clearTimeout(timeout);
  }
}

export const authApi = {
  login: (email: string, password: string) =>
    request<MobileSession>('/v1/auth/mobile/login', { email, password }),
  register: (input: { email: string; password: string; first_name: string; last_name: string; phone?: string }) =>
    request<MobileSession>('/v1/auth/mobile/register', input),
  google: (idToken: string) =>
    request<MobileSession>('/v1/auth/mobile/google', { id_token: idToken }),
  refresh: (refreshToken: string) =>
    request<MobileSession>('/v1/auth/mobile/refresh', { refresh_token: refreshToken }),
  logout: (refreshToken: string) =>
    request<void>('/v1/auth/mobile/logout', { refresh_token: refreshToken }),
};
