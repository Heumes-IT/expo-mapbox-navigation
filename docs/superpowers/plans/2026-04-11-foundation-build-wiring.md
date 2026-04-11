# Foundation & Build Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the `create-expo-module` scaffold's WebView placeholders, drop the `web` platform, add the Mapbox Navigation SDK as a native dependency on both iOS and Android, and replace module code with compile-only skeletons that consumers can import without crashing. No features yet — this plan exists so every subsequent plan has a validated place to put code.

**Architecture:** Each platform's module file becomes a minimal class that holds a single Mapbox session object (`MapboxNavigationProvider` on iOS, `MapboxNavigation` on Android), exposes a `setAccessToken` JS method, and emits no events. The native views are deleted entirely; the module becomes headless until Plan #6/#7 adds the `MapboxNavigationMapView`. The JS layer shrinks to a typed `setAccessToken` + a placeholder event surface. Configuration of the Mapbox SDK download token lives in the developer's local environment (`MAPBOX_DOWNLOADS_TOKEN`); Plan #1's config plugin already wires this for consuming apps, so this plan only needs to make the module itself buildable when the env var is set.

**Tech Stack:** Swift 5.9 / ExpoModulesCore on iOS, Kotlin / ExpoModulesCore on Android, TypeScript for the JS shim, CocoaPods for iOS deps, Gradle for Android deps.

---

## File structure

### Files deleted

- `ios/ExpoMapboxNavigationView.swift` — scaffold WebView placeholder
- `android/src/main/java/expo/modules/mapboxnavigation/ExpoMapboxNavigationView.kt` — scaffold WebView placeholder
- `src/ExpoMapboxNavigationView.tsx` — scaffold RN view
- `src/ExpoMapboxNavigationView.web.tsx` — scaffold web stub
- `src/ExpoMapboxNavigationModule.web.ts` — scaffold web stub

### Files rewritten (existing path, new minimal body)

- `ios/ExpoMapboxNavigation.podspec` — add Mapbox dep, iOS min version
- `ios/ExpoMapboxNavigationModule.swift` — minimal module exposing `setAccessToken`
- `android/build.gradle` — add authenticated Maven repo + Mapbox dep
- `android/src/main/java/expo/modules/mapboxnavigation/ExpoMapboxNavigationModule.kt` — minimal module exposing `setAccessToken`
- `src/ExpoMapboxNavigationModule.ts` — typed `setAccessToken` method
- `src/ExpoMapboxNavigation.types.ts` — minimal events shape + token types
- `src/index.ts` — exports only the module singleton + types

### Files modified

- `expo-module.config.json` — drop `web` from platforms

### Responsibility per file after this plan

- **`ios/ExpoMapboxNavigationModule.swift`** — wraps a lazily-constructed `MapboxNavigationProvider`, stores the current access token, exposes `setAccessToken`. Nothing else.
- **`android/.../ExpoMapboxNavigationModule.kt`** — same shape: holds a lazily-constructed `MapboxNavigation`, stores the token, exposes `setAccessToken`.
- **`src/ExpoMapboxNavigationModule.ts`** — typed native module with `setAccessToken(token: string): void`.
- **`src/index.ts`** — single default export (the module) plus re-exported types.
- **`src/ExpoMapboxNavigation.types.ts`** — empty `MapboxNavigationModuleEvents` record for now; later plans add entries.
- **`ios/ExpoMapboxNavigation.podspec`** — declares `MapboxNavigation` dependency pinned to v3.10.x.
- **`android/build.gradle`** — declares the `mapbox-navigation-android` dep and the authenticated Mapbox Maven repo pulling credentials from `MAPBOX_DOWNLOADS_TOKEN`.

### Anchors

- **YAGNI:** No event wiring, no session methods beyond `setAccessToken`, no view, no route types. Adding more would duplicate Plans #3–7.
- **DRY:** The iOS and Android sides intentionally mirror each other's tiny surface — duplication is fine at this scale and makes later plans symmetric.
- **Compile-only verification on the JS and type layer**. Native build verification is manual, documented in Task 9.

---

## Task 1: Drop web platform and delete scaffold web files

**Files:**
- Modify: `expo-module.config.json`
- Delete: `src/ExpoMapboxNavigationModule.web.ts`
- Delete: `src/ExpoMapboxNavigationView.web.tsx`

- [ ] **Step 1: Read and update `expo-module.config.json`**

Read the existing file. Replace its contents with EXACTLY:

```json
{
  "platforms": ["apple", "android"],
  "apple": {
    "modules": ["ExpoMapboxNavigationModule"]
  },
  "android": {
    "modules": ["expo.modules.mapboxnavigation.ExpoMapboxNavigationModule"]
  }
}
```

The only change is removing `"web"` from the `platforms` array.

- [ ] **Step 2: Delete the two web scaffold files**

```bash
rm src/ExpoMapboxNavigationModule.web.ts
rm src/ExpoMapboxNavigationView.web.tsx
```

- [ ] **Step 3: Verify**

```bash
ls src/
```

Expected: `ExpoMapboxNavigation.types.ts`, `ExpoMapboxNavigationModule.ts`, `ExpoMapboxNavigationView.tsx`, `index.ts` — the two `.web.*` files should be gone.

- [ ] **Step 4: Commit**

```bash
git add expo-module.config.json src/ExpoMapboxNavigationModule.web.ts src/ExpoMapboxNavigationView.web.tsx
git commit -m "chore: drop web platform from expo-mapbox-navigation"
```

Note: `git add` of deleted files is the correct way to stage the removals alongside the config change.

---

## Task 2: Delete scaffold native view placeholders

**Files:**
- Delete: `ios/ExpoMapboxNavigationView.swift`
- Delete: `android/src/main/java/expo/modules/mapboxnavigation/ExpoMapboxNavigationView.kt`
- Delete: `src/ExpoMapboxNavigationView.tsx`

- [ ] **Step 1: Delete the three view files**

```bash
rm ios/ExpoMapboxNavigationView.swift
rm android/src/main/java/expo/modules/mapboxnavigation/ExpoMapboxNavigationView.kt
rm src/ExpoMapboxNavigationView.tsx
```

- [ ] **Step 2: Verify**

```bash
ls ios/ android/src/main/java/expo/modules/mapboxnavigation/ src/
```

Expected ios/: `ExpoMapboxNavigation.podspec`, `ExpoMapboxNavigationModule.swift`
Expected android kotlin dir: `ExpoMapboxNavigationModule.kt`
Expected src/: `ExpoMapboxNavigation.types.ts`, `ExpoMapboxNavigationModule.ts`, `index.ts`

- [ ] **Step 3: Commit**

```bash
git add ios/ExpoMapboxNavigationView.swift android/src/main/java/expo/modules/mapboxnavigation/ExpoMapboxNavigationView.kt src/ExpoMapboxNavigationView.tsx
git commit -m "chore: delete scaffold WebView placeholder views"
```

---

## Task 3: Reset JS type surface

**Files:**
- Modify: `src/ExpoMapboxNavigation.types.ts`

- [ ] **Step 1: Write the minimal type surface**

Replace the contents of `src/ExpoMapboxNavigation.types.ts` with EXACTLY:

```ts
/**
 * Event payload map for the Mapbox Navigation native module.
 *
 * This starts empty; later plans add entries for onRouteProgress,
 * onLocationUpdate, onBannerInstruction, etc. Keeping the record type
 * lets consumers add `addListener` calls without the module changing
 * its outer shape each time.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MapboxNavigationModuleEvents extends Record<string, never> {}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit code 0 with no errors. Note that the existing `src/ExpoMapboxNavigationModule.ts` may reference types we will update in Task 4 — if that produces errors, defer them until after Task 4 and come back to verify this step.

If `tsc` fails with errors ONLY in `src/ExpoMapboxNavigationModule.ts` about `ChangeEventPayload` being missing, that is expected and will be fixed in Task 4. Commit anyway and move on.

- [ ] **Step 3: Commit**

```bash
git add src/ExpoMapboxNavigation.types.ts
git commit -m "refactor: reset module event types to empty record"
```

---

## Task 4: Reset JS module surface

**Files:**
- Modify: `src/ExpoMapboxNavigationModule.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Rewrite `src/ExpoMapboxNavigationModule.ts`**

Replace its contents with EXACTLY:

```ts
import { NativeModule, requireNativeModule } from 'expo';

import type { MapboxNavigationModuleEvents } from './ExpoMapboxNavigation.types';

declare class ExpoMapboxNavigationModule extends NativeModule<MapboxNavigationModuleEvents> {
  /**
   * Set the Mapbox public access token at runtime. Safe to call multiple
   * times; the latest value wins. Consumers can also supply the token
   * at build time via the `expo-mapbox-navigation` config plugin, in
   * which case this call is optional.
   */
  setAccessToken(token: string): void;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoMapboxNavigationModule>('ExpoMapboxNavigation');
```

- [ ] **Step 2: Rewrite `src/index.ts`**

Replace its contents with EXACTLY:

```ts
export { default } from './ExpoMapboxNavigationModule';
export * from './ExpoMapboxNavigation.types';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 4: Verify plugin tests still pass**

```bash
npx jest --config plugin/jest.config.js
```

Expected: PASS, 27 tests. These should be unaffected — the plugin lives in `plugin/` and does not import from `src/`.

- [ ] **Step 5: Commit**

```bash
git add src/ExpoMapboxNavigationModule.ts src/index.ts
git commit -m "refactor: reset JS module to setAccessToken skeleton"
```

---

## Task 5: Reset iOS Swift module

**Files:**
- Modify: `ios/ExpoMapboxNavigationModule.swift`

- [ ] **Step 1: Rewrite the module**

Replace the contents of `ios/ExpoMapboxNavigationModule.swift` with EXACTLY:

```swift
import ExpoModulesCore
import MapboxNavigationCore

/**
 * Expo Modules wrapper around Mapbox Navigation SDK v3 for iOS.
 *
 * This skeleton stores a public access token and constructs a
 * `MapboxNavigationProvider` on first access. The provider is not
 * used for routing yet — Plan #4 wires up the real routing, session,
 * and event pipeline on top of this.
 *
 * The iOS Mapbox SDK reads `MBXAccessToken` from Info.plist at init
 * time; the runtime token propagation API differs enough between iOS
 * and Android that we defer the actual token-to-provider plumbing to
 * Plan #4 when we need it for real requests. For now, storing the
 * token locally + constructing the provider once is enough to prove
 * the SDK linked correctly.
 */
public class ExpoMapboxNavigationModule: Module {
  private var accessToken: String?
  private lazy var provider: MapboxNavigationProvider = MapboxNavigationProvider(
    coreConfig: CoreConfig()
  )

  public func definition() -> ModuleDefinition {
    Name("ExpoMapboxNavigation")

    Function("setAccessToken") { (token: String) in
      self.accessToken = token
      // Touch `provider` so the lazy init runs; this is how we verify
      // at runtime that MapboxNavigationCore linked successfully.
      _ = self.provider
    }
  }
}
```

- [ ] **Step 2: Note — do not build yet**

This file will not compile until Task 7 adds the `MapboxNavigation` CocoaPods dependency to the podspec. Do NOT run `pod install` or Xcode in this task. Just commit the Swift change.

- [ ] **Step 3: Commit**

```bash
git add ios/ExpoMapboxNavigationModule.swift
git commit -m "feat(ios): reset module to MapboxNavigationProvider skeleton"
```

---

## Task 6: Reset Android Kotlin module

**Files:**
- Modify: `android/src/main/java/expo/modules/mapboxnavigation/ExpoMapboxNavigationModule.kt`

- [ ] **Step 1: Rewrite the module**

Replace the contents of `android/src/main/java/expo/modules/mapboxnavigation/ExpoMapboxNavigationModule.kt` with EXACTLY:

```kotlin
package expo.modules.mapboxnavigation

import com.mapbox.common.MapboxOptions
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.MapboxNavigationProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Modules wrapper around Mapbox Navigation SDK v3 for Android.
 *
 * Skeleton: exposes a single `setAccessToken` function and lazily
 * constructs a `MapboxNavigation` instance to prove the SDK linked
 * correctly. Routing, events, voice, and the map view are added in
 * later plans.
 */
class ExpoMapboxNavigationModule : Module() {
  private var navigation: MapboxNavigation? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoMapboxNavigation")

    Function("setAccessToken") { token: String ->
      MapboxOptions.accessToken = token
      val context = appContext.reactContext
        ?: throw IllegalStateException(
          "ExpoMapboxNavigation: reactContext is null; setAccessToken must be called after the module is initialized."
        )
      if (navigation == null) {
        navigation = MapboxNavigationProvider.create(
          NavigationOptions.Builder(context).build()
        )
      }
    }
  }
}
```

- [ ] **Step 2: Note — do not build yet**

This file will not compile until Task 8 adds the Mapbox dependencies and Maven repo to `android/build.gradle`. Do NOT run `./gradlew build` in this task. Just commit the Kotlin change.

- [ ] **Step 3: Commit**

```bash
git add android/src/main/java/expo/modules/mapboxnavigation/ExpoMapboxNavigationModule.kt
git commit -m "feat(android): reset module to MapboxNavigation skeleton"
```

---

## Task 7: iOS podspec — add MapboxNavigation dependency

**Files:**
- Modify: `ios/ExpoMapboxNavigation.podspec`

- [ ] **Step 1: Rewrite the podspec**

Replace the contents of `ios/ExpoMapboxNavigation.podspec` with EXACTLY:

```ruby
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoMapboxNavigation'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Mike-Heumes/expo-mapbox-navigation' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MapboxNavigation', '~> 3.10'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
```

Changes from the scaffold:
- Dropped `:tvos => '15.1'` from `s.platforms` (tvOS is not a target for this module and would require its own Mapbox dep variant).
- Added `s.dependency 'MapboxNavigation', '~> 3.10'`.

- [ ] **Step 2: Verify syntax**

```bash
ruby -rrubygems -e "load 'ios/ExpoMapboxNavigation.podspec'" 2>&1 | tail -5
```

This loads the podspec in Ruby without actually resolving dependencies. Expected: no output (load succeeds silently). If it prints a `NameError` about `Pod::Spec`, that is fine — it means CocoaPods isn't installed in Ruby's load path, which is OK for this parse check. The goal is only to catch Ruby syntax errors.

If you see a real Ruby syntax error (not `NameError`), stop and escalate BLOCKED.

- [ ] **Step 3: Commit**

```bash
git add ios/ExpoMapboxNavigation.podspec
git commit -m "build(ios): add MapboxNavigation pod dependency"
```

---

## Task 8: Android build.gradle — add Mapbox dependency + Maven repo

**Files:**
- Modify: `android/build.gradle`

- [ ] **Step 1: Rewrite `android/build.gradle`**

Replace its contents with EXACTLY:

```groovy
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
  id 'org.jetbrains.kotlin.android'
}

group = 'expo.modules.mapboxnavigation'
version = '0.1.0'

def mapboxDownloadsToken = project.findProperty('MAPBOX_DOWNLOADS_TOKEN') ?: System.getenv('MAPBOX_DOWNLOADS_TOKEN') ?: ''

repositories {
  maven {
    url 'https://api.mapbox.com/downloads/v2/releases/maven'
    authentication {
      basic(BasicAuthentication)
    }
    credentials {
      username = 'mapbox'
      password = mapboxDownloadsToken
    }
  }
}

android {
  namespace 'expo.modules.mapboxnavigation'
  defaultConfig {
    versionCode 1
    versionName '0.1.0'
    minSdkVersion 24
  }
  compileOptions {
    sourceCompatibility JavaVersion.VERSION_17
    targetCompatibility JavaVersion.VERSION_17
  }
  kotlinOptions {
    jvmTarget = '17'
  }
  lintOptions {
    abortOnError false
  }
}

dependencies {
  implementation 'com.mapbox.navigationcore:navigation:3.18.0'
}
```

Changes from the scaffold:
- Added `id 'org.jetbrains.kotlin.android'` to plugins.
- Added an authenticated Maven repo for Mapbox using `MAPBOX_DOWNLOADS_TOKEN` from either a Gradle property or env var.
- Added `minSdkVersion 24` (Mapbox Navigation SDK v3 requires min 24 on Android).
- Added Java 17 compile options + matching `jvmTarget` (required by Mapbox v3 + modern Expo).
- Added the Mapbox Navigation dependency pinned to 3.18.0.

- [ ] **Step 2: Verify Groovy syntax via grep sanity checks**

```bash
grep -c "id 'org.jetbrains.kotlin.android'" android/build.gradle
grep -c "com.mapbox.navigationcore:navigation:3.18.0" android/build.gradle
grep -c "MAPBOX_DOWNLOADS_TOKEN" android/build.gradle
```

Expected: each command prints `1`.

- [ ] **Step 3: Commit**

```bash
git add android/build.gradle
git commit -m "build(android): add Mapbox Navigation dependency + Maven repo"
```

---

## Task 9: Final verification checklist (manual)

This task is the plan's exit gate. No automated subagent work — the steps require a real Mac with Xcode and Android Studio, plus a real Mapbox secret download token.

**Files:**
- None created or modified — purely verification.

- [ ] **Step 1: Run JS + plugin unit tests**

```bash
npm test
```

Expected: 27 plugin tests pass. (The TypeScript `noEmit` check also runs inside `expo-module test`.)

- [ ] **Step 2: Print the resulting file tree for a human to eyeball**

```bash
ls -la ios android/src/main/java/expo/modules/mapboxnavigation src
```

Expected:
- `ios/` contains `ExpoMapboxNavigation.podspec` and `ExpoMapboxNavigationModule.swift` only.
- Android kotlin dir contains `ExpoMapboxNavigationModule.kt` only.
- `src/` contains `ExpoMapboxNavigation.types.ts`, `ExpoMapboxNavigationModule.ts`, `index.ts` only.

- [ ] **Step 3: Manual iOS build verification (human-run on a Mac)**

In a terminal with a real `MAPBOX_DOWNLOADS_TOKEN` set and CocoaPods installed:

```bash
cd example
# If pod-install is not available:
# npx pod-install
cd ios && pod install && cd ..
xcodebuild -workspace ios/*.xcworkspace -scheme 'example' -configuration Debug -sdk iphonesimulator -derivedDataPath build/ -quiet CODE_SIGNING_ALLOWED=NO
cd ..
```

Expected: `pod install` reports `Installing MapboxNavigation (3.10.x)` among the pods, and `xcodebuild` completes successfully. Any linker errors referencing `MapboxNavigationCore` mean the podspec Task 7 is wrong and needs revisiting.

- [ ] **Step 4: Manual Android build verification (human-run)**

In a terminal with a real `MAPBOX_DOWNLOADS_TOKEN` set:

```bash
cd example/android
./gradlew :app:assembleDebug --quiet
cd ../..
```

Expected: Gradle resolves `com.mapbox.navigationcore:navigation:3.18.0` from the Mapbox Maven repo and the build succeeds. A 401 from `api.mapbox.com` means `MAPBOX_DOWNLOADS_TOKEN` is missing or invalid. Any unresolved symbol in `ExpoMapboxNavigationModule.kt` referencing Mapbox classes means Task 8 is wrong and needs revisiting.

- [ ] **Step 5: Record findings**

If either manual build fails, file the failure as a follow-up issue and mark the plan as DONE_WITH_CONCERNS. Do not try to fix native build issues inside the subagent loop — they almost always require interactive Xcode/Android Studio debugging.

- [ ] **Step 6: No commit**

Task 9 produces no code changes. Skip `git commit`.

---

## Out of scope for this plan

- Any actual navigation routing, session methods beyond `setAccessToken`, or event emission → Plans #4, #5.
- `MapboxNavigationMapView` → Plans #6, #7.
- Moving `example/` → `expo-mapbox-navigation-example/` → Plan #9.
- CI that runs the native builds with a real token → separate infra plan when CI is set up.
- Podfile `.netrc` writer for iOS build-time auth. This plan assumes the developer has their `~/.netrc` configured locally; CI config is a later concern.

## Spec coverage self-check

| Spec requirement | Task |
|---|---|
| Drop `web` from platforms | Task 1 |
| Remove scaffold WebView placeholders | Task 2 |
| JS event types reset to empty | Task 3 |
| JS module exposes `setAccessToken` | Task 4 |
| iOS holds `MapboxNavigationProvider` singleton | Task 5 |
| Android holds `MapboxNavigation` singleton | Task 6 |
| iOS podspec pulls in Mapbox Nav SDK | Task 7 |
| Android build.gradle authenticates to Mapbox Maven + adds Nav SDK dep | Task 8 |
| Prove the SDK builds and links on both platforms | Task 9 (manual) |
