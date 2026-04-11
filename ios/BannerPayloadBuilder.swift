import MapboxDirections
@preconcurrency import MapboxNavigationCore

extension ExpoMapboxNavigationModule {
  // MARK: - Banner instruction payload

  /// Builds a lanes array from the last intersection of `step`.
  /// Each entry is `{ indications: [String], valid: Bool, active: Bool }`.
  func lanesPayload(from step: RouteStep) -> [[String: Any]] {
    guard let intersections = step.intersections,
          let intersection = intersections.last,
          let approachLanes = intersection.approachLanes,
          !approachLanes.isEmpty else { return [] }

    let usable = intersection.usableApproachLanes ?? IndexSet()
    return approachLanes.enumerated().map { (index, lane) in
      var indications: [String] = []
      if lane.contains(.sharpLeft)   { indications.append("sharp left") }
      if lane.contains(.left)        { indications.append("left") }
      if lane.contains(.slightLeft)  { indications.append("slight left") }
      if lane.contains(.straightAhead) { indications.append("straight") }
      if lane.contains(.slightRight) { indications.append("slight right") }
      if lane.contains(.right)       { indications.append("right") }
      if lane.contains(.sharpRight)  { indications.append("sharp right") }
      if lane.contains(.uTurn)       { indications.append("uturn") }
      let isValid = usable.contains(index)
      return [
        "indications": indications,
        "valid": isValid,
        "active": isValid,
      ] as [String: Any]
    }
  }

  /// Converts a `VisualInstructionBanner` into the JS `BannerInstruction` shape.
  /// `secondary` and `sub` keys are omitted when nil.
  func bannerPayload(from banner: VisualInstructionBanner) -> [String: Any] {
    var dict: [String: Any] = [
      "distanceAlongStep": banner.distanceAlongStep,
      "primary": visualInstructionDict(from: banner.primaryInstruction),
    ]
    if let secondary = banner.secondaryInstruction {
      dict["secondary"] = visualInstructionDict(from: secondary)
    }
    if let tertiary = banner.tertiaryInstruction {
      dict["sub"] = visualInstructionDict(from: tertiary)
    }
    return dict
  }

  /// Converts a `VisualInstruction` into a dict matching `VisualInstruction` TS shape.
  func visualInstructionDict(from vi: VisualInstruction) -> [String: Any] {
    var dict: [String: Any] = [
      "components": vi.components.map { componentDict(from: $0) }
    ]
    if let text = vi.text { dict["text"] = text }
    if let type = vi.maneuverType { dict["type"] = type.rawValue }
    if let modifier = vi.maneuverDirection { dict["modifier"] = modifier.rawValue }
    if let degrees = vi.finalHeading { dict["degrees"] = degrees }
    return dict
  }

  /// Converts a `VisualInstruction.Component` into a plain dict.
  func componentDict(from component: VisualInstruction.Component) -> [String: Any] {
    switch component {
    case let .text(text: textRep):
      return buildTextRepDict(textRep, type: "text")
    case let .delimiter(text: textRep):
      return buildTextRepDict(textRep, type: "delimiter")
    case let .image(image: _, alternativeText: textRep):
      return buildTextRepDict(textRep, type: "image")
    case let .guidanceView(image: _, alternativeText: textRep):
      return buildTextRepDict(textRep, type: "guidance-view")
    case let .exit(text: textRep):
      return buildTextRepDict(textRep, type: "exit")
    case let .exitCode(text: textRep):
      return buildTextRepDict(textRep, type: "exit-number")
    case let .lane(indications: _, isUsable: isUsable, preferredDirection: _):
      return ["type": "lane", "isUsable": isUsable]
    }
  }

  func buildTextRepDict(_ rep: VisualInstruction.Component.TextRepresentation, type: String) -> [String: Any] {
    var d: [String: Any] = ["type": type, "text": rep.text]
    if let abbr = rep.abbreviation { d["abbreviation"] = abbr }
    if let pri = rep.abbreviationPriority { d["abbreviationPriority"] = pri }
    return d
  }
}
