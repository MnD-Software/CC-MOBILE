# Premium redesign checkpoints

Updated: 13 October 2026 (Africa/Nairobi). Spec: [PREMIUM_REDESIGN.md](PREMIUM_REDESIGN.md).
Baseline: `fce570c`, 119 app tests / 40 backend tests in the earlier bug audit.

Status meanings: DONE = stated work has evidence; IN PROGRESS = active work;
PENDING = not completed; EXTERNAL = needs device, business data or provider access.
An implementation checkpoint and device/release acceptance are separate facts.

| ID  | Checkpoint                                          | Status   | Evidence / exit condition                                                                                                                                                                                 |
| --- | --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0  | Research and complete written brief                 | DONE     | Six reference apps, primary links, visual contract, screen scope and integration boundaries in PREMIUM_REDESIGN.md                                                                                        |
| C1  | Shared white visual system and navigation           | DONE     | Shared white/neutral tokens, system sans serif, glossy chrome and equal navigation; screenshots in PREMIUM_REDESIGN_REVIEW.md                                                                             |
| C2  | Home, Shop and Product                              | DONE     | Editorial Home, full-width two-column Shop/category rail, fitted gallery and existing live options/purchase controls; 320–834px browser evidence                                                          |
| C3  | Bag, checkout, orders and return visits             | DONE     | White summaries, grouped contact/delivery forms, optional ordering help, quantity and gift checks; checkout visual fixture and 120 app regressions                                                        |
| C4  | Club, Account, authentication and supporting routes | DONE     | Matching membership/profile/forms/support/planner surfaces; guest/member fixtures and 9 guided staff checks; service placeholders stay explicit                                                           |
| C5  | Automated and browser regression                    | DONE     | Typecheck, 120 tests, format, release configuration and web/iOS/Android exports; 41 browser visits, 25 routes, 42 captures, zero unhandled exceptions                                                     |
| C6  | Physical Android and iOS acceptance                 | EXTERNAL | No fresh redesign binary/device runtime verification. Android emulator booted but current revision was not installed. Physical Android/iOS, keyboard/large text/accessibility/performance review required |
| C7  | Backend-dependent enhancements                      | EXTERNAL | Approved ingredients/allergens, branch capacity/date slots, provider and verified review data; see feature boundaries in spec                                                                             |
| C8  | Publication and owner visual acceptance             | PENDING  | Reviewable final screens, user visual feedback, release commit/artifact and target verification if publication requested                                                                                  |

## Completion checklist

- [x] Record the user-authorized implementation scope and crisp white working direction.
- [x] Document reference research and distinguish observations from inferences.
- [x] Record what must remain authoritative and what needs external data.
- [x] Implement shared visual primitives and primary navigation.
- [x] Implement the full visual screen scope and check existing features at the documented source/browser level.
- [x] Capture and inspect final screenshots; fix visual issues found.
- [x] Run appropriate checks and record exact results and artifact paths.
- [x] Record every remaining external gate and the precise action needed.
- [ ] Obtain owner visual acceptance; do not infer it from passing tests.

## Evidence log

13 October: repository audited; working tree contained only an existing untracked
APK before this redesign. Prior visuals use white tokens but tinted sections,
strong outlines and a permanently emphasized Club navigation action. The redesign
must address composition and materials, rather than just a background hex value.

## Handoff record

Implementation and validation: [PREMIUM_REDESIGN_REVIEW.md](PREMIUM_REDESIGN_REVIEW.md).
Shared components/theme and commerce/account/studio screen changes are included.
Full local browser evidence: `artifacts/premium-redesign/accepted-source/result.json`.
Staff fixture evidence: `artifacts/premium-redesign/staff-verified/result.json`.
Selected screenshots and result JSON are saved under `docs/premium-redesign/`.

Web export: `artifacts/premium-redesign/export/`.
Native bundle export: `artifacts/premium-redesign/native/`.
Native APK/IPA artifact/build IDs: none for this redesign.
Device runtime results: none for this redesign. Production deployment: not performed.
Owner visual acceptance: pending. C0–C5 cover implementation and local validation;
they do not close C6–C8.

During review, the empty coupon label, product-name entities, member profile text,
case-insensitive tier selection and arbitrary card reward meter were corrected.
The main checker now covers narrow/tablet layouts, supporting routes, a real local
bag, simulated checkout/gift fields and membership/card flipping. The staff checker
uses the renamed Account tab and supports an isolated output directory.
