import { useEffect, useRef } from "react";
import { env } from "@/config/env";
import type { LiveMapProps } from "./live-tracking";

export function LiveDeliveryMap({ position, destination }: LiveMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = new URL(env.apiUrl).origin;
  const latest = useRef({ type: "cakecity-live-map", position, destination });
  latest.current = { type: "cakecity-live-map", position, destination };
  const send = () =>
    frame.current?.contentWindow?.postMessage(latest.current, origin);
  useEffect(send, [
    position?.recorded_at,
    position?.stale,
    destination?.latitude,
    destination?.longitude,
  ]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin === origin &&
        event.source === frame.current?.contentWindow &&
        event.data?.type === "cakecity-map-ready"
      )
        send();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [origin]);
  return (
    <iframe
      title="Live delivery map"
      ref={frame}
      src={env.apiUrl + "/v1/delivery-tracking/map"}
      onLoad={send}
      style={{ border: 0, width: "100%", height: 300, borderRadius: 24 }}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
