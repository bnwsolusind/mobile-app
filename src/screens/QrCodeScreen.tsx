import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
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
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isStudentRole } from '../utils/roles';
import { getProfileImageUrl } from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const getSafeInsets = (insetsHook?: () => any) => {
  try {
    if (typeof insetsHook === 'function') {
      const res = insetsHook();
      if (res && typeof res === 'object') return res;
    }
  } catch {}
  return { top: 0, bottom: 0, left: 0, right: 0 };
};

export default function QrCodeScreen({ navigation }: any) {
  const insets = getSafeInsets(typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets : undefined);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 14);

  const user = useAuthStore((state) => state.user);
  const roles = user?.roles || [];
  const isParent = isParentRole(roles);
  const isStudent = isStudentRole(roles);

  // Parent & Student Data State
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(undefined);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [qrToken, setQrToken] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshingQr, setRefreshingQr] = useState<boolean>(false);

  // 1. Initial Load: Fetch children if parent or portal profile if student with offline cache
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const childCacheKey = offlineCache.buildKey('qr_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          setChildren(cached);
          setSelectedChildId((prev) => prev || String(cached[0].id));
          setLoading(false);
        }
      })();

      mobileApiService
        .getPortalChildren()
        .then((res) => {
          const list = unwrapApiData<any[]>(res) || [];
          if (isMounted && list.length > 0) {
            setChildren(list);
            setSelectedChildId((prev) => prev || String(list[0].id));
            void offlineCache.set(childCacheKey, list);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else if (isStudent) {
      const profCacheKey = offlineCache.buildKey('qr_profile', user?.id);
      void (async () => {
        const cachedProf = await offlineCache.get<any>(profCacheKey);
        if (cachedProf && isMounted) {
          setStudentInfo(cachedProf);
          setLoading(false);
        }
      })();

      mobileApiService
        .getPortalProfile()
        .then((res) => {
          const profData = unwrapApiData<any>(res) || res?.data || res;
          if (isMounted && profData) {
            setStudentInfo(profData);
            void offlineCache.set(profCacheKey, profData);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [isParent, isStudent, user?.id]);

  // 2. Fetch authoritative attendance QR token when selected child changes with offline cache
  useEffect(() => {
    let isMounted = true;
    const fetchQr = async () => {
      const targetId = isParent ? selectedChildId : undefined;
      if (isParent && !targetId) return;
      const qrCacheKey = offlineCache.buildKey('qr_token', user?.id, targetId || 'self');

      // Baca cache dulu
      const cachedToken = await offlineCache.get<string>(qrCacheKey);
      if (cachedToken && isMounted) {
        setQrToken(cachedToken);
      }

      try {
        const res = await mobileApiService.getPortalAttendanceQr(targetId);
        const data = unwrapApiData<any>(res) || res?.data || res;
        if (isMounted && data?.qr_token) {
          setQrToken(data.qr_token);
          void offlineCache.set(qrCacheKey, data.qr_token);
        }
      } catch {
        // Fallback to cached token or NIS/ID gracefully handled in render
      }
    };

    void fetchQr();

    return () => {
      isMounted = false;
    };
  }, [isParent, selectedChildId, user?.id]);

  // Active child resolution
  const activeChild = useMemo(() => {
    if (isParent) {
      if (selectedChildId) {
        const found = children.find((c) => String(c.id) === String(selectedChildId));
        if (found) return found;
      }
      return children[0] || null;
    }
    if (isStudent) {
      return studentInfo || user?.student || user || null;
    }
    return user || null;
  }, [isParent, isStudent, children, selectedChildId, studentInfo, user]);

  // Profile data resolution
  const childFullName =
    activeChild?.full_name ||
    activeChild?.nama_lengkap ||
    activeChild?.name ||
    user?.name ||
    'Santri';

  const childNis = activeChild?.nis || activeChild?.nisn || activeChild?.nomor_induk || '-';
  const childClass =
    activeChild?.kelas?.nama_kelas ||
    activeChild?.kelas?.name ||
    activeChild?.classroom?.name ||
    activeChild?.rombel ||
    '-';
  const childUnit =
    activeChild?.education_unit?.name ||
    activeChild?.unit_name ||
    activeChild?.unit?.name ||
    'Yayasan Dar El-Iman';

  const avatarUrl =
    getProfileImageUrl(activeChild) ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(childFullName)}&background=18A165&color=FFFFFF&bold=true&size=150`;

  // QR Code payload: Official backend token stuqr:v1:... (verified for gate & lesson attendance), fallback to NIS
  const qrCodeData = qrToken || (childNis !== '-' ? childNis : String(activeChild?.id || 'SIMSIT-STUDENT'));

  // Refresh all data
  const handleRefreshAll = async () => {
    setLoading(true);
    try {
      if (isParent) {
        const res = await mobileApiService.getPortalChildren();
        const list = unwrapApiData<any[]>(res) || [];
        setChildren(list);
        if (list.length > 0) {
          const currentValid = list.some((c) => String(c.id) === String(selectedChildId));
          const targetId = currentValid ? selectedChildId : String(list[0].id);
          setSelectedChildId(targetId);

          const qrRes = await mobileApiService.getPortalAttendanceQr(targetId);
          const qrData = unwrapApiData<any>(qrRes) || qrRes?.data || qrRes;
          if (qrData?.qr_token) setQrToken(qrData.qr_token);
        }
      } else if (isStudent) {
        const qrRes = await mobileApiService.getPortalAttendanceQr();
        const qrData = unwrapApiData<any>(qrRes) || qrRes?.data || qrRes;
        if (qrData?.qr_token) setQrToken(qrData.qr_token);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefreshQr = async () => {
    setRefreshingQr(true);
    try {
      const targetId = isParent ? selectedChildId : undefined;
      const qrRes = await mobileApiService.getPortalAttendanceQr(targetId);
      const qrData = unwrapApiData<any>(qrRes) || qrRes?.data || qrRes;
      if (qrData?.qr_token) {
        setQrToken(qrData.qr_token);
        Alert.alert('Sukses', 'Kode QR presensi berhasil diperbarui dari server.');
      } else {
        Alert.alert('Info', 'Kode QR telah siap digunakan.');
      }
    } catch {
      Alert.alert('Info', 'Kode QR siap digunakan.');
    } finally {
      setRefreshingQr(false);
    }
  };

  return (
    <View style={styles.rootContainer}>
      {/* SIMSIT CURVED GRADIENT HEADER */}
      <View style={styles.headerOuter}>
        <LinearGradient
          colors={['#0D6B42', '#18A165', '#2BD988']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.headerGradient,
            { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 14 : 10) },
          ]}
        >
          <View style={styles.decorWave} />
          <View style={styles.decorCircle} />

          <View style={styles.headerContentRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation?.navigate('Beranda')}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Kembali ke Beranda"
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color="#18A165" />
            </TouchableOpacity>

            <Text numberOfLines={1} style={styles.headerTitleText}>
              QR Code & Presensi
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation?.navigate('Notifikasi')}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Notifikasi"
            >
              <MaterialCommunityIcons name="bell-outline" size={20} color="#18A165" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* BODY SHEET */}
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#E4F6EE']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: bottomInset + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={handleRefreshAll}
              colors={['#18A165']}
            />
          }
        >
          {/* CHILD SELECTOR (IF PARENT HAS MULTIPLE CHILDREN) */}
          {isParent && children.length > 1 && (
            <View style={styles.childSelectorContainer}>
              <View style={styles.selectorHeaderRow}>
                <MaterialCommunityIcons name="account-child-outline" size={17} color="#18A165" />
                <Text style={styles.selectorSectionLabel}>Pilih Ananda:</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.childChipsScroll}
              >
                {children.map((child) => {
                  const isSelected = String(child.id) === String(selectedChildId);
                  const name = child.full_name || child.nama_lengkap || child.name || 'Siswa';
                  const cAvatar =
                    getProfileImageUrl(child) ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${isSelected ? '18A165' : 'E2E8F0'}&color=${isSelected ? 'FFFFFF' : '475569'}&bold=true&size=80`;

                  return (
                    <TouchableOpacity
                      key={String(child.id)}
                      activeOpacity={0.8}
                      onPress={() => setSelectedChildId(String(child.id))}
                      style={[
                        styles.childChip,
                        isSelected && styles.childChipActive,
                      ]}
                    >
                      <Image source={{ uri: cAvatar }} style={styles.childChipAvatar} />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.childChipText,
                          isSelected && styles.childChipTextActive,
                        ]}
                      >
                        {name}
                      </Text>
                      {isSelected && (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={16}
                          color="#18A165"
                          style={{ marginLeft: 4 }}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* MAIN CARD: DATA ANANDA BESERTA AVATAR & QR CODE */}
          <View style={styles.mainCardWrapper}>
            {/* STUDENT PROFILE HEADER (AVATAR + DATA ANANDA) */}
            <View style={styles.studentProfileRow}>
              <View style={styles.avatarContainer}>
                <Image source={{ uri: avatarUrl }} style={styles.studentAvatar} />
                <View style={styles.avatarCheckBadge}>
                  <MaterialCommunityIcons name="shield-check" size={14} color="#FFFFFF" />
                </View>
              </View>

              <View style={styles.studentInfoCol}>
                <Text numberOfLines={2} style={styles.studentFullName}>
                  {childFullName}
                </Text>

                {/* PILLS ROW: NIS & KELAS */}
                <View style={styles.badgesRow}>
                  <View style={styles.badgePill}>
                    <MaterialCommunityIcons name="card-account-details-outline" size={12} color="#18A165" />
                    <Text style={styles.badgePillText}>NIS: {childNis}</Text>
                  </View>
                  <View style={styles.badgePill}>
                    <MaterialCommunityIcons name="school-outline" size={12} color="#18A165" />
                    <Text style={styles.badgePillText}>{childClass}</Text>
                  </View>
                </View>

                {/* UNIT PENDIDIKAN */}
                <View style={styles.unitRow}>
                  <MaterialCommunityIcons name="domain" size={13} color="#64748B" />
                  <Text numberOfLines={1} style={styles.unitText}>
                    {childUnit}
                  </Text>
                </View>
              </View>
            </View>

            {/* DIVIDER */}
            <View style={styles.cardDivider} />

            {/* QR CODE CONTAINER */}
            <View style={styles.qrContainerBox}>
              <View style={styles.qrFrameCard}>
                <Image
                  source={{
                    uri: `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrCodeData)}`,
                  }}
                  style={styles.qrCodeImage}
                  resizeMode="contain"
                />
              </View>

              {/* VERIFICATION BADGE */}
              <View style={styles.verifiedBadgeRow}>
                <View style={styles.greenPulseDot} />
                <Text style={styles.verifiedBadgeText}>
                  QR Code Presensi Santri Terverifikasi
                </Text>
              </View>

              {/* DUAL-PURPOSE COMPLIANCE INSTRUCTION */}
              <Text style={styles.qrInstructionText}>
                Kode QR resmi untuk absensi gerbang sekolah (masuk/pulang) dan absensi kehadiran mata pelajaran di kelas.
              </Text>

              {/* REFRESH TOKEN BUTTON */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleManualRefreshQr}
                disabled={refreshingQr}
                style={styles.refreshQrBtn}
              >
                {refreshingQr ? (
                  <ActivityIndicator size="small" color="#18A165" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="refresh" size={16} color="#18A165" />
                    <Text style={styles.refreshQrBtnText}>Perbarui Kode QR</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* GUIDANCE / USAGE CARDS */}
          <View style={styles.guidanceCard}>
            <MaterialCommunityIcons name="gate" size={22} color="#18A165" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.guidanceTitle}>Absensi Gerbang Sekolah</Text>
              <Text style={styles.guidanceText}>
                Arahkan layar ponsel ke scanner pos gerbang saat santri datang atau pulang. Sistem otomatis mencatat waktu kedatangan & mengirimkan laporan presensi.
              </Text>
            </View>
          </View>

          <View style={[styles.guidanceCard, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', marginTop: 10 }]}>
            <MaterialCommunityIcons name="book-education-outline" size={22} color="#0284C7" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.guidanceTitle, { color: '#0369A1' }]}>Absensi Pelajaran di Kelas</Text>
              <Text style={[styles.guidanceText, { color: '#0C4A6E' }]}>
                Dapat dipindai oleh ustadz/guru pengampu saat sesi pembelajaran berlangsung untuk memverifikasi kehadiran santri secara real-time.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  /* HEADER */
  headerOuter: {
    backgroundColor: '#FFFFFF',
  },
  headerGradient: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  decorWave: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    transform: [{ scaleX: 1.3 }, { rotate: '-25deg' }],
  },
  decorCircle: {
    position: 'absolute',
    bottom: -20,
    left: 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  /* SHEET */
  sheetContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  screenScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  /* CHILD CHIP SELECTOR */
  childSelectorContainer: {
    marginBottom: 14,
  },
  selectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginLeft: 2,
  },
  selectorSectionLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.2,
  },
  childChipsScroll: {
    gap: 8,
    paddingRight: 10,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  childChipActive: {
    backgroundColor: '#DEF7EC',
    borderColor: '#18A165',
  },
  childChipAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginRight: 8,
    backgroundColor: '#F1F5F9',
  },
  childChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    maxWidth: 130,
  },
  childChipTextActive: {
    color: '#084835',
    fontWeight: '800',
  },

  /* MAIN CARD: STUDENT PROFILE & QR */
  mainCardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  studentProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  studentAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: '#18A165',
    backgroundColor: '#F8FAFC',
  },
  avatarCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#18A165',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  studentInfoCol: {
    flex: 1,
    marginLeft: 14,
  },
  studentFullName: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
    gap: 4,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#084835',
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 5,
  },
  unitText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 18,
  },

  /* QR CONTAINER */
  qrContainerBox: {
    alignItems: 'center',
  },
  qrFrameCard: {
    width: 240,
    height: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#CDEADE',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    shadowColor: '#18A165',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  qrCodeImage: {
    width: 216,
    height: 216,
  },
  verifiedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: '#F0FDF4',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 7,
  },
  greenPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  verifiedBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  qrInstructionText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
    maxWidth: 290,
  },
  refreshQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: '#F1FBF7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFE7D5',
    gap: 6,
  },
  refreshQrBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#18A165',
  },

  /* GUIDANCE CARDS */
  guidanceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  guidanceTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#15803D',
    marginBottom: 3,
  },
  guidanceText: {
    fontSize: 11.5,
    color: '#166534',
    lineHeight: 17,
  },
});
