import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct CakeCityOrderActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var cakeName: String
    var status: String
    var etaMinutes: Int?
    var progress: Double
  }

  var orderId: String
}
