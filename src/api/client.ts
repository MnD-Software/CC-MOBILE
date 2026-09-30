import { env } from "@/config/env";
import { recordPerformanceMetric } from "@/observability/commerce-events";
import {
  reportNetworkFailure,
  reportNetworkSuccess,
} from "@/platform/connectivity";

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

  constructor(
    message: string,
    { code, status, requestId, details }: ApiErrorInit,
  ) {
    super(message);
    this.name = "ApiError";
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
let refreshSession: (() => Promise<void>) | null = null;
let refreshFlight: Promise<void> | null = null;
export function setSessionRefresher(refresh: (() => Promise<void>) | null) {
  refreshSession = refresh;
}

/**
 * Keeps access credentials in memory only. AuthProvider should call this after
 * a successful login or token refresh; refresh tokens remain in SecureStore.
 */
export function setAccessToken(token: string): void {
  const normalized = token.trim();
  if (!normalized) {
    throw new ApiError("A valid access token is required.", {
      code: "INVALID_ACCESS_TOKEN",
    });
  }
  accessToken = normalized;
}

/** Clears the in-memory bearer token on logout, guest mode, or failed restoration. */
export function clearAccessToken(): void {
  accessToken = null;
}

function assertApiPath(path: string): void {
  if (!path.startsWith("/")) {
    throw new ApiError("API paths must begin with a forward slash.", {
      code: "INVALID_API_PATH",
    });
  }
}

function timeoutFor(options: ApiRequestOptions): number {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ApiError(
      "Request timeouts must be a positive number of milliseconds.",
      { code: "INVALID_TIMEOUT" },
    );
  }
  return timeoutMs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequestId(response: Response): string | null {
  return (
    response.headers.get("x-request-id") ??
    response.headers.get("x-correlation-id")
  );
}

function fallbackMessage(status: number): string {
  if (status === 401)
    return "Your session is no longer valid. Please sign in again.";
  if (status === 403)
    return "You do not have permission to perform that action.";
  if (status === 404) return "The requested Cake City resource was not found.";
  if (status === 409)
    return "This request conflicts with the latest Cake City data. Please try again.";
  if (status === 422) return "Please check the information and try again.";
  if (status === 429) return "Too many requests. Please try again shortly.";
  if (status === 501) return "This Cake City feature is not available yet.";
  if (status >= 500)
    return "Cake City is temporarily unavailable. Please try again.";
  return "Cake City could not complete the request.";
}

function validationMessage(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.detail)) return null;

  const issue = payload.detail.find(isRecord);
  if (!issue || typeof issue.msg !== "string" || !issue.msg.trim()) return null;

  const location = Array.isArray(issue.loc)
    ? issue.loc.filter((part): part is string => typeof part === "string")
    : [];
  const field = location.filter((part) => part !== "body").at(-1);
  if (!field) return issue.msg;

  const label = field
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
  return `${label}: ${issue.msg}`;
}

function responseMessage(payload: unknown, status: number): string {
  const validation = validationMessage(payload);
  if (validation) return validation;
  if (isRecord(payload)) {
    for (const key of ["detail", "message", "error"]) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return fallbackMessage(status);
}

function responseCode(payload: unknown, status: number): string {
  return isRecord(payload) &&
    typeof payload.code === "string" &&
    payload.code.trim()
    ? payload.code
    : `HTTP_${status}`;
}

function metricRoute(path: string) {
  return path
    .split("?", 1)[0]
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/\/[a-f0-9-]{16,}(?=\/|$)/gi, "/:id");
}

type ParsedResponse =
  | { kind: "empty" }
  | { kind: "json"; value: unknown }
  | { kind: "invalid" };

async function parseResponse(response: Response): Promise<ParsedResponse> {
  if (response.status === 204 || response.status === 205)
    return { kind: "empty" };

  const body = await response.text();
  if (!body.trim()) return { kind: "empty" };

  try {
    return { kind: "json", value: JSON.parse(body) as unknown };
  } catch {
    return { kind: "invalid" };
  }
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
  retried = false,
): Promise<T> {
  assertApiPath(path);
  if (!env.apiUrl)
    throw new ApiError(
      "Account services are temporarily unavailable. Please try again later.",
      { code: "API_UNAVAILABLE" },
    );

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value !== undefined && name.toLowerCase() !== "authorization")
      headers[name] = value;
  }

  if (options.auth) {
    if (!accessToken) {
      throw new ApiError("Please sign in to continue.", {
        code: "AUTH_REQUIRED",
        status: 401,
      });
    }
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const requestTimeoutMs = timeoutFor(options);
  const requestStartedAt = Date.now();
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
    options.signal?.addEventListener("abort", abortForCaller, { once: true });
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
    reportNetworkSuccess();
    recordPerformanceMetric("api_latency_ms", Date.now() - requestStartedAt, {
      method,
      route: metricRoute(path),
      status: response.status,
    });
    const parsed = await parseResponse(response);
    const requestId = getRequestId(response);

    if (response.status === 401 && options.auth && !retried && refreshSession) {
      if (headers.Authorization === `Bearer ${accessToken}`) {
        refreshFlight ??= refreshSession().finally(() => {
          refreshFlight = null;
        });
        await refreshFlight;
      }
      return request<T>(method, path, body, options, true);
    }

    if (!response.ok) {
      const payload = parsed.kind === "json" ? parsed.value : undefined;
      throw new ApiError(responseMessage(payload, response.status), {
        code: responseCode(payload, response.status),
        status: response.status,
        requestId,
        details: payload,
      });
    }

    if (parsed.kind === "invalid") {
      throw new ApiError("Cake City returned an unexpected response.", {
        code: "INVALID_RESPONSE",
        status: response.status,
        requestId,
      });
    }

    return (parsed.kind === "empty" ? undefined : parsed.value) as T;
  } catch (error) {
    if (isApiError(error)) {
      recordPerformanceMetric("api_failure", Date.now() - requestStartedAt, {
        method,
        route: metricRoute(path),
        status: error.status,
        code: error.code,
      });
      throw error;
    }
    if (timedOut) {
      recordPerformanceMetric("api_failure", Date.now() - requestStartedAt, {
        method,
        route: metricRoute(path),
        reason: "timeout",
      });
      throw new ApiError(
        "Cake City took too long to respond. Please try again.",
        { code: "REQUEST_TIMEOUT" },
      );
    }
    if (abortedByCaller) {
      throw new ApiError("The request was cancelled.", {
        code: "REQUEST_ABORTED",
      });
    }
    reportNetworkFailure();
    recordPerformanceMetric("api_failure", Date.now() - requestStartedAt, {
      method,
      route: metricRoute(path),
      reason: "network",
    });
    throw new ApiError(
      "Unable to reach Cake City. Check your connection and try again.",
      {
        code: "NETWORK_ERROR",
      },
    );
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortForCaller);
  }
}

export const api = {
  put<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    return request<T>("PUT", path, body, options);
  },
  get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return request<T>("GET", path, undefined, options);
  },
  post<T>(
    path: string,
    body: unknown,
    options?: ApiRequestOptions,
  ): Promise<T> {
    return request<T>("POST", path, body, options);
  },
  patch<T>(
    path: string,
    body: unknown,
    options?: ApiRequestOptions,
  ): Promise<T> {
    return request<T>("PATCH", path, body, options);
  },
  delete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return request<T>("DELETE", path, undefined, options);
  },
  setAccessToken,
  clearAccessToken,
};
