/**
 * TTS playback engine:
 *   - `'platform'` (default): native platform TTS — `AVSpeechSynthesizer` on iOS,
 *     `android.speech.tts.TextToSpeech` on Android. Offline, free, quality varies by
 *     installed voices.
 *   - `'mapbox'`: Mapbox's cloud speech engine — fetches rendered MP3 audio per
 *     instruction. Higher quality and consistent across platforms, but requires
 *     network connectivity and consumes Mapbox API credits. Falls back to platform
 *     TTS when the network call fails.
 */
export type TtsEngine = 'platform' | 'mapbox';

/**
 * TTS configuration. All fields are optional; unset fields preserve the current value.
 * Calling `configureTts` before a session is started stores the config and it is applied
 * on the next `startActiveGuidance`.
 */
export interface ConfigureTtsOptions {
  /** Default true. When false, JS still receives `onVoiceInstruction` events but the native speaker is muted. */
  enabled?: boolean;
  /** 0.0–1.0. Maps to AVAudioSession on iOS and the Android audio stream volume. */
  volume?: number;
  /** 0.5–2.0. Playback rate multiplier. */
  speechRate?: number;
  /**
   * Preferred voice identifier. Platform-specific:
   *   - iOS: an AVSpeechSynthesisVoice language/identifier (e.g., "en-US").
   *   - Android: a TextToSpeech Locale tag (e.g., "en_US").
   * Unset = device default. Ignored when `engine` is `'mapbox'`.
   */
  voiceIdentifier?: string;
  /** Default 'platform'. Selects the TTS playback engine. */
  engine?: TtsEngine;
}
