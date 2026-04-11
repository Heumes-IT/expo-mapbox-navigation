# expo-mapbox-navigation — Design

**Date:** 2026-04-11
**Status:** Approved for implementation planning
**Author:** Mike Mestebeld (with Claude)

## Goal

Build an Expo native module that wraps the Mapbox Navigation SDK v3 on iOS and Android, exposing both the full navigation session (routing, active guidance, voice, reroute, alternatives, refresh) and the SDK's bundled Mapbox `MapView` as a React Native view. The module must work under the managed Expo workflow via a config plugin and must not depend on `@rnmapbox/maps`.

## Non-goals

- Web platform support. Mapbox Navigation SDK has no web equivalent; `web` is dropped from `expo-module.config.json`.
- Declarative JSX children for sources/layers/cameras on day one. These are deferred to M2 once the imperative foundation is proven.
- Reimplementing `@rnmapbox/maps`' declarative composition model.
- End-to-end automated UI tests against live Mapbox routes.

## Architecture

Single Expo module, two platform-native targets (iOS + Android), layered as:

```
┌──────────────────────────────────────────────────────────────┐
│  JS layer (src/)                                             │
│  • MapboxNavigation singleton (requireNativeModule)          │
│  • <MapboxNavigationMapView> (requireNativeView)             │
│  • Typed events + TypeScript types for all payloads         │
└──────────────────────────────────────────────────────────────┘
                            ↕  Expo Modules bridge (JSI)
┌──────────────────────────────────────────────────────────────┐
│  Native module layer                                         │
│  iOS: ExpoMapboxNavigationModule.swift                       │
│  Android: ExpoMapboxNavigationModule.kt                      │
│  • Owns a single MapboxNavigationProvider / MapboxNavigation │
│  • Forwards JS calls → nav core                              │
│  • Subscribes to core publishers/observers, forwards events  │
│  • Owns voice controller (native TTS) + history recorder     │
└──────────────────────────────────────────────────────────────┘
                            ↕
┌──────────────────────────────────────────────────────────────┐
│  Native view layer (same module)                             │
│  iOS: ExpoMapboxNavigationView wraps NavigationMapView       │
│  Android: wraps MapView + MapboxNavigationViewportDataSource │
│           + NavigationCamera + MapboxRouteLineApi/View       │
│  • Shares the session with the module (one MapboxNavigation) │
│  • Props: styleURL, camera, navigationCameraState, puck,    │
│    padding, renderRouteLine, renderUserPuck, ...            │
│  • Imperative API via ref                                    │
└──────────────────────────────────────────────────────────────┘
                            ↕
┌──────────────────────────────────────────────────────────────┐
│  Mapbox Navigation SDK v3                                    │
│  iOS: mapbox-navigation-ios (transitively Maps SDK)          │
│  Android: mapbox-navigation-android (transitively Maps SDK)  │
└──────────────────────────────────────────────────────────────┘
```

### Architectural invariants

- **One navigation session per app.** The module holds a singleton `MapboxNavigationProvider` (iOS) / `MapboxNavigation` (Android). Multiple map views may observe it; only one active session exists.
- **The map view is optional.** The module can run headless and still emit all events and play voice. When a `<MapboxNavigationMapView>` is mounted, it *subscribes to* the shared session rather than creating its own.
- **No double-rendering by default, but always overridable.** The route line, alternatives, and user puck are rendered natively by `MapboxRouteLineView` / `NavigationMapView`, driven directly by the shared session. Each of these can be turned off via a JS prop, in which case the module emits geometry/location events so the consumer can render its own using the imperative source/layer API.
- **Camera fidelity.** On iOS, `NavigationMapView.navigationCamera` is used directly. On Android, `MapboxNavigationViewportDataSource` + `NavigationCamera` are wired in the view. JS requests modes via `navigationCameraState="following" | "overview" | "idle"`; the SDK computes frames natively. User gestures pull the camera back to `idle` and emit `onCameraChanged`.
- **Transitive-only Maps SDK dependency.** The Navigation SDK bundles the Maps SDK. We do not add a separate Maps SDK dependency; we consume what the Navigation SDK ships.

## JS API

All exports live on the default export of `expo-mapbox-navigation`, plus the named `MapboxNavigationMapView` component.

### Setup

```ts
MapboxNavigation.setAccessToken(token: string): void;
MapboxNavigation.getAccessToken(): string | null;

MapboxNavigation.configure(options: {
  units?: 'metric' | 'imperial';
  locale?: string;
  routingProvider?: 'online' | 'offline' | 'hybrid'; // M1: online. M2: offline, hybrid.
  electronicHorizon?: {
    length?: number;                   // meters
    expansion?: number;
    minTimeDeltaBetweenUpdatesMs?: number;
  };
  predictiveCache?: {
    currentLocationRadiusMeters?: number;
    destinationLocationRadiusMeters?: number;
  };
  tts?: {
    enabled?: boolean;                 // default true
    volume?: number;                   // 0..1
    speechRate?: number;
    voiceIdentifier?: string;
  };
  audioSession?: { duckOthers?: boolean };  // iOS
  keepScreenOn?: boolean;              // disable idle timer during active guidance
  hapticsOnManeuvers?: boolean;
}): Promise<void>;
```

### Routing

```ts
MapboxNavigation.requestRoutes(options: {
  waypoints: Waypoint[];                // min 2
  profile: 'driving' | 'driving-traffic' | 'walking' | 'cycling';
  alternatives?: boolean;
  avoid?: Array<'toll' | 'ferry' | 'motorway' | 'tunnel'>;
  language?: string;
  steps?: boolean;
}): Promise<{ routes: Route[] }>;
```

### Session control

```ts
MapboxNavigation.startFreeDrive(): Promise<void>;
MapboxNavigation.pauseFreeDrive(): Promise<void>;
MapboxNavigation.startActiveGuidance(options: {
  routes: Route[];        // first is primary, rest are alternatives
  startLegIndex?: number;
  simulate?: boolean;
}): Promise<void>;
MapboxNavigation.navigateNextLeg(): Promise<void>;
MapboxNavigation.stopNavigation(): Promise<void>;
MapboxNavigation.getSessionState(): Promise<'idle' | 'freeDrive' | 'activeGuidance'>;
```

### Simulation, debugging, refresh, permissions

```ts
MapboxNavigation.setSimulated(enabled: boolean, speedMultiplier?: number): Promise<void>;
MapboxNavigation.startHistoryRecording(): Promise<void>;
MapboxNavigation.stopHistoryRecording(): Promise<string /* file path */>;

MapboxNavigation.refreshRouteNow(): Promise<void>;
MapboxNavigation.pauseRouteRefresh(): Promise<void>;
MapboxNavigation.resumeRouteRefresh(): Promise<void>;

MapboxNavigation.requestLocationPermission(options?: {
  background?: boolean;
  precise?: boolean;
}): Promise<'granted' | 'denied' | 'restricted'>;
MapboxNavigation.getLocationPermissionStatus(): Promise<'granted' | 'denied' | 'restricted'>;
```

### Events

```ts
type MapboxNavigationEvents = {
  onRouteProgress: (e: {
    distanceRemaining: number;
    durationRemaining: number;
    fractionTraveled: number;
    currentLegIndex: number;
    currentStepIndex: number;
    upcomingManeuver: { type: string; modifier?: string; bearingAfter?: number };
  }) => void;

  onLocationUpdate: (e: {
    latitude: number; longitude: number;
    bearing?: number; speed?: number; accuracy?: number;
    matchState: 'matched' | 'notMatched' | 'uncertain';
  }) => void;

  onSessionStateChange: (e: { state: 'idle' | 'freeDrive' | 'activeGuidance' }) => void;
  onOffRoute: (e: {}) => void;
  onRerouteStarted: (e: {}) => void;
  onRerouteCompleted: (e: { route: Route }) => void;
  onRerouteFailed: (e: { code: string; message: string }) => void;

  onContinuousAlternativesUpdated: (e: { alternatives: Route[] }) => void;
  onFasterRouteAvailable: (e: { route: Route; timeSavingsSeconds: number }) => void;
  onRouteRefreshed: (e: { route: Route }) => void;

  onVoiceInstruction: (e: VoiceInstruction) => void;   // spoken natively unless tts.enabled=false
  onBannerInstruction: (e: BannerInstruction) => void;

  onWaypointApproaching: (e: { waypointIndex: number }) => void;
  onWaypointArrived: (e: { waypointIndex: number }) => void;
  onFinalDestinationArrived: (e: {}) => void;

  onNavigationError: (e: { code: string; message: string }) => void;
};
```

Event throughput: `onRouteProgress` and `onLocationUpdate` fire at the SDK's location rate (~1 Hz default, configurable up to ~4 Hz). Within New Architecture limits.

`Route` is a typed JSON structure carrying geometry (GeoJSON LineString), legs, steps, maneuvers, distances, durations, and congestion annotations. It round-trips: the shape returned from `requestRoutes` is accepted by `startActiveGuidance`.

## `<MapboxNavigationMapView>` API

### Props

```tsx
<MapboxNavigationMapView
  ref={mapRef}
  style={{ flex: 1 }}

  // Style
  styleURL="mapbox://styles/mapbox/navigation-day-v1"

  // Camera
  camera={{
    center: [lng, lat],
    zoom: 14,
    bearing: 0,
    pitch: 0,
    padding: { top: 100, right: 20, bottom: 160, left: 20 },
    animationDurationMs: 600,
  }}
  navigationCameraState="following"          // 'following' | 'overview' | 'idle'

  // Native rendering toggles (all default true)
  renderRouteLine={true}
  renderUserPuck={true}
  renderAlternativeRouteLines={true}

  // Puck
  puck={{ type: '2d' | '3d', showBearing: true, bearingSource: 'course' | 'heading' }}

  // Gestures
  gestures={{ pitch: true, rotate: true, scroll: true, zoom: true }}

  // Map-local events (distinct from session events)
  onMapLoaded={...}
  onStyleLoaded={...}
  onCameraChanged={...}
  onTapFeature={...}
  onLongPress={...}
  onRegionWillChange={...}
  onRegionDidChange={...}
  onRouteLineGeometry={...}                  // fires only when renderRouteLine=false
/>
```

### Imperative ref API

```ts
interface MapboxNavigationMapViewRef {
  // Camera
  setCamera(opts: CameraOptions): Promise<void>;
  flyTo(opts: CameraOptions & { durationMs?: number }): Promise<void>;
  fitBounds(bounds: [[number, number], [number, number]], padding?: EdgeInsets, durationMs?: number): Promise<void>;
  fitToRoute(route: Route, padding?: EdgeInsets): Promise<void>;
  getCamera(): Promise<CameraSnapshot>;

  // Style
  setStyleURL(url: string): Promise<void>;

  // Sources / layers (Mapbox Style Spec shapes)
  addSource(id: string, source: SourceSpec): Promise<void>;
  updateSource(id: string, source: Partial<SourceSpec>): Promise<void>;
  removeSource(id: string): Promise<void>;
  addLayer(layer: LayerSpec, beforeLayerId?: string): Promise<void>;
  updateLayer(id: string, props: Partial<LayerSpec>): Promise<void>;
  removeLayer(id: string): Promise<void>;
  setLayerVisibility(id: string, visible: boolean): Promise<void>;

  // Images
  addImage(id: string, imageBase64: string, sdf?: boolean): Promise<void>;
  removeImage(id: string): Promise<void>;

  // Queries
  queryRenderedFeatures(
    point: { x: number; y: number } | { rect: [number, number, number, number] },
    opts?: { layerIds?: string[]; filter?: FilterExpression }
  ): Promise<Feature[]>;
  querySourceFeatures(sourceId: string, opts?: { sourceLayerId?: string; filter?: FilterExpression }): Promise<Feature[]>;
  coordinateFromPoint(x: number, y: number): Promise<[number, number]>;
  pointFromCoordinate(lng: number, lat: number): Promise<{ x: number; y: number }>;

  // Route display override (used when renderRouteLine=false)
  showRoutes(routes: Route[]): Promise<void>;
  clearRoutes(): Promise<void>;
}
```

**Notes:**

- Source/layer shapes follow the Mapbox Style Spec verbatim. No DSL, no rewriting — `LineLayer` takes `paint: { 'line-color', 'line-width', ... }` exactly as in the JSON spec, so Mapbox documentation and Studio fragments drop in directly.
- Imperative methods are async because they cross the bridge. Consecutive `addSource` + `addLayer` calls within the same tick are flushed in one native dispatch.
- `navigationCameraState` is a controlled prop. JS sets it, native applies it, user gestures revert it to `idle` and emit `onCameraChanged`.
- `fitToRoute(route)` calls Mapbox's built-in route-overview framing; one call for a perfectly-framed route preview.

## Expo config plugin

Lives at `plugin/src/withMapboxNavigation.ts`, compiled to `plugin/build/`, referenced from `app.json` / `app.config.ts`.

### Options

```ts
{
  accessToken?: string;                       // public runtime token (safe in binary)
  locationWhenInUseDescription: string;
  locationAlwaysDescription?: string;
  enableBackgroundLocation?: boolean;         // default false
  iosNavigationSdkVersion?: string;           // default tracks tested version
  androidNavigationSdkVersion?: string;       // default tracks tested version
}
```

### iOS mutations

1. `MBXAccessToken` in `Info.plist` when `accessToken` is set.
2. `NSLocationWhenInUseUsageDescription`, and `NSLocationAlwaysAndWhenInUseUsageDescription` when `enableBackgroundLocation`.
3. When `enableBackgroundLocation`: add `location` and `audio` to `UIBackgroundModes`.
4. Podfile ensures `ExpoMapboxNavigation` pod resolves Mapbox transitive deps. The podspec itself declares `s.dependency 'MapboxNavigation', '~> 3.10'`. The plugin ensures CocoaPods can authenticate to `api.mapbox.com`.
5. Writes a `.netrc` authentication snippet in a build-phase script only when `process.env.MAPBOX_DOWNLOADS_TOKEN` is set at prebuild time. If unset, emits a clear warning and link to setup docs.

### Android mutations

1. `mapbox_access_token` in `strings.xml` when `accessToken` set.
2. Permissions in `AndroidManifest.xml`:
   - Always: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `INTERNET`.
   - When `enableBackgroundLocation`: `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`.
3. Adds Mapbox authenticated Maven repo to the root `build.gradle` pulling credentials from `MAPBOX_DOWNLOADS_TOKEN` (gradle property first, env var fallback).
4. When `process.env.MAPBOX_DOWNLOADS_TOKEN` is set at prebuild time, writes it to the project's `gradle.properties`. Never committed.
5. Adds the Mapbox foreground service declaration to `AndroidManifest.xml` (required for background nav on Android 10+).

### Token handling rule

- **Public `accessToken`** → plugin options → `app.json` → app binary. Safe.
- **`MAPBOX_DOWNLOADS_TOKEN`** → environment variable only → build system → never written to a committed file.
- Plugin fails loudly at prebuild when `MAPBOX_DOWNLOADS_TOKEN` is missing *and* a real build is being attempted (detected via `EAS_BUILD === '1'` or `CI === 'true'`).

### Plugin testing

Jest snapshot tests in `plugin/src/__tests__/` run the plugin against fixture Expo configs for every option combination and assert on the resulting `Info.plist`, `AndroidManifest.xml`, `build.gradle`, and `strings.xml`.

## Milestones

### M1 — Shippable core (~6–8 weeks)

| Area | Included |
|---|---|
| **Routing** | `requestRoutes` with driving/driving-traffic/walking/cycling, alternatives, avoid toll/ferry/motorway/tunnel, language, steps |
| **Session** | freeDrive, activeGuidance, pause, stop, navigateNextLeg, state events |
| **Progress** | `onRouteProgress`, `onLocationUpdate` (matched/notMatched/uncertain) |
| **Reroute** | auto-detect, `onOffRoute`, `onRerouteStarted/Completed/Failed` |
| **Alternatives** | `onContinuousAlternativesUpdated`, `onFasterRouteAvailable` |
| **Route refresh** | automatic, `refreshRouteNow`, `pauseRouteRefresh`, `resumeRouteRefresh`, `onRouteRefreshed` |
| **Voice** | native Mapbox TTS via `routeVoiceController` (iOS) / `MapboxSpeechApi` + `MapboxVoiceInstructionsPlayer` (Android), `onVoiceInstruction` mirror, `tts.enabled` toggle, audio session ducking (iOS) |
| **Banners** | `onBannerInstruction` |
| **Waypoints** | approaching / arrived / final destination events |
| **Map view** | `<MapboxNavigationMapView>` with styleURL, camera, navigationCameraState, puck, gestures, fitToRoute |
| **Native rendering** | route line + puck + alternatives, opt-out via props, geometry events when off |
| **Imperative map API** | camera, style, sources, layers (line/fill/circle/symbol/heatmap/raster), images, queries, coordinate conversion |
| **Background location** | iOS background modes + keep-alive, Android built-in foreground service, permission helpers (when-in-use + always + precise) |
| **Device integrations** | keepScreenOn, maneuver haptics, iOS precise-location prompt, audio session ducking |
| **Simulation** | `setSimulated`, `MapboxReplayer` (Android) / `.simulated` source (iOS), speed multiplier |
| **Debugging** | history recorder |
| **Electronic Horizon** | config-level only (no `GraphAccessor` exposure) |
| **Expo config plugin** | full plugin per Section 4 |
| **Example app** | screens exercising each feature above |

### M2 — Offline + declarative ergonomics (~4–6 weeks)

| Area | Included |
|---|---|
| **Onboard router** | `configure({ routingProvider: 'offline' \| 'hybrid' })`, predictive cache surface |
| **Tile regions** | download / list / delete, progress events, `TilesetVersionManager` wrapper |
| **Storage** | region size accounting, `getOfflineStorageUsage` |
| **Declarative map children** | `<Source>`, `<LineLayer>`, `<FillLayer>`, `<CircleLayer>`, `<SymbolLayer>`, `<HeatmapLayer>`, `<RasterLayer>`, `<Image>` — all compile to imperative calls |
| **Declarative camera** | `<Camera>` with `followUserLocation`, `zoomLevel`, `animationDuration`, `bounds` |
| **Annotations** | imperative + declarative `<PointAnnotation>`, `<MarkerView>` |

### M3 — Advanced (prioritized on demand)

| Area | Included |
|---|---|
| **CarPlay** | entitlements, `CarPlayManager` wrapper, template-based UI |
| **Android Auto** | car app session, nav template surface |
| **EV routing** | vehicle profile, charge state, charging waypoint insertion, `onChargingStopRequired` |
| **Electronic Horizon exposure** | `GraphAccessor`, `RoadObjectsStore`, `onEHorizonUpdated` |
| **Offline map regions** (distinct from nav tile regions) | imperative + declarative |
| **Custom reroute controller** | JS-supplied replacement routes |

## Project layout

```
expo-mapbox-navigation/
├── android/
│   ├── build.gradle                         (adds Mapbox nav dep)
│   └── src/main/java/expo/modules/mapboxnavigation/
│       ├── ExpoMapboxNavigationModule.kt
│       ├── ExpoMapboxNavigationView.kt
│       ├── session/NavigationSessionManager.kt
│       ├── session/RouteRequester.kt
│       ├── session/EventBridge.kt
│       ├── view/MapViewController.kt
│       └── view/RouteLineController.kt
├── ios/
│   ├── ExpoMapboxNavigation.podspec         (adds MapboxNavigation dep)
│   └── Sources/
│       ├── ExpoMapboxNavigationModule.swift
│       ├── ExpoMapboxNavigationView.swift
│       ├── Session/NavigationSessionManager.swift
│       ├── Session/RouteRequester.swift
│       ├── Session/EventBridge.swift
│       └── View/MapViewController.swift
├── plugin/
│   ├── src/withMapboxNavigation.ts
│   ├── src/withMapboxIos.ts
│   ├── src/withMapboxAndroid.ts
│   ├── src/__tests__/withMapboxNavigation.test.ts
│   └── build/
├── src/
│   ├── index.ts
│   ├── MapboxNavigationModule.ts
│   ├── MapboxNavigationMapView.tsx
│   ├── types.ts
│   ├── events.ts
│   └── styleSpec.ts
├── expo-mapbox-navigation-example/
│   ├── app.config.ts
│   ├── app/
│   │   ├── index.tsx
│   │   ├── basic-nav.tsx
│   │   ├── simulated.tsx
│   │   ├── custom-banners.tsx
│   │   ├── custom-rendering.tsx
│   │   ├── camera-modes.tsx
│   │   ├── waypoints.tsx
│   │   └── permissions.tsx
│   └── .env.example
├── expo-module.config.json                  (apple + android only)
└── package.json
```

The existing `example/` scaffold folder is removed. The scaffolded WebView code in `ExpoMapboxNavigationView.swift` and its Kotlin counterpart is removed entirely.

## Testing strategy

| Layer | What we test | How |
|---|---|---|
| **Config plugin** | Info.plist / Manifest / gradle mutations per option combination | Jest snapshot tests against fixture configs |
| **TS types** | Public API types compile; `requestRoutes → startActiveGuidance` round-trips | `tsc --noEmit` + type-level tests using `expectTypeOf` |
| **iOS unit** | `RouteRequester` builds correct `NavigationRouteOptions`; `EventBridge` maps Combine states to payloads | XCTest in the example app's iOS project |
| **Android unit** | Same responsibilities with mocked `MapboxNavigation` | JUnit + MockK |
| **Integration** | Example-app screens exercise each event/method on real devices | Documented manual checklist in `expo-mapbox-navigation-example/TESTING.md` |

**Explicitly not doing:**

- End-to-end automated UI tests on real Mapbox routes (flaky, slow, expensive).
- JS-level mocks of the Mapbox SDK (would test the mock, not the code).
- Cross-platform behavior parity assertions (platforms differ in voice throttling, camera smoothing, permission flows; forcing parity fights the SDK).

CI note: building both platforms in CI requires `MAPBOX_DOWNLOADS_TOKEN` as a secret. Plugin snapshot tests run without it.

## Open questions (to address during implementation planning)

- Exact Mapbox SDK version pins at M1 start (currently 3.10.1 iOS / 3.18.0 Android based on context7 lookups; verify latest stable before M1 kick-off).
- Foreground service notification content / icon customization surface for Android background nav.
- Whether `Route` should be normalized to Mapbox Directions JSON wire format or to a flatter TypeScript-friendly shape. Default: flatter TS shape for events, Directions-compatible for `requestRoutes` / `startActiveGuidance` round-trip.
- Whether `configure()` should be called once (init-time) or reconfigurable at runtime. SDK supports runtime `apply(coreConfig:)`; we'll mirror that.
