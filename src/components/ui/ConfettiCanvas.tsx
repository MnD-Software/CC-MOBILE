import { createElement, useRef } from "react";

export function ConfettiCanvas({
  html,
  progress,
}: {
  html: string;
  progress: () => number;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  return createElement("iframe", {
    ref: frame,
    srcDoc: html,
    title: "Celebration",
    tabIndex: -1,
    "aria-hidden": true,
    sandbox: "allow-scripts",
    onLoad: () =>
      frame.current?.contentWindow?.postMessage(
        { type: "celebration-start", progress: progress() },
        "*",
      ),
    style: {
      border: 0,
      width: "100%",
      height: "100%",
      display: "block",
      background: "transparent",
      pointerEvents: "none",
    },
  });
}
