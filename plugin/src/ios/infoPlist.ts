import type { MapboxNavigationPluginProps } from '../types';

export type InfoPlistDict = Record<string, unknown>;

const REQUIRED_BACKGROUND_MODES = ['location', 'audio'] as const;

export function applyMapboxInfoPlist(
  plist: InfoPlistDict,
  props: MapboxNavigationPluginProps
): InfoPlistDict {
  const next: InfoPlistDict = { ...plist };

  if (props.accessToken) {
    next.MBXAccessToken = props.accessToken;
  }

  next.NSLocationWhenInUseUsageDescription = props.locationWhenInUseDescription;

  if (props.enableBackgroundLocation) {
    if (!props.locationAlwaysDescription) {
      throw new Error(
        '[expo-mapbox-navigation] locationAlwaysDescription is required when enableBackgroundLocation is true.'
      );
    }
    next.NSLocationAlwaysAndWhenInUseUsageDescription = props.locationAlwaysDescription;

    const existing = Array.isArray(plist.UIBackgroundModes)
      ? (plist.UIBackgroundModes as string[])
      : [];
    const merged = [...existing];
    for (const mode of REQUIRED_BACKGROUND_MODES) {
      if (!merged.includes(mode)) {
        merged.push(mode);
      }
    }
    next.UIBackgroundModes = merged;
  }

  return next;
}
