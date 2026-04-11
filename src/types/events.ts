import type { Route } from './routing';
import type { SessionState } from './session';

/** Speed limit data for the current road segment. */
export interface SpeedLimitInfo {
  /** Speed limit value in the unit specified by `unit`. */
  speed: number;
  /** Unit of the speed limit. */
  unit: 'km/h' | 'mph';
  /**
   * Sign convention:
   *   - 'vienna': EU-style circular sign (red border, white background).
   *   - 'mutcd': US-style rectangular sign (black border, white background).
   */
  sign?: 'vienna' | 'mutcd';
}

/** Navigation progress along the active route. */
export interface RouteProgress {
  distanceRemaining: number;
  durationRemaining: number;
  fractionTraveled: number;
  currentLegIndex: number;
  currentStepIndex: number;
  upcomingManeuver?: {
    type: string;
    modifier?: string;
    bearingAfter?: number;
    instruction?: string;
  };
  /** Current speed limit on the road segment, if available. */
  speedLimit?: SpeedLimitInfo;
  /** Name of the street the user is currently driving on. */
  currentStreetName?: string;
  /** Distance in meters to the next maneuver/turn. */
  distanceToNextTurn?: number;
}

/** Map-matched location update from the navigation SDK. */
export interface LocationUpdate {
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
  accuracy?: number;
  /** Whether the location is confidently snapped to the route geometry. */
  matchState: 'matched' | 'notMatched' | 'uncertain';
}

/** Emitted when the navigation session transitions between states. */
export interface SessionStateChange {
  state: SessionState;
}

/** Spoken instruction emitted at a fixed distance along a route step. */
export interface VoiceInstruction {
  /** Plain-text instruction (e.g., "In 400 meters, turn left on Main Street"). */
  text: string;
  /** Optional SSML version for advanced TTS engines. */
  ssmlText?: string;
  /** Distance (meters) along the current step at which the instruction fires. */
  distanceAlongStep: number;
}

/** A single text fragment within a banner instruction line. */
export interface BannerInstructionComponent {
  /** Plain text fragment. */
  text: string;
  /** Component type — 'text' | 'icon' | 'delimiter' | 'lane' | 'exit' | 'exit-number'. */
  type?: string;
  abbreviation?: string;
  abbreviationPriority?: number;
}

/** One line of a banner instruction (primary, secondary, or sub). */
export interface BannerInstructionLine {
  text: string;
  components?: BannerInstructionComponent[];
  /** Maneuver type (e.g. 'turn', 'merge'). */
  type?: string;
  /** Direction modifier (e.g. 'left', 'slight right'). */
  modifier?: string;
  degrees?: number;
}

/** Lane indication for an intersection — shows which lanes are valid for the upcoming maneuver. */
export interface LaneInfo {
  /** Turn indications for this lane (e.g. ['straight', 'left'], ['right']). */
  indications: string[];
  /** Whether this lane is valid for the upcoming maneuver. */
  valid: boolean;
  /** Whether this is the active/preferred lane. */
  active?: boolean;
}

/** Visual instruction displayed on the navigation banner at a distance along a step. */
export interface BannerInstruction {
  primary: BannerInstructionLine;
  secondary?: BannerInstructionLine;
  sub?: BannerInstructionLine;
  distanceAlongStep: number;
  /** Lane guidance for the upcoming intersection, if available. */
  lanes?: LaneInfo[];
}

/** Emitted when the user deviates from the active route. */
export type OffRoute = Record<string, never>;

/** Emitted when a rerouting fetch begins. */
export type RerouteStarted = Record<string, never>;

/** Emitted when a reroute completes successfully. */
export interface RerouteCompleted {
  /** The new primary route (raw Directions API Route shape). */
  route: Route;
}

/** Emitted when a reroute attempt fails. */
export interface RerouteFailed {
  code: string;
  message: string;
}

/** Emitted when approaching an intermediate waypoint. */
export interface WaypointApproaching {
  waypointIndex: number;
  /** Distance remaining to the waypoint in meters. */
  distanceRemaining: number;
}

/** Emitted when an intermediate waypoint is reached. */
export interface WaypointArrived {
  waypointIndex: number;
}

/** Emitted when the final destination is reached. */
export type FinalDestinationArrived = Record<string, never>;

/** Emitted when continuous alternative routes are updated. */
export interface ContinuousAlternativesUpdated {
  /** Updated list of alternative routes. */
  alternatives: Route[];
}

/** Emitted when a faster route than the current primary route is available. */
export interface FasterRouteAvailable {
  /** The faster alternative route. */
  route: Route;
  /** Estimated time savings in seconds. */
  timeSavingsSeconds: number;
}

/** Emitted when the primary route is refreshed with updated traffic/ETA data. */
export interface RouteRefreshed {
  /** The refreshed primary route. */
  route: Route;
}

/**
 * Event payload map for the Mapbox Navigation native module. Consumers
 * subscribe via Expo's `useEvent` hook against the raw native module
 * (exported as `ExpoMapboxNavigationNative`).
 */
export interface MapboxNavigationModuleEvents {
  onRouteProgress: (e: RouteProgress) => void;
  onLocationUpdate: (e: LocationUpdate) => void;
  onSessionStateChange: (e: SessionStateChange) => void;
  onVoiceInstruction: (e: VoiceInstruction) => void;
  onBannerInstruction: (e: BannerInstruction) => void;
  onOffRoute: (e: OffRoute) => void;
  onRerouteStarted: (e: RerouteStarted) => void;
  onRerouteCompleted: (e: RerouteCompleted) => void;
  onRerouteFailed: (e: RerouteFailed) => void;
  onWaypointApproaching: (e: WaypointApproaching) => void;
  onWaypointArrived: (e: WaypointArrived) => void;
  onFinalDestinationArrived: (e: FinalDestinationArrived) => void;
  onSpeedLimitUpdate: (e: SpeedLimitInfo) => void;
  onContinuousAlternativesUpdated: (e: ContinuousAlternativesUpdated) => void;
  onFasterRouteAvailable: (e: FasterRouteAvailable) => void;
  onRouteRefreshed: (e: RouteRefreshed) => void;
}
