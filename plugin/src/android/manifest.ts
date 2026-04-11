import type { MapboxNavigationPluginProps } from '../types';

export interface ManifestPermission {
  $?: { 'android:name'?: string };
}

export interface ManifestService {
  $?: Record<string, string>;
  'intent-filter'?: unknown[];
}

export interface ManifestDoc {
  manifest: {
    'uses-permission'?: ManifestPermission[];
    application?: Array<{
      $?: Record<string, string>;
      service?: ManifestService[];
    }>;
  };
}

const BASE_PERMISSIONS = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.INTERNET',
] as const;

const BACKGROUND_PERMISSIONS = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
] as const;

export function applyMapboxManifest(
  doc: ManifestDoc,
  props: MapboxNavigationPluginProps
): ManifestDoc {
  const next: ManifestDoc = {
    manifest: {
      ...doc.manifest,
      'uses-permission': [...(doc.manifest['uses-permission'] ?? [])],
      application: doc.manifest.application
        ? doc.manifest.application.map((a) => ({ ...a, service: [...(a.service ?? [])] }))
        : [{ service: [] }],
    },
  };

  const addPermission = (name: string) => {
    const exists = next.manifest['uses-permission']!.some(
      (p) => p.$?.['android:name'] === name
    );
    if (!exists) {
      next.manifest['uses-permission']!.push({ $: { 'android:name': name } });
    }
  };

  for (const perm of BASE_PERMISSIONS) addPermission(perm);

  if (props.enableBackgroundLocation) {
    for (const perm of BACKGROUND_PERMISSIONS) addPermission(perm);
  }

  if (props.enableBackgroundLocation) {
    const application = next.manifest.application?.[0];
    if (application) {
      const services = application.service ?? [];
      const exists = services.some(
        (s) =>
          s.$?.['android:name'] ===
          'com.mapbox.navigation.core.trip.service.NavigationNotificationService'
      );
      if (!exists) {
        services.push({
          $: {
            'android:name':
              'com.mapbox.navigation.core.trip.service.NavigationNotificationService',
            'android:foregroundServiceType': 'location',
            'android:exported': 'false',
          },
        });
      }
      application.service = services;
    }
  }

  return next;
}
