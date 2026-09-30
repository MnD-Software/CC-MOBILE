import { useSyncExternalStore } from "react";

export type ConnectivityState = "unknown" | "online" | "offline";

let state: ConnectivityState = "unknown";
let nativeState: ConnectivityState = "unknown";
const listeners = new Set<() => void>();

function publish(next: ConnectivityState) {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

/**
 * Network state combines the OS connection signal with actual app requests.
 * It never performs a polling heartbeat merely to declare the network healthy.
 */
export function reportNetworkSuccess() {
  publish("online");
}

export function reportNetworkFailure() {
  // A DNS/API outage while the operating system still reports an internet
  // route is a service failure, not evidence that the customer is offline.
  // Keep the banner truthful and let normal API recovery messaging explain it.
  if (nativeState === "online") return;
  publish("offline");
}

/** Native platform observers can publish a connection state without coupling API code to a native module. */
export function reportConnectivitySignal(next: ConnectivityState) {
  nativeState = next;
  publish(next);
}

export function connectivityState() {
  return state;
}

export function subscribeToConnectivity(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConnectivityState() {
  return useSyncExternalStore(
    subscribeToConnectivity,
    connectivityState,
    () => "unknown",
  );
}
