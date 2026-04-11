import { applyMapboxStringsXml, type StringsResources } from '../stringsXml';

describe('applyMapboxStringsXml', () => {
  it('adds mapbox_access_token when provided', () => {
    const input: StringsResources = { resources: { string: [] } };
    const result = applyMapboxStringsXml(input, {
      accessToken: 'pk.eyJtest',
      locationWhenInUseDescription: 'x',
    });
    expect(result.resources.string).toContainEqual({
      $: { name: 'mapbox_access_token', translatable: 'false' },
      _: 'pk.eyJtest',
    });
  });

  it('replaces existing mapbox_access_token value', () => {
    const input: StringsResources = {
      resources: {
        string: [{ $: { name: 'mapbox_access_token', translatable: 'false' }, _: 'old' }],
      },
    };
    const result = applyMapboxStringsXml(input, {
      accessToken: 'pk.new',
      locationWhenInUseDescription: 'x',
    });
    const token = result.resources.string?.find(
      (s) => s.$?.name === 'mapbox_access_token'
    );
    expect(token?._).toBe('pk.new');
    expect(result.resources.string?.filter((s) => s.$?.name === 'mapbox_access_token')).toHaveLength(1);
  });

  it('does nothing when accessToken is omitted', () => {
    const input: StringsResources = { resources: { string: [] } };
    const result = applyMapboxStringsXml(input, {
      locationWhenInUseDescription: 'x',
    });
    expect(result.resources.string).toEqual([]);
  });
});
