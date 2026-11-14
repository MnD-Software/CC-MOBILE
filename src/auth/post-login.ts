import type { Href } from "expo-router";
let pending: Href | null = null;
export function rememberCustomerRoute(path: string) {
  if (
    /^\/(?:home|custom|shop|loyalty|orders|cart|search|notifications|product\/[^/]+|order\/[^/]+)$/.test(
      path,
    )
  )
    pending = path as Href;
}
export function takeCustomerRoute() {
  const route = pending;
  pending = null;
  return route;
}
