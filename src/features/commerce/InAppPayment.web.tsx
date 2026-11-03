import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { env } from "@/config/env";
import { useEffect } from "react";

export function InAppPayment({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin === new URL(env.apiUrl).origin &&
        event.data === "cakecity-payment-return"
      )
        onClose();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onClose]);
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
    <View style={{ height: 650 }}>
      <Button label="Close payment and check status" onPress={onClose} />
      {valid ? (
        <iframe
          title="Secure Pesapal payment"
          src={url}
          style={{ border: 0, width: "100%", height: "100%" }}
          sandbox="allow-forms allow-scripts allow-same-origin"
        />
      ) : null}
    </View>
  );
}
