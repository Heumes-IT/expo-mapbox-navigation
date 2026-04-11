/**
 * Event payload map for the Mapbox Navigation native module.
 *
 * This starts empty; later plans add entries for onRouteProgress,
 * onLocationUpdate, onBannerInstruction, etc. Keeping the record type
 * lets consumers add `addListener` calls without the module changing
 * its outer shape each time.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MapboxNavigationModuleEvents extends Record<string, never> {}
