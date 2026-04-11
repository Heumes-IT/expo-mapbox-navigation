import type { MapboxNavigationPluginProps } from '../types';

export type InfoPlistDict = Record<string, unknown>;

export function applyMapboxInfoPlist(
  plist: InfoPlistDict,
  props: MapboxNavigationPluginProps
): InfoPlistDict {
  const next: InfoPlistDict = { ...plist };
  if (props.accessToken) {
    next.MBXAccessToken = props.accessToken;
  }
  next.NSLocationWhenInUseUsageDescription = props.locationWhenInUseDescription;
  return next;
}
