const mockSetAccessToken = jest.fn() as jest.MockedFunction<(s: string) => void>;
const mockRequestRoutesNative = jest.fn() as jest.MockedFunction<(s: string) => Promise<string>>;
const mockStartActiveGuidance = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;
const mockStopNavigation = jest.fn() as jest.MockedFunction<() => Promise<void>>;
const mockGetSessionState = jest.fn() as jest.MockedFunction<() => Promise<string>>;
const mockConfigureTts = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;
const mockRequestLocationPermission = jest.fn() as jest.MockedFunction<(s: string) => Promise<string>>;
const mockGetLocationPermissionStatus = jest.fn() as jest.MockedFunction<() => string>;
const mockStartFreeDrive = jest.fn() as jest.MockedFunction<() => Promise<void>>;
const mockPauseFreeDrive = jest.fn() as jest.MockedFunction<() => Promise<void>>;
const mockNavigateNextLeg = jest.fn() as jest.MockedFunction<() => Promise<void>>;
const mockSetKeepScreenOn = jest.fn() as jest.MockedFunction<(b: boolean) => void>;
const mockRefreshRouteNow = jest.fn() as jest.MockedFunction<() => Promise<void>>;
const mockPauseRouteRefresh = jest.fn() as jest.MockedFunction<() => Promise<void>>;
const mockResumeRouteRefresh = jest.fn() as jest.MockedFunction<() => Promise<void>>;
const mockSetSimulated = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;
const mockStartHistoryRecording = jest.fn() as jest.MockedFunction<() => Promise<void>>;
const mockStopHistoryRecording = jest.fn() as jest.MockedFunction<() => Promise<string>>;
const mockSetCamera = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;
const mockAddGeoJsonSource = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;
const mockRemoveSource = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;
const mockAddLineLayer = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;
const mockAddCircleLayer = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;
const mockRemoveLayer = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;
const mockAddImage = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;
const mockRemoveImage = jest.fn() as jest.MockedFunction<(s: string) => Promise<void>>;

jest.mock('expo', () => ({
  requireNativeModule: () => ({
    setAccessToken: mockSetAccessToken,
    requestRoutesNative: mockRequestRoutesNative,
    startActiveGuidanceNative: mockStartActiveGuidance,
    stopNavigation: mockStopNavigation,
    getSessionState: mockGetSessionState,
    configureTtsNative: mockConfigureTts,
    requestLocationPermission: mockRequestLocationPermission,
    getLocationPermissionStatus: mockGetLocationPermissionStatus,
    startFreeDrive: mockStartFreeDrive,
    pauseFreeDrive: mockPauseFreeDrive,
    navigateNextLeg: mockNavigateNextLeg,
    setKeepScreenOn: mockSetKeepScreenOn,
    refreshRouteNow: mockRefreshRouteNow,
    pauseRouteRefresh: mockPauseRouteRefresh,
    resumeRouteRefresh: mockResumeRouteRefresh,
    setSimulated: mockSetSimulated,
    startHistoryRecording: mockStartHistoryRecording,
    stopHistoryRecording: mockStopHistoryRecording,
    setCamera: mockSetCamera,
    addGeoJsonSource: mockAddGeoJsonSource,
    removeSource: mockRemoveSource,
    addLineLayer: mockAddLineLayer,
    addCircleLayer: mockAddCircleLayer,
    removeLayer: mockRemoveLayer,
    addImage: mockAddImage,
    removeImage: mockRemoveImage,
  }),
  NativeModule: class {},
}));

import MapboxNavigation from '../MapboxNavigation';
import { native } from '../MapboxNavigationNative';
import type {
  RequestRoutesOptions,
  Route,
  DirectionsResponse,
  StartActiveGuidanceOptions,
  ConfigureTtsOptions,
} from '../types';

const BASIC_ROUTE_OPTIONS: RequestRoutesOptions = {
  waypoints: [
    { latitude: 37.78, longitude: -122.41 },
    { latitude: 37.44, longitude: -122.16 },
  ],
  profile: 'driving-traffic',
};

const FAKE_ROUTE: Route = {
  distance: 50000,
  duration: 2400,
  geometry: 'encoded',
  weight: 2400,
  weight_name: 'auto',
  legs: [
    {
      distance: 50000,
      duration: 2400,
      summary: 'US-101 S',
      steps: [],
    },
  ],
};

const FAKE_RESPONSE: DirectionsResponse = {
  code: 'Ok',
  routes: [],
  waypoints: [],
  routeOptions: { profile: 'mapbox/driving', coordinates: [] },
};

// ---------------------------------------------------------------------------

describe('MapboxNavigation.setAccessToken', () => {
  beforeEach(() => jest.clearAllMocks());

  it('delegates to native', () => {
    MapboxNavigation.setAccessToken('pk.test');
    expect(mockSetAccessToken).toHaveBeenCalledWith('pk.test');
  });
});

// ---------------------------------------------------------------------------

describe('MapboxNavigation.requestRoutes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stringifies options and forwards to native', async () => {
    mockRequestRoutesNative.mockResolvedValueOnce(
      JSON.stringify({
        code: 'Ok',
        routes: [FAKE_ROUTE],
        waypoints: [],
        routeOptions: { profile: 'mapbox/driving-traffic', coordinates: [] },
      })
    );
    await MapboxNavigation.requestRoutes(BASIC_ROUTE_OPTIONS);
    expect(mockRequestRoutesNative).toHaveBeenCalledWith(
      JSON.stringify(BASIC_ROUTE_OPTIONS)
    );
  });

  it('parses the native JSON response into a typed result', async () => {
    mockRequestRoutesNative.mockResolvedValueOnce(
      JSON.stringify({
        code: 'Ok',
        routes: [FAKE_ROUTE],
        waypoints: [],
        routeOptions: { profile: 'mapbox/driving-traffic', coordinates: [] },
      })
    );
    const result = await MapboxNavigation.requestRoutes(BASIC_ROUTE_OPTIONS);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].distance).toBe(50000);
    expect(result.routes[0].legs[0].summary).toBe('US-101 S');
  });

  it('re-wraps native CodedError as DirectionsError', async () => {
    const nativeErr = Object.assign(new Error('Network unreachable'), {
      code: 'NETWORK',
    });
    mockRequestRoutesNative.mockRejectedValueOnce(nativeErr);
    await expect(
      MapboxNavigation.requestRoutes(BASIC_ROUTE_OPTIONS)
    ).rejects.toMatchObject({
      code: 'NETWORK',
      message: 'Network unreachable',
    });
  });

  it('maps an unknown native error code to UNKNOWN', async () => {
    mockRequestRoutesNative.mockRejectedValueOnce(new Error('boom'));
    await expect(
      MapboxNavigation.requestRoutes(BASIC_ROUTE_OPTIONS)
    ).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'boom',
    });
  });
});

// ---------------------------------------------------------------------------

describe('MapboxNavigation.startActiveGuidance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stringifies options and forwards to native', async () => {
    mockStartActiveGuidance.mockResolvedValueOnce();
    const opts: StartActiveGuidanceOptions = { response: FAKE_RESPONSE, simulate: true };
    await MapboxNavigation.startActiveGuidance(opts);
    expect(mockStartActiveGuidance).toHaveBeenCalledWith(JSON.stringify(opts));
  });

  it('re-wraps native errors as DirectionsError', async () => {
    const err = Object.assign(new Error('no route active'), { code: 'NO_ROUTE' });
    mockStartActiveGuidance.mockRejectedValueOnce(err);
    await expect(
      MapboxNavigation.startActiveGuidance({ response: FAKE_RESPONSE })
    ).rejects.toMatchObject({ code: 'NO_ROUTE', message: 'no route active' });
  });
});

// ---------------------------------------------------------------------------

describe('MapboxNavigation.stopNavigation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('delegates to native', async () => {
    mockStopNavigation.mockResolvedValueOnce();
    await MapboxNavigation.stopNavigation();
    expect(mockStopNavigation).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('MapboxNavigation.getSessionState', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the native session state string', async () => {
    mockGetSessionState.mockResolvedValueOnce('activeGuidance');
    const state = await MapboxNavigation.getSessionState();
    expect(state).toBe('activeGuidance');
  });
});

// ---------------------------------------------------------------------------

describe('native module re-export', () => {
  it('is accessible for event subscription', () => {
    expect(native).toBeDefined();
    expect(native.setAccessToken).toBe(mockSetAccessToken);
  });
});

// ---------------------------------------------------------------------------

describe('MapboxNavigation.configureTts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stringifies options and forwards to native', async () => {
    mockConfigureTts.mockResolvedValueOnce();
    const opts: ConfigureTtsOptions = { enabled: false, volume: 0.7, speechRate: 1.2 };
    await MapboxNavigation.configureTts(opts);
    expect(mockConfigureTts).toHaveBeenCalledWith(JSON.stringify(opts));
  });

  it('accepts an empty options object', async () => {
    mockConfigureTts.mockResolvedValueOnce();
    await MapboxNavigation.configureTts({});
    expect(mockConfigureTts).toHaveBeenCalledWith('{}');
  });

  it('re-wraps native errors as DirectionsError', async () => {
    mockConfigureTts.mockRejectedValueOnce(
      Object.assign(new Error('bad voice id'), { code: 'INVALID_INPUT' })
    );
    await expect(
      MapboxNavigation.configureTts({ voiceIdentifier: 'xx-XX' })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'bad voice id' });
  });
});

// ---------------------------------------------------------------------------

describe('MapboxNavigation location + session utilities', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requestLocationPermission forwards options to native', async () => {
    mockRequestLocationPermission.mockResolvedValueOnce('granted');
    const result = await MapboxNavigation.requestLocationPermission({ background: true });
    expect(mockRequestLocationPermission).toHaveBeenCalledWith(JSON.stringify({ background: true }));
    expect(result).toBe('granted');
  });

  it('getLocationPermissionStatus returns native string', () => {
    mockGetLocationPermissionStatus.mockReturnValueOnce('denied');
    expect(MapboxNavigation.getLocationPermissionStatus()).toBe('denied');
  });

  it('startFreeDrive delegates to native', async () => {
    mockStartFreeDrive.mockResolvedValueOnce();
    await MapboxNavigation.startFreeDrive();
    expect(mockStartFreeDrive).toHaveBeenCalled();
  });

  it('pauseFreeDrive delegates to native', async () => {
    mockPauseFreeDrive.mockResolvedValueOnce();
    await MapboxNavigation.pauseFreeDrive();
    expect(mockPauseFreeDrive).toHaveBeenCalled();
  });

  it('navigateNextLeg delegates to native', async () => {
    mockNavigateNextLeg.mockResolvedValueOnce();
    await MapboxNavigation.navigateNextLeg();
    expect(mockNavigateNextLeg).toHaveBeenCalled();
  });

  it('setKeepScreenOn delegates to native', () => {
    MapboxNavigation.setKeepScreenOn(true);
    expect(mockSetKeepScreenOn).toHaveBeenCalledWith(true);
  });
});

// ---------------------------------------------------------------------------

describe('MapboxNavigation route refresh, simulation, and history', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refreshRouteNow delegates to native', async () => {
    mockRefreshRouteNow.mockResolvedValueOnce();
    await MapboxNavigation.refreshRouteNow();
    expect(mockRefreshRouteNow).toHaveBeenCalled();
  });

  it('pauseRouteRefresh delegates to native', async () => {
    mockPauseRouteRefresh.mockResolvedValueOnce();
    await MapboxNavigation.pauseRouteRefresh();
    expect(mockPauseRouteRefresh).toHaveBeenCalled();
  });

  it('resumeRouteRefresh delegates to native', async () => {
    mockResumeRouteRefresh.mockResolvedValueOnce();
    await MapboxNavigation.resumeRouteRefresh();
    expect(mockResumeRouteRefresh).toHaveBeenCalled();
  });

  it('setSimulated forwards enabled + speedMultiplier as JSON', async () => {
    mockSetSimulated.mockResolvedValueOnce();
    await MapboxNavigation.setSimulated(true, 2.5);
    expect(mockSetSimulated).toHaveBeenCalledWith(JSON.stringify({ enabled: true, speedMultiplier: 2.5 }));
  });

  it('setSimulated defaults speedMultiplier to 1', async () => {
    mockSetSimulated.mockResolvedValueOnce();
    await MapboxNavigation.setSimulated(false);
    expect(mockSetSimulated).toHaveBeenCalledWith(JSON.stringify({ enabled: false, speedMultiplier: 1 }));
  });

  it('startHistoryRecording delegates to native', async () => {
    mockStartHistoryRecording.mockResolvedValueOnce();
    await MapboxNavigation.startHistoryRecording();
    expect(mockStartHistoryRecording).toHaveBeenCalled();
  });

  it('stopHistoryRecording returns file path', async () => {
    mockStopHistoryRecording.mockResolvedValueOnce('/tmp/history.pbf.gz');
    const path = await MapboxNavigation.stopHistoryRecording();
    expect(path).toBe('/tmp/history.pbf.gz');
  });
});

// ---------------------------------------------------------------------------

describe('MapboxNavigation imperative map API', () => {
  beforeEach(() => jest.clearAllMocks());

  it('setCamera forwards JSON options', async () => {
    mockSetCamera.mockResolvedValueOnce();
    await MapboxNavigation.setCamera({ center: [4.9, 52.37], zoom: 14 });
    expect(mockSetCamera).toHaveBeenCalledWith(JSON.stringify({ center: [4.9, 52.37], zoom: 14 }));
  });

  it('addGeoJsonSource forwards id + data', async () => {
    mockAddGeoJsonSource.mockResolvedValueOnce();
    const data = { type: 'Point', coordinates: [4.9, 52.37] };
    await MapboxNavigation.addGeoJsonSource('my-source', { data });
    expect(mockAddGeoJsonSource).toHaveBeenCalledWith(JSON.stringify({ id: 'my-source', data }));
  });

  it('removeSource forwards id', async () => {
    mockRemoveSource.mockResolvedValueOnce();
    await MapboxNavigation.removeSource('my-source');
    expect(mockRemoveSource).toHaveBeenCalledWith('my-source');
  });

  it('addLineLayer forwards id + options', async () => {
    mockAddLineLayer.mockResolvedValueOnce();
    await MapboxNavigation.addLineLayer('my-line', { sourceId: 'my-source', paint: { lineColor: '#ff0000', lineWidth: 3 } });
    expect(mockAddLineLayer).toHaveBeenCalledWith(JSON.stringify({ id: 'my-line', sourceId: 'my-source', paint: { lineColor: '#ff0000', lineWidth: 3 } }));
  });

  it('addCircleLayer forwards id + options', async () => {
    mockAddCircleLayer.mockResolvedValueOnce();
    await MapboxNavigation.addCircleLayer('my-circles', { sourceId: 'my-source', paint: { circleColor: '#00ff00' } });
    expect(mockAddCircleLayer).toHaveBeenCalledWith(JSON.stringify({ id: 'my-circles', sourceId: 'my-source', paint: { circleColor: '#00ff00' } }));
  });

  it('removeLayer forwards id', async () => {
    mockRemoveLayer.mockResolvedValueOnce();
    await MapboxNavigation.removeLayer('my-line');
    expect(mockRemoveLayer).toHaveBeenCalledWith('my-line');
  });

  it('addImage forwards id + uri', async () => {
    mockAddImage.mockResolvedValueOnce();
    await MapboxNavigation.addImage('marker', 'https://example.com/marker.png');
    expect(mockAddImage).toHaveBeenCalledWith(JSON.stringify({ id: 'marker', uri: 'https://example.com/marker.png' }));
  });

  it('removeImage forwards id', async () => {
    mockRemoveImage.mockResolvedValueOnce();
    await MapboxNavigation.removeImage('marker');
    expect(mockRemoveImage).toHaveBeenCalledWith('marker');
  });
});
