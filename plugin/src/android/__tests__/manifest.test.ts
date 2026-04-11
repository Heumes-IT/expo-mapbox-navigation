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
