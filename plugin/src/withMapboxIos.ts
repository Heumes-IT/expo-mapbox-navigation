import { withInfoPlist, type ConfigPlugin } from '@expo/config-plugins';
import { applyMapboxInfoPlist, type InfoPlistDict } from './ios/infoPlist';
import type { MapboxNavigationPluginProps } from './types';

// The `as unknown as` double casts below are intentional. The pure mutator
// functions in ./ios/*.ts and ./android/*.ts declare minimal local types
// (InfoPlistDict, ManifestDoc, StringsResources, GradleProperty) so they can be
// unit-tested without pulling in @expo/config-plugins' internal mod types. The
// casts bridge between Expo's rich mod result types and our simplified shapes.

export const withMapboxIos: ConfigPlugin<MapboxNavigationPluginProps> = (config, props) => {
  return withInfoPlist(config, (innerConfig) => {
    innerConfig.modResults = applyMapboxInfoPlist(
      innerConfig.modResults as unknown as InfoPlistDict,
      props
    ) as unknown as typeof innerConfig.modResults;
    return innerConfig;
  });
};
