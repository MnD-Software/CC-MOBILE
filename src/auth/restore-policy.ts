/**
 * A saved refresh token that could not be checked because the network or
 * service was unavailable is still a session: wait and retry rather than
 * signing the customer out. Only an explicit 401/403 ends it.
 */
export function restoreCanWait(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  const code = (error as { code?: unknown }).code;
  if (status === 401 || status === 403) return false;
  if (status === null || status === undefined)
    return code === "NETWORK_ERROR" || code === "REQUEST_TIMEOUT";
  return typeof status === "number" && (status >= 500 || status === 429);
}
