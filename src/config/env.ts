/**
 * Public mobile API. This is intentionally a source-level default: a release
 * must never silently become catalogue-only because an EAS environment variable
 * was omitted. `EXPO_PUBLIC_API_URL` is still useful for a deliberate staging
 * build, but only a valid HTTP(S) origin can replace this production endpoint.
 */
import Constants from "expo-constants";

export const CAKE_CITY_API_URL = "https://cc-mobile-1.onrender.com";

function reviewTunnelUrl() {
  if (!__DEV__ || process.env.EXPO_PUBLIC_REVIEW_TUNNEL !== "1") return "";
  const host = Constants.expoConfig?.hostUri;
  if (!host || !/^[a-zA-Z0-9.:-]+$/.test(host))
    throw new Error(
      "Reopen the isolated Expo Go QR code to connect the test backend.",
    );
  const scheme = /(?:^|\.)localhost(?::|$)|^127\.|^192\.168\.|^10\./.test(host)
    ? "http"
    : "https";
  return `${scheme}://${host}/__cakecity-review`;
}

const configured =
  process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "";
const configuredApiUrl =
  /^https:\/\//i.test(configured) || (__DEV__ && /^http:\/\//i.test(configured))
    ? configured
    : "";

export const env = {
  apiUrl: reviewTunnelUrl() || configuredApiUrl || CAKE_CITY_API_URL,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
};
