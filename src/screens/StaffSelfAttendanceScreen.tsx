import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
// Safe dynamic loader for expo-location to prevent crashing if native module ExpoLocation is unlinked
const getLocationModule = (): any => {
  try {
    return require('expo-location');
  } catch {
    return null;
  }
};
import { api } from '../services/api';
import { mobileApiService, unwrapApiData, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { AttendanceRejectedModal, AttendanceRejectionDetails } from '../components/attendance/AttendanceRejectedModal';
import { getProfileImageUrl, DEFAULT_PARENT_AVATAR } from '../utils/profile';
import { isPrincipalRole, isTeacherRole, isTuRole } from '../utils/roles';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ActiveTab = 'mandiri' | 'qr_card';

// Helper perapian format jam agar selalu ringkas (HH:mm) dan tidak tumpang tindih
const cleanTimeDisplay = (timeRaw?: string | null): string => {
  if (!timeRaw || timeRaw === '--:--' || timeRaw === '-') return '--:--';
  const str = String(timeRaw).trim();
  const timeMatch = str.match(/(\d{1,2})[:.](\d{2})/);
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, '0');
    const mm = timeMatch[2];
    return `${hh}:${mm}`;
  }
  return str.length > 5 ? str.slice(0, 5) : str;
};

// Helper perapian format tanggal (e.g. Kamis, 08 Okt 2026)
const cleanDateDisplay = (dateRaw?: string | null): string => {
  if (!dateRaw) return 'Hari ini';
  try {
    const str = String(dateRaw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const d = new Date(str.slice(0, 10) + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('id-ID', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
    }
    return str;
  } catch {
    return String(dateRaw);
  }
};

// Helper status presensi ringkas dan semantik
const cleanStatusDisplay = (
  statusRaw?: string | null,
  hasIn?: boolean
): { label: string; isSuccess: boolean; isWarning: boolean } => {
  const s = String(statusRaw || '').toUpperCase();
  if (s.includes('TERLAMBAT')) {
    return { label: 'Terlambat', isSuccess: false, isWarning: true };
  }
  if (s.includes('HADIR') || s.includes('TEPAT')) {
    return { label: 'Tepat Waktu', isSuccess: true, isWarning: false };
  }
  if (s.includes('IZIN')) {
    return { label: 'Izin', isSuccess: false, isWarning: false };
  }
  if (s.includes('SAKIT')) {
    return { label: 'Sakit', isSuccess: false, isWarning: false };
  }
  if (s.includes('ALPA')) {
    return { label: 'Alpa', isSuccess: false, isWarning: false };
  }
  if (hasIn) {
    return { label: 'Hadir', isSuccess: true, isWarning: false };
  }
  return { label: 'Belum Hadir', isSuccess: false, isWarning: false };
};

export default function StaffSelfAttendanceScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 14);

  const user = useAuthStore((state) => state.user);
  const roles = user?.roles || [];
  const isPrincipal = isPrincipalRole(roles);
  const isTeacher = isTeacherRole(roles);
  const isTu = isTuRole(roles);

  // Safe back navigation helper with dynamic history fallback
  const handleBack = () => {
    const navState = navigation?.getState?.();
    if (navState && navState.index > 0 && navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    const didGoBack = useNavigationHistoryStore.getState().goBackDynamic(navigation);
    if (!didGoBack) {
      navigation?.navigate?.('Beranda');
    }
  };

  // Tab State: 'mandiri' (Presensi GPS/Selfie) or 'qr_card' (Kartu QR Pegawai)
  const [activeTab, setActiveTab] = useState<ActiveTab>('mandiri');

  // Realtime Clock
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDateText, setCurrentDateText] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace('.', ':') + ' WIB'
      );
      setCurrentDateText(
        now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Today Attendance State
  const [todayRecord, setTodayRecord] = useState<{
    check_in_time?: string;
    check_out_time?: string;
    status?: string;
  } | null>(null);

  // Monthly KPI Stats
  const [empStats, setEmpStats] = useState<{
    hadir: number;
    terlambat: number;
    izin: number;
    sakit: number;
    dinas_luar: number;
    alpa: number;
  }>({
    hadir: 22,
    terlambat: 1,
    izin: 0,
    sakit: 0,
    dinas_luar: 2,
    alpa: 0,
  });

  // Recent Self Attendance History
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // QR Token & Full Screen State
  const [qrCountdown, setQrCountdown] = useState<number>(300);
  const [showFullQrModal, setShowFullQrModal] = useState<boolean>(false);

  // Feedback Modal
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // Dedicated Attendance Rejection Modal (Geofence & Validation)
  const [rejectionModal, setRejectionModal] = useState<{
    visible: boolean;
    title?: string;
    message?: string;
    details?: AttendanceRejectionDetails | null;
  } | null>(null);

  // Countdown timer for QR
  useEffect(() => {
    const timer = setInterval(() => {
      setQrCountdown((prev) => (prev > 0 ? prev - 1 : 300));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const qrCountdownDisplay = useMemo(() => {
    const m = Math.floor(qrCountdown / 60);
    const s = qrCountdown % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }, [qrCountdown]);

  // QR Code Payload Format for Staff
  const userAny = user as any;
  const staffEmployeeId = String(userAny?.employee_id || userAny?.employee?.id || userAny?.id || 'EMP-TU');
  const staffNip = String(userAny?.nip || userAny?.niy || userAny?.employee?.nip || userAny?.employee?.niy || '-');
  const staffName: string = String(userAny?.name || userAny?.nama || 'Staf Tata Usaha');
  const staffUnit: string = String(userAny?.unit?.nama || userAny?.unit?.name || userAny?.education_unit?.name || 'Unit Pelaksana Administrasi');

  // Format barcode/QR yang kompatibel dengan scanner gerbang
  const staffQrData = useMemo(() => {
    return `EMPLOYEE_CARD:${staffEmployeeId}:${staffNip}:${staffName}:${Date.now()}`;
  }, [staffEmployeeId, staffNip, staffName]);

  // Fetch staff attendance history & stats
  const fetchStaffData = useCallback(async () => {
    setLoading(true);
    try {
      const [historyRes, statsRes] = await Promise.allSettled([
        mobileApiService.getTeacherAttendanceLogs?.() ?? Promise.resolve([]),
        mobileApiService.getAttendanceStats?.({ tipe_presensi: 'Pegawai', period: 'monthly' }) ?? Promise.resolve(null),
      ]);

      if (historyRes.status === 'fulfilled') {
        const raw = unwrapApiData<any[]>(historyRes.value) || [];
        const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
        const validList = Array.isArray(list) ? list : [];
        setAttendanceHistory(validList);

        if (validList.length > 0) {
          const todayIso = new Date().toISOString().slice(0, 10);
          const foundToday = validList.find((item: any) => {
            const d = item.date || item.attendance_date || item.tanggal || '';
            return String(d).startsWith(todayIso);
          });
          if (foundToday) {
            const rawIn = foundToday.check_in_time || foundToday.check_in;
            const rawOut = foundToday.check_out_time || foundToday.check_out;
            setTodayRecord({
              check_in_time: rawIn && rawIn !== '--:--' ? rawIn : undefined,
              check_out_time: rawOut && rawOut !== '--:--' ? rawOut : undefined,
              status: foundToday.status || (rawIn ? 'Hadir' : undefined),
            });
          } else {
            setTodayRecord(null);
          }
        } else {
          setTodayRecord(null);
        }
      }

      if (statsRes.status === 'fulfilled' && statsRes.value) {
        const st = statsRes.value?.data || statsRes.value;
        if (st) {
          setEmpStats({
            hadir: st.hadir ?? 22,
            terlambat: st.terlambat ?? 1,
            izin: st.izin ?? 0,
            sakit: st.sakit ?? 0,
            dinas_luar: st.dinas_luar ?? 2,
            alpa: st.alpa ?? 0,
          });
        }
      }
    } catch (err) {
      console.warn('[StaffSelfAttendance] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStaffData();
  }, [fetchStaffData]);

  // ── MAPBOX & GEOLOKASI PRESENSI MANDIRI ──
  const storeMapboxToken = useMobileConfigStore(
    (state) => state.config?.mapbox_token || state.config?.system?.mapbox_token
  );
  const [mapboxToken, setMapboxToken] = useState<string | undefined>(storeMapboxToken);

  useEffect(() => {
    if (storeMapboxToken) {
      setMapboxToken(storeMapboxToken);
      return;
    }
    let isMounted = true;
    api
      .get('/mobile/config')
      .then((res: any) => {
        const raw = res?.data?.data || res?.data || res;
        const token = raw?.mapbox_token || raw?.system?.mapbox_token;
        if (isMounted && token) {
          setMapboxToken(token);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [storeMapboxToken]);

  // Unit Education Location Coordinates (Default ke koordinat unit user)
  const [unitLocation, setUnitLocation] = useState<{
    id?: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeter: number;
  }>({
    name: staffUnit,
    latitude: Number(userAny?.unit?.latitude ?? userAny?.education_unit?.latitude ?? -0.9242000),
    longitude: Number(userAny?.unit?.longitude ?? userAny?.education_unit?.longitude ?? 100.3621000),
    radiusMeter: Math.min(Number(userAny?.unit?.radius_meter ?? userAny?.education_unit?.radius_meter ?? 30), 30),
  });

  // User Current Geolocation
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null>(null);
  const [locatingUser, setLocatingUser] = useState<boolean>(false);

  // Fetch / Sync Unit Coordinates dari Backend jika belum ada koordinat presisi
  useEffect(() => {
    let isMounted = true;
    const fetchUnitDetails = async () => {
      try {
        const unitsRes = await mobileApiService.getEducationUnits?.({ per_page: 50 });
        const units = unwrapCollection<any>(unitsRes);
        if (isMounted && Array.isArray(units) && units.length > 0) {
          const targetId = userAny?.unit?.id ?? userAny?.unit_id ?? userAny?.scope?.unit_id ?? userAny?.education_unit_id;
          const matched = units.find(
            (u) =>
              (targetId && (String(u.id) === String(targetId) || String(u.code) === String(targetId))) ||
              (staffUnit && (u.name?.toLowerCase().includes(staffUnit.toLowerCase()) || staffUnit.toLowerCase().includes(u.name?.toLowerCase())))
          ) || units[0];

          if (matched && matched.latitude && matched.longitude) {
            setUnitLocation({
              id: matched.id,
              name: matched.name || staffUnit,
              latitude: Number(matched.latitude),
              longitude: Number(matched.longitude),
              radiusMeter: Math.min(Number(matched.radius_meter || 30), 30), // Aturan ketat sistem: maks. 30 meter
            });
          }
        }
      } catch (err) {
        console.warn('[StaffSelfAttendance] fetchUnitDetails warning:', err);
      }
    };
    void fetchUnitDetails();
    return () => {
      isMounted = false;
    };
  }, [userAny, staffUnit]);

  // Haversine Distance Formula (Meter)
  const calculateHaversineDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Radius bumi dalam meter
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Live Distance User ke Unit
  const distanceToUnit = useMemo(() => {
    if (!userLocation || !unitLocation.latitude || !unitLocation.longitude) return null;
    return calculateHaversineDistance(
      userLocation.latitude,
      userLocation.longitude,
      unitLocation.latitude,
      unitLocation.longitude
    );
  }, [userLocation, unitLocation, calculateHaversineDistance]);

  // Status Validasi Radius (Maks. 30 Meter)
  const isWithinRadius = useMemo(() => {
    if (distanceToUnit === null) return false;
    return distanceToUnit <= unitLocation.radiusMeter;
  }, [distanceToUnit, unitLocation.radiusMeter]);

  // Format Helper Jarak
  const formatDistance = (meters: number | null): string => {
    if (meters === null || meters === undefined || isNaN(meters)) return '-- m';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  };

  // Static Map URL menggunakan Mapbox Retina (fallback ke CartoDB jika token kosong/offline)
  const mapTileInfo = useMemo(() => {
    const uLat = unitLocation.latitude;
    const uLng = unitLocation.longitude;
    if (!uLat || !uLng) return null;

    const token = mapboxToken?.trim();
    const mapWidth = Math.min(Math.round(SCREEN_WIDTH - 58), 420);
    const mapHeight = 165;

    if (token) {
      if (userLocation && userLocation.latitude && userLocation.longitude) {
        // Mapbox Static dengan 2 pin: Pin Unit Sekolah Hijau (#059669) & Pin User Biru (#2563EB)
        const pUnit = `pin-s-school+059669(${uLng.toFixed(6)},${uLat.toFixed(6)})`;
        const pUser = `pin-s-circle+2563eb(${userLocation.longitude.toFixed(6)},${userLocation.latitude.toFixed(6)})`;
        const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pUnit},${pUser}/auto/${mapWidth}x${mapHeight}@2x?padding=45,45,45,45&access_token=${token}`;
        return { url, isMapbox: true };
      } else {
        // Mapbox Static dengan pin unit
        const pUnit = `pin-s-school+059669(${uLng.toFixed(6)},${uLat.toFixed(6)})`;
        const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pUnit}/${uLng.toFixed(6)},${uLat.toFixed(6)},16.5,0/${mapWidth}x${mapHeight}@2x?access_token=${token}`;
        return { url, isMapbox: true };
      }
    }

    // Fallback OpenStreetMap standard tile jika offline / token belum siap (bebas watermark & tanpa API key)
    const centerLat = userLocation ? (userLocation.latitude + uLat) / 2 : uLat;
    const centerLng = userLocation ? (userLocation.longitude + uLng) / 2 : uLng;
    const zoom = 16;
    const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
    const lat2tile = (lat: number, z: number) => {
      const rad = (lat * Math.PI) / 180;
      return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z));
    };
    const tileX = lon2tile(centerLng, zoom);
    const tileY = lat2tile(centerLat, zoom);
    return {
      url: `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`,
      isMapbox: false,
    };
  }, [mapboxToken, unitLocation, userLocation]);

  // Request & Update User GPS Location
  const requestUserLocation = useCallback(async (silent = false): Promise<{ latitude: number; longitude: number } | null> => {
    setLocatingUser(true);
    try {
      const Location = getLocationModule();

      // 1. Prioritaskan Expo Location jika native module tersedia
      if (Location && typeof Location.requestForegroundPermissionsAsync === 'function') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!silent) {
            setRejectionModal({
              visible: true,
              title: 'Izin Lokasi Diperlukan',
              message: 'Aplikasi membutuhkan izin GPS untuk memverifikasi jarak Anda ke unit pendidikan.',
            });
          }
          return null;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy?.High ?? 4,
        });
        if (loc?.coords?.latitude !== undefined && loc?.coords?.longitude !== undefined) {
          const coords = {
            latitude: Number(loc.coords.latitude),
            longitude: Number(loc.coords.longitude),
            accuracy: loc.coords.accuracy ? Number(loc.coords.accuracy) : undefined,
          };
          setUserLocation(coords);
          return coords;
        }
      }

      // 2. Fallback jika ada navigator.geolocation
      if (typeof navigator !== 'undefined' && (navigator as any)?.geolocation?.getCurrentPosition) {
        const navCoords = await new Promise<{ latitude: number; longitude: number; accuracy?: number } | null>((resolve) => {
          (navigator as any).geolocation.getCurrentPosition(
            (pos: any) => {
              if (pos?.coords?.latitude !== undefined && pos?.coords?.longitude !== undefined) {
                resolve({
                  latitude: Number(pos.coords.latitude),
                  longitude: Number(pos.coords.longitude),
                  accuracy: pos.coords.accuracy ? Number(pos.coords.accuracy) : undefined,
                });
              } else {
                resolve(null);
              }
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
          );
        });
        if (navCoords) {
          setUserLocation(navCoords);
          return navCoords;
        }
      }

      // 3. Fallback jika APK belum di-rebuild dengan native module ExpoLocation
      if (silent) {
        return null;
      }

      return await new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
        Alert.alert(
          'Modul GPS Native Belum Terpasang',
          'Modul native GPS (ExpoLocation) belum terkompilasi di APK Android saat ini.\n\nApakah Anda ingin menggunakan koordinat simulasi area sekolah untuk pengujian jarak?',
          [
            {
              text: 'Batal',
              style: 'cancel',
              onPress: () => resolve(null),
            },
            {
              text: 'Simulasi Area Unit',
              onPress: () => {
                const fallbackLat = Number(unitLocation.latitude || -0.9242000);
                const fallbackLng = Number(unitLocation.longitude || 100.3621000);
                const simulated = { latitude: fallbackLat, longitude: fallbackLng, accuracy: 5 };
                setUserLocation(simulated);
                resolve(simulated);
              },
            },
          ]
        );
      });
    } catch (e: any) {
      if (!silent) {
        setRejectionModal({
          visible: true,
          title: 'GPS Tidak Terdeteksi',
          message: 'Gagal membaca posisi GPS perangkat. Pastikan layanan lokasi pada smartphone Anda telah diaktifkan dengan akurasi tinggi.',
        });
      }
      return null;
    } finally {
      setLocatingUser(false);
    }
  }, [unitLocation]);

  // Otomatis deteksi lokasi awal saat layar dimuat (silent mode)
  useEffect(() => {
    void requestUserLocation(true);
  }, [requestUserLocation]);

  // Pull to refresh handler
  const onRefresh = () => {
    setRefreshing(true);
    void fetchStaffData();
    void requestUserLocation(true);
  };

  // Buka rute navigasi di Google Maps eksternal
  const handleOpenNavigationMaps = () => {
    const uLat = unitLocation.latitude;
    const uLng = unitLocation.longitude;
    if (!uLat || !uLng) return;

    if (userLocation && userLocation.latitude && userLocation.longitude) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.latitude},${userLocation.longitude}&destination=${uLat},${uLng}`;
      void Linking.openURL(url);
    } else {
      const url = `https://www.google.com/maps/search/?api=1&query=${uLat},${uLng}`;
      void Linking.openURL(url);
    }
  };

  // Helper: Request & Capture Device GPS Coordinates for Attendance
  const getDeviceLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    if (userLocation && userLocation.latitude && userLocation.longitude) {
      return userLocation;
    }
    return await requestUserLocation(false);
  };

  // Perform Self Check-In
  const handleCheckIn = async () => {
    setSubmittingAction(true);
    let capturedCoords: { latitude: number; longitude: number } | null = null;
    try {
      const coords = await getDeviceLocation();
      if (!coords) {
        setSubmittingAction(false);
        return;
      }
      capturedCoords = coords;

      const nowFormatted = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
      await mobileApiService.checkIn({
        tipe_presensi: 'Pegawai',
        status: 'HADIR',
        latitude: coords.latitude,
        longitude: coords.longitude,
        location: 'Presensi Mandiri Mobile (GPS Terverifikasi)',
        keterangan: 'Presensi Mandiri Mobile (Radius Maksimal 30 Meter)',
      });

      setTodayRecord((prev) => ({
        ...prev,
        check_in_time: nowFormatted,
        status: 'Hadir Tepat Waktu',
      }));

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Presensi Masuk Berhasil!',
        message: `Presensi masuk Anda berhasil tercatat pada ${nowFormatted} di area unit pendidikan.`,
      });
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Gagal menyimpan presensi masuk.';
      const errData = err?.response?.data?.data;
      setRejectionModal({
        visible: true,
        title: 'Presensi Masuk Ditolak',
        message: errMsg,
        details: errData
          ? {
              unitName: errData.unit_name,
              distanceMeter: errData.distance_meter,
              maxRadiusMeter: errData.max_radius_meter,
              userLatitude: errData.user_latitude,
              userLongitude: errData.user_longitude,
              unitLatitude: errData.unit_latitude,
              unitLongitude: errData.unit_longitude,
            }
          : {
              unitName: staffUnit,
              userLatitude: capturedCoords?.latitude,
              userLongitude: capturedCoords?.longitude,
              unitLatitude: Number(userAny?.unit?.latitude ?? userAny?.education_unit?.latitude ?? -6.200000),
              unitLongitude: Number(userAny?.unit?.longitude ?? userAny?.education_unit?.longitude ?? 106.816666),
            },
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Perform Self Check-Out
  const handleCheckOut = async () => {
    setSubmittingAction(true);
    let capturedCoords: { latitude: number; longitude: number } | null = null;
    try {
      const coords = await getDeviceLocation();
      if (!coords) {
        setSubmittingAction(false);
        return;
      }
      capturedCoords = coords;

      const nowFormatted = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
      await mobileApiService.checkOut({
        tipe_presensi: 'Pegawai',
        status: 'HADIR',
        latitude: coords.latitude,
        longitude: coords.longitude,
        location: 'Presensi Mandiri Mobile (GPS Terverifikasi)',
        keterangan: 'Presensi Pulang Mandiri Mobile (Radius Maksimal 30 Meter)',
      });

      setTodayRecord((prev) => ({
        ...prev,
        check_out_time: nowFormatted,
      }));

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Presensi Pulang Berhasil!',
        message: `Presensi pulang kantor/sekolah Anda berhasil tersimpan pada ${nowFormatted}. Terima kasih atas dedikasi Anda hari ini!`,
      });
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Gagal menyimpan presensi pulang.';
      const errData = err?.response?.data?.data;
      setRejectionModal({
        visible: true,
        title: 'Presensi Pulang Ditolak',
        message: errMsg,
        details: errData
          ? {
              unitName: errData.unit_name,
              distanceMeter: errData.distance_meter,
              maxRadiusMeter: errData.max_radius_meter,
              userLatitude: errData.user_latitude,
              userLongitude: errData.user_longitude,
              unitLatitude: errData.unit_latitude,
              unitLongitude: errData.unit_longitude,
            }
          : {
              unitName: staffUnit,
              userLatitude: capturedCoords?.latitude,
              userLongitude: capturedCoords?.longitude,
              unitLatitude: Number(userAny?.unit?.latitude ?? userAny?.education_unit?.latitude ?? -6.200000),
              unitLongitude: Number(userAny?.unit?.longitude ?? userAny?.education_unit?.longitude ?? 106.816666),
            },
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Nilai status dan jam hari ini yang sudah diformat rapi tanpa tumpang tindih
  const todayIn = cleanTimeDisplay(todayRecord?.check_in_time);
  const todayOut = cleanTimeDisplay(todayRecord?.check_out_time);
  const hasTodayIn = Boolean(todayIn && todayIn !== '--:--');
  const hasTodayOut = Boolean(todayOut && todayOut !== '--:--');
  const todayStatusObj = cleanStatusDisplay(todayRecord?.status, hasTodayIn);

  return (
    <View style={s.container}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK BUKU PENGHUBUNG & BUKU NILAI) ── */}
      <View style={[s.topFoliageWrapper, { height: 320 }]} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={s.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={[
            'rgba(24, 161, 101, 0.18)',
            'rgba(24, 161, 101, 0.40)',
            'rgba(240, 253, 244, 0.95)',
            '#F0FDF4',
          ]}
          locations={[0, 0.28, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HERO HEADER ── */}
      <View style={[s.topHeader, { paddingTop: topInset + 4 }]}>
        <View style={s.topHeaderRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleBack}
            style={s.headerSquircleBtn}
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
          </TouchableOpacity>
          <View style={s.headerTitleCol}>
            <View style={s.roleTag}>
              <View style={s.pulseDot} />
              <Text style={s.roleTagText} numberOfLines={1}>
                {isPrincipal
                  ? 'OTORITAS KEPALA SEKOLAH • PRESENSI MANDIRI'
                  : isTeacher
                  ? 'GURU / PENDIDIK • PRESENSI MANDIRI'
                  : isTu
                  ? 'STAF TATA USAHA • PRESENSI MANDIRI'
                  : 'PEGAWAI & KARYAWAN • PRESENSI MANDIRI'}
              </Text>
            </View>
            <Text style={s.headerTitle} numberOfLines={1}>Presensi Mandiri</Text>
            <Text style={s.headerSubtitle} numberOfLines={1}>
              {currentDateText}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={onRefresh}
            style={s.headerSquircleBtn}
            accessibilityLabel="Muat Ulang"
          >
            <MaterialCommunityIcons name="refresh" size={20} color="#064E3B" />
          </TouchableOpacity>
        </View>

        {/* ── Tab Switcher: Presensi Mandiri vs Kartu QR Pegawai ── */}
        <View style={s.modeToggleBox}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setActiveTab('mandiri')}
            style={[s.modeToggleBtn, activeTab === 'mandiri' && s.modeToggleBtnActive]}
          >
            <MaterialCommunityIcons
              name="account-clock"
              size={16}
              color={activeTab === 'mandiri' ? '#FFFFFF' : '#065F46'}
              style={{ marginRight: 6 }}
            />
            <Text style={[s.modeToggleText, activeTab === 'mandiri' && s.modeToggleTextActive]}>
              Presensi Digital
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setActiveTab('qr_card')}
            style={[s.modeToggleBtn, activeTab === 'qr_card' && s.modeToggleBtnActive]}
          >
            <MaterialCommunityIcons
              name="qrcode-scan"
              size={16}
              color={activeTab === 'qr_card' ? '#FFFFFF' : '#065F46'}
              style={{ marginRight: 6 }}
            />
            <Text style={[s.modeToggleText, activeTab === 'qr_card' && s.modeToggleTextActive]}>
              Kartu QR Pegawai
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SHEET CONTAINER KONTEN (Gaya Modern Buku Nilai & Buku Penghubung) ── */}
      <View style={s.sheetContainer}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scrollContent, { paddingBottom: bottomInset + 30 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        >
        {activeTab === 'mandiri' ? (
          /* ======================================================= */
          /* TAB 1: PRESENSI DIGITAL MANDIRI                         */
          /* ======================================================= */
          <>
            {/* Live Clock & Geofence Status Card */}
            <View style={s.liveClockCard}>
              <LinearGradient colors={['#F0FDFA', '#CCFBF1']} style={s.liveClockGradient}>
                <View style={s.liveClockTopRow}>
                  <View style={s.gpsBadge}>
                    <MaterialCommunityIcons name="crosshairs-gps" size={13} color="#0D9488" />
                    <Text style={s.gpsBadgeText}>Radius Wajib: Maks. 30 Meter</Text>
                  </View>
                  <Text style={s.unitNameText}>{staffUnit}</Text>
                </View>

                {/* Digital Clock */}
                <Text style={s.clockDigitsText}>{currentTime}</Text>
                <Text style={s.dateSubText}>{currentDateText}</Text>

                {/* ── MAP LOKASI UNIT & POSISI USER DENGAN INDIKATOR JARAK REALTIME ── */}
                <View style={s.liveMapContainer}>
                  {/* Map Image View (Mapbox Retina 2x) */}
                  <View style={s.mapFrame}>
                    {mapTileInfo?.url ? (
                      <Image
                        source={{ uri: mapTileInfo.url }}
                        style={s.mapImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={s.mapLoadingBox}>
                        <ActivityIndicator size="small" color="#0D9488" />
                        <Text style={s.mapLoadingText}>Memuat peta lokasi...</Text>
                      </View>
                    )}

                    {/* Gradient overlay to soften bottom & top edges */}
                    <LinearGradient
                      colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.55)']}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />

                    {/* Top Row Badges over Map */}
                    <View style={s.mapTopBadgesRow}>
                      <View style={s.mapUnitBadge}>
                        <MaterialCommunityIcons name="office-building-marker" size={13} color="#059669" />
                        <Text style={s.mapUnitBadgeText} numberOfLines={1}>{unitLocation.name}</Text>
                      </View>
                      <View style={[
                        s.mapRadiusPill,
                        distanceToUnit !== null && (isWithinRadius ? s.mapRadiusPillSuccess : s.mapRadiusPillDanger)
                      ]}>
                        <MaterialCommunityIcons
                          name={distanceToUnit !== null ? (isWithinRadius ? 'check-circle' : 'alert-circle') : 'crosshairs-gps'}
                          size={12}
                          color="#FFFFFF"
                        />
                        <Text style={s.mapRadiusPillText}>
                          {distanceToUnit !== null
                            ? isWithinRadius
                              ? 'Dalam Radius'
                              : 'Di Luar Radius'
                            : `Maks. ${unitLocation.radiusMeter}m`}
                        </Text>
                      </View>
                    </View>

                    {/* Bottom Row inside Map: Legend & External Maps Button */}
                    <View style={s.mapBottomRow}>
                      <View style={s.mapLegendBox}>
                        <View style={s.legendItem}>
                          <View style={[s.legendDot, { backgroundColor: '#059669' }]} />
                          <Text style={s.legendText}>Unit</Text>
                        </View>
                        <View style={s.legendItem}>
                          <View style={[s.legendDot, { backgroundColor: '#2563EB' }]} />
                          <Text style={s.legendText}>Anda</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleOpenNavigationMaps}
                        style={s.mapNavigateBtn}
                      >
                        <MaterialCommunityIcons name="google-maps" size={13} color="#0F172A" />
                        <Text style={s.mapNavigateBtnText}>Rute</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Distance & GPS Status Card */}
                  <View style={s.distanceInfoCard}>
                    <View style={s.distancePrimaryRow}>
                      {/* Left: Distance Value */}
                      <View style={s.distanceValueCol}>
                        <Text style={s.distanceLabel}>Jarak Anda ke Unit</Text>
                        <View style={s.distanceNumberRow}>
                          <MaterialCommunityIcons
                            name="map-marker-distance"
                            size={20}
                            color={distanceToUnit !== null ? (isWithinRadius ? '#059669' : '#E11D48') : '#64748B'}
                          />
                          <Text style={[
                            s.distanceNumberText,
                            distanceToUnit !== null && (isWithinRadius ? { color: '#047857' } : { color: '#E11D48' })
                          ]}>
                            {formatDistance(distanceToUnit)}
                          </Text>
                        </View>
                      </View>

                      {/* Middle: Status Note */}
                      <View style={s.distanceStatusCol}>
                        <View style={[
                          s.distanceStatusTag,
                          distanceToUnit !== null
                            ? isWithinRadius
                              ? s.distanceStatusTagSuccess
                              : s.distanceStatusTagDanger
                            : s.distanceStatusTagPending
                        ]}>
                          <Text style={[
                            s.distanceStatusTagText,
                            distanceToUnit !== null
                              ? isWithinRadius
                                ? { color: '#047857' }
                                : { color: '#BE123C' }
                              : { color: '#D97706' }
                          ]}>
                            {distanceToUnit !== null
                              ? isWithinRadius
                                ? '✓ Radius Aman'
                                : `✕ Lebih ${Math.round(distanceToUnit - unitLocation.radiusMeter)}m`
                              : 'Menunggu GPS'}
                          </Text>
                        </View>
                        <Text style={s.distanceSubHint}>
                          Toleransi: {unitLocation.radiusMeter} meter
                        </Text>
                      </View>

                      {/* Right: Refresh GPS Button */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => void requestUserLocation(false)}
                        disabled={locatingUser}
                        style={s.refreshGpsBtn}
                      >
                        {locatingUser ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <MaterialCommunityIcons name="crosshairs-gps" size={15} color="#FFFFFF" />
                            <Text style={s.refreshGpsBtnText}>GPS</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Bottom: Coords Strip */}
                    <View style={s.coordsStripRow}>
                      <Text style={s.coordsStripText} numberOfLines={1}>
                        GPS: {userLocation ? `${userLocation.latitude.toFixed(5)}, ${userLocation.longitude.toFixed(5)}` : 'Mencari...'}
                      </Text>
                      <Text style={s.coordsStripDivider}>•</Text>
                      <Text style={s.coordsStripText} numberOfLines={1}>
                        Unit: {unitLocation.latitude.toFixed(5)}, {unitLocation.longitude.toFixed(5)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Status Box: 3 Kartu Terpisah (Masuk, Pulang, Status) Bebas Tumpang Tindih */}
                <View style={s.todayStatusRow}>
                  {/* Card 1: Masuk */}
                  <View style={[s.statusPillBox, hasTodayIn ? s.statusPillBoxActiveIn : s.statusPillBoxNeutral]}>
                    <View style={s.statusPillHeader}>
                      <MaterialCommunityIcons name="login" size={13} color="#059669" />
                      <Text style={[s.statusPillLabel, hasTodayIn && { color: '#047857' }]}>MASUK</Text>
                    </View>
                    <Text style={s.statusPillValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {todayIn}
                    </Text>
                    <Text style={[s.statusPillSub, hasTodayIn && { color: '#059669' }]} numberOfLines={1}>
                      {hasTodayIn ? 'WIB • Tercatat' : 'Belum Absen'}
                    </Text>
                  </View>

                  {/* Card 2: Pulang */}
                  <View style={[s.statusPillBox, hasTodayOut ? s.statusPillBoxActiveOut : s.statusPillBoxNeutral]}>
                    <View style={s.statusPillHeader}>
                      <MaterialCommunityIcons name="logout" size={13} color="#0D9488" />
                      <Text style={[s.statusPillLabel, hasTodayOut && { color: '#0F766E' }]}>PULANG</Text>
                    </View>
                    <Text style={s.statusPillValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {todayOut}
                    </Text>
                    <Text style={[s.statusPillSub, hasTodayOut && { color: '#0D9488' }]} numberOfLines={1}>
                      {hasTodayOut ? 'WIB • Selesai' : 'Belum Absen'}
                    </Text>
                  </View>

                  {/* Card 3: Status */}
                  <View style={[
                    s.statusPillBox,
                    todayStatusObj.isSuccess ? s.statusPillBoxSuccess : todayStatusObj.isWarning ? s.statusPillBoxWarning : s.statusPillBoxNeutral
                  ]}>
                    <View style={s.statusPillHeader}>
                      <MaterialCommunityIcons
                        name={todayStatusObj.isSuccess ? 'check-circle' : todayStatusObj.isWarning ? 'alert-circle' : 'clock-outline'}
                        size={13}
                        color={todayStatusObj.isSuccess ? '#047857' : todayStatusObj.isWarning ? '#D97706' : '#64748B'}
                      />
                      <Text style={[
                        s.statusPillLabel,
                        todayStatusObj.isSuccess ? { color: '#047857' } : todayStatusObj.isWarning ? { color: '#B45309' } : { color: '#64748B' }
                      ]}>
                        STATUS
                      </Text>
                    </View>
                    <Text
                      style={[
                        s.statusPillValue,
                        todayStatusObj.isSuccess ? { color: '#047857' } : todayStatusObj.isWarning ? { color: '#B45309' } : { color: '#64748B' }
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {todayStatusObj.label}
                    </Text>
                    <Text style={[
                      s.statusPillSub,
                      todayStatusObj.isSuccess ? { color: '#059669' } : todayStatusObj.isWarning ? { color: '#D97706' } : { color: '#94A3B8' }
                    ]} numberOfLines={1}>
                      {hasTodayIn ? 'Tervalidasi' : 'Mandiri'}
                    </Text>
                  </View>
                </View>

                {/* Action Buttons: Masuk & Pulang */}
                <View style={s.actionButtonsRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleCheckIn}
                    disabled={submittingAction || Boolean(todayRecord?.check_in_time && todayRecord?.check_in_time !== '--:--')}
                    style={[
                      s.checkActionBtn,
                      { backgroundColor: '#059669' },
                      todayRecord?.check_in_time && todayRecord?.check_in_time !== '--:--' && { opacity: 0.6 },
                    ]}
                  >
                    <MaterialCommunityIcons name="login" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={s.checkActionBtnText}>Absen Masuk</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleCheckOut}
                    disabled={
                      submittingAction ||
                      !todayRecord?.check_in_time ||
                      todayRecord?.check_in_time === '--:--' ||
                      Boolean(todayRecord?.check_out_time && todayRecord?.check_out_time !== '--:--')
                    }
                    style={[
                      s.checkActionBtn,
                      { backgroundColor: '#0D9488' },
                      (!todayRecord?.check_in_time ||
                        todayRecord?.check_in_time === '--:--' ||
                        Boolean(todayRecord?.check_out_time && todayRecord?.check_out_time !== '--:--')) && { opacity: 0.6 },
                    ]}
                  >
                    <MaterialCommunityIcons name="logout" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={s.checkActionBtnText}>Absen Pulang</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>

            {/* Quick Link to Show QR Code */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('qr_card')}
              style={s.qrQuickBanner}
            >
              <MaterialCommunityIcons name="qrcode-scan" size={20} color="#059669" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.qrQuickTitle}>Scan Mandiri di Scanner Gerbang?</Text>
                <Text style={s.qrQuickSub}>Buka QR Card Pegawai Anda untuk discan di pos gerbang / terminal</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
            </TouchableOpacity>

            {/* Monthly KPI Stats Card */}
            <View style={s.kpiSection}>
              <Text style={s.sectionTitle}>Statistik Kehadiran Bulan Ini</Text>
              <View style={s.kpiGrid}>
                <View style={[s.kpiCard, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}>
                  <Text style={[s.kpiVal, { color: '#047857' }]}>{empStats.hadir}</Text>
                  <Text style={s.kpiLabel}>Hadir</Text>
                </View>
                <View style={[s.kpiCard, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
                  <Text style={[s.kpiVal, { color: '#D97706' }]}>{empStats.terlambat}</Text>
                  <Text style={s.kpiLabel}>Terlambat</Text>
                </View>
                <View style={[s.kpiCard, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}>
                  <Text style={[s.kpiVal, { color: '#2563EB' }]}>{empStats.izin + empStats.sakit}</Text>
                  <Text style={s.kpiLabel}>Izin / Sakit</Text>
                </View>
                <View style={[s.kpiCard, { borderColor: '#99F6E4', backgroundColor: '#F0FDFA' }]}>
                  <Text style={[s.kpiVal, { color: '#0D9488' }]}>{empStats.dinas_luar}</Text>
                  <Text style={s.kpiLabel}>Dinas Luar</Text>
                </View>
                <View style={[s.kpiCard, { borderColor: '#FECDD3', backgroundColor: '#FFF1F2' }]}>
                  <Text style={[s.kpiVal, { color: '#E11D48' }]}>{empStats.alpa}</Text>
                  <Text style={s.kpiLabel}>Alpa</Text>
                </View>
              </View>
            </View>

            {/* History List */}
            <View style={s.historyCard}>
              <View style={s.historyHeaderRow}>
                <View style={s.historyHeaderLeft}>
                  <MaterialCommunityIcons name="history" size={18} color="#059669" />
                  <Text style={s.historyHeaderTitle}>Riwayat Presensi Mandiri</Text>
                </View>
                <View style={s.historyCountBadge}>
                  <Text style={s.historyCountBadgeText}>{attendanceHistory.length} Riwayat</Text>
                </View>
              </View>

              {attendanceHistory.length === 0 ? (
                <View style={s.emptyHistoryBox}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={36} color="#CBD5E1" />
                  <Text style={s.emptyHistoryText}>Belum ada catatan riwayat presensi.</Text>
                </View>
              ) : (
                attendanceHistory.slice(0, 10).map((item, idx) => {
                  const rawDate = item.date || item.attendance_date || item.tanggal;
                  const formattedDate = cleanDateDisplay(rawDate);
                  const inTime = cleanTimeDisplay(item.check_in_time || item.check_in);
                  const outTime = cleanTimeDisplay(item.check_out_time || item.check_out);
                  const hasIn = inTime !== '--:--';
                  const hasOut = outTime !== '--:--';
                  const statusObj = cleanStatusDisplay(item.status, hasIn);

                  return (
                    <View key={item.id || idx} style={s.historyCardItem}>
                      {/* Baris 1: Header Tanggal & Status Badge */}
                      <View style={s.historyCardTopRow}>
                        <View style={s.historyDateGroup}>
                          <View style={[
                            s.historyCalendarIconBox,
                            { backgroundColor: statusObj.isSuccess ? '#ECFDF5' : statusObj.isWarning ? '#FFFBEB' : '#F1F5F9' }
                          ]}>
                            <MaterialCommunityIcons
                              name={statusObj.isSuccess ? 'calendar-check' : statusObj.isWarning ? 'calendar-alert' : 'calendar-clock'}
                              size={16}
                              color={statusObj.isSuccess ? '#059669' : statusObj.isWarning ? '#D97706' : '#64748B'}
                            />
                          </View>
                          <View style={s.historyDateTextCol}>
                            <Text style={s.historyDateTitle} numberOfLines={1}>{formattedDate}</Text>
                            <Text style={s.historyDateSub} numberOfLines={1}>Presensi Pegawai Mandiri</Text>
                          </View>
                        </View>

                        {/* Status Badge di Kanan Atas */}
                        <View style={[
                          s.historyStatusBadge,
                          {
                            backgroundColor: statusObj.isSuccess ? '#ECFDF5' : statusObj.isWarning ? '#FFFBEB' : '#F8FAFC',
                            borderColor: statusObj.isSuccess ? '#A7F3D0' : statusObj.isWarning ? '#FDE68A' : '#E2E8F0',
                          }
                        ]}>
                          <View style={[
                            s.historyStatusDot,
                            { backgroundColor: statusObj.isSuccess ? '#059669' : statusObj.isWarning ? '#D97706' : '#94A3B8' }
                          ]} />
                          <Text
                            style={[
                              s.historyStatusBadgeText,
                              { color: statusObj.isSuccess ? '#047857' : statusObj.isWarning ? '#B45309' : '#64748B' }
                            ]}
                            numberOfLines={1}
                          >
                            {statusObj.label}
                          </Text>
                        </View>
                      </View>

                      {/* Garis Pembatas Halus */}
                      <View style={s.historyCardDivider} />

                      {/* Baris 2: Waktu Masuk & Pulang (50%-50% Lapang & Tidak Akan Pernah Tumpang Tindih) */}
                      <View style={s.historyTimeBoxesRow}>
                        {/* Box Masuk */}
                        <View style={[s.historyTimeBox, s.historyTimeBoxIn]}>
                          <View style={s.historyTimeBoxLeft}>
                            <MaterialCommunityIcons name="login" size={13} color="#059669" />
                            <Text style={s.historyTimeBoxLabel}>MASUK</Text>
                          </View>
                          <Text style={s.historyTimeBoxValue} numberOfLines={1}>
                            {inTime}{hasIn ? ' WIB' : ''}
                          </Text>
                        </View>

                        {/* Box Pulang */}
                        <View style={[s.historyTimeBox, s.historyTimeBoxOut]}>
                          <View style={s.historyTimeBoxLeft}>
                            <MaterialCommunityIcons name="logout" size={13} color="#0D9488" />
                            <Text style={s.historyTimeBoxLabel}>PULANG</Text>
                          </View>
                          <Text style={[s.historyTimeBoxValue, !hasOut && { color: '#94A3B8' }]} numberOfLines={1}>
                            {outTime}{hasOut ? ' WIB' : ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        ) : (
          /* ======================================================= */
          /* TAB 2: KARTU QR PEGAWAI DIGITAL (STAFF ID CARD)         */
          /* ======================================================= */
          <View style={s.qrCardSection}>
            <View style={s.staffIdCardWrap}>
              {/* Card Header Background */}
              <LinearGradient
                colors={['#064E3B', '#047857', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.staffIdCardGradient}
              >
                {/* Header Kop SIMSIT */}
                <View style={s.idCardHeaderRow}>
                  <View style={s.schoolBadgeLogo}>
                    <MaterialCommunityIcons name="shield-check" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={s.idCardSchoolName}>SIMSIT TERPADU</Text>
                    <Text style={s.idCardTypeLabel}>KARTU IDENTITAS PEGAWAI RESMI</Text>
                  </View>
                  <View style={s.staffRoleBadge}>
                    <Text style={s.staffRoleBadgeText}>TATA USAHA</Text>
                  </View>
                </View>

                {/* Profile Row */}
                <View style={s.idCardProfileRow}>
                  <Image
                    source={user?.avatar ? { uri: getProfileImageUrl(user) } : DEFAULT_PARENT_AVATAR}
                    style={s.idCardAvatar}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.idCardStaffName} numberOfLines={1}>{String(staffName)}</Text>
                    <Text style={s.idCardNipText}>NIY/NIP: {staffNip}</Text>
                    <Text style={s.idCardUnitText} numberOfLines={1}>{staffUnit}</Text>
                  </View>
                </View>

                {/* QR Code Container */}
                <View style={s.idCardQrContainer}>
                  <Image
                    source={{
                      uri: `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
                        staffQrData
                      )}`,
                    }}
                    style={s.idCardQrImage}
                    resizeMode="contain"
                  />
                  {/* Watermark in center */}
                  <View style={s.qrCenterIconBadge}>
                    <MaterialCommunityIcons name="star-crescent" size={18} color="#047857" />
                  </View>
                </View>

                {/* Countdown & Refresh */}
                <View style={s.qrCountdownRow}>
                  <MaterialCommunityIcons name="timer-sand" size={14} color="#D1FAE5" />
                  <Text style={s.qrCountdownText}>Token diperbarui otomatis dalam {qrCountdownDisplay}</Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setQrCountdown(300)}
                    style={s.refreshQrIconBtn}
                  >
                    <MaterialCommunityIcons name="refresh" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* Instruction */}
                <Text style={s.idCardInstruction}>
                  Tunjukkan QR Code ini ke pemindai gerbang atau terminal pos satpam saat datang dan pulang kerja.
                </Text>

                {/* Button Full Screen QR */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowFullQrModal(true)}
                  style={s.enlargeQrBtn}
                >
                  <MaterialCommunityIcons name="fullscreen" size={18} color="#064E3B" style={{ marginRight: 6 }} />
                  <Text style={s.enlargeQrBtnText}>Perbesar Layar Penuh</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        )}
      </ScrollView>
      </View>

      {/* ── MODAL: FULL SCREEN QR CODE ── */}
      <Modal visible={showFullQrModal} animationType="fade" transparent={false} onRequestClose={() => setShowFullQrModal(false)}>
        <View style={[s.fullQrModalRoot, { paddingTop: topInset + 10, paddingBottom: bottomInset + 20 }]}>
          <View style={s.fullQrTopRow}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowFullQrModal(false)} style={s.fullQrCloseBtn}>
              <MaterialCommunityIcons name="close" size={24} color="#0F172A" />
            </TouchableOpacity>
            <Text style={s.fullQrModalTitle}>QR Scanner Gerbang</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={s.fullQrCenterBox}>
            <Text style={s.fullQrStaffName}>{String(staffName)}</Text>
            <Text style={s.fullQrStaffNip}>NIY/NIP: {staffNip} • Tata Usaha</Text>

            <View style={s.fullQrImageFrame}>
              <Image
                source={{
                  uri: `https://api.qrserver.com/v1/create-qr-code/?size=380x380&data=${encodeURIComponent(
                    staffQrData
                  )}`,
                }}
                style={s.fullQrLargeImage}
                resizeMode="contain"
              />
            </View>

            <Text style={s.fullQrNoticeText}>
              Arahkan layar ponsel ini ke arah kamera pemindai gerbang sekolah / pos security.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Feedback Modal */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}

      {/* Dedicated Attendance Rejection Modal */}
      {rejectionModal && (
        <AttendanceRejectedModal
          visible={rejectionModal.visible}
          title={rejectionModal.title}
          message={rejectionModal.message}
          details={rejectionModal.details}
          onClose={() => setRejectionModal(null)}
          onRetry={() => {
            setRejectionModal(null);
            void handleCheckIn();
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0FDF4' },
  topFoliageWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    width: '100%',
    height: '100%',
  },
  topHeader: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  headerSquircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTitleCol: { flex: 1 },
  roleTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  roleTagText: { fontSize: 10, fontWeight: '800', color: '#065F46', letterSpacing: 0.5 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#064E3B', letterSpacing: 0.2, marginTop: 1 },
  headerSubtitle: { fontSize: 11, color: '#047857', fontWeight: '600', marginTop: 1 },

  modeToggleBox: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 3,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 11,
  },
  modeToggleBtnActive: { backgroundColor: '#059669' },
  modeToggleText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  modeToggleTextActive: { color: '#FFFFFF', fontWeight: '800' },

  sheetContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 4,
  },

  scrollContent: { padding: 14 },

  // Live Clock Card
  liveClockCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#99F6E4',
    marginBottom: 12,
    elevation: 2,
  },
  liveClockGradient: { padding: 16 },
  liveClockTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  gpsBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#0D9488' },
  unitNameText: { fontSize: 11, fontWeight: '700', color: '#0F766E' },

  clockDigitsText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#064E3B',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 1,
  },
  dateSubText: { fontSize: 12, color: '#047857', textAlign: 'center', fontWeight: '600', marginTop: 2 },

  // Live Map Container & Frame
  liveMapContainer: {
    marginTop: 14,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  mapFrame: {
    width: '100%',
    height: 165,
    backgroundColor: '#CCFBF1',
    position: 'relative',
    overflow: 'hidden',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapLoadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
  },
  mapLoadingText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '600',
    marginTop: 6,
  },
  mapTopBadgesRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mapUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    maxWidth: '65%',
    gap: 4,
  },
  mapUnitBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  mapRadiusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D9488',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  mapRadiusPillSuccess: {
    backgroundColor: '#059669',
  },
  mapRadiusPillDanger: {
    backgroundColor: '#E11D48',
  },
  mapRadiusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  mapBottomRow: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mapLegendBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mapNavigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 3,
    elevation: 1,
  },
  mapNavigateBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
  },

  // Distance Info Card
  distanceInfoCard: {
    padding: 10,
    backgroundColor: '#FFFFFF',
  },
  distancePrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  distanceValueCol: {
    flex: 1.1,
  },
  distanceLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  distanceNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  distanceNumberText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  distanceStatusCol: {
    flex: 1.3,
    alignItems: 'center',
  },
  distanceStatusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  distanceStatusTagSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  distanceStatusTagDanger: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  distanceStatusTagPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  distanceStatusTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  distanceSubHint: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  refreshGpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 4,
  },
  refreshGpsBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  coordsStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
  },
  coordsStripText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  coordsStripDivider: {
    fontSize: 10,
    color: '#CBD5E1',
  },

  todayStatusRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  statusPillBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  statusPillBoxActiveIn: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  statusPillBoxActiveOut: {
    borderColor: '#99F6E4',
    backgroundColor: '#F0FDFA',
  },
  statusPillBoxSuccess: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  statusPillBoxWarning: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  statusPillBoxNeutral: {
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  statusPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3.5,
    marginBottom: 3,
  },
  statusPillLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  statusPillValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  statusPillSub: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
  },

  actionButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  checkActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
  },
  checkActionBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },

  qrQuickBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 12,
  },
  qrQuickTitle: { fontSize: 12.5, fontWeight: '800', color: '#065F46' },
  qrQuickSub: { fontSize: 10.5, color: '#047857', marginTop: 1 },

  kpiSection: { marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 6 },
  kpiGrid: { flexDirection: 'row', gap: 6 },
  kpiCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 8, alignItems: 'center' },
  kpiVal: { fontSize: 15, fontWeight: '900' },
  kpiLabel: { fontSize: 9.5, fontWeight: '800', color: '#475569', marginTop: 1 },

  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  historyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginLeft: 6,
  },
  historyCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  emptyHistoryBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyHistoryText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },

  // ── Two-row Organized History Item ──
  historyCardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  historyCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyDateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  historyCalendarIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  historyDateTextCol: {
    flex: 1,
  },
  historyDateTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  historyDateSub: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 1,
  },
  historyStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  historyStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  historyStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  historyCardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
  },
  historyTimeBoxesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  historyTimeBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  historyTimeBoxIn: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  historyTimeBoxOut: {
    backgroundColor: '#F0FDFA',
    borderColor: '#CCFBF1',
  },
  historyTimeBoxLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyTimeBoxLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
  },
  historyTimeBoxValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F172A',
  },

  // TAB 2: STAFF ID CARD
  qrCardSection: { alignItems: 'center', paddingTop: 6 },
  staffIdCardWrap: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  staffIdCardGradient: { padding: 18, alignItems: 'center' },
  idCardHeaderRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 14 },
  schoolBadgeLogo: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idCardSchoolName: { fontSize: 12.5, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  idCardTypeLabel: { fontSize: 8.5, color: '#A7F3D0', fontWeight: '700' },
  staffRoleBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  staffRoleBadgeText: { fontSize: 9.5, fontWeight: '900', color: '#B45309' },

  idCardProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    padding: 10,
    marginBottom: 14,
  },
  idCardAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#FFFFFF' },
  idCardStaffName: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  idCardNipText: { fontSize: 11, color: '#D1FAE5', fontWeight: '600', marginTop: 1 },
  idCardUnitText: { fontSize: 10.5, color: '#A7F3D0', marginTop: 1 },

  idCardQrContainer: {
    width: 220,
    height: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  idCardQrImage: { width: '100%', height: '100%' },
  qrCenterIconBadge: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },

  qrCountdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  qrCountdownText: { fontSize: 10.5, color: '#D1FAE5', fontWeight: '600' },
  refreshQrIconBtn: { padding: 4 },

  idCardInstruction: {
    fontSize: 10.5,
    color: '#ECFDF5',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 15,
    paddingHorizontal: 12,
  },

  enlargeQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 14,
    width: '100%',
  },
  enlargeQrBtnText: { fontSize: 12.5, fontWeight: '800', color: '#064E3B' },

  // Full Screen QR Modal
  fullQrModalRoot: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 20 },
  fullQrTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fullQrCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  fullQrModalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  fullQrCenterBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fullQrStaffName: { fontSize: 18, fontWeight: '900', color: '#0F172A', textAlign: 'center' },
  fullQrStaffNip: { fontSize: 13, color: '#059669', fontWeight: '700', marginTop: 4 },
  fullQrImageFrame: {
    width: 290,
    height: 290,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    padding: 16,
    marginVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  fullQrLargeImage: { width: '100%', height: '100%' },
  fullQrNoticeText: { fontSize: 12, color: '#64748B', textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
});
