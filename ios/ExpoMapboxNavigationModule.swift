import ExpoModulesCore
import MapboxNavigationCore

/**
 * Expo Modules wrapper around Mapbox Navigation SDK v3 for iOS.
 *
 * This skeleton stores a public access token and constructs a
 * `MapboxNavigationProvider` on first access. The provider is not
 * used for routing yet — Plan #4 wires up the real routing, session,
 * and event pipeline on top of this.
 *
 * The iOS Mapbox SDK reads `MBXAccessToken` from Info.plist at init
 * time; the runtime token propagation API differs enough between iOS
 * and Android that we defer the actual token-to-provider plumbing to
 * Plan #4 when we need it for real requests. For now, storing the
 * token locally + constructing the provider once is enough to prove
 * the SDK linked correctly.
 */
public class ExpoMapboxNavigationModule: Module {
  private var accessToken: String?
  private lazy var provider: MapboxNavigationProvider = MapboxNavigationProvider(
    coreConfig: CoreConfig()
  )

  public func definition() -> ModuleDefinition {
    Name("ExpoMapboxNavigation")

    Function("setAccessToken") { (token: String) in
      self.accessToken = token
      // Touch `provider` so the lazy init runs; this is how we verify
      // at runtime that MapboxNavigationCore linked successfully.
      _ = self.provider
    }
  }
}
