package expo.modules.mapboxnavigation

import com.mapbox.common.MapboxOptions
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.MapboxNavigationProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Modules wrapper around Mapbox Navigation SDK v3 for Android.
 *
 * Skeleton: exposes a single `setAccessToken` function and lazily
 * constructs a `MapboxNavigation` instance to prove the SDK linked
 * correctly. Routing, events, voice, and the map view are added in
 * later plans.
 */
class ExpoMapboxNavigationModule : Module() {
  private var navigation: MapboxNavigation? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoMapboxNavigation")

    Function("setAccessToken") { token: String ->
      MapboxOptions.accessToken = token
      val context = appContext.reactContext
        ?: throw IllegalStateException(
          "ExpoMapboxNavigation: reactContext is null; setAccessToken must be called after the module is initialized."
        )
      if (navigation == null) {
        navigation = MapboxNavigationProvider.create(
          NavigationOptions.Builder(context).build()
        )
      }
    }
  }
}
