# Authentication and Expo tunnel follow-up

## Scope

Keep sign-in required, secure session restoration, role-based routing, password-manager autofill and the existing account-switching protections. Refresh the shared customer, rider, registration and password-recovery presentation without changing authentication APIs.

The shared auth screen now uses the real Cake City logo, the local celebration cake artwork, a cocoa-to-pink banner, a raised form card and compact secondary links. Both entry tabs remain accessible; fields retain their labels, password visibility control and validation. No new network image requests or continuously running decorative animations are introduced.

## Tunnel recovery

Continue using `npm run start:go:tunnel`. The launcher keeps the isolated backend alive while restarting an unexpectedly exited Expo process. Retries wait 3, 6, 12, 24 and 30 seconds. Five unsuccessful retries stop the session with an actionable message; a run lasting more than two minutes resets this failure budget. An intentional normal exit or Ctrl+C stops the session and cancels pending retries.

Expo can report `Tunnel connection has been closed` without exiting Metro. Only in the supervised review process, the CLI wrapper forwards that message over IPC. The parent terminates its own stale Expo process tree and restarts it. Terminal input/output remain inherited so the Expo terminal stays interactive. Other CLI errors are not interpreted as tunnel disconnections, and ordinary Expo/live commands do not enable this monitor.

Every restarted Expo generation saves the current QR and URL again under the ignored `artifacts/local-preview` directory. An older asynchronous manifest response cannot overwrite the current generation. If the public URL changes, reopen the newly generated QR/URL on the phone. Existing independently started backends are reused and never terminated by this launcher.

The tunnel still requires a working internet connection, Expo service availability and an open terminal. This change cannot keep a process running after Windows shuts down or the terminal is closed. Credentials and private preview artifacts are excluded from commits.

## Verification

- TypeScript check passed.
- Full frontend suite passed: 248 tests before two additional CLI-monitor tests were added.
- Focused tunnel suite passed: nine tests covering retry recovery, stale tunnel termination, backend ownership, QR regeneration, cancellation, retry exhaustion and disconnection-message forwarding.
- Browser rendering passed at 320, 390 and 430 pixels for sign-in and registration, with no horizontal overflow. Screenshots were visually inspected. Customer login, sign-out, second-account staff login and department routing passed with zero runtime exceptions. The first cold Metro run timed out the browser check; a repeat after bundling completed passed.
- iOS Hermes export passed (`artifacts/local-preview/auth-polish-ios`, ignored).
- A local Expo launch established a public `on.expo.app` tunnel. Physical-device connection and long-running network interruption testing remain unverified.
- The QR reader now allows 15 seconds for a development manifest and rejects temporary LAN/localhost fallback hosts while the public tunnel is starting.
