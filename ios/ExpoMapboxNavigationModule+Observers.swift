import Combine
@preconcurrency import MapboxNavigationCore

extension ExpoMapboxNavigationModule {
  // MARK: - Observer management

  /// Attaches Combine publishers for all navigation events.
  @MainActor
  func attachObservers(mapboxNavigation: MapboxNavigation) {
    let navigation = mapboxNavigation.navigation()

    navigation.routeProgress
      .sink { [weak self] progressState in
        guard let self, let progressState else { return }
        let progress = progressState.routeProgress
        let legProgress = progress.currentLegProgress
        let upcomingStep = legProgress.upcomingStep

        var payload: [String: Any] = [
          "distanceRemaining": progress.distanceRemaining,
          "durationRemaining": progress.durationRemaining,
          "fractionTraveled": progress.fractionTraveled,
          "currentLegIndex": progress.legIndex,
          "currentStepIndex": legProgress.stepIndex,
        ]

        if let speedLimit = legProgress.currentSpeedLimit {
          payload["speedLimit"] = [
            "speed": speedLimit.value,
            "unit": speedLimit.unit == .milesPerHour ? "mph" : "km/h",
          ] as [String: Any]
        }

        if let step = upcomingStep {
          var maneuver: [String: Any] = [
            "type": step.maneuverType.rawValue,
            "instruction": step.instructions,
          ]
          if let direction = step.maneuverDirection {
            maneuver["modifier"] = direction.rawValue
          }
          if let bearing = step.finalHeading {
            maneuver["bearingAfter"] = bearing
          }
          payload["upcomingManeuver"] = maneuver
        }

        if let streetName = legProgress.currentStep.names?.first {
          payload["currentStreetName"] = streetName
        }

        payload["distanceToNextTurn"] = legProgress.currentStepProgress.distanceRemaining

        let lanesArray = self.lanesPayload(from: legProgress.currentStep)
        if !lanesArray.isEmpty {
          payload["lanes"] = lanesArray
        }

        self.currentLegProgress = legProgress

        self.sendEvent("onRouteProgress", payload)

        // Emit onWaypointApproaching once per leg when within 500 m of the leg end.
        let legIndex = progress.legIndex
        let distanceToEndOfLeg = legProgress.distanceRemaining

        if distanceToEndOfLeg < 500 && self.lastApproachingLegIndex != legIndex {
          self.lastApproachingLegIndex = legIndex
          self.sendEvent("onWaypointApproaching", [
            "waypointIndex": legIndex + 1,
            "distanceRemaining": distanceToEndOfLeg,
          ])
        }
      }
      .store(in: &cancellables)

    // MARK: Location update
    navigation.locationMatching
      .sink { [weak self] state in
        guard let self else { return }
        let loc = state.mapMatchingResult.enhancedLocation
        let isOffRoad = state.mapMatchingResult.isOffRoad

        var payload: [String: Any] = [
          "latitude": loc.coordinate.latitude,
          "longitude": loc.coordinate.longitude,
          "matchState": isOffRoad ? "notMatched" : "matched",
        ]

        if loc.course >= 0 {
          payload["bearing"] = loc.course
        }
        if loc.speed >= 0 {
          payload["speed"] = loc.speed
        }
        if loc.horizontalAccuracy >= 0 {
          payload["accuracy"] = loc.horizontalAccuracy
        }

        self.sendEvent("onLocationUpdate", payload)

        if let speedValue = state.speedLimit.value {
          let sign: String = state.speedLimit.signStandard == .mutcd ? "mutcd" : "vienna"
          let unit: String = speedValue.unit == .milesPerHour ? "mph" : "km/h"
          let speedPayload: [String: Any] = [
            "speed": speedValue.value,
            "unit": unit,
            "sign": sign,
          ]
          self.sendEvent("onSpeedLimitUpdate", speedPayload)
        }
      }
      .store(in: &cancellables)

    // MARK: Voice instructions
    // voiceInstructions may deliver on a background queue; hop to main before sink
    // because AVSpeechSynthesizer.speak(_:) must be called from the main thread.
    navigation.voiceInstructions
      .receive(on: RunLoop.main)
      .sink { [weak self] state in
        guard let self else { return }
        let spoken = state.spokenInstruction
        var payload: [String: Any] = [
          "text": spoken.text,
          "distanceAlongStep": spoken.distanceAlongStep,
        ]
        if !spoken.ssmlText.isEmpty {
          payload["ssmlText"] = spoken.ssmlText
        }
        self.sendEvent("onVoiceInstruction", payload)
        if self.ttsState.enabled {
          self.speakInstruction(spoken.text)
        }
      }
      .store(in: &cancellables)

    // MARK: Banner instructions
    navigation.bannerInstructions
      .sink { [weak self] state in
        guard let self else { return }
        var bannerDict = self.bannerPayload(from: state.visualInstruction)
        if let step = self.currentLegProgress?.currentStep {
          let lanesArray = self.lanesPayload(from: step)
          if !lanesArray.isEmpty {
            bannerDict["lanes"] = lanesArray
          }
        }
        self.sendEvent("onBannerInstruction", bannerDict)
      }
      .store(in: &cancellables)

    // MARK: Rerouting
    // FetchingRoute is used as the off-route signal; v3 has no standalone offRoute publisher.
    navigation.rerouting
      .sink { [weak self] status in
        guard let self else { return }
        switch status.event {
        case is ReroutingStatus.Events.FetchingRoute:
          self.sendEvent("onOffRoute", [:])
          self.sendEvent("onRerouteStarted", [:])
        case is ReroutingStatus.Events.Fetched:
          self.sendEvent("onRerouteCompleted", [:])
        case let failed as ReroutingStatus.Events.Failed:
          let nsError = failed.error as NSError
          self.sendEvent("onRerouteFailed", [
            "code": "\(nsError.domain):\(nsError.code)",
            "message": nsError.localizedDescription,
          ])
        default:
          // Interrupted — no JS event for this yet.
          break
        }
      }
      .store(in: &cancellables)

    // MARK: Waypoint arrival
    navigation.waypointsArrival
      .sink { [weak self] status in
        guard let self else { return }
        switch status.event {
        case is WaypointArrivalStatus.Events.ToFinalDestination:
          self.sendEvent("onFinalDestinationArrived", [:])
        case let toWaypoint as WaypointArrivalStatus.Events.ToWaypoint:
          self.sendEvent("onWaypointArrived", [
            "waypointIndex": toWaypoint.legIndex + 1
          ])
        default:
          // NextLegStarted — no JS event.
          break
        }
      }
      .store(in: &cancellables)

    // MARK: Continuous alternatives
    navigation.continuousAlternatives
      .sink { [weak self] status in
        guard let self else { return }
        if let updated = status.event as? AlternativesStatus.Events.Updated {
          self.sendEvent("onContinuousAlternativesUpdated", [
            "alternativeCount": updated.actualAlternativeRoutes.count,
          ])
        }
      }
      .store(in: &cancellables)

    // MARK: Faster route
    navigation.fasterRoutes
      .sink { [weak self] status in
        guard let self else { return }
        if status.event is FasterRoutesStatus.Events.Detected {
          self.sendEvent("onFasterRouteAvailable", [:])
        }
      }
      .store(in: &cancellables)

    // MARK: Route refreshed
    navigation.routeRefreshing
      .sink { [weak self] status in
        guard let self else { return }
        if status.event is RefreshingStatus.Events.Refreshed {
          self.sendEvent("onRouteRefreshed", [:])
        }
      }
      .store(in: &cancellables)
  }

  /// Cancels all Combine subscriptions.
  func teardownObservers() async {
    cancellables.removeAll()
  }
}
