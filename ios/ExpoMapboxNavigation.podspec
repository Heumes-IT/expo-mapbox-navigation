require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoMapboxNavigation'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Mike-Heumes/expo-mapbox-navigation' }

  # NOTE: Mapbox Navigation SDK v3 for iOS is distributed only via Swift
  # Package Manager. We declare it via React Native's spm_dependency helper
  # (available in react-native >= 0.75). This requires the consuming app to
  # use dynamic frameworks — set `useFrameworks: 'dynamic'` in
  # expo-build-properties or the equivalent in the Podfile. Static linkage
  # is incompatible with the SPM helper, so we cannot set
  # `s.static_framework = true` here.

  s.dependency 'ExpoModulesCore'

  spm_dependency(s,
    url: 'https://github.com/mapbox/mapbox-navigation-ios.git',
    requirement: { kind: 'upToNextMajorVersion', minimumVersion: '3.10.0' },
    products: ['MapboxNavigationCore']
  )

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
