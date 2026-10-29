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
import TuKpiDrilldownModal, { TuKpiType } from './TuKpiDrilldownModal';
import { getProfileImageUrl, DEFAULT_PARENT_AVATAR } from '../../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const KPI_CARD_WIDTH = Math.min(SCREEN_WIDTH - 44, 340);
const KPI_CARD_GAP = 12;
const KPI_SNAP_INTERVAL = KPI_CARD_WIDTH + KPI_CARD_GAP;

interface TuKpiCarouselItem {
  id: string;
  category: 'pokok' | 'presensi' | 'layanan' | 'berkas';
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
  kpiType: TuKpiType;
  absensiTab?: 'siswa_hadir' | 'siswa_belum_absen' | 'pegawai';
  actionLabel: string;
}

// Background Image: Identik dengan Splash Screen 2
const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');
const SPLASH_LOGO = require('../../../assets/launcher_source.png');

interface TuHomeScreenViewProps {
  user: any;
  dashboard: Record<string, any>;
  navigation: any;
  announcements?: any[];
  topInset?: number;
  unreadNotificationCount?: number;
}

/**
 * Format tanggal hari ini dalam format Bahasa Indonesia:
 * Contoh: "Senin, 14 April 2025" atau "Selasa, 27 Oktober 2026"
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

/**
 * Mini Bar Chart untuk Analitik Hari Ini
 */
interface InteractiveStatCardProps {
  data: any[];
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconBg: string;
  iconColor: string;
  onPress: () => void;
}

function InteractiveStatCard({
  data,
  title,
  subtitle,
  icon,
  iconBg,
  iconColor,
  onPress,
}: InteractiveStatCardProps) {
  const total = data.reduce((s: number, d: any) => s + (d.value || 0), 0);
  if (!total || total === 0) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={chartStyles.interactiveCard}
    >
      {/* Header Baris Card */}
      <View style={chartStyles.cardTopRow}>
        <View style={[chartStyles.iconBadge, { backgroundColor: iconBg }]}>
          <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={chartStyles.titleRow}>
            <Text style={chartStyles.cardTitle}>{title}</Text>
            <View style={chartStyles.totalPill}>
              <Text style={chartStyles.totalPillText}>{total} Total</Text>
            </View>
          </View>
          <Text style={chartStyles.cardSubtitle}>{subtitle}</Text>
        </View>
        <View style={chartStyles.actionChevron}>
          <Text style={chartStyles.actionText}>Rincian</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color="#0D9488" />
        </View>
      </View>

      {/* Progress Bar Multi-Segment Proporsional */}
      <View style={chartStyles.barTrack}>
        {data.map((d: any, i: number) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <View
              key={i}
              style={[
                chartStyles.barSegment,
                { flex: pct, backgroundColor: d.color || '#94A3B8' },
                i === 0 && chartStyles.barFirst,
                i === data.length - 1 && chartStyles.barLast,
              ]}
            />
          );
        })}
      </View>

      {/* Legend & Persentase Rinci */}
      <View style={chartStyles.legendGrid}>
        {data.map((d: any, i: number) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <View key={i} style={chartStyles.legendBadge}>
              <View style={[chartStyles.dot, { backgroundColor: d.color || '#94A3B8' }]} />
              <Text style={chartStyles.legendName}>{d.name}</Text>
              <Text style={chartStyles.legendVal}>
                {d.value} <Text style={chartStyles.legendPct}>({pct}%)</Text>
              </Text>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}

const chartStyles = StyleSheet.create({
  interactiveCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 13,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  totalPill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  totalPillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },
  actionChevron: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 2,
  },
  actionText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D9488',
  },
  barTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  barSegment: {
    height: 10,
  },
  barFirst: {
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  },
  barLast: {
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  legendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#334155',
  },
  legendVal: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
  },
  legendPct: {
    fontSize: 9.5,
    fontWeight: '500',
    color: '#64748B',
  },
});

/**
 * TuHomeScreenView
 * Halaman utama role akses Tata Usaha (TU):
 * - Background Splash Screen 2 (gedung sekolah & kubah masjid + overlay gradien #18A165)
 * - Top Header: Logo sekolah, Title "Tata Usaha", Unit Sekolah dinamis, Notification Bell, Avatar Profil
 * - Greeting Banner: "Selamat datang,", Nama User dinamis, Role dinamis, Pill Tanggal Indonesia dinamis
 * - Card Kelola Data Sekolah: TA aktif & Unit sekolah
 * - Baris 1: 4 Metrik Cepat (Total Siswa, Pengajuan Surat, Pembayaran Hari Ini, Tugas Menunggu)
 * - Baris 2: Data Pokok (Total Siswa L/P & Total Pegawai L/P)
 * - Baris 3: Presensi Hari Ini (Siswa Hadir, Belum Absen, Guru Hadir)
 * - Baris 4: Kelengkapan Berkas (Siswa Belum Lengkap & Pegawai Belum Lengkap)
 * - Baris 5: Menu Utama (7 Menu Utama + 1 Menu "Semua Menu" -> Modal Pop-up Katalog Lengkap)
 * - Baris 6: Card Grafik Analitik Hari Ini (Komposisi Kehadiran, Gender, Kelengkapan)
 * - Baris 7: Card Pengumuman Internal
 * - Padding bottom 120px untuk scroll tuntas tanpa terpotong Bottom Navigation
 * - Zero Hardcode: 100% dinamis terhubung ke database backend
 */
export default function TuHomeScreenView({
  user,
  dashboard,
  navigation,
  announcements = [],
  topInset = 0,
  unreadNotificationCount = 0,
}: TuHomeScreenViewProps) {
  const [activeKpiType, setActiveKpiType] = useState<TuKpiType | null>(null);
  const [activeAbsensiTab, setActiveAbsensiTab] = useState<'siswa_hadir' | 'siswa_belum_absen' | 'pegawai'>('siswa_hadir');
  const [showAllMenusModal, setShowAllMenusModal] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [avatarError, setAvatarError] = useState(false);
  const [activeKpiSlide, setActiveKpiSlide] = useState(0);
  const [activeKpiCategory, setActiveKpiCategory] = useState<string>('semua');
  const kpiScrollRef = useRef<ScrollView>(null);

  // --- Data Dinamis dari Backend / Auth Store ---
  const kpis = dashboard?.kpis || {};
  const charts = dashboard?.charts || {};
  const ctx = dashboard?.context || {};

  // 1. Identitas User & Unit
  const userName = user?.name || user?.nama || 'Staf Tata Usaha';
  const userPosition = user?.employee?.position?.name
    || user?.position
    || user?.role_name
    || 'Staf Tata Usaha';

  const unitName = ctx?.unit?.nama
    || ctx?.unit?.name
    || user?.unit?.name
    || user?.education_unit?.name
    || dashboard?.unit?.nama
    || dashboard?.unit?.name
    || 'Unit Madrasah';

  const tahunAjaran = ctx?.tahun_ajaran?.nama
    || ctx?.tahun_ajaran?.name
    || dashboard?.academic_year
    || 'Tahun Ajaran Aktif';

  // Resolusi Foto Profil Pengguna (Dinamis dari database dengan fallback default)
  const resolvedProfileImg = useMemo(() => {
    if (avatarError) return null;
    return getProfileImageUrl(user, dashboard);
  }, [user, dashboard, avatarError]);

  // 2. Nilai Seluruh KPI dari Database (100% Dinamis)
  const totalSiswa = kpis?.total_siswa?.total ?? 0;
  const siswaLaki = kpis?.total_siswa?.laki_laki ?? 0;
  const siswaPerempuan = kpis?.total_siswa?.perempuan ?? 0;

  const totalPegawai = kpis?.total_pegawai?.total ?? 0;
  const pegawaiLaki = kpis?.total_pegawai?.laki_laki ?? 0;
  const pegawaiPerempuan = kpis?.total_pegawai?.perempuan ?? 0;

  const siswaHadir = kpis?.absensi_hari_ini?.siswa_hadir ?? 0;
  const siswaBelumAbsen = kpis?.absensi_hari_ini?.siswa_belum_absen ?? 0;
  const pegawaiHadir = kpis?.absensi_hari_ini?.guru_hadir ?? kpis?.absensi_hari_ini?.pegawai_hadir ?? 0;

  const siswaIncomplete = kpis?.siswa_incomplete?.total ?? 0;
  const pegawaiIncomplete = kpis?.pegawai_incomplete?.total ?? 0;

  const pengajuanSurat = kpis?.pengajuan_surat?.total ?? 0;
  const pembayaranHariIni = kpis?.pembayaran_hari_ini?.total ?? 0;
  const tugasMenunggu = kpis?.tugas_menunggu?.total ?? (siswaIncomplete + pegawaiIncomplete);

  // ── Daftar Kartu KPI Carousel Interaktif (100% Dinamis dari Database Backend) ──
  const kpiCarouselItems = useMemo<TuKpiCarouselItem[]>(() => [
    {
      id: 'total_siswa',
      category: 'pokok',
      categoryLabel: 'Data Pokok',
      categoryBadgeBg: '#DBEAFE',
      categoryTextColor: '#1D4ED8',
      title: 'Total Siswa Aktif',
      subtitle: `Santri terdaftar aktif di ${unitName}`,
      value: totalSiswa,
      unit: 'Siswa',
      icon: 'account-school-outline',
      iconBg: '#2563EB',
      iconColor: '#FFFFFF',
      gradientColors: ['#EFF6FF', '#DBEAFE'],
      borderColor: '#93C5FD',
      valueColor: '#1D4ED8',
      subDetail: `L: ${siswaLaki}   •   P: ${siswaPerempuan}`,
      kpiType: 'total_siswa',
      actionLabel: 'Lihat Rincian',
    },
    {
      id: 'total_pegawai',
      category: 'pokok',
      categoryLabel: 'SDM & Pendidik',
      categoryBadgeBg: '#CFFAFE',
      categoryTextColor: '#0E7490',
      title: 'Total Pegawai & Guru',
      subtitle: 'Tenaga pendidik & kependidikan aktif',
      value: totalPegawai,
      unit: 'Staf',
      icon: 'badge-account-outline',
      iconBg: '#0891B2',
      iconColor: '#FFFFFF',
      gradientColors: ['#ECFEFF', '#CFFAFE'],
      borderColor: '#67E8F9',
      valueColor: '#0E7490',
      subDetail: `L: ${pegawaiLaki}   •   P: ${pegawaiPerempuan}`,
      kpiType: 'total_pegawai',
      actionLabel: 'Lihat Rincian',
    },
    {
      id: 'siswa_hadir',
      category: 'presensi',
      categoryLabel: 'Presensi Hari Ini',
      categoryBadgeBg: '#CCFBF1',
      categoryTextColor: '#0F766E',
      title: 'Siswa Hadir Hari Ini',
      subtitle: 'Tercatat masuk gerbang & kelas',
      value: siswaHadir,
      unit: 'Siswa',
      icon: 'door-open',
      iconBg: '#0D9488',
      iconColor: '#FFFFFF',
      gradientColors: ['#F0FDFA', '#CCFBF1'],
      borderColor: '#99F6E4',
      valueColor: '#0F766E',
      subDetail: 'Tercatat hadir tepat waktu / KBM',
      kpiType: 'absensi_hari_ini',
      absensiTab: 'siswa_hadir',
      actionLabel: 'Log Kehadiran',
    },
    {
      id: 'siswa_belum_absen',
      category: 'presensi',
      categoryLabel: 'Presensi Hari Ini',
      categoryBadgeBg: '#FEF3C7',
      categoryTextColor: '#B45309',
      title: 'Siswa Belum Absen',
      subtitle: 'Belum terdata hadir di gerbang',
      value: siswaBelumAbsen,
      unit: 'Siswa',
      icon: 'account-clock-outline',
      iconBg: '#D97706',
      iconColor: '#FFFFFF',
      gradientColors: ['#FFFBEB', '#FEF3C7'],
      borderColor: '#FCD34D',
      valueColor: '#B45309',
      subDetail: 'Perlu konfirmasi status kehadiran',
      kpiType: 'absensi_hari_ini',
      absensiTab: 'siswa_belum_absen',
      actionLabel: 'Cek Siswa',
    },
    {
      id: 'pegawai_hadir',
      category: 'presensi',
      categoryLabel: 'Presensi Hari Ini',
      categoryBadgeBg: '#E0E7FF',
      categoryTextColor: '#3730A3',
      title: 'Guru & Tendik Hadir',
      subtitle: 'Pendidik & staf di sekolah hari ini',
      value: pegawaiHadir,
      unit: 'Staf',
      icon: 'account-tie-outline',
      iconBg: '#4F46E5',
      iconColor: '#FFFFFF',
      gradientColors: ['#EEF2FF', '#E0E7FF'],
      borderColor: '#C7D2FE',
      valueColor: '#3730A3',
      subDetail: 'Staf pengajar & kependidikan hadir',
      kpiType: 'absensi_hari_ini',
      absensiTab: 'pegawai',
      actionLabel: 'Presensi SDM',
    },
    {
      id: 'pengajuan_surat',
      category: 'layanan',
      categoryLabel: 'Layanan Persuratan',
      categoryBadgeBg: '#FFE4E6',
      categoryTextColor: '#BE123C',
      title: 'Pengajuan Surat',
      subtitle: 'Permohonan surat keterangan & mutasi',
      value: pengajuanSurat,
      unit: 'Berkas',
      icon: 'email-edit-outline',
      iconBg: '#E11D48',
      iconColor: '#FFFFFF',
      gradientColors: ['#FFF1F2', '#FFE4E6'],
      borderColor: '#FECDD3',
      valueColor: '#BE123C',
      subDetail: 'Menunggu proses & cetak TU',
      kpiType: 'pengajuan_surat',
      actionLabel: 'Proses Surat',
    },
    {
      id: 'pembayaran_hari_ini',
      category: 'layanan',
      categoryLabel: 'Keuangan & Kasir',
      categoryBadgeBg: '#D1FAE5',
      categoryTextColor: '#047857',
      title: 'Pembayaran Hari Ini',
      subtitle: 'SPP & transaksi terverifikasi',
      value: pembayaranHariIni,
      unit: 'Transaksi',
      icon: 'cash-check',
      iconBg: '#059669',
      iconColor: '#FFFFFF',
      gradientColors: ['#ECFDF5', '#D1FAE5'],
      borderColor: '#A7F3D0',
      valueColor: '#047857',
      subDetail: 'Penerimaan kas & VA harian',
      kpiType: 'pembayaran_hari_ini',
      actionLabel: 'Rekap Kasir',
    },
    {
      id: 'tugas_menunggu',
      category: 'layanan',
      categoryLabel: 'Antrean Tugas TU',
      categoryBadgeBg: '#EDE9FE',
      categoryTextColor: '#5B21B6',
      title: 'Tugas Menunggu',
      subtitle: 'Disposisi & tinjauan administrasi',
      value: tugasMenunggu,
      unit: 'Antrean',
      icon: 'clipboard-clock-outline',
      iconBg: '#7C3AED',
      iconColor: '#FFFFFF',
      gradientColors: ['#F5F3FF', '#EDE9FE'],
      borderColor: '#DDD6FE',
      valueColor: '#5B21B6',
      subDetail: 'Perlu validasi staf tata usaha',
      kpiType: 'tugas_menunggu',
      actionLabel: 'Buka Tugas',
    },
    {
      id: 'siswa_incomplete',
      category: 'berkas',
      categoryLabel: 'Kelengkapan Berkas',
      categoryBadgeBg: '#FEF3C7',
      categoryTextColor: '#92400E',
      title: 'Siswa Belum Lengkap',
      subtitle: 'NISN, NIK, KK, atau Data Wali kosong',
      value: siswaIncomplete,
      unit: 'Santri',
      icon: 'account-alert-outline',
      iconBg: '#F59E0B',
      iconColor: '#FFFFFF',
      gradientColors: ['#FFFBEB', '#FEF3C7'],
      borderColor: '#FCD34D',
      valueColor: '#92400E',
      subDetail: 'Perlu pembaruan data pokok siswa',
      kpiType: 'siswa_incomplete',
      actionLabel: 'Perbaiki Berkas',
    },
    {
      id: 'pegawai_incomplete',
      category: 'berkas',
      categoryLabel: 'Kelengkapan Berkas',
      categoryBadgeBg: '#FEE2E2',
      categoryTextColor: '#991B1B',
      title: 'Pegawai Belum Lengkap',
      subtitle: 'NIY, NIK, atau berkas SDM belum diisi',
      value: pegawaiIncomplete,
      unit: 'Staf',
      icon: 'card-account-details-outline',
      iconBg: '#EF4444',
      iconColor: '#FFFFFF',
      gradientColors: ['#FEF2F2', '#FEE2E2'],
      borderColor: '#FECACA',
      valueColor: '#991B1B',
      subDetail: 'Perlu verifikasi berkas kepegawaian',
      kpiType: 'pegawai_incomplete',
      actionLabel: 'Perbaiki Berkas',
    },
  ], [
    unitName,
    totalSiswa,
    siswaLaki,
    siswaPerempuan,
    totalPegawai,
    pegawaiLaki,
    pegawaiPerempuan,
    siswaHadir,
    siswaBelumAbsen,
    pegawaiHadir,
    pengajuanSurat,
    pembayaranHariIni,
    tugasMenunggu,
    siswaIncomplete,
    pegawaiIncomplete,
  ]);

  // Tab Kategori Cepat untuk Navigasi Carousel
  const KPI_CATEGORIES = useMemo(() => [
    { id: 'semua', label: 'Semua (10)', index: 0, icon: 'view-grid-outline' as const },
    { id: 'pokok', label: 'Data Pokok (2)', index: 0, icon: 'account-school-outline' as const },
    { id: 'presensi', label: 'Presensi (3)', index: 2, icon: 'clock-check-outline' as const },
    { id: 'layanan', label: 'Layanan & Kas (3)', index: 5, icon: 'cash-multiple' as const },
    { id: 'berkas', label: 'Berkas (2)', index: 8, icon: 'file-alert-outline' as const },
  ], []);

  const handleSelectKpiCategory = (cat: typeof KPI_CATEGORIES[0]) => {
    setActiveKpiCategory(cat.id);
    setActiveKpiSlide(cat.index);
    kpiScrollRef.current?.scrollTo({
      x: cat.index * KPI_SNAP_INTERVAL,
      animated: true,
    });
  };

  const handleScrollToKpiSlide = (idx: number) => {
    const clamped = Math.max(0, Math.min(kpiCarouselItems.length - 1, idx));
    setActiveKpiSlide(clamped);
    kpiScrollRef.current?.scrollTo({
      x: clamped * KPI_SNAP_INTERVAL,
      animated: true,
    });
  };

  const handleKpiScrollEvent = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const newIdx = Math.max(0, Math.min(kpiCarouselItems.length - 1, Math.round(offsetX / KPI_SNAP_INTERVAL)));
    if (newIdx !== activeKpiSlide) {
      setActiveKpiSlide(newIdx);
      const currentItem = kpiCarouselItems[newIdx];
      if (currentItem && activeKpiCategory !== 'semua' && activeKpiCategory !== currentItem.category) {
        setActiveKpiCategory(currentItem.category);
      }
    }
  };

  const handleKpiCardPress = (item: TuKpiCarouselItem) => {
    if (item.absensiTab) {
      setActiveAbsensiTab(item.absensiTab);
    }
    setActiveKpiType(item.kpiType);
  };

  // 3. Tanggal Hari Ini Dinamis
  const currentDateFormatted = getIndonesianCurrentDate();

  // 4. Data Charts
  const chartAbsensi = Array.isArray(charts?.absensi_hari_ini) ? charts.absensi_hari_ini : [];
  const chartSiswaGender = Array.isArray(charts?.siswa_gender) ? charts.siswa_gender : [];
  const chartSiswaLengkap = Array.isArray(charts?.siswa_kelengkapan) ? charts.siswa_kelengkapan : [];
  const chartPegawaiLengkap = Array.isArray(charts?.pegawai_kelengkapan) ? charts.pegawai_kelengkapan : [];

  // 5. Pengumuman Aktif Dinamis
  const latestAnnouncement = announcements && announcements.length > 0 ? announcements[0] : null;
  const hasAnnouncement = Boolean(latestAnnouncement);
  const announcementTitle = latestAnnouncement?.title
    || latestAnnouncement?.judul
    || 'Belum ada warta terbaru hari ini.';
  const announcementSubtitle = latestAnnouncement?.content
    || latestAnnouncement?.isi
    || latestAnnouncement?.summary
    || 'Ketuk untuk melihat seluruh arsip warta & edaran resmi sekolah.';

  // Daftar Semua Menu untuk Modal Katalog Lengkap
  const allMenuGroups = [
    {
      groupTitle: 'Presensi & Kehadiran',
      groupIcon: 'clock-check-outline',
      groupColor: '#0D9488',
      items: [
        { id: 'absensi_gerbang', label: 'Absensi Gerbang Terminal', icon: 'door-open', color: '#0D9488', screen: 'AbsensiGerbangTerminal' },
        { id: 'presensi_kbm', label: 'Presensi KBM Kelas', icon: 'calendar-check-outline', color: '#059669', screen: 'PresensiKbmPengganti' },
        { id: 'rekap_siswa', label: 'Rekap Presensi Siswa', icon: 'clipboard-list-outline', color: '#059669', screen: 'RekapPresensiSiswa' },
        { id: 'presensi_mandiri', label: 'Presensi Mandiri Staf', icon: 'account-check-outline', color: '#10B981', screen: 'PresensiMandiriStaff' },
      ],
    },
    {
      groupTitle: 'Pembelajaran LMS & Asesmen',
      groupIcon: 'school-outline',
      groupColor: '#2563EB',
      items: [
        { id: 'jadwal', label: 'Jadwal Pelajaran', icon: 'clock-time-four', color: '#7C3AED', screen: 'Jadwal' },
        { id: 'materi', label: 'Bahan Ajar & Materi', icon: 'book-multiple', color: '#0D9488', screen: 'Materi' },
        { id: 'tugas', label: 'Tugas LMS Santri', icon: 'clipboard-text', color: '#F59E0B', screen: 'Tugas' },
        { id: 'kalender', label: 'Kalender Pendidikan KBM', icon: 'calendar-month', color: '#0284C7', screen: 'Kalender' },
        { id: 'cbt', label: 'Ujian CBT Online', icon: 'laptop', color: '#2563EB', screen: 'CbtExams' },
        { id: 'bank_soal', label: 'Bank Soal Terpadu', icon: 'database-outline', color: '#0D9488', screen: 'BankSoal' },
        { id: 'kisi_kisi', label: 'Kisi-Kisi Ujian', icon: 'file-question', color: '#EF4444', screen: 'KisiKisi' },
        { id: 'nilai', label: 'Leger & Nilai Siswa', icon: 'chart-box', color: '#10B981', screen: 'Nilai' },
      ],
    },
    {
      groupTitle: 'Data Pokok & Administrasi',
      groupIcon: 'folder-account-outline',
      groupColor: '#059669',
      items: [
        { id: 'buku_induk_siswa', label: 'Buku Induk Santri/Siswa', icon: 'account-school-outline', color: '#0284C7', screen: 'MasterSiswa' },
        { id: 'data_sdm_guru', label: 'Data SDM Guru & Pegawai', icon: 'account-group-outline', color: '#7C3AED', screen: 'Data', params: { initialResource: 'employees' } },
        { id: 'pantau_kelas', label: 'Manajemen Rombel & Kenaikan', icon: 'google-classroom', color: '#EA580C', screen: 'PantauKelas' },
        { id: 'alumni', label: 'Kelola Alumni & Mutasi', icon: 'account-switch-outline', color: '#D97706', screen: 'MutasiSiswa' },
        { id: 'tagihan', label: 'Tagihan & SPP Siswa', icon: 'cash-multiple', color: '#E11D48', screen: 'Tagihan' },
        { id: 'komentar', label: 'Catatan & Surat Siswa', icon: 'book-open-page-variant', color: '#8B5CF6', screen: 'Komentar' },
      ],
    },
    {
      groupTitle: 'Keagamaan & Komunikasi',
      groupIcon: 'book-open-variant',
      groupColor: '#7C3AED',
      items: [
        { id: 'al-quran', label: 'Al-Qur’an Al-Karim', icon: 'book-open-variant', color: '#2563EB', screen: 'Quran' },
        { id: 'chat', label: 'Chat & Koordinasi Pegawai', icon: 'message-text-outline', color: '#059669', screen: 'Chat Guru' },
        { id: 'informasi', label: 'Pusat Informasi & Berita', icon: 'bullhorn', color: '#E11D48', screen: 'Informasi' },
      ],
    },
  ];

  // Filter menu di dalam modal pencarian
  const filteredMenuGroups = useMemo(() => {
    if (!menuSearchQuery.trim()) return allMenuGroups;
    const q = menuSearchQuery.toLowerCase();
    return allMenuGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((item) => item.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [allMenuGroups, menuSearchQuery]);

  // Handler Menu Utama: Navigasi langsung menuju ke halaman layar modul masing-masing
  const handleMenuClick = (menuId: string) => {
    switch (menuId) {
      case 'data_siswa':
        navigation?.navigate('MasterSiswa');
        break;
      case 'data_guru':
        navigation?.navigate('Data', { initialResource: 'employees' });
        break;
      case 'presensi_gerbang':
        try {
          navigation?.navigate('AbsensiGerbangTerminal');
        } catch {
          navigation?.navigate('Absensi');
        }
        break;
      case 'tagihan_spp':
        navigation?.navigate('Tagihan');
        break;
      case 'surat_dokumen':
        try {
          navigation?.navigate('Komentar');
        } catch {
          navigation?.navigate('Data', { initialResource: 'letters' });
        }
        break;
      case 'jadwal_kbm':
        navigation?.navigate('Jadwal');
        break;
      case 'laporan_nilai':
        navigation?.navigate('Nilai');
        break;
      default:
        break;
    }
  };

  const handleNavigateFromModal = (screen: string, params?: any) => {
    setShowAllMenusModal(false);
    setTimeout(() => {
      try {
        if (params) {
          navigation?.navigate(screen, params);
        } else {
          navigation?.navigate(screen);
        }
      } catch {
        navigation?.navigate('Lainnya');
      }
    }, 200);
  };

  return (
    <View style={styles.container}>
      {/* ── Background Image & Gradient Splash Screen 2 (Layer Belakang) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
          resizeMode="cover"
        />
        {/* Overlay gradien berbasis warna #18A165 identik dengan Splash Screen 2 */}
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

      {/* ── Top Header Bar ── */}
      <View style={[styles.topBar, { paddingTop: topInset + 6 }]}>
        {/* Sisi Kiri: Logo Sekolah + "Tata Usaha" + Subtitle Unit */}
        <View style={styles.topBarLeft}>
          <View style={styles.logoBadgeOuter}>
            <Image
              source={SPLASH_LOGO}
              style={styles.logoBadgeImg}
              resizeMode="contain"
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.roleTitleText}>Tata Usaha</Text>
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

          {/* Avatar Profil: Ditampilkan dari DB jika ada, Fallback ke Default jika tidak ada */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation?.navigate('Profil')}
            style={styles.avatarBtn}
            accessibilityLabel="Profil Staf Tata Usaha"
          >
            {resolvedProfileImg ? (
              <Image
                source={{ uri: resolvedProfileImg }}
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

      {/* ── Greeting Banner ── */}
      <View style={styles.greetingSection}>
        <Text style={styles.greetingLabel}>Selamat datang,</Text>
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
          <Text style={styles.datePillText}>{currentDateFormatted}</Text>
        </View>
      </View>

      {/* ── Card Kelola Data Sekolah (Mint Hero Card) ── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => navigation?.navigate('Data', { initialResource: 'students' })}
        style={styles.kelolaHeroCard}
      >
        <LinearGradient colors={['#F0FDFA', '#CCFBF1']} style={styles.kelolaHeroGradient}>
          <View style={styles.kelolaHeroIconWrap}>
            <MaterialCommunityIcons name="database-cog-outline" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.kelolaHeroYearRow}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={12} color="#0D9488" />
              <Text style={styles.kelolaHeroYearText}>TA {tahunAjaran}</Text>
              <Text style={styles.kelolaHeroDot}>•</Text>
              <MaterialCommunityIcons name="domain" size={12} color="#0D9488" />
              <Text style={styles.kelolaHeroYearText} numberOfLines={1}>{unitName}</Text>
            </View>
            <Text style={styles.kelolaHeroTitle}>Kelola Data Sekolah</Text>
            <Text style={styles.kelolaHeroSub}>Akses cepat master data santri & pegawai</Text>
          </View>
          <View style={styles.kelolaHeroActionBtn}>
            <Text style={styles.kelolaHeroActionText}>Kelola</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color="#0D9488" />
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* ── Carousel Indikator Kinerja Utama (KPI) Interaktif ── */}
      <View style={styles.kpiCarouselSection}>
        {/* Header Carousel: Judul, Subtitle, Counter Pill & Tombol Navigasi Panah */}
        <View style={styles.kpiCarouselHeader}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={styles.kpiCarouselTitleRow}>
              <MaterialCommunityIcons name="view-carousel-outline" size={18} color="#0D9488" />
              <Text style={styles.kpiCarouselSectionTitle}>Indikator Kinerja (KPI)</Text>
              <View style={styles.kpiCounterPill}>
                <Text style={styles.kpiCounterText}>
                  {activeKpiSlide + 1} / {kpiCarouselItems.length}
                </Text>
              </View>
            </View>
            <Text style={styles.kpiCarouselSectionSub}>
              Pilih kategori atau ketuk kartu untuk rincian data
            </Text>
          </View>

          {/* Tombol Panah Kiri & Kanan */}
          <View style={styles.kpiNavArrowsRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={activeKpiSlide === 0}
              onPress={() => handleScrollToKpiSlide(activeKpiSlide - 1)}
              style={[
                styles.kpiNavArrowBtn,
                activeKpiSlide === 0 && styles.kpiNavArrowBtnDisabled,
              ]}
            >
              <MaterialCommunityIcons
                name="chevron-left"
                size={18}
                color={activeKpiSlide === 0 ? '#94A3B8' : '#0D9488'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={activeKpiSlide === kpiCarouselItems.length - 1}
              onPress={() => handleScrollToKpiSlide(activeKpiSlide + 1)}
              style={[
                styles.kpiNavArrowBtn,
                activeKpiSlide === kpiCarouselItems.length - 1 && styles.kpiNavArrowBtnDisabled,
              ]}
            >
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={activeKpiSlide === kpiCarouselItems.length - 1 ? '#94A3B8' : '#0D9488'}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Switcher Kategori KPI (Pill Cepat) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kpiCategoryScroll}
        >
          {KPI_CATEGORIES.map((cat) => {
            const isActive = activeKpiCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                activeOpacity={0.8}
                onPress={() => handleSelectKpiCategory(cat)}
                style={[
                  styles.kpiCategoryChip,
                  isActive && styles.kpiCategoryChipActive,
                ]}
              >
                <MaterialCommunityIcons
                  name={cat.icon}
                  size={14}
                  color={isActive ? '#FFFFFF' : '#0D9488'}
                />
                <Text
                  style={[
                    styles.kpiCategoryChipText,
                    isActive && styles.kpiCategoryChipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Track Kartu Carousel Geser / Swipe Horizontal */}
        <ScrollView
          ref={kpiScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={KPI_SNAP_INTERVAL}
          snapToAlignment="start"
          decelerationRate="fast"
          onMomentumScrollEnd={handleKpiScrollEvent}
          contentContainerStyle={styles.kpiCardsTrack}
        >
          {kpiCarouselItems.map((item, idx) => {
            const isCardActive = activeKpiSlide === idx;
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.88}
                onPress={() => handleKpiCardPress(item)}
                style={[
                  styles.kpiCarouselCard,
                  { width: KPI_CARD_WIDTH, borderColor: item.borderColor },
                  isCardActive && styles.kpiCarouselCardActive,
                ]}
              >
                <LinearGradient
                  colors={item.gradientColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.kpiCarouselGradient}
                >
                  {/* Baris Atas: Kategori Badge + Ikon Topik */}
                  <View style={styles.kpiCarouselTopRow}>
                    <View style={styles.kpiCarouselBadgeGroup}>
                      <View style={[styles.kpiCarouselCategoryBadge, { backgroundColor: item.categoryBadgeBg }]}>
                        <Text style={[styles.kpiCarouselCategoryText, { color: item.categoryTextColor }]}>
                          {item.categoryLabel}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.kpiCarouselIconWrap, { backgroundColor: item.iconBg }]}>
                      <MaterialCommunityIcons name={item.icon} size={18} color={item.iconColor} />
                    </View>
                  </View>

                  {/* Baris Nilai Besar & Judul Utama */}
                  <View style={styles.kpiCarouselMainBody}>
                    <View style={styles.kpiCarouselValueRow}>
                      <Text style={[styles.kpiCarouselValue, { color: item.valueColor }]}>
                        {typeof item.value === 'number' ? item.value.toLocaleString('id-ID') : item.value}
                      </Text>
                      <Text style={[styles.kpiCarouselUnit, { color: item.valueColor }]}>{item.unit}</Text>
                    </View>
                    <Text style={styles.kpiCarouselTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.kpiCarouselSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                  </View>

                  {/* Divider Halus */}
                  <View style={styles.kpiCarouselDivider} />

                  {/* Baris Bawah: Detail Breakdown & Tombol Aksi */}
                  <View style={styles.kpiCarouselBottomRow}>
                    <View style={styles.kpiCarouselDetailWrap}>
                      <MaterialCommunityIcons name="information-outline" size={13} color="#64748B" />
                      <Text style={styles.kpiCarouselDetailText} numberOfLines={1}>{item.subDetail}</Text>
                    </View>
                    <View style={styles.kpiCarouselActionBtn}>
                      <Text style={styles.kpiCarouselActionText}>{item.actionLabel}</Text>
                      <MaterialCommunityIcons name="chevron-right" size={14} color="#0D9488" />
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Indikator Titik / Dots Carousel */}
        <View style={styles.kpiDotsContainer}>
          {kpiCarouselItems.map((_, dotIdx) => {
            const isDotActive = activeKpiSlide === dotIdx;
            return (
              <TouchableOpacity
                key={`dot-${dotIdx}`}
                activeOpacity={0.7}
                onPress={() => handleScrollToKpiSlide(dotIdx)}
                style={[
                  styles.kpiDot,
                  isDotActive ? styles.kpiDotActive : styles.kpiDotInactive,
                ]}
              />
            );
          })}
        </View>
      </View>

      {/* ── Baris 5: Section Menu Utama (7 Menu Pilihan + 1 Menu "Semua Menu") ── */}
      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>Menu Utama</Text>

        <View style={styles.menuGrid}>
          {/* 1. Data Siswa */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleMenuClick('data_siswa')}
            style={styles.menuItemCard}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <MaterialCommunityIcons name="account-school-outline" size={24} color="#2563EB" />
            </View>
            <Text style={styles.menuItemLabel}>Buku Induk Siswa</Text>
          </TouchableOpacity>

          {/* 2. Data Guru */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleMenuClick('data_guru')}
            style={styles.menuItemCard}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <MaterialCommunityIcons name="human-male-board" size={24} color="#059669" />
            </View>
            <Text style={styles.menuItemLabel}>Data Guru</Text>
          </TouchableOpacity>

          {/* 3. Presensi Gerbang */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleMenuClick('presensi_gerbang')}
            style={styles.menuItemCard}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: '#F0FDFA' }]}>
              <MaterialCommunityIcons name="door-open" size={24} color="#0D9488" />
            </View>
            <Text style={styles.menuItemLabel}>Presensi Gerbang</Text>
          </TouchableOpacity>

          {/* 4. Tagihan & SPP */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleMenuClick('tagihan_spp')}
            style={styles.menuItemCard}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: '#FFF7ED' }]}>
              <MaterialCommunityIcons name="wallet-outline" size={24} color="#EA580C" />
            </View>
            <Text style={styles.menuItemLabel}>Pembayaran</Text>
          </TouchableOpacity>

          {/* 5. Surat & Dokumen */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleMenuClick('surat_dokumen')}
            style={styles.menuItemCard}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: '#F0FDF4' }]}>
              <MaterialCommunityIcons name="file-document-outline" size={24} color="#10B981" />
            </View>
            <Text style={styles.menuItemLabel}>Surat & Dokumen</Text>
          </TouchableOpacity>

          {/* 6. Jadwal & KBM */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleMenuClick('jadwal_kbm')}
            style={styles.menuItemCard}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: '#F0F9FF' }]}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={24} color="#0284C7" />
            </View>
            <Text style={styles.menuItemLabel}>Jadwal & KBM</Text>
          </TouchableOpacity>

          {/* 7. Laporan Nilai */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleMenuClick('laporan_nilai')}
            style={styles.menuItemCard}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: '#FAF5FF' }]}>
              <MaterialCommunityIcons name="chart-box-outline" size={24} color="#7C3AED" />
            </View>
            <Text style={styles.menuItemLabel}>Laporan Nilai</Text>
          </TouchableOpacity>

          {/* 8. Semua Menu (Memicu Modal Katalog Lengkap) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setShowAllMenusModal(true)}
            style={[styles.menuItemCard, styles.menuItemCardAccent]}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: '#E6F4EA' }]}>
              <MaterialCommunityIcons name="view-grid-plus" size={24} color="#0D5B41" />
            </View>
            <Text style={[styles.menuItemLabel, styles.menuItemLabelAccent]}>Semua Menu</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Baris 6: Section Card Grafik Analitik Hari Ini (Interaktif & Realtime Database) ── */}
      {(chartAbsensi.length > 0 || chartSiswaGender.length > 0 || chartSiswaLengkap.length > 0) && (
        <View style={styles.chartCardSection}>
          <View style={styles.chartCardHeader}>
            <View style={styles.chartHeaderIconBadge}>
              <MaterialCommunityIcons name="chart-box" size={18} color="#0D9488" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.chartCardTitle}>Analisis & Statistik Hari Ini</Text>
              <Text style={styles.chartCardSubtitle}>
                Ketuk kartu untuk melihat rincian nama santri & data riil
              </Text>
            </View>
          </View>

          {chartAbsensi.length > 0 && (
            <InteractiveStatCard
              data={chartAbsensi}
              title="Komposisi Kehadiran Hari Ini"
              subtitle="Data presensi gerbang santri & guru realtime"
              icon="clock-check-outline"
              iconBg="#ECFDF5"
              iconColor="#059669"
              onPress={() => {
                setActiveAbsensiTab('siswa_hadir');
                setActiveKpiType('absensi_hari_ini');
              }}
            />
          )}

          {chartSiswaGender.length > 0 && (
            <InteractiveStatCard
              data={chartSiswaGender}
              title="Distribusi Gender Siswa"
              subtitle="Perbandingan santri putra vs putri aktif di unit"
              icon="account-group"
              iconBg="#EFF6FF"
              iconColor="#0284C7"
              onPress={() => setActiveKpiType('total_siswa')}
            />
          )}

          {chartSiswaLengkap.length > 0 && (
            <InteractiveStatCard
              data={chartSiswaLengkap}
              title="Kelengkapan Dokumen Siswa"
              subtitle="Status verifikasi NISN, KK & berkas santri"
              icon="file-document-check-outline"
              iconBg="#FFFBEB"
              iconColor="#D97706"
              onPress={() => setActiveKpiType('siswa_incomplete')}
            />
          )}

          {chartPegawaiLengkap.length > 0 && (
            <InteractiveStatCard
              data={chartPegawaiLengkap}
              title="Kelengkapan Data Pegawai"
              subtitle="Status verifikasi NIK, NIY & biodata GTK"
              icon="badge-account-outline"
              iconBg="#F5F3FF"
              iconColor="#7C3AED"
              onPress={() => setActiveKpiType('pegawai_incomplete')}
            />
          )}
        </View>
      )}

      {/* ── Baris 7: Section Pengumuman Internal ── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          try {
            navigation?.navigate('Informasi');
          } catch {
            navigation?.navigate('Lainnya');
          }
        }}
        style={styles.announcementCard}
      >
        <View style={styles.announcementIconBox}>
          <MaterialCommunityIcons name="bullhorn" size={22} color="#0284C7" />
        </View>

        <View style={styles.announcementContentCol}>
          <Text style={styles.announcementTitle}>
            {hasAnnouncement ? 'Pengumuman Terkini' : 'Pusat Informasi & Warta'}
          </Text>
          <Text style={styles.announcementSubtitle} numberOfLines={2}>
            {announcementTitle}
          </Text>
        </View>

        <MaterialCommunityIcons name="chevron-right" size={22} color="#0284C7" />
      </TouchableOpacity>

      {/* Ruang Tambahan Bawah (Spacer) agar scroll tuntas di atas Bottom Navigation Bar */}
      <View style={{ height: 40 }} />

      {/* ── Modal Pop-up: Katalog Lengkap Semua Menu ── */}
      <Modal
        visible={showAllMenusModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAllMenusModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.allMenusModalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalHeaderIconBadge}>
                  <MaterialCommunityIcons name="apps" size={20} color="#059669" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Katalog Menu Tata Usaha</Text>
                  <Text style={styles.modalSubtitle}>Seluruh modul administrasi & operasional</Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowAllMenusModal(false)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Search Bar Menu */}
            <View style={styles.modalSearchBox}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" style={{ marginRight: 6 }} />
              <TextInput
                value={menuSearchQuery}
                onChangeText={setMenuSearchQuery}
                placeholder="Cari modul atau menu..."
                placeholderTextColor="#94A3B8"
                style={styles.modalSearchInput}
              />
              {menuSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setMenuSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Menu Groups List */}
            <ScrollView style={styles.modalScrollArea} showsVerticalScrollIndicator={false}>
              {filteredMenuGroups.map((group, gIdx) => (
                <View key={gIdx} style={styles.modalGroupWrap}>
                  <View style={styles.modalGroupHeader}>
                    <MaterialCommunityIcons
                      name={group.groupIcon as any}
                      size={16}
                      color={group.groupColor}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.modalGroupTitle, { color: group.groupColor }]}>
                      {group.groupTitle}
                    </Text>
                  </View>

                  <View style={styles.modalGroupGrid}>
                    {group.items.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.8}
                        onPress={() => handleNavigateFromModal(item.screen, (item as any).params)}
                        style={styles.modalMenuItemTile}
                      >
                        <View style={[styles.modalMenuIconWrap, { backgroundColor: `${item.color}15` }]}>
                          <MaterialCommunityIcons name={item.icon as any} size={22} color={item.color} />
                        </View>
                        <Text style={styles.modalMenuLabel} numberOfLines={2}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal Interaktif Drilldown KPI Tata Usaha (Pop-up Data Riil) ── */}
      {activeKpiType && (
        <TuKpiDrilldownModal
          visible={Boolean(activeKpiType)}
          type={activeKpiType}
          kpiType={activeKpiType}
          initialTab={activeAbsensiTab}
          onClose={() => setActiveKpiType(null)}
          navigation={navigation}
          unitName={unitName}
          academicYear={tahunAjaran}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: 'transparent',
    paddingBottom: 110, // Memberikan ruang cukup agar scroll tidak terpotong oleh bottom tab
  },
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

  /* Greeting Section */
  greetingSection: {
    paddingHorizontal: 16,
    marginTop: 14,
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
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  datePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#064E3B',
  },

  /* Card Kelola Data Sekolah Hero */
  kelolaHeroCard: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kelolaHeroGradient: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kelolaHeroIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#0D9488',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kelolaHeroYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  kelolaHeroYearText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0D9488',
  },
  kelolaHeroDot: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0D9488',
    marginHorizontal: 1,
  },
  kelolaHeroTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
  },
  kelolaHeroSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  kelolaHeroActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  kelolaHeroActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0D9488',
  },

  /* ── KPI Carousel Styles ── */
  kpiCarouselSection: {
    marginTop: 14,
    marginBottom: 4,
  },
  kpiCarouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  kpiCarouselTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kpiCarouselSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  kpiCounterPill: {
    backgroundColor: 'rgba(13, 148, 136, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.25)',
  },
  kpiCounterText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0D9488',
  },
  kpiCarouselSectionSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  kpiNavArrowsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kpiNavArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiNavArrowBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.5,
  },

  /* Category Filter Chips */
  kpiCategoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 10,
  },
  kpiCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiCategoryChipActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0F766E',
    shadowColor: '#0D9488',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiCategoryChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  kpiCategoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  /* Carousel Cards Track */
  kpiCardsTrack: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: KPI_CARD_GAP,
  },
  kpiCarouselCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  kpiCarouselCardActive: {
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  kpiCarouselGradient: {
    padding: 16,
  },
  kpiCarouselTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiCarouselBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kpiCarouselCategoryBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  kpiCarouselCategoryText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  kpiCarouselIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  kpiCarouselMainBody: {
    marginBottom: 10,
  },
  kpiCarouselValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 2,
  },
  kpiCarouselValue: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  kpiCarouselUnit: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.85,
  },
  kpiCarouselTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  kpiCarouselSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  kpiCarouselDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    marginBottom: 10,
  },
  kpiCarouselBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiCarouselDetailWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  kpiCarouselDetailText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  kpiCarouselActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiCarouselActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0D9488',
  },

  /* Dots Pagination */
  kpiDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 10,
    marginBottom: 4,
  },
  kpiDot: {
    height: 6,
    borderRadius: 3,
  },
  kpiDotActive: {
    width: 22,
    backgroundColor: '#0D9488',
  },
  kpiDotInactive: {
    width: 6,
    backgroundColor: '#CBD5E1',
  },

  /* Baris Metrik Cepat Layanan (3 Kolom Sesuai Mockup Gambar, Rapi & Elegan) */
  kpiRow3Quick: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 10,
  },
  kpiCard3Quick: {
    flex: 1,
    minHeight: 84,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiValue3Quick: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  kpiLabel3Quick: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
  },

  /* Baris 1: 4 Kolom KPI (Legacy fallback) */
  kpiRow4: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 14,
    gap: 8,
  },
  kpiCard4: {
    flex: 1,
    minHeight: 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiValue4: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  kpiLabel4: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 12.5,
  },

  /* Grid 2 Kolom KPI */
  kpiGrid2: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 10,
  },
  kpiCard2: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiGradient2: {
    padding: 12,
  },
  kpiTopRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  kpiIconWrap2: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiCount2: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  kpiLabel2: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1E293B',
    lineHeight: 15,
  },
  kpiSub2: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  kpiSubDetail2: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 2,
  },

  /* Grid 3 Kolom KPI Presensi */
  kpiGrid3: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  kpiCard3: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 108,
  },
  kpiGradient3: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiIconWrap3: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiCount3: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 23,
  },
  kpiLabel3: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 13,
  },
  kpiSub3: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 1,
  },

  /* Menu Section */
  menuSection: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#064E3B',
    marginBottom: 12,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  menuItemCard: {
    width: (SCREEN_WIDTH - 32 - (3 * 8)) / 4,
    minHeight: 84,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1.5,
  },
  menuItemCardAccent: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  menuItemLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 13,
  },
  menuItemLabelAccent: {
    color: '#064E3B',
    fontWeight: '700',
  },

  /* Chart Card Section */
  chartCardSection: {
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  chartCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  chartHeaderIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F0FDFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  chartCardSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },

  /* Pengumuman Internal */
  announcementCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  announcementIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementContentCol: {
    flex: 1,
    marginHorizontal: 12,
  },
  announcementTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  announcementSubtitle: {
    fontSize: 11.5,
    color: '#475569',
    marginTop: 2,
    lineHeight: 15,
  },

  /* Modal Semua Menu */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  allMenusModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingTop: 18,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalHeaderIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    paddingVertical: 2,
  },
  modalScrollArea: {
    marginTop: 6,
  },
  modalGroupWrap: {
    marginBottom: 16,
  },
  modalGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalGroupTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  modalGroupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalMenuItemTile: {
    width: (SCREEN_WIDTH - 32 - (3 * 8)) / 4,
    minHeight: 80,
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalMenuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modalMenuLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 12,
  },
});
