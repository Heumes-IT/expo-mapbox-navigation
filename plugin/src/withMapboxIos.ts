import { withInfoPlist, type ConfigPlugin } from '@expo/config-plugins';
import { applyMapboxInfoPlist, type InfoPlistDict } from './ios/infoPlist';
import type { MapboxNavigationPluginProps } from './types';

export const withMapboxIos: ConfigPlugin<MapboxNavigationPluginProps> = (config, props) => {
  return withInfoPlist(config, (innerConfig) => {
    innerConfig.modResults = applyMapboxInfoPlist(
      innerConfig.modResults as InfoPlistDict,
      props
    ) as typeof innerConfig.modResults;
    return innerConfig;
  });
};
