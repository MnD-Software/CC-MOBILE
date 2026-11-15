import { createElement } from "react";
export function ModelScene({ html }: { html: string }) {
  return createElement("iframe", {
    srcDoc: html,
    title: "Interactive 3D cake design",
    sandbox: "allow-scripts",
    style: { border: 0, width: "100%", height: "100%", display: "block" },
  });
}
