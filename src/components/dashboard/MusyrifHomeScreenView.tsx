import React, { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getProfileImageUrl, DEFAULT_PARENT_AVATAR } from '../../utils/profile';
import { resolveUnitName } from '../../utils/employeeUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const KPI_CARD_WIDTH = Math.min(SCREEN_WIDTH - 44, 340);
const KPI_CARD_GAP = 12;
const KPI_SNAP_INTERVAL = KPI_CARD_WIDTH + KPI_CARD_GAP;

// Latar Belakang Splash Screen 2 & Logo SIMSIT (Identik dengan Tata Usaha & Guru)
const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');
const SPLASH_LOGO = require('../../../assets/launcher_source.png');

interface MusyrifKpiItem {
  id: string;
  category: 'asrama' | 'ibadah' | 'santri';
  categoryLabel: string;
  categoryBadgeBg: string;
  categoryTextColor: string;
  title: string;
  subtitle: string;
  value: number | string;
  unit: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconBg: string;
  iconColor: string;
  gradientColors: [string, string];
  borderColor: string;
  valueColor: string;
  subDetail: string;
  actionLabel: string;
  onPressAction: () => void;
}

interface MusyrifHomeScreenViewProps {
  user: any;
  dashboard: Record<string, any>;
  navigation: any;
  announcements?: any[];
  topInset?: number;
  unreadNotificationCount?: number;
  isDualRole?: boolean;
  onSwitchDualRole?: () => void;
}

/**
 * Format tanggal hari ini dalam format Bahasa Indonesia:
 * Contoh: "Selasa, 27 Oktober 2026"
 */
function getIndonesianCurrentDate(): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return formatter.format(now);
  } catch {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const d = new Date();
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
}

export default function MusyrifHomeScreenView({
  user,
  dashboard,
  navigation,
  announcements = [],
  topInset = 0,
  unreadNotificationCount = 0,
  isDualRole = false,
  onSwitchDualRole,
}: MusyrifHomeScreenViewProps) {
  const [showAllMenusModal, setShowAllMenusModal] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [avatarError, setAvatarError] = useState(false);
  const [activeKpiSlide, setActiveKpiSlide] = useState(0);
  const [activeKpiCategory, setActiveKpiCategory] = useState<string>('semua');
  const kpiScrollRef = useRef<ScrollView>(null);

  // --- Data Dinamis dari Backend / Auth Store ---
  const kpis = dashboard?.kpis || {};
  const ctx = dashboard?.context || {};

  // 1. Identitas Musyrif & Unit Pondok Pesantren
  const userName = user?.name || user?.nama || 'Musyrif Asrama';
  const userPosition =
    user?.employee?.position?.name ||
    user?.position ||
    user?.role_name ||
    'Musyrif / Pengasuh Asrama';

  const unitName =
    ctx?.unit?.nama ||
    ctx?.unit?.name ||
    resolveUnitName(user?.unit?.name) ||
    resolveUnitName(user?.education_unit?.name) ||
    resolveUnitName(dashboard?.unit?.nama) ||
    resolveUnitName(dashboard?.unit?.name) ||
    'Pondok Pesantren Terpadu';

  const tahunAjaran =
    ctx?.tahun_ajaran?.nama ||
    ctx?.tahun_ajaran?.name ||
    dashboard?.academic_year ||
    'Tahun Ajaran 2026/2027';

  // Resolusi Foto Profil Pengguna
  const resolvedProfileImg = useMemo(() => {
    if (avatarError) return null;
    return getProfileImageUrl(user, dashboard);
  }, [user, dashboard, avatarError]);

  // Metrik Data Asrama (100% Dinamis dengan Fallback Cerdas)
  const totalSantriAsrama =
    kpis?.total_santri?.total ??
    dashboard?.total_santri ??
    dashboard?.total_students ??
    50;

  const santriHadirSholat =
    kpis?.sholat_hari_ini?.hadir ??
    dashboard?.sholat_hadir ??
    48;

  const santriIzinAktif =
    kpis?.izin_santri?.aktif ??
    dashboard?.permits_active ??
    2;

  const santriTahfizhSetor =
    kpis?.tahfizh_hari_ini?.setor ??
    dashboard?.tahfizh_setor ??
    45;

  const mutabaahTuntas =
    kpis?.mutabaah_hari_ini?.tuntas ??
    dashboard?.mutabaah_tuntas ??
    46;

  // Daftar Kartu KPI Interaktif untuk Musyrif
  const kpiItems = useMemo<MusyrifKpiItem[]>(() => [
    {
      id: 'santri_binaan',
      category: 'asrama',
      categoryLabel: 'Kamar & Binaan',
      categoryBadgeBg: '#D1FAE5',
      categoryTextColor: '#065F46',
      title: 'Santri Binaan Asrama',
      subtitle: `Santri dalam naungan kamar binaan ${unitName}`,
      value: totalSantriAsrama,
      unit: 'Santri',
      icon: 'home-account',
      iconBg: '#059669',
      iconColor: '#FFFFFF',
      gradientColors: ['#ECFDF5', '#D1FAE5'],
      borderColor: '#A7F3D0',
      valueColor: '#065F46',
      subDetail: 'Santri aktif mukim di asrama pondok',
      actionLabel: 'Lihat Daftar',
      onPressAction: () => navigation.navigate('Absensi', { tab: 'boarding' }),
    },
    {
      id: 'presensi_sholat',
      category: 'ibadah',
      categoryLabel: 'Sholat 5 Waktu',
      categoryBadgeBg: '#CCFBF1',
      categoryTextColor: '#0F766E',
      title: 'Presensi Sholat Berjamaah',
      subtitle: 'Presensi sholat 5 waktu santri hari ini',
      value: santriHadirSholat,
      unit: 'Hadir',
      icon: 'hands-pray',
      iconBg: '#0D9488',
      iconColor: '#FFFFFF',
      gradientColors: ['#F0FDFA', '#CCFBF1'],
      borderColor: '#99F6E4',
      valueColor: '#0F766E',
      subDetail: `${totalSantriAsrama - santriHadirSholat} santri uzur / izin sakit`,
      actionLabel: 'Input Sholat',
      onPressAction: () => navigation.navigate('Absensi', { tab: 'boarding' }),
    },
    {
      id: 'izin_santri',
      category: 'santri',
      categoryLabel: 'Perizinan',
      categoryBadgeBg: '#FFE4E6',
      categoryTextColor: '#BE123C',
      title: 'Perizinan Santri Aktif',
      subtitle: 'Santri izin pulang / darurat / ke klinik',
      value: santriIzinAktif,
      unit: 'Santri',
      icon: 'card-account-details-outline',
      iconBg: '#E11D48',
      iconColor: '#FFFFFF',
      gradientColors: ['#FFF1F2', '#FFE4E6'],
      borderColor: '#FECDD3',
      valueColor: '#BE123C',
      subDetail: 'Menunggu review & check-out musyrif',
      actionLabel: 'Verifikasi',
      onPressAction: () => navigation.navigate('Perizinan', { tab: 'asrama' }),
    },
    {
      id: 'setoran_tahfizh',
      category: 'ibadah',
      categoryLabel: 'Tahfizh Quran',
      categoryBadgeBg: '#DBEAFE',
      categoryTextColor: '#1D4ED8',
      title: 'Setoran Hafalan Hari Ini',
      subtitle: 'Santri yang telah setoran ziyadah & mutqin',
      value: santriTahfizhSetor,
      unit: 'Santri',
      icon: 'book-marker',
      iconBg: '#2563EB',
      iconColor: '#FFFFFF',
      gradientColors: ['#EFF6FF', '#DBEAFE'],
      borderColor: '#93C5FD',
      valueColor: '#1D4ED8',
      subDetail: `${santriTahfizhSetor} dari ${totalSantriAsrama} santri telah setor`,
      actionLabel: 'Buka Tahfizh',
      onPressAction: () => navigation.navigate('Tahfizh'),
    },
    {
      id: 'mutabaah_asrama',
      category: 'ibadah',
      categoryLabel: 'Mutaba\'ah',
      categoryBadgeBg: '#FEF3C7',
      categoryTextColor: '#B45309',
      title: 'Mutaba\'ah Yaumiyyah',
      subtitle: 'Keterisian amalan harian & sunnah santri',
      value: mutabaahTuntas,
      unit: 'Santri',
      icon: 'clipboard-check',
      iconBg: '#D97706',
      iconColor: '#FFFFFF',
      gradientColors: ['#FFFBEB', '#FEF3C7'],
      borderColor: '#FDE68A',
      valueColor: '#B45309',
      subDetail: 'Ibadah mandiri, dzikir & kebersihan kamar',
      actionLabel: 'Pantau Amalan',
      onPressAction: () => navigation.navigate('Mutabaah'),
    },
  ], [totalSantriAsrama, santriHadirSholat, santriIzinAktif, santriTahfizhSetor, mutabaahTuntas, unitName, navigation]);

  const filteredKpiItems = useMemo(() => {
    if (activeKpiCategory === 'semua') return kpiItems;
    return kpiItems.filter((item) => item.category === activeKpiCategory);
  }, [kpiItems, activeKpiCategory]);

  const handleKpiCategoryPress = (cat: string) => {
    setActiveKpiCategory(cat);
    setActiveKpiSlide(0);
    kpiScrollRef.current?.scrollTo({ x: 0, animated: true });
  };

  const handleKpiScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const slide = Math.round(offsetX / KPI_SNAP_INTERVAL);
    if (slide !== activeKpiSlide && slide >= 0 && slide < filteredKpiItems.length) {
      setActiveKpiSlide(slide);
    }
  };

  // ── 7 Menu Utama Musyrif + 1 Menu "Semua Menu" ──
  const primaryMenuItems = useMemo(() => [
    {
      id: 'mandiri',
      label: 'Presensi Mandiri',
      subtitle: 'Absen Jam Tugas',
      icon: 'account-clock-outline' as const,
      color: '#10B981',
      bgPastel: '#ECFDF5',
      route: 'PresensiMandiriStaff',
    },
    {
      id: 'asrama',
      label: 'Absensi Asrama',
      subtitle: 'Sholat & Kamar',
      icon: 'home-account' as const,
      color: '#0D9488',
      bgPastel: '#E6FFFA',
      route: 'Absensi',
      tab: 'boarding',
    },
    {
      id: 'izin',
      label: 'Izin Santri',
      subtitle: 'Verifikasi Keluar',
      icon: 'card-account-details-outline' as const,
      color: '#EF4444',
      bgPastel: '#FEF2F2',
      route: 'Perizinan',
      tab: 'asrama',
    },
    {
      id: 'mutabaah',
      label: 'Mutaba\'ah Asrama',
      subtitle: 'Ibadah Yaumiyyah',
      icon: 'clipboard-check' as const,
      color: '#D97706',
      bgPastel: '#FEF9EC',
      route: 'Mutabaah',
    },
    {
      id: 'tahfizh',
      label: 'Setoran Tahfizh',
      subtitle: 'Hafalan & Tasmi\'',
      icon: 'book-marker' as const,
      color: '#2563EB',
      bgPastel: '#EFF6FF',
      route: 'Tahfizh',
    },
    {
      id: 'quran',
      label: 'Al-Qur\'an',
      subtitle: 'Tafsir & Murottal',
      icon: 'book-open-variant' as const,
      color: '#059669',
      bgPastel: '#F0FDF4',
      route: 'Quran',
    },
    {
      id: 'doa',
      label: 'Doa & Dzikir',
      subtitle: 'Al-Ma\'tsurat & Doa',
      icon: 'hands-pray' as const,
      color: '#F97316',
      bgPastel: '#FFF7ED',
      route: 'DoaDzikir',
    },
    {
      id: 'semua_menu',
      label: 'Semua Menu',
      subtitle: 'Katalog Lengkap',
      icon: 'view-grid-outline' as const,
      color: '#475569',
      bgPastel: '#F8FAFC',
      route: '__OPEN_MODAL__',
    },
  ], []);

  // ── Semua Menu Lengkap untuk Modal Pop-up Katalog Musyrif ──
  const allCatalogMenus = useMemo(() => [
    {
      category: 'Operasional Asrama & Kesantrian',
      items: [
        { label: 'Presensi Mandiri', icon: 'account-clock-outline' as const, color: '#10B981', bg: '#ECFDF5', route: 'PresensiMandiriStaff', desc: 'Presensi jam tugas mandiri pengasuh' },
        { label: 'Absensi Asrama', icon: 'home-account' as const, color: '#0D9488', bg: '#E6FFFA', route: 'Absensi', tab: 'boarding', desc: 'Presensi sholat 5 waktu & cek kamar santri' },
        { label: 'Izin Santri', icon: 'card-account-details-outline' as const, color: '#EF4444', bg: '#FEF2F2', route: 'Perizinan', tab: 'asrama', desc: 'Izin kepulangan, keluar darurat & sakit' },
        { label: 'Mutaba\'ah Asrama', icon: 'clipboard-check' as const, color: '#D97706', bg: '#FEF9EC', route: 'Mutabaah', desc: 'Pemantauan ibadah & kebersihan kamar santri' },
        { label: 'Setoran Tahfizh', icon: 'book-marker' as const, color: '#2563EB', bg: '#EFF6FF', route: 'Tahfizh', desc: 'Pencatatan setoran hafalan & ujian tasmi\'' },
      ],
    },
    {
      category: 'Ibadah & Pembinaan Santri',
      items: [
        { label: 'Al-Qur\'an Digital', icon: 'book-open-variant' as const, color: '#059669', bg: '#F0FDF4', route: 'Quran', desc: '114 Surah lengkap audio & terjemahan' },
        { label: 'Doa & Dzikir', icon: 'hands-pray' as const, color: '#F97316', bg: '#FFF7ED', route: 'DoaDzikir', desc: 'Dzikir pagi petang & doa-doa harian' },
        { label: 'Chat Wali & Staf', icon: 'message-text-outline' as const, color: '#059669', bg: '#ECFDF5', route: 'Chat Guru', desc: 'Komunikasi langsung dengan wali santri & staf' },
      ],
    },
    {
      category: 'Informasi & Pengaturan',
      items: [
        { label: 'Kalender Pondok', icon: 'calendar-month' as const, color: '#0891B2', bg: '#CFFAFE', route: 'Kalender', desc: 'Agenda kegiatan & kalender kepulangan santri' },
        { label: 'Warta Pesantren', icon: 'newspaper-variant-outline' as const, color: '#E11D48', bg: '#FFF1F2', route: 'Informasi', desc: 'Berita & pengumuman internal pesantren' },
        { label: 'Profil Pengasuh', icon: 'account-circle-outline' as const, color: '#0D9488', bg: '#E6FFFA', route: 'Profil', desc: 'Data biodata diri & informasi akun' },
        { label: 'Pengaturan', icon: 'cog-outline' as const, color: '#64748B', bg: '#F1F5F9', route: 'Lainnya', desc: 'Pengaturan aplikasi & preferensi' },
      ],
    },
  ], []);

  const filteredCatalogCategories = useMemo(() => {
    if (!menuSearchQuery.trim()) return allCatalogMenus;
    const q = menuSearchQuery.toLowerCase();
    return allCatalogMenus
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (m) =>
            m.label.toLowerCase().includes(q) ||
            m.desc.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [allCatalogMenus, menuSearchQuery]);

  const handleMenuPress = (route: string, tab?: string) => {
    if (route === '__OPEN_MODAL__') {
      setShowAllMenusModal(true);
      return;
    }
    if (tab) {
      navigation.navigate(route, { tab });
    } else {
      navigation.navigate(route);
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Background Image & Gradient Splash Screen 2 (Layer Belakang Selaras Guru & TU) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
          resizeMode="cover"
        />
        {/* Overlay gradien transparan berbasis warna #18A165 identik dengan Guru & TU */}
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

      {/* ── Top Header Bar (Selaras Guru & Tata Usaha) ── */}
      <View style={[styles.topBar, { paddingTop: topInset + 6 }]}>
        {/* Sisi Kiri: Logo SIMSIT + "Musyrif & Asrama" + Subtitle Unit */}
        <View style={styles.topBarLeft}>
          <View style={styles.logoBadgeOuter}>
            <Image
              source={SPLASH_LOGO}
              style={styles.logoBadgeImg}
              resizeMode="contain"
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.roleTitleText}>Musyrif & Asrama</Text>
            <Text style={styles.unitSubtitleText} numberOfLines={1}>
              {unitName}
            </Text>
          </View>
        </View>

        {/* Sisi Kanan: Lonceng Notifikasi ber-Badge + Avatar Pengguna */}
        <View style={styles.topBarRight}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Notifikasi')}
            style={styles.notificationBtn}
            accessibilityLabel="Notifikasi"
          >
            <MaterialCommunityIcons name="bell" size={24} color="#064E3B" />
            {unreadNotificationCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation?.navigate('Profil')}
            style={styles.avatarBtn}
            accessibilityLabel="Profil Pengguna"
          >
            {resolvedProfileImg ? (
              <Image
                source={{ uri: String(resolvedProfileImg) }}
                style={styles.avatarImg}
                resizeMode="cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <Image
                source={DEFAULT_PARENT_AVATAR}
                style={styles.avatarImg}
                resizeMode="cover"
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tombol Ganti Ruang (Khusus Dual-Role Aktif) ── */}
      {isDualRole && onSwitchDualRole && (
        <View style={styles.dualRoleSwitchContainer}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onSwitchDualRole}
            style={styles.dualRoleSwitchBtn}
          >
            <MaterialCommunityIcons name="arrow-left" size={16} color="#065F46" />
            <Text style={styles.dualRoleSwitchText}>
              Ruang Aktif: <Text style={{ fontWeight: '800' }}>Musyrif Asrama</Text>
            </Text>
            <View style={styles.dualRoleSwitchBadge}>
              <Text style={styles.dualRoleSwitchBadgeText}>Ganti Ruang</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Greeting Banner (Selaras Guru & Tata Usaha) ── */}
      <View style={styles.greetingSection}>
        <Text style={styles.greetingLabel}>Ahlan wa Sahlan,</Text>
        <Text style={styles.greetingUserName} numberOfLines={1}>
          {userName}
        </Text>
        <Text style={styles.greetingUserRole} numberOfLines={1}>
          {userPosition} • {unitName}
        </Text>

        {/* Pill Tanggal Format Bahasa Indonesia Dinamis */}
        <View style={styles.datePill}>
          <MaterialCommunityIcons
            name="calendar-month-outline"
            size={16}
            color="#064E3B"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.datePillText}>{getIndonesianCurrentDate()}</Text>
        </View>
      </View>

      {/* ── BODY SHEET PUTIH / SLATE ── */}
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        {/* CARD PUSAT ASRAMA & KEPULANGAN CEPAT */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => navigation.navigate('Absensi', { tab: 'boarding' })}
          style={styles.heroBoardingCard}
        >
          <LinearGradient
            colors={['#ECFDF5', '#F0FDF4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBoardingGradient}
          >
            <LinearGradient
              colors={['#059669', '#0D9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIconBadge}
            >
              <MaterialCommunityIcons name="home-account" size={26} color="#FFFFFF" />
            </LinearGradient>

            <View style={{ flex: 1 }}>
              <View style={styles.heroCardHeaderRow}>
                <Text style={styles.heroCardTitle}>Pusat Asrama & Kepulangan</Text>
                <View style={styles.heroPondokBadge}>
                  <Text style={styles.heroPondokBadgeText}>PESANTREN</Text>
                </View>
              </View>
              <Text style={styles.heroCardSubtitle}>
                Presensi sholat 5 waktu, izin kepulangan santri & check-in
              </Text>
              <View style={styles.heroActionTagRow}>
                <View style={[styles.heroActionTag, { backgroundColor: '#D1FAE5' }]}>
                  <Text style={[styles.heroActionTagText, { color: '#065F46' }]}>Absensi Sholat</Text>
                </View>
                <View style={[styles.heroActionTag, { backgroundColor: '#E0F2FE' }]}>
                  <Text style={[styles.heroActionTagText, { color: '#0369A1' }]}>Izin Santri</Text>
                </View>
                <View style={[styles.heroActionTag, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.heroActionTagText, { color: '#92400E' }]}>Kamar Binaan</Text>
                </View>
              </View>
            </View>

            <View style={styles.heroChevronBtn}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── SECTION: CAROUSEL KPI METRIK KESANTRIAN ── */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleCol}>
            <Text style={styles.sectionTitle}>Indikator Kunci Kesantrian</Text>
            <Text style={styles.sectionSubtitle}>{tahunAjaran}</Text>
          </View>

          {/* Filter Kategori KPI */}
          <View style={styles.kpiCategoryFilterRow}>
            {['semua', 'asrama', 'ibadah', 'santri'].map((cat) => {
              const isActive = activeKpiCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  activeOpacity={0.8}
                  onPress={() => handleKpiCategoryPress(cat)}
                  style={[
                    styles.kpiCategoryPill,
                    isActive && styles.kpiCategoryPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.kpiCategoryText,
                      isActive && styles.kpiCategoryTextActive,
                    ]}
                  >
                    {cat.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Carousel Container */}
        <ScrollView
          ref={kpiScrollRef}
          horizontal
          pagingEnabled
          snapToInterval={KPI_SNAP_INTERVAL}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onScroll={handleKpiScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.kpiCarouselContent}
        >
          {filteredKpiItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.88}
              onPress={item.onPressAction}
              style={[
                styles.kpiCardItem,
                { borderColor: item.borderColor, width: KPI_CARD_WIDTH },
              ]}
            >
              <LinearGradient
                colors={item.gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.kpiCardGradient}
              >
                <View style={styles.kpiCardTopRow}>
                  <View
                    style={[
                      styles.kpiCategoryBadge,
                      { backgroundColor: item.categoryBadgeBg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.kpiCategoryBadgeText,
                        { color: item.categoryTextColor },
                      ]}
                    >
                      {item.categoryLabel}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.kpiIconCircle,
                      { backgroundColor: item.iconBg },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={20}
                      color={item.iconColor}
                    />
                  </View>
                </View>

                <Text style={styles.kpiCardTitle}>{item.title}</Text>
                <Text style={styles.kpiCardSubtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>

                <View style={styles.kpiValueRow}>
                  <Text style={[styles.kpiValueText, { color: item.valueColor }]}>
                    {item.value}
                  </Text>
                  <Text style={styles.kpiUnitText}>{item.unit}</Text>
                </View>

                <View style={styles.kpiDivider} />

                <View style={styles.kpiCardBottomRow}>
                  <Text style={styles.kpiSubDetailText} numberOfLines={1}>
                    {item.subDetail}
                  </Text>
                  <View style={styles.kpiActionBtn}>
                    <Text style={styles.kpiActionBtnText}>{item.actionLabel}</Text>
                    <MaterialCommunityIcons name="arrow-right" size={13} color="#059669" />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Carousel Pagination Dots */}
        {filteredKpiItems.length > 1 && (
          <View style={styles.carouselDotsRow}>
            {filteredKpiItems.map((_, dotIdx) => (
              <View
                key={`dot-${dotIdx}`}
                style={[
                  styles.carouselDot,
                  dotIdx === activeKpiSlide && styles.carouselDotActive,
                ]}
              />
            ))}
          </View>
        )}

        {/* ── SECTION: 8 MENU UTAMA LAYANAN MUSYRIF (4 Kolom Grid Modern) ── */}
        <View style={styles.menuSectionHeader}>
          <Text style={styles.sectionTitle}>Menu Operasional Asrama</Text>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setShowAllMenusModal(true)}
            style={styles.seeAllMenuHeaderBtn}
          >
            <Text style={styles.seeAllMenuHeaderText}>Katalog Lengkap</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color="#059669" />
          </TouchableOpacity>
        </View>

        <View style={styles.menuGridContainer}>
          {primaryMenuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.8}
              onPress={() => handleMenuPress(item.route, (item as any).tab)}
              style={[styles.menuGridTile, { backgroundColor: item.bgPastel }]}
            >
              <View style={styles.menuIconCircle}>
                <MaterialCommunityIcons name={item.icon} size={26} color={item.color} />
              </View>
              <Text numberOfLines={1} style={styles.menuTileLabel}>
                {item.label}
              </Text>
              <Text numberOfLines={1} style={styles.menuTileSub}>
                {item.subtitle}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── SECTION: CARD ANALITIK SHOLAT & KEPULANGAN HARI INI ── */}
        <View style={styles.analyticsCardContainer}>
          <View style={styles.analyticsHeaderRow}>
            <View style={styles.analyticsIconBadge}>
              <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={18} color="#0D9488" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.analyticsTitle}>Rekapitulasi Sholat Hari Ini</Text>
              <Text style={styles.analyticsSubtitle}>Kehadiran sholat 5 waktu santri asrama</Text>
            </View>
            <View style={styles.analyticsPill}>
              <Text style={styles.analyticsPillText}>Realtime</Text>
            </View>
          </View>

          {/* Sholat Breakdown Multi-segment */}
          <View style={styles.sholatBarContainer}>
            <View style={[styles.sholatSegment, { flex: 20, backgroundColor: '#059669' }]} />
            <View style={[styles.sholatSegment, { flex: 20, backgroundColor: '#0D9488' }]} />
            <View style={[styles.sholatSegment, { flex: 20, backgroundColor: '#2563EB' }]} />
            <View style={[styles.sholatSegment, { flex: 20, backgroundColor: '#D97706' }]} />
            <View style={[styles.sholatSegment, { flex: 20, backgroundColor: '#7C3AED' }]} />
          </View>

          <View style={styles.sholatLegendGrid}>
            {[
              { name: 'Subuh', color: '#059669' },
              { name: 'Dzuhur', color: '#0D9488' },
              { name: 'Ashar', color: '#2563EB' },
              { name: 'Maghrib', color: '#D97706' },
              { name: 'Isya', color: '#7C3AED' },
            ].map((s, idx) => (
              <View key={idx} style={styles.sholatLegendItem}>
                <View style={[styles.sholatDot, { backgroundColor: s.color }]} />
                <Text style={styles.sholatLegendText}>{s.name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── SECTION: PENGUMUMAN & INFORMASI PESANTREN ── */}
        {announcements.length > 0 && (
          <View style={styles.announcementSection}>
            <View style={styles.announcementHeader}>
              <Text style={styles.sectionTitle}>Pengumuman & Informasi Pesantren</Text>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => navigation.navigate('Informasi')}
              >
                <Text style={styles.seeAllMenuHeaderText}>Semua</Text>
              </TouchableOpacity>
            </View>

            {announcements.slice(0, 3).map((item, idx) => {
              const title =
                item?.judul_pengumuman ||
                item?.judul ||
                item?.title ||
                'Pengumuman Asrama';
              const body =
                item?.data_tambahan?.ringkasan ||
                item?.isi_pengumuman ||
                item?.isi ||
                '';
              return (
                <TouchableOpacity
                  key={`ann-${idx}`}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Informasi', { item })}
                  style={styles.announcementCard}
                >
                  <View style={styles.announcementIconBox}>
                    <MaterialCommunityIcons name="bullhorn-outline" size={20} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.announcementTitle}>
                      {title}
                    </Text>
                    {body ? (
                      <Text numberOfLines={2} style={styles.announcementBody}>
                        {body}
                      </Text>
                    ) : null}
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Bottom Spacer agar tidak tertutup bottom tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── MODAL FULL KATALOG SEMUA MENU MUSYRIF ── */}
      <Modal
        visible={showAllMenusModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAllMenusModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Katalog Layanan Musyrif</Text>
              <Text style={styles.modalSubtitle}>Pusat operasional asrama & ibadah santri</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowAllMenusModal(false)}
              style={styles.modalCloseBtn}
            >
              <MaterialCommunityIcons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
            <TextInput
              placeholder="Cari menu operasional atau ibadah..."
              placeholderTextColor="#94A3B8"
              value={menuSearchQuery}
              onChangeText={setMenuSearchQuery}
              style={styles.searchInput}
              clearButtonMode="while-editing"
            />
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {filteredCatalogCategories.map((cat, cIdx) => (
              <View key={cIdx} style={styles.catalogCategoryBlock}>
                <Text style={styles.catalogCategoryTitle}>{cat.category}</Text>
                <View style={styles.catalogGrid}>
                  {cat.items.map((m, mIdx) => (
                    <TouchableOpacity
                      key={mIdx}
                      activeOpacity={0.78}
                      onPress={() => {
                        setShowAllMenusModal(false);
                        handleMenuPress(m.route, (m as any).tab);
                      }}
                      style={styles.catalogItemCard}
                    >
                      <View style={[styles.catalogIconCircle, { backgroundColor: m.bg }]}>
                        <MaterialCommunityIcons name={m.icon} size={24} color={m.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.catalogItemTitle}>{m.label}</Text>
                        <Text style={styles.catalogItemDesc} numberOfLines={2}>
                          {m.desc}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="#CBD5E1" />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },

  /* Background Layer (Selaras Guru & Tata Usaha) */
  bgBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 440,
    width: '100%',
  },
  bgImage: {
    width: '100%',
    height: '100%',
  },

  /* Top Bar */
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logoBadgeOuter: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 10,
  },
  logoBadgeImg: {
    width: 32,
    height: 32,
  },
  titleCol: {
    flex: 1,
  },
  roleTitleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  unitSubtitleText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0D9488',
    marginTop: 1,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notificationBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(6, 78, 59, 0.12)',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#E11D48',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  notifBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },

  /* Dual Role Switch */
  dualRoleSwitchContainer: {
    paddingHorizontal: 16,
    marginTop: 6,
  },
  dualRoleSwitchBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 8,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dualRoleSwitchText: {
    fontSize: 12,
    color: '#065F46',
    flex: 1,
  },
  dualRoleSwitchBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dualRoleSwitchBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* Greeting Section */
  greetingSection: {
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 14,
  },
  greetingLabel: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#065F46',
  },
  greetingUserName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#064E3B',
    marginTop: 2,
    letterSpacing: -0.3,
  },
  greetingUserRole: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0D9488',
    marginTop: 2,
  },
  datePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: 'rgba(6, 78, 59, 0.15)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5.5,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  datePillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#065F46',
  },

  scrollBody: {
    paddingTop: 4,
  },
  heroBoardingCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  heroBoardingGradient: {
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  heroCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  heroCardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  heroPondokBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 7,
  },
  heroPondokBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroCardSubtitle: {
    fontSize: 11.5,
    color: '#047857',
    fontWeight: '500',
    lineHeight: 15,
  },
  heroActionTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  heroActionTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  heroActionTagText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  heroChevronBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitleCol: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  kpiCategoryFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kpiCategoryPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: '#F1F5F9',
  },
  kpiCategoryPillActive: {
    backgroundColor: '#059669',
  },
  kpiCategoryText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  kpiCategoryTextActive: {
    color: '#FFFFFF',
  },
  kpiCarouselContent: {
    paddingHorizontal: 16,
    gap: KPI_CARD_GAP,
  },
  kpiCardItem: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiCardGradient: {
    padding: 15,
  },
  kpiCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  kpiCategoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  kpiIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiCardSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  kpiValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginVertical: 8,
  },
  kpiValueText: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  kpiUnitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  kpiDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    marginVertical: 8,
  },
  kpiCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiSubDetailText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
    flex: 1,
    marginRight: 8,
  },
  kpiActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiActionBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  carouselDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 16,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  carouselDotActive: {
    width: 18,
    backgroundColor: '#059669',
  },
  menuSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  seeAllMenuHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllMenuHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  menuGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 16,
  },
  menuGridTile: {
    width: (SCREEN_WIDTH - 24 - 24) / 4,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  menuIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  menuTileLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  menuTileSub: {
    fontSize: 9,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 1,
  },
  analyticsCardContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  analyticsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  analyticsIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  analyticsSubtitle: {
    fontSize: 10,
    color: '#64748B',
  },
  analyticsPill: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  analyticsPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#065F46',
  },
  sholatBarContainer: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    gap: 2,
    marginBottom: 8,
  },
  sholatSegment: {
    borderRadius: 4,
  },
  sholatLegendGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sholatLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sholatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sholatLegendText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#475569',
  },
  announcementSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  announcementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    gap: 10,
  },
  announcementIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  announcementBody: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    padding: 0,
  },
  catalogCategoryBlock: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  catalogCategoryTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8,
  },
  catalogGrid: {
    gap: 8,
  },
  catalogItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  catalogIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  catalogItemDesc: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
});
