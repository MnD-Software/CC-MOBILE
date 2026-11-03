import { Modal, View } from "react-native";
import { WebView } from "react-native-webview";
import { Button } from "@/components/ui/Button";
import { env } from "@/config/env";
import { deliveryPointSchema, type DeliveryPoint } from "./app-delivery";

export type DeliveryMapProps = {
  point: DeliveryPoint | null;
  onSelect: (point: DeliveryPoint) => void;
  onClose: () => void;
};
export function DeliveryMap({ point, onSelect, onClose }: DeliveryMapProps) {
  const url = `${env.apiUrl}/v1/app-delivery/map${point ? `#${point.latitude},${point.longitude}` : ""}`;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          paddingTop: 48,
          paddingBottom: 20,
          backgroundColor: "white",
        }}
      >
        <Button label="Close map" variant="outline" onPress={onClose} />
        <WebView
          source={{ uri: url }}
          style={{ flex: 1 }}
          javaScriptEnabled
          mixedContentMode="never"
          allowFileAccess={false}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(request) =>
            request.url.startsWith(`${env.apiUrl}/v1/app-delivery/map`) ||
            request.url === "about:blank"
          }
          onMessage={(event) => {
            try {
              const value = JSON.parse(event.nativeEvent.data);
              const parsed = deliveryPointSchema.safeParse(value);
              if (value.type === "cakecity-delivery-pin" && parsed.success)
                onSelect(parsed.data);
            } catch {}
          }}
        />
      </View>
    </Modal>
  );
}
