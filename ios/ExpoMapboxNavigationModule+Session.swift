import AVFoundation
import ExpoModulesCore
@preconcurrency import MapboxNavigationCore

extension ExpoMapboxNavigationModule {
  // MARK: - Active guidance

  /// Starts an active guidance session using the cached `NavigationRoutes` from the most
  /// recent `requestRoutes` call. The `optionsJson` payload supports `simulate` and `routeIndex`.
  func startActiveGuidance(optionsJson: String) async throws {
    guard let token = accessToken, !token.isEmpty else {
      throw Exception(
        name: "NO_TOKEN",
        description: "setAccessToken must be called before startActiveGuidance.",
        code: "NO_TOKEN"
      )
    }

    guard let navigationRoutes = lastNavigationRoutes else {
      throw Exception(
        name: "INVALID_INPUT",
        description: "No cached NavigationRoutes. Call requestRoutes before startActiveGuidance.",
        code: "INVALID_INPUT"
      )
    }

    let simulate: Bool
    let routeIndex: Int
    if
      let data = optionsJson.data(using: .utf8),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    {
      simulate = (json["simulate"] as? Bool) ?? false
      routeIndex = (json["routeIndex"] as? Int) ?? 0
    } else {
      simulate = false
      routeIndex = 0
    }

    if routeIndex != 0 {
      throw Exception(
        name: "INVALID_INPUT",
        description: "Only routeIndex == 0 (primary route) is supported.",
        code: "INVALID_INPUT"
      )
    }

    let p = ensureProvider(token: token, simulate: simulate)

    await teardownObservers()

    // MainActor required for v3 actor isolation.
    await MainActor.run {
      p.mapboxNavigation.tripSession().startActiveGuidance(
        with: navigationRoutes,
        startLegIndex: 0
      )
    }

    await attachObservers(mapboxNavigation: p.mapboxNavigation)

    // Re-apply following camera: internal rendering may have switched to overview,
    // and the React prop hasn't changed so it won't be re-applied automatically.
    await MainActor.run {
      ExpoMapboxNavigationMapView.current?.navigationMapView?.navigationCamera.update(cameraState: .following)
    }
  }

  /// Stops the active guidance session and tears down observers.
  func stopNavigation() async {
    guard let p = provider else { return }

    await teardownObservers()

    await MainActor.run {
      p.mapboxNavigation.tripSession().setToIdle()
    }

    currentSessionState = "idle"
    sendEvent("onSessionStateChange", ["state": "idle"])

    lastApproachingLegIndex = -1

    speechSynthesizer?.stopSpeaking(at: .immediate)
    stopMapboxAudio()
    try? AVAudioSession.sharedInstance().setActive(
      false,
      options: .notifyOthersOnDeactivation
    )
  }
}
