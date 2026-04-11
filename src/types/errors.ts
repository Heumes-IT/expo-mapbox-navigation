/**
 * Error shape rejected from {@link MapboxNavigation.requestRoutes} and other
 * async methods. Codes:
 *
 *   - `NO_TOKEN`      — `setAccessToken` was not called
 *   - `INVALID_INPUT` — fewer than 2 waypoints, bad coordinates, etc.
 *   - `NETWORK`       — transport failed
 *   - `NO_ROUTE`      — SDK returned no routes
 *   - `UNKNOWN`       — anything else, with the SDK's message verbatim
 */
export interface DirectionsError {
  code: 'NO_TOKEN' | 'INVALID_INPUT' | 'NETWORK' | 'NO_ROUTE' | 'UNKNOWN';
  message: string;
}
