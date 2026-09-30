/**
 * Public mobile API. This is intentionally a source-level default: a release
 * must never silently become catalogue-only because an EAS environment variable
 * was omitted. `EXPO_PUBLIC_API_URL` is still useful for a deliberate staging
 * build, but only a valid HTTP(S) origin can replace this production endpoint.
 */
export const CAKE_CITY_API_URL = "https://cc-mobile-1.onrender.com";

const configured =
  process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "";
const configuredApiUrl =
  /^https:\/\//i.test(configured) ||
  (__DEV__ && /^http:\/\//i.test(configured))
    ? configured
    : "";

export const env = {
  apiUrl: configuredApiUrl || CAKE_CITY_API_URL,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
};
