import { useEffect, useState, useCallback } from 'react';
import MapboxNavigation, { ExpoMapboxNavigationNative, MapboxNavigationMapView } from '@heumes-it/expo-mapbox-navigation';
import { useEvent } from 'expo';
import type { DirectionsResponse } from '@heumes-it/expo-mapbox-navigation';
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// REPLACE LOCALLY BEFORE RUNNING — do not commit a real token.
const MAPBOX_PUBLIC_TOKEN: string = 'pk.REPLACE_ME';

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const [lastResponse, setLastResponse] = useState<DirectionsResponse | null>(null);
  const [devVisible, setDevVisible] = useState(false);
  const [devLog, setDevLog] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsEngine, setTtsEngine] = useState<'platform' | 'mapbox'>('platform');

  // Event hooks
  const routeProgress = useEvent(ExpoMapboxNavigationNative as any, 'onRouteProgress') as any;
  const locationUpdate = useEvent(ExpoMapboxNavigationNative as any, 'onLocationUpdate') as any;
  const sessionState = useEvent(ExpoMapboxNavigationNative as any, 'onSessionStateChange') as any;
  const bannerInstruction = useEvent(ExpoMapboxNavigationNative as any, 'onBannerInstruction') as any;
  const speedLimitUpdate = useEvent(ExpoMapboxNavigationNative as any, 'onSpeedLimitUpdate') as any;

  const isActive = sessionState?.state === 'activeGuidance' || sessionState?.state === 'freeDrive';
  const isNavigating = sessionState?.state === 'activeGuidance';

  // --- Boot: set token + start free drive ---
  useEffect(() => {
    if (MAPBOX_PUBLIC_TOKEN && MAPBOX_PUBLIC_TOKEN !== 'pk.REPLACE_ME') {
      MapboxNavigation.setAccessToken(MAPBOX_PUBLIC_TOKEN);
      MapboxNavigation.configureTts({ voiceIdentifier: 'nl-NL' }).catch(() => {});
      // Auto-start free drive after a short delay to let the native module init
      setTimeout(async () => {
        const perm = await MapboxNavigation.requestLocationPermission();
        if (perm === 'granted') {
          await MapboxNavigation.startFreeDrive();
        }
      }, 500);
    }
  }, []);

  // Keep screen on during navigation
  useEffect(() => {
    MapboxNavigation.setKeepScreenOn(isActive);
  }, [isActive]);

  // --- Handlers ---
  const onRequestRoutes = useCallback(async () => {
    setDevLog('Requesting routes…');
    try {
      // Get current location — try the live event first, fall back to native sync call
      let lat = locationUpdate?.latitude;
      let lng = locationUpdate?.longitude;
      if (!lat || !lng) {
        try {
          const loc = await MapboxNavigation.getCurrentLocation();
          lat = loc?.latitude;
          lng = loc?.longitude;
        } catch {}
      }
      if (!lat || !lng) {
        setDevLog('No GPS location yet — start free drive first');
        return;
      }
      const result = await MapboxNavigation.requestRoutes({
        waypoints: [
          { latitude: lat, longitude: lng, name: 'Current Location' },
          { latitude: 52.3676, longitude: 4.9041, name: 'Dam Square' },
          { latitude: 52.3580, longitude: 4.8686, name: 'Vondelpark' },
        ],
        profile: 'driving-traffic',
        alternatives: true,
        steps: true,
        language: 'nl',
      });
      setLastResponse(result);
      const p = result.routes[0];
      setDevLog(`Route: ${(p.distance / 1000).toFixed(1)} km · ${Math.round(p.duration / 60)} min · ${result.routes.length - 1} alt(s)`);
    } catch (e: any) {
      setDevLog(`Error [${e.code ?? 'UNKNOWN'}]: ${e.message ?? e}`);
    }
  }, [locationUpdate?.latitude, locationUpdate?.longitude]);

  const onStart = useCallback(async () => {
    if (!lastResponse) {
      setDevLog('Request a route first');
      return;
    }
    try {
      await MapboxNavigation.startActiveGuidance({ response: lastResponse, simulate: true });
      setDevLog('Navigation started');
      setDevVisible(false);
    } catch (e: any) {
      setDevLog(`Start error: ${e.message ?? e}`);
    }
  }, [lastResponse]);

  const onStop = useCallback(async () => {
    await MapboxNavigation.stopNavigation().catch(() => {});
    await MapboxNavigation.startFreeDrive().catch(() => {});
    setDevLog('Stopped → free drive');
  }, []);

  // --- Derived data ---
  const distToTurn = routeProgress?.distanceToNextTurn;
  const distToTurnStr = distToTurn != null
    ? distToTurn >= 1000 ? `${(distToTurn / 1000).toFixed(1)} km` : `${Math.round(distToTurn)} m`
    : null;
  const currentSpeed = locationUpdate?.speed != null
    ? Math.round(locationUpdate.speed * 3.6)
    : null;
  const speedLimit = speedLimitUpdate;
  const streetName = routeProgress?.currentStreetName;
  const banner = bannerInstruction;
  const lanes = banner?.lanes as Array<{ indications: string[]; valid: boolean; active?: boolean }> | undefined;
  const remainingKm = routeProgress ? (routeProgress.distanceRemaining / 1000).toFixed(1) : null;
  const remainingMin = routeProgress ? Math.round(routeProgress.durationRemaining / 60) : null;
  const fraction = routeProgress?.fractionTraveled;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Full-screen map */}
      {isActive && (
        <MapboxNavigationMapView
          style={StyleSheet.absoluteFill}
          navigationCameraState="following"
          styleURL="mapbox://styles/mike-heumes/cmnvklx4j001801r36ne8dvd1"
          routeLineColor="#6728a1"
        />
      )}

      {/* Idle / no map state */}
      {!isActive && (
        <View style={styles.idleContainer}>
          <Text style={styles.idleText}>Starting free drive…</Text>
        </View>
      )}

      {/* === TOP: Instruction Banner === */}
      {isNavigating && banner && (
        <View style={styles.bannerContainer}>
          <View style={styles.bannerRow}>
            {distToTurnStr && (
              <Text style={styles.bannerDistance}>{distToTurnStr}</Text>
            )}
            <View style={styles.bannerTextContainer}>
              <Text style={styles.bannerPrimary} numberOfLines={1}>
                {banner.primary?.text ?? ''}
              </Text>
              {banner.secondary?.text ? (
                <Text style={styles.bannerSecondary} numberOfLines={1}>
                  {banner.secondary.text}
                </Text>
              ) : null}
            </View>
          </View>
          {/* Lane guidance */}
          {lanes && lanes.length > 0 && (
            <View style={styles.laneContainer}>
              {lanes.map((lane: any, i: number) => (
                <View
                  key={i}
                  style={[
                    styles.laneArrow,
                    lane.valid ? styles.laneValid : styles.laneInvalid,
                  ]}
                >
                  <Text style={[styles.laneText, lane.valid && styles.laneTextValid]}>
                    {laneIcon(lane.indications)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* === BOTTOM LEFT: Speed widget === */}
      {isActive && (
        <View style={styles.speedContainer}>
          {/* Speed limit sign */}
          {speedLimit && (
            <View style={[
              styles.speedLimitSign,
              speedLimit.sign === 'mutcd' ? styles.speedLimitMutcd : styles.speedLimitVienna,
            ]}>
              <Text style={styles.speedLimitValue}>{speedLimit.speed}</Text>
            </View>
          )}
          {/* Current speed */}
          {currentSpeed != null && (
            <View style={styles.currentSpeedBubble}>
              <Text style={styles.currentSpeedValue}>{currentSpeed}</Text>
              <Text style={styles.currentSpeedUnit}>km/h</Text>
            </View>
          )}
        </View>
      )}

      {/* === BOTTOM: Street name + progress bar === */}
      {isNavigating && (
        <View style={styles.bottomBar}>
          {streetName ? (
            <Text style={styles.streetName}>{streetName}</Text>
          ) : null}
          {remainingKm && remainingMin != null && (
            <View style={styles.etaRow}>
              <Text style={styles.etaText}>{remainingKm} km</Text>
              <Text style={styles.etaDot}> · </Text>
              <Text style={styles.etaText}>{remainingMin} min</Text>
              {fraction != null && (
                <>
                  <Text style={styles.etaDot}> · </Text>
                  <Text style={styles.etaText}>{Math.round(fraction * 100)}%</Text>
                </>
              )}
            </View>
          )}
        </View>
      )}

      {/* === FAB: Dev Settings === */}
      <Pressable style={styles.fab} onPress={() => setDevVisible(true)}>
        <Text style={styles.fabIcon}>⚙</Text>
      </Pressable>

      {/* === Dev Settings Modal === */}
      <Modal visible={devVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dev Settings</Text>
              <Pressable onPress={() => setDevVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.devLog}>{devLog || 'No log yet'}</Text>
              <Text style={styles.devState}>State: {sessionState?.state ?? 'idle'}</Text>

              <DevButton title="Request Route" onPress={onRequestRoutes} />
              <DevButton title="Start Navigation (simulated)" onPress={onStart} />
              <DevButton title="Stop Navigation" onPress={onStop} />
              <DevButton
                title={ttsEnabled ? 'Mute Voice' : 'Unmute Voice'}
                onPress={() => {
                  const next = !ttsEnabled;
                  setTtsEnabled(next);
                  MapboxNavigation.configureTts({ enabled: next });
                }}
              />
              <DevButton
                title={`Voice Engine: ${ttsEngine}`}
                onPress={() => {
                  const next = ttsEngine === 'platform' ? 'mapbox' : 'platform';
                  setTtsEngine(next);
                  MapboxNavigation.configureTts({ engine: next });
                }}
              />
              <DevButton
                title="Free Drive"
                onPress={async () => {
                  const perm = await MapboxNavigation.requestLocationPermission();
                  if (perm === 'granted') {
                    await MapboxNavigation.startFreeDrive();
                    setDevVisible(false);
                  }
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function laneIcon(indications: string[]): string {
  if (!indications || indications.length === 0) return '?';
  const map: Record<string, string> = {
    'left': '←',
    'slight left': '↰',
    'sharp left': '↲',
    'straight': '↑',
    'right': '→',
    'slight right': '↱',
    'sharp right': '↳',
    'uturn': '↩',
  };
  return indications.map(i => map[i] || i).join('');
}

function DevButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable style={styles.devButton} onPress={onPress}>
      <Text style={styles.devButtonText}>{title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },

  // Idle state
  idleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  idleText: {
    color: '#888',
    fontSize: 16,
  },

  // Banner (top)
  bannerContainer: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    backgroundColor: '#6728a1',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerDistance: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginRight: 14,
    minWidth: 70,
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerPrimary: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  bannerSecondary: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 2,
  },

  // Lane guidance
  laneContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    gap: 4,
  },
  laneArrow: {
    width: 36,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  laneValid: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  laneInvalid: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  laneText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.3)',
  },
  laneTextValid: {
    color: '#fff',
    fontWeight: '700',
  },

  // Speed widget (bottom-left)
  speedContainer: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  speedLimitSign: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedLimitVienna: {
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: '#d32f2f',
  },
  speedLimitMutcd: {
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#222',
    borderRadius: 8,
  },
  speedLimitValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#222',
  },
  currentSpeedBubble: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentSpeedValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  currentSpeedUnit: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    zIndex: 10,
  },
  streetName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  etaText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  etaDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  fabIcon: {
    fontSize: 22,
    color: '#fff',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e1e2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalClose: {
    color: '#888',
    fontSize: 22,
    paddingHorizontal: 8,
  },
  modalScroll: {
    padding: 16,
  },
  devLog: {
    color: '#aaa',
    fontSize: 13,
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  devState: {
    color: '#6728a1',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  devButton: {
    backgroundColor: '#6728a1',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  devButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
