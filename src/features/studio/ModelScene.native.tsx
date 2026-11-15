import { WebView } from "react-native-webview";
export function ModelScene({ html }: { html: string }) {
  return (
    <WebView
      source={{ html }}
      originWhitelist={["about:blank"]}
      onShouldStartLoadWithRequest={(r) => r.url === "about:blank"}
      javaScriptEnabled
      scrollEnabled={false}
      bounces={false}
      allowsInlineMediaPlayback={false}
      setSupportMultipleWindows={false}
      style={{ flex: 1, backgroundColor: "#F8F0E9" }}
    />
  );
}
