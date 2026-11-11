import { Redirect } from "expo-router";
/** Concierge is paused; retained code can be enabled in a later release. */
export default function PausedConcierge() {
  return <Redirect href="/(tabs)/orders" />;
}
