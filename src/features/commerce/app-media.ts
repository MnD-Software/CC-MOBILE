import { env } from "@/config/env";

/** Only the app's copied image archive is read at runtime; never fall back to WordPress. */
export function appMedia(source: string) {
  if (source.startsWith("/v1/")) return env.apiUrl + source;
  try {
    const url = new URL(source);
    // Saved bags and cached catalogue entries may contain a previous preview tunnel.
    // App-owned image paths always belong to the current API, including its tunnel prefix.
    if (
      /\/(?:v1\/app-media\/|v1\/content\/assets\/)/.test(url.pathname) &&
      (url.hostname === "cc-mobile-1.onrender.com" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname.endsWith(".on.expo.app") ||
        url.hostname.endsWith(".exp.direct"))
    ) {
      const start = url.pathname.indexOf("/v1/");
      return env.apiUrl + url.pathname.slice(start) + url.search;
    }
    if (
      [
        "cakecity.co.ke",
        "www.cakecity.co.ke",
        "i0.wp.com",
        "i1.wp.com",
        "i2.wp.com",
      ].includes(url.hostname)
    )
      return `${env.apiUrl}/v1/app-media/source?url=${encodeURIComponent(source)}`;
  } catch {
    /* Local assets and app-managed media retain their original location. */
  }
  return source;
}
