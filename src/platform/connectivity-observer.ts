import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import {
  reportConnectivitySignal,
  type ConnectivityState,
} from "./connectivity";

let nativeUnsubscribe: (() => void) | null = null;
let observationCount = 0;

function stateFromNativeNetwork(network: NetInfoState): ConnectivityState {
  // `isInternetReachable` can be null while Android/iOS is evaluating a route.
  // Preserve the useful connection signal instead of briefly showing offline.
  if (network.isConnected === false || network.isInternetReachable === false) {
    return "offline";
  }
  return network.isConnected === true ? "online" : "unknown";
}

/**
 * App-shell-only observer. The commerce/API core stays importable in tests and
 * background tooling without loading a React Native native module.
 */
export function observeNativeConnectivity() {
  observationCount += 1;
  if (!nativeUnsubscribe) {
    nativeUnsubscribe = NetInfo.addEventListener((network) => {
      reportConnectivitySignal(stateFromNativeNetwork(network));
    });
  }

  return () => {
    observationCount = Math.max(0, observationCount - 1);
    if (observationCount === 0 && nativeUnsubscribe) {
      nativeUnsubscribe();
      nativeUnsubscribe = null;
    }
  };
}
