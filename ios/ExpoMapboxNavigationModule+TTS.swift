import AVFoundation
import ExpoModulesCore

extension ExpoMapboxNavigationModule {
  // MARK: - TTS configuration

  /// Updates TTS state from a JSON options blob. Safe to call at any time without
  /// reallocating the navigation provider.
  func configureTts(optionsJson: String) async throws {
    guard let data = optionsJson.data(using: .utf8),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw Exception(
        name: "INVALID_INPUT",
        description: "configureTts: invalid JSON",
        code: "INVALID_INPUT"
      )
    }
    if let enabled = json["enabled"] as? Bool {
      ttsState.enabled = enabled
    }
    if let volume = json["volume"] as? Double {
      ttsState.volume = Float(max(0, min(1, volume)))
    }
    if let rate = json["speechRate"] as? Double {
      ttsState.speechRate = Float(max(0.5, min(2, rate)))
    }
    if let voiceId = json["voiceIdentifier"] as? String {
      ttsState.voiceIdentifier = voiceId.isEmpty ? nil : voiceId
    }
    if let engine = json["engine"] as? String {
      if engine == "platform" || engine == "mapbox" {
        ttsState.engine = engine
      }
    }
    // If TTS was just disabled, cancel any in-flight speech.
    if !ttsState.enabled {
      speechSynthesizer?.stopSpeaking(at: .immediate)
      stopMapboxAudio()
    }
  }

  // MARK: - TTS helpers

  /// Dispatches to the correct speech engine based on `ttsState.engine`.
  func speakInstruction(_ text: String) {
    switch ttsState.engine {
    case "mapbox":
      speakViaMapbox(text: text)
    default:
      speakViaPlatform(text: text)
    }
  }

  /// Speaks `text` via AVSpeechSynthesizer (platform engine), applying current TtsState settings.
  func speakViaPlatform(text: String) {
    if speechSynthesizer == nil {
      speechSynthesizer = AVSpeechSynthesizer()
      try? AVAudioSession.sharedInstance().setCategory(
        .playback,
        mode: .spokenAudio,
        options: [.duckOthers, .mixWithOthers]
      )
      try? AVAudioSession.sharedInstance().setActive(true)
    }
    let utterance = AVSpeechUtterance(string: text)
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate * ttsState.speechRate
    utterance.volume = ttsState.volume
    if let voiceId = ttsState.voiceIdentifier {
      utterance.voice = Self.bestVoice(forLanguage: voiceId)
    }
    speechSynthesizer?.speak(utterance)
  }

  /// Speaks `text` via the Mapbox Voice API (cloud engine).
  ///
  /// Makes an async HTTP request to:
  ///   https://api.mapbox.com/voice/v1/speak/<url-encoded-text>?textType=text&language=<locale>&outputFormat=mp3&access_token=<token>
  ///
  /// The Mapbox Voice API returns MP3 audio data which is played via AVAudioPlayer.
  /// On any failure (network error, bad credentials, API quota exceeded, audio decode error)
  /// the method falls back to `speakViaPlatform` so the user never hears silence.
  func speakViaMapbox(text: String) {
    guard let token = accessToken, !token.isEmpty else {
      // No token — silently fall back to platform engine.
      speakViaPlatform(text: text)
      return
    }

    mapboxSpeechTask?.cancel()
    mapboxSpeechTask = nil

    // Build the Mapbox Voice API URL:
    // https://api.mapbox.com/voice/v1/speak/<text>?textType=text&language=<locale>&outputFormat=mp3&access_token=<token>
    var pathCharacterSet = CharacterSet.urlPathAllowed
    pathCharacterSet.remove(charactersIn: "/")
    guard let encodedText = text.addingPercentEncoding(withAllowedCharacters: pathCharacterSet) else {
      speakViaPlatform(text: text)
      return
    }

    let language: String
    if let voiceId = ttsState.voiceIdentifier, !voiceId.isEmpty {
      language = voiceId
    } else {
      language = Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
    }

    var components = URLComponents()
    components.scheme = "https"
    components.host = "api.mapbox.com"
    components.path = "/voice/v1/speak/\(encodedText)"
    components.queryItems = [
      URLQueryItem(name: "textType", value: "text"),
      URLQueryItem(name: "language", value: language),
      URLQueryItem(name: "outputFormat", value: "mp3"),
      URLQueryItem(name: "access_token", value: token),
    ]

    guard let url = components.url else {
      speakViaPlatform(text: text)
      return
    }

    let volume = ttsState.volume

    let task = URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self else { return }
        guard self.ttsState.enabled else { return }

        if let error = error as NSError?, error.code == NSURLErrorCancelled {
          return
        }

        guard error == nil,
              let data = data, !data.isEmpty
        else {
          print("[ExpoMapboxNavigation] Mapbox speech request failed (\(error?.localizedDescription ?? "no data")), falling back to platform TTS")
          self.speakViaPlatform(text: text)
          return
        }

        if let httpResponse = response as? HTTPURLResponse, !(200..<300).contains(httpResponse.statusCode) {
          print("[ExpoMapboxNavigation] Mapbox speech API returned HTTP \(httpResponse.statusCode), falling back to platform TTS")
          self.speakViaPlatform(text: text)
          return
        }

        self.mapboxAudioPlayer?.stop()
        self.mapboxAudioPlayer = nil

        do {
          try? AVAudioSession.sharedInstance().setCategory(
            .playback,
            mode: .spokenAudio,
            options: [.duckOthers, .mixWithOthers]
          )
          try? AVAudioSession.sharedInstance().setActive(true)

          let player = try AVAudioPlayer(data: data)
          player.volume = volume
          player.prepareToPlay()
          player.play()
          self.mapboxAudioPlayer = player
        } catch {
          print("[ExpoMapboxNavigation] AVAudioPlayer failed to initialise for Mapbox speech (\(error.localizedDescription)), falling back to platform TTS")
          self.speakViaPlatform(text: text)
        }
      }
    }

    mapboxSpeechTask = task
    task.resume()
  }

  /// Stops and clears any in-flight Mapbox speech request and audio player.
  func stopMapboxAudio() {
    mapboxSpeechTask?.cancel()
    mapboxSpeechTask = nil
    mapboxAudioPlayer?.stop()
    mapboxAudioPlayer = nil
  }

  /// Returns the highest-quality installed `AVSpeechSynthesisVoice` for the given language.
  /// Preference order: Premium (iOS 16+ neural) → Enhanced (downloadable) → Default.
  /// Falls back to `AVSpeechSynthesisVoice(language:)` if no match is found, letting the
  /// system pick its default for that locale.
  static func bestVoice(forLanguage language: String) -> AVSpeechSynthesisVoice? {
    let matches = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == language }
    if matches.isEmpty {
      return AVSpeechSynthesisVoice(language: language)
    }
    if #available(iOS 16.0, *) {
      if let premium = matches.first(where: { $0.quality == .premium }) {
        return premium
      }
    }
    if let enhanced = matches.first(where: { $0.quality == .enhanced }) {
      return enhanced
    }
    return matches.first ?? AVSpeechSynthesisVoice(language: language)
  }
}
