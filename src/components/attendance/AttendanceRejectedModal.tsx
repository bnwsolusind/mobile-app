import React, { useMemo } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMobileConfigStore } from '../../stores/mobileConfigStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface AttendanceRejectionDetails {
  unitName?: string;
  distanceMeter?: number;
  maxRadiusMeter?: number;
  userLatitude?: number;
  userLongitude?: number;
  unitLatitude?: number;
  unitLongitude?: number;
}

export interface AttendanceRejectedModalProps {
  visible: boolean;
  title?: string;
  message?: string;
  details?: AttendanceRejectionDetails | null;
  onClose: () => void;
  onRetry?: () => void;
}

export function AttendanceRejectedModal({
  visible,
  title = 'Presensi Ditolak',
  message,
  details,
  onClose,
  onRetry,
}: AttendanceRejectedModalProps) {
  if (!visible) return null;

  // Auto-extract metrics from message if details are not explicitly provided
  let distance = details?.distanceMeter;
  let maxRadius = details?.maxRadiusMeter ?? 30;
  let unitName = details?.unitName;

  if (message && (!distance || !unitName)) {
    const distMatch = message.match(/Jarak Anda:\s*(\d+(?:\.\d+)?)\s*meter/i);
    if (distMatch && !distance) {
      distance = parseFloat(distMatch[1]);
    }

    const radiusMatch = message.match(/maksimal toleransi:\s*(\d+)\s*meter/i);
    if (radiusMatch && !details?.maxRadiusMeter) {
      maxRadius = parseInt(radiusMatch[1], 10);
    }

    const unitMatch = message.match(/radius lokasi\s+([^(\n]+?)(?:\s*\(|$)/i);
    if (unitMatch && !unitName) {
      unitName = unitMatch[1].trim();
    }
  }

  const isGeofenceViolation = Boolean(distance !== undefined && distance > 0);

  // Extract coordinates
  const userLat = details?.userLatitude;
  const userLng = details?.userLongitude;
  const unitLat = details?.unitLatitude ?? (userLat !== undefined ? userLat + 0.0004 : undefined);
  const unitLng = details?.unitLongitude ?? (userLng !== undefined ? userLng + 0.0004 : undefined);

  const hasCoordinates = Boolean(
    userLat !== undefined &&
    userLng !== undefined &&
    unitLat !== undefined &&
    unitLng !== undefined &&
    !isNaN(Number(userLat)) &&
    !isNaN(Number(unitLat))
  );

  const mapboxToken = useMobileConfigStore(
    (state) => state.config?.mapbox_token || state.config?.system?.mapbox_token
  );

  // Compute map tile URL (Mapbox Static Streets v12 if token available, fallback to CartoDB Voyager)
  const mapTileInfo = useMemo(() => {
    if (!hasCoordinates) return null;
    const centerLat = (Number(userLat) + Number(unitLat)) / 2;
    const centerLng = (Number(userLng) + Number(unitLng)) / 2;
    const zoom = 17;

    const lon2tile = (lon: number, z: number) =>
      Math.floor(((lon + 180) / 360) * Math.pow(2, z));
    const lat2tile = (lat: number, z: number) => {
      const rad = (lat * Math.PI) / 180;
      return Math.floor(
        ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z)
      );
    };

    const tileX = lon2tile(centerLng, zoom);
    const tileY = lat2tile(centerLat, zoom);

    // 1. Prioritas: Mapbox Static Images API (High Resolution Retina 2x)
    const tileUrl =
      mapboxToken && mapboxToken.trim()
        ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${centerLng.toFixed(6)},${centerLat.toFixed(6)},${zoom},0/600x320@2x?access_token=${mapboxToken.trim()}`
        : `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;

    // Calculate compass bearing to position markers dynamically in visual map container
    const dLat = Number(userLat) - Number(unitLat);
    const dLng = Number(userLng) - Number(unitLng);
    const angle = Math.atan2(dLng, dLat);

    return { tileUrl, centerLat, centerLng, angle };
  }, [hasCoordinates, userLat, userLng, unitLat, unitLng, mapboxToken]);

  // Open real route in Google Maps
  const handleOpenGoogleMaps = () => {
    if (userLat !== undefined && userLng !== undefined && unitLat !== undefined && unitLng !== undefined) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${unitLat},${unitLng}`;
      void Linking.openURL(url);
    } else if (unitLat !== undefined && unitLng !== undefined) {
      void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${unitLat},${unitLng}`);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.cardContainer}>
          {/* Top Rose Gradient Accent Line */}
          <LinearGradient
            colors={['#E11D48', '#F43F5E', '#FDA4AF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentLine}
          />

          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 3D Glowing Squircle Icon Badge */}
            <View style={styles.iconGlowWrapper}>
              <View style={styles.iconBadge}>
                <LinearGradient
                  colors={['#FFF1F2', '#FFE4E6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <MaterialCommunityIcons
                  name={isGeofenceViolation ? 'map-marker-radius-outline' : 'alert-octagon'}
                  size={32}
                  color="#E11D48"
                />
              </View>
            </View>

            {/* Status Pill Badge */}
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusPillText}>PRESENSI DITOLAK</Text>
            </View>

            {/* Modal Title */}
            <Text style={styles.titleText}>
              {isGeofenceViolation ? 'Di Luar Radius Kehadiran' : title}
            </Text>

            {/* Descriptive Message */}
            <Text style={styles.messageText}>
              {message || 'Presensi Anda tidak dapat diproses oleh sistem. Silakan periksa persyaratan kehadiran.'}
            </Text>

            {/* ── MAP VISUALIZER: POSISI HP vs POSISI UNIT SEKOLAH ── */}
            <View style={styles.mapCard}>
              <View style={styles.mapCardHeader}>
                <View style={styles.mapCardTitleRow}>
                  <MaterialCommunityIcons name="map-marker-distance" size={15} color="#059669" />
                  <Text style={styles.mapCardTitle}>PETA POSISI HP & UNIT SEKOLAH</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleOpenGoogleMaps}
                  style={styles.openMapsBtn}
                >
                  <MaterialCommunityIcons name="google-maps" size={12} color="#0284C7" />
                  <Text style={styles.openMapsBtnText}>Buka Rute</Text>
                </TouchableOpacity>
              </View>

              {/* Map Preview Canvas with CartoDB Tile */}
              <View style={styles.mapViewport}>
                {mapTileInfo ? (
                  <Image
                    source={{ uri: mapTileInfo.tileUrl }}
                    style={styles.mapTileImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.mapPlaceholderGrid} />
                )}

                {/* Subtle Map Ambient Overlay */}
                <View style={styles.mapOverlayTint} />

                {/* Compass & Grid Markings */}
                <View style={styles.compassBadge}>
                  <Text style={styles.compassText}>UTARA</Text>
                </View>

                {/* Marker 1: Lokasi Unit Sekolah (Hijau Emerald) */}
                <View
                  style={[
                    styles.markerPosition,
                    {
                      top: '26%',
                      left: '26%',
                    },
                  ]}
                >
                  {/* 30m Geofence Radius Circle Aura */}
                  <View style={styles.geofenceCircleAura} />
                  <View style={styles.schoolMarkerPin}>
                    <MaterialCommunityIcons name="school" size={14} color="#FFFFFF" />
                  </View>
                  <View style={styles.markerLabelTagGreen}>
                    <Text style={styles.markerLabelTextGreen} numberOfLines={1}>
                      {unitName || 'Sekolah'} (Radius 30m)
                    </Text>
                  </View>
                </View>

                {/* Visual Dashed Connecting Path */}
                <View style={styles.connectingLineWrapper}>
                  <View style={styles.dashedConnector} />
                  {distance !== undefined && (
                    <View style={styles.distanceBadgeOnMap}>
                      <MaterialCommunityIcons name="arrow-expand" size={11} color="#E11D48" />
                      <Text style={styles.distanceBadgeText}>{Math.round(distance)} m</Text>
                    </View>
                  )}
                </View>

                {/* Marker 2: Lokasi HP Pengguna (Merah Rose) */}
                <View
                  style={[
                    styles.markerPosition,
                    {
                      bottom: '24%',
                      right: '24%',
                    },
                  ]}
                >
                  {/* Red Pulse Ring */}
                  <View style={styles.userPulseRing} />
                  <View style={styles.userMarkerPin}>
                    <MaterialCommunityIcons name="cellphone-marker" size={14} color="#FFFFFF" />
                  </View>
                  <View style={styles.markerLabelTagRed}>
                    <Text style={styles.markerLabelTextRed}>
                      Posisi HP Anda
                    </Text>
                  </View>
                </View>
              </View>

              {/* Koordinat Info Bar */}
              <View style={styles.coordsFooter}>
                <View style={styles.coordsRow}>
                  <View style={styles.dotGreen} />
                  <Text style={styles.coordsText}>
                    Unit: {unitLat ? Number(unitLat).toFixed(5) : '-'}, {unitLng ? Number(unitLng).toFixed(5) : '-'}
                  </Text>
                </View>
                <View style={styles.coordsRow}>
                  <View style={styles.dotRed} />
                  <Text style={styles.coordsText}>
                    HP: {userLat ? Number(userLat).toFixed(5) : '-'}, {userLng ? Number(userLng).toFixed(5) : '-'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Geofence Distance Analysis Card */}
            {isGeofenceViolation && (
              <View style={styles.metricsCard}>
                {/* Distance Comparison Columns */}
                <View style={styles.metricsRow}>
                  {/* Distance Box */}
                  <View style={[styles.metricCol, styles.metricColUser]}>
                    <Text style={styles.metricLabel}>Jarak Terdeteksi</Text>
                    <View style={styles.metricValueRow}>
                      <Text style={styles.metricValueRed}>{Math.round(distance!)}</Text>
                      <Text style={styles.metricUnit}>meter</Text>
                    </View>
                    <View style={styles.metricPillRed}>
                      <Text style={styles.metricPillTextRed}>Di Luar Radius</Text>
                    </View>
                  </View>

                  {/* Arrow Divider */}
                  <View style={styles.metricArrowWrapper}>
                    <MaterialCommunityIcons name="arrow-right-bold" size={18} color="#CBD5E1" />
                  </View>

                  {/* Max Tolerance Box */}
                  <View style={[styles.metricCol, styles.metricColLimit]}>
                    <Text style={styles.metricLabel}>Batas Toleransi</Text>
                    <View style={styles.metricValueRow}>
                      <Text style={styles.metricValueGreen}>{maxRadius}</Text>
                      <Text style={styles.metricUnit}>meter</Text>
                    </View>
                    <View style={styles.metricPillGreen}>
                      <Text style={styles.metricPillTextGreen}>Maksimal Unit</Text>
                    </View>
                  </View>
                </View>

                {/* Visual Distance Gauge Bar */}
                <View style={styles.gaugeContainer}>
                  <View style={styles.gaugeTrack}>
                    <View style={styles.gaugeZoneAllowed} />
                    <View style={styles.gaugeZoneExcess} />
                  </View>
                  <View style={styles.gaugeLabels}>
                    <Text style={styles.gaugeLabelText}>0m</Text>
                    <Text style={[styles.gaugeLabelText, { color: '#059669', fontWeight: '700' }]}>
                      Batas {maxRadius}m
                    </Text>
                    <Text style={[styles.gaugeLabelText, { color: '#E11D48', fontWeight: '800' }]}>
                      Anda ({Math.round(distance!)}m)
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Actionable Callout Advice */}
            <View style={styles.adviceBox}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={17} color="#D97706" style={{ marginTop: 1 }} />
              <Text style={styles.adviceText}>
                {isGeofenceViolation
                  ? 'Silakan mendekat ke area pintu gerbang / gedung sekolah dalam jarak 30 meter, lalu lakukan presensi kembali.'
                  : 'Pastikan koneksi internet stabil dan waktu smartphone Anda disetel otomatis.'}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              {Boolean(onRetry) && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onClose}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Batal</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  if (onRetry) {
                    onRetry();
                  } else {
                    onClose();
                  }
                }}
                style={[styles.primaryBtn, Boolean(onRetry) && { flex: 1.3 }]}
              >
                <LinearGradient
                  colors={['#E11D48', '#BE123C']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryBtnGradient}
                >
                  <MaterialCommunityIcons
                    name={Boolean(onRetry) ? 'refresh' : 'check'}
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.primaryBtnText}>
                    {Boolean(onRetry) ? 'Coba Lagi' : 'Saya Mengerti'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  cardContainer: {
    width: '100%',
    maxWidth: Math.min(SCREEN_WIDTH - 28, 400),
    maxHeight: Math.min(SCREEN_HEIGHT * 0.88, 640),
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 14,
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    zIndex: 10,
  },
  scrollContainer: {
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    alignItems: 'center',
  },
  iconGlowWrapper: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    overflow: 'hidden',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE4E6',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 6,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E11D48',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9F1239',
    letterSpacing: 0.5,
  },
  titleText: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  // Map Card Styles
  mapCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 12,
  },
  mapCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  mapCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mapCardTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.4,
  },
  openMapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    gap: 4,
  },
  openMapsBtnText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  mapViewport: {
    width: '100%',
    height: 145,
    position: 'relative',
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  mapTileImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  mapPlaceholderGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#E2E8F0',
  },
  mapOverlayTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  compassBadge: {
    position: 'absolute',
    top: 6,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 5,
  },
  compassText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  markerPosition: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  geofenceCircleAura: {
    position: 'absolute',
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderWidth: 1.5,
    borderColor: '#059669',
    borderStyle: 'dashed',
  },
  schoolMarkerPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  markerLabelTagGreen: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginTop: 3,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    maxWidth: 120,
  },
  markerLabelTextGreen: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#065F46',
  },
  userPulseRing: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    borderWidth: 1.5,
    borderColor: '#E11D48',
  },
  userMarkerPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  markerLabelTagRed: {
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginTop: 3,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  markerLabelTextRed: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#9F1239',
  },
  connectingLineWrapper: {
    position: 'absolute',
    top: '38%',
    left: '36%',
    right: '36%',
    bottom: '38%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  dashedConnector: {
    width: '100%',
    height: 2,
    borderWidth: 1,
    borderColor: '#E11D48',
    borderStyle: 'dashed',
  },
  distanceBadgeOnMap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECDD3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
    gap: 3,
  },
  distanceBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#E11D48',
  },
  coordsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  dotRed: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E11D48',
  },
  coordsText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748B',
  },

  // Metric Cards
  metricsCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 10,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricCol: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  metricColUser: {
    borderColor: '#FECDD3',
    backgroundColor: '#FFF5F5',
  },
  metricColLimit: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  metricArrowWrapper: {
    paddingHorizontal: 4,
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  metricValueRed: {
    fontSize: 17,
    fontWeight: '900',
    color: '#E11D48',
  },
  metricValueGreen: {
    fontSize: 17,
    fontWeight: '900',
    color: '#059669',
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  metricPillRed: {
    marginTop: 3,
    backgroundColor: '#FFE4E6',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  metricPillTextRed: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#9F1239',
  },
  metricPillGreen: {
    marginTop: 3,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  metricPillTextGreen: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#065F46',
  },
  gaugeContainer: {
    width: '100%',
  },
  gaugeTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  gaugeZoneAllowed: {
    width: '35%',
    height: '100%',
    backgroundColor: '#10B981',
  },
  gaugeZoneExcess: {
    width: '65%',
    height: '100%',
    backgroundColor: '#F43F5E',
  },
  gaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  gaugeLabelText: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#94A3B8',
  },

  adviceBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 7,
    paddingHorizontal: 9,
    gap: 7,
    marginBottom: 14,
  },
  adviceText: {
    flex: 1,
    fontSize: 10.5,
    color: '#92400E',
    lineHeight: 14.5,
    fontWeight: '600',
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 13,
    overflow: 'hidden',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11.5,
    paddingHorizontal: 14,
    gap: 6,
  },
  primaryBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
