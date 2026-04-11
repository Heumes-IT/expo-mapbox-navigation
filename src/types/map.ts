import type { ViewProps } from 'react-native';

/** Props for the `<MapboxNavigationMapView>` native component. */
export interface MapboxNavigationMapViewProps extends ViewProps {
  /** Mapbox style URL. Default: 'mapbox://styles/mapbox/navigation-day-v1'. */
  styleURL?: string;
  /**
   * Camera tracking mode:
   *   - 'following': camera follows the user puck with bearing-locked tilt.
   *   - 'overview': camera fits the remaining route geometry in view.
   *   - 'idle': camera is user-controlled (gestures only).
   * Default: 'following'.
   */
  navigationCameraState?: 'following' | 'overview' | 'idle';
  /** Hex color string for the primary route line (e.g. '#6728a1'). Default: Mapbox blue. */
  routeLineColor?: string;
}

/** Camera animation options for {@link MapboxNavigation.setCamera}. */
export interface CameraOptions {
  /** [longitude, latitude] */
  center?: [number, number];
  zoom?: number;
  bearing?: number;
  pitch?: number;
  /** Animation duration in milliseconds. 0 = instant. */
  animationDuration?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
}

/** Options for adding a GeoJSON source to the map. */
export interface GeoJsonSourceOptions {
  /** GeoJSON Feature, FeatureCollection, or Geometry object. */
  data: Record<string, unknown>;
}

/** Paint properties for a line layer. */
export interface LinePaint {
  lineColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
  lineDasharray?: number[];
}

/** Paint properties for a circle layer. */
export interface CirclePaint {
  circleColor?: string;
  circleRadius?: number;
  circleOpacity?: number;
  circleStrokeColor?: string;
  circleStrokeWidth?: number;
}

/** Base options shared by all map layer types. */
export interface LayerOptions {
  /** ID of the GeoJSON source this layer reads from. */
  sourceId: string;
  /** Optional: insert this layer below the layer with this ID. */
  belowLayerId?: string;
  /** Optional: minimum zoom level for this layer. */
  minZoom?: number;
  /** Optional: maximum zoom level for this layer. */
  maxZoom?: number;
}

/** Options for adding a line layer to the map. */
export interface LineLayerOptions extends LayerOptions {
  paint?: LinePaint;
}

/** Options for adding a circle layer to the map. */
export interface CircleLayerOptions extends LayerOptions {
  paint?: CirclePaint;
}
