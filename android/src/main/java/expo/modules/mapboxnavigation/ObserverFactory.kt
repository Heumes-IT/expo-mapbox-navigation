package expo.modules.mapboxnavigation

import android.os.Bundle
import com.mapbox.api.directions.v5.models.BannerInstructions
import com.mapbox.api.directions.v5.models.VoiceInstructions
import com.mapbox.navigation.base.trip.model.RouteProgress
import com.mapbox.navigation.base.trip.model.RouteLegProgress
import com.mapbox.navigation.core.arrival.ArrivalObserver
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.directions.session.RoutesUpdatedResult
import com.mapbox.navigation.core.routerefresh.RouteRefreshStatesObserver
import com.mapbox.navigation.core.routerefresh.RouteRefreshStateResult
import com.mapbox.navigation.core.trip.session.BannerInstructionsObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.OffRouteObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.trip.session.TripSessionState
import com.mapbox.navigation.core.trip.session.TripSessionStateObserver
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver

/// Factory for creating Mapbox Navigation SDK observer instances.
/// Each factory method returns a fully-configured observer ready to register.
@OptIn(com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI::class)
object ObserverFactory {

  fun createRouteProgressObserver(
    onEvent: (Map<String, Any?>) -> Unit,
    onWaypointApproaching: (legIndex: Int, distanceRemaining: Double) -> Unit,
    stepProgressHolder: (com.mapbox.navigation.base.trip.model.RouteStepProgress?) -> Unit,
  ): RouteProgressObserver = RouteProgressObserver { progress ->
    val legProgress = progress.currentLegProgress
    val stepProgress = legProgress?.currentStepProgress

    // Store for banner observer lane lookup.
    stepProgressHolder(stepProgress)

    // Upcoming maneuver from the upcoming step's first banner instruction.
    val upcomingStep = legProgress?.upcomingStep
    val bannerInstruction = upcomingStep?.bannerInstructions()?.firstOrNull()
    val primary = bannerInstruction?.primary()

    val bundle = mutableMapOf<String, Any?>(
      "distanceRemaining" to progress.distanceRemaining.toDouble(),
      "durationRemaining" to progress.durationRemaining,
      "fractionTraveled" to progress.fractionTraveled.toDouble(),
      "currentLegIndex" to (legProgress?.legIndex ?: 0),
      "currentStepIndex" to (stepProgress?.stepIndex ?: 0)
    )

    if (primary != null) {
      val maneuver = mutableMapOf<String, Any?>(
        "type" to (primary.type() ?: ""),
        "modifier" to (primary.modifier() ?: ""),
        "instruction" to (primary.text() ?: "")
      )
      // bearingAfter: exit bearing from the active step's first intersection.
      // StepIntersection.bearings() returns all bearings; index 1 is the exit bearing.
      val stepIntersection = stepProgress?.step?.intersections()?.firstOrNull()
      val exitBearing = stepIntersection?.bearings()?.getOrNull(1)?.toDouble()
      if (exitBearing != null) {
        maneuver["bearingAfter"] = exitBearing
      }
      bundle["upcomingManeuver"] = maneuver
    }

    // Speed limit: Android v3 exposes the unit on the step but the actual speed
    // Speed limit value comes from leg annotations at the current geometry index.
    // Full MaxSpeed data is available via SpeedInfoApi (separate artifact).
    val step = stepProgress?.step
    val speedLimitUnit = step?.speedLimitUnit()
    if (speedLimitUnit != null) {
      // Get the speed limit from the leg annotation at the current position.
      val legAnnotation = progress.currentLegProgress?.routeLeg?.annotation()
      val annotationIndex = stepProgress?.stepIndex ?: 0
      val maxSpeeds = legAnnotation?.maxspeed()
      val currentMaxSpeed = maxSpeeds?.getOrNull(annotationIndex)
      val speedVal = currentMaxSpeed?.speed()
      if (speedVal != null) {
        val unitStr = if (currentMaxSpeed?.unit() == "mph") "mph" else "km/h"
        val signRaw = step?.speedLimitSign() ?: ""
        val signStr = if (signRaw.contains("mutcd", ignoreCase = true)) "mutcd" else "vienna"
        bundle["speedLimit"] = mapOf<String, Any>(
          "speed" to speedVal.toDouble(),
          "unit" to unitStr,
          "sign" to signStr,
        )
      }
    }

    // Current street name from the active step.
    val streetName = stepProgress?.step?.name()
    if (!streetName.isNullOrEmpty()) {
      bundle["currentStreetName"] = streetName
    }

    // Distance to the next maneuver/turn (remaining distance in current step).
    val distToNextTurn = stepProgress?.distanceRemaining
    if (distToNextTurn != null) {
      bundle["distanceToNextTurn"] = distToNextTurn.toDouble()
    }

    onEvent(bundle)

    val distanceRemaining = legProgress?.distanceRemaining?.toDouble() ?: 0.0
    val legIndex = legProgress?.legIndex ?: 0
    if (distanceRemaining < 500) {
      onWaypointApproaching(legIndex, distanceRemaining)
    }
  }

  fun createLocationObserver(
    onLocationUpdate: (Map<String, Any?>) -> Unit,
  ): LocationObserver = object : LocationObserver {
    override fun onNewRawLocation(rawLocation: com.mapbox.common.location.Location) {
      // Not used — only enhanced/matched location is emitted.
    }

    override fun onNewLocationMatcherResult(locationMatcherResult: LocationMatcherResult) {
      val loc = locationMatcherResult.enhancedLocation
      val matchState = if (locationMatcherResult.isOffRoad) "notMatched" else "matched"

      val payload = mutableMapOf<String, Any?>(
        "latitude" to loc.latitude,
        "longitude" to loc.longitude,
        "matchState" to matchState
      )
      loc.bearing?.let { payload["bearing"] = it }
      loc.speed?.let { payload["speed"] = it }
      loc.horizontalAccuracy?.let { payload["accuracy"] = it }

      onLocationUpdate(payload)
    }
  }

  fun createTripSessionStateObserver(
    onStateChange: (String) -> Unit,
    getNavigationRoutes: () -> List<*>
  ): TripSessionStateObserver = TripSessionStateObserver { tripSessionState ->
    val stateStr = when (tripSessionState) {
      TripSessionState.STARTED -> if (getNavigationRoutes().isEmpty()) "freeDrive" else "activeGuidance"
      TripSessionState.STOPPED -> "idle"
    }
    onStateChange(stateStr)
  }

  fun createVoiceInstructionsObserver(
    onEvent: (Bundle) -> Unit,
    onSpeak: (String) -> Unit,
  ): VoiceInstructionsObserver = VoiceInstructionsObserver { voiceInstructions ->
    val payload = Bundle().apply {
      putString("text", voiceInstructions.announcement())
      voiceInstructions.ssmlAnnouncement()?.let { putString("ssmlText", it) }
      voiceInstructions.distanceAlongGeometry()?.let { putDouble("distanceAlongStep", it) }
    }
    onEvent(payload)
    onSpeak(voiceInstructions.announcement() ?: "")
  }

  fun createOffRouteObserver(
    onOffRoute: () -> Unit,
    onRerouteStarted: () -> Unit,
  ): OffRouteObserver = OffRouteObserver { offRoute ->
    if (offRoute) {
      onOffRoute()
      onRerouteStarted()
    }
  }

  fun createArrivalObserver(
    onWaypointArrival: (legIndex: Int) -> Unit,
    onFinalDestinationArrival: () -> Unit,
  ): ArrivalObserver = object : ArrivalObserver {
    override fun onWaypointArrival(routeProgress: RouteProgress) {
      val legIndex = routeProgress.currentLegProgress?.legIndex ?: 0
      onWaypointArrival(legIndex)
    }
    override fun onNextRouteLegStart(routeLegProgress: RouteLegProgress) {
      // No JS event for this.
    }
    override fun onFinalDestinationArrival(routeProgress: RouteProgress) {
      onFinalDestinationArrival()
    }
  }

  fun createRoutesObserver(
    onAlternativesUpdated: (alternativeIds: List<String>, count: Int) -> Unit,
    onFasterRouteAvailable: (routeId: String) -> Unit,
  ): RoutesObserver = RoutesObserver { result: RoutesUpdatedResult ->
    val routes = result.navigationRoutes
    if (routes.size > 1) {
      // Index 0 is the primary; 1..n are alternatives.
      val alternatives = routes.drop(1)
      val routeIds = alternatives.map { it.id }
      onAlternativesUpdated(routeIds, alternatives.size)
      // Emit onFasterRouteAvailable if any alternative has a shorter duration than primary.
      val primaryDuration = routes[0].directionsRoute.duration() ?: Double.MAX_VALUE
      val fasterAlt = alternatives.firstOrNull { alt ->
        val altDuration = alt.directionsRoute.duration() ?: Double.MAX_VALUE
        altDuration < primaryDuration
      }
      if (fasterAlt != null) {
        onFasterRouteAvailable(fasterAlt.id)
      }
    }
  }

  @OptIn(com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI::class)
  fun createRouteRefreshStatesObserver(
    onRefreshed: (Any) -> Unit,
  ): RouteRefreshStatesObserver = RouteRefreshStatesObserver { result ->
    onRefreshed(result.state)
  }
}
