# expo-mapbox-navigation

[![npm](https://img.shields.io/npm/v/@heumes-it/expo-mapbox-navigation)](https://www.npmjs.com/package/@heumes-it/expo-mapbox-navigation)
[![CI](https://github.com/Heumes-IT/expo-mapbox-navigation/actions/workflows/ci.yml/badge.svg)](https://github.com/Heumes-IT/expo-mapbox-navigation/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@heumes-it/expo-mapbox-navigation)](LICENSE)
[![docs](https://img.shields.io/badge/docs-API%20reference-blue)](https://heumes-it.github.io/expo-mapbox-navigation/)

Turn-by-turn navigation for React Native / Expo, powered by [Mapbox Navigation SDK v3](https://docs.mapbox.com/ios/navigation/guides/) on iOS and Android.

## Features

- **Routing** &mdash; request routes with driving / driving-traffic / walking / cycling profiles, alternatives, avoid tolls/ferries/motorways
- **Active guidance** &mdash; start/stop navigation sessions with real-time route progress, location tracking, and automatic rerouting
- **Free drive** &mdash; show the map with user puck before a route is requested
- **Voice instructions** &mdash; native platform TTS (AVSpeechSynthesizer / Android TextToSpeech) or Mapbox cloud speech engine
- **Banner instructions** &mdash; turn-by-turn text with lane guidance (indications + valid/active flags)
- **Map view** &mdash; `<MapboxNavigationMapView>` with route line, user puck, following/overview/idle camera
- **Speed limits** &mdash; current speed limit with sign convention (Vienna / MUTCD)
- **Imperative map API** &mdash; camera control, GeoJSON sources, line/circle layers, images
- **Simulation** &mdash; test navigation without driving via the SDK's built-in route replay
- **Expo config plugin** &mdash; automatic iOS + Android build configuration (permissions, Mapbox Maven repo, SPM framework embedding, Podfile hooks)

## Requirements

| | Version |
|---|---|
| Expo SDK | >= 55 |
| React Native | >= 0.83 |
| iOS | >= 15.1 |
| Android | minSdk 24 |
| Mapbox account | [mapbox.com](https://account.mapbox.com/) with a public (`pk.*`) and secret (`sk.*`) access token |

## Installation

```bash
npx expo install @heumes-it/expo-mapbox-navigation
```

### 1. Mapbox tokens

You need two Mapbox tokens:

- **Public token** (`pk.*`) &mdash; used at runtime for map rendering and API calls. Pass it via `MapboxNavigation.setAccessToken(token)` on app boot.
- **Secret download token** (`sk.*`, scope: `DOWNLOADS:READ`) &mdash; used at build time to fetch the Mapbox Navigation SDK binaries.

**iOS:** Add the secret token to `~/.netrc`:

```
machine api.mapbox.com
  login mapbox
  password sk.YOUR_SECRET_TOKEN
```

**Android:** Add the secret token to `~/.gradle/gradle.properties`:

```
MAPBOX_DOWNLOADS_TOKEN=sk.YOUR_SECRET_TOKEN
```

### 2. Config plugin

Add to your `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "@heumes-it/expo-mapbox-navigation",
        {
          "locationWhenInUseDescription": "We use your location to navigate.",
          "locationAlwaysDescription": "We use your location in the background for turn-by-turn guidance.",
          "enableBackgroundLocation": true
        }
      ]
    ]
  }
}
```

### 3. Prebuild

```bash
npx expo prebuild --clean
```

## Quick start

```tsx
import { useEffect } from 'react';
import MapboxNavigation, {
  ExpoMapboxNavigationNative,
  MapboxNavigationMapView,
} from 'expo-mapbox-navigation';
import { useEvent } from 'expo';

export default function NavigationScreen() {
  const sessionState = useEvent(ExpoMapboxNavigationNative as any, 'onSessionStateChange') as any;

  useEffect(() => {
    MapboxNavigation.setAccessToken('pk.YOUR_PUBLIC_TOKEN');
    MapboxNavigation.requestLocationPermission().then((status) => {
      if (status === 'granted') {
        MapboxNavigation.startFreeDrive();
      }
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
    await MapboxNavigation.startActiveGuidance({
      response,
      simulate: true, // remove for real GPS
    });
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

## API reference

### Module methods

| Method | Description |
|---|---|
| `setAccessToken(token)` | Set the Mapbox public access token |
| `requestRoutes(options)` | Request routes from the Mapbox Directions API |
| `startActiveGuidance({ response, simulate? })` | Start turn-by-turn navigation |
| `stopNavigation()` | Stop the active session |
| `startFreeDrive()` | Start free-drive mode (map + puck, no route) |
| `pauseFreeDrive()` | Pause free drive |
| `getSessionState()` | Get current state: `'idle'` / `'freeDrive'` / `'activeGuidance'` |
| `getCurrentLocation()` | Get the current GPS position `{ latitude, longitude }` |
| `navigateNextLeg()` | Advance to the next waypoint leg |
| `requestLocationPermission(options?)` | Request location permission |
| `getLocationPermissionStatus()` | Check current permission status |
| `configureTts({ enabled?, volume?, speechRate?, voiceIdentifier?, engine? })` | Configure voice (platform or Mapbox cloud) |
| `setKeepScreenOn(enabled)` | Prevent screen dimming during navigation |
| `setSimulated(enabled, speedMultiplier?)` | Toggle simulation mode at runtime |
| `refreshRouteNow()` | Request immediate route refresh (Android only) |
| `pauseRouteRefresh()` / `resumeRouteRefresh()` | Pause/resume auto-refresh (Android only) |
| `startHistoryRecording()` / `stopHistoryRecording()` | Record navigation history for debugging |

### Imperative map API

| Method | Description |
|---|---|
| `setCamera({ center?, zoom?, bearing?, pitch?, animationDuration? })` | Move the map camera |
| `addGeoJsonSource(id, { data })` | Add a GeoJSON source |
| `removeSource(id)` | Remove a source |
| `addLineLayer(id, { sourceId, paint? })` | Add a line layer |
| `addCircleLayer(id, { sourceId, paint? })` | Add a circle layer |
| `removeLayer(id)` | Remove a layer |
| `addImage(id, uri)` | Add an image from a URL |
| `removeImage(id)` | Remove an image |

### Events

Subscribe via `useEvent(ExpoMapboxNavigationNative, eventName)`:

| Event | Payload |
|---|---|
| `onRouteProgress` | `{ distanceRemaining, durationRemaining, fractionTraveled, currentLegIndex, currentStepIndex, speedLimit?, currentStreetName?, distanceToNextTurn?, lanes?, upcomingManeuver? }` |
| `onLocationUpdate` | `{ latitude, longitude, bearing?, speed?, accuracy?, matchState }` |
| `onSessionStateChange` | `{ state }` |
| `onVoiceInstruction` | `{ text, ssmlText?, distanceAlongStep }` |
| `onBannerInstruction` | `{ primary, secondary?, sub?, distanceAlongStep, lanes? }` |
| `onSpeedLimitUpdate` | `{ speed, unit, sign? }` |
| `onOffRoute` | `{}` |
| `onRerouteStarted` / `onRerouteCompleted` / `onRerouteFailed` | Reroute lifecycle |
| `onWaypointApproaching` / `onWaypointArrived` | `{ waypointIndex }` |
| `onFinalDestinationArrived` | `{}` |
| `onContinuousAlternativesUpdated` | `{ alternatives }` |
| `onFasterRouteAvailable` | `{ route, timeSavingsSeconds }` |
| `onRouteRefreshed` | `{ route }` |

### `<MapboxNavigationMapView>` props

| Prop | Type | Default |
|---|---|---|
| `styleURL` | `string` | `'mapbox://styles/mapbox/navigation-day-v1'` |
| `navigationCameraState` | `'following' \| 'overview' \| 'idle'` | `'following'` |
| `routeLineColor` | `string` (hex) | Mapbox blue |

## Config plugin options

| Option | Type | Required | Description |
|---|---|---|---|
| `locationWhenInUseDescription` | `string` | Yes | iOS permission description |
| `locationAlwaysDescription` | `string` | When `enableBackgroundLocation` | iOS background permission description |
| `enableBackgroundLocation` | `boolean` | No | Enable background location + foreground service (Android) |

## Platform notes

- **iOS:** Uses Mapbox Navigation SDK v3 via SPM. The config plugin injects a Podfile `post_install` hook that embeds SPM binary frameworks and patches `ExpoModulesProvider.swift` for Swift 6 compatibility.
- **Android:** Uses Mapbox Navigation SDK v3.18.0 via Maven. Requires `MAPBOX_DOWNLOADS_TOKEN` in `~/.gradle/gradle.properties`. The map view uses `TextureView` mode with a singleton holder to prevent black-screen on tab navigation remount.
- **Route refresh:** `refreshRouteNow()` / `pauseRouteRefresh()` / `resumeRouteRefresh()` are fully implemented on Android. iOS handles route refresh automatically.
- **Simulation speed:** `setSimulated(true, speedMultiplier)` speed control works on Android. iOS simulation runs at a fixed speed.

## Disclaimer

This project is an independent, community-built package and is not affiliated with, endorsed by, or sponsored by Mapbox, Inc. "Mapbox" is a registered trademark of Mapbox, Inc. Use of the Mapbox Navigation SDK is subject to Mapbox's own [terms of service](https://www.mapbox.com/tos/).

## License

MIT
