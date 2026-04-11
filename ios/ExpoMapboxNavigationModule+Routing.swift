import CoreLocation
import ExpoModulesCore
import MapboxDirections
@preconcurrency import MapboxNavigationCore

extension ExpoMapboxNavigationModule {
  // MARK: - Private routing implementation

  func requestRoutes(optionsJson: String) async throws -> String {
    guard let token = accessToken, !token.isEmpty else {
      throw Exception(
        name: "NO_TOKEN",
        description: "setAccessToken must be called before requestRoutes.",
        code: "NO_TOKEN"
      )
    }

    guard
      let data = optionsJson.data(using: .utf8),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw Exception(
        name: "INVALID_INPUT",
        description: "optionsJson is not valid JSON.",
        code: "INVALID_INPUT"
      )
    }


    guard let waypointsRaw = json["waypoints"] as? [[String: Any]] else {
      throw Exception(
        name: "INVALID_INPUT",
        description: "Missing or invalid 'waypoints' array in options.",
        code: "INVALID_INPUT"
      )
    }

    guard waypointsRaw.count >= 2 else {
      throw Exception(
        name: "INVALID_INPUT",
        description: "At least 2 waypoints are required.",
        code: "INVALID_INPUT"
      )
    }

    var waypoints: [Waypoint] = []
    for (i, wp) in waypointsRaw.enumerated() {
      guard
        let lat = wp["latitude"] as? Double,
        let lon = wp["longitude"] as? Double
      else {
        throw Exception(
          name: "INVALID_INPUT",
          description: "Waypoint at index \(i) is missing latitude or longitude.",
          code: "INVALID_INPUT"
        )
      }
      var waypoint = Waypoint(
        coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon)
      )
      if let name = wp["name"] as? String {
        waypoint.name = name
      }
      waypoints.append(waypoint)
    }

    let profileString = (json["profile"] as? String) ?? "driving-traffic"
    let profile: ProfileIdentifier
    switch profileString {
    case "driving":
      profile = .automobile
    case "driving-traffic":
      profile = .automobileAvoidingTraffic
    case "walking":
      profile = .walking
    case "cycling":
      profile = .cycling
    default:
      throw Exception(
        name: "INVALID_INPUT",
        description:
          "Unknown profile '\(profileString)'. Must be driving | driving-traffic | walking | cycling.",
        code: "INVALID_INPUT"
      )
    }

    let routeOptions = NavigationRouteOptions(
      waypoints: waypoints,
      profileIdentifier: profile
    )

    if let alternatives = json["alternatives"] as? Bool {
      routeOptions.includesAlternativeRoutes = alternatives
    } else {
      routeOptions.includesAlternativeRoutes = true
    }

    if let language = json["language"] as? String {
      routeOptions.locale = Locale(identifier: language)
    }

    if let steps = json["steps"] as? Bool {
      routeOptions.includesSteps = steps
    }

    if let avoidArray = json["avoid"] as? [String] {
      var roadClasses = RoadClasses()
      for avoidItem in avoidArray {
        switch avoidItem {
        case "toll":
          roadClasses.insert(.toll)
        case "ferry":
          roadClasses.insert(.ferry)
        case "motorway":
          roadClasses.insert(.motorway)
        default:
          break
        }
      }
      if !roadClasses.isEmpty {
        routeOptions.roadClassesToAvoid = roadClasses
      }
    }

    // mapboxNavigation and routingProvider() are @MainActor-isolated in the v3 SDK.
    let p = ensureProvider(token: token)
    let request = await MainActor.run {
      p.mapboxNavigation.routingProvider().calculateRoutes(options: routeOptions)
    }
    let navigationRoutes: NavigationRoutes
    do {
      navigationRoutes = try await request.value
    } catch {
      let msg = error.localizedDescription.lowercased()
      if msg.contains("network") || msg.contains("internet") || msg.contains("offline")
        || msg.contains("connection") || msg.contains("unreachable")
      {
        throw Exception(
          name: "NETWORK",
          description: "Network error while fetching routes: \(error.localizedDescription)",
          code: "NETWORK"
        )
      }
      throw Exception(
        name: "UNKNOWN",
        description: "Route calculation failed: \(error.localizedDescription)",
        code: "UNKNOWN"
      )
    }

    lastNavigationRoutes = navigationRoutes

    var directionsRoutes: [Route] = [navigationRoutes.mainRoute.route]
    for alternative in navigationRoutes.alternativeRoutes {
      directionsRoutes.append(alternative.route)
    }

    guard !directionsRoutes.isEmpty else {
      throw Exception(
        name: "NO_ROUTE",
        description: "The routing provider returned no routes.",
        code: "NO_ROUTE"
      )
    }

    // Encode the full Directions API response envelope.
    // RouteResponse.encode(to:) requires .options and .credentials in JSONEncoder.userInfo.
    // The "code" and "routeOptions" keys are added manually as RouteResponse omits them.
    let credentials = Credentials(accessToken: token)
    let routeResponse = RouteResponse(
      httpResponse: nil,
      identifier: nil,
      routes: directionsRoutes,
      waypoints: waypoints,
      options: .route(routeOptions),
      credentials: credentials
    )

    let encoder = JSONEncoder()
    encoder.userInfo[.options] = routeOptions
    encoder.userInfo[.credentials] = credentials

    let responseData: Data
    do {
      responseData = try encoder.encode(routeResponse)
    } catch {
      throw Exception(
        name: "UNKNOWN",
        description: "Failed to encode RouteResponse: \(error.localizedDescription)",
        code: "UNKNOWN"
      )
    }

    guard
      var envelope = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any]
    else {
      throw Exception(
        name: "UNKNOWN",
        description: "Failed to parse encoded RouteResponse as JSON object.",
        code: "UNKNOWN"
      )
    }

    envelope["code"] = "Ok"

    let optionsEncoder = JSONEncoder()
    optionsEncoder.userInfo[.options] = routeOptions
    optionsEncoder.userInfo[.credentials] = credentials
    do {
      let optionsData = try optionsEncoder.encode(routeOptions)
      let optionsObj = try JSONSerialization.jsonObject(with: optionsData)
      envelope["routeOptions"] = optionsObj
    } catch {
      throw Exception(
        name: "UNKNOWN",
        description: "Failed to encode routeOptions for response envelope: \(error.localizedDescription)",
        code: "UNKNOWN"
      )
    }

    guard
      let finalData = try? JSONSerialization.data(withJSONObject: envelope),
      let finalString = String(data: finalData, encoding: .utf8)
    else {
      throw Exception(
        name: "UNKNOWN",
        description: "Failed to serialise final envelope to UTF-8.",
        code: "UNKNOWN"
      )
    }

    return finalString
  }
}
