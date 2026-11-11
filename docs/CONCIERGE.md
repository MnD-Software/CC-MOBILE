# Cake City personal concierge

**Paused in version 0.3.2:** the concierge entry is hidden and its route redirects to Orders. AI can be re-enabled in a future release. The earlier implementation and activation details below remain for that work. See [live order tracking](LIVE_ORDER_TRACKING.md) for the current customer experience.

The app now has a personal concierge entry on Home and `/concierge`. It can search the app catalogue, read current products and variations, explain published app information, read the signed-in customer's Club balance, track their orders, and prepare a reviewable bag or reorder using current prices and availability. It uses the same independent app backend; Odoo remains optional.

The assistant never creates an order or starts payment directly. The customer explicitly adds the proposed selections to their bag, reviews fulfilment and the server quote, and approves payment through the existing checkout. Kitchen, dispatch and delivery notifications continue through that order's existing notification flow. Reordering never reuses an old payment or silently accepts an old price.

## Activation on Render

ChatGPT Plus is a consumer subscription. It does **not** pay for the API used by this mobile app. Keep Plus for your own use; an OpenAI API project with its own billing is required for the concierge. See [OpenAI's eligibility details](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).

In the API service's private Render environment settings, add the variables shown in [the example](../backend/.env.concierge.example). Start with `CONCIERGE_ENABLED=false`, set a project-scoped `OPENAI_API_KEY`, choose an available model for that project and set an API project budget/usage alerts. Set `CONCIERGE_ENABLED=true` only when billing and the key are ready, then restart the API. Never use an `EXPO_PUBLIC_` variable for the key or put it in GitHub. The key is read only by the backend.

`GET /v1/concierge/status` reports availability without exposing credentials. Disabled or unconfigured AI shows an honest setup message with working Shop and order tracking links. It does not simulate an AI conversation. No paid AI subscription is sold in the app.

The daily allowance defaults to 20 assistant operations per signed-in customer, resetting at midnight UTC. A voice transcription and its subsequent chat each consume an operation. Each chat allows at most four provider requests with bounded tool calls, input history and output. Failed operations count against the allowance to bound retries. A project budget is still necessary for an overall cost ceiling. Set `CONCIERGE_ENABLED=false` to stop new paid requests immediately after restart.

## Privacy and voice

The customer opts in before sending a chat. Relevant product data and their own order/Club details may be sent to the AI provider. Tool results omit payment URLs, billing records, rider phone numbers and precise delivery coordinates. No password or card details are requested. `store:false` is set on Responses API calls; this is not a claim of zero provider retention. Review the provider's account data controls and your privacy notice before public rollout.

Conversation text stays in screen memory, is cleared on account change, and can be cleared with the new-conversation button. The backend persists only daily allowance counters, not transcripts. Microphone access is requested only when the customer taps record. Recordings are capped at 30 seconds; transcribed text is shown for review before sending. This is recorded voice input, not an always-listening or full-duplex voice assistant.

## Shortcuts and new native build

Version 0.3.1 / native build 17 separates this release from the previous OTA runtime. A new iOS/Android binary is required for the new native capabilities.

Apple actions are declared in `app-intents/` using `expo-app-intents` and inline modules: “Talk to Cake City”, “Reorder my cake” and “Track my cake”. The talk action accepts an optional spoken request. Siri opens the app for review and never claims a queued order was purchased. Pending invocations are consumed only after authentication restoration and navigation are ready. Sign in if prompted; the command remains on the concierge screen. Expo Go cannot validate Siri integration.

The Android config plugin generates launcher shortcuts for Talk, Reorder and Track in a new build. Long-press the app icon to access supported launcher shortcuts. Commands open a review screen; they cannot place orders or pay in the background.

Build with the existing EAS workflows. Validate Siri on a physical iPhone (including a cold launch), Android launcher shortcuts, microphone permissions, audio recording, and push notifications on signed native builds. Windows/web checks do not establish that these native capabilities work on device.

## Normal preview purchase

The staff preview cake stays in the normal Shop grid. Checkout now uses ordinary order wording and a discreet “Preview · no charge” disclosure instead of developer instructions and staff workflow buttons. The payment review still explicitly shows the actual charge of KES 0. The backend retains simulation flags, role restrictions, an isolated test item and labelled receipts; no physical order or live charge is requested. Real products continue to use real checkout.

## Verification

Automated backend tests cover disabled AI, server-only provider requests, owned-order isolation, current-price reorder, rejected invalid variations/stock/preview products, daily allowance enforcement, bounded history and no order/payment mutation from chat. Provider calls are mocked; no API credit or live payment is spent by tests. Native device and real provider validation remain activation checks.

On 11 November, 46 targeted backend checks passed, followed by 10 expanded concierge checks including transcription, payload limits and authentication. Expo config introspection confirmed the iOS microphone disclosure, Android recording permission, Android shortcut metadata and inline-module directory. Local Chrome checks passed with delayed image requests and responsive widths 320/390/430/1280, followed by the complete preview kitchen/dispatch/rider/customer notification journey. Images and the verification report are in the ignored `artifacts/local-preview/` folder.
