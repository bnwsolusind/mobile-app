import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { isDivisiRole } from '../utils/roles';
import { offlineCache } from '../utils/offlineCache';
import PrincipalDashboardView from '../components/dashboard/PrincipalDashboardView';

export default function PrincipalDashboardScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const localNav = useNavigation<any>();
  const nav = navigation || localNav;
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const isDivisi = isDivisiRole(roles);

  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const unitName =
    (user?.metadata as any)?.education_unit?.name ||
    (user?.metadata as any)?.unit_name ||
    (user?.metadata as any)?.unit ||
    'Unit Madrasah';

  const CACHE_KEY = offlineCache.buildKey('principal_dashboard', user?.id || 'default');
  const dashboardRef = useRef(dashboard);
  dashboardRef.current = dashboard;

  const loadData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setRefreshing(true);
    } else if (!dashboardRef.current) {
      setLoading(true);
    }
    setErrorMessage(null);

    // Ambil dari offline cache terlebih dahulu jika dashboard masih kosong
    if (!dashboardRef.current) {
      try {
        const cached = await offlineCache.get<any>(CACHE_KEY);
        if (cached) {
          setDashboard(cached);
          setLoading(false);
        }
      } catch {
        // Abaikan kegagalan baca cache
      }
    }

    try {
      const res = await mobileApiService.getPrincipalDashboard();
      const payload = unwrapApiData(res);
      if (payload) {
        setDashboard(payload);
        void offlineCache.set(CACHE_KEY, payload);
      }
    } catch (err: any) {
      console.log('[PrincipalDashboard] Gagal memuat data:', err?.message || err);
      if (!dashboardRef.current) {
        setErrorMessage(
          err?.message || 'Gagal memuat data dashboard. Periksa koneksi jaringan Anda.'
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [CACHE_KEY]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleGoBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(nav);
    if (!handled) {
      nav.navigate('Beranda');
    }
  };

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);
  const scrollBottomPadding = bottomInset + 120;

  return (
    <View style={styles.container}>
      {/* ── HEADER HALAMAN DASHBOARD KEPALA SEKOLAH (STYLE MUTABA’AH) ── */}
      <View style={[styles.headerContainer, { paddingTop: topInset + 8 }]}>
        <LinearGradient
          colors={['#047857', '#059669', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroDecorCircle1} />
        <View style={styles.heroDecorCircle2} />

        <View style={styles.headerRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleGoBack}
            style={styles.heroSquircleBtn}
            accessibilityRole="button"
            accessibilityLabel="Kembali ke Beranda"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.titleBadgeRow}>
              <MaterialCommunityIcons name="shield-check" size={12} color="#A7F3D0" />
              <Text style={styles.headerSubtitleText}>
                {isDivisi ? 'DIVISI PENDIDIKAN' : 'PIMPINAN MADRASAH'}
              </Text>
            </View>
            <Text style={styles.headerMainTitle} numberOfLines={1}>
              {isDivisi ? 'Dashboard Divisi Pendidikan' : 'Dashboard Kepala Sekolah'}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => loadData(true)}
            style={styles.heroSquircleBtn}
            accessibilityRole="button"
            accessibilityLabel="Muat Ulang"
          >
            <MaterialCommunityIcons
              name="refresh"
              size={20}
              color="#059669"
              style={refreshing ? { transform: [{ rotate: '45deg' }] } : undefined}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.unitChipRow}>
          <View style={styles.unitChip}>
            <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" />
            <Text style={styles.unitChipText} numberOfLines={1}>
              {unitName}
            </Text>
          </View>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Eksekutif Real-Time</Text>
          </View>
        </View>
      </View>

      {/* ── KONTEN UTAMA ── */}
      {loading && !dashboard ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Memuat data eksekutif kepala sekolah...</Text>
        </View>
      ) : errorMessage && !dashboard ? (
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#E11D48" />
          <Text style={styles.errorTitle}>Terjadi Kesalahan</Text>
          <Text style={styles.errorSubtitle}>{errorMessage}</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => loadData()}
            style={styles.retryButton}
          >
            <MaterialCommunityIcons name="reload" size={16} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={[styles.scrollInner, { paddingBottom: scrollBottomPadding }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              colors={['#059669']}
              tintColor="#059669"
            />
          }
        >
          <PrincipalDashboardView
            dashboard={dashboard}
            navigation={nav}
            onOpenAllMenus={() => nav.navigate('Beranda')}
            onRefresh={() => loadData(true)}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerContainer: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.22)',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  heroDecorCircle1: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroDecorCircle2: {
    position: 'absolute',
    bottom: -20,
    left: 20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
    paddingBottom: 2,
  },
  heroSquircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    position: 'relative',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  headerSubtitleText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#A7F3D0',
    letterSpacing: 0.6,
  },
  headerMainTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  unitChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.18)',
  },
  unitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    maxWidth: '65%',
  },
  unitChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34D399',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D1FAE5',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 8,
  },
  errorSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    paddingBottom: 40,
  },
});
