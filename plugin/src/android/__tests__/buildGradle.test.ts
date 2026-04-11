import { applyMapboxProjectBuildGradle } from '../buildGradle';

const baseGradle = `
buildscript {
  repositories {
    google()
    mavenCentral()
  }
}

allprojects {
  repositories {
    google()
    mavenCentral()
  }
}
`;

describe('applyMapboxProjectBuildGradle', () => {
  it('adds Mapbox authenticated Maven repo to allprojects.repositories', () => {
    const result = applyMapboxProjectBuildGradle(baseGradle);
    expect(result).toContain("url 'https://api.mapbox.com/downloads/v2/releases/maven'");
    expect(result).toContain("username = 'mapbox'");
    expect(result).toContain("MAPBOX_DOWNLOADS_TOKEN");
  });

  it('is idempotent — second application does not add a duplicate block', () => {
    const once = applyMapboxProjectBuildGradle(baseGradle);
    const twice = applyMapboxProjectBuildGradle(once);
    const occurrences = twice.match(/api\.mapbox\.com\/downloads/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it('throws when allprojects block is missing', () => {
    expect(() =>
      applyMapboxProjectBuildGradle('buildscript { repositories { google() } }')
    ).toThrow(/allprojects/);
  });
});
