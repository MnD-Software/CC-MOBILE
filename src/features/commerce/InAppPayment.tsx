import { Modal, View } from "react-native";
import { WebView } from "react-native-webview";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Commerce";
import { env } from "@/config/env";
import { useState } from "react";

export function paymentNavigation(url: string) {
  try {
    const parsed = new URL(url);
    if (
      parsed.origin === new URL(env.apiUrl).origin &&
      parsed.pathname === "/v1/payments/pesapal/return"
    )
      return "complete";
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      return "block";
    if (["cakecity.co.ke", "www.cakecity.co.ke"].includes(parsed.hostname))
      return "block";
    // Bank 3DS authentication may use a different HTTPS domain. It remains inside this WebView.
    return "allow";
  } catch {
    return "block";
  }
}

export function InAppPayment({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const valid = (() => {
    try {
      const u = new URL(url);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        ["pay.pesapal.com", "cybqa.pesapal.com"].includes(u.hostname)
      );
    } catch {
      return false;
    }
  })();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          paddingTop: 48,
          paddingBottom: 24,
          backgroundColor: "#fff",
        }}
      >
        <Button
          variant="outline"
          label="Close payment and check status"
          onPress={onClose}
        />
        {error ? <Notice error message={error} /> : null}
        {valid ? (
          <WebView
            source={{ uri: url }}
            style={{ flex: 1 }}
          originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="never"
            setSupportMultipleWindows={false}
            allowFileAccess={false}
            sharedCookiesEnabled={false}
            incognito
            onShouldStartLoadWithRequest={(request) => {
              const decision = paymentNavigation(request.url);
              if (decision === "complete") {
                onClose();
                return false;
              }
              if (decision === "block") {
                setError(
                  "This payment step cannot open outside the app. Close payment to check its status.",
                );
                return false;
              }
              return true;
            }}
            onError={() =>
              setError(
                "The payment connection was interrupted. Check the existing payment before trying again.",
              )
            }
          />
        ) : (
          <Notice error message="This payment link could not be verified." />
        )}
      </View>
    </Modal>
  );
}
