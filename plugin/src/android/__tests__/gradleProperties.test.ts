import { applyMapboxGradleProperties, type GradleProperty } from '../gradleProperties';

describe('applyMapboxGradleProperties', () => {
  const baseProps: GradleProperty[] = [
    { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m' },
  ];

  it('adds MAPBOX_DOWNLOADS_TOKEN when env var is set', () => {
    const result = applyMapboxGradleProperties(baseProps, {
      downloadsToken: 'sk.abc123',
    });
    const entry = result.find(
      (p) => p.type === 'property' && p.key === 'MAPBOX_DOWNLOADS_TOKEN'
    );
    expect(entry).toBeDefined();
    if (entry?.type === 'property') {
      expect(entry.value).toBe('sk.abc123');
    }
  });

  it('replaces existing MAPBOX_DOWNLOADS_TOKEN value', () => {
    const input: GradleProperty[] = [
      ...baseProps,
      { type: 'property', key: 'MAPBOX_DOWNLOADS_TOKEN', value: 'sk.old' },
    ];
    const result = applyMapboxGradleProperties(input, { downloadsToken: 'sk.new' });
    const entries = result.filter(
      (p) => p.type === 'property' && p.key === 'MAPBOX_DOWNLOADS_TOKEN'
    );
    expect(entries).toHaveLength(1);
    if (entries[0]?.type === 'property') {
      expect(entries[0].value).toBe('sk.new');
    }
  });

  it('returns input unchanged when downloadsToken is undefined', () => {
    const result = applyMapboxGradleProperties(baseProps, { downloadsToken: undefined });
    expect(result).toEqual(baseProps);
  });
});
