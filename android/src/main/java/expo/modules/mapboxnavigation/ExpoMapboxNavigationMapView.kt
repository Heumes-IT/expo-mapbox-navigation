package expo.modules.mapboxnavigation

import android.content.Context
import android.view.ViewGroup
import com.mapbox.maps.MapInitOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.Plugin
import com.mapbox.maps.plugin.PuckBearing
import com.mapbox.maps.plugin.animation.CameraAnimationsPlugin
import com.mapbox.maps.plugin.locationcomponent.createDefault2DPuck
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.navigation.ui.maps.location.NavigationLocationProvider
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.ui.maps.camera.NavigationCamera
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineApi
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineView
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineApiOptions
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineViewOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Native map view wrapping Mapbox Maps SDK [MapView] with navigation camera,
 * route line rendering, and location puck.
 *
 * Uses TextureView (survives detach/reattach), proper lifecycle bridging, and a
 * singleton MapView holder to prevent the black-screen issue on tab navigation.
 */
@com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI
class ExpoMapboxNavigationMapView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext) {

  // Singleton MapView — survives React unmount/remount cycles.
  companion object {
    internal var sharedMapView: MapView? = null
    internal var currentInstance: ExpoMapboxNavigationMapView? = null
    /** Last known enhanced location — updated by the view's location observer. */
    internal var lastLatitude: Double? = null
    internal var lastLongitude: Double? = null
  }

  private var mapView: MapView? = null
  private var navigationCamera: NavigationCamera? = null
  private var viewportDataSource: MapboxNavigationViewportDataSource? = null
  private var routeLineApi: MapboxRouteLineApi? = null
  private var routeLineView: MapboxRouteLineView? = null
  private val navigationLocationProvider = NavigationLocationProvider()
  private var routesRendered = false

  // Props stored so they can be applied after init.
  private var styleURL: String = "mapbox://styles/mapbox/navigation-day-v1"
  private var cameraState: String = "following"
  private var routeLineColor: Int? = null

  // MapView creation / reparenting

  private fun ensureMapView() {
    if (mapView != null) return

    val existing = sharedMapView
    if (existing != null) {
      // Reparent existing MapView.
      (existing.parent as? ViewGroup)?.removeView(existing)
      addView(existing, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
      mapView = existing
      return
    }

    // First mount — TextureView keeps EGL context alive across window detach/reattach.
    val options = MapInitOptions(context, textureView = true)
    val mv = MapView(context, options)
    mv.mapboxMap.loadStyle(styleURL)
    sharedMapView = mv
    mapView = mv
    addView(mv, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

    // Enable location puck with course-bearing, driven by the navigation SDK's
    // matched location (not the device GPS — which would be wrong during simulation).
    mv.location.setLocationProvider(navigationLocationProvider)
    mv.location.updateSettings {
      locationPuck = createDefault2DPuck(withBearing = true)
      enabled = true
      puckBearingEnabled = true
      puckBearing = PuckBearing.COURSE
    }
  }

  // Wire camera + route line to the shared MapboxNavigation instance

  private fun wireNavigation() {
    val nav = ExpoMapboxNavigationModule.sharedNavigation ?: return
    val mv = mapView ?: return
    val mapboxMap = mv.mapboxMap

    // Viewport data source feeds camera frames.
    viewportDataSource = MapboxNavigationViewportDataSource(mapboxMap)

    // NavigationCamera consumes the viewport data source via the camera animations plugin.
    // Retrieve CameraAnimationsPlugin via the MapPluginProviderDelegate getPlugin() API.
    val cameraPlugin = mv.getPlugin<CameraAnimationsPlugin>(Plugin.MAPBOX_CAMERA_PLUGIN_ID)
      ?: return  // plugin not yet initialized; wireNavigation() will retry on first progress event
    navigationCamera = NavigationCamera(mapboxMap, cameraPlugin, viewportDataSource!!)
    applyCameraState()

    // Route line rendering — API holds route geometry, View renders layers onto the style.
    val lineApiOptions = MapboxRouteLineApiOptions.Builder().build()
    val lineViewOptionsBuilder = MapboxRouteLineViewOptions.Builder(context)
    routeLineColor?.let { color ->
      // Darken the color for the casing (border/outline) around the route line.
      val casingColor = android.graphics.Color.argb(
        255,
        (android.graphics.Color.red(color) * 0.7f).toInt(),
        (android.graphics.Color.green(color) * 0.7f).toInt(),
        (android.graphics.Color.blue(color) * 0.7f).toInt()
      )
      // Override base route colors (unknown + low congestion) + casing.
      // Traffic congestion levels (moderate/heavy/severe) keep their default
      // colors (yellow/orange/red) so traffic data remains visible.
      lineViewOptionsBuilder.routeLineColorResources(
        com.mapbox.navigation.ui.maps.route.line.model.RouteLineColorResources.Builder()
          .routeDefaultColor(color)
          .routeLowCongestionColor(color)
          .routeUnknownCongestionColor(color)
          .routeLineTraveledColor(color)
          .routeCasingColor(casingColor)
          .build()
      )
    }
    val lineViewOptions = lineViewOptionsBuilder.build()
    routeLineApi = MapboxRouteLineApi(lineApiOptions)
    routeLineView = MapboxRouteLineView(lineViewOptions)

    // View-level observers for camera/route-line updates (separate from module's JS event observers).
    nav.registerRouteProgressObserver(routeProgressObserver)
    nav.registerLocationObserver(viewLocationObserver)

    // Render routes once the style is loaded. getStyle() returns null before that,
    // which silently skips route drawing. The subscribeStyleLoaded callback fires
    // when the style finishes loading (or immediately if already loaded).
    mapboxMap.subscribeStyleLoaded {
      val routes = nav.getNavigationRoutes()
      if (routes.isNotEmpty()) {
        routeLineApi?.setNavigationRoutes(routes) { result ->
          mapboxMap.getStyle()?.let { style ->
            routeLineView?.renderRouteDrawData(style, result)
          }
        }
      }
    }
  }

  // RouteProgressObserver — drives camera + route line vanishing point

  // Feeds viewport data source + puck position from matched location.
  private val viewLocationObserver = object : LocationObserver {
    override fun onNewRawLocation(rawLocation: com.mapbox.common.location.Location) {}
    override fun onNewLocationMatcherResult(result: LocationMatcherResult) {
      post {
        viewportDataSource?.onLocationChanged(result.enhancedLocation)
        viewportDataSource?.evaluate()
        // Feed the matched location to the Maps SDK's puck so it tracks
        // the navigation position (not the device GPS).
        navigationLocationProvider.changePosition(
          result.enhancedLocation,
          result.keyPoints,
        )
        // Store for getCurrentLocation()
        lastLatitude = result.enhancedLocation.latitude
        lastLongitude = result.enhancedLocation.longitude
      }
    }
  }

  private val routeProgressObserver = RouteProgressObserver { progress ->
    // RouteProgressObserver fires on a background thread, but Mapbox Maps v11
    // enforces main-thread access for style/rendering operations (throws
    // WorkerThreadException otherwise). Dispatch all map-touching calls to main.
    post {
      viewportDataSource?.onRouteProgressChanged(progress)
      viewportDataSource?.evaluate()

      // On the first progress tick, render routes if not yet drawn (covers the
      // case where routes were set after the style loaded).
      if (!routesRendered) {
        val nav = ExpoMapboxNavigationModule.sharedNavigation
        val routes = nav?.getNavigationRoutes() ?: emptyList()
        if (routes.isNotEmpty()) {
          routeLineApi?.setNavigationRoutes(routes) { result ->
            mapView?.mapboxMap?.getStyle()?.let { style ->
              routeLineView?.renderRouteDrawData(style, result)
              routesRendered = true
            }
          }
        }
      }

      routeLineApi?.updateWithRouteProgress(progress) { result ->
        mapView?.mapboxMap?.getStyle()?.let { style ->
          routeLineView?.renderRouteLineUpdate(style, result)
        }
      }
    }
  }

  // Lifecycle

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    ensureMapView()
    mapView?.onStart()
    wireNavigation()
    currentInstance = this
  }

  /** Public helper for the module to re-request following camera after session transitions. */
  fun requestFollowingCamera() {
    navigationCamera?.requestNavigationCameraToFollowing()
  }

  override fun onDetachedFromWindow() {
    // Unregister observers when the view leaves the hierarchy.
    ExpoMapboxNavigationModule.sharedNavigation?.let { nav ->
      nav.unregisterRouteProgressObserver(routeProgressObserver)
      nav.unregisterLocationObserver(viewLocationObserver)
    }
    // Pause rendering — don't destroy the singleton.
    mapView?.onStop()
    super.onDetachedFromWindow()
  }

  // Prop setters

  fun setStyleURL(url: String) {
    styleURL = url
    mapView?.mapboxMap?.loadStyle(url)
  }

  fun setRouteLineColor(hex: String?) {
    routeLineColor = hex?.let { android.graphics.Color.parseColor(it) }
  }

  fun setNavigationCameraState(state: String) {
    cameraState = state
    applyCameraState()
  }

  private fun applyCameraState() {
    when (cameraState) {
      "following" -> navigationCamera?.requestNavigationCameraToFollowing()
      "overview"  -> navigationCamera?.requestNavigationCameraToOverview()
      else        -> navigationCamera?.requestNavigationCameraToIdle()
    }
  }
}
