const MAPBOX_REPO_MARKER = '// expo-mapbox-navigation: authenticated Mapbox Maven repo';

const MAPBOX_REPO_BLOCK = `    ${MAPBOX_REPO_MARKER}
    maven {
      url 'https://api.mapbox.com/downloads/v2/releases/maven'
      authentication {
        basic(BasicAuthentication)
      }
      credentials {
        username = 'mapbox'
        password = project.findProperty('MAPBOX_DOWNLOADS_TOKEN') ?: System.getenv('MAPBOX_DOWNLOADS_TOKEN') ?: ''
      }
    }`;

export function applyMapboxProjectBuildGradle(contents: string): string {
  if (contents.includes(MAPBOX_REPO_MARKER)) {
    return contents;
  }

  // Assumes `allprojects { repositories {` appears as a single contiguous run
  // of whitespace (no comments or statements between the braces). This matches
  // Expo's default template; hand-edited gradles with comments between the
  // braces will hit the error below.
  const allProjectsRegex = /allprojects\s*\{\s*repositories\s*\{/;
  if (!allProjectsRegex.test(contents)) {
    throw new Error(
      '[expo-mapbox-navigation] Could not find allprojects.repositories block in project build.gradle.'
    );
  }

  return contents.replace(
    allProjectsRegex,
    (match) => `${match}\n${MAPBOX_REPO_BLOCK}\n`
  );
}
