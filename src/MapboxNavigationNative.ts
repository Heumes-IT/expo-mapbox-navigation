import { NativeModule, requireNativeModule } from 'expo';

import type {
  MapboxNavigationModuleEvents,
  SessionState,
} from './types';

declare class ExpoMapboxNavigationNative extends NativeModule<MapboxNavigationModuleEvents & Record<string, (...args: any[]) => void>> {
  setAccessToken(token: string): void;
  requestRoutesNative(optionsJson: string): Promise<string>;
  startActiveGuidanceNative(optionsJson: string): Promise<void>;
  stopNavigation(): Promise<void>;
  getSessionState(): Promise<SessionState>;
  configureTtsNative(optionsJson: string): Promise<void>;
  requestLocationPermission(optionsJson: string): Promise<string>;
  getLocationPermissionStatus(): string;
  startFreeDrive(): Promise<void>;
  pauseFreeDrive(): Promise<void>;
  navigateNextLeg(): Promise<void>;
  setKeepScreenOn(enabled: boolean): void;
  refreshRouteNow(): Promise<void>;
  pauseRouteRefresh(): Promise<void>;
  resumeRouteRefresh(): Promise<void>;
  setSimulated(optionsJson: string): Promise<void>;
  startHistoryRecording(): Promise<void>;
  stopHistoryRecording(): Promise<string>;
  setCamera(optionsJson: string): Promise<void>;
  addGeoJsonSource(optionsJson: string): Promise<void>;
  removeSource(id: string): Promise<void>;
  addLineLayer(optionsJson: string): Promise<void>;
  addCircleLayer(optionsJson: string): Promise<void>;
  removeLayer(id: string): Promise<void>;
  addImage(optionsJson: string): Promise<void>;
  removeImage(id: string): Promise<void>;
  getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null>;
}

const native = requireNativeModule<ExpoMapboxNavigationNative>('ExpoMapboxNavigation');

export { native, native as ExpoMapboxNavigationNative };
