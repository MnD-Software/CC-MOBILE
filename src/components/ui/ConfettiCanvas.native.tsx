import { useRef } from "react";
import { WebView } from "react-native-webview";

export function ConfettiCanvas({
  html,
  progress,
}: {
  html: string;
  progress: () => number;
}) {
  const view = useRef<WebView<object>>(null);
  return (
    <WebView
      ref={view}
      source={{ html }}
      originWhitelist={["about:blank"]}
      onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
      onLoadEnd={() =>
        view.current?.injectJavaScript(
          `window.startConfetti(${Math.max(0, Math.min(1, progress()))});true;`,
        )
      }
      javaScriptEnabled
      scrollEnabled={false}
      bounces={false}
      setSupportMultipleWindows={false}
      accessible={false}
      pointerEvents="none"
      style={{ flex: 1, backgroundColor: "transparent" }}
    />
  );
}
