import { env } from "@/config/env";

/** Only the app's copied image archive is read at runtime; never fall back to WordPress. */
export function appMedia(source: string) {
  if (source.startsWith("/v1/")) return env.apiUrl + source;
  try {
    const url = new URL(source);
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
