package expo.modules.mapboxnavigation

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.mapbox.common.MapboxOptions
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.MapboxNavigationProvider
import com.mapbox.navigation.core.replay.route.ReplayRouteMapper
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.TripSessionStateObserver
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver
import com.mapbox.navigation.core.trip.session.BannerInstructionsObserver
import com.mapbox.navigation.core.trip.session.OffRouteObserver
import com.mapbox.navigation.core.arrival.ArrivalObserver
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.routerefresh.RouteRefreshStatesObserver
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.maps.extension.style.sources.addSource
import com.mapbox.maps.extension.style.layers.addLayer
import com.mapbox.maps.extension.style.layers.addLayerBelow
import com.mapbox.geojson.Point
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal class RoutingException(code: String, message: String) :
  CodedException(code, message, null)

/// Expo Modules wrapper for Mapbox Navigation SDK v3 (Android).
@OptIn(com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI::class)
class ExpoMapboxNavigationModule : Module() {

  companion object {
    var sharedNavigation: MapboxNavigation? = null
      private set
  }

  private var navigation: MapboxNavigation? = null
  private var accessToken: String? = null
  // Cached routes from the last requestRoutes call.
  private var lastNavigationRoutes: List<NavigationRoute>? = null

  // Active guidance state
  private var currentSessionState: String = "idle"
  private var routeProgressObserver: RouteProgressObserver? = null
  private var locationObserver: LocationObserver? = null
  private var sessionStateObserver: TripSessionStateObserver? = null
  // Global session state observer — subscribed at provider creation, survives across
  // start/stop cycles.
  private var globalSessionStateObserver: TripSessionStateObserver? = null

  // Waypoint approach de-dup — mirrors iOS contract.
  private var lastApproachingLegIndex: Int = -1

  // Current step progress — shared between routeProgressObserver and bannerInstructionsObserver.
  private var currentStepProgress: com.mapbox.navigation.base.trip.model.RouteStepProgress? = null

  // TTS manager — created lazily when a context is available.
  private var ttsManager: TTSManager? = null

  private fun getTtsManager(): TTSManager {
    return ttsManager ?: run {
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("reactContext is null")
      TTSManager(ctx).also { mgr ->
        mgr.setAccessTokenProvider { accessToken }
        ttsManager = mgr
      }
    }
  }

  // Observers defined as fields so they can be unregistered cleanly.
  private val voiceInstructionsObserver: VoiceInstructionsObserver =
    ObserverFactory.createVoiceInstructionsObserver(
      onEvent = { payload -> sendEvent("onVoiceInstruction", payload) },
      onSpeak = { text ->
        val mgr = ttsManager
        if (mgr != null && mgr.state.enabled) {
          mgr.speakInstruction(text)
        }
      }
    )

  private val bannerInstructionsObserver = BannerInstructionsObserver { bannerInstructions ->
    val payload = BannerPayloadBuilder.build(bannerInstructions)
    // Attach lane guidance from the last intersection of the current step.
    val step = currentStepProgress?.step
    val intersections = step?.intersections()
    val lastIntersection = intersections?.lastOrNull()
    val lanes = lastIntersection?.lanes()
    if (lanes != null && lanes.isNotEmpty()) {
      val lanesList = ArrayList<Bundle>(lanes.size)
      for (lane in lanes) {
        lanesList.add(Bundle().apply {
          val indications = lane.indications() ?: emptyList()
          putStringArrayList("indications", ArrayList(indications))
          putBoolean("valid", lane.valid() ?: false)
          putBoolean("active", lane.active() ?: lane.valid() ?: false)
        })
      }
      payload.putParcelableArrayList("lanes", lanesList)
    }
    sendEvent("onBannerInstruction", payload)
  }

  private val offRouteObserver: OffRouteObserver =
    ObserverFactory.createOffRouteObserver(
      onOffRoute = { sendEvent("onOffRoute", Bundle()) },
      onRerouteStarted = { sendEvent("onRerouteStarted", Bundle()) }
    )

  // v3 Android does not expose NavigationRouteAlternativesObserver publicly; alternatives
  // arrive via RoutesObserver when the SDK updates the route list.
  private val routeAlternativesObserver: RoutesObserver =
    ObserverFactory.createRoutesObserver(
      onAlternativesUpdated = { ids, count ->
        sendEvent("onContinuousAlternativesUpdated", mapOf<String, Any>(
          "alternatives" to ids,
          "count" to count
        ))
      },
      onFasterRouteAvailable = { routeId ->
        sendEvent("onFasterRouteAvailable", mapOf<String, Any>("routeId" to routeId))
      }
    )

  // RouteRefreshStatesObserver is @ExperimentalPreviewMapboxNavigationAPI — opt in at class level.
  private val routeRefreshStatesObserver: RouteRefreshStatesObserver =
    ObserverFactory.createRouteRefreshStatesObserver(
      onRefreshed = { state ->
        sendEvent("onRouteRefreshed", mapOf<String, Any>("state" to state))
      }
    )

  private val arrivalObserver: ArrivalObserver =
    ObserverFactory.createArrivalObserver(
      onWaypointArrival = { legIndex ->
        sendEvent("onWaypointArrived", Bundle().apply {
          putInt("waypointIndex", legIndex + 1)
        })
      },
      onFinalDestinationArrival = {
        sendEvent("onFinalDestinationArrived", Bundle())
      }
    )

  override fun definition() = ModuleDefinition {
    Name("ExpoMapboxNavigation")

    Events(
      "onRouteProgress", "onLocationUpdate", "onSessionStateChange",
      "onVoiceInstruction", "onBannerInstruction",
      "onOffRoute", "onRerouteStarted", "onRerouteCompleted", "onRerouteFailed",
      "onWaypointApproaching", "onWaypointArrived", "onFinalDestinationArrived",
      "onSpeedLimitUpdate",
      "onContinuousAlternativesUpdated", "onFasterRouteAvailable", "onRouteRefreshed"
    )

    Function("setAccessToken") { token: String ->
      MapboxOptions.accessToken = token
      accessToken = token
      val context = appContext.reactContext
        ?: throw IllegalStateException(
          "ExpoMapboxNavigation: reactContext is null; setAccessToken must be called after the module is initialized."
        )
      if (navigation == null) {
        val nav = MapboxNavigationProvider.create(
          NavigationOptions.Builder(context).build()
        )
        navigation = nav
        sharedNavigation = nav
        // Subscribe to session state changes globally so onSessionStateChange fires
        // for ALL transitions (idle ↔ freeDrive ↔ activeGuidance), not just during
        // active guidance when attachObservers() is called.
        globalSessionStateObserver = ObserverFactory.createTripSessionStateObserver(
          onStateChange = { stateStr ->
            if (stateStr != currentSessionState) {
              currentSessionState = stateStr
              sendEvent("onSessionStateChange", mapOf("state" to stateStr))
            }
          },
          getNavigationRoutes = { nav.getNavigationRoutes() }
        ).also { nav.registerTripSessionStateObserver(it) }
      }
    }

    AsyncFunction("requestRoutesNative") Coroutine { optionsJson: String ->
      val nav = navigation
        ?: throw RoutingException("NO_TOKEN", "MapboxNavigation has not been initialized. Call setAccessToken first.")
      val context = appContext.reactContext
        ?: throw RoutingException("UNKNOWN", "reactContext is null.")
      val (routes, json) = RoutingService.requestRoutes(nav, optionsJson, context, accessToken)
      lastNavigationRoutes = routes
      return@Coroutine json
    }

    AsyncFunction("configureTtsNative") Coroutine { optionsJson: String ->
      getTtsManager().configure(optionsJson)
    }

    AsyncFunction("startActiveGuidanceNative") Coroutine { optionsJson: String ->
      val nav = navigation
        ?: throw RoutingException("NO_TOKEN", "MapboxNavigation has not been initialized. Call setAccessToken first.")

      val options = try {
        JSONObject(optionsJson)
      } catch (e: Exception) {
        throw RoutingException("INVALID_INPUT", "Failed to parse optionsJson: ${e.message}")
      }

      val routeIndex = options.optInt("routeIndex", 0)
      val simulate = options.optBoolean("simulate", false)

      if (routeIndex != 0) {
        throw RoutingException(
          "INVALID_INPUT",
          "Only routeIndex 0 is currently supported."
        )
      }

      val routes = lastNavigationRoutes
        ?: throw RoutingException(
          "INVALID_INPUT",
          "No cached routes available. Call requestRoutesNative before startActiveGuidanceNative."
        )

      // Unregister any previous observers before re-attaching.
      unregisterObservers(nav)

      // Reset waypoint approach de-dup state.
      lastApproachingLegIndex = -1

      // Set routes on the navigation engine.
      nav.setNavigationRoutes(routes)

      // Start the trip session — real or simulated.
      if (simulate) {
        val chosen = routes[0]
        val replayer = nav.mapboxReplayer
        replayer.clearEvents()
        val replayEvents = ReplayRouteMapper().mapDirectionsRouteGeometry(chosen.directionsRoute)
        if (replayEvents.isNotEmpty()) {
          replayer.pushEvents(replayEvents)
          replayer.seekTo(replayEvents.first())
        }
        @OptIn(com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI::class)
        nav.startReplayTripSession()
        replayer.play()
      } else {
        nav.startTripSession()
      }

      // Register observers.
      attachObservers(nav)

      // Re-request following camera — the session start may have reset it,
      // and the React prop ("following") hasn't changed so it won't re-apply.
      ExpoMapboxNavigationMapView.sharedMapView?.let {
        it.post {
          // Access the view's navigation camera via the companion
          // The view re-wires on attach, so just request following
          val nmv = ExpoMapboxNavigationMapView.currentInstance
          nmv?.requestFollowingCamera()
        }
      }
    }

    AsyncFunction("stopNavigation") Coroutine { ->
      val nav = navigation ?: return@Coroutine

      unregisterObservers(nav)

      nav.setNavigationRoutes(emptyList())
      nav.stopTripSession()

      // Stop the replayer if it was running.
      nav.mapboxReplayer.stop()

      // Shut down TTS so the engine doesn't leak across sessions.
      ttsManager?.shutdown()
      ttsManager = null

      lastApproachingLegIndex = -1
      currentSessionState = "idle"
      sendEvent("onSessionStateChange", mapOf("state" to "idle"))
    }

    Function("getSessionState") {
      currentSessionState
    }

    AsyncFunction("requestLocationPermission") Coroutine { optionsJson: String ->
      val context = appContext.reactContext ?: return@Coroutine "denied"
      val activity = appContext.currentActivity ?: return@Coroutine "denied"
      val json = try { JSONObject(optionsJson) } catch (e: Exception) { JSONObject() }
      val background = json.optBoolean("background", false)

      val fineGranted = ContextCompat.checkSelfPermission(
        context, Manifest.permission.ACCESS_FINE_LOCATION
      ) == PackageManager.PERMISSION_GRANTED

      if (fineGranted && !background) return@Coroutine "granted"

      if (background && fineGranted) {
        val bgGranted = ContextCompat.checkSelfPermission(
          context, Manifest.permission.ACCESS_BACKGROUND_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (bgGranted) return@Coroutine "granted"
      }

      // Trigger system permission prompt. The next call will reflect the user's choice.
      val perms = if (background && fineGranted) {
        arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
      } else {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
      }
      ActivityCompat.requestPermissions(activity, perms, 54321)
      return@Coroutine "denied"
    }

    Function("getLocationPermissionStatus") {
      val context = appContext.reactContext ?: return@Function "denied"
      val granted = ContextCompat.checkSelfPermission(
        context, Manifest.permission.ACCESS_FINE_LOCATION
      ) == PackageManager.PERMISSION_GRANTED
      if (granted) "granted" else "denied"
    }

    AsyncFunction("startFreeDrive") Coroutine { ->
      val nav = navigation ?: return@Coroutine
      nav.startTripSession()
      currentSessionState = "freeDrive"
      sendEvent("onSessionStateChange", mapOf("state" to "freeDrive"))
    }

    AsyncFunction("pauseFreeDrive") Coroutine { ->
      val nav = navigation ?: return@Coroutine
      nav.stopTripSession()
      currentSessionState = "idle"
      sendEvent("onSessionStateChange", mapOf("state" to "idle"))
    }

    AsyncFunction("navigateNextLeg") Coroutine { ->
      val nav = navigation
        ?: throw RoutingException("INVALID_INPUT", "No active navigation")
      suspendCancellableCoroutine<Unit> { cont ->
        nav.navigateNextRouteLeg { legIndex ->
          if (legIndex != null) {
            cont.resume(Unit)
          } else {
            cont.resumeWithException(
              RoutingException("INVALID_INPUT", "Could not advance to next leg")
            )
          }
        }
      }
    }

    Function("setKeepScreenOn") { enabled: Boolean ->
      val activity = appContext.currentActivity ?: return@Function
      activity.runOnUiThread {
        if (enabled) {
          activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
          activity.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      }
    }

    Function("getCurrentLocation") {
      val lat = ExpoMapboxNavigationMapView.lastLatitude
      val lng = ExpoMapboxNavigationMapView.lastLongitude
      if (lat != null && lng != null) {
        mapOf<String, Double>("latitude" to lat, "longitude" to lng)
      } else {
        null
      }
    }

    AsyncFunction("refreshRouteNow") Coroutine { ->
      val nav = navigation ?: return@Coroutine
      // v3: RouteRefreshController.requestImmediateRouteRefresh() (ExperimentalPreviewMapboxNavigationAPI)
      @OptIn(com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI::class)
      nav.routeRefreshController.requestImmediateRouteRefresh()
    }

    AsyncFunction("pauseRouteRefresh") Coroutine { ->
      val nav = navigation ?: return@Coroutine
      @OptIn(com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI::class)
      nav.routeRefreshController.pauseRouteRefreshes()
    }

    AsyncFunction("resumeRouteRefresh") Coroutine { ->
      val nav = navigation ?: return@Coroutine
      @OptIn(com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI::class)
      nav.routeRefreshController.resumeRouteRefreshes()
    }

    AsyncFunction("setSimulated") Coroutine { optionsJson: String ->
      val nav = navigation ?: return@Coroutine
      val json = try { JSONObject(optionsJson) } catch (e: Exception) {
        throw RoutingException("INVALID_INPUT", "setSimulated: invalid JSON")
      }
      val enabled = json.optBoolean("enabled", false)
      val speedMultiplier = json.optDouble("speedMultiplier", 1.0)

      if (enabled) {
        val routes = nav.getNavigationRoutes()
        val replayer = nav.mapboxReplayer
        replayer.clearEvents()
        if (routes.isNotEmpty()) {
          val replayEvents = ReplayRouteMapper().mapDirectionsRouteGeometry(routes[0].directionsRoute)
          if (replayEvents.isNotEmpty()) {
            replayer.pushEvents(replayEvents)
            replayer.seekTo(replayEvents.first())
          }
        }
        replayer.playbackSpeed(speedMultiplier)
        @OptIn(com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI::class)
        nav.startReplayTripSession()
        replayer.play()
      } else {
        val replayer = nav.mapboxReplayer
        replayer.stop()
        nav.startTripSession()
      }
    }

    AsyncFunction("startHistoryRecording") Coroutine { ->
      val nav = navigation ?: return@Coroutine
      // startRecording() is synchronous in v3; returns list of active recording file paths.
      nav.historyRecorder.startRecording()
      Unit
    }

    AsyncFunction("stopHistoryRecording") Coroutine { ->
      val nav = navigation ?: return@Coroutine
      suspendCancellableCoroutine<String?> { cont ->
        nav.historyRecorder.stopRecording { filepath ->
          cont.resume(filepath)
        }
      }
    }

    // MARK: - Imperative map API

    AsyncFunction("setCamera") Coroutine { optionsJson: String ->
      val json = JSONObject(optionsJson)
      val mv = ExpoMapboxNavigationMapView.sharedMapView ?: return@Coroutine
      withContext(Dispatchers.Main) {
        val builder = com.mapbox.maps.CameraOptions.Builder()
        json.optJSONArray("center")?.let { arr ->
          if (arr.length() == 2) builder.center(Point.fromLngLat(arr.getDouble(0), arr.getDouble(1)))
        }
        json.optDouble("zoom", Double.NaN).let { if (!it.isNaN()) builder.zoom(it) }
        json.optDouble("bearing", Double.NaN).let { if (!it.isNaN()) builder.bearing(it) }
        json.optDouble("pitch", Double.NaN).let { if (!it.isNaN()) builder.pitch(it) }
        json.optJSONObject("padding")?.let { p ->
          builder.padding(com.mapbox.maps.EdgeInsets(
            p.optDouble("top", 0.0), p.optDouble("left", 0.0),
            p.optDouble("bottom", 0.0), p.optDouble("right", 0.0)
          ))
        }
        val opts = builder.build()
        val duration = json.optLong("animationDuration", 0L)
        if (duration > 0) {
          mv.camera.flyTo(opts, com.mapbox.maps.plugin.animation.MapAnimationOptions.mapAnimationOptions { this.duration(duration) }, null)
        } else {
          mv.mapboxMap.setCamera(opts)
        }
      }
    }

    AsyncFunction("addGeoJsonSource") Coroutine { optionsJson: String ->
      val json = JSONObject(optionsJson)
      val id = json.getString("id")
      val data = json.getJSONObject("data").toString()
      val mv = ExpoMapboxNavigationMapView.sharedMapView ?: return@Coroutine
      withContext(Dispatchers.Main) {
        mv.mapboxMap.getStyle()?.let { style ->
          val source = com.mapbox.maps.extension.style.sources.generated.geoJsonSource(id) {
            data(data)
          }
          style.addSource(source)
        }
      }
    }

    AsyncFunction("removeSource") Coroutine { id: String ->
      val mv = ExpoMapboxNavigationMapView.sharedMapView ?: return@Coroutine
      withContext(Dispatchers.Main) {
        mv.mapboxMap.getStyle()?.removeStyleSource(id)
      }
    }

    AsyncFunction("addLineLayer") Coroutine { optionsJson: String ->
      val json = JSONObject(optionsJson)
      val id = json.getString("id")
      val sourceId = json.getString("sourceId")
      val mv = ExpoMapboxNavigationMapView.sharedMapView ?: return@Coroutine
      withContext(Dispatchers.Main) {
        mv.mapboxMap.getStyle()?.let { style ->
          val layer = com.mapbox.maps.extension.style.layers.generated.lineLayer(id, sourceId) {
            json.optJSONObject("paint")?.let { paint ->
              paint.optString("lineColor", "").takeIf { it.isNotEmpty() }?.let { lineColor(it) }
              paint.optDouble("lineWidth", Double.NaN).let { if (!it.isNaN()) lineWidth(it) }
              paint.optDouble("lineOpacity", Double.NaN).let { if (!it.isNaN()) lineOpacity(it) }
            }
          }
          val belowLayerId = json.optString("belowLayerId", "")
          if (belowLayerId.isNotEmpty()) {
            style.addLayerBelow(layer, belowLayerId)
          } else {
            style.addLayer(layer)
          }
        }
      }
    }

    AsyncFunction("addCircleLayer") Coroutine { optionsJson: String ->
      val json = JSONObject(optionsJson)
      val id = json.getString("id")
      val sourceId = json.getString("sourceId")
      val mv = ExpoMapboxNavigationMapView.sharedMapView ?: return@Coroutine
      withContext(Dispatchers.Main) {
        mv.mapboxMap.getStyle()?.let { style ->
          val layer = com.mapbox.maps.extension.style.layers.generated.circleLayer(id, sourceId) {
            json.optJSONObject("paint")?.let { paint ->
              paint.optString("circleColor", "").takeIf { it.isNotEmpty() }?.let { circleColor(it) }
              paint.optDouble("circleRadius", Double.NaN).let { if (!it.isNaN()) circleRadius(it) }
              paint.optDouble("circleOpacity", Double.NaN).let { if (!it.isNaN()) circleOpacity(it) }
            }
          }
          val belowLayerId = json.optString("belowLayerId", "")
          if (belowLayerId.isNotEmpty()) {
            style.addLayerBelow(layer, belowLayerId)
          } else {
            style.addLayer(layer)
          }
        }
      }
    }

    AsyncFunction("removeLayer") Coroutine { id: String ->
      val mv = ExpoMapboxNavigationMapView.sharedMapView ?: return@Coroutine
      withContext(Dispatchers.Main) {
        mv.mapboxMap.getStyle()?.removeStyleLayer(id)
      }
    }

    AsyncFunction("addImage") Coroutine { optionsJson: String ->
      val json = JSONObject(optionsJson)
      val id = json.getString("id")
      val uri = json.getString("uri")
      val mv = ExpoMapboxNavigationMapView.sharedMapView ?: return@Coroutine
      val bitmap = withContext(Dispatchers.IO) {
        val url = java.net.URL(uri)
        val connection = url.openConnection() as java.net.HttpURLConnection
        connection.doInput = true
        connection.connect()
        val input = connection.inputStream
        android.graphics.BitmapFactory.decodeStream(input).also { connection.disconnect() }
      }
      if (bitmap != null) {
        withContext(Dispatchers.Main) {
          mv.mapboxMap.getStyle()?.addImage(id, bitmap)
        }
      }
    }

    AsyncFunction("removeImage") Coroutine { id: String ->
      val mv = ExpoMapboxNavigationMapView.sharedMapView ?: return@Coroutine
      withContext(Dispatchers.Main) {
        mv.mapboxMap.getStyle()?.removeStyleImage(id)
      }
    }

    View(ExpoMapboxNavigationMapView::class) {
      Prop("styleURL") { view: ExpoMapboxNavigationMapView, url: String ->
        view.setStyleURL(url)
      }
      Prop("navigationCameraState") { view: ExpoMapboxNavigationMapView, state: String ->
        view.setNavigationCameraState(state)
      }
      Prop("routeLineColor") { view: ExpoMapboxNavigationMapView, hex: String? ->
        view.setRouteLineColor(hex)
      }
    }
  }

  // Observer management

  private fun attachObservers(nav: MapboxNavigation) {
    // RouteProgressObserver
    routeProgressObserver = ObserverFactory.createRouteProgressObserver(
      onEvent = { bundle ->
        // Promote speed limit to its own event
        (bundle["speedLimit"] as? Map<*, *>)?.let { sl ->
          @Suppress("UNCHECKED_CAST")
          sendEvent("onSpeedLimitUpdate", sl as Map<String, Any>)
        }
        sendEvent("onRouteProgress", bundle)
      },
      onWaypointApproaching = { legIndex, distanceRemaining ->
        if (lastApproachingLegIndex != legIndex) {
          lastApproachingLegIndex = legIndex
          sendEvent("onWaypointApproaching", Bundle().apply {
            putInt("waypointIndex", legIndex + 1)
            putDouble("distanceRemaining", distanceRemaining)
          })
        }
      },
      stepProgressHolder = { stepProgress ->
        currentStepProgress = stepProgress
      }
    ).also { nav.registerRouteProgressObserver(it) }

    // LocationObserver
    locationObserver = ObserverFactory.createLocationObserver(
      onLocationUpdate = { payload -> sendEvent("onLocationUpdate", payload) }
    ).also { nav.registerLocationObserver(it) }

    // TripSessionStateObserver (per-guidance; distinct from globalSessionStateObserver)
    sessionStateObserver = ObserverFactory.createTripSessionStateObserver(
      onStateChange = { stateStr ->
        currentSessionState = stateStr
        sendEvent("onSessionStateChange", mapOf("state" to stateStr))
      },
      getNavigationRoutes = { nav.getNavigationRoutes() }
    ).also { nav.registerTripSessionStateObserver(it) }

    nav.registerVoiceInstructionsObserver(voiceInstructionsObserver)
    nav.registerBannerInstructionsObserver(bannerInstructionsObserver)
    nav.registerOffRouteObserver(offRouteObserver)
    nav.registerArrivalObserver(arrivalObserver)
    nav.registerRoutesObserver(routeAlternativesObserver)
    nav.routeRefreshController.registerRouteRefreshStateObserver(routeRefreshStatesObserver)
  }

  private fun unregisterObservers(nav: MapboxNavigation) {
    routeProgressObserver?.let {
      nav.unregisterRouteProgressObserver(it)
      routeProgressObserver = null
    }
    locationObserver?.let {
      nav.unregisterLocationObserver(it)
      locationObserver = null
    }
    sessionStateObserver?.let {
      nav.unregisterTripSessionStateObserver(it)
      sessionStateObserver = null
    }
    nav.unregisterVoiceInstructionsObserver(voiceInstructionsObserver)
    nav.unregisterBannerInstructionsObserver(bannerInstructionsObserver)
    nav.unregisterOffRouteObserver(offRouteObserver)
    nav.unregisterArrivalObserver(arrivalObserver)
    nav.unregisterRoutesObserver(routeAlternativesObserver)
    nav.routeRefreshController.unregisterRouteRefreshStateObserver(routeRefreshStatesObserver)
  }
}
