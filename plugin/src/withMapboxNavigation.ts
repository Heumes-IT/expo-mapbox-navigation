import { createRunOncePlugin, type ConfigPlugin } from '@expo/config-plugins';
import { withMapboxIos } from './withMapboxIos';
import { withMapboxAndroid } from './withMapboxAndroid';
import type { MapboxNavigationPluginProps } from './types';

// Using require so this file does not need `resolveJsonModule` in tsconfig,
// which `expo-module-scripts/tsconfig.plugin` may or may not enable.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg: { name: string; version: string } = require('../../package.json');

function validateProps(props: MapboxNavigationPluginProps): void {
  if (!props.locationWhenInUseDescription) {
    throw new Error(
      '[expo-mapbox-navigation] locationWhenInUseDescription is required in plugin props.'
    );
  }
  if (props.enableBackgroundLocation && !props.locationAlwaysDescription) {
    throw new Error(
      '[expo-mapbox-navigation] locationAlwaysDescription is required when enableBackgroundLocation is true.'
    );
  }
}

const withMapboxNavigationBase: ConfigPlugin<MapboxNavigationPluginProps> = (
  config,
  props
) => {
  validateProps(props);
  let next = withMapboxIos(config, props);
  next = withMapboxAndroid(next, props);
  return next;
};

export const withMapboxNavigation = createRunOncePlugin(
  withMapboxNavigationBase,
  pkg.name,
  pkg.version
);
