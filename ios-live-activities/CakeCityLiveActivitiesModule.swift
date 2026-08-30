import ActivityKit
import ExpoModulesCore
import Foundation

public class CakeCityLiveActivitiesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CakeCityLiveActivities")

    AsyncFunction("areActivitiesAvailable") { () -> Bool in
      if #available(iOS 16.1, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("startOrderActivity") { (update: [String: Any]) -> String in
      guard #available(iOS 16.1, *) else {
        throw LiveActivityException("Live Activities require iOS 16.1 or later.")
      }

      let orderId = update["orderId"] as? String ?? ""
      let attributes = CakeCityOrderActivityAttributes(orderId: orderId)
      let state = try makeState(update)
      let activity = try Activity<CakeCityOrderActivityAttributes>.request(
        attributes: attributes,
        content: ActivityContent(state: state, staleDate: nil),
        pushType: nil
      )
      return activity.id
    }

    AsyncFunction("updateOrderActivity") { (activityId: String, update: [String: Any]) in
      guard #available(iOS 16.1, *) else { return }
      let state = try makeState(update)
      for activity in Activity<CakeCityOrderActivityAttributes>.activities where activity.id == activityId {
        await activity.update(ActivityContent(state: state, staleDate: nil))
      }
    }

    AsyncFunction("endOrderActivity") { (activityId: String, update: [String: Any]) in
      guard #available(iOS 16.1, *) else { return }
      let state = try makeState(update)
      for activity in Activity<CakeCityOrderActivityAttributes>.activities where activity.id == activityId {
        await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .default)
      }
    }
  }
}

@available(iOS 16.1, *)
private func makeState(_ update: [String: Any]) throws -> CakeCityOrderActivityAttributes.ContentState {
  guard
    let cakeName = update["cakeName"] as? String,
    let status = update["status"] as? String
  else {
    throw LiveActivityException("Missing cakeName or status.")
  }

  return CakeCityOrderActivityAttributes.ContentState(
    cakeName: cakeName,
    status: status,
    etaMinutes: update["etaMinutes"] as? Int,
    progress: max(0, min(1, update["progress"] as? Double ?? 0))
  )
}

private final class LiveActivityException: Exception {
  override var reason: String {
    message
  }

  private let message: String

  init(_ message: String) {
    self.message = message
  }
}
