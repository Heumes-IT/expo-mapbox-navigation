import type {
  Waypoint,
  Route,
  RouteLeg,
  RouteStep,
  StepManeuver,
  RequestRoutesOptions,
  // RequestRoutesResult removed
  DirectionsError,
  DirectionsResponse,
  RouteWaypoint,
  DirectionsRouteOptions,
  SessionState,
  StartActiveGuidanceOptions,
  RouteProgress,
  LocationUpdate,
  SessionStateChange,
  MapboxNavigationModuleEvents,
  VoiceInstruction,
  BannerInstruction,
  OffRoute,
  RerouteStarted,
  RerouteCompleted,
  RerouteFailed,
  WaypointApproaching,
  WaypointArrived,
  FinalDestinationArrived,
  ConfigureTtsOptions,
  MapboxNavigationMapViewProps,
} from '../types';

// These tests exist to catch accidental type-shape regressions. They don't
// execute any code — the assertions happen at tsc time.
describe('routing types', () => {
  it('accepts a minimum Waypoint', () => {
    const w: Waypoint = { latitude: 37.78, longitude: -122.41 };
    expect(w.latitude).toBe(37.78);
  });

  it('accepts a Waypoint with name', () => {
    const w: Waypoint = { latitude: 37.78, longitude: -122.41, name: 'Home' };
    expect(w.name).toBe('Home');
  });

  it('accepts a minimum RequestRoutesOptions', () => {
    const o: RequestRoutesOptions = {
      waypoints: [
        { latitude: 37.78, longitude: -122.41 },
        { latitude: 37.44, longitude: -122.16 },
      ],
      profile: 'driving-traffic',
    };
    expect(o.waypoints).toHaveLength(2);
  });

  it('accepts optional RequestRoutesOptions fields', () => {
    const o: RequestRoutesOptions = {
      waypoints: [
        { latitude: 37.78, longitude: -122.41 },
        { latitude: 37.44, longitude: -122.16 },
      ],
      profile: 'driving',
      alternatives: true,
      avoid: ['toll', 'ferry'],
      language: 'en',
      steps: true,
    };
    expect(o.avoid).toContain('toll');
  });

  it('shapes a Route to match the Mapbox Directions JSON spec', () => {
    const maneuver: StepManeuver = {
      type: 'depart',
      instruction: 'Head north on Main St',
      location: [-122.41, 37.78],
      bearing_before: 0,
      bearing_after: 0,
    };
    const step: RouteStep = {
      distance: 10,
      duration: 5,
      geometry: 'abc',
      name: 'Main St',
      mode: 'driving',
      maneuver,
    };
    const leg: RouteLeg = {
      distance: 10,
      duration: 5,
      summary: 'Main St',
      steps: [step],
    };
    const route: Route = {
      distance: 10,
      duration: 5,
      geometry: 'abc',
      weight: 10,
      weight_name: 'auto',
      legs: [leg],
    };
    expect(route.legs[0].steps[0].maneuver.type).toBe('depart');
  });

  it('shapes a DirectionsError', () => {
    const e: DirectionsError = { code: 'NO_ROUTE', message: 'No route found' };
    expect(e.code).toBe('NO_ROUTE');
  });

  it('shapes a DirectionsResponse', () => {
    const r: DirectionsResponse = {
      code: 'Ok',
      routes: [],
      waypoints: [],
      routeOptions: {
        profile: 'mapbox/driving-traffic',
        coordinates: [[-122.41, 37.78], [-122.14, 37.44]],
      },
    };
    expect(r.code).toBe('Ok');
  });

  it('shapes a RouteWaypoint', () => {
    const w: RouteWaypoint = { name: 'San Francisco', location: [-122.41, 37.78] };
    expect(w.name).toBe('San Francisco');
  });

  it('narrows SessionState to the expected union', () => {
    const a: SessionState = 'idle';
    const b: SessionState = 'freeDrive';
    const c: SessionState = 'activeGuidance';
    expect([a, b, c]).toHaveLength(3);
  });

  it('shapes StartActiveGuidanceOptions with and without optional fields', () => {
    const minimal: StartActiveGuidanceOptions = {
      response: {
        code: 'Ok',
        routes: [],
        waypoints: [],
        routeOptions: { profile: 'mapbox/driving', coordinates: [] },
      },
    };
    const full: StartActiveGuidanceOptions = {
      response: minimal.response,
      routeIndex: 1,
      simulate: true,
    };
    expect(full.simulate).toBe(true);
    expect(minimal.routeIndex).toBeUndefined();
  });

  it('shapes a RouteProgress event payload', () => {
    const p: RouteProgress = {
      distanceRemaining: 1000,
      durationRemaining: 120,
      fractionTraveled: 0.5,
      currentLegIndex: 0,
      currentStepIndex: 3,
      upcomingManeuver: { type: 'turn', modifier: 'left', instruction: 'Turn left on Main St' },
    };
    expect(p.fractionTraveled).toBe(0.5);
  });

  it('shapes a LocationUpdate event payload', () => {
    const l: LocationUpdate = {
      latitude: 37.78,
      longitude: -122.41,
      bearing: 90,
      speed: 15,
      matchState: 'matched',
    };
    expect(l.matchState).toBe('matched');
  });

  it('shapes a SessionStateChange event payload', () => {
    const s: SessionStateChange = { state: 'activeGuidance' };
    expect(s.state).toBe('activeGuidance');
  });

  it('populates MapboxNavigationModuleEvents', () => {
    const handlers: Partial<MapboxNavigationModuleEvents> = {
      onRouteProgress: (e) => expect(e.distanceRemaining).toBeGreaterThanOrEqual(0),
      onLocationUpdate: (e) => expect(e.matchState).toBeDefined(),
      onSessionStateChange: (e) => expect(e.state).toBeDefined(),
    };
    expect(handlers).toBeDefined();
  });

  // Suppress unused-import warnings for types used only as type annotations.
  it('references imported types to suppress unused-import lint errors', () => {
    const _routeWaypoint: RouteWaypoint = { name: '', location: [0, 0] };
    const _dirRouteOptions: DirectionsRouteOptions = { profile: '', coordinates: [] };
    expect(_routeWaypoint).toBeDefined();
    expect(_dirRouteOptions).toBeDefined();
  });
});

describe('plan 5 event types', () => {
  it('shapes a minimal VoiceInstruction', () => {
    const v: VoiceInstruction = { text: 'Turn left', distanceAlongStep: 100 };
    expect(v.text).toBe('Turn left');
  });

  it('shapes a VoiceInstruction with SSML', () => {
    const v: VoiceInstruction = {
      text: 'Turn left',
      ssmlText: '<speak>Turn <emphasis>left</emphasis></speak>',
      distanceAlongStep: 100,
    };
    expect(v.ssmlText).toContain('speak');
  });

  it('shapes a BannerInstruction with nested components', () => {
    const b: BannerInstruction = {
      primary: {
        text: 'Main St',
        type: 'turn',
        modifier: 'left',
        components: [
          { text: 'Main', type: 'text' },
          { text: 'St', type: 'text', abbreviation: 'St', abbreviationPriority: 1 },
        ],
      },
      secondary: { text: 'toward Broadway' },
      sub: { text: 'exit 12' },
      distanceAlongStep: 50,
    };
    expect(b.primary.components).toHaveLength(2);
    expect(b.secondary?.text).toBe('toward Broadway');
  });

  it('shapes empty reroute event payloads', () => {
    const off: OffRoute = {};
    const started: RerouteStarted = {};
    const final: FinalDestinationArrived = {};
    expect(off).toBeDefined();
    expect(started).toBeDefined();
    expect(final).toBeDefined();
  });

  it('shapes a RerouteCompleted with a Route', () => {
    const route: Route = {
      distance: 100,
      duration: 60,
      geometry: 'abc',
      weight: 60,
      weight_name: 'auto',
      legs: [],
    };
    const c: RerouteCompleted = { route };
    expect(c.route.distance).toBe(100);
  });

  it('shapes a RerouteFailed', () => {
    const f: RerouteFailed = { code: 'NETWORK', message: 'no connection' };
    expect(f.code).toBe('NETWORK');
  });

  it('shapes WaypointApproaching and WaypointArrived', () => {
    const a: WaypointApproaching = { waypointIndex: 1, distanceRemaining: 450 };
    const b: WaypointArrived = { waypointIndex: 1 };
    expect(a.distanceRemaining).toBe(450);
    expect(b.waypointIndex).toBe(1);
  });

  it('shapes ConfigureTtsOptions minimal and full', () => {
    const minimal: ConfigureTtsOptions = {};
    const full: ConfigureTtsOptions = {
      enabled: false,
      volume: 0.8,
      speechRate: 1.2,
      voiceIdentifier: 'en-US',
    };
    expect(minimal.enabled).toBeUndefined();
    expect(full.voiceIdentifier).toBe('en-US');
  });

  it('shapes MapboxNavigationMapViewProps', () => {
    const p: MapboxNavigationMapViewProps = {
      styleURL: 'mapbox://styles/mapbox/navigation-night-v1',
      navigationCameraState: 'overview',
      style: { flex: 1 },
    };
    expect(p.navigationCameraState).toBe('overview');
  });

  it('populates MapboxNavigationModuleEvents with all 12 entries', () => {
    const handlers: Partial<MapboxNavigationModuleEvents> = {
      onRouteProgress: () => {},
      onLocationUpdate: () => {},
      onSessionStateChange: () => {},
      onVoiceInstruction: () => {},
      onBannerInstruction: () => {},
      onOffRoute: () => {},
      onRerouteStarted: () => {},
      onRerouteCompleted: () => {},
      onRerouteFailed: () => {},
      onWaypointApproaching: () => {},
      onWaypointArrived: () => {},
      onFinalDestinationArrived: () => {},
    };
    expect(Object.keys(handlers)).toHaveLength(12);
  });
});
