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
