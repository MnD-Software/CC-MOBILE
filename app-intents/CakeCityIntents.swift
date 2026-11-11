import AppIntents
internal import ExpoAppIntents

struct TalkToCakeCityIntent: AppIntent {
  static let title: LocalizedStringResource = "Talk to Cake City"
  static let openAppWhenRun = true
  @Parameter(title: "What would you like?") var request: String?
  @MainActor func perform() async throws -> some IntentResult & ProvidesDialog {
    await AppIntentDispatcher.shared.dispatch(name: "cakeCityConcierge", params: ["action": .string("talk"), "prompt": .string(String((request ?? "").prefix(1500)))])
    return .result(dialog: "Opening Cake City to review your request.")
  }
}
struct ReorderCakeCityIntent: AppIntent {
  static let title: LocalizedStringResource = "Reorder my cake"
  static let openAppWhenRun = true
  @MainActor func perform() async throws -> some IntentResult & ProvidesDialog {
    await AppIntentDispatcher.shared.dispatch(name: "cakeCityConcierge", params: ["action": .string("reorder")])
    return .result(dialog: "Opening Cake City to review your previous order. Nothing has been ordered yet.")
  }
}
struct TrackCakeCityIntent: AppIntent {
  static let title: LocalizedStringResource = "Track my cake"
  static let openAppWhenRun = true
  @MainActor func perform() async throws -> some IntentResult & ProvidesDialog {
    await AppIntentDispatcher.shared.dispatch(name: "cakeCityConcierge", params: ["action": .string("track")])
    return .result(dialog: "Opening your Cake City orders.")
  }
}
struct CakeCityShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: TalkToCakeCityIntent(), phrases: ["Talk to \(.applicationName)"], shortTitle: "Talk to Cake City", systemImageName: "sparkles")
    AppShortcut(intent: ReorderCakeCityIntent(), phrases: ["Reorder my cake in \(.applicationName)"], shortTitle: "Reorder my cake", systemImageName: "arrow.clockwise")
    AppShortcut(intent: TrackCakeCityIntent(), phrases: ["Track my cake in \(.applicationName)"], shortTitle: "Track my cake", systemImageName: "shippingbox")
  }
}
