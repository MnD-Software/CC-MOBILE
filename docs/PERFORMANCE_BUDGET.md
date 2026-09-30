# Cake City mobile performance budget

These targets guide engineering and release decisions. They are not presented
as measured guarantees until fresh physical-device traces exist.

| Metric                  | Target                            | Measurement                               | Current action                                                                     |
| ----------------------- | --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| First usable UI         | under 500 ms where device permits | native launch to first interactive screen | removed fixed 900 ms JS overlay                                                    |
| Cached home             | near-instant                      | tap/app resume to cached rails            | live catalogue snapshots added for transport-failure recovery                      |
| Catalogue/search API    | under 300 ms p75                  | BFF server timing + client request timing | needs cursor/search BFF and CDN/edge cache                                         |
| Cached navigation       | under 100 ms perceived            | interaction trace                         | stable tabs + no foreground query replay by default                                |
| First product thumbnail | under 500 ms p75                  | Expo Image load event                     | disk/memory cache and visible-rail prefetch exist; variants still needed           |
| Checkout transition     | under 300 ms perceived            | tap to secure-cart state                  | explicit mutation prevents accidental replays; Woo round trips remain backend work |
| Animation               | 60 fps+                           | Perf Monitor / platform profiler          | use only short, interruptible motion and respect reduced motion                    |
| Crash-free sessions     | above 99%                         | production crash reporter                 | add release crash reporting before broad rollout                                   |
| API error rate          | below 1%                          | request telemetry by route/status         | collect server/client metrics without PII                                          |

The client now records a bounded `app_shell_mount_ms` signal, cache hit/miss,
API and visible product-artwork timing through a non-blocking, PII-filtered
observability boundary. `app_shell_mount_ms` starts when the JavaScript module
loads, so it is useful for regressions but is not a replacement for native
cold-start traces.

## Measurement plan

- Capture cold, warm and hot startup on physical Android and iOS builds.
- Record request duration, response status, retry count, cache source and image
  rendition only; do not log Cart-Tokens, order keys, addresses, email, phone
  or payment details.
- Keep analytics delivery opt-in and isolated from UI. A throwing or unavailable
  telemetry sink must never interfere with browsing, checkout or payment
  recovery.
- Report p50/p75/p95 separately for Wi-Fi, 4G and constrained networks.
- Treat a successful HTTP response, open port, APK installation or Metro
  bundle as insufficient proof. Verify the intended route, live server data,
  payment handoff and physical-device foreground state.
- Fail release promotion when payment recovery, API error, crash or startup
  budgets regress beyond an agreed threshold.
