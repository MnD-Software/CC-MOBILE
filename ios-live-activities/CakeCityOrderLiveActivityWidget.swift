import ActivityKit
import SwiftUI
import WidgetKit

@available(iOSApplicationExtension 16.1, *)
struct CakeCityOrderLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CakeCityOrderActivityAttributes.self) { context in
      VStack(alignment: .leading, spacing: 8) {
        Text("Cake City")
          .font(.headline)
        Text(context.state.cakeName)
          .font(.subheadline)
          .lineLimit(1)
        ProgressView(value: context.state.progress)
        Text(statusCopy(context.state))
          .font(.caption)
      }
      .padding()
      .activityBackgroundTint(Color(red: 1.0, green: 0.95, blue: 0.98))
      .activitySystemActionForegroundColor(Color(red: 0.85, green: 0.05, blue: 0.38))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text("Cake City")
            .font(.caption)
            .bold()
        }
        DynamicIslandExpandedRegion(.trailing) {
          if let eta = context.state.etaMinutes {
            Text("\(eta)m")
              .font(.caption)
              .bold()
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 4) {
            Text(context.state.cakeName)
              .lineLimit(1)
            ProgressView(value: context.state.progress)
          }
        }
      } compactLeading: {
        Text("CC")
          .font(.caption2)
          .bold()
      } compactTrailing: {
        if let eta = context.state.etaMinutes {
          Text("\(eta)m")
            .font(.caption2)
        }
      } minimal: {
        Image(systemName: "birthday.cake.fill")
      }
    }
  }
}

@available(iOSApplicationExtension 16.1, *)
private func statusCopy(_ state: CakeCityOrderActivityAttributes.ContentState) -> String {
  switch state.status {
  case "confirmed":
    return "Order confirmed"
  case "preparing":
    return "Your cake is being prepared"
  case "ready":
    return "Ready for pickup or dispatch"
  case "out_for_delivery":
    return state.etaMinutes.map { "On the way - ETA \($0) minutes" } ?? "Your cake is on the way"
  case "delivered":
    return "Delivered"
  default:
    return "Order update"
  }
}
