import {
  withAndroidManifest,
  withStringsXml,
  withProjectBuildGradle,
  withGradleProperties,
  type ConfigPlugin,
} from '@expo/config-plugins';
import { applyMapboxManifest, type ManifestDoc } from './android/manifest';
import { applyMapboxStringsXml, type StringsResources } from './android/stringsXml';
import { applyMapboxProjectBuildGradle } from './android/buildGradle';
import {
  applyMapboxGradleProperties,
  type GradleProperty,
} from './android/gradleProperties';
import type { MapboxNavigationPluginProps } from './types';

function shouldFailOnMissingDownloadsToken(): boolean {
  return process.env.EAS_BUILD === '1' || process.env.CI === 'true';
}

export const withMapboxAndroid: ConfigPlugin<MapboxNavigationPluginProps> = (config, props) => {
  const downloadsToken = process.env.MAPBOX_DOWNLOADS_TOKEN;

  if (!downloadsToken && shouldFailOnMissingDownloadsToken()) {
    throw new Error(
      '[expo-mapbox-navigation] MAPBOX_DOWNLOADS_TOKEN environment variable is required to build the Android app. ' +
        'Set it with a secret download-scope token from your Mapbox account.'
    );
  }

  if (!downloadsToken) {
    // eslint-disable-next-line no-console
    console.warn(
      '[expo-mapbox-navigation] MAPBOX_DOWNLOADS_TOKEN is not set. ' +
        'Android builds will fail until you set this environment variable before running a Gradle build.'
    );
  }

  let next = withAndroidManifest(config, (inner) => {
    inner.modResults = applyMapboxManifest(
      inner.modResults as unknown as ManifestDoc,
      props
    ) as unknown as typeof inner.modResults;
    return inner;
  });

  next = withStringsXml(next, (inner) => {
    inner.modResults = applyMapboxStringsXml(
      inner.modResults as unknown as StringsResources,
      props
    ) as unknown as typeof inner.modResults;
    return inner;
  });

  next = withProjectBuildGradle(next, (inner) => {
    inner.modResults.contents = applyMapboxProjectBuildGradle(
      inner.modResults.contents
    );
    return inner;
  });

  next = withGradleProperties(next, (inner) => {
    inner.modResults = applyMapboxGradleProperties(
      inner.modResults as unknown as GradleProperty[],
      { downloadsToken }
    ) as unknown as typeof inner.modResults;
    return inner;
  });

  return next;
};
