import { applyMapboxPodfile, PODFILE_HOOK_MARKER } from '../podfile';

const PODFILE_WITH_POST_INSTALL = `target 'MyApp' do
  use_expo_modules!

  post_install do |installer|
    react_native_post_install(
      installer,
      :mac_catalyst_enabled => false,
    )
  end
end`;

const PODFILE_WITHOUT_POST_INSTALL = `target 'MyApp' do
  use_expo_modules!
end`;

describe('applyMapboxPodfile', () => {
  it('injects the post-install block after react_native_post_install', () => {
    const result = applyMapboxPodfile(PODFILE_WITH_POST_INSTALL);
    expect(result).toContain(PODFILE_HOOK_MARKER);
    expect(result).toContain('Embed SPM Mapbox frameworks');
    expect(result).toContain('ExpoModulesProvider.swift');
    // The hook must come AFTER react_native_post_install, not before
    const rnIndex = result.indexOf('react_native_post_install');
    const markerIndex = result.indexOf(PODFILE_HOOK_MARKER);
    expect(markerIndex).toBeGreaterThan(rnIndex);
  });

  it('appends a post_install block when none exists', () => {
    const result = applyMapboxPodfile(PODFILE_WITHOUT_POST_INSTALL);
    expect(result).toContain(PODFILE_HOOK_MARKER);
    expect(result).toContain('post_install do |installer|');
  });

  it('is idempotent — second application is a no-op', () => {
    const once = applyMapboxPodfile(PODFILE_WITH_POST_INSTALL);
    const twice = applyMapboxPodfile(once);
    expect(twice).toBe(once);
    const occurrences = twice.match(new RegExp(PODFILE_HOOK_MARKER, 'g')) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it('throws when no target end marker is found and no react_native_post_install', () => {
    expect(() => applyMapboxPodfile('# nothing here')).toThrow(/Could not find a target end marker/);
  });

  it('handles a multi-line react_native_post_install with nested parens', () => {
    const podfile = `target 'MyApp' do
  use_expo_modules!

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
end`;
    const result = applyMapboxPodfile(podfile);
    expect(result).toContain(PODFILE_HOOK_MARKER);
    // The injected block must come AFTER the closing ) of react_native_post_install,
    // not inside the parameter list. Verify by ensuring the marker appears AFTER
    // ':ccache_enabled' (which is inside the call).
    const ccacheIdx = result.indexOf(':ccache_enabled');
    const markerIdx = result.indexOf(PODFILE_HOOK_MARKER);
    expect(markerIdx).toBeGreaterThan(ccacheIdx);
    // And the close-paren of react_native_post_install must come BEFORE the marker.
    const closeParenIdx = result.indexOf(',\n    )');
    expect(closeParenIdx).toBeGreaterThan(-1);
    expect(markerIdx).toBeGreaterThan(closeParenIdx);
  });
});
