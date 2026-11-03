import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { env } from "@/config/env";
import { deliveryPointSchema, type DeliveryPoint } from "./app-delivery";

type Props = {
  point: DeliveryPoint | null;
  onSelect: (point: DeliveryPoint) => void;
  onClose: () => void;
};
export function DeliveryMap({ point, onSelect, onClose }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== new URL(env.apiUrl).origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "cakecity-delivery-pin"
      )
        return;
      const value = deliveryPointSchema.safeParse(event.data);
      if (value.success) onSelect(value.data);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onSelect]);
  return (
    <View style={{ height: 500, gap: 8 }}>
      <Button variant="outline" label="Close map" onPress={onClose} />
      <iframe
        ref={frame}
        title="Choose your delivery pin"
        src={`${env.apiUrl}/v1/app-delivery/map${point ? `#${point.latitude},${point.longitude}` : ""}`}
        style={{ border: 0, width: "100%", height: "100%", borderRadius: 18 }}
        sandbox="allow-scripts allow-same-origin"
      />
    </View>
  );
}
