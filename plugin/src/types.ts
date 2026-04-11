// plugin/src/types.ts

export interface MapboxNavigationPluginProps {
  /**
   * Public runtime access token. Safe to embed in the app binary.
   * If omitted, the consumer must call MapboxNavigation.setAccessToken() at runtime.
   */
  accessToken?: string;

  /**
   * Value for iOS NSLocationWhenInUseUsageDescription and Android rationale.
   * REQUIRED — navigation is not useful without location.
   */
  locationWhenInUseDescription: string;

  /**
   * Value for iOS NSLocationAlwaysAndWhenInUseUsageDescription.
   * Required when enableBackgroundLocation is true on iOS.
   */
  locationAlwaysDescription?: string;

  /**
   * Opt in to background navigation. Adds iOS background modes and
   * Android ACCESS_BACKGROUND_LOCATION + foreground service permissions.
   */
  enableBackgroundLocation?: boolean;

  /**
   * Override the iOS Mapbox Navigation SDK version pulled in via CocoaPods.
   * Defaults to the version this plugin was tested against.
   */
  iosNavigationSdkVersion?: string;

  /**
   * Override the Android Mapbox Navigation SDK version pulled in via Gradle.
   * Defaults to the version this plugin was tested against.
   */
  androidNavigationSdkVersion?: string;
}

export const DEFAULT_IOS_NAV_SDK_VERSION = '3.10.1';
export const DEFAULT_ANDROID_NAV_SDK_VERSION = '3.18.0';
