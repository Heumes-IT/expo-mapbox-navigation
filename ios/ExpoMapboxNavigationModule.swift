import AVFoundation
import Combine
import CoreLocation
import ExpoModulesCore
import MapboxCommon
import MapboxDirections
import MapboxMaps
@preconcurrency import MapboxNavigationCore

/// Expo Modules wrapper for Mapbox Navigation SDK v3 (iOS).
///
/// See extension files for implementation details:
///   +Provider, +Routing, +Session, +Observers, +TTS, +Permissions, +MapAPI
public class ExpoMapboxNavigationModule: Module {
  var accessToken: String?
  var provider: MapboxNavigationProvider?

  // MARK: - Shared provider access

  /// Shared provider for the map view. Only one instance may exist at a time.
  static var sharedProvider: MapboxNavigationProvider? {
    return _sharedProvider
  }
  static var _sharedProvider: MapboxNavigationProvider?

  // MARK: - Active guidance state

  /// Cached session state string; one of "idle" | "freeDrive" | "activeGuidance".
  var currentSessionState: String = "idle"

  /// Cached `NavigationRoutes` from the most recent `requestRoutes` call.
  /// Used by `startActiveGuidance` instead of re-decoding from JSON.
  var lastNavigationRoutes: NavigationRoutes?

  /// Combine subscriptions for session observers. Cleared on stopNavigation.
  var cancellables = Set<AnyCancellable>()

  // MARK: - TTS state

  struct TtsState {
    var enabled: Bool = true
    var volume: Float = 1.0
    var speechRate: Float = 1.0
    var voiceIdentifier: String? = nil
    /// "platform" = AVSpeechSynthesizer (default), "mapbox" = Mapbox Voice API via URLSession/AVAudioPlayer.
    var engine: String = "platform"
  }
  var ttsState = TtsState()

  /// AVSpeechSynthesizer used for spoken instructions (platform engine).
  var speechSynthesizer: AVSpeechSynthesizer? = nil

  /// AVAudioPlayer used when engine == "mapbox". Holds the most recent fetched audio clip.
  /// Protected by the main thread (all TTS helpers run on the main runloop).
  var mapboxAudioPlayer: AVAudioPlayer? = nil

  /// URLSessionDataTask for the in-flight Mapbox Voice API request.
  /// Cancelled in stopNavigation and at the start of each new request.
  var mapboxSpeechTask: URLSessionDataTask? = nil

  // MARK: - Waypoint de-dup tracking

  /// Last leg index for which onWaypointApproaching was emitted (de-duplication).
  var lastApproachingLegIndex: Int = -1

  /// Most-recent leg progress; stored so the banner observer can read lane data
  /// from the current step without needing direct access to RouteProgress.
  var currentLegProgress: RouteLegProgress?

  // MARK: - Location permission state

  /// Helper object that bridges CLLocationManagerDelegate callbacks to a Swift continuation.
  var permissionHandler: PermissionHandler?

  // MARK: - Session state subscription

  /// Subscribes to the trip session state publisher on the shared `MapboxNavigation`.
  /// Stored in `sessionStateCancellable`, which is separate from `cancellables` so
  /// session state survives across `startNavigation`/`stopNavigation` cycles.
  var sessionStateCancellable: AnyCancellable?

  @MainActor
  func subscribeToSessionState(mapboxNavigation: MapboxNavigation) {
    sessionStateCancellable?.cancel()
    sessionStateCancellable = mapboxNavigation.tripSession().session
      .sink { [weak self] session in
        guard let self else { return }
        let stateString: String
        switch session.state {
        case .idle:
          stateString = "idle"
        case .freeDrive:
          stateString = "freeDrive"
        case .activeGuidance:
          stateString = "activeGuidance"
        }
        if stateString != self.currentSessionState {
          self.currentSessionState = stateString
          self.sendEvent("onSessionStateChange", ["state": stateString])
        }
      }
  }

  // MARK: - Module definition

  public func definition() -> ModuleDefinition {
    Name("ExpoMapboxNavigation")

    Events(
      "onRouteProgress", "onLocationUpdate", "onSessionStateChange",
      "onVoiceInstruction", "onBannerInstruction",
      "onOffRoute", "onRerouteStarted", "onRerouteCompleted", "onRerouteFailed",
      "onWaypointApproaching", "onWaypointArrived", "onFinalDestinationArrived",
      "onSpeedLimitUpdate",
      "onContinuousAlternativesUpdated", "onFasterRouteAvailable", "onRouteRefreshed"
    )

    Function("setAccessToken") { (token: String) in
      self.accessToken = token
      MapboxOptions.accessToken = token
      _ = self.ensureProvider(token: token)
    }

    AsyncFunction("requestRoutesNative") { (optionsJson: String) async throws -> String in
      return try await self.requestRoutes(optionsJson: optionsJson)
    }

    AsyncFunction("startActiveGuidanceNative") { (optionsJson: String) async throws -> Void in
      try await self.startActiveGuidance(optionsJson: optionsJson)
    }

    AsyncFunction("stopNavigation") { () async -> Void in
      await self.stopNavigation()
    }

    Function("getSessionState") { () -> String in
      return self.currentSessionState
    }

    AsyncFunction("configureTtsNative") { (optionsJson: String) async throws -> Void in
      try await self.configureTts(optionsJson: optionsJson)
    }

    // MARK: - Location permission

    AsyncFunction("requestLocationPermission") { (optionsJson: String) async throws -> String in
      return try await self.requestLocationPermissionBridge(optionsJson: optionsJson)
    }

    Function("getLocationPermissionStatus") { () -> String in
      let status = CLLocationManager().authorizationStatus
      switch status {
      case .authorizedAlways, .authorizedWhenInUse: return "granted"
      case .denied: return "denied"
      case .restricted: return "restricted"
      case .notDetermined: return "notDetermined"
      @unknown default: return "denied"
      }
    }

    // MARK: - Free drive

    AsyncFunction("startFreeDrive") { () async -> Void in
      guard let p = self.provider else { return }
      await MainActor.run {
        p.mapboxNavigation.tripSession().startFreeDrive()
      }
    }

    AsyncFunction("pauseFreeDrive") { () async -> Void in
      guard let p = self.provider else { return }
      await MainActor.run {
        p.mapboxNavigation.tripSession().pauseFreeDrive()
      }
    }

    // MARK: - Multi-leg navigation

    AsyncFunction("navigateNextLeg") { () async throws -> Void in
      guard let p = self.provider else { return }
      await MainActor.run {
        let navigation = p.mapboxNavigation.navigation()
        let currentLegIndex = navigation.currentRouteProgress?.routeProgress.legIndex ?? 0
        navigation.switchLeg(newLegIndex: currentLegIndex + 1)
      }
    }

    // MARK: - Route refresh control

    AsyncFunction("refreshRouteNow") { () async -> Void in
      // Route refresh is managed automatically by the SDK; no public API to trigger manually.
    }

    AsyncFunction("pauseRouteRefresh") { () async -> Void in
      // Route refresh pause is not exposed in the v3 public API.
    }

    AsyncFunction("resumeRouteRefresh") { () async -> Void in
      // Route refresh resume is not exposed in the v3 public API.
    }

    // MARK: - Simulation toggle

    AsyncFunction("setSimulated") { (optionsJson: String) async -> Void in
      guard let token = self.accessToken, !token.isEmpty else { return }
      let enabled: Bool
      if let data = optionsJson.data(using: .utf8),
         let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
        enabled = (json["enabled"] as? Bool) ?? false
      } else {
        enabled = false
      }
      _ = self.ensureProvider(token: token, simulate: enabled)
    }

    // MARK: - History recording

    AsyncFunction("startHistoryRecording") { () async -> Void in
      guard let p = self.provider else { return }
      await MainActor.run {
        p.mapboxNavigation.historyRecorder()?.startRecordingHistory()
      }
    }

    AsyncFunction("stopHistoryRecording") { () async -> String? in
      guard let p = self.provider else { return nil }
      return await withCheckedContinuation { continuation in
        Task { @MainActor in
          guard let recorder = p.mapboxNavigation.historyRecorder() else {
            continuation.resume(returning: nil)
            return
          }
          recorder.stopRecordingHistory(writingFileWith: { url in
            continuation.resume(returning: url?.path)
          })
        }
      }
    }

    // MARK: - Screen wake lock

    Function("setKeepScreenOn") { (enabled: Bool) in
      DispatchQueue.main.async {
        UIApplication.shared.isIdleTimerDisabled = enabled
      }
    }

    AsyncFunction("getCurrentLocation") { () async -> [String: Double]? in
      guard let p = self.provider else { return nil }
      return await MainActor.run {
        guard let location = p.mapboxNavigation.navigation().currentLocationMatching?
          .mapMatchingResult.enhancedLocation else { return nil }
        return [
          "latitude": location.coordinate.latitude,
          "longitude": location.coordinate.longitude,
        ]
      }
    }

    // MARK: - Imperative map API

    AsyncFunction("setCamera") { (optionsJson: String) async -> Void in
      guard let data = optionsJson.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      else { return }

      await MainActor.run {
        guard let mapView = ExpoMapboxNavigationMapView.current?.navigationMapView?.mapView else { return }
        var cameraOptions = MapboxMaps.CameraOptions()
        if let center = json["center"] as? [Double], center.count == 2 {
          cameraOptions.center = CLLocationCoordinate2D(latitude: center[1], longitude: center[0])
        }
        if let zoom = json["zoom"] as? Double { cameraOptions.zoom = CGFloat(zoom) }
        if let bearing = json["bearing"] as? Double { cameraOptions.bearing = bearing }
        if let pitch = json["pitch"] as? Double { cameraOptions.pitch = CGFloat(pitch) }
        if let padding = json["padding"] as? [String: Double] {
          cameraOptions.padding = UIEdgeInsets(
            top: padding["top"] ?? 0,
            left: padding["left"] ?? 0,
            bottom: padding["bottom"] ?? 0,
            right: padding["right"] ?? 0
          )
        }

        let duration = (json["animationDuration"] as? Double ?? 0) / 1000.0
        if duration > 0 {
          mapView.camera.fly(to: cameraOptions, duration: duration)
        } else {
          mapView.mapboxMap.setCamera(to: cameraOptions)
        }

        // Switch navigation camera to idle so it doesn't fight the manual camera position
        ExpoMapboxNavigationMapView.current?.navigationMapView?.navigationCamera.update(cameraState: .idle)
      }
    }

    AsyncFunction("addGeoJsonSource") { (optionsJson: String) async -> Void in
      guard let data = optionsJson.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let id = json["id"] as? String,
            let geoJsonData = json["data"] as? [String: Any]
      else { return }

      await MainActor.run {
        guard let mapView = ExpoMapboxNavigationMapView.current?.navigationMapView?.mapView else { return }
        var source = GeoJSONSource(id: id)
        if let jsonData = try? JSONSerialization.data(withJSONObject: geoJsonData),
           let jsonString = String(data: jsonData, encoding: .utf8) {
          source.data = .string(jsonString)
        }
        try? mapView.mapboxMap.addSource(source)
      }
    }

    AsyncFunction("removeSource") { (id: String) async -> Void in
      await MainActor.run {
        guard let mapView = ExpoMapboxNavigationMapView.current?.navigationMapView?.mapView else { return }
        try? mapView.mapboxMap.removeSource(withId: id)
      }
    }

    AsyncFunction("addLineLayer") { (optionsJson: String) async -> Void in
      guard let data = optionsJson.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let id = json["id"] as? String,
            let sourceId = json["sourceId"] as? String
      else { return }

      await MainActor.run {
        guard let mapView = ExpoMapboxNavigationMapView.current?.navigationMapView?.mapView else { return }
        var layer = LineLayer(id: id, source: sourceId)
        if let paint = json["paint"] as? [String: Any] {
          if let color = paint["lineColor"] as? String {
            layer.lineColor = .constant(StyleColor(UIColor(hexString: color) ?? .blue))
          }
          if let width = paint["lineWidth"] as? Double {
            layer.lineWidth = .constant(width)
          }
          if let opacity = paint["lineOpacity"] as? Double {
            layer.lineOpacity = .constant(opacity)
          }
          if let dash = paint["lineDasharray"] as? [Double] {
            layer.lineDasharray = .constant(dash)
          }
        }
        layer.lineJoin = .constant(.round)
        layer.lineCap = .constant(.round)

        if let belowId = json["belowLayerId"] as? String {
          try? mapView.mapboxMap.addLayer(layer, layerPosition: .below(belowId))
        } else {
          try? mapView.mapboxMap.addLayer(layer)
        }
      }
    }

    AsyncFunction("addCircleLayer") { (optionsJson: String) async -> Void in
      guard let data = optionsJson.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let id = json["id"] as? String,
            let sourceId = json["sourceId"] as? String
      else { return }

      await MainActor.run {
        guard let mapView = ExpoMapboxNavigationMapView.current?.navigationMapView?.mapView else { return }
        var layer = CircleLayer(id: id, source: sourceId)
        if let paint = json["paint"] as? [String: Any] {
          if let color = paint["circleColor"] as? String {
            layer.circleColor = .constant(StyleColor(UIColor(hexString: color) ?? .blue))
          }
          if let radius = paint["circleRadius"] as? Double {
            layer.circleRadius = .constant(radius)
          }
          if let opacity = paint["circleOpacity"] as? Double {
            layer.circleOpacity = .constant(opacity)
          }
          if let strokeColor = paint["circleStrokeColor"] as? String {
            layer.circleStrokeColor = .constant(StyleColor(UIColor(hexString: strokeColor) ?? .white))
          }
          if let strokeWidth = paint["circleStrokeWidth"] as? Double {
            layer.circleStrokeWidth = .constant(strokeWidth)
          }
        }

        if let belowId = json["belowLayerId"] as? String {
          try? mapView.mapboxMap.addLayer(layer, layerPosition: .below(belowId))
        } else {
          try? mapView.mapboxMap.addLayer(layer)
        }
      }
    }

    AsyncFunction("removeLayer") { (id: String) async -> Void in
      await MainActor.run {
        guard let mapView = ExpoMapboxNavigationMapView.current?.navigationMapView?.mapView else { return }
        try? mapView.mapboxMap.removeLayer(withId: id)
      }
    }

    AsyncFunction("addImage") { (optionsJson: String) async -> Void in
      guard let data = optionsJson.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let id = json["id"] as? String,
            let uri = json["uri"] as? String
      else { return }

      guard let url = URL(string: uri),
            let imageData = try? Data(contentsOf: url),
            let image = UIImage(data: imageData)
      else { return }

      await MainActor.run {
        guard let mapView = ExpoMapboxNavigationMapView.current?.navigationMapView?.mapView else { return }
        try? mapView.mapboxMap.addImage(image, id: id)
      }
    }

    AsyncFunction("removeImage") { (id: String) async -> Void in
      await MainActor.run {
        guard let mapView = ExpoMapboxNavigationMapView.current?.navigationMapView?.mapView else { return }
        try? mapView.mapboxMap.removeImage(withId: id)
      }
    }

    View(ExpoMapboxNavigationMapView.self) {
      Prop("styleURL") { (view: ExpoMapboxNavigationMapView, url: String) in
        view.setStyleURL(url)
      }
      Prop("navigationCameraState") { (view: ExpoMapboxNavigationMapView, state: String) in
        view.setNavigationCameraState(state)
      }
      Prop("routeLineColor") { (view: ExpoMapboxNavigationMapView, hex: String?) in
        view.setRouteLineColor(hex)
      }
    }
  }
}
