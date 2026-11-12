// Fixed local target: never accept an upstream URL supplied by a request.
const http = require("node:http");
const PREFIX = "/__cakecity-review";
function reviewApiProxy(next) {
  return (req, res) => {
    if (!req.url?.startsWith(PREFIX + "/")) return next(req, res);
    const path = req.url.slice(PREFIX.length);
    if (!/^\/(?:v1\/|health(?:\?|$)|ready\/db(?:\?|$))/.test(path)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const headers = { ...req.headers, host: "127.0.0.1:8010" };
    delete headers.connection;
    delete headers["accept-encoding"];
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 8010,
        path,
        method: req.method,
        headers,
        timeout: 30000,
      },
      (response) => {
        const host = String(
          req.headers["x-forwarded-host"] || req.headers.host || "",
        )
          .split(",")[0]
          .trim();
        if (
          /application\/json/.test(response.headers["content-type"] || "") &&
          /^[a-zA-Z0-9.:-]+$/.test(host)
        ) {
          const chunks = [];
          let size = 0;
          response.on("data", (chunk) => {
            size += chunk.length;
            if (size > 16 * 1024 * 1024) {
              upstream.destroy();
              res.destroy();
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            const scheme = /^(localhost|127\.0\.0\.1)(:|$)/.test(host)
              ? "http"
              : "https";
            const body = Buffer.from(
              Buffer.concat(chunks)
                .toString("utf8")
                .replaceAll(
                  "http://127.0.0.1:8010/",
                  `${scheme}://${host}${PREFIX}/`,
                ),
            );
            const outputHeaders = {
              ...response.headers,
              "cache-control": "private, no-store",
              "content-length": body.length,
            };
            delete outputHeaders["transfer-encoding"];
            res.writeHead(response.statusCode, outputHeaders);
            res.end(body);
          });
          response.on("error", () => res.destroy());
          return;
        }
        res.writeHead(response.statusCode, {
          ...response.headers,
          "cache-control": "private, no-store",
        });
        response.pipe(res);
      },
    );
    upstream.on("timeout", () =>
      upstream.destroy(new Error("Review API timeout")),
    );
    upstream.on("error", () => {
      if (!res.headersSent)
        res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          detail:
            "The isolated review backend is unavailable. Run npm run preview:local on this computer.",
        }),
      );
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  };
}
module.exports = { reviewApiProxy };
