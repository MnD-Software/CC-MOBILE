import { createElement, useEffect, useRef } from "react";
import type { CakeSceneConfig } from "./cake-scene";

/** Web preview: a sandboxed iframe that receives live design updates. */
export function ModelScene({
  html,
  config,
}: {
  html: string;
  config: CakeSceneConfig;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const latest = useRef(config);
  latest.current = config;
  const send = () =>
    frame.current?.contentWindow?.postMessage(
      { type: "cake-config", config: latest.current },
      "*",
    );
  useEffect(send, [config]);
  return createElement("iframe", {
    ref: frame,
    srcDoc: html,
    onLoad: send,
    title: "Interactive 3D cake design illustration",
    sandbox: "allow-scripts",
    style: { border: 0, width: "100%", height: "100%", display: "block" },
  });
}
