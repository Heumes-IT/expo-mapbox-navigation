import { withInfoPlist, withDangerousMod, type ConfigPlugin } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';
import { applyMapboxInfoPlist, type InfoPlistDict } from './ios/infoPlist';
import { applyMapboxPodfile } from './ios/podfile';
import type { MapboxNavigationPluginProps } from './types';

// The `as unknown as` double casts below are intentional. The pure mutator
// functions in ./ios/*.ts and ./android/*.ts declare minimal local types
// (InfoPlistDict, ManifestDoc, StringsResources, GradleProperty) so they can be
// unit-tested without pulling in @expo/config-plugins' internal mod types. The
// casts bridge between Expo's mod result types and the simplified local shapes.

export const withMapboxIos: ConfigPlugin<MapboxNavigationPluginProps> = (config, props) => {
  let next = withInfoPlist(config, (innerConfig) => {
    innerConfig.modResults = applyMapboxInfoPlist(
      innerConfig.modResults as unknown as InfoPlistDict,
      props
    ) as unknown as typeof innerConfig.modResults;
    return innerConfig;
  });

  // Inject a post_install hook into the app's Podfile via a
  // dangerous-mod (filesystem) write. This is the only way to mutate the
  // Podfile from a config plugin — `@expo/config-plugins` does not expose a
  // typed `withPodfile` mod for the consuming app's Podfile (only for our
  // own pod's podspec, which is different).
  next = withDangerousMod(next, [
    'ios',
    async (innerConfig) => {
      const podfilePath = path.join(
        innerConfig.modRequest.platformProjectRoot,
        'Podfile'
      );
      if (!fs.existsSync(podfilePath)) {
        return innerConfig;
      }
      const original = fs.readFileSync(podfilePath, 'utf8');
      const patched = applyMapboxPodfile(original);
      if (patched !== original) {
        fs.writeFileSync(podfilePath, patched);
      }
      return innerConfig;
    },
  ]);

  return next;
};
