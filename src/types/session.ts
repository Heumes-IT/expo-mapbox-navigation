import type { DirectionsResponse } from './routing';

/** Current navigation session state. */
export type SessionState = 'idle' | 'freeDrive' | 'activeGuidance';

/** Options passed to {@link MapboxNavigation.startActiveGuidance}. */
export interface StartActiveGuidanceOptions {
  /** The full response object from `requestRoutes`. */
  response: DirectionsResponse;
  /** Index of the primary route inside `response.routes`. Default 0. */
  routeIndex?: number;
  /**
   * If true, the SDK replays the route from its geometry instead of following
   * real GPS. Use for testing without a physical drive. Default false.
   */
  simulate?: boolean;
}

/** Location permission status returned by {@link MapboxNavigation.requestLocationPermission}. */
export type LocationPermissionStatus = 'granted' | 'denied' | 'restricted';

/** Options passed to {@link MapboxNavigation.requestLocationPermission}. */
export interface RequestLocationPermissionOptions {
  /** Request background/always location in addition to when-in-use. Default: false. */
  background?: boolean;
  /** On iOS 14+, request precise (full-accuracy) location. Default: true. */
  precise?: boolean;
}
