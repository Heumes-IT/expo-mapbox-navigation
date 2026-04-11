package expo.modules.mapboxnavigation

import android.content.Context
import com.mapbox.api.directions.v5.DirectionsCriteria
import com.mapbox.api.directions.v5.models.DirectionsResponse
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.geojson.Point
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.extensions.applyLanguageAndVoiceUnitOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.core.MapboxNavigation
import expo.modules.kotlin.exception.CodedException
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

// RoutingException is defined in ExpoMapboxNavigationModule.kt

/// Handles route requests against the Mapbox Directions API via MapboxNavigation.
object RoutingService {

  suspend fun requestRoutes(
    navigation: MapboxNavigation,
    optionsJson: String,
    context: Context,
    accessToken: String?
  ): Pair<List<NavigationRoute>, String> {
    if (accessToken == null) {
      throw RoutingException("NO_TOKEN", "Mapbox access token has not been set. Call setAccessToken first.")
    }

    val options = try {
      JSONObject(optionsJson)
    } catch (e: Exception) {
      throw RoutingException("INVALID_INPUT", "Failed to parse optionsJson: ${e.message}")
    }

    val waypointsArray = try {
      options.getJSONArray("waypoints")
    } catch (e: Exception) {
      throw RoutingException("INVALID_INPUT", "Missing required 'waypoints' array in options.")
    }

    if (waypointsArray.length() < 2) {
      throw RoutingException("INVALID_INPUT", "At least 2 waypoints are required, got ${waypointsArray.length()}.")
    }

    val points = try {
      (0 until waypointsArray.length()).map { i ->
        val wp = waypointsArray.getJSONObject(i)
        val lat = wp.getDouble("latitude")
        val lng = wp.getDouble("longitude")
        Point.fromLngLat(lng, lat)
      }
    } catch (e: Exception) {
      throw RoutingException("INVALID_INPUT", "Invalid waypoint format: ${e.message}")
    }

    val profileStr = options.optString("profile", "driving-traffic")
    val profile = when (profileStr) {
      "driving" -> DirectionsCriteria.PROFILE_DRIVING
      "driving-traffic" -> DirectionsCriteria.PROFILE_DRIVING_TRAFFIC
      "walking" -> DirectionsCriteria.PROFILE_WALKING
      "cycling" -> DirectionsCriteria.PROFILE_CYCLING
      else -> throw RoutingException("INVALID_INPUT", "Unknown profile '$profileStr'. Must be one of: driving, driving-traffic, walking, cycling.")
    }

    val routeOptionsBuilder = RouteOptions.builder()
      .applyDefaultNavigationOptions(profile)
      .applyLanguageAndVoiceUnitOptions(context)
      .coordinatesList(points)

    if (options.has("alternatives")) {
      routeOptionsBuilder.alternatives(options.getBoolean("alternatives"))
    }

    // applyLanguageAndVoiceUnitOptions sets language from locale; this allows an explicit override.
    if (options.has("language")) {
      routeOptionsBuilder.language(options.getString("language"))
    }

    if (options.has("steps")) {
      routeOptionsBuilder.steps(options.getBoolean("steps"))
    }

    if (options.has("avoid")) {
      val excludeArray = options.getJSONArray("avoid")
      val excludeCriteria = (0 until excludeArray.length()).mapNotNull { i ->
        when (excludeArray.getString(i)) {
          "toll" -> DirectionsCriteria.EXCLUDE_TOLL
          "ferry" -> DirectionsCriteria.EXCLUDE_FERRY
          "motorway" -> DirectionsCriteria.EXCLUDE_MOTORWAY
          "tunnel" -> DirectionsCriteria.EXCLUDE_TUNNEL
          else -> null // ignore unknown exclude values
        }
      }
      if (excludeCriteria.isNotEmpty()) {
        routeOptionsBuilder.exclude(excludeCriteria.joinToString(","))
      }
    }

    val routeOptions = routeOptionsBuilder.build()

    val routes = suspendCancellableCoroutine<List<NavigationRoute>> { continuation ->
      val requestId = navigation.requestRoutes(
        routeOptions,
        object : NavigationRouterCallback {
          override fun onRoutesReady(
            routes: List<NavigationRoute>,
            @com.mapbox.navigation.base.route.RouterOrigin routerOrigin: String
          ) {
            if (routes.isEmpty()) {
              continuation.resumeWithException(
                RoutingException("NO_ROUTE", "No routes found for the given waypoints.")
              )
            } else {
              continuation.resume(routes)
            }
          }

          override fun onFailure(
            reasons: List<RouterFailure>,
            routeOptions: RouteOptions
          ) {
            val firstReason = reasons.firstOrNull()
            val message = firstReason?.message ?: "Route request failed."
            val code = if (message.contains("network", ignoreCase = true) ||
              firstReason?.throwable?.message?.contains("network", ignoreCase = true) == true
            ) {
              "NETWORK"
            } else {
              "UNKNOWN"
            }
            continuation.resumeWithException(RoutingException(code, message))
          }

          override fun onCanceled(
            routeOptions: RouteOptions,
            @com.mapbox.navigation.base.route.RouterOrigin routerOrigin: String
          ) {
            continuation.resumeWithException(
              RoutingException("UNKNOWN", "Route request canceled.")
            )
          }
        }
      )

      continuation.invokeOnCancellation {
        navigation.cancelRouteRequest(requestId)
      }
    }

    // Build the Directions API response envelope.
    // updateWithRequestData injects routeOptions into each DirectionsRoute and the response,
    // matching the wire format {code, routes, waypoints, routeOptions}.
    val directionsRoutes = routes.map { it.directionsRoute }
    val waypoints = routes.firstOrNull()?.directionsRoute?.waypoints() ?: emptyList()
    val response = DirectionsResponse.builder()
      .code("Ok")
      .routes(directionsRoutes)
      .waypoints(waypoints)
      .build()
      .updateWithRequestData(routeOptions)

    return Pair(routes, response.toJson())
  }
}
