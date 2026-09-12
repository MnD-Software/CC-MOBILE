# Dependency review — 10 September 2026

Expo's SDK compatibility check passes after updating expo-dev-client, expo-image,
expo-location, expo-notifications and expo-secure-store. The expo-image config
plugin is included. Existing Metro/Android patches were retained and renamed to
their installed package versions where required.

`npm audit fix --ignore-scripts` applied compatible dependency changes, but
`npm audit` still reports **19 advisories: 4 high and 15 moderate**. This is an open
release issue; the app is not described as having a clean security audit.

| Dependency path | Finding | Current assessment |
| --- | --- | --- |
| React Native CLI → Metro → image-size 1.2.1 | ICNS/JXL/HEIF parser denial of service | Build-time image parsing. App product images use Expo Image at runtime. The advisory lists no patched release; keep untrusted assets out of build inputs and track the upstream fix. |
| Expo Router → query-string → decode-uri-component 0.2.2 | Malformed percent-encoded input can consume excessive CPU | Relevant to URL parsing. Upstream fixes it in 0.5.0, but query-string uses a CommonJS function dependency and requires a compatible upgrade/backport with navigation regression testing. This remains a production release blocker. |
| Expo config plugins → xcode → uuid 7.0.3 | Buffer bounds handling in v3/v5/v6 | Build tooling uses `uuid.v4()` in the inspected Xcode project generator. The affected functions were not found on that call path; the transitive advisory still remains. |

Do not use `npm audit fix --force`: its suggested resolution includes downgrading
Expo to SDK 46 and Router to 5.x, which would invalidate the required SDK 57 stack.
Do not force newer transitive major versions without checking their APIs.

Primary advisory references:

- [image-size ICNS parser](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
- [image-size JXL/HEIF parsers](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
- [decode-uri-component](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)
- [uuid buffer handling](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
