# @heumes-it/expo-mapbox-navigation

[![npm](https://img.shields.io/npm/v/@heumes-it/expo-mapbox-navigation)](https://www.npmjs.com/package/@heumes-it/expo-mapbox-navigation)
[![CI](https://github.com/Heumes-IT/expo-mapbox-navigation/actions/workflows/ci.yml/badge.svg)](https://github.com/Heumes-IT/expo-mapbox-navigation/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@heumes-it/expo-mapbox-navigation)](LICENSE)
[![docs](https://img.shields.io/badge/docs-TypeDoc-blue)](https://heumes-it.github.io/expo-mapbox-navigation/)

Turn-by-turn navigation for React Native / Expo, powered by [Mapbox Navigation SDK v3](https://docs.mapbox.com/ios/navigation/guides/) on iOS and Android.

Provides routing, active guidance with voice/banner instructions, a native map view with route line rendering, lane guidance, speed limits, and a comprehensive Expo config plugin for build automation.

If you have problems with the code in this repository, please file issues & bug reports at https://github.com/Heumes-IT/expo-mapbox-navigation/issues.

## Installation

```bash
npx expo install @heumes-it/expo-mapbox-navigation
```

### Mapbox tokens

Two tokens are required from your [Mapbox account](https://account.mapbox.com/):

**Public token** (`pk.*`) — passed at runtime via `MapboxNavigation.setAccessToken(token)`.

**Secret download token** (`sk.*`, scope `DOWNLOADS:READ`) — used at build time to fetch SDK binaries.

iOS — add to `~/.netrc`:

```
machine api.mapbox.com
  login mapbox
  password sk.YOUR_SECRET_TOKEN
```

Android — add to `~/.gradle/gradle.properties`:

```
MAPBOX_DOWNLOADS_TOKEN=sk.YOUR_SECRET_TOKEN
```

### Config plugin

```json
[
  "@heumes-it/expo-mapbox-navigation",
  {
    "locationWhenInUseDescription": "We use your location to navigate.",
    "locationAlwaysDescription": "We use your location in the background for turn-by-turn guidance.",
    "enableBackgroundLocation": true
  }
]
```

Then run:

```bash
npx expo prebuild --clean
```

## Config plugin options

### locationWhenInUseDescription

`string`, **required**. Sets `NSLocationWhenInUseUsageDescription` in iOS `Info.plist`.

### locationAlwaysDescription

`string`, required when `enableBackgroundLocation` is `true`. Sets `NSLocationAlwaysAndWhenInUseUsageDescription` in iOS `Info.plist`.

### enableBackgroundLocation

`boolean`, defaults to `false`. When `true`:

- iOS: adds `location` to `UIBackgroundModes`
- Android: adds `FOREGROUND_SERVICE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `POST_NOTIFICATIONS` permissions and registers `NavigationNotificationService` with `foregroundServiceType: location`

## Usage

```tsx
import { useEffect } from 'react';
import MapboxNavigation, {
  ExpoMapboxNavigationNative,
  MapboxNavigationMapView,
} from '@heumes-it/expo-mapbox-navigation';
import { useEvent } from 'expo';

export default function NavigationScreen() {
  const sessionState = useEvent(ExpoMapboxNavigationNative as any, 'onSessionStateChange') as any;

  useEffect(() => {
    MapboxNavigation.setAccessToken('pk.YOUR_PUBLIC_TOKEN');
    MapboxNavigation.requestLocationPermission().then((status) => {
      if (status === 'granted') MapboxNavigation.startFreeDrive();
    });
  }, []);

  const startNavigation = async () => {
    const response = await MapboxNavigation.requestRoutes({
      waypoints: [
        { latitude: 52.379, longitude: 4.900, name: 'Origin' },
        { latitude: 52.368, longitude: 4.904, name: 'Destination' },
      ],
      profile: 'driving-traffic',
      steps: true,
    });
    await MapboxNavigation.startActiveGuidance({ response, simulate: true });
  };

  const isActive =
    sessionState?.state === 'activeGuidance' ||
    sessionState?.state === 'freeDrive';

  return (
    <>
      {isActive && (
        <MapboxNavigationMapView
          style={{ flex: 1 }}
          navigationCameraState="following"
          routeLineColor="#6728a1"
        />
      )}
    </>
  );
}
```

## Module methods

### setAccessToken

```ts
MapboxNavigation.setAccessToken(token: string): void
```

Set the Mapbox public access token. Must be called before any other method.

### requestRoutes

```ts
MapboxNavigation.requestRoutes(options: RequestRoutesOptions): Promise<DirectionsResponse>
```

Request routes from the Mapbox Directions API.

```ts
const response = await MapboxNavigation.requestRoutes({
  waypoints: [
    { latitude: 52.379, longitude: 4.900 },
    { latitude: 52.368, longitude: 4.904 },
  ],
  profile: 'driving-traffic', // 'driving' | 'driving-traffic' | 'walking' | 'cycling'
  alternatives: true,
  steps: true,
  language: 'nl',
  avoid: ['toll', 'ferry'],
});
```

### startActiveGuidance

```ts
MapboxNavigation.startActiveGuidance(options: StartActiveGuidanceOptions): Promise<void>
```

Start a turn-by-turn navigation session using a previously requested route.

```ts
await MapboxNavigation.startActiveGuidance({
  response,          // DirectionsResponse from requestRoutes
  routeIndex: 0,     // which route to navigate (default: 0)
  simulate: true,    // replay route without real GPS (default: false)
});
```

### stopNavigation

```ts
MapboxNavigation.stopNavigation(): Promise<void>
```

### startFreeDrive / pauseFreeDrive

```ts
MapboxNavigation.startFreeDrive(): Promise<void>
MapboxNavigation.pauseFreeDrive(): Promise<void>
```

Start or pause free-drive mode. In free drive the map shows your location without an active route.

### getSessionState

```ts
MapboxNavigation.getSessionState(): Promise<SessionState>
// Returns: 'idle' | 'freeDrive' | 'activeGuidance'
```

### getCurrentLocation

```ts
MapboxNavigation.getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null>
```

### navigateNextLeg

```ts
MapboxNavigation.navigateNextLeg(): Promise<void>
```

Advance to the next waypoint leg in a multi-stop route.

### requestLocationPermission

```ts
MapboxNavigation.requestLocationPermission(options?: {
  background?: boolean;
  precise?: boolean;
}): Promise<'granted' | 'denied' | 'restricted'>
```

### getLocationPermissionStatus

```ts
MapboxNavigation.getLocationPermissionStatus(): LocationPermissionStatus
```

### configureTts

```ts
MapboxNavigation.configureTts(options: ConfigureTtsOptions): Promise<void>
```

Configure text-to-speech voice instructions.

```ts
await MapboxNavigation.configureTts({
  enabled: true,           // default: true
  volume: 0.8,             // 0.0–1.0
  speechRate: 1.2,         // 0.5–2.0
  voiceIdentifier: 'nl-NL',
  engine: 'mapbox',        // 'platform' (default) | 'mapbox'
});
```

- `platform` — uses `AVSpeechSynthesizer` (iOS) or `android.speech.tts.TextToSpeech` (Android). Offline, free.
- `mapbox` — fetches cloud-rendered MP3 audio per instruction via the Mapbox Voice API. Higher quality, requires network.

### setKeepScreenOn

```ts
MapboxNavigation.setKeepScreenOn(enabled: boolean): void
```

### setSimulated

```ts
MapboxNavigation.setSimulated(enabled: boolean, speedMultiplier?: number): Promise<void>
```

Toggle simulation at runtime. `speedMultiplier` is supported on Android only.

### refreshRouteNow / pauseRouteRefresh / resumeRouteRefresh

```ts
MapboxNavigation.refreshRouteNow(): Promise<void>
MapboxNavigation.pauseRouteRefresh(): Promise<void>
MapboxNavigation.resumeRouteRefresh(): Promise<void>
```

Android only. iOS handles route refresh automatically.

### startHistoryRecording / stopHistoryRecording

```ts
MapboxNavigation.startHistoryRecording(): Promise<void>
const filePath = await MapboxNavigation.stopHistoryRecording(): Promise<string>
```

## Imperative map API

Control the map programmatically. These are module-level methods that operate on the currently mounted `<MapboxNavigationMapView>`.

```ts
// Camera
await MapboxNavigation.setCamera({
  center: [4.9, 52.37],     // [lng, lat]
  zoom: 14,
  bearing: 90,
  pitch: 45,
  animationDuration: 1000,   // ms, 0 = instant
  padding: { top: 100, right: 20, bottom: 160, left: 20 },
});

// Sources
await MapboxNavigation.addGeoJsonSource('my-source', {
  data: { type: 'FeatureCollection', features: [...] },
});
await MapboxNavigation.removeSource('my-source');

// Layers
await MapboxNavigation.addLineLayer('my-line', {
  sourceId: 'my-source',
  paint: { lineColor: '#ff0000', lineWidth: 3, lineOpacity: 0.8 },
  belowLayerId: 'some-layer',
});
await MapboxNavigation.addCircleLayer('my-circles', {
  sourceId: 'my-source',
  paint: { circleColor: '#00ff00', circleRadius: 6 },
});
await MapboxNavigation.removeLayer('my-line');

// Images
await MapboxNavigation.addImage('marker', 'https://example.com/pin.png');
await MapboxNavigation.removeImage('marker');
```

## Events

Subscribe using Expo's `useEvent` hook:

```tsx
import { useEvent } from 'expo';
import { ExpoMapboxNavigationNative } from '@heumes-it/expo-mapbox-navigation';

const progress = useEvent(ExpoMapboxNavigationNative as any, 'onRouteProgress') as any;
```

### onRouteProgress

Fires ~1 Hz during active guidance.

```ts
{
  distanceRemaining: number;    // meters
  durationRemaining: number;    // seconds
  fractionTraveled: number;     // 0.0–1.0
  currentLegIndex: number;
  currentStepIndex: number;
  currentStreetName?: string;
  distanceToNextTurn?: number;  // meters
  speedLimit?: { speed: number; unit: 'km/h' | 'mph'; sign?: 'vienna' | 'mutcd' };
  lanes?: Array<{ indications: string[]; valid: boolean; active?: boolean }>;
  upcomingManeuver?: { type: string; modifier?: string; instruction?: string };
}
```

### onLocationUpdate

```ts
{ latitude: number; longitude: number; bearing?: number; speed?: number; accuracy?: number; matchState: 'matched' | 'notMatched' | 'uncertain' }
```

### onSessionStateChange

```ts
{ state: 'idle' | 'freeDrive' | 'activeGuidance' }
```

### onVoiceInstruction

```ts
{ text: string; ssmlText?: string; distanceAlongStep: number }
```

### onBannerInstruction

```ts
{
  primary: { text: string; type?: string; modifier?: string; components?: Array<{ text: string; type?: string }> };
  secondary?: { text: string };
  sub?: { text: string };
  distanceAlongStep: number;
  lanes?: Array<{ indications: string[]; valid: boolean; active?: boolean }>;
}
```

### onSpeedLimitUpdate

```ts
{ speed: number; unit: 'km/h' | 'mph'; sign?: 'vienna' | 'mutcd' }
```

### onOffRoute / onRerouteStarted / onRerouteCompleted / onRerouteFailed

Reroute lifecycle events. `onRerouteCompleted` includes `{ route }`, `onRerouteFailed` includes `{ code, message }`.

### onWaypointApproaching / onWaypointArrived / onFinalDestinationArrived

Waypoint arrival events. `onWaypointApproaching` fires at ~500m with `{ waypointIndex, distanceRemaining }`.

### onContinuousAlternativesUpdated / onFasterRouteAvailable / onRouteRefreshed

Route update events during active guidance.

## `<MapboxNavigationMapView>`

```tsx
<MapboxNavigationMapView
  style={{ flex: 1 }}
  styleURL="mapbox://styles/mapbox/navigation-day-v1"
  navigationCameraState="following"  // 'following' | 'overview' | 'idle'
  routeLineColor="#6728a1"           // hex color for the route line
/>
```

### styleURL

`string`, defaults to `'mapbox://styles/mapbox/navigation-day-v1'`. Any Mapbox style URL.

### navigationCameraState

`'following' | 'overview' | 'idle'`, defaults to `'following'`.

- `following` — camera tracks the user puck with bearing-locked tilt
- `overview` — camera fits the remaining route geometry
- `idle` — user-controlled via gestures

### routeLineColor

`string` (hex), defaults to Mapbox blue. Overrides the base route line color. Traffic congestion colors (moderate/heavy/severe) are preserved.

## Platform notes

**iOS** — Mapbox Navigation SDK v3 via SPM. The config plugin injects a Podfile `post_install` hook that embeds SPM binary frameworks and patches `ExpoModulesProvider.swift` for Swift 6 compatibility.

**Android** — Mapbox Navigation SDK v3.18.0 via Maven. Requires `MAPBOX_DOWNLOADS_TOKEN` in `~/.gradle/gradle.properties`. The map view uses `TextureView` mode with a singleton holder to prevent black-screen on tab navigation remount.

**Route refresh** — `refreshRouteNow()` / `pauseRouteRefresh()` / `resumeRouteRefresh()` are implemented on Android. iOS handles refresh automatically.

**Simulation speed** — `setSimulated(true, speedMultiplier)` speed control works on Android. iOS simulation runs at a fixed speed.

## Disclaimer

This project is an independent, community-built package and is not affiliated with, endorsed by, or sponsored by Mapbox, Inc. "Mapbox" is a registered trademark of Mapbox, Inc. Use of the Mapbox Navigation SDK is subject to Mapbox's own [terms of service](https://www.mapbox.com/tos/).

## License

MIT
