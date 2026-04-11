// Reexport the native module. On web, it will be resolved to ExpoMapboxNavigationModule.web.ts
// and on native platforms to ExpoMapboxNavigationModule.ts
export { default } from './ExpoMapboxNavigationModule';
export { default as ExpoMapboxNavigationView } from './ExpoMapboxNavigationView';
export * from  './ExpoMapboxNavigation.types';
