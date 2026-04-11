import { withMapboxNavigation } from '../withMapboxNavigation';
import { minimalExpoConfig } from './fixtures/minimalConfig';

describe('withMapboxNavigation (end-to-end)', () => {
  it('returns a config with mods applied', () => {
    const config = withMapboxNavigation(minimalExpoConfig(), {
      accessToken: 'pk.eyJtest',
      locationWhenInUseDescription: 'We use your location to navigate.',
      locationAlwaysDescription: 'Continues guidance in the background.',
      enableBackgroundLocation: true,
    });
    expect(config.mods).toBeDefined();
    expect(config.mods?.ios?.infoPlist).toBeDefined();
    expect(config.mods?.android?.manifest).toBeDefined();
    expect(config.mods?.android?.strings).toBeDefined();
    expect(config.mods?.android?.projectBuildGradle).toBeDefined();
    expect(config.mods?.android?.gradleProperties).toBeDefined();
  });

  it('throws when locationWhenInUseDescription is missing', () => {
    expect(() =>
      withMapboxNavigation(minimalExpoConfig(), {
        locationWhenInUseDescription: '' as unknown as string,
      })
    ).toThrow(/locationWhenInUseDescription/);
  });

  it('throws when enableBackgroundLocation is true without locationAlwaysDescription', () => {
    expect(() =>
      withMapboxNavigation(minimalExpoConfig(), {
        locationWhenInUseDescription: 'x',
        enableBackgroundLocation: true,
      })
    ).toThrow(/locationAlwaysDescription/);
  });

  it('does not throw when enableBackgroundLocation is false', () => {
    expect(() =>
      withMapboxNavigation(minimalExpoConfig(), {
        locationWhenInUseDescription: 'x',
        enableBackgroundLocation: false,
      })
    ).not.toThrow();
  });
});
