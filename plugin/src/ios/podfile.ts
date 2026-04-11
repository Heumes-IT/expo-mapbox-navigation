/**
 * Pure mutator for the consuming app's iOS `Podfile`.
 *
 * Injects a `post_install` block that:
 *   1. Adds a build phase to the app target which copies SPM-built Mapbox
 *      binary XCFrameworks (MapboxCommon, MapboxCoreMaps, MapboxNavigationNative,
 *      Turf) into the app bundle's `Frameworks/` directory and re-signs them.
 *      Without this, `pod install` succeeds and `xcodebuild` succeeds, but the
 *      app crashes at launch with `Library not loaded:
 *      @rpath/MapboxCommon.framework/MapboxCommon` because CocoaPods does not
 *      automatically embed SPM-resolved binary frameworks for static-frameworks
 *      builds.
 *
 *   2. Patches `Pods-<target>/ExpoModulesProvider.swift` (which is auto-generated
 *      by `use_expo_modules!`) to use bare `import` statements instead of
 *      `internal import`. The auto-generated file uses `internal import`
 *      unconditionally; the prebuild `AppDelegate.swift` template still uses
 *      bare `import`. Under Xcode's strict Swift 6 mode this triggers
 *      "ambiguous implicit access level for import" errors. Normalising the
 *      provider's imports to bare `import` resolves the inconsistency without
 *      requiring users to hand-edit AppDelegate.swift after every prebuild.
 *
 * The mutator is idempotent — re-applying it produces the same Podfile.
 * Detection uses a sentinel comment string.
 *
 * NOTE on escaping: this string is a TypeScript template literal containing
 * Ruby code that contains bash code. To stop TypeScript from interpreting the
 * bash `${VAR}` references as template-literal interpolations, every such
 * `${...}` is escaped to `\${...}`. The Ruby `#{...}` interpolations are NOT
 * escaped because TypeScript doesn't recognise them.
 */

export const PODFILE_HOOK_MARKER = '# expo-mapbox-navigation: embed-spm-mapbox-frameworks';

const POST_INSTALL_BODY = `    ${PODFILE_HOOK_MARKER}
    # Embed SPM-resolved Mapbox binary XCFrameworks into the app bundle.
    installer.aggregate_targets.each do |aggregate_target|
      aggregate_target.user_project.targets.each do |target|
        next unless target.respond_to?(:product_type) && target.product_type == 'com.apple.product-type.application'

        phase_name = '[expo-mapbox-navigation] Embed SPM Mapbox frameworks'
        existing = target.shell_script_build_phases.find { |p| p.name == phase_name }
        target.build_phases.delete(existing) if existing

        phase = target.new_shell_script_build_phase(phase_name)
        phase.shell_script = <<~'SHELLSCRIPT'
          set -e
          SPM_ARTIFACTS_DIR="$(cd "\${BUILT_PRODUCTS_DIR}/../../../SourcePackages/artifacts" 2>/dev/null && pwd)"
          if [ -z "\$SPM_ARTIFACTS_DIR" ] || [ ! -d "\$SPM_ARTIFACTS_DIR" ]; then
            echo "[expo-mapbox-navigation] No SPM artifacts dir found; skipping embed"
            exit 0
          fi
          case "\${PLATFORM_NAME}" in
            iphonesimulator) SLICE="ios-arm64_x86_64-simulator" ;;
            iphoneos)        SLICE="ios-arm64" ;;
            *) echo "[expo-mapbox-navigation] Unknown PLATFORM_NAME=\${PLATFORM_NAME}; skipping"; exit 0 ;;
          esac
          APP_FRAMEWORKS_DIR="\${TARGET_BUILD_DIR}/\${WRAPPER_NAME}/Frameworks"
          mkdir -p "\$APP_FRAMEWORKS_DIR"
          find "\$SPM_ARTIFACTS_DIR" -type d -name "*.xcframework" | while IFS= read -r xcfw; do
            base=\$(basename "\$xcfw" .xcframework)
            case "\$base" in
              Mapbox*|Turf|_Mapbox*) ;;
              *) continue ;;
            esac
            fw="\$xcfw/\$SLICE/\${base}.framework"
            if [ ! -d "\$fw" ]; then
              fw="\$xcfw/ios-arm64/\${base}.framework"
            fi
            if [ ! -d "\$fw" ]; then
              echo "[expo-mapbox-navigation] WARNING: \${base}.xcframework has no slice for \${SLICE}; skipping"
              continue
            fi
            echo "[expo-mapbox-navigation] Embedding \${base}.framework"
            rsync -a --delete "\$fw/" "\$APP_FRAMEWORKS_DIR/\${base}.framework/"
            if [ -n "\${EXPANDED_CODE_SIGN_IDENTITY:-}" ]; then
              codesign --force --sign "\$EXPANDED_CODE_SIGN_IDENTITY" --preserve-metadata=identifier,entitlements,flags "\$APP_FRAMEWORKS_DIR/\${base}.framework" 2>/dev/null || true
            else
              codesign --force --sign - "\$APP_FRAMEWORKS_DIR/\${base}.framework" 2>/dev/null || true
            fi
          done
          touch "\${DERIVED_FILE_DIR}/expo-mapbox-navigation-embed.stamp"
        SHELLSCRIPT
        phase.run_only_for_deployment_postprocessing = '0'
        phase.output_paths = ['\${DERIVED_FILE_DIR}/expo-mapbox-navigation-embed.stamp']
        phase.always_out_of_date = '1'

        target.build_phases.delete(phase)
        embed_pods_phase_index = target.build_phases.find_index do |p|
          p.respond_to?(:name) && p.name == '[CP] Embed Pods Frameworks'
        end
        if embed_pods_phase_index
          target.build_phases.insert(embed_pods_phase_index + 1, phase)
        else
          target.build_phases << phase
        end
      end
      aggregate_target.user_project.save
    end

    # Patch ExpoModulesProvider.swift to use bare imports instead of \`internal
    # import\`. See file comment for rationale.
    Dir.glob(File.join(installer.sandbox.target_support_files_root, 'Pods-*', 'ExpoModulesProvider.swift')).each do |provider|
      contents = File.read(provider)
      patched = contents.gsub(/^internal import /, 'import ')
      if patched != contents
        File.write(provider, patched)
        puts "[expo-mapbox-navigation] Patched #{File.basename(provider)} to use bare imports"
      end
    end

    # Patch MapboxDirections Incident.swift: make \`alertCodes\` decoding optional.
    # MapboxNavigationNative (C++) v324.x sometimes serialises incidents without the
    # \`alertc_codes\` JSON key, but MapboxDirections (Swift) v3.21 decodes it as
    # required (\`container.decode\`). This causes a \`keyNotFound\` crash at runtime
    # on routes with traffic incidents (driving-traffic profile). Changing to
    # \`decodeIfPresent\` with an empty-set fallback matches the SDK\\'s own native
    # \`IncidentInfo.alertcCodes\` (non-nullable NSArray that can be empty).
    Dir.glob(File.join(installer.sandbox.root, 'SourcePackages', 'checkouts', '**', 'Incident.swift')).each do |incident_file|
      contents = File.read(incident_file)
      patched = contents.gsub(
        'try container.decode(Set<Int>.self, forKey: .alertCodes)',
        'try container.decodeIfPresent(Set<Int>.self, forKey: .alertCodes) ?? []'
      )
      if patched != contents
        File.write(incident_file, patched)
        puts "[expo-mapbox-navigation] Patched #{File.basename(incident_file)}: alertCodes decode → decodeIfPresent"
      end
    end
`;

/**
 * Find the index immediately AFTER the matching close-paren of a function
 * call that starts at `openIdx` (which must point at the `(` character).
 * Walks characters and counts paren depth, ignoring parens inside strings.
 *
 * Returns the index AFTER the matching `)`, or `-1` if no matching close is
 * found. Does not handle Ruby's heredocs or %{} string literals — only
 * straight `"..."` and `'...'` strings, which is sufficient for the Expo
 * Podfile's react_native_post_install call.
 */
function indexAfterMatchingParen(s: string, openIdx: number): number {
  if (s[openIdx] !== '(') return -1;
  let depth = 0;
  let inDouble = false;
  let inSingle = false;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    const prev = i > 0 ? s[i - 1] : '';
    if (inDouble) {
      if (ch === '"' && prev !== '\\') inDouble = false;
      continue;
    }
    if (inSingle) {
      if (ch === "'" && prev !== '\\') inSingle = false;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Inject the post-install block into a Podfile string. Idempotent — if the
 * marker is already present, returns the input unchanged.
 *
 * Strategy:
 *  - If there's an existing `react_native_post_install(...)` call, append our
 *    block immediately after its closing parenthesis (inside the same
 *    `post_install do` block). The closing paren is found by walking the
 *    string character by character and counting paren depth, so nested calls
 *    like `ccache_enabled?(podfile_properties)` don't confuse the match.
 *  - Otherwise, append a new `post_install do |installer|` block before the
 *    closing `end` of the target.
 */
export function applyMapboxPodfile(contents: string): string {
  if (contents.includes(PODFILE_HOOK_MARKER)) {
    return contents;
  }

  const callStart = contents.indexOf('react_native_post_install(');
  if (callStart !== -1) {
    const openParen = contents.indexOf('(', callStart);
    const afterClose = indexAfterMatchingParen(contents, openParen);
    if (afterClose === -1) {
      throw new Error(
        '[expo-mapbox-navigation] Found react_native_post_install but could not match its closing parenthesis.'
      );
    }
    return (
      contents.slice(0, afterClose) +
      `\n${POST_INSTALL_BODY}\n` +
      contents.slice(afterClose)
    );
  }

  // Fallback: add a new post_install block before the last `end`.
  const lastEnd = contents.lastIndexOf('\nend');
  if (lastEnd === -1) {
    throw new Error(
      '[expo-mapbox-navigation] Could not find a target end marker in Podfile to inject post_install block.'
    );
  }
  const injection = `\n  post_install do |installer|\n${POST_INSTALL_BODY}\n  end\n`;
  return contents.slice(0, lastEnd) + injection + contents.slice(lastEnd);
}
