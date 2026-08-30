import { env } from '@/config/env';

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export type ApiRequestOptions = {
  /** Adds the current in-memory bearer token to the request. */
  auth?: boolean;
  /** Additional non-sensitive request headers. Authorization is always managed here. */
  headers?: Record<string, string | undefined>;
  /** Cancels the request when the caller's screen or query is no longer active. */
  signal?: AbortSignal;
  /** Overrides the standard network timeout for one request. */
  timeoutMs?: number;
};

type ApiErrorInit = {
  code: string;
  status?: number;
  requestId?: string | null;
  details?: unknown;
};

/** A consistent error shape for HTTP, network, cancellation, and timeout failures. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly details: unknown;

  constructor(message: string, { code, status, requestId, details }: ApiErrorInit) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status ?? null;
    this.requestId = requestId ?? null;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

let accessToken: string | null = null;

/**
 * Keeps access credentials in memory only. AuthProvider should call this after
 * a successful login or token refresh; refresh tokens remain in SecureStore.
 */
export function setAccessToken(token: string): void {
  const normalized = token.trim();
  if (!normalized) {
    throw new ApiError('A valid access token is required.', { code: 'INVALID_ACCESS_TOKEN' });
  }
  accessToken = normalized;
}

/** Clears the in-memory bearer token on logout, guest mode, or failed restoration. */
export function clearAccessToken(): void {
  accessToken = null;
}

function assertApiPath(path: string): void {
  if (!path.startsWith('/')) {
    throw new ApiError('API paths must begin with a forward slash.', { code: 'INVALID_API_PATH' });
  }
}

function timeoutFor(options: ApiRequestOptions): number {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ApiError('Request timeouts must be a positive number of milliseconds.', { code: 'INVALID_TIMEOUT' });
  }
  return timeoutMs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRequestId(response: Response): string | null {
  return response.headers.get('x-request-id') ?? response.headers.get('x-correlation-id');
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Your session is no longer valid. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform that action.';
  if (status === 404) return 'The requested Cake City resource was not found.';
  if (status === 409) return 'This request conflicts with the latest Cake City data. Please try again.';
  if (status === 422) return 'Please check the information and try again.';
  if (status === 429) return 'Too many requests. Please try again shortly.';
  if (status >= 500) return 'Cake City is temporarily unavailable. Please try again.';
  return 'Cake City could not complete the request.';
}

function responseMessage(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    for (const key of ['detail', 'message', 'error']) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  return fallbackMessage(status);
}

function responseCode(payload: unknown, status: number): string {
  return isRecord(payload) && typeof payload.code === 'string' && payload.code.trim()
    ? payload.code
    : `HTTP_${status}`;
}

type ParsedResponse =
  | { kind: 'empty' }
  | { kind: 'json'; value: unknown }
  | { kind: 'invalid' };

async function parseResponse(response: Response): Promise<ParsedResponse> {
  if (response.status === 204 || response.status === 205) return { kind: 'empty' };

  const body = await response.text();
  if (!body.trim()) return { kind: 'empty' };

  try {
    return { kind: 'json', value: JSON.parse(body) as unknown };
  } catch {
    return { kind: 'invalid' };
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  assertApiPath(path);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value !== undefined && name.toLowerCase() !== 'authorization') headers[name] = value;
  }

  if (options.auth) {
    if (!accessToken) {
      throw new ApiError('Please sign in to continue.', { code: 'AUTH_REQUIRED', status: 401 });
    }
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const requestTimeoutMs = timeoutFor(options);
  const controller = new AbortController();
  let timedOut = false;
  let abortedByCaller = false;
  const abortForCaller = () => {
    abortedByCaller = true;
    controller.abort();
  };

  if (options.signal?.aborted) {
    abortForCaller();
  } else {
    options.signal?.addEventListener('abort', abortForCaller, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);

  try {
    const response = await fetch(`${env.apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const parsed = await parseResponse(response);
    const requestId = getRequestId(response);

    if (!response.ok) {
      const payload = parsed.kind === 'json' ? parsed.value : undefined;
      throw new ApiError(responseMessage(payload, response.status), {
        code: responseCode(payload, response.status),
        status: response.status,
        requestId,
        details: payload,
      });
    }

    if (parsed.kind === 'invalid') {
      throw new ApiError('Cake City returned an unexpected response.', {
        code: 'INVALID_RESPONSE',
        status: response.status,
        requestId,
      });
    }

    return (parsed.kind === 'empty' ? undefined : parsed.value) as T;
  } catch (error) {
    if (isApiError(error)) throw error;
    if (timedOut) {
      throw new ApiError('Cake City took too long to respond. Please try again.', { code: 'REQUEST_TIMEOUT' });
    }
    if (abortedByCaller) {
      throw new ApiError('The request was cancelled.', { code: 'REQUEST_ABORTED' });
    }
    throw new ApiError('Unable to reach Cake City. Check your connection and try again.', {
      code: 'NETWORK_ERROR',
    });
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abortForCaller);
  }
}

export const api = {
  get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return request<T>('GET', path, undefined, options);
  },
  post<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    return request<T>('POST', path, body, options);
  },
  patch<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    return request<T>('PATCH', path, body, options);
  },
  delete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return request<T>('DELETE', path, undefined, options);
  },
  setAccessToken,
  clearAccessToken,
};
