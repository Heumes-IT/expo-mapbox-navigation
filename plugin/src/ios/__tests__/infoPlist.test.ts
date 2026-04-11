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
});
