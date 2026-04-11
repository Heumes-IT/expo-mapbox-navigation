import MapboxMaps
@preconcurrency import MapboxNavigationCore

extension ExpoMapboxNavigationModule {
  /// Constructs or reconfigures the `MapboxNavigationProvider` with explicit credentials.
  ///
  /// Mapbox v3 only allows one live `MapboxNavigationProvider` — a second instance
  /// triggers a runtime fatal ("Two simultaneous active navigation cores"). When a provider
  /// already exists, this reconfigures it in place via `apply(coreConfig:)` rather than
  /// allocating a new instance.
  func ensureProvider(token: String, simulate: Bool = false) -> MapboxNavigationProvider {
    let apiConfig = ApiConfiguration(accessToken: token)
    let credentials = NavigationCoreApiConfiguration(
      navigation: apiConfig,
      map: apiConfig,
      speech: apiConfig
    )
    var coreConfig = CoreConfig(credentials: credentials)
    if simulate {
      coreConfig.locationSource = .simulation(initialLocation: nil)
    }

    if let existing = provider {
      existing.apply(coreConfig: coreConfig)
      Self._sharedProvider = existing
      return existing
    }

    let newProvider = MapboxNavigationProvider(coreConfig: coreConfig)
    provider = newProvider
    Self._sharedProvider = newProvider
    Task { @MainActor in
      self.subscribeToSessionState(mapboxNavigation: newProvider.mapboxNavigation)
    }
    return newProvider
  }
}
