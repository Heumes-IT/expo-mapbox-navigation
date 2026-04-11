import { applyMapboxManifest, type ManifestDoc } from '../manifest';

const emptyManifest = (): ManifestDoc => ({
  manifest: {
    'uses-permission': [],
    application: [{ service: [] }],
  },
});

describe('applyMapboxManifest — base permissions', () => {
  it('adds ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, INTERNET', () => {
    const result = applyMapboxManifest(emptyManifest(), {
      locationWhenInUseDescription: 'x',
    });
    const perms = result.manifest['uses-permission'] ?? [];
    const names = perms.map((p) => p.$?.['android:name']);
    expect(names).toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(names).toContain('android.permission.ACCESS_COARSE_LOCATION');
    expect(names).toContain('android.permission.INTERNET');
  });

  it('does not add background permissions when enableBackgroundLocation is false', () => {
    const result = applyMapboxManifest(emptyManifest(), {
      locationWhenInUseDescription: 'x',
      enableBackgroundLocation: false,
    });
    const perms = result.manifest['uses-permission'] ?? [];
    const names = perms.map((p) => p.$?.['android:name']);
    expect(names).not.toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(names).not.toContain('android.permission.FOREGROUND_SERVICE');
  });

  it('does not duplicate permissions already present', () => {
    const doc = emptyManifest();
    doc.manifest['uses-permission'] = [
      { $: { 'android:name': 'android.permission.INTERNET' } },
    ];
    const result = applyMapboxManifest(doc, { locationWhenInUseDescription: 'x' });
    const count = result.manifest['uses-permission']?.filter(
      (p) => p.$?.['android:name'] === 'android.permission.INTERNET'
    ).length;
    expect(count).toBe(1);
  });
});

describe('applyMapboxManifest — background', () => {
  it('adds ACCESS_BACKGROUND_LOCATION and foreground-service permissions', () => {
    const result = applyMapboxManifest(emptyManifest(), {
      locationWhenInUseDescription: 'x',
      enableBackgroundLocation: true,
    });
    const names = result.manifest['uses-permission']?.map((p) => p.$?.['android:name']);
    expect(names).toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(names).toContain('android.permission.FOREGROUND_SERVICE');
    expect(names).toContain('android.permission.FOREGROUND_SERVICE_LOCATION');
    expect(names).toContain('android.permission.POST_NOTIFICATIONS');
  });

  it('adds Mapbox foreground service declaration when enableBackgroundLocation', () => {
    const result = applyMapboxManifest(emptyManifest(), {
      locationWhenInUseDescription: 'x',
      enableBackgroundLocation: true,
    });
    const services = result.manifest.application?.[0]?.service ?? [];
    const names = services.map((s) => s.$?.['android:name']);
    expect(names).toContain('com.mapbox.navigation.core.trip.service.NavigationNotificationService');
  });

  it('sets foregroundServiceType="location" on the Mapbox service', () => {
    const result = applyMapboxManifest(emptyManifest(), {
      locationWhenInUseDescription: 'x',
      enableBackgroundLocation: true,
    });
    const services = result.manifest.application?.[0]?.service ?? [];
    const mapboxService = services.find(
      (s) => s.$?.['android:name'] === 'com.mapbox.navigation.core.trip.service.NavigationNotificationService'
    );
    expect(mapboxService?.$?.['android:foregroundServiceType']).toBe('location');
    expect(mapboxService?.$?.['android:exported']).toBe('false');
  });

  it('does not add the Mapbox service when enableBackgroundLocation is false', () => {
    const result = applyMapboxManifest(emptyManifest(), {
      locationWhenInUseDescription: 'x',
      enableBackgroundLocation: false,
    });
    const services = result.manifest.application?.[0]?.service ?? [];
    expect(services).toHaveLength(0);
  });
});
