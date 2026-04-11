import { requireNativeView } from 'expo';
import type { MapboxNavigationMapViewProps } from './types';

// requireNativeView looks up by module name. The module is registered as
// 'ExpoMapboxNavigation'; the View(...) block inside it provides the view.
const NativeMapView = requireNativeView<MapboxNavigationMapViewProps>(
  'ExpoMapboxNavigation'
);

/**
 * Renders a native Mapbox map view that automatically displays the active
 * navigation session's route line, user puck, and camera. Mount this
 * component while `startActiveGuidance` is running to see the navigation
 * visualised on a map.
 */
export function MapboxNavigationMapView(props: MapboxNavigationMapViewProps) {
  const {
    styleURL = 'mapbox://styles/mapbox/navigation-day-v1',
    navigationCameraState = 'following',
    ...rest
  } = props;
  return (
    <NativeMapView
      styleURL={styleURL}
      navigationCameraState={navigationCameraState}
      {...rest}
    />
  );
}
