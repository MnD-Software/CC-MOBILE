# Cake City iOS Live Activities

This Expo app must not draw a fake Dynamic Island in React Native. The React Native layer talks to a real native iOS module through `src/native/live-activities.ts`.

Prepared files:

- `src/native/live-activities.ts` defines the app-facing bridge.
- `ios-live-activities/CakeCityLiveActivitiesModule.swift` defines the ActivityKit native module.
- `ios-live-activities/CakeCityOrderActivityAttributes.swift` defines the order activity model.
- `ios-live-activities/CakeCityOrderLiveActivityWidget.swift` defines Lock Screen and Dynamic Island UI.

Final iOS integration requires macOS, Xcode, Apple Developer signing, an iOS app target, and a Widget Extension target. After running iOS prebuild on macOS, add the Swift files to the app and widget targets, enable the Live Activities entitlement, and archive with:

```sh
npx expo prebuild --platform ios
eas build --platform ios --profile production
```

The Expo config already sets `NSSupportsLiveActivities` and `NSSupportsLiveActivitiesFrequentUpdates` in `app.json`. The Widget Extension target cannot be generated and validated on Windows.
