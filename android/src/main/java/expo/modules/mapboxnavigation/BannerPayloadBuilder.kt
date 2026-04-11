package expo.modules.mapboxnavigation

import android.os.Bundle
import com.mapbox.api.directions.v5.models.BannerInstructions
import com.mapbox.api.directions.v5.models.BannerText

/// Converts Mapbox banner instruction models into Android Bundle payloads
/// suitable for emission as JS events.
object BannerPayloadBuilder {

  fun build(banner: BannerInstructions): Bundle {
    val b = Bundle().apply {
      putDouble("distanceAlongStep", banner.distanceAlongGeometry())
      putBundle("primary", buildText(banner.primary()))
    }
    banner.secondary()?.let { b.putBundle("secondary", buildText(it)) }
    banner.sub()?.let { b.putBundle("sub", buildText(it)) }
    return b
  }

  fun buildText(bt: BannerText): Bundle {
    return Bundle().apply {
      putString("text", bt.text())
      bt.type()?.let { putString("type", it) }
      bt.modifier()?.let { putString("modifier", it) }
      bt.degrees()?.let { putDouble("degrees", it) }
      val components = bt.components() ?: emptyList()
      val componentList = ArrayList<Bundle>(components.size)
      for (c in components) {
        componentList.add(Bundle().apply {
          putString("text", c.text())
          c.type()?.let { putString("type", it) }
          c.abbreviation()?.let { putString("abbreviation", it) }
          c.abbreviationPriority()?.let { putInt("abbreviationPriority", it) }
        })
      }
      putParcelableArrayList("components", componentList)
    }
  }
}
