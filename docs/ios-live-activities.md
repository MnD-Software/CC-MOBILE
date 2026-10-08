# Cake City iOS Live Activities

Cake City uses SDK 57 `expo-widgets` to generate a real WidgetKit / ActivityKit extension. It does not draw a fake Dynamic Island inside React Native.

Current implementation:

- `src/native/CakeCityOrderActivity.tsx`: Lock Screen, compact, minimal and expanded Dynamic Island layouts, including a stale-data presentation.
- `src/native/order-activity-state.ts`: explicit server-status mapping; no invented delivery time or timed kitchen progress.
- `src/native/order-activity-controller.ts`: guarded native loading, start/update/end, one activity at a time, two-minute stale dates derived from the server-check timestamp.
- `src/native/OrderActivityControl.tsx`: opt-in control on an authenticated, device-saved order with a successful live response. Activity ends when its screen unmounts or the server reports a terminal outcome.
- `app.config.js`: Expo Widgets config plugin; generates `ke.co.cakecity.mobile.ExpoWidgetsTarget`, app-group entitlement and `NSSupportsLiveActivities`.

## Android equivalent

Expo Widgets and ActivityKit are iOS-only; Android cannot receive a Dynamic
Island or Live Activity target. On Android, `OrderActivityControl` instead
offers an opt-in `expo-notifications` order-tracking notification. It uses the
same verified order-status mapping, refreshes only while the order screen is
open, and displays the time of the most recent server confirmation. It does not
invent a delivery estimate or claim background status updates.

The older `ios-live-activities/` Swift files and `src/native/live-activities.ts` bridge are legacy reference material, not the active implementation. Do not add them as a second extension.

Limits:

- Expo Go cannot host this extension. A new signed device build is required; reloading JS or downloading the existing unsigned IPA will not enable it.
- A supported iPhone shows Dynamic Island; other supported iPhones use the Lock Screen presentation. The user must allow Live Activities in Settings.
- Updates currently follow the order screen's foreground server polling. No APNs sender or background delivery integration is connected. When suspended, the OS marks the snapshot stale after two minutes and the layout asks the user to open Cake City.
- No email, address, order key or payment token is shown in the activity.
- App Groups must be provisioned for the app and its extension. The previous free-account sideload route is not a verified signing path for this extension.

Build and device acceptance:

```sh
eas build --platform ios --profile production
```

Check that the signed archive contains `PlugIns/ExpoWidgetsTarget.appex`; install on a supported iPhone, open a real order, opt into Lock Screen tracking, then verify compact/expanded/Lock Screen presentations, stale state, terminal state, deep linking and disabled Live Activities. Local type checking, JS export and config introspection do not prove native compilation or device behavior.

Reference: https://docs.expo.dev/versions/v57.0.0/sdk/widgets/
