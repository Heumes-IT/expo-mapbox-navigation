/**
 * Routing types mirroring the Mapbox Directions API v5 JSON response.
 *
 * @see https://docs.mapbox.com/api/navigation/directions/#route-object
 */

/** A geographic coordinate used as a navigation waypoint. */
export interface Waypoint {
  latitude: number;
  longitude: number;
  /** Optional human-readable name (shown in UI, used for arrival events). */
  name?: string;
}

/** Mapbox routing profile. */
export type RoutingProfile =
  | 'driving'
  | 'driving-traffic'
  | 'walking'
  | 'cycling';

/** Road feature categories that can be excluded from a route. */
export type AvoidFeature = 'toll' | 'ferry' | 'motorway' | 'tunnel';

/** Options passed to {@link MapboxNavigation.requestRoutes}. */
export interface RequestRoutesOptions {
  /** Minimum 2. First is the origin, last is the final destination. */
  waypoints: Waypoint[];
  profile: RoutingProfile;
  /** Request alternative routes. Default: false. */
  alternatives?: boolean;
  avoid?: AvoidFeature[];
  /** BCP-47 language code for instructions. Default: device locale. */
  language?: string;
  /** Include step-level data. Default: true. */
  steps?: boolean;
}

/** Maneuver data for a single route step. */
export interface StepManeuver {
  type: string;
  /** BCP-47 modifier (e.g. 'left', 'slight right'). */
  modifier?: string;
  instruction: string;
  /** [longitude, latitude] — matches the Directions API spec. */
  location: [number, number];
  bearing_before: number;
  bearing_after: number;
}

/** A single step within a route leg. */
export interface RouteStep {
  distance: number;
  duration: number;
  /** Encoded polyline6 (default). */
  geometry: string;
  name: string;
  mode: string;
  maneuver: StepManeuver;
}

/** A leg connecting two consecutive waypoints. */
export interface RouteLeg {
  distance: number;
  duration: number;
  summary: string;
  steps: RouteStep[];
}

/** A complete route from origin to final destination. */
export interface Route {
  distance: number;
  duration: number;
  /** Encoded polyline6 of the full route. */
  geometry: string;
  weight: number;
  weight_name: string;
  legs: RouteLeg[];
}

/**
 * Full Mapbox Directions API response envelope returned by
 * {@link MapboxNavigation.requestRoutes}. Pass unchanged to
 * {@link MapboxNavigation.startActiveGuidance} to reconstruct
 * `NavigationRoutes` with proper `RouteOptions` for geometry decoding.
 */
export interface DirectionsResponse {
  /** 'Ok' | 'NoRoute' | ... */
  code: string;
  uuid?: string;
  routes: Route[];
  waypoints: RouteWaypoint[];
  routeOptions: DirectionsRouteOptions;
}

/** Waypoint shape echoed back in the Directions API response. */
export interface RouteWaypoint {
  name: string;
  /** [longitude, latitude] */
  location: [number, number];
  distance?: number;
}

/**
 * The request-options subset that Mapbox echoes back in the Directions API
 * response. Uses the wire field names (e.g. `profile` is slash-prefixed like
 * `'mapbox/driving-traffic'`).
 */
export interface DirectionsRouteOptions {
  profile: string;
  coordinates: Array<[number, number]>;
  language?: string;
  alternatives?: boolean;
  steps?: boolean;
  geometries?: string;
  overview?: string;
  voice_instructions?: boolean;
  banner_instructions?: boolean;
  continue_straight?: boolean;
  [extra: string]: unknown;
}
