import { native } from './MapboxNavigationNative';

import type {
  RequestRoutesOptions,
  DirectionsResponse,
  DirectionsError,
  SessionState,
  StartActiveGuidanceOptions,
  ConfigureTtsOptions,
  LocationPermissionStatus,
  RequestLocationPermissionOptions,
  CameraOptions,
  GeoJsonSourceOptions,
  LineLayerOptions,
  CircleLayerOptions,
} from './types';

const KNOWN_ERROR_CODES: ReadonlySet<DirectionsError['code']> = new Set([
  'NO_TOKEN',
  'INVALID_INPUT',
  'NETWORK',
  'NO_ROUTE',
  'UNKNOWN',
]);

function toDirectionsError(e: unknown): DirectionsError {
  const code = (e as { code?: string })?.code;
  const message = (e as { message?: string })?.message ?? String(e);
  if (typeof code === 'string' && KNOWN_ERROR_CODES.has(code as DirectionsError['code'])) {
    return { code: code as DirectionsError['code'], message };
  }
  return { code: 'UNKNOWN', message };
}

/**
 * Public API facade. Wraps the raw native module in typed, JS-ergonomic methods.
 * Default export of the package.
 */
export const MapboxNavigation = {
  /**
   * Sets the Mapbox access token. Must be called before any other method.
   *
   * @param token - A valid Mapbox public access token.
   */
  setAccessToken(token: string): void {
    native.setAccessToken(token);
  },

  /**
   * Requests routes between the given waypoints.
   *
   * @param options - Routing options including waypoints, profile, and preferences.
   * @returns The full Directions API response envelope.
   * @throws {@link DirectionsError} When routing fails.
   */
  async requestRoutes(options: RequestRoutesOptions): Promise<DirectionsResponse> {
    try {
      const json = await native.requestRoutesNative(JSON.stringify(options));
      return JSON.parse(json) as DirectionsResponse;
    } catch (e) {
      throw toDirectionsError(e);
    }
  },

  /**
   * Starts an active guidance session from a previously returned route response.
   *
   * @param options - Options including the route response and optional route index.
   * @throws {@link DirectionsError} When the session cannot be started.
   */
  async startActiveGuidance(options: StartActiveGuidanceOptions): Promise<void> {
    try {
      await native.startActiveGuidanceNative(JSON.stringify(options));
    } catch (e) {
      throw toDirectionsError(e);
    }
  },

  /**
   * Stops the active navigation session and returns to idle state.
   *
   * @throws {@link DirectionsError} When stop fails.
   */
  async stopNavigation(): Promise<void> {
    try {
      await native.stopNavigation();
    } catch (e) {
      throw toDirectionsError(e);
    }
  },

  /**
   * Returns the current session state.
   *
   * @returns One of `'idle'`, `'freeDrive'`, or `'activeGuidance'`.
   */
  async getSessionState(): Promise<SessionState> {
    return await native.getSessionState();
  },

  /**
   * Configures text-to-speech playback settings.
   *
   * @param options - TTS options (volume, rate, engine, etc.).
   * @throws {@link DirectionsError} When configuration fails.
   */
  async configureTts(options: ConfigureTtsOptions): Promise<void> {
    try {
      await native.configureTtsNative(JSON.stringify(options));
    } catch (e) {
      throw toDirectionsError(e);
    }
  },

  /**
   * Requests location permission from the user.
   *
   * @param options - Permission options (background, precise).
   * @returns The resulting permission status.
   * @throws {@link DirectionsError} When the request fails.
   */
  async requestLocationPermission(options?: RequestLocationPermissionOptions): Promise<LocationPermissionStatus> {
    try {
      const result = await native.requestLocationPermission(JSON.stringify(options ?? {}));
      return result as LocationPermissionStatus;
    } catch (e) {
      throw toDirectionsError(e);
    }
  },

  /**
   * Returns the current location permission status synchronously.
   *
   * @returns The current permission status.
   */
  getLocationPermissionStatus(): LocationPermissionStatus {
    return native.getLocationPermissionStatus() as LocationPermissionStatus;
  },

  /**
   * Starts a free drive session (passive tracking without active navigation).
   */
  async startFreeDrive(): Promise<void> {
    await native.startFreeDrive();
  },

  /**
   * Pauses the current free drive session.
   */
  async pauseFreeDrive(): Promise<void> {
    await native.pauseFreeDrive();
  },

  /**
   * Advances navigation to the next leg of a multi-leg route.
   *
   * @throws {@link DirectionsError} When advancement fails.
   */
  async navigateNextLeg(): Promise<void> {
    try {
      await native.navigateNextLeg();
    } catch (e) {
      throw toDirectionsError(e);
    }
  },

  /**
   * Keeps the screen on (or allows it to sleep) during navigation.
   *
   * @param enabled - `true` to prevent screen sleep; `false` to restore default.
   */
  setKeepScreenOn(enabled: boolean): void {
    native.setKeepScreenOn(enabled);
  },

  /**
   * Triggers an immediate route refresh to update traffic and ETA data.
   */
  async refreshRouteNow(): Promise<void> {
    await native.refreshRouteNow();
  },

  /**
   * Pauses automatic background route refresh.
   */
  async pauseRouteRefresh(): Promise<void> {
    await native.pauseRouteRefresh();
  },

  /**
   * Resumes automatic background route refresh after a pause.
   */
  async resumeRouteRefresh(): Promise<void> {
    await native.resumeRouteRefresh();
  },

  /**
   * Enables or disables route simulation (replaying route geometry instead of real GPS).
   *
   * @param enabled - `true` to enable simulation.
   * @param speedMultiplier - Playback speed. Default: 1.
   */
  async setSimulated(enabled: boolean, speedMultiplier?: number): Promise<void> {
    await native.setSimulated(JSON.stringify({ enabled, speedMultiplier: speedMultiplier ?? 1 }));
  },

  /**
   * Starts recording navigation history to a binary file.
   */
  async startHistoryRecording(): Promise<void> {
    await native.startHistoryRecording();
  },

  /**
   * Stops recording navigation history and returns the path to the recorded file.
   *
   * @returns Absolute file path to the history recording.
   */
  async stopHistoryRecording(): Promise<string> {
    return await native.stopHistoryRecording();
  },

  /**
   * Programmatically moves the map camera.
   *
   * @param options - Camera target, zoom, bearing, pitch, animation duration, and padding.
   */
  async setCamera(options: CameraOptions): Promise<void> {
    await native.setCamera(JSON.stringify(options));
  },

  /**
   * Adds a GeoJSON data source to the map.
   *
   * @param id - Unique source identifier.
   * @param options - GeoJSON data to add.
   */
  async addGeoJsonSource(id: string, options: GeoJsonSourceOptions): Promise<void> {
    await native.addGeoJsonSource(JSON.stringify({ id, ...options }));
  },

  /**
   * Removes a previously added GeoJSON source from the map.
   *
   * @param id - Source identifier to remove.
   */
  async removeSource(id: string): Promise<void> {
    await native.removeSource(id);
  },

  /**
   * Adds a line layer to the map backed by a GeoJSON source.
   *
   * @param id - Unique layer identifier.
   * @param options - Layer options including source ID and paint properties.
   */
  async addLineLayer(id: string, options: LineLayerOptions): Promise<void> {
    await native.addLineLayer(JSON.stringify({ id, ...options }));
  },

  /**
   * Adds a circle layer to the map backed by a GeoJSON source.
   *
   * @param id - Unique layer identifier.
   * @param options - Layer options including source ID and paint properties.
   */
  async addCircleLayer(id: string, options: CircleLayerOptions): Promise<void> {
    await native.addCircleLayer(JSON.stringify({ id, ...options }));
  },

  /**
   * Removes a previously added layer from the map.
   *
   * @param id - Layer identifier to remove.
   */
  async removeLayer(id: string): Promise<void> {
    await native.removeLayer(id);
  },

  /**
   * Adds an image asset to the map style for use in symbol layers.
   *
   * @param id - Unique image identifier.
   * @param uri - HTTP/HTTPS URL or local file URI of the image.
   */
  async addImage(id: string, uri: string): Promise<void> {
    await native.addImage(JSON.stringify({ id, uri }));
  },

  /**
   * Removes a previously added image from the map style.
   *
   * @param id - Image identifier to remove.
   */
  async removeImage(id: string): Promise<void> {
    await native.removeImage(id);
  },

  /**
   * Returns the current map-matched GPS location, if available.
   *
   * @returns Latitude/longitude, or `null` when no location is available.
   */
  async getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
    return await native.getCurrentLocation();
  },
};

export default MapboxNavigation;
