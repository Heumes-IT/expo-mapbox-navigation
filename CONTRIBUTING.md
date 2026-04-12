# Contributing

Thanks for your interest in contributing to `@heumes-it/expo-mapbox-navigation`!

## Getting started

1. Fork the repository and clone your fork
2. Install dependencies: `npm ci`
3. Build the module: `npm run build`
4. Run tests: `npm test`

## Development setup

### Mapbox tokens

You need a [Mapbox account](https://account.mapbox.com/) with:

- **Public token** (`pk.*`) — for the example app at runtime
- **Secret download token** (`sk.*`, scope `DOWNLOADS:READ`) — for building the native SDKs

iOS — add to `~/.netrc`:
```
machine api.mapbox.com
  login mapbox
  password sk.YOUR_SECRET_TOKEN
```

Android — add to `~/.gradle/gradle.properties`:
```
MAPBOX_DOWNLOADS_TOKEN=sk.YOUR_SECRET_TOKEN
```

### Running the example app

```bash
npm run build
cd example
npm ci
npx expo prebuild --clean
npx expo run:ios    # or run:android
```

**Important:** always run `npm run build` from the repo root after editing files in `src/` or `plugin/src/` before running the example.

### Project structure

```
src/                          TypeScript module + types
  MapboxNavigation.ts         Public API facade
  MapboxNavigationNative.ts   Native module binding
  MapboxNavigationMapView.tsx View component
  types/                      Type definitions (split by concern)
  __tests__/                  Jest tests
plugin/src/                   Expo config plugin
ios/                          Swift native module + extensions
android/src/.../              Kotlin native module + helpers
example/                      Example app
```

## Making changes

### TypeScript

- Add types to the appropriate file in `src/types/`
- Add facade methods to `src/MapboxNavigation.ts`
- Add tests for new methods in `src/__tests__/MapboxNavigation.test.ts`
- Run `npm run lint` and `npm test` before submitting

### Native (iOS)

- Module definition stays in `ExpoMapboxNavigationModule.swift`
- Implementation goes in the appropriate extension file (`+Routing`, `+Session`, `+TTS`, etc.)
- All properties must be declared in the main module file
- Methods called across files must be `internal` (not `private`)

### Native (Android)

- Module definition stays in `ExpoMapboxNavigationModule.kt`
- Extract logic into service objects (`RoutingService`, `TTSManager`, `ObserverFactory`, etc.)
- Keep the `RoutingException` class in the module file

### Config plugin

- Plugin source is in `plugin/src/`
- Tests are in `plugin/src/__tests__/`
- Run plugin tests: `jest --config plugin/jest.config.js`

## Pull requests

1. Create a branch from `main`
2. Make your changes
3. Ensure `npm run build`, `npm run lint`, and `npm test` all pass
4. Write a clear PR description explaining what changed and why
5. Keep PRs focused — one feature or fix per PR

## Code style

- No unnecessary comments — code should be self-explanatory
- TSDoc on all public exports
- Follow existing patterns in the codebase
- Keep native code comments brief and technical

## Reporting issues

- Use [GitHub Issues](https://github.com/Heumes-IT/expo-mapbox-navigation/issues)
- Include: platform (iOS/Android), Expo SDK version, reproduction steps
- For build errors: include the full error output

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
