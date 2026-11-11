import { useEffect, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { env } from "@/config/env";
import type { LiveMapProps } from "./live-tracking";

export function LiveDeliveryMap({ position, destination }: LiveMapProps) {
  const frame = useRef<WebView<{}>>(null);
  const latest = useRef({ type: "cakecity-live-map", position, destination });
  latest.current = { type: "cakecity-live-map", position, destination };
  const update = () =>
    frame.current?.injectJavaScript(
      `window.renderTracking && window.renderTracking(${JSON.stringify(latest.current)});true;`,
    );
  useEffect(update, [
    position?.recorded_at,
    position?.stale,
    destination?.latitude,
    destination?.longitude,
  ]);
  const url = env.apiUrl + "/v1/delivery-tracking/map";
  return (
    <View style={{ height: 300, borderRadius: 24, overflow: "hidden" }}>
      <WebView<{}>
        ref={frame}
        source={{ uri: url }}
        style={{ flex: 1 }}
        javaScriptEnabled
        applicationNameForUserAgent="CakeCity"
        mixedContentMode="never"
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        onMessage={(event) => {
          try {
            if (
              JSON.parse(event.nativeEvent.data).type === "cakecity-map-ready"
            )
              update();
          } catch {}
        }}
        onShouldStartLoadWithRequest={(request) =>
          request.url === url || request.url === "about:blank"
        }
      />
    </View>
  );
}
