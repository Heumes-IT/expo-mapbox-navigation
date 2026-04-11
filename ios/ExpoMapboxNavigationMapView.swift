import Combine
import CoreLocation
import ExpoModulesCore
import MapboxMaps
import MapboxNavigationCore

/// Native view registered as `"ExpoMapboxNavigationMapView"`.
///
/// Wraps `NavigationMapView` and connects it to the shared `MapboxNavigationProvider`
/// managed by `ExpoMapboxNavigationModule`. Route lines and the user puck update
/// automatically via the `location` and `routeProgress` publishers passed at init.
///
/// Props:
///   - `styleURL`              — Mapbox style URI (default: `navigation-day-v1`)
///   - `navigationCameraState` — `"following"` | `"overview"` | `"idle"`
///   - `routeLineColor`        — hex color string for the primary route line
public class ExpoMapboxNavigationMapView: ExpoView, NavigationMapViewDelegate {

  // MARK: - Static current instance

  /// Set to `self` in `setupNavigationMapView()` and nilled in `removeFromSuperview()`.
  /// Allows `ExpoMapboxNavigationModule` async functions to reach the live `MapView`.
  static var current: ExpoMapboxNavigationMapView?

  // MARK: - Internal state

  var navigationMapView: NavigationMapView?
  private var cancellables = Set<AnyCancellable>()

  // Deferred prop values applied once the map view is created
  private var pendingStyleURL: String = "mapbox://styles/mapbox/navigation-day-v1"
  private var pendingCameraState: String = "following"

  // MARK: - Init

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
  }

  public required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  // MARK: - Layout

  public override func layoutSubviews() {
    super.layoutSubviews()

    if navigationMapView == nil, bounds.size != .zero {
      setupNavigationMapView()
    }

    navigationMapView?.frame = bounds
  }

  // MARK: - Setup

  @MainActor
  private func setupNavigationMapView() {
    guard let provider = ExpoMapboxNavigationModule.sharedProvider else {
      // Provider not yet initialised — will retry on the next layout pass
      return
    }

    let nav = provider.mapboxNavigation

    let locationPublisher: AnyPublisher<CLLocation, Never> = nav
      .navigation()
      .locationMatching
      .map(\.location)
      .eraseToAnyPublisher()

    let routeProgressPublisher: AnyPublisher<RouteProgress?, Never> = nav
      .navigation()
      .routeProgress
      .map({ $0?.routeProgress })
      .eraseToAnyPublisher()

    let nmv = NavigationMapView(
      location: locationPublisher,
      routeProgress: routeProgressPublisher,
      navigationCameraType: .mobile,
      heading: nav.navigation().heading,
      predictiveCacheManager: provider.predictiveCacheManager
    )

    nmv.frame = bounds
    nmv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    nmv.delegate = self
    addSubview(nmv)
    navigationMapView = nmv

    applyStyleURL()
    applyCameraState()
    // If a session is already active, the routeProgress publisher may have emitted
    // during init (before delegate was set). Re-apply route line color and redraw
    // with show() — not showcase(), which would switch the camera to overview.
    if let color = pendingRouteLineColor {
      nmv.routeColor = color
      nmv.routeCasingColor = color.withAlphaComponent(0.7)
    }
    if let routes = ExpoMapboxNavigationModule.sharedProvider?.mapboxNavigation
      .tripSession().currentNavigationRoutes {
      nmv.show(routes, routeAnnotationKinds: [])
    }

    Self.current = self
  }

  public override func removeFromSuperview() {
    if Self.current === self {
      Self.current = nil
    }
    super.removeFromSuperview()
  }

  // MARK: - Props

  public func setStyleURL(_ url: String) {
    pendingStyleURL = url
    applyStyleURL()
  }

  public func setNavigationCameraState(_ state: String) {
    pendingCameraState = state
    applyCameraState()
  }

  private var pendingRouteLineColor: UIColor?

  public func setRouteLineColor(_ hex: String?) {
    pendingRouteLineColor = hex.flatMap { UIColor(hexString: $0) }
    if let nmv = navigationMapView, let color = pendingRouteLineColor {
      nmv.routeColor = color
      nmv.routeCasingColor = color.withAlphaComponent(0.7)
    }
  }

  // NavigationMapViewDelegate conformance is retained for gesture/camera callbacks.
  // Route line color uses `nmv.routeColor` rather than `routeLineLayerWithIdentifier`
  // so only unknown/low-congestion segments are overridden, preserving traffic coloring.

  // MARK: - Private helpers

  private func applyStyleURL() {
    guard let nmv = navigationMapView else { return }
    guard let styleURI = StyleURI(rawValue: pendingStyleURL) else { return }
    nmv.mapView.mapboxMap.loadStyle(styleURI)
  }

  @MainActor
  private func applyCameraState() {
    guard let nmv = navigationMapView else { return }
    let camera = nmv.navigationCamera
    switch pendingCameraState {
    case "overview":
      camera.update(cameraState: .overview)
    case "idle":
      camera.update(cameraState: .idle)
    default: // "following"
      camera.update(cameraState: .following)
    }
  }
}

// MARK: - UIColor hex parser

extension UIColor {
  convenience init?(hexString: String) {
    var hex = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
    if hex.hasPrefix("#") { hex.removeFirst() }
    guard hex.count == 6, let int = UInt64(hex, radix: 16) else { return nil }
    let r = CGFloat((int >> 16) & 0xFF) / 255
    let g = CGFloat((int >> 8) & 0xFF) / 255
    let b = CGFloat(int & 0xFF) / 255
    self.init(red: r, green: g, blue: b, alpha: 1)
  }
}
