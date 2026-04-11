package expo.modules.mapboxnavigation

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/// Manages Text-To-Speech playback for navigation voice instructions.
/// Supports both the Android platform TTS engine and the Mapbox cloud speech API.
class TTSManager(private val context: Context) {

  data class TtsState(
    var enabled: Boolean = true,
    var volume: Float = 1.0f,
    var speechRate: Float = 1.0f,
    var voiceIdentifier: String? = null,
    var engine: String = "platform",  // "platform" | "mapbox"
  )

  var state = TtsState()
  private var accessTokenProvider: (() -> String?)? = null

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private var tts: TextToSpeech? = null
  private var ttsReady: Boolean = false
  private var mapboxMediaPlayer: MediaPlayer? = null

  fun setAccessTokenProvider(provider: () -> String?) {
    accessTokenProvider = provider
  }

  fun configure(optionsJson: String) {
    val json = try { org.json.JSONObject(optionsJson) } catch (e: Exception) {
      throw RuntimeException("configureTts: invalid JSON")
    }
    if (json.has("enabled")) state.enabled = json.getBoolean("enabled")
    if (json.has("volume")) state.volume = json.getDouble("volume").toFloat().coerceIn(0f, 1f)
    if (json.has("speechRate")) state.speechRate = json.getDouble("speechRate").toFloat().coerceIn(0.5f, 2f)
    if (json.has("voiceIdentifier")) {
      val id = json.getString("voiceIdentifier")
      state.voiceIdentifier = if (id.isEmpty()) null else id
    }
    if (json.has("engine")) {
      val e = json.getString("engine")
      if (e == "platform" || e == "mapbox") {
        state.engine = e
      }
    }
    // Apply live to the running TTS engine: mute cancels in-flight speech; new voice id
    // or rate take effect on the next utterance.
    if (!state.enabled) {
      tts?.stop()
    }
    tts?.setSpeechRate(state.speechRate)
    state.voiceIdentifier?.let { id ->
      tts?.language = Locale.forLanguageTag(id.replace('_', '-'))
    }
  }

  fun speakInstruction(text: String) {
    if (text.isEmpty()) return
    when (state.engine) {
      "mapbox" -> speakViaMapbox(text)
      else -> speakViaPlatform(text)
    }
  }

  fun speakViaPlatform(text: String) {
    if (tts == null) {
      tts = TextToSpeech(context.applicationContext) { status ->
        ttsReady = status == TextToSpeech.SUCCESS
        if (ttsReady) {
          tts?.setSpeechRate(state.speechRate)
          state.voiceIdentifier?.let { id ->
            tts?.language = Locale.forLanguageTag(id.replace('_', '-'))
          }
        }
      }
      tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {}
        override fun onDone(utteranceId: String?) {}
        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) {}
      })
    }
    if (ttsReady) {
      val params = Bundle().apply {
        putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, state.volume)
      }
      tts?.speak(text, TextToSpeech.QUEUE_FLUSH, params, "expo-mapbox-nav-${System.nanoTime()}")
    }
  }

  fun speakViaMapbox(text: String) {
    val token = accessTokenProvider?.invoke() ?: run { speakViaPlatform(text); return }
    val lang = (state.voiceIdentifier ?: Locale.getDefault().toLanguageTag()).replace('_', '-')
    val encoded = Uri.encode(text)
    val url = "https://api.mapbox.com/voice/v1/speak/$encoded?textType=text&language=$lang&outputFormat=mp3&access_token=$token"

    scope.launch(Dispatchers.IO) {
      try {
        // Clean up any previous player on the main thread before proceeding.
        withContext(Dispatchers.Main) {
          mapboxMediaPlayer?.release()
          mapboxMediaPlayer = null
        }

        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        if (connection.responseCode != 200) {
          connection.disconnect()
          throw IOException("HTTP ${connection.responseCode}")
        }

        val tempFile = File.createTempFile("mbx-speech-", ".mp3", context.cacheDir)
        connection.inputStream.use { input ->
          tempFile.outputStream().use { output ->
            input.copyTo(output)
          }
        }
        connection.disconnect()

        withContext(Dispatchers.Main) {
          val player = MediaPlayer()
          player.setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
          )
          player.setVolume(state.volume, state.volume)
          player.setDataSource(tempFile.absolutePath)
          player.setOnCompletionListener { mp ->
            mp.release()
            if (mapboxMediaPlayer === mp) mapboxMediaPlayer = null
            tempFile.delete()
          }
          player.setOnErrorListener { mp, _, _ ->
            mp.release()
            if (mapboxMediaPlayer === mp) mapboxMediaPlayer = null
            tempFile.delete()
            true
          }
          player.prepare()
          mapboxMediaPlayer = player
          player.start()
        }
      } catch (e: Exception) {
        Log.w("ExpoMapboxNav", "Mapbox speech failed, falling back to platform TTS: ${e.message}")
        withContext(Dispatchers.Main) {
          speakViaPlatform(text)
        }
      }
    }
  }

  fun shutdown() {
    tts?.stop()
    tts?.shutdown()
    tts = null
    ttsReady = false
    mapboxMediaPlayer?.release()
    mapboxMediaPlayer = null
  }
}
