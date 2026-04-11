import CoreLocation
import ExpoModulesCore

extension ExpoMapboxNavigationModule {
  // MARK: - Location permission bridge

  func requestLocationPermissionBridge(optionsJson: String) async throws -> String {
    let background: Bool
    if let data = optionsJson.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      background = (json["background"] as? Bool) ?? false
    } else {
      background = false
    }

    return await withCheckedContinuation { continuation in
      Task { @MainActor in
        let handler = PermissionHandler(continuation: continuation)
        self.permissionHandler = handler
        handler.request(background: background)
      }
    }
  }
}

// MARK: - CLLocationManagerDelegate helper

/// NSObject subclass that bridges `CLLocationManagerDelegate` callbacks to a Swift continuation.
class PermissionHandler: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var continuation: CheckedContinuation<String, Never>?

  init(continuation: CheckedContinuation<String, Never>) {
    self.continuation = continuation
    super.init()
    manager.delegate = self
  }

  func request(background: Bool) {
    if background {
      manager.requestAlwaysAuthorization()
    } else {
      manager.requestWhenInUseAuthorization()
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    switch status {
    case .notDetermined:
      // Delegate fires immediately on assignment before the system prompt appears — wait for user response.
      return
    case .authorizedAlways, .authorizedWhenInUse:
      resume(with: "granted")
    case .denied:
      resume(with: "denied")
    case .restricted:
      resume(with: "restricted")
    @unknown default:
      resume(with: "denied")
    }
  }

  private func resume(with result: String) {
    guard let c = continuation else { return }
    continuation = nil
    c.resume(returning: result)
  }
}
