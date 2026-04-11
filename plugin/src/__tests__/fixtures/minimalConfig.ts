import type { ExpoConfig } from '@expo/config-types';

export function minimalExpoConfig(): ExpoConfig {
  return {
    name: 'fixture-app',
    slug: 'fixture-app',
    version: '1.0.0',
    ios: { bundleIdentifier: 'com.example.fixture' },
    android: { package: 'com.example.fixture' },
  };
}
