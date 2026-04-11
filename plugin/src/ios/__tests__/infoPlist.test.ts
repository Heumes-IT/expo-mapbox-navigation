import { applyMapboxInfoPlist } from '../infoPlist';

describe('applyMapboxInfoPlist', () => {
  it('writes access token when provided', () => {
    const result = applyMapboxInfoPlist(
      {},
      {
        accessToken: 'pk.eyJtest',
        locationWhenInUseDescription: 'We need location to navigate.',
        enableBackgroundLocation: false,
      }
    );
    expect(result.MBXAccessToken).toBe('pk.eyJtest');
  });

  it('writes NSLocationWhenInUseUsageDescription', () => {
    const result = applyMapboxInfoPlist(
      {},
      {
        locationWhenInUseDescription: 'We need location to navigate.',
        enableBackgroundLocation: false,
      }
    );
    expect(result.NSLocationWhenInUseUsageDescription).toBe(
      'We need location to navigate.'
    );
  });

  it('adds NSLocationAlwaysAndWhenInUseUsageDescription when enableBackgroundLocation', () => {
    const result = applyMapboxInfoPlist(
      {},
      {
        locationWhenInUseDescription: 'Foreground.',
        locationAlwaysDescription: 'Background too.',
        enableBackgroundLocation: true,
      }
    );
    expect(result.NSLocationAlwaysAndWhenInUseUsageDescription).toBe('Background too.');
  });

  it('adds UIBackgroundModes location + audio when enableBackgroundLocation', () => {
    const result = applyMapboxInfoPlist(
      {},
      {
        locationWhenInUseDescription: 'Foreground.',
        locationAlwaysDescription: 'Background too.',
        enableBackgroundLocation: true,
      }
    );
    expect(result.UIBackgroundModes).toEqual(['location', 'audio']);
  });

  it('preserves existing UIBackgroundModes entries without duplicates', () => {
    const result = applyMapboxInfoPlist(
      { UIBackgroundModes: ['fetch', 'location'] },
      {
        locationWhenInUseDescription: 'Foreground.',
        locationAlwaysDescription: 'Background too.',
        enableBackgroundLocation: true,
      }
    );
    expect(result.UIBackgroundModes).toEqual(['fetch', 'location', 'audio']);
  });

  it('throws when enableBackgroundLocation is true but locationAlwaysDescription is missing', () => {
    expect(() =>
      applyMapboxInfoPlist(
        {},
        {
          locationWhenInUseDescription: 'Foreground.',
          enableBackgroundLocation: true,
        }
      )
    ).toThrow(/locationAlwaysDescription/);
  });
});
