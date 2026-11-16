import { useEffect, useRef } from "react";
import { WebView } from "react-native-webview";
import { cakeSceneUpdate, type CakeSceneConfig } from "./cake-scene";

/**
 * The scene HTML is loaded once per mount; later design changes are injected
 * so the cake animates in place instead of reloading (and flashing).
 */
export function ModelScene({
  html,
  config,
  onUnavailable,
}: {
  html: string;
  config: CakeSceneConfig;
  /** WebGL could not start or the GPU dropped the context. */
  onUnavailable?: () => void;
}) {
  const view = useRef<WebView<object>>(null);
  const loaded = useRef(false);
  const latest = useRef(config);
  latest.current = config;
  useEffect(() => {
    if (loaded.current) view.current?.injectJavaScript(cakeSceneUpdate(config));
  }, [config]);
  return (
    <WebView
      ref={view}
      source={{ html }}
      originWhitelist={["about:blank"]}
      onShouldStartLoadWithRequest={(r) => r.url === "about:blank"}
      onLoadEnd={() => {
        loaded.current = true;
        view.current?.injectJavaScript(cakeSceneUpdate(latest.current));
      }}
      onMessage={(event) => {
        if (event.nativeEvent.data === "cake-webgl-unavailable") onUnavailable?.();
      }}
      // An out-of-memory renderer kill on budget Android falls back the same way.
      onRenderProcessGone={() => onUnavailable?.()}
      onContentProcessDidTerminate={() => onUnavailable?.()}
      javaScriptEnabled
      scrollEnabled={false}
      bounces={false}
      allowsInlineMediaPlayback={false}
      setSupportMultipleWindows={false}
      style={{ flex: 1, backgroundColor: config.backdrop[1] }}
    />
  );
}
