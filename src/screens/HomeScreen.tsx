import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Image,
  LayoutAnimation,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  Platform,
  StatusBar,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { API_BASE_URL, getApiErrorMessage } from '../services/api';
import { realtimeWs } from '../services/websocketService';
import { mobileApiService, unwrapApiData, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useTeacherClassStore } from '../stores/teacherClassStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { SafeRemoteImage } from '../components/SafeRemoteImage';
import { EmptyStateCard } from '../components/EmptyStateCard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  isAlumniRole,
  isDivisiRole,
  isFoundationRole,
  isMusyrifRole,
  isOperatorRole,
  isParentRole,
  isPrincipalRole,
  isStudentRole,
  isSuperAdminRole,
  isTeacherRole,
  isStaffRole,
  isTuRole,
  roleLabel,
} from '../utils/roles';
import EmployeeHeaderCard from '../components/dashboard/EmployeeHeaderCard';
import DualRoleLandingGate from '../components/dashboard/DualRoleLandingGate';
import DualRoleHeroCarousel from '../components/dashboard/DualRoleHeroCarousel';
import TeacherDashboardView from '../components/dashboard/TeacherDashboardView';
import TeacherRombelSelectorCard from '../components/dashboard/TeacherRombelSelectorCard';
import FoundationDashboardView from '../components/dashboard/FoundationDashboardView';
import StaffDashboardView from '../components/dashboard/StaffDashboardView';
import TuDashboardView from '../components/dashboard/TuDashboardView';
import TuHomeScreenView from '../components/dashboard/TuHomeScreenView';
import MusyrifHomeScreenView from '../components/dashboard/MusyrifHomeScreenView';
import PrincipalHomeSection from '../components/dashboard/PrincipalHomeSection';
import PrincipalHomeScreenView from '../components/dashboard/PrincipalHomeScreenView';
import DivisiHomeScreenView from '../components/dashboard/DivisiHomeScreenView';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { GenericCarousel } from '../components/GenericCarousel';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';
import { useCarouselFilter } from '../hooks/useCarouselFilter';
import {
  getProfileImageUrl,
  DEFAULT_PARENT_AVATAR,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { canAccessScreen } from '../utils/accessControl';
import { textShadowStyle } from '../utils/styleUtils';

// Latar belakang header Sekolah Islam Terpadu & Masjid
const HEADER_MOSQUE_BG = require('../../assets/header_mosque_bg.png');
const SPLASH_LOGO = require('../../assets/launcher_source.png');
const FAMILY_ILLUSTRATION = require('../../assets/family_illustration.png');
const SCHOOL_ILLUSTRATION = require('../../assets/school_illustration.jpg');
const DAREL_IMAN_BUILDING = require('../../assets/darel_iman_building.jpg');
const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const CARD_THEMES: Record<string, { primary: string; dark: string; secondary: string; soft: string; accent: string }> = {
  green: { primary: '#004D32', dark: '#003822', secondary: '#0E5C44', soft: '#ecfdf5', accent: '#E5A93C' },
  blue: { primary: '#1D4ED8', dark: '#1e40af', secondary: '#3B82F6', soft: '#eff6ff', accent: '#93C5FD' },
  purple: { primary: '#6D28D9', dark: '#5b21b6', secondary: '#8B5CF6', soft: '#f5f3ff', accent: '#C4B5FD' },
  orange: { primary: '#EA580C', dark: '#c2410c', secondary: '#F97316', soft: '#fff7ed', accent: '#FDBA74' },
  teal: { primary: '#0F766E', dark: '#115e59', secondary: '#14B8A6', soft: '#f0fdfa', accent: '#99F6E4' },
  navy: { primary: '#172554', dark: '#0f172a', secondary: '#1E3A8A', soft: '#eff6ff', accent: '#60A5FA' },
};

// 3 Palet Warna Bergantian untuk Kartu Berita (Berita ke-4 kembali ke warna awal #18A165)
const NEWS_CARD_THEMES = [
  {
    // Kartu 1, 4, 7... Warna Dasar Hijau Emerald (#18A165)
    base: '#18A165',
    gradient: ['#0D6B42', '#18A165', '#2BD988'],
    locations: [0, 0.55, 1],
    shadowColor: '#0D6B42',
    dateColor: '#DEF7EC',
    decorColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  {
    // Kartu 2, 5, 8... Warna Biru Royal Elegan (#2563EB)
    base: '#2563EB',
    gradient: ['#1E3A8A', '#2563EB', '#60A5FA'],
    locations: [0, 0.55, 1],
    shadowColor: '#1E3A8A',
    dateColor: '#DBEAFE',
    decorColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  {
    // Kartu 3, 6, 9... Warna Emas Amber Hangat (#D97706)
    base: '#D97706',
    gradient: ['#B45309', '#D97706', '#FBBF24'],
    locations: [0, 0.55, 1],
    shadowColor: '#B45309',
    dateColor: '#FEF3C7',
    decorColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
];

const MENU_SUBTITLES: Record<string, string> = {
  'Portal Orang Tua': 'Menu khusus untuk kebutuhan orang tua',
  'Pembayaran': 'Bayar biaya',
  'Tagihan': 'Daftar tagihan',
  'Tagihan SPP': 'Biaya & pembayaran SPP',
  'Rekap Aktivitas': 'Riwayat hadir',
  'Perkembangan Anak': 'Grafik belajar',
  'Laporan & Rapor': 'Rapor semester',
  'Agenda Orang Tua': 'Agenda kegiatan',
  'Al-Qur\'an': 'Baca & tilawah',
  'Doa & Dzikir': 'Amalan harian',
  'Kalender': 'Agenda kegiatan',
  'Kalender Akademik': 'Agenda kegiatan',
  'Informasi': 'Pengumuman',
  'Jadwal': 'Jadwal pelajaran',
  'Jadwal Pelajaran': 'Jadwal pelajaran harian',
  'Materi': 'Materi pembelajaran',
  'Materi Belajar': 'Bahan ajar & modul',
  'Tugas': 'Kerjakan tugas',
  'Tugas LMS': 'Daftar penugasan & kuis',
  'Tahfizh': 'Hafalan Al-Qur\'an',
  'Tahfiz': 'Hafalan Al-Qur\'an',
  'Tahfizh Al-Qur\'an': 'Setoran & capaian hafalan',
  'Nilai': 'Lihat hasil belajar',
  'Penilaian & Rapor': 'Nilai asesmen & rapor',
  'Komentar': 'Saran & masukan',
  'Buku Hubung': 'Catatan guru & santri',
  'Buku Penghubung': 'Catatan guru & ortu',
  'Bank Soal': 'Latihan soal mandiri',
  'Tagihan & SPP': 'Biaya pendidikan',
  'Mutabaah': 'Pantau ibadah',
  'Mutabaah Asrama': 'Amalan yaumiyyah santri',
  'Mutaba\'ah Yaumiyyah': 'Ibadah & mutabaah harian',
  'Absensi': 'Kehadiran siswa',
  'Absensi Asrama': 'Presensi sholat & kamar',
  'Izin Santri': 'Verifikasi pesiar & pulang',
  'Setoran Tahfizh': 'Ziyadah & muraja\'ah',
  'Chat Wali & Staf': 'Pesan asrama & wali',
  'Kalender Pondok': 'Agenda & kegiatan asrama',
  'Warta Pesantren': 'Kabar & maklumat asrama',
  'Kisi-kisi': 'Persiapan ujian',
  'Kisi-kisi Ujian CBT': 'Persiapan ujian',
  'Ujian CBT': 'Ujian online',
  'Hasil Rapor': 'Lihat nilai rapor',
  'Rapor': 'Lihat nilai rapor',
  'Lainnya': 'Semua menu',
  'Kembali': 'Tutup menu',
  'Lihat Semua': 'Semua menu',
  'Pengaturan': 'Kelola akun',
  'Dashboard': 'Ringkasan data',
  'Akademik': 'Data akademik',
  'Laporan': 'Laporan berkala',
  'Prestasi': 'Catatan prestasi',
  'Monev': 'Monitoring evaluasi',
  'Monitoring': 'Pantau progres',
  'Data Master': 'Kelola data pokok',
  'Data Siswa': 'Kelola siswa',
  'Buku Induk Siswa': 'Database santri unit',
  'Data SDM Guru & Staf': 'Pendidik & pegawai',
  'Pantau Kelas & Rombel': 'Supervisi kelas aktif',
  'Izin & Cuti Sekolah': 'Persetujuan izin & cuti',
  'Monitoring Tahfizh': 'Rekap hafalan santri',
  'Rekap Mutaba\'ah': 'Evaluasi amalan ibadah',
  'Supervisi Materi': 'Bahan ajar & kurikulum',
  'Monitoring Tugas': 'Tinjau tugas belajar',
  'Data Pegawai': 'Kelola pegawai',
  'Absensi Gerbang': 'Scan RFID & QR',
  'Rekap Siswa': 'Kehadiran santri',
  'Presensi KBM': 'Monitoring KBM',
  'Presensi Staf': 'Presensi mandiri',
  'Presensi Mandiri': 'Presensi mandiri pegawai',
  'Jadwal KBM': 'Jadwal pelajaran',
  'Tagihan Siswa': 'Status SPP siswa',
  'Chat Pegawai': 'Komunikasi staf',
  'Profil Staf': 'Profil akun staf',
  'Bahan Ajar': 'Modul & bahan KBM',
  'Keuangan': 'Kelola keuangan',
  'Surat': 'Persuratan',
  'Inventaris': 'Aset & barang',
  'Arsip': 'Arsip dokumen',
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;
const CARD_WIDTH = SCREEN_WIDTH - 32;
const NEWS_CARD_WIDTH = SCREEN_WIDTH - 50;
const ITEM_SPACING = 12;

function isValidHex(color: string | undefined): boolean {
  if (!color || typeof color !== 'string') return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color.trim());
}

const getMenuBorderColor = (hex: string) => {
  if (hex && hex.startsWith('#') && hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.32)`;
  }
  return hex;
};

type DashboardData = Record<string, any>;

const valueAt = (object: DashboardData, path: string): any => {
  const value = path.split('.').reduce<any>((current, key) => current?.[key], object);
  if (value && typeof value === 'object' && 'total' in value) return value.total;
  return value;
};

const firstValue = (data: DashboardData, paths: string[], fallback: string | number = '-') => {
  for (const path of paths) {
    const value = valueAt(data, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};

const listAt = (data: DashboardData, paths: string[]): any[] => {
  for (const path of paths) {
    const value = valueAt(data, path);
    if (Array.isArray(value)) return value;
  }
  return [];
};

const titleOf = (item: any): string =>
  item?.judul_pengumuman || item?.judul || item?.title || item?.subject?.name || item?.subject?.nama_mapel || 'Informasi Sekolah';

const subtitleOf = (item: any): string =>
  item?.data_tambahan?.ringkasan || item?.isi_pengumuman || item?.isi || item?.summary || item?.kelas?.nama_kelas || item?.class?.name || item?.time_start || '';

const stripHtmlAndClean = (str: any): string => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

const getSafeStudentClassName = (studentObj: any): string => {
  if (!studentObj) return '';
  if (studentObj.rombel_name && typeof studentObj.rombel_name === 'string') return studentObj.rombel_name;
  if (studentObj.class_name && typeof studentObj.class_name === 'string') return studentObj.class_name;
  if (studentObj.kelas) {
    if (typeof studentObj.kelas === 'string') return studentObj.kelas;
    if (typeof studentObj.kelas === 'object') {
      return studentObj.kelas.nama_kelas || studentObj.kelas.name || studentObj.kelas.kode_kelas || '';
    }
  }
  return '';
};

const DEFAULT_NEWS_FALLBACK = require('../../assets/launcher_source.png');

const getNewsThumbnail = (item: any, index: number = 0) => {
  const raw =
    item?.image_url ||
    item?.data_tambahan?.gambar_url ||
    item?.cover ||
    item?.cover_image ||
    item?.thumbnail ||
    item?.foto ||
    item?.file_path ||
    item?.attachment_url;

  if (raw && typeof raw === 'string' && raw.trim() !== '') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('data:')) {
      return { uri: trimmed };
    }
    const apiHost = API_BASE_URL.replace(/\/api\/?$/, '');
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const parsed = new URL(trimmed);
        const isLocalHost =
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname === '10.0.2.2' ||
          parsed.hostname.startsWith('192.168.');
        if (isLocalHost || parsed.pathname.includes('/storage/')) {
          return { uri: `${apiHost}${parsed.pathname}${parsed.search}` };
        }
        return { uri: trimmed };
      } catch {
        return { uri: trimmed };
      }
    }
    let cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    if (!cleanPath.startsWith('/storage/')) {
      cleanPath = `/storage${cleanPath}`;
    }
    return { uri: `${apiHost}${cleanPath}` };
  }

  return DEFAULT_NEWS_FALLBACK;
};

const getActivityBadgeStyle = (badgeType: string) => {
  switch (badgeType) {
    case 'green':
      return { bg: '#DCFCE7', text: '#15803D' };
    case 'blue':
      return { bg: '#DBEAFE', text: '#1D4ED8' };
    case 'red':
      return { bg: '#FEE2E2', text: '#DC2626' };
    case 'purple':
      return { bg: '#F3E8FF', text: '#7E22CE' };
    case 'amber':
    default:
      return { bg: '#FEF3C7', text: '#B45309' };
  }
};

// Modul-level tap timestamp agar tidak pernah terkena ReferenceError di Hermes runtime
let globalLastDirectTapTime = 0;
// Backward-compat shim: jika ada cached bundle lama yang masih mengakses
// lastDirectTapTimeRef.current, objek ini akan mendelegasikan ke globalLastDirectTapTime
// sehingga tidak terjadi ReferenceError di Hermes runtime.
const lastDirectTapTimeRef = {
  get current() { return globalLastDirectTapTime; },
  set current(v: number) { globalLastDirectTapTime = v; },
};

export default function HomeScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 16);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 18 : 10);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const foundation = isFoundationRole(roles);
  const superAdmin = isSuperAdminRole(roles);
  const principal = isPrincipalRole(roles);
  const teacher = isTeacherRole(roles);
  const parent = isParentRole(roles);
  const student = isStudentRole(roles);
  const tu = isTuRole(roles);
  const operator = isOperatorRole(roles);
  const staff = tu || operator;
  const alumni = isAlumniRole(roles);
  const divisi = isDivisiRole(roles);
  const isTuOnly = tu && !principal && !foundation && !superAdmin && !divisi;
  const musyrif = isMusyrifRole(roles);
  const isDualRole = teacher && musyrif;
  const [dualRoleMode, setDualRoleMode] = useState<'teacher' | 'musyrif'>('musyrif');
  const [isDualRoleWorkspaceActive, setIsDualRoleWorkspaceActive] = useState<boolean>(false);
  const isMusyrifActive = musyrif && (!isDualRole || dualRoleMode === 'musyrif');
  const activeStaffMode = isDualRole ? dualRoleMode : (teacher ? 'teacher' : (musyrif ? 'musyrif' : 'other'));
  const mobileConfig = useMobileConfigStore((state) => state.config);
  const theme = mobileConfig.theme || {};

  const [dashboard, setDashboard] = useState<DashboardData>({});
  const [fetchedAnnouncements, setFetchedAnnouncements] = useState<any[]>([]);
  const [parentChildren, setParentChildren] = useState<any[]>([]);
  const parentChildrenRef = useRef<any[]>([]);
  useEffect(() => { parentChildrenRef.current = parentChildren; }, [parentChildren]);
  const mainScrollViewRef = useRef<any>(null);
  const childDebounceFetchTimerRef = useRef<any>(null);
  const triggerInstantChildFetchRef = useRef<((childId: string, debounce?: boolean) => void) | null>(null);
  const lastHandledGlobalChildIdRef = useRef<string | null>(null);
  const isSyncingDataRef = useRef<boolean>(false);
  const isScrollingToTargetRef = useRef<boolean>(false);
  const scrollingSafetyTimeoutRef = useRef<any>(null);
  const studentSnapInterval = SCREEN_WIDTH - 32;

  // Floating Toast State untuk Progress & Sukses Load Data Siswa
  const [studentSwitchToast, setStudentSwitchToast] = useState<{
    visible: boolean;
    status: 'loading' | 'success';
    studentName: string;
    shortName: string;
    childId: string;
  } | null>(null);
  const toastDismissTimerRef = useRef<any>(null);
  const latestActiveChildIdRef = useRef<string>('');

  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);

  const {
    activeKey: activeChildIdFromHook,
    activeIndex: activeChildIndex,
    activeItem: activeStudentFromHook,
    visualDotIndex,
    currentActiveDotIndex,
    setVisualDotIndex,
    selectByIndex: goToLoopChild,
    selectByKey: selectChildById,
    isProgrammaticScrollRef,
    lastDirectTapTimeRef,
    isUserDraggingRef,
  } = useCarouselFilter({
    items: parentChildren,
    keyExtractor: (child: any) => String(child?.id != null ? child.id : child?.student_id || ''),
    initialKey: globalActiveChildId || '',
    onKeyChange: (child: any, key: string, index: number) => {
      setSelectedPortalChild(child);
      lastHandledGlobalChildIdRef.current = key;
      useActiveChildStore.getState().setActiveChildId(key);

      const sFullName = child?.full_name || child?.nama_lengkap || child?.name || child?.nama || 'Ananda';
      const sNickname = child?.nickname || child?.nama || child?.name || sFullName.split(' ')[0] || 'Ananda';

      latestActiveChildIdRef.current = key;
      if (toastDismissTimerRef.current) {
        clearTimeout(toastDismissTimerRef.current);
      }
      setStudentSwitchToast({
        visible: true,
        status: 'loading',
        studentName: sFullName,
        shortName: sNickname,
        childId: key,
      });

      if (triggerInstantChildFetchRef.current) {
        triggerInstantChildFetchRef.current(key, true);
      }
    },
  });

  const setActiveChildIndex = useCallback((targetIndex: number) => {
    goToLoopChild(targetIndex, false);
  }, [goToLoopChild]);

  const activeChildIndexRef = useRef<number>(0);
  useEffect(() => {
    activeChildIndexRef.current = activeChildIndex;
  }, [activeChildIndex]);

  const scrollToActiveChild = useCallback((idx: number, animated = false): void => {
    goToLoopChild(idx, animated);
  }, [goToLoopChild]);

  const syncLoopChildId = useCallback((realIdx: number, debounceFetch = false): void => {
    goToLoopChild(realIdx, false);
  }, [goToLoopChild]);
  const newsScrollRef = useRef<ScrollView>(null);
  const newsCarouselScrollRef = useRef<ScrollView>(null);
  const [activeNewsCarouselIndex, setActiveNewsCarouselIndex] = useState(0);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [cardSetting, setCardSetting] = useState<any>(null);
  const lastHandledReopenTimestampRef = useRef<number | null>(null);

  // Live Timeline Aktivitas Siswa (Fullday & Boarding) — dengan navigasi hari
  const [todayTimeline, setTodayTimeline] = useState<any>(null);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);
  const [realtimeBanner, setRealtimeBanner] = useState<{ title: string; subtitle: string; badge: string; type: string } | null>(null);
  const [activeTimelineTab, setActiveTimelineTab] = useState<'pelajaran' | 'sholat' | 'tahfizh' | 'mutabaah'>('pelajaran');
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  // viewedDate: tanggal yang sedang ditampilkan di timeline (diselaraskan dengan tanggal operasional sistem sekolah)
  const [serverTodayStr, setServerTodayStr] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [viewedDate, setViewedDate] = useState<string>('');
  const [isViewingToday, setIsViewingToday] = useState<boolean>(true);

  const todayDateStr = serverTodayStr;

  const goToPrevDay = useCallback(() => {
    setIsViewingToday(false);
    setViewedDate(prev => {
      const base = prev || serverTodayStr;
      const d = new Date(base);
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  }, [serverTodayStr]);

  const goToNextDay = useCallback(() => {
    setViewedDate(prev => {
      const base = prev || serverTodayStr;
      if (base >= serverTodayStr) {
        setIsViewingToday(true);
        return serverTodayStr;
      }
      const d = new Date(base);
      d.setDate(d.getDate() + 1);
      const nextDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (nextDate >= serverTodayStr) {
        setIsViewingToday(true);
        return serverTodayStr;
      }
      return nextDate;
    });
  }, [serverTodayStr]);

  const timelineTargetChildRef = useRef<string | undefined>(undefined);

  const fetchTodayTimeline = useCallback(async (childId?: string, date?: string, isTodayMode?: boolean) => {
    const currentRoles = useAuthStore.getState().roles;
    if (!isParentRole(currentRoles) && !isStudentRole(currentRoles)) {
      return;
    }
    timelineTargetChildRef.current = childId ? String(childId) : undefined;
    const uid = useAuthStore.getState().user?.id;
    const cacheKeyTimeline = offlineCache.buildKey('home_timeline', uid, `${childId || 'self'}_${date || 'today'}`);

    try {
      // 1. Baca cache lokal dulu untuk rendering instan tanpa jeda
      const cachedTimeline = await offlineCache.get<any>(cacheKeyTimeline);
      if (cachedTimeline && timelineTargetChildRef.current === (childId ? String(childId) : undefined)) {
        setTodayTimeline(cachedTimeline);
      }
      setLoadingTimeline(!cachedTimeline);

      // 2. Fetch fresh data dari backend
      // Jika mode "Hari Ini", kirim undefined agar backend memakai tanggal operasional sekolah terkini
      const targetDate = isTodayMode ? undefined : (date || undefined);
      const res = await mobileApiService.getTodayLiveTimeline(childId, targetDate);
      const data = unwrapApiData<any>(res);
      if (data && timelineTargetChildRef.current === (childId ? String(childId) : undefined)) {
        setTodayTimeline(data);
        void offlineCache.set(cacheKeyTimeline, data);
        const resolvedDate = data.server_date || data.date;
        if (resolvedDate) {
          setServerTodayStr(resolvedDate);
          if (isTodayMode || !date) {
            setViewedDate(resolvedDate);
          }
        }
        if (childId && (data.attendance || data.gate || data.summary?.attendance_status)) {
          useActiveChildStore.getState().updateChildAttendance(
            childId,
            data.attendance || data.gate || { status: data.summary?.attendance_status }
          );
        }
      }
    } catch (err) {
      console.warn('[HomeScreen] fetchTodayTimeline error:', err);
    } finally {
      setLoadingTimeline(false);
    }
  }, []);

  const resolvedActivities = useMemo(() => {
    if (todayTimeline?.activities && Array.isArray(todayTimeline.activities)) {
      return todayTimeline.activities;
    }
    return [];
  }, [todayTimeline]);

  useEffect(() => {
    if (!selectedIdCardStudent) return;
    const unitId = selectedIdCardStudent.unit_id || selectedIdCardStudent.education_unit_id || selectedIdCardStudent.education_unit?.id;
    mobileApiService.getStudentCardSetting(unitId)
      .then((res: any) => {
        if (res?.data) {
          setCardSetting(res.data);
        }
      })
      .catch(() => {
        // Safe fallback
      });
  }, [selectedIdCardStudent]);
  const [idCardSide, setIdCardSide] = useState<'front' | 'back'>('front');

  // Widget Tugas Terbaru & Jadwal Hari Ini & Hub 360° (Home Dashboard)
  const [homeSchedule, setHomeSchedule] = useState<any>(null);
  const [homeAssignments, setHomeAssignments] = useState<any[]>([]);
  const [homeTahfizh, setHomeTahfizh] = useState<any>(null);
  const [homeMutabaah, setHomeMutabaah] = useState<any>(null);
  const [homeAttendance, setHomeAttendance] = useState<any>(null);
  const [loadingHomeWidgets, setLoadingHomeWidgets] = useState(false);


  // Sinkronisasi activeChildIndex saat globalActiveChildId berubah dari luar (Portal/GradeScreen)
  useEffect(() => {
    if (!globalActiveChildId || parentChildren.length === 0) return;
    // Jangan scroll ulang jika sedang ada animasi direct-tap atau drag yang belum selesai
    if (isScrollingToTargetRef.current || isUserDraggingRef.current) return;
    const strId = String(globalActiveChildId);
    if (strId === lastHandledGlobalChildIdRef.current) return;
    lastHandledGlobalChildIdRef.current = strId;

    const idx = parentChildren.findIndex(
      (c) => String(c.id || c.student_id) === strId
    );
    if (idx !== -1 && idx !== activeChildIndexRef.current) {
      activeChildIndexRef.current = idx;
      setActiveChildIndex(idx);
      requestAnimationFrame(() => {
        scrollToActiveChild(idx, false);
      });
    }
  }, [globalActiveChildId, parentChildren, scrollToActiveChild]);

  const homeWidgetsTargetChildRef = useRef<string | undefined>(undefined);

  const fetchHomeWidgets = useCallback(async (childId?: string) => {
    const targetKey = childId ? String(childId) : undefined;
    homeWidgetsTargetChildRef.current = targetKey;
    try {
      setLoadingHomeWidgets(true);
      const uid = useAuthStore.getState().user?.id;
      const cacheKeyAssign = offlineCache.buildKey('assignments', uid, childId || 'self');
      const cacheKeyTahfizh = offlineCache.buildKey('home_tahfizh', uid, childId || 'self');
      const cacheKeyMutabaah = offlineCache.buildKey('home_mutabaah', uid, childId || 'self');
      const cacheKeyAttend = offlineCache.buildKey('home_attend', uid, childId || 'self');

      // 1. Baca cache lokal instan
      const [cAssign, cTahfizh, cMutabaah, cAttend] = await Promise.all([
        offlineCache.get<any>(cacheKeyAssign),
        offlineCache.get<any>(cacheKeyTahfizh),
        offlineCache.get<any>(cacheKeyMutabaah),
        offlineCache.get<any>(cacheKeyAttend),
      ]);

      // Guard: jika pengguna sudah memilih anak lain, abaikan hasil cache lama ini
      if (homeWidgetsTargetChildRef.current !== targetKey) return;

      if (cAssign) {
        const cachedList = Array.isArray(cAssign) ? cAssign : Array.isArray(cAssign?.list) ? cAssign.list : Array.isArray(cAssign?.data) ? cAssign.data : [];
        if (cachedList.length > 0) setHomeAssignments(cachedList);
      }
      if (cTahfizh) setHomeTahfizh(cTahfizh);
      if (cMutabaah) setHomeMutabaah(cMutabaah);
      if (cAttend) setHomeAttendance(cAttend);

      const todayStr = new Date().toISOString().slice(0, 10);
      const [schedRes, assignRes, tahfizhRes, mutabaahRes, attendRes] = await Promise.allSettled([
        mobileApiService.getPortalSchedules({ child_id: childId, date: todayStr }),
        mobileApiService.getPortalAssignments({ child_id: childId, per_page: 5 }),
        mobileApiService.getPortalTahfizh({ child_id: childId, student_id: childId, per_page: 3 }),
        mobileApiService.getPortalMutabaah(childId, todayStr),
        mobileApiService.getPortalAttendance(childId),
      ]);

      // Guard: jika pengguna sudah memilih anak lain saat network selesai, abaikan respons lama ini
      if (homeWidgetsTargetChildRef.current !== targetKey) return;

      if (schedRes.status === 'fulfilled') {
        const d = unwrapApiData<any>(schedRes.value) || schedRes.value?.data || schedRes.value;
        setHomeSchedule(d);
      }
      if (assignRes.status === 'fulfilled') {
        const raw = assignRes.value;
        const list = Array.isArray(raw?.data?.data)
          ? raw.data.data
          : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw)
          ? raw
          : [];
        setHomeAssignments(list);
        if (list.length > 0) {
          void offlineCache.set(cacheKeyAssign, { list });
        }
      }
      if (tahfizhRes.status === 'fulfilled') {
        const rawT = tahfizhRes.value;
        const tList = Array.isArray(rawT?.data) ? rawT.data : Array.isArray(rawT) ? rawT : [];
        const latestT = tList[0] || null;
        setHomeTahfizh(latestT);
        if (latestT) void offlineCache.set(cacheKeyTahfizh, latestT);
      }
      if (mutabaahRes.status === 'fulfilled') {
        const mData = unwrapApiData<any>(mutabaahRes.value) || mutabaahRes.value;
        setHomeMutabaah(mData);
        if (mData) void offlineCache.set(cacheKeyMutabaah, mData);
      }
      if (attendRes.status === 'fulfilled') {
        const aData = unwrapApiData<any>(attendRes.value) || attendRes.value;
        setHomeAttendance(aData);
        if (aData) void offlineCache.set(cacheKeyAttend, aData);
      }
    } catch {
      // silent fail — widgets gracefully show empty state
    } finally {
      setLoadingHomeWidgets(false);
    }
  }, []);

  // Link ref trigger instan saat direct tap / debounced saat swipe + Toast Notifikasi Sukses
  useEffect(() => {
    triggerInstantChildFetchRef.current = (cid: string, debounce = false) => {
      if (childDebounceFetchTimerRef.current) {
        clearTimeout(childDebounceFetchTimerRef.current);
      }
      const doFetch = async () => {
        try {
          await Promise.allSettled([
            fetchTodayTimeline(cid, undefined, true),
            fetchHomeWidgets(cid),
          ]);
        } finally {
          // Hanya ubah ke status success jika cid masih yang terakhir dipilih
          if (latestActiveChildIdRef.current === cid) {
            setStudentSwitchToast((prev) => {
              if (prev && prev.childId === cid) {
                return { ...prev, status: 'success' };
              }
              return prev;
            });
            if (toastDismissTimerRef.current) {
              clearTimeout(toastDismissTimerRef.current);
            }
            toastDismissTimerRef.current = setTimeout(() => {
              setStudentSwitchToast(null);
            }, 1800);
          }
        }
      };

      if (debounce) {
        childDebounceFetchTimerRef.current = setTimeout(() => {
          void doFetch();
        }, 200);
      } else {
        void doFetch();
      }
    };
    return () => {
      if (childDebounceFetchTimerRef.current) clearTimeout(childDebounceFetchTimerRef.current);
      if (toastDismissTimerRef.current) clearTimeout(toastDismissTimerRef.current);
      triggerInstantChildFetchRef.current = null;
    };
  }, [fetchTodayTimeline, fetchHomeWidgets]);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);
  const setUnreadNotificationCount = useNotificationBadgeStore((state) => state.setUnreadNotificationCount);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      // 1. Pastikan kunci scrolling terbuka saat kembali ke layar Beranda
      isScrollingToTargetRef.current = false;
      if (scrollingSafetyTimeoutRef.current) {
        clearTimeout(scrollingSafetyTimeoutRef.current);
        scrollingSafetyTimeoutRef.current = null;
      }

      // 2. Sinkronkan posisi visual scroll kartu siswa dengan anak aktif global
      //    Gunakan ref (bukan state) agar effect ini TIDAK re-fire saat parentChildren
      //    berubah — hanya berjalan saat layar benar-benar mendapat fokus kembali.
      const currentGlobalId = useActiveChildStore.getState().activeChildId;
      const currentList = parentChildrenRef.current.length > 0 ? parentChildrenRef.current : (useActiveChildStore.getState().children || []);
      if (!isUserDraggingRef.current && !isScrollingToTargetRef.current) {
        if (currentGlobalId && currentList.length > 0) {
          const targetIdx = currentList.findIndex(
            (c: any) => String(c.id || c.student_id) === String(currentGlobalId)
          );
          if (targetIdx !== -1) {
            if (targetIdx !== activeChildIndexRef.current) {
              activeChildIndexRef.current = targetIdx;
              setActiveChildIndex(targetIdx);
              lastHandledGlobalChildIdRef.current = String(currentGlobalId);
            }
            setTimeout(() => {
              if (!isUserDraggingRef.current && !isScrollingToTargetRef.current) {
                scrollToActiveChild(targetIdx, false);
              }
            }, 60);
          }
        }
      }

      // 3. Fetch jumlah notifikasi belum dibaca
      mobileApiService.getUnreadNotificationCount()
        .then((countRes: any) => {
          if (!isMounted) return;
          const count = Number(
            countRes?.data?.unread_count ??
            countRes?.unread_count ??
            (typeof countRes === 'number' ? countRes : 0)
          );
          setUnreadNotificationCount(Math.max(0, count));
        })
        .catch(() => {});

      return () => {
        isMounted = false;
      };
    }, [studentSnapInterval, setUnreadNotificationCount])
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedNews, setSelectedNews] = useState<any>(null);
  const newsGradientStart = isValidHex(mobileConfig.theme?.news_gradient_start)
    ? (mobileConfig.theme.news_gradient_start as string)
    : '#FFFFFF';
  const newsGradientEnd = isValidHex(mobileConfig.theme?.news_gradient_end)
    ? (mobileConfig.theme.news_gradient_end as string)
    : '#E8F5E9';
  const [showAllNews, setShowAllNews] = useState<boolean>(false);
  const [showTugasModal, setShowTugasModal] = useState<boolean>(false);
  const [showJadwalModal, setShowJadwalModal] = useState<boolean>(false);
  const [showChildPortalModal, setShowChildPortalModal] = useState<boolean>(false);
  const [showChildSelectorModal, setShowChildSelectorModal] = useState<boolean>(false);
  const [isChildViewActive, setIsChildViewActive] = useState<boolean>(false);
  const [selectedPortalChild, setSelectedPortalChild] = useState<any>(null);
  const [showSchoolProfileModal, setShowSchoolProfileModal] = useState<boolean>(false);
  const [selectedSchoolProfileChildId, setSelectedSchoolProfileChildId] = useState<string>('');
  const [showSppModal, setShowSppModal] = useState<boolean>(false);
  const [sppSelectedChildId, setSppSelectedChildId] = useState<string>('');
  const [sppBills, setSppBills] = useState<any[]>([]);
  const [sppLoading, setSppLoading] = useState<boolean>(false);
  const [sppPaymentInfo, setSppPaymentInfo] = useState<any>(null);
  const [sppFilter, setSppFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showNotificationModal, setShowNotificationModal] = useState<boolean>(false);
  const [notificationUnitFilter, setNotificationUnitFilter] = useState<string>('all');
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);

  const fetchSppBills = useCallback(async (childId: string) => {
    if (!childId) return;
    try {
      setSppLoading(true);
      const res = await mobileApiService.getPortalBills(childId, 1);
      const payload = unwrapApiData<any>(res) || {};
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      setSppBills(rows);
      const payInfo = res?.payment_info || res?.data?.payment_info || payload?.payment_info;
      if (payInfo) {
        setSppPaymentInfo(payInfo);
      }
    } catch {
      setSppBills([]);
    } finally {
      setSppLoading(false);
    }
  }, []);

  // Tangani tombol back fisik Android ketika sedang di dalam dashboard anak
  useEffect(() => {
    if (!isChildViewActive) return;
    const onBackPress = () => {
      setIsChildViewActive(false);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isChildViewActive]);

  // Modal Notifikasi & Pengingat Akademik Siswa (Tugas LMS, Ujian CBT, Kuis)
  const [showStudentNotificationModal, setShowStudentNotificationModal] = useState<boolean>(false);
  const [selectedNotificationStudent, setSelectedNotificationStudent] = useState<any>(null);
  const [studentNotificationsLoading, setStudentNotificationsLoading] = useState<boolean>(false);
  const [studentAssignmentsList, setStudentAssignmentsList] = useState<any[]>([]);
  const [studentCbtList, setStudentCbtList] = useState<any[]>([]);
  const [studentNotifFilter, setStudentNotifFilter] = useState<'all' | 'tugas' | 'cbt' | 'pengumuman'>('all');

  // Modal Laporan Perkembangan Pekanan Siswa
  const [showWeeklyReportModal, setShowWeeklyReportModal] = useState<boolean>(false);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState<boolean>(false);
  const [weeklyReportData, setWeeklyReportData] = useState<any>(null);

  const handleOpenWeeklyReport = useCallback(async (student: any) => {
    setSelectedWeeklyStudent(student);
    setShowWeeklyReportModal(true);
    setWeeklyReportLoading(true);
    const sId = student?.id || student?.student_id;
    try {
      const res = await mobileApiService.getPortalDashboard(sId ? String(sId) : undefined);
      const payload = unwrapApiData<any>(res) || {};
      setWeeklyReportData(payload);
    } catch {
      setWeeklyReportData(null);
    } finally {
      setWeeklyReportLoading(false);
    }
  }, []);

  const handleOpenStudentNotifications = useCallback(async (student: any) => {
    setSelectedNotificationStudent(student);
    setShowStudentNotificationModal(true);
    setStudentNotificationsLoading(true);
    const sId = student?.id || student?.student_id;
    try {
      const [assignRes, cbtRes] = await Promise.allSettled([
        mobileApiService.getPortalAssignments({ child_id: sId ? String(sId) : undefined, per_page: 20 }),
        mobileApiService.getPortalCbtExams(sId ? String(sId) : undefined),
      ]);
      if (assignRes.status === 'fulfilled') {
        const raw = assignRes.value;
        const list = Array.isArray(raw?.data?.data)
          ? raw.data.data
          : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw)
          ? raw
          : [];
        setStudentAssignmentsList(list);
      }
      if (cbtRes.status === 'fulfilled') {
        const rawCbt = cbtRes.value;
        const cbtData = unwrapApiData<any[]>(rawCbt) || (Array.isArray(rawCbt?.data) ? rawCbt.data : Array.isArray(rawCbt) ? rawCbt : []);
        setStudentCbtList(cbtData);
      }
    } catch (err) {
      console.warn('[HomeScreen] handleOpenStudentNotifications error:', err);
    } finally {
      setStudentNotificationsLoading(false);
    }
  }, []);

  const handleChildPortalMenuClick = useCallback(
    (route: string, tabKey?: string) => {
      const activeChild = parentChildren[activeChildIndex];
      // Jika modal sedang terbuka dan user memilih di modal, gunakan selectedPortalChild.
      // Jika diklik dari menu inline di Beranda, gunakan anak aktif di carousel (activeChild).
      const chosenChild = (showChildPortalModal && selectedPortalChild) ? selectedPortalChild : (activeChild || selectedPortalChild);
      setShowChildPortalModal(false);
      const childId = chosenChild?.id != null ? chosenChild.id : chosenChild?.student_id;
      const isGeneralIslamic = route === 'Quran' || route === 'DoaDzikir';
      const navParams: Record<string, any> = {};
      if (tabKey) {
        navParams.tab = String(tabKey);
      }
      if (childId && !isGeneralIslamic) {
        navParams.child_id = String(childId);
        navParams.student_id = String(childId);
        navParams.single_child_only = true;
        navParams.from_child_portal = true;
      }
      navigation.navigate(
        String(route),
        Object.keys(navParams).length > 0 ? navParams : undefined
      );
    },
    [showChildPortalModal, selectedPortalChild, parentChildren, activeChildIndex, navigation]
  );

  // Auto-sync santri terpilih saat pengguna kembali dari modul siswa
  useEffect(() => {
    const reopenChildId = route?.params?.reopen_child_portal_id;
    const reopenTimestamp = route?.params?.reopen_timestamp;
    if (reopenChildId && (!reopenTimestamp || reopenTimestamp !== lastHandledReopenTimestampRef.current)) {
      if (reopenTimestamp) {
        lastHandledReopenTimestampRef.current = reopenTimestamp;
      }
      const allChildren = parentChildren.length > 0 ? parentChildren : (useActiveChildStore.getState().children || []);
      const targetIndex = allChildren.findIndex(
        (c: any) => String(c.id || c.student_id) === String(reopenChildId)
      );
      if (targetIndex >= 0) {
        isScrollingToTargetRef.current = false;
        if (scrollingSafetyTimeoutRef.current) {
          clearTimeout(scrollingSafetyTimeoutRef.current);
          scrollingSafetyTimeoutRef.current = null;
        }
        activeChildIndexRef.current = targetIndex;
        setActiveChildIndex(targetIndex);
        setSelectedPortalChild(allChildren[targetIndex]);
        syncLoopChildId(targetIndex);

        // Langsung segarkan data aktivitas & widget untuk ananda yang dibuka kembali
        const targetSid = allChildren[targetIndex]?.id || allChildren[targetIndex]?.student_id || reopenChildId;
        if (targetSid) {
          void fetchTodayTimeline(String(targetSid), undefined, true);
          void fetchHomeWidgets(String(targetSid));
        }

        requestAnimationFrame(() => {
          scrollToActiveChild(targetIndex, false);
        });
      }
      navigation.setParams({ reopen_child_portal_id: undefined, reopen_timestamp: undefined });
    }
  }, [route?.params?.reopen_child_portal_id, route?.params?.reopen_timestamp, parentChildren, studentSnapInterval, navigation, fetchTodayTimeline, fetchHomeWidgets]);

  const childPortalMenus: { label: string; icon: string; color: string; bg: string; route: string; tab?: string }[] = useMemo(() => {
    const list: { label: string; icon: string; color: string; bg: string; route: string; tab?: string }[] = [
      { label: 'Jadwal Pelajaran', icon: 'calendar-clock', color: '#0D9488', bg: '#ECFDF5', route: 'Jadwal' },
      { label: 'Tugas LMS', icon: 'clipboard-text-outline', color: '#10B981', bg: '#ECFDF5', route: 'Tugas' },
      { label: 'Materi Belajar', icon: 'book-open-page-variant', color: '#0284C7', bg: '#EFF6FF', route: 'Materi' },
      { label: 'Penilaian & Rapor', icon: 'chart-box-outline', color: '#8B5CF6', bg: '#F5F3FF', route: 'Nilai' },
      { label: 'Tahfizh Al-Qur\'an', icon: 'book-marker', color: '#059669', bg: '#ECFDF5', route: 'Tahfizh' },
      { label: 'Mutaba\'ah Yaumiyyah', icon: 'clipboard-check-outline', color: '#D97706', bg: '#FFFBEB', route: 'Mutabaah' },
      { label: 'Buku Hubung', icon: 'notebook-edit-outline', color: '#E11D48', bg: '#FFF1F2', route: 'Komentar' },
      { label: 'Bank Soal', icon: 'database-outline', color: '#0D9488', bg: '#E6FFFA', route: 'BankSoal' },
      { label: 'Presensi Siswa', icon: 'account-check-outline', color: '#059669', bg: '#ECFDF5', route: 'Absensi' },
      { label: 'Perizinan Santri', icon: 'file-document-edit-outline', color: '#EF4444', bg: '#FEF2F2', route: 'Perizinan', tab: 'permissions' },
    ];

    if (parent) {
      list.push({
        label: 'Tagihan SPP',
        icon: 'cash-multiple',
        color: '#059669',
        bg: '#ECFDF5',
        route: 'Tagihan',
      });
    }

    list.push(
      { label: 'Chat Guru', icon: 'chat-processing-outline', color: '#2563EB', bg: '#EFF6FF', route: 'Chat' },
      { label: 'Ujian CBT', icon: 'laptop', color: '#2563EB', bg: '#EFF6FF', route: 'CbtExams' },
      { label: 'Kisi-kisi', icon: 'file-question', color: '#EF4444', bg: '#FEF2F2', route: 'KisiKisi' },
      { label: 'Kalender Akademik', icon: 'calendar-month-outline', color: '#0284C7', bg: '#F0F9FF', route: 'Kalender' },
      { label: 'Informasi', icon: 'bullhorn-outline', color: '#E11D48', bg: '#FFF1F2', route: 'Informasi' },
      { label: 'Al-Qur\'an', icon: 'book-open-variant', color: '#059669', bg: '#F0FDF4', route: 'Quran' },
      { label: 'Doa & Dzikir', icon: 'hands-pray', color: '#F97316', bg: '#FFF7ED', route: 'DoaDzikir' }
    );

    return list;
  }, [parent]);

  const childPortalMenuPages = useMemo(() => {
    const pages: (typeof childPortalMenus)[] = [];
    for (let i = 0; i < childPortalMenus.length; i += 8) {
      pages.push(childPortalMenus.slice(i, i + 8));
    }
    return pages;
  }, [childPortalMenus]);
  const [activeChildMenuPage, setActiveChildMenuPage] = useState(0);
  const childMenuScrollRef = useRef<ScrollView>(null);

  const [imageError, setImageError] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [activeMenuPage, setActiveMenuPage] = useState(0);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [showAllMenusModal, setShowAllMenusModal] = useState(false);
  // Menu Utama aktif secara dinamis untuk peran pendidik (Guru, Musyrif) dan manajemen sekolah
  const isEducatorOrStaff = isTeacherRole(roles) || isMusyrifRole(roles) || isStaffRole(roles) || isPrincipalRole(roles) || isFoundationRole(roles) || isDivisiRole(roles);
  const SHOW_MAIN_MENU = isEducatorOrStaff;

  const toggleMenuExpansion = useCallback(() => {
    if (
      Platform.OS === 'android' &&
      !(globalThis as any)?.nativeFabricUIManager &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      try {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      } catch {
        // no-op in New Architecture
      }
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsMenuExpanded((prev) => !prev);
  }, []);

  // Mode Collapse & Expand untuk Card Rangkuman 360°, Aktivitas Realtime, dan Tugas & Jadwal
  const [isChildDetailsExpanded, setIsChildDetailsExpanded] = useState<boolean>(true);

  const toggleChildDetailsExpanded = useCallback((forceState?: boolean) => {
    if (
      Platform.OS === 'android' &&
      !(globalThis as any)?.nativeFabricUIManager &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      try {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      } catch {
        // no-op in New Architecture
      }
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsChildDetailsExpanded((prev) => {
      const nextState = typeof forceState === 'boolean' ? forceState : !prev;
      if (nextState) {
        setTimeout(() => {
          mainScrollViewRef.current?.scrollTo?.({ y: 240, animated: true });
        }, 120);
      }
      return nextState;
    });
  }, []);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Animasi halus untuk profil greeting besar (fade out & float up saat scroll down)
  const greetingOpacity = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [0, 45],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  const greetingTranslateY = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [0, 45],
      outputRange: [0, -10],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  // Animasi halus untuk sticky compact header (fade in & slide down presisi, 100% native driver 60 FPS)
  // inputRange disesuaikan dengan tinggi rich sticky header yang lebih besar (~160dp)
  const stickyOpacity = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [55, 120],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  const stickyTranslateY = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [0, 54.9, 55, 120],
      outputRange: [-320, -320, -20, 0],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  // Deteksi status aktif sticky header untuk pointerEvents yang 100% presisi
  const [isStickyActive, setIsStickyActive] = useState<boolean>(false);
  useEffect(() => {
    const listenerId = scrollY.addListener(({ value }) => {
      const active = value >= 55;
      setIsStickyActive((prev) => (prev !== active ? active : prev));
    });
    return () => {
      scrollY.removeListener(listenerId);
    };
  }, [scrollY]);

  // Handler scroll UTAMA: Animated.event native dipasang LANGSUNG sebagai prop onScroll
  // (driver native 60fps di UI thread, nol kerja JS per frame — ala halaman Jadwal).
  // Jangan pernah MEMANGGIL hasilnya sebagai fungsi (itu objek AnimatedEvent ->
  // "TypeError: Object is not a function"). Identitas stabil via useRef.
  const mainScrollHandler = useRef(
    Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      { useNativeDriver: true }
    )
  ).current;

  // Crossfade card bodi ala halaman Jadwal: card memudar+naik saat sticky muncul.
  // Menggantikan animasi paddingTop body (layout property JS-driven) yang bikin melompat.
  const bodyCardOpacity = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [45, 105],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  const bodyCardTranslateY = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [45, 105],
      outputRange: [0, -16],
      extrapolate: 'clamp',
    });
  }, [scrollY]);



  const rolesKey = (roles || []).join(',');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    const uid = useAuthStore.getState().user?.id;
    const cacheKeyDash = offlineCache.buildKey('home_dashboard', uid);
    const cacheKeyAnn  = offlineCache.buildKey('home_announcements', uid);
    const cacheKeyChildren = offlineCache.buildKey('home_children', uid);

    const isParentUser = isParentRole(roles);

    // 1. Baca cache dulu — tampil instan saat offline
    const [cachedDash, cachedAnn, cachedChildren] = await Promise.all([
      offlineCache.get<DashboardData>(cacheKeyDash),
      offlineCache.get<any[]>(cacheKeyAnn),
      isParentUser ? offlineCache.get<any[]>(cacheKeyChildren) : Promise.resolve(null),
    ]);
    if (cachedDash) setDashboard(cachedDash);
    if (cachedAnn && cachedAnn.length > 0) setFetchedAnnouncements(cachedAnn);
    if (isParentUser && cachedChildren && cachedChildren.length > 0) {
      isSyncingDataRef.current = true;
      setParentChildren(cachedChildren);
      useActiveChildStore.getState().setChildren(cachedChildren);
      const gid = useActiveChildStore.getState().activeChildId;
      let targetIdx = activeChildIndexRef.current;
      if (gid) {
        const found = cachedChildren.findIndex((c) => String(c.id || c.student_id) === String(gid));
        if (found !== -1) {
          targetIdx = found;
        }
      }
      if (targetIdx >= cachedChildren.length) {
        targetIdx = 0;
      }
      activeChildIndexRef.current = targetIdx;
      setActiveChildIndex(targetIdx);
      requestAnimationFrame(() => {
        scrollToActiveChild(targetIdx, false);
        setTimeout(() => { isSyncingDataRef.current = false; }, 250);
      });
    } else if (!isParentUser) {
      if (isStudentRole(roles)) {
        const studentUser = useAuthStore.getState().user;
        const sData = (studentUser as any)?.student || studentUser;
        if (sData) {
          const sObj = {
            id: sData.id || sData.student_id || studentUser?.id,
            student_id: sData.student_id || sData.id || studentUser?.id,
            name: sData.nama_lengkap || sData.name || studentUser?.name || 'Siswa',
            full_name: sData.nama_lengkap || sData.name || studentUser?.name || 'Siswa',
            nama_lengkap: sData.nama_lengkap || sData.name || studentUser?.name || 'Siswa',
            nis: sData.nis || (studentUser as any)?.nis || '-',
            nisn: sData.nisn || (studentUser as any)?.nisn || '-',
            kelas: sData.kelas || (studentUser as any)?.kelas || (studentUser as any)?.class_name || '-',
            class_name: typeof sData.kelas === 'object' && sData.kelas !== null ? (sData.kelas.nama_kelas || sData.kelas.name || '-') : (typeof sData.kelas === 'string' ? sData.kelas : ((studentUser as any)?.class_name || '-')),
            education_unit: sData.education_unit || (studentUser as any)?.education_unit || (studentUser as any)?.unit || null,
            unit_name: sData.unit_name || (studentUser as any)?.unit_name || ((studentUser as any)?.education_unit?.name) || 'Unit Pendidikan',
            gender: sData.gender || sData.jenis_kelamin || studentUser?.gender || 'L',
            photo_url: getProfileImageUrl(sData) || getProfileImageUrl(studentUser) || null,
            avatar_url: getProfileImageUrl(sData) || getProfileImageUrl(studentUser) || null,
            attendance_today: sData.attendance_today || null,
          };
          setParentChildren([sObj]);
          useActiveChildStore.getState().setChildren([sObj]);
          useActiveChildStore.getState().setActiveChildId(String(sObj.id));
        }
      } else {
        setParentChildren([]);
        useActiveChildStore.getState().clear();
      }
    }

    // 2. Fetch dari backend
    try {
      const currentRoles = useAuthStore.getState().roles;
      const isParentActive = isParentRole(currentRoles);
      const isStudentActive = isStudentRole(currentRoles);

      const infoPromise = (isParentActive || isStudentActive)
        ? mobileApiService.getPortalSchoolInformation({ strict_unit: true, per_page: 15 })
        : mobileApiService.getSchoolInformation({ per_page: 6 });

      const [dashRes, profRes, infoRes, unreadCountRes, childrenRes] = await Promise.allSettled([
        mobileApiService.getRoleDashboard(currentRoles),
        mobileApiService.getProfile(),
        infoPromise,
        mobileApiService.getUnreadNotificationCount(),
        isParentActive ? mobileApiService.getPortalChildren() : Promise.resolve({ data: [] }),
      ]);

      if (dashRes.status === 'fulfilled') {
        const d = unwrapApiData<DashboardData>(dashRes.value) || {};
        setDashboard(d);
        void offlineCache.set(cacheKeyDash, d);
      }
      if (profRes.status === 'fulfilled') {
        const profile = profRes.value?.data?.data ?? profRes.value?.data ?? profRes.value;
        if (profile) {
          useAuthStore.getState().syncServerProfile(profile);
          setImageError(false);
        }
      }
      if (infoRes.status === 'fulfilled') {
        const rawInfo = infoRes.value;
        const unwrapped = unwrapApiData<any>(rawInfo) || rawInfo?.data || rawInfo;
        const infoList = Array.isArray(unwrapped?.data)
          ? unwrapped.data
          : Array.isArray(unwrapped)
          ? unwrapped
          : unwrapCollection<any>(rawInfo);

        if (Array.isArray(infoList) && infoList.length > 0) {
          setFetchedAnnouncements(infoList);
          void offlineCache.set(cacheKeyAnn, infoList);
        }
      }
      if (unreadCountRes.status === 'fulfilled') {
        const countData = unreadCountRes.value as any;
        const count = Number(
          countData?.data?.unread_count ??
          countData?.unread_count ??
          (typeof countData === 'number' ? countData : 0)
        );
        setUnreadNotificationCount(Math.max(0, count));
      }
      if (isParentActive && childrenRes.status === 'fulfilled') {
        const chList = unwrapApiData<any[]>(childrenRes.value) || [];
        if (Array.isArray(chList) && chList.length > 0) {
          isSyncingDataRef.current = true;
          setParentChildren(chList);
          useActiveChildStore.getState().setChildren(chList);
          const gid = useActiveChildStore.getState().activeChildId;
          let curIdx = activeChildIndexRef.current;
          if (gid) {
            const found = chList.findIndex((c) => String(c.id || c.student_id) === String(gid));
            if (found !== -1) {
              curIdx = found;
            }
          }
          if (curIdx >= chList.length) {
            curIdx = 0;
          }
          activeChildIndexRef.current = curIdx;
          setActiveChildIndex(curIdx);

          // Pastikan scroll tetap berada di posisi anak aktif, jangan melompat ke anak pertama
          requestAnimationFrame(() => {
            scrollToActiveChild(curIdx, false);
            setTimeout(() => { isSyncingDataRef.current = false; }, 250);
          });
          void offlineCache.set(cacheKeyChildren, chList);
          const curActive = chList[curIdx] || chList[0];
          const curId = curActive?.id || curActive?.student_id;
          if (curId) {
            void fetchTodayTimeline(curId, undefined, true);
            void fetchHomeWidgets(curId);
          }
        } else {
          void fetchTodayTimeline(undefined, undefined, true);
          void fetchHomeWidgets(undefined);
        }
      } else if (!isParentActive) {
        if (isStudentRole(currentRoles)) {
          const studentUser = useAuthStore.getState().user;
          const sData = (studentUser as any)?.student || studentUser;
          if (sData) {
            const sObj = {
              id: sData.id || sData.student_id || studentUser?.id,
              student_id: sData.student_id || sData.id || studentUser?.id,
              name: sData.nama_lengkap || sData.name || studentUser?.name || 'Siswa',
              full_name: sData.nama_lengkap || sData.name || studentUser?.name || 'Siswa',
              nama_lengkap: sData.nama_lengkap || sData.name || studentUser?.name || 'Siswa',
              nis: sData.nis || (studentUser as any)?.nis || '-',
              nisn: sData.nisn || (studentUser as any)?.nisn || '-',
              kelas: sData.kelas || (studentUser as any)?.kelas || (studentUser as any)?.class_name || '-',
              class_name: typeof sData.kelas === 'object' && sData.kelas !== null ? (sData.kelas.nama_kelas || sData.kelas.name || '-') : (typeof sData.kelas === 'string' ? sData.kelas : ((studentUser as any)?.class_name || '-')),
              education_unit: sData.education_unit || (studentUser as any)?.education_unit || (studentUser as any)?.unit || null,
              unit_name: sData.unit_name || (studentUser as any)?.unit_name || ((studentUser as any)?.education_unit?.name) || 'Unit Pendidikan',
              gender: sData.gender || sData.jenis_kelamin || studentUser?.gender || 'L',
              photo_url: getProfileImageUrl(sData) || getProfileImageUrl(studentUser) || null,
              avatar_url: getProfileImageUrl(sData) || getProfileImageUrl(studentUser) || null,
              attendance_today: sData.attendance_today || { status: 'Hadir' },
            };
            setParentChildren([sObj]);
            useActiveChildStore.getState().setChildren([sObj]);
            useActiveChildStore.getState().setActiveChildId(String(sObj.id));
            activeChildIndexRef.current = 0;
            setActiveChildIndex(0);
            void fetchTodayTimeline(String(sObj.id), undefined, true);
            void fetchHomeWidgets(String(sObj.id));
          }
        } else {
          setParentChildren([]);
          useActiveChildStore.getState().clear();
        }
      }
    } catch (requestError) {
      // Offline: data cache sudah tampil dari step 1
      setError(getApiErrorMessage(requestError, 'Dashboard belum berhasil dimuat.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rolesKey]);

  useEffect(() => {
    void load();
  }, [load]);


  // paddingTop body kini STATIS (paddingTop: 4 di styles.curvedSheetBody) ala halaman
  // Jadwal — animasi layout JS-driven yang bikin melompat sudah dihapus.

  const announcements = useMemo(() => {
    if (fetchedAnnouncements.length > 0) return fetchedAnnouncements;
    // Ambil dari data dashboard jika tersedia
    const list = listAt(dashboard, [
      'tables.announcements',
      'recent_information',
      'agenda_yayasan',
      'announcements',
      'pengumuman_sekolah',
    ]);
    // Hanya tampilkan data real dari backend, jika kosong kembalikan array kosong
    return list;
  }, [fetchedAnnouncements, dashboard]);

  const name = user?.name || user?.fullName || 'Pengguna';
  const profileImageUrl = getProfileImageUrl(user, dashboard);

  useEffect(() => {
    setImageError((prev) => (prev ? false : prev));
  }, [profileImageUrl]);

  const studentClass =
    dashboard?.student?.kelas?.nama_kelas ||
    dashboard?.student?.kelas?.name ||
    (typeof user?.kelas === 'object' && user?.kelas !== null
      ? (user?.kelas as any)?.nama_kelas || (user?.kelas as any)?.name || ''
      : (typeof user?.kelas === 'string' ? user?.kelas : '')) ||
    '';
  const subGreeting = student
    ? studentClass ? `${studentClass} · Siswa` : 'Siswa'
    : parent
    ? `Orang Tua dari ${user?.student_name || 'Siswa'}`
    : alumni
    ? 'Alumni'
    : isDualRole
    ? (dualRoleMode === 'musyrif' ? 'Musyrif Asrama' : 'Guru Pengajar')
    : musyrif
    ? 'Musyrif Asrama'
    : teacher
    ? 'Guru Pengajar'
    : principal
    ? 'Kepala Sekolah'
    : foundation || superAdmin || divisi
    ? 'Yayasan & Pimpinan'
    : 'Tata Usaha / Staf';

  // 4-Column Dynamic Menus Mapped Per Role (Mockup #4 & Web Dashboard Unified Config)
  const roleMenus = useMemo(() => {
    const currentRoleKey = alumni
      ? 'alumni'
      : isDualRole
      ? dualRoleMode
      : musyrif
      ? 'musyrif'
      : principal
      ? 'principal'
      : (foundation || superAdmin || divisi)
      ? 'foundation'
      : teacher
      ? 'teacher'
      : parent
      ? 'parent'
      : student
      ? 'student'
      : tu
      ? 'tu'
      : 'staff';

    const dynamicMenus = mobileConfig?.role_menus?.[currentRoleKey];
    if (dynamicMenus && Array.isArray(dynamicMenus) && dynamicMenus.length > 0) {
      const seenRoutes = new Set<string>();
      const active = dynamicMenus.filter((item) => {
        if (item.is_active === false || item.enabled === false) return false;
        // Filter out web URL routes (e.g. /dashboard/...) that do not correspond to native mobile screens
        if (typeof item.route === 'string' && item.route.startsWith('/')) return false;

        if (currentRoleKey === 'principal') {
          const unauthorizedForPrincipal = [
            'dash-tu',
            'portal-musyrif-workspace',
            'mob-bank-soal',
            'lms-bank-soal',
            'portal-guru-workspace',
            'dash-tahfizh',
            'portal-sivitas',
            'mob-perizinan-santri',
            'mob-tugas-lms',
            'lms-penugasan',
            'mob-buku-hubung',
            'mob-tagihan-spp',
          ];
          if (unauthorizedForPrincipal.includes(item.id)) return false;
        }

        // Deduplication by destination screen & tab: jangan ada menu ganda yang direct ke halaman yang sama
        const destKey = `${item.route || 'HomeScreen'}__${item.tab || ''}`;
        if (seenRoutes.has(destKey)) return false;
        seenRoutes.add(destKey);

        return true;
      });
      if (active.length > 0) {
        return active.map((item) => {
          const row: any[] = [
            item.label,
            item.icon || 'circle-outline',
            item.color || '#059669',
            item.bg || '#ECFDF5',
            item.route || 'HomeScreen',
          ];
          if (item.tab) {
            row.push(item.tab);
          }
          return row;
        });
      }
    }

    if (alumni) {
      return [
        ['Informasi', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Kalender', 'calendar-month', '#2563EB', '#EFF6FF', 'Kalender'],
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
        ['Profil Alumni', 'account-school-outline', '#0D9488', '#E6FFFA', 'Profil'],
        ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
      ];
    }
    if (musyrif) {
      return [
        ['Presensi Mandiri', 'account-clock-outline', '#10B981', '#ECFDF5', 'PresensiMandiriStaff'],
        ['Absensi Asrama', 'home-account', '#0D9488', '#E6FFFA', 'Absensi', 'boarding'],
        ['Izin Santri', 'card-account-details-outline', '#EF4444', '#FEF2F2', 'Perizinan', 'asrama'],
        ['Mutabaah Asrama', 'clipboard-check', '#F59E0B', '#FEF9EC', 'Mutabaah'],
        ['Setoran Tahfizh', 'book-marker', '#2563EB', '#EFF6FF', 'Tahfizh'],
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
        ['Chat Wali & Staf', 'message-text-outline', '#059669', '#ECFDF5', 'Chat Guru'],
        ['Kalender Pondok', 'calendar-month', '#0891B2', '#CFFAFE', 'Kalender'],
        ['Pengumuman & Informasi', 'newspaper-variant-outline', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
      ];
    }
    if (principal) {
      return [
        ['Dashboard Kepala Sekolah', 'view-dashboard-outline', '#059669', '#E6F4EA', 'PrincipalDashboard'],
        ['Supervisi KBM', 'human-male-board', '#0F766E', '#F0FDFA', 'SupervisiKbm'],
        ['Presensi Guru', 'account-check-outline', '#059669', '#ECFDF5', 'RekapPresensiGuru', 'pegawai'],
        ['Presensi Siswa', 'account-group', '#0284C7', '#E0F2FE', 'RekapPresensiSiswa', 'siswa'],
        ['Presensi Mandiri', 'account-clock-outline', '#10B981', '#ECFDF5', 'PresensiMandiriStaff'],
        ['Pantau Kelas & Rombel', 'google-classroom', '#D97706', '#FEF3C7', 'PantauKelas'],
        ['Buku Induk Siswa', 'account-school-outline', '#0284C7', '#E0F2FE', 'MasterSiswa'],
        ['Data SDM Guru & Staf', 'account-group-outline', '#7C3AED', '#F5F3FF', 'Data', 'employees'],
        ['Kelola Alumni & Mutasi', 'account-switch', '#7C3AED', '#F5F3FF', 'MutasiSiswa'],
        ['Izin & Cuti Sekolah', 'file-document-edit', '#D97706', '#FEF3C7', 'Perizinan', 'permissions'],
        ['Jadwal Pelajaran', 'calendar-clock', '#2563EB', '#EFF6FF', 'Jadwal'],
        ['Kalender Akademik', 'calendar-month', '#0891B2', '#CFFAFE', 'Kalender'],
        ['Supervisi Materi', 'book-open-page-variant', '#0D9488', '#CCFBF1', 'Materi'],
        ['Monitoring Tugas', 'clipboard-text', '#F59E0B', '#FEF9EC', 'Tugas'],
        ['Penilaian & Rapor', 'card-account-details-star-outline', '#059669', '#E6F4EA', 'Nilai'],
        ['Monitoring Tahfizh', 'book-marker', '#059669', '#E6F4EA', 'Tahfizh'],
        ['Rekap Mutaba\'ah', 'clipboard-check', '#E11D48', '#FFE4E6', 'Mutabaah'],
        ['Al-Qur\'an', 'book-open-variant', '#0284C7', '#E0F2FE', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#0D9488', '#E6FFFA', 'DoaDzikir'],
        ['Chat Pegawai', 'message-text-outline', '#059669', '#ECFDF5', 'Chat Guru'],
        ['Informasi Sekolah', 'bullhorn-outline', '#0284C7', '#E0F2FE', 'Informasi'],
        ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
      ];
    }
    if (foundation || superAdmin || divisi) {
      return [
        ['Pusat Data', 'database-outline', '#059669', '#E6F4EA', 'Data'],
        ['Presensi Siswa', 'account-group', '#0284C7', '#E0F2FE', 'RekapPresensiSiswa', 'siswa'],
        ['Presensi Guru', 'account-check-outline', '#059669', '#ECFDF5', 'RekapPresensiGuru', 'pegawai'],
        ['Presensi Mandiri', 'account-clock-outline', '#10B981', '#ECFDF5', 'PresensiMandiriStaff'],
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#E6F4EA', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#0D9488', '#E6FFFA', 'DoaDzikir'],
        ['Kalender Akademik', 'calendar-month-outline', '#0891B2', '#CFFAFE', 'Kalender'],
        ['Presensi Unit', 'calendar-check-outline', '#0D9488', '#E6FFFA', 'Absensi'],
        ['Tahfizh', 'book-open-page-variant', '#10B981', '#ECFDF5', 'Tahfizh'],
        ['Mutabaah Yaumiyah', 'check-decagram-outline', '#059669', '#E6F4EA', 'Mutabaah'],
        ['Informasi Sekolah', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
      ];
    }
    if (teacher) {
      return [
        ['Presensi Mandiri', 'account-check-outline', '#10B981', '#ECFDF5', 'QR Code', 'mandiri'],
        ['Jadwal Pelajaran', 'clock-time-four', '#7C3AED', '#F5F3FF', 'Jadwal'],
        ['Presensi KBM', 'account-check', '#059669', '#ECFDF5', 'QR Code', 'manual'],
        ['Materi Belajar', 'book-multiple', '#0D9488', '#E6FFFA', 'Materi', 'materials'],
        ['Tugas Siswa', 'clipboard-text', '#F59E0B', '#FEF9EC', 'Tugas'],
        ['Penilaian & Rapor', 'chart-box', '#10B981', '#E8FAF2', 'Nilai'],
        ['Tahfizh', 'book-marker', '#2563EB', '#EFF6FF', 'Tahfizh'],
        ['Mutabaah Yaumiyah', 'clipboard-check', '#D97706', '#FEF3C7', 'Mutabaah'],
        ['Buku Penghubung', 'book-open-page-variant', '#8B5CF6', '#F5F3FF', 'Chat'],
        ['Kisi-kisi', 'file-question', '#EF4444', '#FEF2F2', 'KisiKisi'],
        ['Bank Soal', 'database-outline', '#0D9488', '#E6FFFA', 'BankSoal'],
        ['CBT Ujian Online', 'laptop', '#2563EB', '#EFF6FF', 'CbtExams'],
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Kalender Akademik', 'calendar-month', '#2563EB', '#EFF6FF', 'Kalender'],
        ['Doa & Dzikir', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
        ['Informasi Sekolah', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Pengaturan', 'cog', '#64748B', '#F8FAFC', 'Lainnya'],
      ];
    }
    if (parent) {
      return [
        ['Jadwal Pelajaran', 'calendar-clock', '#0D9488', '#ECFDF5', 'Jadwal'],
        ['Tugas LMS', 'clipboard-text-outline', '#10B981', '#ECFDF5', 'Tugas'],
        ['Materi Belajar', 'book-open-page-variant', '#0284C7', '#EFF6FF', 'Materi'],
        ['Penilaian & Rapor', 'chart-box-outline', '#8B5CF6', '#F5F3FF', 'Nilai'],
        ['Tagihan SPP', 'cash-multiple', '#059669', '#ECFDF5', 'Tagihan'],
        ['Tahfizh Al-Qur\'an', 'book-marker', '#059669', '#ECFDF5', 'Tahfizh'],
        ['Mutaba\'ah Yaumiyyah', 'clipboard-check-outline', '#D97706', '#FFFBEB', 'Mutabaah'],
        ['Buku Hubung', 'notebook-edit-outline', '#E11D48', '#FFF1F2', 'Komentar'],
        ['Bank Soal', 'database-outline', '#0D9488', '#E6FFFA', 'BankSoal'],
        ['Presensi Siswa', 'account-check-outline', '#059669', '#ECFDF5', 'Absensi'],
        ['Perizinan Santri', 'file-document-edit-outline', '#EF4444', '#FEF2F2', 'Perizinan'],
        ['Chat Guru', 'chat-processing-outline', '#2563EB', '#EFF6FF', 'Chat'],
        ['Ujian CBT Online', 'laptop', '#2563EB', '#EFF6FF', 'CbtExams'],
        ['Kisi-kisi Asesmen', 'file-question', '#EF4444', '#FEF2F2', 'KisiKisi'],
        ['Kalender Akademik', 'calendar-month-outline', '#0284C7', '#F0F9FF', 'Kalender'],
        ['Informasi Sekolah', 'bullhorn-outline', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Al-Qur\'an Digital', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir Harian', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
      ];
    }
    if (student) {
      return [
        ['Jadwal Pelajaran', 'calendar-clock', '#0D9488', '#ECFDF5', 'Jadwal'],
        ['Tugas LMS', 'clipboard-text-outline', '#10B981', '#ECFDF5', 'Tugas'],
        ['Materi Belajar', 'book-open-page-variant', '#0284C7', '#EFF6FF', 'Materi'],
        ['Penilaian & Rapor', 'chart-box-outline', '#8B5CF6', '#F5F3FF', 'Nilai'],
        ['Tahfizh Al-Qur\'an', 'book-marker', '#059669', '#ECFDF5', 'Tahfizh'],
        ['Mutaba\'ah Yaumiyyah', 'clipboard-check-outline', '#D97706', '#FFFBEB', 'Mutabaah'],
        ['Buku Hubung', 'notebook-edit-outline', '#E11D48', '#FFF1F2', 'Komentar'],
        ['Bank Soal', 'database-outline', '#0D9488', '#E6FFFA', 'BankSoal'],
        ['Presensi Siswa', 'account-check-outline', '#059669', '#ECFDF5', 'Absensi'],
        ['Perizinan Santri', 'file-document-edit-outline', '#EF4444', '#FEF2F2', 'Perizinan', 'permissions'],
        ['Ujian CBT Online', 'laptop', '#2563EB', '#EFF6FF', 'CbtExams'],
        ['Kisi-kisi Asesmen', 'file-question', '#EF4444', '#FEF2F2', 'KisiKisi'],
        ['Kalender Akademik', 'calendar-month-outline', '#0284C7', '#F0F9FF', 'Kalender'],
        ['Informasi Sekolah', 'bullhorn-outline', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Al-Qur\'an Digital', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir Harian', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
      ];
    }
    // ── Tata Usaha — menu sesuai akses web-dashboard TU
    if (tu) {
      return [
        ['Presensi Mandiri', 'account-check-outline', '#10B981', '#ECFDF5', 'PresensiMandiriStaff'],
        ['Presensi KBM', 'calendar-check-outline', '#059669', '#ECFDF5', 'PresensiKbmPengganti'],
        ['Absensi Gerbang', 'door-open', '#0D9488', '#E6FFFA', 'AbsensiGerbangTerminal'],
        ['Rekap Siswa', 'clipboard-list-outline', '#059669', '#E6F4EA', 'RekapPresensiSiswa'],
        ['Data Master', 'database-outline', '#059669', '#E6F4EA', 'Data'],
        ['Kelola Alumni', 'school', '#D97706', '#FFFBEB', 'Data', 'alumni'],
        ['Jadwal Pelajaran', 'calendar-clock', '#7C3AED', '#F5F3FF', 'Jadwal'],
        ['Bahan Ajar', 'book-multiple', '#0D9488', '#E6FFFA', 'Materi', 'materials'],
        ['Tugas LMS', 'clipboard-text', '#F59E0B', '#FEF9EC', 'Tugas'],
        ['Ujian CBT', 'laptop', '#2563EB', '#EFF6FF', 'CbtExams'],
        ['Bank Soal', 'database-outline', '#0D9488', '#E6FFFA', 'BankSoal'],
        ['Kisi-kisi', 'file-question', '#EF4444', '#FEF2F2', 'KisiKisi'],
        ['Nilai Siswa', 'chart-box', '#10B981', '#E8FAF2', 'Nilai'],
        ['Catatan Siswa', 'book-open-page-variant', '#8B5CF6', '#F5F3FF', 'Komentar'],
        ['Tagihan Siswa', 'cash-multiple', '#E11D48', '#FFF1F2', 'Tagihan'],
        ['Kalender', 'calendar-month', '#2563EB', '#EFF6FF', 'Kalender'],
        ['Informasi', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Chat Pegawai', 'message-text-outline', '#059669', '#E6F4EA', 'Chat Guru'],
        ['Tahfizh', 'book-marker', '#2563EB', '#EFF6FF', 'Tahfizh'],
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
        ['Profil Staf', 'account-circle-outline', '#0D9488', '#E6FFFA', 'Profil'],
      ];
    }
    // Default Staf / Operator lainnya
    return [
      ['Data Master', 'account-group-outline', '#059669', '#E6F4EA', 'Data'],
      ['Absensi', 'calendar-check-outline', '#0D9488', '#E6FFFA', 'Absensi'],
      ['Kalender', 'calendar-month', '#2563EB', '#EFF6FF', 'Kalender'],
      ['Informasi', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
      ['Al-Qur\'an', 'book-open-variant', '#059669', '#E6F4EA', 'Quran'],
      ['Doa & Dzikir', 'hands-pray', '#0D9488', '#E6FFFA', 'DoaDzikir'],
      ['Profil Staf', 'account-circle-outline', '#0D9488', '#E6FFFA', 'Profil'],
      ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
    ];
  }, [principal, foundation, superAdmin, divisi, musyrif, alumni, teacher, parent, student, tu, isDualRole, dualRoleMode, mobileConfig?.role_menus]);

  const primaryMenuItems = useMemo(() => {
    if (student || parent) {
      const top7 = roleMenus.slice(0, 7);
      return [
        ...top7,
        ['Semua Menu', 'view-grid-outline', '#475569', '#F8FAFC', '__OPEN_MODAL__'],
      ];
    }
    const top7 = roleMenus.slice(0, 7);
    const toggleTile = isMenuExpanded
      ? ['Kembali', 'chevron-up', '#047857', '#DEF7EC', '__TOGGLE__']
      : ['Lainnya', 'view-grid-plus-outline', '#10B981', '#ECFDF5', '__TOGGLE__'];
    return [...top7, toggleTile];
  }, [parent, student, roleMenus, isMenuExpanded]);

  const primaryRows = useMemo(() => {
    const rows: any[][] = [];
    for (let i = 0; i < primaryMenuItems.length; i += 4) {
      rows.push(primaryMenuItems.slice(i, i + 4));
    }
    return rows;
  }, [primaryMenuItems]);

  const expandedRows = useMemo(() => {
    const remaining = roleMenus.slice(7);
    const rows: any[][] = [];
    for (let i = 0; i < remaining.length; i += 4) {
      rows.push(remaining.slice(i, i + 4));
    }
    return rows;
  }, [roleMenus]);

  const handleMenuNavigation = useCallback(
    (route: string, tabKey?: string) => {
      if (route === '__OPEN_MODAL__' || route === 'Lihat Semua') {
        setShowAllMenusModal(true);
        return;
      }
      if (route === 'Lainnya' || route === '__TOGGLE__') {
        toggleMenuExpansion();
        return;
      }
      const isGeneralIslamic = route === 'Quran' || route === 'DoaDzikir';
      const activeStudent = parentChildren[activeChildIndex];
      const activeChildId = activeStudent?.id || activeStudent?.student_id;

      const navParams: Record<string, any> = {};
      if (tabKey) {
        navParams.tab = String(tabKey);
        navParams.initialResource = String(tabKey);
        navParams.mode = String(tabKey);
        if (tabKey === 'mutasi') {
          navParams.filterStatus = 'mutasi';
          navParams.tab = 'mutasi';
        } else if (tabKey === 'classes' || tabKey === 'kelas') {
          navParams.tab = 'classes';
          navParams.initialResource = 'classes';
        } else if (tabKey === 'students' || tabKey === 'master') {
          navParams.tab = 'students';
          navParams.initialResource = 'students';
          navParams.filterStatus = 'all';
        } else if (tabKey === 'scan') {
          navParams.context = 'gate';
        } else if (tabKey === 'manual') {
          navParams.open_rombel = true;
        } else if (tabKey === 'pegawai') {
          navParams.defaultSubject = 'pegawai';
        } else if (tabKey === 'siswa') {
          navParams.defaultSubject = 'siswa';
        } else if (tabKey === 'rekap_siswa') {
          navParams.tab = 'rekap_siswa';
        } else if (tabKey === 'asrama') {
          navParams.tab = 'boarding';
        } else if (tabKey === 'permissions') {
          navParams.tab = 'permissions';
        }
      }
      if (parent && activeChildId && !isGeneralIslamic) {
        navParams.child_id = String(activeChildId);
        navParams.student_id = String(activeChildId);
        navParams.single_child_only = false;
      } else if (student && !isGeneralIslamic) {
        const studentId = (user as any)?.student?.id || (user as any)?.student_id || user?.id;
        if (studentId) {
          navParams.child_id = String(studentId);
          navParams.student_id = String(studentId);
        }
      } else if (teacher && !isGeneralIslamic) {
        const selectedClassId = useTeacherClassStore.getState().selectedClassId;
        const selectedClass = useTeacherClassStore.getState().getSelectedClass();
        if (selectedClassId && selectedClassId !== '__ALL__' && selectedClassId !== '__NONE__') {
          navParams.kelas_id = String(selectedClassId);
          navParams.class_id = String(selectedClassId);
          if (selectedClass?.nama_kelas || selectedClass?.name) {
            navParams.class_name = String(selectedClass.nama_kelas || selectedClass.name);
          }
        }
      }

      navigation.navigate(
        String(route),
        Object.keys(navParams).length > 0 ? navParams : undefined
      );
    },
    [parent, student, teacher, parentChildren, activeChildIndex, user, navigation]
  );

  // SATU ukuran untuk semua jumlah berita (disamakan dengan carousel siswa):
  // 1 berita -> full statis | >1 -> SW-54 + peek seimbang. Gap seragam 12.
  const newsGap = STUDENT_CARD_GAP;

  const newsCardWidth = useMemo(() => {
    if (announcements.length <= 1) return SCREEN_WIDTH - 32;
    return SCREEN_WIDTH - 16 - STUDENT_CARD_GAP - STUDENT_PEEK_WIDTH;
  }, [announcements.length]);

  const newsSnapInterval = useMemo(() => {
    return newsCardWidth + newsGap;
  }, [newsCardWidth, newsGap]);

  const newsTrackPaddingHorizontal = useMemo(() => {
    // Satu rumus untuk semua jumlah: setengah sisa layar -> peek kiri-kanan seimbang.
    // (0-1: 16 | 2-3: 27 (sebelumnya 16 -> kiri 4px vs kanan 26px) | >3: 32)
    return Math.round((SCREEN_WIDTH - newsCardWidth) / 2);
  }, [newsCardWidth]);

  const handleCarouselScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / newsSnapInterval);
    if (index !== activeSlideIndex && index >= 0 && index < announcements.length) {
      setActiveSlideIndex(index);
    }
  };

  const activeStudent = parentChildren[activeChildIndex];
  const activeChildId = activeStudent ? String(activeStudent.id || activeStudent.student_id || '') : undefined;

  // Re-fetch saat child atau tanggal yang dilihat berubah (debounce 250ms saat swipe bebas,
  // atau instan 0ms saat tombol/kartu ditap langsung).
  useEffect(() => {
    if (!isParentRole(roles) && !isStudentRole(roles)) return;
    const isDirectTap = Date.now() - globalLastDirectTapTime < 600;
    if (isDirectTap) {
      void fetchTodayTimeline(activeChildId, viewedDate, isViewingToday);
      return;
    }
    const t = setTimeout(() => {
      void fetchTodayTimeline(activeChildId, viewedDate, isViewingToday);
    }, 250);
    return () => clearTimeout(t);
  }, [activeChildId, viewedDate, isViewingToday, fetchTodayTimeline, roles]);

  // Realtime WebSocket Subscription untuk Aktivitas Siswa (Presensi & Tahfizh Instant Zero-Delay)
  useEffect(() => {
    if (!activeChildId) return;

    const channel = `student.${activeChildId}`;
    const unsubscribe = realtimeWs.subscribe(channel, (eventData) => {
      if (eventData.event === 'student.activity.logged') {
        const activity = eventData.payload;
        if (!activity) return;

        // 1. Sisipkan ke urutan paling atas daftar aktivitas hari ini
        setTodayTimeline((prev: any) => {
          if (!prev) {
            void fetchTodayTimeline(activeChildId, viewedDate, isViewingToday);
            return prev;
          }
          const existingList = Array.isArray(prev.activities) ? prev.activities : [];
          if (existingList.some((item: any) => item.id === activity.id)) {
            return prev;
          }
          return {
            ...prev,
            activities: [activity, ...existingList],
          };
        });

        // 2. Munculkan In-App Pop-up Banner Real-Time
        setRealtimeBanner({
          title: activity.title || 'Aktivitas Baru',
          subtitle: activity.subtitle || 'Tercatat di sistem',
          badge: activity.badge_label || 'Baru',
          type: activity.type || 'mapel',
        });

        // Auto-hide banner setelah 5 detik
        setTimeout(() => {
          setRealtimeBanner(null);
        }, 5000);

        // 3. Refresh widget jika aktivitas tahfizh
        if (activity.type === 'tahfizh') {
          void fetchHomeWidgets(activeChildId);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeChildId, viewedDate, fetchTodayTimeline, fetchHomeWidgets]);

  // Fetch widget tugas & jadwal hari ini saat child aktif berubah
  useEffect(() => {
    if (!isParentRole(roles) && !isStudentRole(roles)) return;
    const isDirectTap = Date.now() - globalLastDirectTapTime < 600;
    if (isDirectTap) {
      void fetchHomeWidgets(activeChildId);
      return;
    }
    const t = setTimeout(() => {
      void fetchHomeWidgets(activeChildId);
    }, 250);
    return () => clearTimeout(t);
  }, [activeChildId, fetchHomeWidgets, roles]);

  const activeChildName = activeStudent?.full_name || activeStudent?.nama_lengkap || activeStudent?.name || '';
  const activeChildShortName = activeChildName.split(' ')[0] || activeChildName;
  const activeChildPhoto = activeStudent ? getProfileImageUrl(activeStudent) : null;
  const activeChildGender = activeStudent?.gender || activeStudent?.jenis_kelamin;
  const isFemaleStudent = activeChildGender === 'female' || activeChildGender === 'P';
  const defaultStudentAvatar = isFemaleStudent ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;

  // Computed vars untuk sticky rich header
  const stickyActiveStudentNis = activeStudent?.nis || activeStudent?.student_nis || (student ? (user as any)?.nis || '-' : '-');
  const stickyActiveStudentClass = typeof activeStudent?.kelas === 'object' && activeStudent?.kelas !== null
    ? (activeStudent?.kelas?.nama_kelas || activeStudent?.kelas?.name || '')
    : (activeStudent?.class_name || (typeof activeStudent?.kelas === 'string' ? activeStudent.kelas : '') || (student ? String(studentClass || '') : ''));
  const stickyActiveStudentUnit = typeof activeStudent?.education_unit === 'object' && activeStudent?.education_unit !== null
    ? (activeStudent?.education_unit?.name || activeStudent?.education_unit?.nama || '')
    : (activeStudent?.unit_name || (typeof activeStudent?.unit === 'string' ? activeStudent.unit : (activeStudent?.unit?.name || '')) || (student ? (user as any)?.unit_name || '' : ''));

  // Label Kelas/Jenjang/Presensi disamakan rumus dengan card bodi (sKelas/sJenjang/rawPresensi)
  const stickyStudentKelas = typeof activeStudent?.kelas === 'object' && activeStudent?.kelas !== null
    ? (activeStudent?.kelas?.nama_kelas || activeStudent?.kelas?.name || '')
    : (activeStudent?.class_name || (typeof activeStudent?.kelas === 'string' ? activeStudent.kelas : '') || (student ? String(studentClass || '') : ''));
  const stickyStudentJenjang =
    (typeof activeStudent?.kelas?.jenjang === 'string' ? activeStudent.kelas.jenjang : '') ||
    (typeof activeStudent?.education_unit?.level === 'string' ? activeStudent.education_unit.level : '') ||
    '';
  const stickyRawPresensi = (() => {
    const raw =
      activeStudent?.attendance_today?.status_label ||
      activeStudent?.attendance_today?.label ||
      activeStudent?.presensi_hari_ini?.status ||
      activeStudent?.attendance_status ||
      activeStudent?.status_kehadiran ||
      activeStudent?.presensi_status ||
      (String(todayTimeline?.student?.id || '') === String(activeStudent?.id || '') ? todayTimeline?.summary?.attendance_status : undefined);
    if (raw && String(raw).trim().length > 0 && String(raw).trim() !== '-') {
      return String(raw).trim();
    }
    const day = new Date().getDay();
    if (activeStudent?.is_holiday || day === 0 || day === 6) {
      return 'Libur';
    }
    return 'Belum Presensi';
  })();
  const stickyLower = stickyRawPresensi.toLowerCase();
  const stickyIsHadir = stickyLower.includes('hadir') || stickyLower.includes('masuk');
  const stickyIsLibur = stickyLower.includes('libur');
  const stickyIsIzinSakit = stickyLower.includes('izin') || stickyLower.includes('sakit');
  const stickyIsTerlambat = stickyLower.includes('terlambat');
  const stickyIsAlpa = stickyLower.includes('alpa') || stickyLower.includes('alpha') || stickyLower.includes('tidak hadir');
  // Warna teks & titik disamakan persis card bodi
  const stickyPresensiTextColor = stickyIsHadir ? '#DEF7EC' : stickyIsLibur ? '#FEF3C7' : stickyIsIzinSakit ? '#DBEAFE' : stickyIsTerlambat ? '#FEF08A' : stickyIsAlpa ? '#FECACA' : '#E2E8F0';
  const stickyPresensiDotColor = stickyIsHadir ? '#10B981' : stickyIsLibur ? '#F59E0B' : stickyIsIzinSakit ? '#38BDF8' : stickyIsTerlambat ? '#F59E0B' : stickyIsAlpa ? '#EF4444' : '#94A3B8';
  const stickyStudentNisn = activeStudent?.nisn || (activeStudent as any)?.metadata?.nisn || '-';
  const stickyBodyUnit = (() => {
    const raw = activeStudent?.education_unit || activeStudent?.unit_name || (activeStudent as any)?.unit;
    if (!raw) return 'Unit Pendidikan';
    if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
    if (typeof raw === 'object') {
      const n = raw.name || raw.nama || raw.unit_name || raw.nama_unit;
      if (typeof n === 'string' && n.trim().length > 0) return n.trim();
    }
    return 'Unit Pendidikan';
  })();

  // Status Kehadiran Dinamis Siswa di Beranda (Hadir [Hijau], Libur Sekolah [Kuning], Tidak Hadir [Merah])
  const homeAttendanceBadge = useMemo(() => {
    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 6;

    if (isWeekend || activeStudent?.is_holiday || stickyLower.includes('libur')) {
      return {
        label: 'Libur Sekolah',
        color: '#D97706',
        bg: '#FFFBEB',
        border: '#FDE68A',
        icon: 'weather-sunny' as const,
      };
    }

    if (stickyIsHadir) {
      return {
        label: 'Hadir',
        color: '#047857',
        bg: '#ECFDF5',
        border: '#A7F3D0',
        icon: 'check-circle' as const,
      };
    }

    if (stickyIsIzinSakit) {
      return {
        label: stickyLower.includes('sakit') ? 'Sakit' : 'Izin',
        color: '#E11D48',
        bg: '#FFF1F2',
        border: '#FECDD3',
        icon: 'alert-circle' as const,
      };
    }

    if (stickyIsTerlambat) {
      return {
        label: 'Terlambat',
        color: '#D97706',
        bg: '#FFFBEB',
        border: '#FDE68A',
        icon: 'clock-alert-outline' as const,
      };
    }

    if (stickyIsAlpa) {
      return {
        label: 'Tidak Hadir',
        color: '#E11D48',
        bg: '#FFF1F2',
        border: '#FECDD3',
        icon: 'close-circle' as const,
      };
    }

    return {
      label: 'Belum Presensi',
      color: '#475569',
      bg: '#F8FAFC',
      border: '#CBD5E1',
      icon: 'clock-outline' as const,
    };
  }, [activeStudent, stickyLower, stickyIsHadir, stickyIsTerlambat, stickyIsIzinSakit, stickyIsAlpa]);

  const stickyDisplayName = parent && activeChildName ? activeChildName : `${name} 👋`;
  const stickyAvatarSource = useMemo(() => {
    if (parent && activeStudent) {
      if (activeChildPhoto) return { uri: activeChildPhoto };
      return defaultStudentAvatar;
    }
    if (student) {
      if (profileImageUrl && !imageError) return { uri: String(profileImageUrl) };
      return defaultStudentAvatar;
    }
    if (profileImageUrl && !imageError) return { uri: String(profileImageUrl) };
    return DEFAULT_PARENT_AVATAR;
  }, [parent, student, activeStudent, activeChildPhoto, defaultStudentAvatar, profileImageUrl, imageError]);

  // Avatar ORANG TUA untuk tombol avatar di baris atas sticky (di sebelah bel).
  // Dinamis dari data user login (bukan hardcode); fallback aset lokal saat offline/belum ada foto.
  const stickyParentAvatarSource = useMemo(() => {
    const remote = getProfileImageUrl(user);
    if (remote && !imageError) return { uri: remote };
    return DEFAULT_PARENT_AVATAR;
  }, [user, imageError]);

  const activeStudentUnitId = useMemo(() => {
    return String(
      activeStudent?.education_unit_id ||
      activeStudent?.unit_id ||
      activeStudent?.kelas?.unit_pendidikan_id ||
      activeStudent?.kelas?.education_unit_id ||
      (typeof activeStudent?.education_unit === 'object' ? activeStudent?.education_unit?.id : '') ||
      (student ? (dashboard?.student?.unit_id || (user as any)?.education_unit_id || (user as any)?.unit_id || '') : '') ||
      ''
    ).trim();
  }, [activeStudent, student, dashboard?.student, user]);

  const activeStudentUnitName = useMemo(() => {
    return String(
      (typeof activeStudent?.education_unit === 'object' ? (activeStudent?.education_unit?.name || activeStudent?.education_unit?.nama) : '') ||
      activeStudent?.unit_name ||
      activeStudent?.unit ||
      (student ? (dashboard?.student?.unit_name || (user as any)?.unit_name || '') : '') ||
      ''
    ).toLowerCase().trim();
  }, [activeStudent, student, dashboard?.student, user]);

  const activeStudentGender = activeStudent?.gender || activeStudent?.jenis_kelamin;
  const isActiveStudentGirl = activeStudentGender === 'P' || activeStudentGender === 'female' || activeStudentGender === 'perempuan';
  const activeStudentDefaultAvatar = isActiveStudentGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;
  const activeStudentPhotoUri = getProfileImageUrl(activeStudent);
  const childNickname = (activeStudent?.nickname || activeStudent?.full_name || activeStudent?.nama_lengkap || activeStudent?.name || 'Ananda').trim().split(' ')[0];

  const pendingTasksCount = useMemo(() => {
    if (!Array.isArray(homeAssignments)) return 0;
    return homeAssignments.filter((a: any) => {
      const status = String(a?.submission_status || a?.status || '').toLowerCase();
      return status !== 'submitted' && status !== 'selesai' && status !== 'graded';
    }).length;
  }, [homeAssignments]);

  const todayScheduleList = useMemo(() => {
    const items: any[] = Array.isArray(homeSchedule?.today_schedules)
      ? homeSchedule.today_schedules
      : Array.isArray(homeSchedule?.data?.today_schedules)
      ? homeSchedule.data.today_schedules
      : Array.isArray(homeSchedule?.schedules)
      ? homeSchedule.schedules
      : Array.isArray(homeSchedule)
      ? homeSchedule
      : [];
    return items;
  }, [homeSchedule]);

  // Koleksi seluruh unit pendidikan anak (jika 1 anak -> 1 unit, jika 2 anak -> 2 unit berbeda, dst)
  const accessibleChildUnits = useMemo(() => {
    const list: { id: string; name: string; displayName: string }[] = [];
    const pushUnit = (uId: any, rawName: any) => {
      const trimmedId = String(uId || '').trim();
      const trimmedRaw = String(rawName || '').trim();
      const lowerName = trimmedRaw.toLowerCase();
      if (!trimmedId && !trimmedRaw) return;
      const already = list.some((x) => (trimmedId && x.id === trimmedId) || (lowerName && x.name === lowerName));
      if (!already) {
        list.push({
          id: trimmedId,
          name: lowerName,
          displayName: trimmedRaw,
        });
      }
    };

    if (parent && Array.isArray(parentChildren) && parentChildren.length > 0) {
      parentChildren.forEach((child: any) => {
        const uId =
          child?.education_unit_id ||
          child?.unit_id ||
          child?.kelas?.unit_pendidikan_id ||
          child?.kelas?.education_unit_id ||
          (typeof child?.education_unit === 'object' ? child?.education_unit?.id : '') ||
          '';
        const rawName =
          (typeof child?.education_unit === 'object' ? (child?.education_unit?.name || child?.education_unit?.nama) : '') ||
          (typeof child?.educationUnit === 'object' ? (child?.educationUnit?.name || child?.educationUnit?.nama) : '') ||
          child?.kelas?.unit_pendidikan?.name ||
          child?.kelas?.unit_pendidikan?.nama ||
          child?.kelas?.unitPendidikan?.name ||
          child?.kelas?.unitPendidikan?.nama ||
          child?.unit_name ||
          (typeof child?.unit === 'object' ? (child?.unit?.name || child?.unit?.nama) : child?.unit) ||
          '';
        pushUnit(uId, rawName);
      });
    } else if (student || parent) {
      const uId = activeStudentUnitId || (dashboard?.student?.unit_id || (user as any)?.education_unit_id || (user as any)?.unit_id || '');
      const rawName =
        activeStudentUnitName ||
        (dashboard?.student?.unit_name ||
          dashboard?.student?.education_unit?.name ||
          dashboard?.student?.kelas?.unit_pendidikan?.name ||
          (user as any)?.unit_name ||
          (user as any)?.education_unit?.name ||
          '');
      pushUnit(uId, rawName);
    }
    return list;
  }, [parent, student, parentChildren, activeStudentUnitId, activeStudentUnitName, dashboard?.student, user]);

  const unitFilteredAnnouncements = useMemo(() => {
    if (!parent && !student) return announcements;
    if (accessibleChildUnits.length === 0) return announcements;

    return announcements.filter((item: any) => {
      const meta = item?.data_tambahan || item?.metadata || {};
      const itemUnitId = String(item?.unit_id || item?.education_unit_id || meta?.unit_id || meta?.education_unit_id || meta?.target_unit || '').trim();
      const itemUnitName = String(item?.unit_name || item?.education_unit || meta?.unit_name || meta?.education_unit || meta?.target_unit_name || '').toLowerCase().trim();
      const itemTitle = String(item?.judul_pengumuman || item?.judul || item?.title || '').toLowerCase();

      // Cocokkan secara eksklusif dengan salah satu unit pendidikan anak ananda
      // (1 anak -> 1 unit anak saja, 2 anak -> 2 unit anak berbeda, tanpa meloloskan Semua Unit Terpadu)
      const isChildUnitMatch = accessibleChildUnits.some((u) => {
        const idMatch = Boolean(u.id && (itemUnitId === u.id || meta?.unit_id === u.id || meta?.education_unit_id === u.id));
        const nameMatch = Boolean(u.name && itemUnitName && (itemUnitName.includes(u.name) || u.name.includes(itemUnitName)));
        const titleMatch = Boolean(u.name && u.name.length > 2 && itemTitle.includes(u.name));
        return idMatch || nameMatch || titleMatch;
      });

      return isChildUnitMatch;
    });
  }, [announcements, parent, student, accessibleChildUnits]);

  // Resolusi nama badge unit asli milik ananda (tidak menampilkan Semua Unit Terpadu)
  const resolveNewsUnitLabel = useCallback((item: any): string => {
    const meta = item?.data_tambahan || item?.metadata || {};
    const rawUnit = String(item?.unit_name || meta?.unit_name || meta?.target_unit_name || '').trim();
    const rawLower = rawUnit.toLowerCase();

    // Jika rawUnit spesifik dan bukan "semua unit terpadu" / "unit terpadu"
    if (
      rawUnit &&
      !rawLower.includes('semua unit terpadu') &&
      !rawLower.includes('unit terpadu') &&
      rawLower !== 'all' &&
      rawLower !== 'yayasan' &&
      rawLower !== 'unit'
    ) {
      return rawUnit;
    }

    // Cari unit anak yang cocok
    const itemUnitId = String(item?.unit_id || item?.education_unit_id || meta?.unit_id || meta?.education_unit_id || meta?.target_unit || '').trim();
    const itemUnitName = String(item?.unit_name || item?.education_unit || meta?.unit_name || meta?.education_unit || meta?.target_unit_name || '').toLowerCase().trim();
    const itemTitle = String(item?.judul_pengumuman || item?.judul || item?.title || '').toLowerCase();

    const matchedChildUnit = accessibleChildUnits.find((u) => {
      const idMatch = Boolean(u.id && (itemUnitId === u.id || meta?.unit_id === u.id || meta?.education_unit_id === u.id));
      const nameMatch = Boolean(u.name && itemUnitName && (itemUnitName.includes(u.name) || u.name.includes(itemUnitName)));
      const titleMatch = Boolean(u.name && u.name.length > 2 && itemTitle.includes(u.name));
      return idMatch || nameMatch || titleMatch;
    });

    if (matchedChildUnit?.displayName) {
      return matchedChildUnit.displayName;
    }

    if (accessibleChildUnits[0]?.displayName) {
      return accessibleChildUnits[0].displayName;
    }

    return 'Unit Pendidikan';
  }, [accessibleChildUnits]);

  const teacherNip = useMemo(() => {
    const teacherData = dashboard?.teacher || dashboard?.data?.teacher || {};
    const candidates = [
      teacherData?.nip_niy,
      user?.nip,
      user?.niy,
      (user as any)?.employee_number,
      (user?.metadata as any)?.nip,
      (user?.metadata as any)?.niy,
      (user?.metadata as any)?.employee_id,
      user?.email,
    ];
    for (const c of candidates) {
      if (c !== null && c !== undefined) {
        if (typeof c === 'string' && c.trim().length > 0) return c.trim();
        if (typeof c === 'number') return String(c);
      }
    }
    return '-';
  }, [dashboard, user]);

  const teacherUnit = useMemo(() => {
    const teacherData = dashboard?.teacher || dashboard?.data?.teacher || {};
    const candidates = [
      teacherData?.education_unit,
      teacherData?.unit,
      dashboard?.unit?.name,
      dashboard?.unit_name,
      dashboard?.context?.unit?.nama,
      dashboard?.context?.unit?.name,
      dashboard?.context?.unit,
      dashboard?.unit,
      user?.unit,
      (user as any)?.education_unit,
      (user?.metadata as any)?.unit_name,
      (user?.metadata as any)?.education_unit,
    ];

    for (const item of candidates) {
      if (!item) continue;
      if (typeof item === 'string' && item.trim().length > 0) return item.trim();
      if (typeof item === 'object') {
        const n = item.name || item.nama || item.unit_name || item.nama_unit;
        if (typeof n === 'string' && n.trim().length > 0) return n.trim();
      }
    }
    return 'Sekolah Islam Terpadu';
  }, [dashboard, user]);

  // Data Rangkuman Harian Ananda (Executive 360° Hub)
  const hubAttendanceData = useMemo(() => {
    const rawAtt =
      activeStudent?.attendance_today ||
      activeStudent?.presensi_hari_ini ||
      homeAttendance?.today ||
      homeAttendance ||
      todayTimeline?.attendance;

    const rawStatus = String(rawAtt?.status || rawAtt?.attendance_status || '').toLowerCase();
    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = Boolean(activeStudent?.is_holiday || rawAtt?.is_holiday || rawStatus.includes('libur'));

    let label = isHoliday || isWeekend ? 'Libur' : 'Belum Presensi';
    let color = isHoliday || isWeekend ? '#D97706' : '#64748B';
    let timeText = rawAtt?.time || rawAtt?.check_in_time || rawAtt?.jam_masuk || (isHoliday || isWeekend ? 'Hari Libur' : 'Hari ini');

    if (rawStatus === 'present' || rawStatus === 'hadir') {
      label = 'Hadir Tepat Waktu';
      color = '#059669';
    } else if (rawStatus === 'late' || rawStatus === 'terlambat') {
      label = 'Hadir Terlambat';
      color = '#D97706';
    } else if (rawStatus === 'sick' || rawStatus === 'sakit') {
      label = 'Izin Sakit';
      color = '#2563EB';
    } else if (rawStatus === 'permit' || rawStatus === 'izin') {
      label = 'Izin Keperluan';
      color = '#7C3AED';
    } else if (rawStatus === 'absent' || rawStatus === 'alpha' || rawStatus === 'alpa') {
      label = 'Tidak Hadir';
      color = '#DC2626';
    } else if (isHoliday || isWeekend) {
      label = 'Libur';
      color = '#D97706';
      timeText = 'Hari Libur';
    }

    return { label, color, timeText };
  }, [activeStudent, homeAttendance, todayTimeline]);

  const hubTaskData = useMemo(() => {
    const count = homeAssignments.length;
    if (count === 0) {
      return { countText: '0 Aktif', title: 'Semua tugas tuntas ✨', sub: 'Tidak ada PR mendesak' };
    }
    const firstTask = homeAssignments[0];
    const title = firstTask?.title || firstTask?.judul || firstTask?.subject_name || 'Tugas Baru';
    const due = firstTask?.due_date || firstTask?.deadline || firstTask?.tanggal_jatuh_tempo;
    let sub = 'Perlu dikerjakan';
    if (due) {
      const d = new Date(due);
      if (!isNaN(d.getTime())) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        sub = `Tenggat: ${d.getDate()} ${months[d.getMonth()]}`;
      }
    }
    return { countText: `${count} Aktif`, title, sub };
  }, [homeAssignments]);

  const hubTahfizhData = useMemo(() => {
    const t = homeTahfizh || todayTimeline?.tahfizh || activeStudent?.latest_tahfizh;
    if (!t) {
      return { surahText: 'Belum ada setoran', badge: 'Tahfizh', note: 'Siap disetorkan hari ini' };
    }
    const surah = t.surah_name || t.surah || 'Tahfizh';
    const range = t.ayat_start && t.ayat_end ? `: ${t.ayat_start}-${t.ayat_end}` : (t.total_ayah ? ` (${t.total_ayah} Ayat)` : '');
    const surahText = `${surah}${range}`;
    const badge = t.grade || t.predicate || (t.score != null ? `Nilai ${t.score}` : 'Tuntas');
    const note = t.notes_teacher || t.notes || (t.score != null ? `Skor: ${t.score}` : 'Setoran tervalidasi');
    return { surahText, badge, note };
  }, [homeTahfizh, todayTimeline, activeStudent]);

  const hubMutabaahData = useMemo(() => {
    const m = homeMutabaah || todayTimeline?.mutabaah;
    const rawList: any[] = Array.isArray(m?.details)
      ? m.details
      : Array.isArray(m?.items)
      ? m.items
      : Array.isArray(m?.mutabaah_monitoring?.details)
      ? m.mutabaah_monitoring.details
      : Array.isArray(m?.prayers)
      ? m.prayers
      : Array.isArray(m)
      ? m
      : [];

    const isDoneVal = (v: any) =>
      v === true || v === 1 || v === '1' ||
      ['good', 'sudah', 'completed', 'done', 'tuntas', 'hadir'].includes(String(v).toLowerCase());

    const isSchoolSource = (src: any) =>
      ['teacher', 'supervisor', 'school', 'admin', 'guru', 'musyrif'].includes(String(src || '').toLowerCase());

    const isParentSource = (src: any) =>
      ['parent', 'ortu'].includes(String(src || '').toLowerCase());

    // 1. Sholat Fardhu (Subuh, Dzuhur, Ashar, Maghrib, Isya)
    const fardhuKeys = [
      { key: 'Subuh', short: 'Subuh', aliases: ['subuh', 'shubuh'] },
      { key: 'Dzuhur', short: 'Dzuhur', aliases: ['dzuhur', 'dhuhur', 'zuhur'] },
      { key: 'Ashar', short: 'Ashar', aliases: ['ashar', 'ashr', 'asar'] },
      { key: 'Maghrib', short: 'Maghrib', aliases: ['maghrib', 'magrib'] },
      { key: 'Isya', short: 'Isya', aliases: ['isya', 'isya’', 'isya`'] },
    ];

    const fardhuItems = fardhuKeys.map((f) => {
      const match = rawList.find((i: any) => {
        const name = String(i.name || i.nama || i.agenda_code || i.key || '').toLowerCase();
        return f.aliases.some((a) => name.includes(a));
      });
      let done = false;
      let verifiedBy = '';
      if (match) {
        done = isDoneVal(match.status_value ?? match.status ?? match.value);
        if (isSchoolSource(match.input_source || match.verified_by)) verifiedBy = 'sekolah';
        else if (isParentSource(match.input_source || match.verified_by)) verifiedBy = 'ortu';
      } else if (m && typeof m === 'object') {
        const val = m[f.key.toLowerCase()] ?? m[`shalat_${f.key.toLowerCase()}`];
        if (val !== undefined && val !== null) {
          done = isDoneVal(typeof val === 'object' ? (val.status_value ?? val.status ?? val.is_done) : val);
          if (val && typeof val === 'object' && isSchoolSource(val.input_source || val.verified_by)) verifiedBy = 'sekolah';
          else if (val && typeof val === 'object' && isParentSource(val.input_source || val.verified_by)) verifiedBy = 'ortu';
        }
      }
      return { label: f.key, short: f.short, done, verifiedBy, isSunnah: false };
    });

    // 2. Sholat Sunnah yang ada di unit/agenda santri (Dhuha, Tahajjud/Qiyam, Rawatib, Witir)
    const sunnahAliases = [
      { key: 'Dhuha', short: 'Dhuha', aliases: ['dhuha', 'duha'] },
      { key: 'Tahajjud', short: 'Tahajjud', aliases: ['tahajjud', 'qiyam', 'lail'] },
      { key: 'Rawatib', short: 'Rawatib', aliases: ['rawatib'] },
      { key: 'Witir', short: 'Witir', aliases: ['witir'] },
    ];

    const sunnahItems: any[] = [];
    sunnahAliases.forEach((s) => {
      const match = rawList.find((i: any) => {
        const name = String(i.name || i.nama || i.agenda_code || i.key || '').toLowerCase();
        return s.aliases.some((a) => name.includes(a));
      });
      if (match) {
        const done = isDoneVal(match.status_value ?? match.status ?? match.value);
        let verifiedBy = '';
        if (isSchoolSource(match.input_source || match.verified_by)) verifiedBy = 'sekolah';
        else if (isParentSource(match.input_source || match.verified_by)) verifiedBy = 'ortu';
        sunnahItems.push({ label: s.key, short: s.short, done, verifiedBy, isSunnah: true });
      } else if (m && typeof m === 'object') {
        const val = m[s.key.toLowerCase()] ?? m[`shalat_${s.key.toLowerCase()}`];
        if (val !== undefined && val !== null) {
          const done = isDoneVal(typeof val === 'object' ? (val.status_value ?? val.status ?? val.is_done) : val);
          let verifiedBy = '';
          if (val && typeof val === 'object' && isSchoolSource(val.input_source || val.verified_by)) verifiedBy = 'sekolah';
          else if (val && typeof val === 'object' && isParentSource(val.input_source || val.verified_by)) verifiedBy = 'ortu';
          sunnahItems.push({ label: s.key, short: s.short, done, verifiedBy, isSunnah: true });
        }
      }
    });

    // 3. Agenda / Amalan Yaumiyyah Lainnya dari Unit (Tilawah, Dzikir Pagi/Petang, dll)
    const otherAgendas: any[] = [];
    rawList.forEach((item: any) => {
      const name = String(item.name || item.nama || item.agenda_code || '').trim();
      const lower = name.toLowerCase();
      const isPrayer = ['subuh', 'dzuhur', 'dhuhur', 'zuhur', 'ashar', 'maghrib', 'isya', 'dhuha', 'tahajjud', 'rawatib', 'witir'].some((k) => lower.includes(k));
      if (!isPrayer && name.length > 0) {
        const done = isDoneVal(item.status_value ?? item.status ?? item.value);
        let verifiedBy = '';
        if (isSchoolSource(item.input_source || item.verified_by)) verifiedBy = 'sekolah';
        else if (isParentSource(item.input_source || item.verified_by)) verifiedBy = 'ortu';
        otherAgendas.push({
          label: name.length > 14 ? name.slice(0, 13) + '…' : name,
          done,
          verifiedBy,
        });
      }
    });

    const allPills = [...fardhuItems, ...sunnahItems];
    const totalPills = allPills.length;
    const doneCount = allPills.filter((p) => p.done).length;

    // 4. Evaluasi Petunjuk Pengisian & Verifikasi
    const anySchoolVerified = rawList.some((i: any) => isSchoolSource(i.input_source || i.verified_by)) ||
      allPills.some((p) => p.verifiedBy === 'sekolah') ||
      Boolean(m?.supervisor_assignment_id || m?.finalized_at || m?.status === 'verified');

    const anyParentFilled = rawList.some((i: any) => isParentSource(i.input_source || i.verified_by)) ||
      allPills.some((p) => p.verifiedBy === 'ortu') ||
      Boolean(m?.parent_signature_id || m?.signature_status);

    let verifierBadge = {
      label: 'Belum Diisi',
      color: '#64748B',
      bg: '#F1F5F9',
      icon: 'clock-outline',
    };
    if (anySchoolVerified) {
      verifierBadge = {
        label: 'Diisi Guru/Musyrif',
        color: '#047857',
        bg: '#DCFCE7',
        icon: 'check-decagram',
      };
    } else if (anyParentFilled) {
      verifierBadge = {
        label: 'Diisi Orang Tua',
        color: '#B45309',
        bg: '#FEF3C7',
        icon: 'account-check',
      };
    } else if (doneCount > 0) {
      verifierBadge = {
        label: 'Mandiri Santri',
        color: '#1D4ED8',
        bg: '#DBEAFE',
        icon: 'checkbox-marked-circle-outline',
      };
    }

    const ratioText = `${doneCount}/${totalPills} Ibadah`;
    const note = anySchoolVerified
      ? 'Tervalidasi oleh guru / musyrif sekolah'
      : anyParentFilled
      ? 'Telah diverifikasi oleh orang tua'
      : doneCount === totalPills
      ? 'Alhamdulillah seluruh ibadah tuntas'
      : `${totalPills - doneCount} ibadah belum terlaksana`;

    return {
      ratioText,
      prayers: allPills,
      otherAgendas: otherAgendas.slice(0, 3),
      verifierBadge,
      note,
      hasExtraAgendas: sunnahItems.length > 0 || otherAgendas.length > 0,
    };
  }, [homeMutabaah, todayTimeline]);

  return (
    <View style={[styles.safeArea, parent && { backgroundColor: '#ECFDF5' }]}>
      {/* FLOATING STUDENT SWITCH TOAST (PROGRESS & SUCCESS FEEDBACK) */}
      {!parent && studentSwitchToast && studentSwitchToast.visible && (
        <Animated.View
          style={[
            styles.studentToastFloatingBox,
            { top: topInset + (isStickyActive ? 68 : 12) },
          ]}
        >
          {studentSwitchToast.status === 'loading' ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.studentToastText}>
                Memuat data ananda {studentSwitchToast.shortName}...
              </Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="check-circle" size={17} color="#34D399" style={{ marginRight: 7 }} />
              <Text style={styles.studentToastText}>
                Data {studentSwitchToast.studentName} berhasil dimuat
              </Text>
            </>
          )}
        </Animated.View>
      )}

      {/* REALTIME IN-APP TOAST NOTIFICATION BANNER */}
      {!parent && realtimeBanner && (
        <View
          style={{
            position: 'absolute',
            top: topInset + 10,
            left: 16,
            right: 16,
            zIndex: 9999,
            backgroundColor: '#064E3B',
            borderRadius: 16,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 12,
            borderWidth: 1.5,
            borderColor: '#34D399',
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: '#10B981',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <MaterialCommunityIcons
              name={realtimeBanner.type === 'tahfizh' ? 'book-open-page-variant' : 'account-check'}
              size={22}
              color="#FFFFFF"
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: '#A7F3D0', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>
                Aktivitas Baru Real-Time
              </Text>
              <View style={{ backgroundColor: '#059669', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: 'bold' }}>{realtimeBanner.badge}</Text>
              </View>
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 'bold', marginTop: 2 }} numberOfLines={1}>
              {realtimeBanner.title}
            </Text>
            <Text style={{ color: '#D1FAE5', fontSize: 11 }} numberOfLines={1}>
              {realtimeBanner.subtitle}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setRealtimeBanner(null)} style={{ padding: 4, marginLeft: 8 }}>
            <MaterialCommunityIcons name="close" size={18} color="#A7F3D0" />
          </TouchableOpacity>
        </View>
      )}

      {/* 1. STICKY RICH APP BAR — Contextual per role, muncul saat halaman di-scroll ke bawah (dihapus untuk role parent, TU, dan landing gate dual-role) */}
      {(!parent && !isTuOnly && !(isDualRole && !isDualRoleWorkspaceActive)) && (
      <Animated.View
        pointerEvents={isStickyActive ? 'box-none' : 'none'}
        style={[
          styles.stickyHeaderBar,
          teacher && {
            backgroundColor: '#F0FDF4',
            borderBottomColor: '#CCFBF1',
            borderBottomWidth: 1,
            shadowColor: '#064E3B',
            shadowOpacity: 0.06,
          },
          {
            paddingTop: topInset + 4,
            opacity: stickyOpacity,
            transform: [{ translateY: stickyTranslateY }],
          },
        ]}
      >
        {/* Background: foto gedung sekolah & masjid (Splashscreen 2) + overlay cerah selaras halaman */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              overflow: 'hidden',
              pointerEvents: 'none',
              backgroundColor: (teacher || musyrif || principal) ? '#F0FDF4' : undefined,
            },
          ]}
        >
          {!(teacher || musyrif || principal) && (
            <Image
              source={PARENT_HOME_BG}
              style={[StyleSheet.absoluteFill, styles.stickyMosqueBgImage]}
              resizeMode="cover"
            />
          )}
          <LinearGradient
            colors={
              (teacher || musyrif || principal)
                ? ['#F0FDF4', '#F0FDF4', '#F0FDF4']
                : ['rgba(24, 161, 101, 0.40)', 'rgba(24, 161, 101, 0.75)', 'rgba(18, 128, 80, 0.92)']
            }
            locations={[0, 0.45, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {!(teacher || musyrif || principal) && (
            <>
              <View style={styles.stickyDecorCircle1} />
              <View style={styles.stickyDecorCircle2} />
            </>
          )}
        </View>

        {/* ── BARIS ATAS: Logo SIMSIT + Nama Sekolah + Bell + Avatar ── */}
        <View style={styles.stickyTopRow}>
          <View style={styles.stickyBrandGroup}>
            <View style={[styles.stickyLogoWrap, (teacher || musyrif || principal || divisi) && { borderColor: '#E2E8F0', elevation: 2 }]}>
              <Image source={SPLASH_LOGO} style={styles.stickyLogoImg} resizeMode="contain" />
            </View>
            <View style={styles.stickyBrandTextCol}>
              <Text style={[styles.stickyBrandLabel, (teacher || musyrif || principal || divisi) && { color: '#064E3B', textShadowColor: 'transparent' }]}>
                {teacher && (!isDualRole || dualRoleMode === 'teacher')
                  ? 'Guru & Akademik'
                  : musyrif && (!isDualRole || dualRoleMode === 'musyrif')
                  ? 'Musyrif & Asrama'
                  : principal
                  ? 'Kepala Sekolah'
                  : divisi
                  ? 'Divisi Pendidikan'
                  : isTuOnly
                  ? 'Tata Usaha'
                  : 'SIMSIT'}
              </Text>
              <Text numberOfLines={1} style={[styles.stickyBrandSub, (teacher || musyrif || principal || divisi) && { color: '#0D9488' }]}>
                {teacher && (!isDualRole || dualRoleMode === 'teacher')
                  ? teacherUnit
                  : musyrif
                  ? 'Pondok Pesantren Terpadu'
                  : principal
                  ? (teacherUnit || (user as any)?.education_unit?.name || 'Unit Sekolah')
                  : divisi
                  ? ((user as any)?.education_unit?.name || (user as any)?.employee?.education_unit?.name || 'Yayasan Dar El-Iman')
                  : (mobileConfig.branding?.school_name || 'Yayasan Dar El-Iman')}
              </Text>
            </View>
          </View>

          <View style={styles.stickyTopRightActions}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Notifikasi')}
              style={[
                styles.stickySquircleActionBtn,
                (teacher || musyrif || principal || divisi) && {
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderColor: '#CCFBF1',
                },
              ]}
              accessibilityLabel="Notifikasi"
            >
              <MaterialCommunityIcons
                name="bell-outline"
                size={18}
                color={(teacher || musyrif || principal || divisi) ? '#064E3B' : '#FFFFFF'}
              />
              {unreadNotificationCount > 0 && <View style={styles.stickyBellBadgeDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (parent && activeStudent) {
                  setSelectedIdCardStudent(activeStudent);
                } else {
                  navigation.navigate('Profil');
                }
              }}
              style={[
                styles.stickyAvatarSquircleBtn,
                (teacher || principal || divisi) && { borderColor: '#A7F3D0', borderWidth: 2 },
              ]}
              accessibilityLabel="Profil"
            >
              <Image source={stickyParentAvatarSource} style={styles.stickyTopAvatarImg} resizeMode="cover" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── RICH CARD: ukuran kompak ala sticky halaman Jadwal ── */}
        {(parent || student || teacher || tu) && !principal && !divisi && (
          <View style={{ marginHorizontal: 12, marginTop: teacher ? 4 : 6, marginBottom: 10 }}>
            {teacher ? (
              <View
                style={[
                  styles.studentMainCard,
                  {
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: '#A7F3D0',
                    paddingHorizontal: 14,
                    paddingTop: 10,
                    paddingBottom: 10,
                    borderRadius: 18,
                    shadowColor: '#064E3B',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.06,
                    shadowRadius: 4,
                    elevation: 2,
                  },
                ]}
              >
                <View style={styles.studentCardTopRow}>
                  <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={() => navigation.navigate('Profil')}
                    style={[styles.stickyRichAvatarWrap, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}
                  >
                    <Image
                      source={stickyParentAvatarSource}
                      style={styles.stickyRichAvatarImg}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>

                  <View style={styles.stickyRichInfoCol}>
                    <Text numberOfLines={1} style={[styles.stickyRichStudentName, { color: '#064E3B' }]}>
                      {user?.name || (user as any)?.nama_lengkap || 'Guru Pengajar'}
                    </Text>

                    <Text numberOfLines={1} style={[styles.stickyRichNisText, { color: '#047857' }]}>
                      {`ID/NIP: ${teacherNip}`}
                    </Text>

                    <View style={[styles.stickyRichUnitBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1 }]}>
                      <MaterialCommunityIcons name="school" size={10} color="#047857" style={{ marginRight: 3 }} />
                      <Text numberOfLines={1} style={[styles.stickyRichUnitText, { color: '#065F46', fontWeight: '700' }]}>
                        {teacherUnit}
                      </Text>
                    </View>

                    <View style={styles.stickyRichMetaRow}>
                      <Text numberOfLines={1} style={[styles.stickyRichMetaText, { color: '#0D9488' }]}>
                        {(() => {
                          const td = dashboard?.teacher || dashboard?.data?.teacher || dashboard?.employee || {};
                          return td?.jabatan || td?.position || (user?.employee as any)?.position?.name || 'Guru Pengajar';
                        })()}
                      </Text>
                      <Text style={[styles.stickyRichMetaSep, { color: '#99F6E4' }]}> • </Text>
                      <View style={[styles.stickyRichPresensiDot, { backgroundColor: '#10B981', marginRight: 3 }]} />
                      <Text numberOfLines={1} style={[styles.stickyRichMetaText, { color: '#059669', fontSize: 9, fontWeight: '700' }]}>
                        Aktif
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stickyRichMiniActions}>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => navigation.navigate('Notifikasi')}
                      style={[styles.stickyMiniBtn, { backgroundColor: '#F0FDF4', borderColor: '#CCFBF1', borderWidth: 1 }]}
                      accessibilityLabel="Notifikasi"
                    >
                      <MaterialCommunityIcons name="bell-ring-outline" size={16} color="#047857" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => navigation.navigate('Jadwal')}
                      style={[styles.stickyMiniBtn, { backgroundColor: '#F0FDF4', borderColor: '#CCFBF1', borderWidth: 1 }]}
                      accessibilityLabel="Jadwal KBM"
                    >
                      <MaterialCommunityIcons name="calendar-clock" size={16} color="#047857" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => navigation.navigate('QR Code')}
                      style={[styles.stickyMiniBtn, { backgroundColor: '#F0FDF4', borderColor: '#CCFBF1', borderWidth: 1 }]}
                      accessibilityLabel="Scan / Tampilkan QR"
                    >
                      <MaterialCommunityIcons name="qrcode-scan" size={16} color="#047857" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.stickyQuickChipRow}>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => navigation.navigate('Jadwal')}
                    style={[styles.stickyQuickChip, { backgroundColor: '#F0FDF4', borderColor: '#A7F3D0', borderWidth: 1 }]}
                  >
                    <MaterialCommunityIcons name="calendar-month" size={11} color="#047857" />
                    <Text style={[styles.stickyQuickChipText, { color: '#065F46', fontWeight: '700' }]}>Jadwal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => navigation.navigate('Absensi')}
                    style={[styles.stickyQuickChipSecondary, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1 }]}
                  >
                    <MaterialCommunityIcons name="clipboard-check" size={11} color="#2563EB" />
                    <Text style={[styles.stickyQuickChipSecondaryText, { color: '#1D4ED8', fontWeight: '700' }]}>Presensi</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => setShowAllMenusModal(true)}
                    style={[styles.stickyQuickChipPrimary, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF', borderWidth: 1 }]}
                  >
                    <MaterialCommunityIcons name="view-grid" size={11} color="#7C3AED" />
                    <Text style={[styles.stickyQuickChipPrimaryText, { color: '#6D28D9', fontWeight: '700' }]}>Menu</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <LinearGradient
                colors={['#0D6B42', '#18A165', '#2BD988']}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.studentMainCard, { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderRadius: 18 }]}
              >
                <View style={styles.cardDecorCircle} />

                <View style={styles.studentCardTopRow}>
                  <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={() => {
                      if (parent && activeStudent) setSelectedIdCardStudent(activeStudent);
                      else navigation.navigate('Profil');
                    }}
                    style={styles.stickyRichAvatarWrap}
                  >
                    {(teacher || tu || principal) ? (
                      <Image
                        source={stickyParentAvatarSource}
                        style={styles.stickyRichAvatarImg}
                        resizeMode="cover"
                      />
                    ) : activeChildPhoto ? (
                      <Image
                        source={{ uri: activeChildPhoto }}
                        style={styles.stickyRichAvatarImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <Image
                        source={defaultStudentAvatar}
                        style={styles.stickyRichAvatarImg}
                        resizeMode="cover"
                      />
                    )}
                  </TouchableOpacity>

                  <View style={styles.stickyRichInfoCol}>
                    <Text numberOfLines={1} style={styles.stickyRichStudentName}>
                      {(teacher || tu || principal) ? (
                        (() => {
                          if (principal) return user?.name || (user as any)?.nama_lengkap || 'Kepala Sekolah';
                          const td = dashboard?.teacher || dashboard?.data?.teacher || dashboard?.employee || {};
                          return td?.jabatan || td?.position || roleLabel(roles, tu ? 'Tata Usaha' : 'Guru Pengajar');
                        })()
                      ) : (activeChildName || (student ? name : 'Siswa Terpilih'))}
                    </Text>

                    <Text numberOfLines={1} style={styles.stickyRichNisText}>
                      {(teacher || tu || principal) ? `ID/NIP: ${teacherNip}` : `NIS: ${stickyActiveStudentNis} ${stickyStudentNisn !== '-' ? '· NISN: ' + stickyStudentNisn : ''}`}
                    </Text>

                    <View style={styles.stickyRichUnitBadge}>
                      <MaterialCommunityIcons name="school" size={10} color="#FFFFFF" style={{ marginRight: 3 }} />
                      <Text numberOfLines={1} style={styles.stickyRichUnitText}>
                        {(teacher || tu || principal) ? teacherUnit : stickyBodyUnit}
                      </Text>
                    </View>
                    {(teacher || tu || principal) ? (
                      <View style={styles.stickyRichMetaRow}>
                        <Text numberOfLines={1} style={styles.stickyRichMetaText}>
                          {(() => {
                            if (principal) return 'Kepala Sekolah';
                            const td = dashboard?.teacher || dashboard?.data?.teacher || dashboard?.employee || {};
                            return td?.jabatan || td?.position || roleLabel(roles, tu ? 'Tata Usaha' : 'Guru Pengajar');
                          })()}
                        </Text>
                        <Text style={styles.stickyRichMetaSep}> • </Text>
                        <View style={[styles.stickyRichPresensiDot, { backgroundColor: '#10B981', marginRight: 3 }]} />
                        <Text numberOfLines={1} style={[styles.stickyRichMetaText, { color: '#A7F3D0', fontSize: 9 }]}>
                          Aktif
                        </Text>
                      </View>
                    ) : (stickyStudentKelas || stickyStudentJenjang) ? (
                      <View style={styles.stickyRichMetaRow}>
                        {stickyStudentKelas ? (
                          <Text numberOfLines={1} style={styles.stickyRichMetaText}>
                            {stickyStudentKelas}
                          </Text>
                        ) : null}
                        {stickyStudentKelas && stickyStudentJenjang ? (
                          <Text style={styles.stickyRichMetaSep}> • </Text>
                        ) : null}
                        {stickyStudentJenjang ? (
                          <Text numberOfLines={1} style={styles.stickyRichMetaText}>
                            {stickyStudentJenjang}
                          </Text>
                        ) : null}
                        <Text style={styles.stickyRichMetaSep}> • </Text>
                        <Text numberOfLines={1} style={styles.stickyRichMetaText}>
                          {stickyRawPresensi}
                        </Text>
                        <View style={[styles.stickyRichPresensiDot, { backgroundColor: stickyPresensiDotColor }]} />
                      </View>
                    ) : null}
                  </View>

                <View style={styles.stickyRichMiniActions}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                      if (teacher || tu || principal) {
                        navigation.navigate('Notifikasi');
                      } else if (activeStudent) {
                        void handleOpenStudentNotifications(activeStudent);
                      }
                    }}
                    style={styles.stickyMiniBtn}
                    accessibilityLabel={(teacher || tu || principal) ? 'Notifikasi' : 'Pengingat & Notifikasi Siswa'}
                  >
                    <MaterialCommunityIcons name="bell-ring-outline" size={16} color="#059669" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                      if (principal) {
                        navigation.navigate('PrincipalDashboard');
                      } else if (tu) {
                        navigation.navigate('Data');
                      } else if (teacher) {
                        navigation.navigate('Jadwal');
                      } else if (activeStudent) {
                        void handleOpenWeeklyReport(activeStudent);
                      }
                    }}
                    style={styles.stickyMiniBtn}
                    accessibilityLabel={principal ? 'Dashboard Kepala Sekolah' : tu ? 'Pusat Data' : teacher ? 'Jadwal KBM' : 'Laporan Perkembangan Pekanan Siswa'}
                  >
                    <MaterialCommunityIcons
                      name={principal ? 'view-dashboard-outline' : tu ? 'database-outline' : teacher ? 'calendar-clock' : 'clipboard-text-outline'}
                      size={16}
                      color="#059669"
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                      if (teacher || tu || principal) {
                        navigation.navigate('QR Code');
                      } else if (activeStudent) {
                        setSelectedQrStudent(activeStudent);
                      }
                    }}
                    style={styles.stickyMiniBtn}
                    accessibilityLabel={(teacher || tu || principal) ? 'Scan / Tampilkan QR' : 'Tampilkan QR Code Siswa'}
                  >
                    <MaterialCommunityIcons name="qrcode-scan" size={16} color="#059669" />
                  </TouchableOpacity>
                </View>
              </View>

                <View style={styles.stickyQuickChipRow}>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => {
                      if (principal) {
                        navigation.navigate('PrincipalDashboard');
                      } else if (teacher || tu) {
                        navigation.navigate('Jadwal');
                      } else {
                        if (!activeStudent) return;
                        setIdCardSide('front');
                        setSelectedIdCardStudent(activeStudent);
                      }
                    }}
                    style={styles.stickyQuickChip}
                  >
                    <MaterialCommunityIcons
                      name={principal ? 'view-dashboard' : (teacher || tu) ? 'calendar-month' : 'card-account-details'}
                      size={11}
                      color="#059669"
                    />
                    <Text style={styles.stickyQuickChipText}>
                      {principal ? 'Dashboard KS' : (teacher || tu) ? 'Jadwal' : 'Kartu Siswa'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => {
                      if (principal) {
                        navigation.navigate('RekapPresensiSiswa');
                      } else if (teacher || tu) {
                        navigation.navigate('Absensi');
                      } else {
                        if (!activeStudent) return;
                        const sid = String(activeStudent.id || activeStudent.student_id);
                        navigation.navigate('Kalender', { child_id: sid, student_id: sid });
                      }
                    }}
                    style={styles.stickyQuickChipSecondary}
                  >
                    <MaterialCommunityIcons
                      name={(teacher || tu || principal) ? 'clipboard-check' : 'calendar-month'}
                      size={11}
                      color="#2563EB"
                    />
                    <Text style={styles.stickyQuickChipSecondaryText}>
                      {principal ? 'Rekap Absen' : (teacher || tu) ? 'Presensi' : 'Kalender'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => {
                      if (teacher || tu || principal) {
                        setShowAllMenusModal(true);
                      } else {
                        if (!activeStudent) return;
                        setSelectedPortalChild(activeStudent);
                        const sid = activeStudent?.id || activeStudent?.student_id;
                        if (sid) {
                          useActiveChildStore.getState().setActiveChildId(sid);
                        }
                        setShowChildPortalModal(true);
                      }
                    }}
                    style={styles.stickyQuickChipPrimary}
                  >
                    <MaterialCommunityIcons name="view-grid" size={11} color="#7C3AED" />
                    <Text style={styles.stickyQuickChipPrimaryText}>Menu</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            )}
          </View>
        )}

      </Animated.View>
      )}

      {/* 2. MAIN SCROLLABLE DASHBOARD BODY */}
      <Animated.ScrollView
        ref={mainScrollViewRef}
        style={[styles.screen, (parent || isTuOnly || teacher || principal || divisi) && { backgroundColor: '#F0FDF4' }]}
        contentContainerStyle={[styles.mainScrollContent, (parent || isTuOnly || teacher || principal || divisi) && { backgroundColor: '#F0FDF4', paddingBottom: bottomInset + 130 }]}
        onScroll={mainScrollHandler}
        scrollEventThrottle={16}
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            colors={['#047857']}
            progressViewOffset={topInset + 10}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ============================================================ */}
        {/* HEADER & MENU UTAMA KHUSUS ROLE ORANG TUA (LAYOUT UI/UX BARU)*/}
        {/* ============================================================ */}
        {parent ? (
          <View style={[styles.parentMainContainer, { paddingTop: topInset + 4 }]}>
            {/* Latar Belakang Gambar Ilustrasi Gedung Sekolah & Masjid (Sesuai Lampiran) */}
            <Image
              source={PARENT_HOME_BG}
              style={styles.parentHomeBgImage}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
              locations={[0.5, 0.82, 1]}
              style={styles.parentHomeBgFade}
            />

            {activeStudent && isChildViewActive ? (
              /* ============================================================ */
              /* 1. TAMPILAN DASHBOARD KETIKA ANAK TERPILIH (SESUAI MOCKUP)   */
              /* ============================================================ */
              <>
                {/* 1. Baris Tombol Navigasi: Tombol Back di Kiri & Pengaturan di Kanan */}
                <View style={styles.parentActiveTopBar}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setIsChildViewActive(false)}
                    style={styles.parentActiveBackBtn}
                    accessibilityLabel="Kembali"
                  >
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#004D32" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('Profil')}
                    style={styles.parentActiveSettingsBtn}
                    accessibilityLabel="Pengaturan"
                  >
                    <MaterialCommunityIcons name="cog" size={22} color="#004D32" />
                  </TouchableOpacity>
                </View>

                {/* 2. Data Anak (Tepat di Bawah Tombol Back Sesuai Mockup) */}
                <View style={styles.parentActiveChildDataRow}>
                  <View style={styles.parentActiveAvatarWrap}>
                    <Image
                      source={activeStudentPhotoUri ? { uri: String(activeStudentPhotoUri) } : activeStudentDefaultAvatar}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  </View>

                  <View style={styles.parentActiveInfoCol}>
                    <Text numberOfLines={1} style={styles.parentActiveChildName}>
                      {activeStudent.full_name || activeStudent.nama_lengkap || activeStudent.name || 'Ananda'}
                    </Text>

                    {/* Baris 2: Unit Pendidikan */}
                    <View style={styles.parentActiveMetaRow}>
                      <MaterialCommunityIcons name="school-outline" size={12} color="#047857" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.parentActiveUnitText}>
                        {activeStudent.unit_name || activeStudent.education_unit?.name || 'Unit Pendidikan'}
                      </Text>
                    </View>

                    {/* Baris 3: Kelas tepat di bawah unit pendidikan */}
                    <View style={styles.parentActiveMetaRow}>
                      <MaterialCommunityIcons name="door-open" size={12} color="#065F46" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.parentActiveClassText}>
                        Kelas {getSafeStudentClassName(activeStudent) || '-'}
                      </Text>
                    </View>

                    {/* Baris Aksi: Tombol Ganti Siswa + Lencana Status Kehadiran di Sebelahnya */}
                    <View style={styles.parentActiveActionBadgeRow}>
                      {parentChildren.length > 1 && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setShowChildSelectorModal(true)}
                          style={styles.parentGantiAnakBtn}
                        >
                          <Text style={styles.parentGantiAnakBtnText}>Ganti Siswa</Text>
                          <MaterialCommunityIcons name="chevron-down" size={15} color="#FFFFFF" />
                        </TouchableOpacity>
                      )}

                      <View
                        style={[
                          styles.parentActiveAttendanceBadge,
                          { backgroundColor: homeAttendanceBadge.bg, borderColor: homeAttendanceBadge.border },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={homeAttendanceBadge.icon}
                          size={12}
                          color={homeAttendanceBadge.color}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.parentActiveAttendanceText, { color: homeAttendanceBadge.color }]}>
                          {homeAttendanceBadge.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Hero Greeting: "Selamat datang kembali Ayah/Bunda 👋" */}
                <View style={styles.parentActiveHeroBox}>
                  <Text style={styles.parentActiveSalam}>Selamat datang kembali</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.parentActiveAyahBunda}>Ayah/Bunda</Text>
                    <Text style={{ fontSize: 20 }}> 👋</Text>
                  </View>
                  <Text style={styles.parentActiveSummary}>
                    Berikut ringkasan aktivitas {childNickname} hari ini.
                  </Text>
                </View>

                {/* 3x3 Grid Menu Fitur (9 Kartu Sesuai Mockup Desain) */}
                <View style={styles.parentActiveMenuGrid}>
                  {/* 1. Jadwal */}
                  {/* 1. Jadwal Pelajaran */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentActiveMenuCard}
                    onPress={() => handleChildPortalMenuClick('Jadwal')}
                  >
                    <View style={[styles.parentActiveIconHalo, { backgroundColor: '#ECFDF5' }]}>
                      <MaterialCommunityIcons name="calendar-clock" size={26} color="#0D9488" />
                    </View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.parentActiveMenuLabel}>
                      Jadwal Pelajaran
                    </Text>
                  </TouchableOpacity>

                  {/* 2. Tugas LMS (Badge Jumlah Tugas Aktif jika ada) */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentActiveMenuCard}
                    onPress={() => handleChildPortalMenuClick('Tugas')}
                  >
                    <View style={[styles.parentActiveIconHalo, { backgroundColor: '#ECFDF5' }]}>
                      <MaterialCommunityIcons name="clipboard-text-outline" size={26} color="#10B981" />
                      {pendingTasksCount > 0 && (
                        <View style={styles.parentActiveTaskBadge}>
                          <Text style={styles.parentActiveTaskBadgeText}>{pendingTasksCount}</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.parentActiveMenuLabel}>
                      Tugas LMS
                    </Text>
                  </TouchableOpacity>

                  {/* 3. Materi Belajar */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentActiveMenuCard}
                    onPress={() => handleChildPortalMenuClick('Materi')}
                  >
                    <View style={[styles.parentActiveIconHalo, { backgroundColor: '#EFF6FF' }]}>
                      <MaterialCommunityIcons name="book-open-page-variant" size={26} color="#0284C7" />
                    </View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.parentActiveMenuLabel}>
                      Materi Belajar
                    </Text>
                  </TouchableOpacity>

                  {/* 4. Penilaian & Rapor */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentActiveMenuCard}
                    onPress={() => handleChildPortalMenuClick('Nilai')}
                  >
                    <View style={[styles.parentActiveIconHalo, { backgroundColor: '#F5F3FF' }]}>
                      <MaterialCommunityIcons name="chart-box-outline" size={26} color="#8B5CF6" />
                    </View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.parentActiveMenuLabel}>
                      Penilaian & Rapor
                    </Text>
                  </TouchableOpacity>

                  {/* 5. Tahfizh Al-Qur'an */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentActiveMenuCard}
                    onPress={() => handleChildPortalMenuClick('Tahfizh')}
                  >
                    <View style={[styles.parentActiveIconHalo, { backgroundColor: '#ECFDF5' }]}>
                      <MaterialCommunityIcons name="book-marker" size={26} color="#059669" />
                    </View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.parentActiveMenuLabel}>
                      Tahfizh Al-Qur'an
                    </Text>
                  </TouchableOpacity>

                  {/* 6. Mutaba'ah Yaumiyyah */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentActiveMenuCard}
                    onPress={() => handleChildPortalMenuClick('Mutabaah')}
                  >
                    <View style={[styles.parentActiveIconHalo, { backgroundColor: '#FFFBEB' }]}>
                      <MaterialCommunityIcons name="clipboard-check-outline" size={26} color="#D97706" />
                    </View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.parentActiveMenuLabel}>
                      Mutaba'ah Yaumiyyah
                    </Text>
                  </TouchableOpacity>

                  {/* 7. Buku Hubung */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentActiveMenuCard}
                    onPress={() => handleChildPortalMenuClick('Komentar')}
                  >
                    <View style={[styles.parentActiveIconHalo, { backgroundColor: '#FFF1F2' }]}>
                      <MaterialCommunityIcons name="notebook-edit-outline" size={26} color="#E11D48" />
                    </View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.parentActiveMenuLabel}>
                      Buku Hubung
                    </Text>
                  </TouchableOpacity>

                  {/* 8. Bank Soal */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentActiveMenuCard}
                    onPress={() => handleChildPortalMenuClick('BankSoal')}
                  >
                    <View style={[styles.parentActiveIconHalo, { backgroundColor: '#E6FFFA' }]}>
                      <MaterialCommunityIcons name="database-outline" size={26} color="#0D9488" />
                    </View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.parentActiveMenuLabel}>
                      Bank Soal
                    </Text>
                  </TouchableOpacity>

                  {/* 9. Semua Menu */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentActiveMenuCard}
                    onPress={() => setShowAllMenusModal(true)}
                  >
                    <View style={[styles.parentActiveIconHalo, { backgroundColor: '#F8FAFC' }]}>
                      <MaterialCommunityIcons name="view-grid-outline" size={26} color="#475569" />
                    </View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.parentActiveMenuLabel}>
                      Semua Menu
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* ============================================================ */}
                {/* 1. Section Aktivitas Hari Ini (Realtime Feed)                 */}
                {/* ============================================================ */}
                <View style={styles.parentSchedSectionHeader}>
                  <Text style={styles.parentSchedSectionTitle}>Aktivitas Hari Ini</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={goToPrevDay}
                      style={styles.activityDayNavBtn}
                      accessibilityLabel="Hari sebelumnya"
                    >
                      <MaterialCommunityIcons name="chevron-left" size={18} color="#059669" />
                    </TouchableOpacity>
                    <Text style={[styles.parentSchedSeeAllText, { color: '#004D32' }]}>
                      {isViewingToday ? 'Hari Ini' : new Date(viewedDate + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={isViewingToday ? 0.3 : 0.7}
                      onPress={goToNextDay}
                      style={[styles.activityDayNavBtn, isViewingToday && styles.activityDayNavBtnDisabled]}
                      accessibilityLabel="Hari berikutnya"
                      disabled={isViewingToday}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={18} color={isViewingToday ? '#CBD5E1' : '#059669'} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.activityTimelineCard}>
                  {/* Timeline Feed */}
                  {loadingTimeline && (!resolvedActivities || resolvedActivities.length === 0) ? (
                    <View style={styles.activityTimelineLoadingBox}>
                      <ActivityIndicator size="small" color="#10B981" />
                      <Text style={styles.activityTimelineLoadingText}>Menghubungkan ke aktivitas realtime...</Text>
                    </View>
                  ) : resolvedActivities && resolvedActivities.length > 0 ? (
                    <ScrollView
                      style={styles.activityTimelineScrollArea}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                      contentContainerStyle={styles.activityTimelineFeedList}
                    >
                      {resolvedActivities.map((act: any, aIdx: number) => {
                        const isFirst = aIdx === 0;
                        const isLast = aIdx === resolvedActivities.length - 1;
                        const badgeStyle = getActivityBadgeStyle(act.badge_type);
                        const isPast = Boolean(act.is_past || (act.date_label && act.date_label !== 'Hari ini'));

                        return (
                          <View key={`act-card-${act.id || aIdx}`} style={styles.timelineRowContainer}>
                            <View style={styles.timelineColTime}>
                              {isPast ? (
                                <>
                                  {act.date_label ? (
                                    <Text style={styles.timelinePastDateText} numberOfLines={1}>
                                      {act.date_label}
                                    </Text>
                                  ) : null}
                                  <Text style={styles.timelinePastTimeText}>
                                    {act.time_label || '--:--'}
                                  </Text>
                                </>
                              ) : (
                                <Text style={styles.timelineTimeText}>
                                  {act.time_label || '--:--'}
                                </Text>
                              )}
                            </View>

                            <View style={styles.timelineColTrack}>
                              <View
                                style={[
                                  styles.timelineTrackLineTop,
                                  isFirst && { opacity: 0 },
                                  isPast && styles.timelineTrackLinePast,
                                ]}
                              />
                              <View
                                style={[
                                  styles.timelineTrackNodeRing,
                                  isPast ? styles.timelineTrackNodeRingPast : styles.timelineTrackNodeRingActive,
                                ]}
                              />
                              <View
                                style={[
                                  styles.timelineTrackLineBottom,
                                  isLast && { opacity: 0 },
                                  isPast && styles.timelineTrackLinePast,
                                ]}
                              />
                            </View>

                            <TouchableOpacity
                              activeOpacity={0.75}
                              onPress={() => setSelectedActivity(act)}
                              style={[
                                styles.timelineColCard,
                                { borderLeftColor: act.icon_color || '#10B981' },
                              ]}
                            >
                              <View style={[styles.timelineCardIconBox, { backgroundColor: act.icon_color || '#059669' }]}>
                                <MaterialCommunityIcons
                                  name={(act.icon || 'star-outline') as any}
                                  size={20}
                                  color="#FFFFFF"
                                />
                              </View>
                              <View style={styles.timelineCardTextCol}>
                                <Text style={styles.timelineCardTitle} numberOfLines={1}>
                                  {act.title}
                                </Text>
                                <Text style={styles.timelineCardSubtitle} numberOfLines={1}>
                                  {act.subtitle}
                                </Text>
                              </View>
                              <View style={styles.timelineBadgeContainer}>
                                <View style={[styles.timelineBadgePill, { backgroundColor: badgeStyle.bg, borderColor: `${badgeStyle.text}25` }]}>
                                  <Text style={[styles.timelineBadgeText, { color: badgeStyle.text }]}>
                                    {act.badge_label}
                                  </Text>
                                </View>
                                {act.has_red_dot && <View style={styles.timelineBadgeRedDot} />}
                              </View>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={styles.activityTimelineEmptyBox}>
                      <MaterialCommunityIcons name="timeline-clock-outline" size={34} color="#CBD5E1" />
                      <Text style={styles.activityTimelineEmptyTitle}>Belum Ada Aktivitas Hari Ini</Text>
                      <Text style={styles.activityTimelineEmptySub}>
                        Data presensi mapel, sholat, dan tahfizh yang diinput guru atau musyrif hari ini akan otomatis tampil di sini secara realtime.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Section Jadwal Hari Ini (Data Riil API Dinamis) */}
                <View style={styles.parentSchedSectionHeader}>
                  <Text style={styles.parentSchedSectionTitle}>Jadwal Hari Ini</Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleChildPortalMenuClick('Jadwal')}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                  >
                    <Text style={styles.parentSchedSeeAllText}>Lihat Semua</Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color="#047857" />
                  </TouchableOpacity>
                </View>

                {todayScheduleList.length > 0 ? (
                  todayScheduleList.slice(0, 3).map((item: any, sIdx: number) => {
                    const startRaw = String(item.time_start || item.jam_mulai || '07:30').slice(0, 5).replace(':', '.');
                    const endRaw = String(item.time_end || item.jam_selesai || '08:15').slice(0, 5).replace(':', '.');
                    const timeRange = `${startRaw} - ${endRaw}`;
                    const subjectName = item.subject?.name || item.subject_name || item.name || item.nama_mapel || item.mata_pelajaran?.nama || 'Mata Pelajaran';
                    const activeClassName = getSafeStudentClassName(activeStudent);
                    const roomName = item.room || item.ruangan || item.nama_ruangan || (item.kelas?.nama_kelas ? `Kelas ${item.kelas.nama_kelas}` : (activeClassName ? `Ruang ${activeClassName}` : 'Ruang Kelas'));

                    return (
                      <TouchableOpacity
                        key={`today-sched-card-${item.id || sIdx}`}
                        activeOpacity={0.8}
                        onPress={() => handleChildPortalMenuClick('Jadwal')}
                        style={styles.parentSchedCard}
                      >
                        <View style={styles.parentSchedIconBox}>
                          <MaterialCommunityIcons name="book-open-page-variant" size={26} color="#047857" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 14 }}>
                          <Text style={styles.parentSchedTime}>{timeRange}</Text>
                          <Text style={styles.parentSchedSubject} numberOfLines={1}>{subjectName}</Text>
                          <Text style={styles.parentSchedRoom} numberOfLines={1}>{roomName.startsWith('Ruang') || roomName.startsWith('Kelas') ? roomName : `Ruang ${roomName}`}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={styles.parentSchedEmptyCard}>
                    <View style={styles.parentSchedEmptyIconBox}>
                      <MaterialCommunityIcons name="calendar-blank-outline" size={24} color="#047857" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.parentSchedEmptyTitle}>Tidak ada jadwal hari ini</Text>
                      <Text style={styles.parentSchedEmptySub}>Jadwal pelajaran ananda belum dimulai atau sedang libur.</Text>
                    </View>
                  </View>
                )}

                {/* ============================================================ */}
                {/* 3. Section Rangkuman Harian Ananda (Executive 360° Hub)       */}
                {/* ============================================================ */}
                <View style={styles.parentSchedSectionHeader}>
                  <Text style={styles.parentSchedSectionTitle}>Rangkuman Harian</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={styles.hubLivePulseDot} />
                    <Text style={[styles.parentSchedSeeAllText, { color: '#047857' }]}>Hari Ini</Text>
                  </View>
                </View>

                <View style={styles.hubContainer}>
                  {/* 4 Rangkuman Harian Items */}
                  <View style={styles.hubList}>
                    {/* 1. Presensi */}
                    <TouchableOpacity
                      activeOpacity={0.78}
                      style={[styles.hubListItem, styles.hubListItemEmerald]}
                      onPress={() => handleMenuNavigation('Absensi')}
                    >
                      <View style={[styles.hubListIconBox, { backgroundColor: '#059669' }]}>
                        <MaterialCommunityIcons name="calendar-check-outline" size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.hubListContent}>
                        <View style={styles.hubListHeaderRow}>
                          <Text style={[styles.hubListLabel, { color: '#047857' }]}>Presensi Masuk</Text>
                          <View style={[styles.hubListTag, { backgroundColor: '#DCFCE7' }]}>
                            <Text numberOfLines={1} style={[styles.hubListTagText, { color: '#047857' }]}>
                              {hubAttendanceData.timeText}
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.hubListValue, { color: hubAttendanceData.color || '#065F46' }]}>
                          {hubAttendanceData.label}
                        </Text>
                      </View>
                      <View style={[styles.hubListActionBtn, { backgroundColor: '#DCFCE7' }]}>
                        <MaterialCommunityIcons name="chevron-right" size={18} color="#059669" />
                      </View>
                    </TouchableOpacity>

                    {/* 2. Tugas & Kuis */}
                    <TouchableOpacity
                      activeOpacity={0.78}
                      style={[styles.hubListItem, styles.hubListItemBlue]}
                      onPress={() => handleMenuNavigation('Tugas')}
                    >
                      <View style={[styles.hubListIconBox, { backgroundColor: '#2563EB' }]}>
                        <MaterialCommunityIcons name="clipboard-text-clock-outline" size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.hubListContent}>
                        <View style={styles.hubListHeaderRow}>
                          <Text style={[styles.hubListLabel, { color: '#1D4ED8' }]}>Tugas Terdekat</Text>
                          <View style={[styles.hubListTag, { backgroundColor: '#DBEAFE' }]}>
                            <Text numberOfLines={1} style={[styles.hubListTagText, { color: '#1D4ED8' }]}>
                              {hubTaskData.countText}
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.hubListValue, { color: '#1E293B' }]}>
                          {hubTaskData.title}
                        </Text>
                        {Boolean(hubTaskData.sub) && (
                          <Text numberOfLines={1} style={[styles.hubListSubText, { color: '#2563EB' }]}>
                            {hubTaskData.sub}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.hubListActionBtn, { backgroundColor: '#DBEAFE' }]}>
                        <MaterialCommunityIcons name="chevron-right" size={18} color="#2563EB" />
                      </View>
                    </TouchableOpacity>

                    {/* 3. Tahfizh */}
                    <TouchableOpacity
                      activeOpacity={0.78}
                      style={[styles.hubListItem, styles.hubListItemTeal]}
                      onPress={() => handleMenuNavigation('Tahfizh')}
                    >
                      <View style={[styles.hubListIconBox, { backgroundColor: '#0D9488' }]}>
                        <MaterialCommunityIcons name="book-open-page-variant-outline" size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.hubListContent}>
                        <View style={styles.hubListHeaderRow}>
                          <Text style={[styles.hubListLabel, { color: '#0F766E' }]}>Setoran Terakhir</Text>
                          <View style={[styles.hubListTag, { backgroundColor: '#CCFBF1' }]}>
                            <Text numberOfLines={1} style={[styles.hubListTagText, { color: '#0F766E' }]}>
                              {hubTahfizhData.badge}
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.hubListValue, { color: '#134E4A' }]}>
                          {hubTahfizhData.surahText}
                        </Text>
                        {Boolean(hubTahfizhData.note) && (
                          <Text numberOfLines={1} style={[styles.hubListSubText, { color: '#0D9488' }]}>
                            {hubTahfizhData.note}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.hubListActionBtn, { backgroundColor: '#CCFBF1' }]}>
                        <MaterialCommunityIcons name="chevron-right" size={18} color="#0D9488" />
                      </View>
                    </TouchableOpacity>

                    {/* 4. Mutaba'ah Sholat & Ibadah Unit */}
                    <TouchableOpacity
                      activeOpacity={0.78}
                      style={[styles.hubListItem, styles.hubListItemPurple]}
                      onPress={() => handleMenuNavigation('Mutabaah')}
                    >
                      <View style={[styles.hubListIconBox, { backgroundColor: '#7E22CE' }]}>
                        <MaterialCommunityIcons name="hands-pray" size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.hubListContent}>
                        <View style={styles.hubListHeaderRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, marginRight: 4 }}>
                            <Text numberOfLines={1} style={[styles.hubListLabel, { color: '#6B21A8', flexShrink: 0 }]}>Ibadah & Mutaba'ah</Text>
                            <View style={[styles.hubVerifierBadge, { backgroundColor: hubMutabaahData.verifierBadge.bg, flexShrink: 1 }]}>
                              <MaterialCommunityIcons name={hubMutabaahData.verifierBadge.icon as any} size={11} color={hubMutabaahData.verifierBadge.color} style={{ marginRight: 2 }} />
                              <Text numberOfLines={1} style={[styles.hubVerifierText, { color: hubMutabaahData.verifierBadge.color }]}>
                                {hubMutabaahData.verifierBadge.label}
                              </Text>
                            </View>
                          </View>
                          <View style={[styles.hubListTag, { backgroundColor: '#F3E8FF' }]}>
                            <Text numberOfLines={1} style={[styles.hubListTagText, { color: '#6B21A8' }]}>
                              {hubMutabaahData.ratioText}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.hubSholatPillsRow}>
                          {hubMutabaahData.prayers.map((p: any, pIdx: number) => (
                            <View
                              key={'pr-' + p.label + '-' + pIdx}
                              style={[
                                styles.hubSholatPill,
                                p.done ? (p.isSunnah ? styles.hubSholatPillSunnahDone : styles.hubSholatPillDone) : styles.hubSholatPillPending,
                              ]}
                            >
                              <Text style={[styles.hubSholatPillText, p.done && styles.hubSholatPillTextDone]}>
                                {p.short}
                              </Text>
                              {Boolean(p.verifiedBy === 'sekolah') && (
                                <View style={styles.hubPillVerifiedDot} />
                              )}
                            </View>
                          ))}
                        </View>

                        {hubMutabaahData.otherAgendas.length > 0 && (
                          <View style={styles.hubOtherAgendasRow}>
                            {hubMutabaahData.otherAgendas.map((oa: any, oaIdx: number) => (
                              <View key={'oa-' + oaIdx} style={[styles.hubOtherAgendaChip, oa.done ? styles.hubOtherAgendaDone : styles.hubOtherAgendaPending]}>
                                <MaterialCommunityIcons
                                  name={oa.done ? 'check-circle' : 'circle-outline'}
                                  size={11}
                                  color={oa.done ? '#7E22CE' : '#94A3B8'}
                                  style={{ marginRight: 2 }}
                                />
                                <Text numberOfLines={1} style={[styles.hubOtherAgendaText, oa.done && { color: '#7E22CE', fontWeight: '700' }]}>
                                  {oa.label}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {Boolean(hubMutabaahData.note) && (
                          <Text numberOfLines={1} style={[styles.hubListSubText, { color: '#7E22CE', marginTop: 3 }]}>
                            {hubMutabaahData.note}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.hubListActionBtn, { backgroundColor: '#F3E8FF' }]}>
                        <MaterialCommunityIcons name="chevron-right" size={18} color="#7E22CE" />
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              /* ============================================================ */
              /* 2. TAMPILAN AWAL SEBELUM MEMILIH ANAK                        */
              /* ============================================================ */
              <>
                {/* 1. Header Top Bar (Logo, Judul "Sekolah IT", Tagline, Lonceng & Profil) */}
                <View style={styles.parentHeaderBar}>
                  <View style={styles.parentBrandSection}>
                    <View style={styles.parentLogoBox}>
                      <Image source={SPLASH_LOGO} style={styles.parentLogoImg} resizeMode="contain" />
                    </View>
                    <View style={styles.parentBrandTextCol}>
                      <Text style={styles.parentSchoolTitle} numberOfLines={1}>
                        {mobileConfig.branding?.school_name || 'Sekolah IT'}
                      </Text>
                      <Text style={styles.parentSchoolTagline} numberOfLines={1}>
                        {mobileConfig.branding?.tagline || 'Unggul | Berkarakter | Berbasis Teknologi'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.parentHeaderActions}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setUnreadNotificationCount(0);
                        setShowNotificationModal(true);
                      }}
                      style={styles.parentBellBtn}
                      accessibilityLabel="Notifikasi"
                    >
                      <MaterialCommunityIcons name="bell" size={24} color="#047857" />
                      {unreadNotificationCount > 0 && <View style={styles.parentUnreadDot} />}
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('Profil')}
                      style={styles.parentAvatarBtn}
                      accessibilityLabel="Profil Pengguna"
                    >
                      <Image
                        source={profileImageUrl && !imageError ? { uri: String(profileImageUrl) } : DEFAULT_PARENT_AVATAR}
                        style={styles.parentAvatarImg}
                        resizeMode="cover"
                        onError={() => setImageError(true)}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 2. Hero Greeting Awal */}
                <View style={styles.parentHeroGreetingBox}>
                  <Text style={styles.parentSalamText}>Assalamu'alaikum,</Text>
                  <View style={styles.parentGreetingRow}>
                    <Text style={styles.parentGreetingText}>Ayah/Bunda</Text>
                    <Text style={styles.parentGreetingHand}> 👋</Text>
                  </View>
                  <Text style={styles.parentSubDescText}>
                    Pantau perkembangan pendidikan putra-putri Anda dalam satu aplikasi.
                  </Text>
                </View>

                {/* 3. Card "Pilih Anak" */}
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.parentSelectChildCard}
                  onPress={() => setShowChildSelectorModal(true)}
                >
                  <View style={styles.parentSelectChildTopRow}>
                    <View style={styles.parentChildIconCircle}>
                      <MaterialCommunityIcons name="account-group" size={28} color="#2563EB" />
                    </View>
                    <View style={styles.parentChildTextCol}>
                      <Text style={styles.parentChildTitle}>Pilih Anak</Text>
                      <Text style={styles.parentChildSubtitle} numberOfLines={2}>
                        Pilih anak untuk melihat jadwal, tugas, nilai, dan informasi sekolah.
                      </Text>
                    </View>
                    <View style={styles.parentChildChevronCircle}>
                      <MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" />
                    </View>
                  </View>

                  <View style={styles.parentSelectChildFullBtn}>
                    <Text style={styles.parentSelectChildFullBtnText}>Pilih Anak</Text>
                  </View>
                </TouchableOpacity>

                {/* 4. Section 4 Kartu Layanan Sekolah */}
                <View style={styles.parentServicesGrid}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentServiceCard}
                    onPress={() => {
                      const curActive = parentChildren[activeChildIndex] || parentChildren[0];
                      if (curActive) {
                        setSelectedSchoolProfileChildId(String(curActive.id || curActive.student_id));
                      }
                      setShowSchoolProfileModal(true);
                    }}
                  >
                    <View style={[styles.parentServiceIconBox, { backgroundColor: '#EFF6FF' }]}>
                      <MaterialCommunityIcons name="domain" size={26} color="#2563EB" />
                    </View>
                    <Text numberOfLines={1} style={styles.parentServiceLabel}>Profil Sekolah</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.parentServiceCard}
                    onPress={() => {
                      const curActive = parentChildren[activeChildIndex] || parentChildren[0];
                      const cid = String(curActive?.id || curActive?.student_id || '');
                      if (cid) {
                        setSppSelectedChildId(cid);
                        void fetchSppBills(cid);
                      }
                      setShowSppModal(true);
                    }}
                  >
                    <View style={[styles.parentServiceIconBox, { backgroundColor: '#FEF3C7' }]}>
                      <MaterialCommunityIcons name="cash-multiple" size={26} color="#D97706" />
                    </View>
                    <Text numberOfLines={1} style={styles.parentServiceLabel}>Info SPP</Text>
                  </TouchableOpacity>

                  <TouchableOpacity activeOpacity={0.75} style={styles.parentServiceCard} onPress={() => setShowHelpModal(true)}>
                    <View style={[styles.parentServiceIconBox, { backgroundColor: '#ECFDF5' }]}>
                      <MaterialCommunityIcons name="lifebuoy" size={26} color="#059669" />
                    </View>
                    <Text numberOfLines={1} style={styles.parentServiceLabel}>Bantuan</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Section Berita & Informasi (Tampil pada kedua kondisi) */}
            <View style={[styles.homeWidgetCardContainer, { marginHorizontal: 16, marginTop: 16, borderWidth: 1.5, borderColor: '#A7F3D0', shadowColor: '#047857' }]}>
              {/* Header Card: Background Pastel Banner, Solid #047857 Squircle Icon, White Icon, Subtitle, Action Badge */}
              <View style={[styles.homeWidgetCardHeaderRow, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <View style={styles.homeWidgetCardHeaderLeft}>
                  <View style={[styles.homeWidgetHeaderIconBox, { backgroundColor: '#047857', shadowColor: '#047857' }]}>
                    <MaterialCommunityIcons name="newspaper-variant" size={17} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.homeWidgetCardTitle, { color: '#004D32' }]}>
                      Berita & Informasi
                    </Text>
                    <Text numberOfLines={1} style={[styles.homeWidgetCardSub, { color: '#059669' }]}>
                      Kabar terkini & pengumuman resmi sekolah
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setShowAllNews(true)}
                  style={[styles.homeWidgetActionBadge, { backgroundColor: '#FFFFFF', borderColor: '#A7F3D0' }]}
                >
                  <Text style={[styles.homeWidgetActionBadgeText, { color: '#047857', fontWeight: '800' }]}>Semua</Text>
                  <MaterialCommunityIcons name="chevron-right" size={13} color="#047857" />
                </TouchableOpacity>
              </View>

              {/* Carousel Konten Berita */}
              {unitFilteredAnnouncements.length === 0 ? (
                <View style={styles.homeWidgetEmptyRow}>
                  <View style={[styles.homeWidgetEmptyIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons name="newspaper-variant-outline" size={20} color="#004D32" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.homeWidgetEmptyTitle}>Belum Ada Berita Terbaru</Text>
                    <Text style={styles.homeWidgetEmptySubtitle}>Informasi & pengumuman khusus unit ini akan tampil di sini.</Text>
                  </View>
                </View>
              ) : unitFilteredAnnouncements.length === 1 ? (
                /* Single Item: Render langsung tanpa ScrollView horizontal agar tidak ada overscroll batas kosong */
                (() => {
                  const item = unitFilteredAnnouncements[0];
                  const title = titleOf(item);
                  const rawExcerpt = subtitleOf(item);
                  const excerpt = stripHtmlAndClean(rawExcerpt) || 'Ketuk untuk membaca warta dan pengumuman sekolah selengkapnya.';
                  const rawDate = item.created_at || item.published_at || item.date;
                  const formattedDate = rawDate
                    ? new Date(rawDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'Terbaru';
                  const meta = item?.data_tambahan || {};
                  const catLabel = item.kategori || meta.kategori || item.category || 'Warta';
                  const unitLabel = resolveNewsUnitLabel(item);

                  return (
                    <TouchableOpacity
                      key={`parent-news-${item.id ?? 0}`}
                      activeOpacity={0.88}
                      style={styles.newsCarouselSlideCard}
                      onPress={() => setSelectedNews({ ...item, _index: 0 })}
                    >
                      {/* 1. Gambar / Banner Thumbnail Berita (Fit Tanpa Terpotong) */}
                      <View style={styles.newsCarouselImageBox}>
                        <Image
                          source={getNewsThumbnail(item, 0)}
                          style={styles.newsCarouselImage}
                          resizeMode="contain"
                        />
                      </View>

                      {/* 2. Informasi Konten: Tanggal Terbit, Judul, Potongan Berita */}
                      <View style={styles.newsCarouselBody}>
                        <View style={styles.newsCarouselDateRow}>
                          <MaterialCommunityIcons name="calendar-clock" size={12} color="#059669" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.newsCarouselDateText}>
                            {formattedDate}
                          </Text>
                        </View>

                        <Text numberOfLines={2} style={styles.newsCarouselTitle}>
                          {title}
                        </Text>

                        <Text numberOfLines={2} style={styles.newsCarouselExcerpt}>
                          {excerpt}
                        </Text>

                        {/* Lencana Kategori & Unit di Atas Tombol Baca Selengkapnya */}
                        <View style={styles.newsCarouselBadgesRow}>
                          <View style={[styles.newsCarouselCategoryPill, { backgroundColor: '#004D32' }]}>
                            <MaterialCommunityIcons name="bullhorn" size={10} color="#FFFFFF" style={{ marginRight: 3 }} />
                            <Text style={styles.newsCarouselCategoryText}>
                              {String(catLabel).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.newsCarouselUnitPill}>
                            <Text numberOfLines={1} style={styles.newsCarouselUnitText}>
                              {unitLabel}
                            </Text>
                          </View>
                        </View>

                        {/* Tombol Baca Selengkapnya */}
                        <View style={styles.newsCarouselFooterRow}>
                          <Text style={[styles.newsCarouselReadMoreText, { color: '#004D32' }]}>Baca Selengkapnya</Text>
                          <View style={[styles.newsCarouselArrowBox, { backgroundColor: '#ECFDF5' }]}>
                            <MaterialCommunityIcons name="arrow-right" size={13} color="#004D32" />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })()
              ) : (
                <>
                  <ScrollView
                    ref={newsCarouselScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={SCREEN_WIDTH - 56}
                    snapToAlignment="start"
                    disableIntervalMomentum={true}
                    onMomentumScrollEnd={(e) => {
                      const offsetX = e.nativeEvent.contentOffset.x;
                      const idx = Math.round(offsetX / (SCREEN_WIDTH - 56));
                      if (idx >= 0 && idx < unitFilteredAnnouncements.length) {
                        setActiveNewsCarouselIndex(idx);
                      }
                    }}
                    scrollEventThrottle={16}
                  >
                    {unitFilteredAnnouncements.map((item: any, idx: number) => {
                      const title = titleOf(item);
                      const rawExcerpt = subtitleOf(item);
                      const excerpt = stripHtmlAndClean(rawExcerpt) || 'Ketuk untuk membaca warta dan pengumuman sekolah selengkapnya.';
                      const rawDate = item.created_at || item.published_at || item.date;
                      const formattedDate = rawDate
                        ? new Date(rawDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Terbaru';
                      const meta = item?.data_tambahan || {};
                      const catLabel = item.kategori || meta.kategori || item.category || 'Warta';
                      const unitLabel = resolveNewsUnitLabel(item);

                      return (
                        <TouchableOpacity
                          key={`parent-news-${item.id ?? idx}`}
                          activeOpacity={0.88}
                          style={styles.newsCarouselSlideCard}
                          onPress={() => setSelectedNews({ ...item, _index: idx })}
                        >
                          {/* 1. Gambar / Banner Thumbnail Berita (Fit Tanpa Terpotong) */}
                          <View style={styles.newsCarouselImageBox}>
                            <Image
                              source={getNewsThumbnail(item, idx)}
                              style={styles.newsCarouselImage}
                              resizeMode="contain"
                            />
                          </View>

                          {/* 2. Informasi Konten: Tanggal Terbit, Judul, Potongan Berita */}
                          <View style={styles.newsCarouselBody}>
                            <View style={styles.newsCarouselDateRow}>
                              <MaterialCommunityIcons name="calendar-clock" size={12} color="#059669" style={{ marginRight: 4 }} />
                              <Text numberOfLines={1} style={styles.newsCarouselDateText}>
                                {formattedDate}
                              </Text>
                            </View>

                            <Text numberOfLines={2} style={styles.newsCarouselTitle}>
                              {title}
                            </Text>

                            <Text numberOfLines={2} style={styles.newsCarouselExcerpt}>
                              {excerpt}
                            </Text>

                            {/* Lencana Kategori & Unit di Atas Tombol Baca Selengkapnya */}
                            <View style={styles.newsCarouselBadgesRow}>
                              <View style={[styles.newsCarouselCategoryPill, { backgroundColor: '#004D32' }]}>
                                <MaterialCommunityIcons name="bullhorn" size={10} color="#FFFFFF" style={{ marginRight: 3 }} />
                                <Text style={styles.newsCarouselCategoryText}>
                                  {String(catLabel).toUpperCase()}
                                </Text>
                              </View>
                              <View style={styles.newsCarouselUnitPill}>
                                <Text numberOfLines={1} style={styles.newsCarouselUnitText}>
                                  {unitLabel}
                                </Text>
                              </View>
                            </View>

                            {/* Tombol Baca Selengkapnya */}
                            <View style={styles.newsCarouselFooterRow}>
                              <Text style={[styles.newsCarouselReadMoreText, { color: '#004D32' }]}>Baca Selengkapnya</Text>
                              <View style={[styles.newsCarouselArrowBox, { backgroundColor: '#ECFDF5' }]}>
                                <MaterialCommunityIcons name="arrow-right" size={13} color="#004D32" />
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Pagination Dots Indicator */}
                  {unitFilteredAnnouncements.length > 1 && (
                    <View style={styles.newsCarouselDotsContainer}>
                      {unitFilteredAnnouncements.slice(0, 10).map((_, dotIdx) => {
                        const isActive = activeNewsCarouselIndex === dotIdx;
                        return (
                          <TouchableOpacity
                            key={`parent-news-dot-${dotIdx}`}
                            activeOpacity={0.7}
                            onPress={() => {
                              setActiveNewsCarouselIndex(dotIdx);
                              newsCarouselScrollRef.current?.scrollTo({
                                x: dotIdx * (SCREEN_WIDTH - 56),
                                animated: true,
                              });
                            }}
                            style={[
                              styles.newsCarouselDot,
                              isActive ? [styles.newsCarouselDotActive, { backgroundColor: '#004D32' }] : styles.newsCarouselDotInactive,
                            ]}
                          />
                        );
                      })}
                    </View>
                  )}

                  {/* Tautan Lihat Semua Berita */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={[styles.homeWidgetMoreFooter, { marginTop: 8 }]}
                    onPress={() => setShowAllNews(true)}
                  >
                    <Text style={[styles.homeWidgetMoreText, { color: '#004D32', fontWeight: '700' }]}>
                      Lihat semua arsip warta & informasi seluruh unit pendidikan ananda
                    </Text>
                    <MaterialCommunityIcons name="arrow-right" size={13} color="#004D32" />
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Loading Indicator & Error Card untuk Orang Tua */}
            {loading && !refreshing && (
              <View style={[styles.inlineLoader, { marginTop: 8 }]}>
                <ActivityIndicator size="small" color="#047857" />
              </View>
            )}
            {error ? (
              <View style={[styles.errorContainer, { marginHorizontal: 16, marginTop: 8 }]}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        ) : isTuOnly ? (
          /* ============================================================ */
          /* HALAMAN UTAMA ROLE TATA USAHA SESUAI MOCKUP GAMBAR USER      */
          /* Top bar, Greeting, 4 KPI, 7 Menu + Semua Menu, Grafik, Notif */
          /* ============================================================ */
          <TuHomeScreenView
            user={user}
            dashboard={dashboard}
            navigation={navigation}
            announcements={announcements}
            topInset={topInset}
            unreadNotificationCount={unreadNotificationCount}
          />
        ) : principal ? (
          /* ============================================================ */
          /* HALAMAN UTAMA ROLE KEPALA SEKOLAH (EXECUTIVE DASHBOARD)      */
          /* Top bar, Greeting, KPI Sekolah, Monitoring Presensi & Guru   */
          /* ============================================================ */
          <PrincipalHomeScreenView
            user={user}
            dashboard={dashboard}
            navigation={navigation}
            announcements={announcements}
            topInset={topInset}
            unreadNotificationCount={unreadNotificationCount}
            onOpenAllMenus={() => setShowAllMenusModal(true)}
          />
        ) : divisi ? (
          /* ============================================================ */
          /* HALAMAN UTAMA ROLE DIVISI PENDIDIKAN (KONSOLIDASI & SUPERVISI)*/
          /* Style 100% Selaras Kepala Sekolah, Isi Asli Divisi Pendidikan */
          /* ============================================================ */
          <DivisiHomeScreenView
            user={user}
            dashboard={dashboard}
            navigation={navigation}
            announcements={announcements}
            topInset={topInset}
            unreadNotificationCount={unreadNotificationCount}
            onOpenAllMenus={() => setShowAllMenusModal(true)}
          />
        ) : (isDualRole && !isDualRoleWorkspaceActive) ? (
          /* ============================================================ */
          /* GERBANG PEMILIHAN RUANG KERJA DUAL-ROLE GURU & MUSYRIF       */
          /* Tiru 100% UI/UX Halaman Awal Orang Tua (Model A) Tanpa Hardcode */
          /* ============================================================ */
          <DualRoleLandingGate
            user={user}
            dashboard={dashboard}
            mobileConfig={mobileConfig}
            navigation={navigation}
            topInset={topInset}
            unreadNotificationCount={unreadNotificationCount}
            onOpenNotifications={() => {
              setUnreadNotificationCount(0);
              setShowNotificationModal(true);
            }}
            announcements={unitFilteredAnnouncements}
            onSelectRole={(role) => {
              setDualRoleMode(role);
              setIsDualRoleWorkspaceActive(true);
            }}
          />
        ) : (teacher && (!isDualRole || dualRoleMode === 'teacher') && !principal) ? (
          /* ============================================================ */
          /* HALAMAN UTAMA ROLE GURU & AKADEMIK (SELARAS 100% DENGAN TU)  */
          /* Top bar, Greeting, Date Pill, Background Masjid Light Mode   */
          /* ============================================================ */
          <TeacherDashboardView
            dashboard={dashboard}
            navigation={navigation}
            announcements={announcements}
            onOpenAllMenus={() => setShowAllMenusModal(true)}
            topInset={topInset}
            unreadNotificationCount={unreadNotificationCount}
            isDualRole={isDualRole}
            onSwitchDualRole={() => setIsDualRoleWorkspaceActive(false)}
          />
        ) : (isMusyrifActive && !principal) ? (
          /* ============================================================ */
          /* HALAMAN UTAMA ROLE MUSYRIF ASRAMA (SELARAS 100% TU & GURU)   */
          /* Top bar, Greeting, Date Pill, Background Masjid Light Mode   */
          /* ============================================================ */
          <MusyrifHomeScreenView
            user={user}
            dashboard={dashboard}
            navigation={navigation}
            announcements={announcements}
            topInset={topInset}
            unreadNotificationCount={unreadNotificationCount}
            isDualRole={isDualRole}
            onSwitchDualRole={() => setIsDualRoleWorkspaceActive(false)}
          />
        ) : (
          <View style={[styles.extendedHeaderGradient, { paddingTop: topInset + 8 }]}>
            {/* Latar Belakang Gambar Gedung Sekolah & Kubah Masjid (Splash Screen 2) */}
            <Image
              source={PARENT_HOME_BG}
              style={[StyleSheet.absoluteFill, styles.headerMosqueBgImage]}
              resizeMode="cover"
            />
            {/* Overlay gradien halus berbasis warna #18A165 agar background tetap kelihatan warna dasarnya */}
            <LinearGradient
              colors={['rgba(24, 161, 101, 0.40)', 'rgba(24, 161, 101, 0.75)', 'rgba(18, 128, 80, 0.92)']}
              locations={[0, 0.45, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Soft Organic Decorative Blobs / Waves */}
            <View style={styles.headerDecorWave} />
            <View style={styles.headerDecorCircle} />

            {/* Baris Atas: Logo Splashscreen & Judul SIMSIT + Tombol Notifikasi */}
            <Animated.View
              style={[
                styles.headerProfileRow,
                {
                  opacity: greetingOpacity,
                  transform: [{ translateY: greetingTranslateY }],
                },
              ]}
            >
              <View style={styles.headerBrandSection}>
                <View style={styles.headerLogoOuter}>
                  <Image
                    source={SPLASH_LOGO}
                    style={styles.headerLogoImg}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.headerBrandTextCol}>
                  <Text style={styles.headerWelcomeText}>
                    {teacher ? 'SIMSIT' : 'Selamat Datang'}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={styles.headerAppTitleText}
                  >
                    {teacher
                      ? (mobileConfig.branding?.school_name || 'Yayasan Dar El-Iman')
                      : (mobileConfig.branding?.school_name
                      ? `DI ${mobileConfig.branding.school_name.toUpperCase()}`
                      : (mobileConfig.branding?.app_name
                      ? `DI ${mobileConfig.branding.app_name.toUpperCase()}`
                      : 'DI SIMSIT'))}
                  </Text>
                </View>
              </View>

              {/* Header Right Actions: Login Avatar + Notification Bell */}
              <View style={styles.headerActionBtnsRow}>
                {teacher ? (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('Notifikasi')}
                      style={[styles.bellButton, { backgroundColor: 'rgba(255, 255, 255, 0.15)', borderColor: 'rgba(255, 255, 255, 0.3)' }]}
                      accessibilityLabel="Notifikasi"
                    >
                      <MaterialCommunityIcons name="bell-outline" size={20} color="#FFFFFF" />
                      {unreadNotificationCount > 0 && (
                        <View style={styles.unreadBadgeDot} />
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('Profil')}
                      style={[styles.headerAvatarBtn, { borderRadius: 21, borderColor: '#F59E0B', borderWidth: 2 }]}
                      accessibilityLabel="Profil Pengguna"
                    >
                      {profileImageUrl && !imageError ? (
                        <Image
                          source={{ uri: String(profileImageUrl) }}
                          style={styles.headerAvatarImg}
                          resizeMode="cover"
                          onError={() => setImageError(true)}
                        />
                      ) : (
                        <Image
                          source={DEFAULT_PARENT_AVATAR}
                          style={styles.headerAvatarImg}
                          resizeMode="cover"
                        />
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('Notifikasi')}
                      style={styles.bellButton}
                      accessibilityLabel="Notifikasi"
                    >
                      <MaterialCommunityIcons name="bell-outline" size={20} color="#059669" />
                      {unreadNotificationCount > 0 && (
                        <View style={styles.unreadBadgeDot} />
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('Profil')}
                      style={styles.headerAvatarBtn}
                      accessibilityLabel="Profil Pengguna"
                    >
                      {profileImageUrl && !imageError ? (
                        <Image
                          source={{ uri: String(profileImageUrl) }}
                          style={styles.headerAvatarImg}
                          resizeMode="cover"
                          onError={() => setImageError(true)}
                        />
                      ) : (
                        <Image
                          source={DEFAULT_PARENT_AVATAR}
                          style={styles.headerAvatarImg}
                          resizeMode="cover"
                        />
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Animated.View>

            {/* SECTION: Kartu Data Siswa (crossfade native ala halaman Jadwal) */}
            {parentChildren.length > 0 && (
              <Animated.View
                style={[
                  styles.studentCardContainerInHeader,
                  {
                    opacity: bodyCardOpacity,
                    transform: [{ translateY: bodyCardTranslateY }],
                  },
                ]}
              >
                {/* Latar Belakang 2 Warna: Setengah Gambar Header, Setengah Container Body #EBF8F2 */}
                <View pointerEvents="none" style={styles.bodyOverlapBackdrop}>
                  <View pointerEvents="none" style={styles.bodyOverlapSheet} />
                </View>

                <GenericCarousel
                  data={parentChildren}
                  activeIndex={activeChildIndex}
                  onSelectIndex={goToLoopChild}
                  keyExtractor={(item: any, idx: number) => String(item?.id != null ? item.id : item?.student_id || idx)}
                  showHeader={false}
                  showChips={false}
                  showCounterBadge={false}
                  headerTitle="Data Ananda"
                  headerIcon="account-child-circle"
                  isProgrammaticScrollRef={isProgrammaticScrollRef}
                  lastDirectTapTimeRef={lastDirectTapTimeRef}
                  isUserDraggingRef={isUserDraggingRef}
                  visualDotIndex={visualDotIndex}
                  setVisualDotIndex={setVisualDotIndex}
                  showDots={false}
                  renderItem={(student: any, sIdx: number, isCardActive: boolean, cardWidth: number) => (
                    <StudentHeroCard
                      key={`student-card-${sIdx}-${String(student?.id ?? sIdx)}`}
                      child={student}
                      isSelected={isCardActive}
                      isSingleChild={parentChildren.length === 1}
                      showActionButtons={true}
                      cardWidth={cardWidth}
                      cardLabel="Kartu Siswa"
                      calendarLabel="Kalender"
                      calendarIcon="calendar-month"
                      portalLabel="Menu"
                      portalIcon="view-grid"
                      onSelect={isCardActive ? undefined : () => goToLoopChild(sIdx, true)}
                      onPressCard={() => {
                        setIdCardSide('front');
                        setSelectedIdCardStudent(student);
                      }}
                      onPressCalendar={() =>
                        navigation.navigate('Kalender', {
                          child_id: String(student.id),
                          student_id: String(student.id),
                        })
                      }
                      onPressPortal={() => {
                        goToLoopChild(sIdx, true);
                        setSelectedPortalChild(student);
                        const sid = student?.id || student?.student_id;
                        if (sid) {
                          useActiveChildStore.getState().setActiveChildId(sid);
                        }
                        setShowChildPortalModal(true);
                      }}
                      onPressWeeklyReport={() => handleOpenWeeklyReport(student)}
                      onPressNotifications={() => void handleOpenStudentNotifications(student)}
                      onPressQr={() => setSelectedQrStudent(student)}
                    />
                  )}
                />
              </Animated.View>
            )}

            {/* SECTION: Kartu Identitas Pegawai / Guru / Musyrif / Pimpinan */}
            {(!parent && !student && !alumni) && (
              <>
                {/* Tombol Kembali / Ganti Ruang Kerja (Khusus Akun Dual-Role Aktif) */}
                {isDualRole && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setIsDualRoleWorkspaceActive(false)}
                    style={{
                      marginHorizontal: 16,
                      marginTop: 2,
                      marginBottom: 10,
                      backgroundColor: 'rgba(0, 0, 0, 0.24)',
                      borderRadius: 14,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.3)',
                      gap: 8,
                    }}
                  >
                    <MaterialCommunityIcons name="arrow-left" size={18} color="#FFFFFF" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF', flex: 1 }}>
                      Ruang Aktif: {dualRoleMode === 'teacher' ? 'Guru & Akademik' : 'Musyrif Asrama'}
                    </Text>
                    <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#059669' }}>Ganti Ruang</Text>
                    </View>
                  </TouchableOpacity>
                )}

                <EmployeeHeaderCard
                  user={user}
                  dashboard={dashboard}
                  roles={roles}
                  navigation={navigation}
                  onOpenAllMenus={() => setShowAllMenusModal(true)}
                />
              </>
            )}
          </View>
        )}

        {/* ============================================================ */}
        {/* SHEET PUTIH/SLATE: Melengkung Dimulai Tepat di Bawah Anak    */}
        {/* Body otomatis bergeser ke bawah saat sticky header aktif      */}
        {/* ============================================================ */}
        {(!parent && !isTuOnly && !teacher && !principal && !divisi && !(isDualRole && !isDualRoleWorkspaceActive)) && (
          <Animated.View style={styles.curvedSheetBody}>

        {tu && !principal && !foundation && !superAdmin && !divisi ? (
          /* ============================================================ */
          /* DASHBOARD TATA USAHA TERPADU (Satu Pintu Menu & KPI Lengkap) */
          /* ============================================================ */
          <TuDashboardView dashboard={dashboard} navigation={navigation} />
        ) : principal && !foundation && !superAdmin && !divisi ? (
          /* ============================================================ */
          /* MENU & CARD UTAMA KEPALA SEKOLAH (STYLE UI/UX TATA USAHA)    */
          /* Button KS, 4 Modul TU, Pengurus Yayasan, & Staf Online       */
          /* ============================================================ */
          <PrincipalHomeSection
            dashboard={dashboard}
            navigation={navigation}
            user={user}
            onOpenAllMenus={() => setShowAllMenusModal(true)}
          />
        ) : SHOW_MAIN_MENU ? (
          <>
            {principal && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('PrincipalDashboard')}
                style={{
                  marginHorizontal: 16,
                  marginTop: 2,
                  marginBottom: 10,
                  borderRadius: 18,
                  backgroundColor: '#ECFDF5',
                  borderWidth: 1.5,
                  borderColor: '#A7F3D0',
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  shadowColor: '#059669',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 6,
                  elevation: 2,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: '#059669',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <MaterialCommunityIcons name="view-dashboard" size={24} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#065F46' }}>
                      Dashboard Kepala Sekolah
                    </Text>
                    <View
                      style={{
                        backgroundColor: '#059669',
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>
                        EKSEKUTIF
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11, color: '#047857', fontWeight: '500' }}>
                    Pantau KPI presensi, rekap mutaba'ah & prestasi santri
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color="#059669" />
              </TouchableOpacity>
            )}

            {/* CARD PUSAT ASRAMA & KEPULANGAN (KHUSUS MODE MUSYRIF) */}
            {musyrif && (!isDualRole || dualRoleMode === 'musyrif') && (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => navigation.navigate('Absensi', { tab: 'boarding' })}
                style={{
                  marginHorizontal: 16,
                  marginTop: 4,
                  marginBottom: 12,
                  borderRadius: 20,
                  overflow: 'hidden',
                  borderWidth: 1.5,
                  borderColor: '#A7F3D0',
                  shadowColor: '#059669',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.12,
                  shadowRadius: 10,
                  elevation: 3,
                }}
              >
                <LinearGradient
                  colors={['#ECFDF5', '#F0FDF4']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    padding: 15,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <LinearGradient
                    colors={['#059669', '#0D9488']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
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
                    }}
                  >
                    <MaterialCommunityIcons name="home-account" size={26} color="#FFFFFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#064E3B', letterSpacing: -0.2 }}>
                        Pusat Asrama & Kepulangan
                      </Text>
                      <View
                        style={{
                          backgroundColor: '#059669',
                          paddingHorizontal: 7,
                          paddingVertical: 1.5,
                          borderRadius: 7,
                        }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>
                          PESANTREN
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11.5, color: '#047857', fontWeight: '500', lineHeight: 15 }}>
                      Presensi sholat 5 waktu, izin kepulangan santri & check-in
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <View style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#065F46' }}>Absensi Sholat</Text>
                      </View>
                      <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#0369A1' }}>Izin Santri</Text>
                      </View>
                      <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#92400E' }}>Kamar Binaan</Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(5, 150, 105, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {!parent && (
            <View style={styles.menuCardContainer}>
            {/* Baris Utama (Tepat 4 Ikon per Baris) */}
            {primaryRows.map((rowItems, rIdx) => (
              <View
                key={`prim-${rIdx}`}
                style={[
                  styles.menuRow,
                  (!isMenuExpanded && rIdx === primaryRows.length - 1) && styles.menuRowLast,
                ]}
              >
                {rowItems.map(([label, icon, color, bgPastel, route], idx) => {
                  const isModalTile = route === '__OPEN_MODAL__' || label === 'Lihat Semua';
                  const isToggleTile = route === '__TOGGLE__';
                  const tabKey = (isToggleTile || isModalTile) ? undefined : (primaryMenuItems[rIdx * 4 + idx] as any)?.[5];
                  const subtitle = MENU_SUBTITLES[String(label)] || 'Menu layanan';
                  return (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.75}
                      style={[styles.menuCardTile, { backgroundColor: bgPastel }]}
                      onPress={() => {
                        if (isModalTile) {
                          setShowAllMenusModal(true);
                        } else if (isToggleTile) {
                          toggleMenuExpansion();
                        } else {
                          handleMenuNavigation(String(route), tabKey ? String(tabKey) : undefined);
                        }
                      }}
                    >
                      <View style={styles.menuIconCircleHalo}>
                        <MaterialCommunityIcons
                          name={String(icon) as never}
                          size={28}
                          color={String(color)}
                        />
                      </View>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                        style={styles.menuTileTitle}
                      >
                        {String(label)}
                      </Text>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        style={styles.menuTileSubtitle}
                      >
                        {subtitle}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {rowItems.length < 4 &&
                  Array.from({ length: 4 - rowItems.length }).map((_, emptyIdx) => (
                    <View key={`prim-spacer-${emptyIdx}`} style={styles.menuCardTileSpacer} />
                  ))}
              </View>
            ))}

            {/* Baris Tambahan saat di-Expand (Tepat 4 Ikon per Baris) */}
            {isMenuExpanded &&
              expandedRows.map((rowItems, rIdx) => (
                <View
                  key={`exp-${rIdx}`}
                  style={[
                    styles.menuRow,
                    rIdx === expandedRows.length - 1 && styles.menuRowLast,
                  ]}
                >
                  {rowItems.map(([label, icon, color, bgPastel, route], idx) => {
                    const remainingIndex = rIdx * 4 + idx;
                    const originalRemaining = roleMenus.slice(7);
                    const tabKey = (originalRemaining[remainingIndex] as any)?.[5];
                    const subtitle = MENU_SUBTITLES[String(label)] || 'Menu layanan';
                    return (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.75}
                        style={[styles.menuCardTile, { backgroundColor: bgPastel }]}
                        onPress={() => handleMenuNavigation(String(route), tabKey ? String(tabKey) : undefined)}
                      >
                        <View style={styles.menuIconCircleHalo}>
                          <MaterialCommunityIcons
                            name={String(icon) as never}
                            size={28}
                            color={String(color)}
                          />
                        </View>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                          style={styles.menuTileTitle}
                        >
                          {String(label)}
                        </Text>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.75}
                          style={styles.menuTileSubtitle}
                        >
                          {subtitle}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {rowItems.length < 4 &&
                    Array.from({ length: 4 - rowItems.length }).map((_, emptyIdx) => (
                      <View key={`exp-spacer-${emptyIdx}`} style={styles.menuCardTileSpacer} />
                    ))}
                </View>
              ))}
          </View>
          )}
          </>
        ) : null}



        {/* ============================================================ */}
        {/* ============================================================ */}
        {/* KONTAINER MENU LAYANAN SISWA (PORTAL SISWA) — CAROUSEL 6 MENU */}
        {/* ============================================================ */}
        {Boolean((student || parent) && (student || activeStudent)) && !parent && (
          <View style={styles.childPortalMenuContainer}>
            {/* Header Kontainer Menu */}
            <View style={styles.childPortalMenuHeader}>
              <View style={styles.childPortalMenuHeaderLeft}>
                <View style={styles.childPortalMenuHeaderIconBox}>
                  <MaterialCommunityIcons name="view-grid-plus" size={15} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, marginLeft: 2 }}>
                  <Text numberOfLines={1} style={styles.childPortalMenuHeaderTitle}>
                    Menu Siswa · {activeStudent?.full_name || activeStudent?.nama_lengkap || activeStudent?.nama || activeStudent?.name || 'Ananda'}
                  </Text>
                  <Text numberOfLines={1} style={styles.childPortalMenuHeaderSub}>
                    Akses cepat pembelajaran & layanan terpadu
                  </Text>
                </View>
              </View>
              <View style={styles.childPortalBadge}>
                <MaterialCommunityIcons name="shield-check" size={11} color="#047857" style={{ marginRight: 2 }} />
                <Text style={styles.childPortalBadgeText}>Layanan</Text>
              </View>
            </View>

            {/* Carousel 2 Baris × 4 Kolom, Geser Kiri-Kanan */}
            <ScrollView
              ref={childMenuScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={SCREEN_WIDTH - 52}
              snapToAlignment="start"
              style={{ height: 166 }}
              contentContainerStyle={{ alignItems: 'flex-start', paddingBottom: 0 }}
              onMomentumScrollEnd={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const page = Math.round(offsetX / (SCREEN_WIDTH - 52));
                setActiveChildMenuPage(page);
              }}
              scrollEventThrottle={16}
            >
              {childPortalMenuPages.map((pageItems, pIdx) => {
                const row1 = pageItems.slice(0, 4);
                const row2 = pageItems.slice(4, 8);
                const fillRow1 = row1.length < 4 ? Array.from({ length: 4 - row1.length }) : [];
                const fillRow2 = row2.length < 4 ? Array.from({ length: 4 - row2.length }) : [];
                return (
                  <View key={'child-page-' + pIdx} style={styles.childPortalMenuPage}>
                    {/* Baris 1 */}
                    <View style={styles.childPortalMenuRow}>
                      {row1.map((item, idx) => (
                        <TouchableOpacity
                          key={'child-menu-' + pIdx + '-' + idx}
                          activeOpacity={0.8}
                          style={styles.childPortalCarouselItem}
                          onPress={() => handleChildPortalMenuClick(item.route, item.tab)}
                        >
                          <View style={[styles.childPortalIconSquircle, { backgroundColor: item.color }]}>
                            <MaterialCommunityIcons name={item.icon as any} size={20} color="#FFFFFF" />
                          </View>
                          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.childPortalMenuLabel}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {fillRow1.map((_, ei) => <View key={'fr1-' + ei} style={styles.childPortalCarouselItemEmpty} />)}
                    </View>
                    {/* Baris 2 */}
                    {(row2.length > 0 || fillRow2.length > 0) && (
                      <View style={styles.childPortalMenuRow}>
                        {row2.map((item, idx) => (
                          <TouchableOpacity
                            key={'child-menu-' + pIdx + '-r2-' + idx}
                            activeOpacity={0.8}
                            style={styles.childPortalCarouselItem}
                            onPress={() => handleChildPortalMenuClick(item.route, item.tab)}
                          >
                            <View style={[styles.childPortalIconSquircle, { backgroundColor: item.color }]}>
                              <MaterialCommunityIcons name={item.icon as any} size={20} color="#FFFFFF" />
                            </View>
                            <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.childPortalMenuLabel}>
                              {item.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        {fillRow2.map((_, ei) => <View key={'fr2-' + ei} style={styles.childPortalCarouselItemEmpty} />)}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            {/* Indikator Titik Halaman Carousel Menu Siswa */}
            {childPortalMenuPages.length > 1 && (
              <View style={styles.childPortalPaginationDots}>
                {childPortalMenuPages.map((_, dotIdx) => (
                  <View
                    key={'cp-dot-' + dotIdx}
                    style={activeChildMenuPage === dotIdx ? styles.childPortalDotActive : styles.childPortalDot}
                  />
                ))}
              </View>
            )}
          </View>
        )}


        {/* ============================================================ */}
        {/* ============================================================ */}
        {/* SECTION: Aktivitas Siswa Hari Berjalan (Realtime Feed)        */}
        {/* ============================================================ */}
        {Boolean(student && !parent) && (
          <View style={styles.activityTimelineCard}>
          {/* Header Bar: Navigasi Hari + Tanggal + Status */}
          <View style={styles.activityTimelineHeaderRow}>
            {/* Tombol Panah Kiri (hari sebelumnya) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={goToPrevDay}
              style={styles.activityDayNavBtn}
              accessibilityLabel="Hari sebelumnya"
            >
              <MaterialCommunityIcons name="chevron-left" size={18} color="#059669" />
            </TouchableOpacity>

            {/* Tengah: Ikon Pulse Solid + Tanggal + Subtitle */}
            <View style={styles.activityTimelineHeaderCenter}>
              <View style={styles.activityTimelinePulseBox}>
                <MaterialCommunityIcons name="pulse" size={17} color="#FFFFFF" />
              </View>
              <View style={styles.activityTimelineTitleCol}>
                <Text style={styles.activityTimelineStudentName} numberOfLines={1}>
                  Aktivitas Santri · {activeStudent?.nama_lengkap || activeStudent?.nama || activeStudent?.name || 'Ananda'}
                </Text>
                <View style={styles.activityTimelineDateRow}>
                  <MaterialCommunityIcons name="calendar-check" size={12} color="#059669" style={{ marginRight: 3 }} />
                  <Text style={styles.activityTimelineDateTitle} numberOfLines={1}>
                    {new Date(viewedDate + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                  {isViewingToday && (
                    <View style={styles.activityTodayBadge}>
                      <Text style={styles.activityTodayBadgeText}>Hari ini</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Tombol Panah Kanan (hari berikutnya, dinonaktifkan kalau sudah hari ini) */}
            <TouchableOpacity
              activeOpacity={isViewingToday ? 0.3 : 0.7}
              onPress={goToNextDay}
              style={[styles.activityDayNavBtn, isViewingToday && styles.activityDayNavBtnDisabled]}
              accessibilityLabel="Hari berikutnya"
              disabled={isViewingToday}
            >
              <MaterialCommunityIcons name="chevron-right" size={18} color={isViewingToday ? '#CBD5E1' : '#059669'} />
            </TouchableOpacity>
          </View>

          {/* Timeline Feed (Aktif Scroll Vertikal di Dalam Card) */}
          {loadingTimeline && (!resolvedActivities || resolvedActivities.length === 0) ? (
            <View style={styles.activityTimelineLoadingBox}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={styles.activityTimelineLoadingText}>Menghubungkan ke aktivitas realtime...</Text>
            </View>
          ) : resolvedActivities && resolvedActivities.length > 0 ? (
            <ScrollView
              style={styles.activityTimelineScrollArea}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.activityTimelineFeedList}
            >
              {resolvedActivities.map((act: any, aIdx: number) => {
                const isFirst = aIdx === 0;
                const isLast = aIdx === resolvedActivities.length - 1;
                const badgeStyle = getActivityBadgeStyle(act.badge_type);
                const isPast = Boolean(act.is_past || (act.date_label && act.date_label !== 'Hari ini'));

                return (
                  <View key={act.id || aIdx} style={styles.timelineRowContainer}>
                    {/* Column 1: Time Stamp */}
                    <View style={styles.timelineColTime}>
                      {isPast ? (
                        <>
                          {act.date_label ? (
                            <Text style={styles.timelinePastDateText} numberOfLines={1}>
                              {act.date_label}
                            </Text>
                          ) : null}
                          <Text style={styles.timelinePastTimeText}>
                            {act.time_label || '--:--'}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.timelineTimeText}>
                          {act.time_label || '--:--'}
                        </Text>
                      )}
                    </View>

                    {/* Column 2: Vertical Connecting Line & Node Ring */}
                    <View style={styles.timelineColTrack}>
                      {/* Top connecting line segment */}
                      <View
                        style={[
                          styles.timelineTrackLineTop,
                          isFirst && { opacity: 0 },
                          isPast && styles.timelineTrackLinePast,
                        ]}
                      />

                      {/* Circular Ring Node */}
                      <View
                        style={[
                          styles.timelineTrackNodeRing,
                          isPast ? styles.timelineTrackNodeRingPast : styles.timelineTrackNodeRingActive,
                        ]}
                      />

                      {/* Bottom connecting line segment */}
                      <View
                        style={[
                          styles.timelineTrackLineBottom,
                          isLast && { opacity: 0 },
                          isPast && styles.timelineTrackLinePast,
                        ]}
                      />
                    </View>

                    {/* Column 3: Activity Row Card */}
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => setSelectedActivity(act)}
                      style={[
                        styles.timelineColCard,
                        { borderLeftColor: act.icon_color || '#10B981' },
                      ]}
                    >
                      {/* Solid Icon Box dengan White Icon */}
                      <View style={[styles.timelineCardIconBox, { backgroundColor: act.icon_color || '#059669' }]}>
                        <MaterialCommunityIcons
                          name={(act.icon || 'star-outline') as any}
                          size={20}
                          color="#FFFFFF"
                        />
                      </View>

                      {/* Text Column */}
                      <View style={styles.timelineCardTextCol}>
                        <Text style={styles.timelineCardTitle} numberOfLines={1}>
                          {act.title}
                        </Text>
                        <Text style={styles.timelineCardSubtitle} numberOfLines={1}>
                          {act.subtitle}
                        </Text>
                      </View>

                      {/* Status Badge Pill */}
                      <View style={styles.timelineBadgeContainer}>
                        <View style={[styles.timelineBadgePill, { backgroundColor: badgeStyle.bg, borderColor: `${badgeStyle.text}25` }]}>
                          <Text style={[styles.timelineBadgeText, { color: badgeStyle.text }]}>
                            {act.badge_label}
                          </Text>
                        </View>
                        {act.has_red_dot && <View style={styles.timelineBadgeRedDot} />}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            /* Empty State */
            <View style={styles.activityTimelineEmptyBox}>
              <MaterialCommunityIcons name="timeline-clock-outline" size={34} color="#CBD5E1" />
              <Text style={styles.activityTimelineEmptyTitle}>Belum Ada Aktivitas Hari Ini</Text>
              <Text style={styles.activityTimelineEmptySub}>
                Data presensi mapel, sholat, dan tahfizh yang diinput guru atau musyrif hari ini akan otomatis tampil di sini secara realtime.
              </Text>
            </View>
          )}
        </View>
        )}

        {/* ============================================================ */}
        {/* EXECUTIVE DAILY 360° HUB (Khusus Orang Tua / Siswa Aktif)    */}
        {/* Tampil Tepat di Bawah Menu Utama dengan Nama Ananda Aktif    */}
        {Boolean(student && !parent) && (
          <View style={styles.hubContainer}>
            {/* Header Kontainer Rangkuman Harian (Sesuai Gaya Header Layanan Lainnya) */}
            <View style={styles.hubHeaderRow}>
              <View style={styles.hubHeaderLeftCol}>
                <View style={styles.hubHeaderIconBox}>
                  <MaterialCommunityIcons name="view-dashboard-variant-outline" size={17} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.hubHeaderTitle}>
                    Rangkuman Harian · {activeStudent?.nama_lengkap || activeStudent?.nama || activeStudent?.name || 'Ananda'}
                  </Text>
                  <Text numberOfLines={1} style={styles.hubHeaderSubtitle}>
                    {activeStudent?.education_unit?.name || activeStudent?.unit_name || activeStudent?.unit?.name || 'Kehadiran, tugas, tahfizh & ibadah hari ini'}
                  </Text>
                </View>
              </View>
              <View style={styles.hubLiveBadge}>
                <View style={styles.hubLivePulseDot} />
                <Text style={styles.hubLiveBadgeText}>Hari Ini</Text>
              </View>
            </View>

            {/* 4 Rangkuman Harian Items dalam Bentuk List dengan Warna Tematik Solid & Icon Putih */}
            <View style={styles.hubList}>
              {/* 1. Presensi (Emerald Solid Icon + Pastel Card) */}
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.hubListItem, styles.hubListItemEmerald]}
                onPress={() => handleMenuNavigation('Absensi')}
              >
                <View style={[styles.hubListIconBox, { backgroundColor: '#059669' }]}>
                  <MaterialCommunityIcons name="calendar-check-outline" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.hubListContent}>
                  <View style={styles.hubListHeaderRow}>
                    <Text style={[styles.hubListLabel, { color: '#047857' }]}>Presensi Masuk</Text>
                    <View style={[styles.hubListTag, { backgroundColor: '#DCFCE7' }]}>
                      <Text numberOfLines={1} style={[styles.hubListTagText, { color: '#047857' }]}>
                        {hubAttendanceData.timeText}
                      </Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={[styles.hubListValue, { color: hubAttendanceData.color || '#065F46' }]}>
                    {hubAttendanceData.label}
                  </Text>
                </View>
                <View style={[styles.hubListActionBtn, { backgroundColor: '#DCFCE7' }]}>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#059669" />
                </View>
              </TouchableOpacity>

              {/* 2. Tugas & Kuis (Blue Solid Icon + Pastel Card) */}
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.hubListItem, styles.hubListItemBlue]}
                onPress={() => handleMenuNavigation('Tugas')}
              >
                <View style={[styles.hubListIconBox, { backgroundColor: '#2563EB' }]}>
                  <MaterialCommunityIcons name="clipboard-text-clock-outline" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.hubListContent}>
                  <View style={styles.hubListHeaderRow}>
                    <Text style={[styles.hubListLabel, { color: '#1D4ED8' }]}>Tugas Terdekat</Text>
                    <View style={[styles.hubListTag, { backgroundColor: '#DBEAFE' }]}>
                      <Text numberOfLines={1} style={[styles.hubListTagText, { color: '#1D4ED8' }]}>
                        {hubTaskData.countText}
                      </Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={[styles.hubListValue, { color: '#1E293B' }]}>
                    {hubTaskData.title}
                  </Text>
                  {Boolean(hubTaskData.sub) && (
                    <Text numberOfLines={1} style={[styles.hubListSubText, { color: '#2563EB' }]}>
                      {hubTaskData.sub}
                    </Text>
                  )}
                </View>
                <View style={[styles.hubListActionBtn, { backgroundColor: '#DBEAFE' }]}>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#2563EB" />
                </View>
              </TouchableOpacity>

              {/* 3. Tahfizh (Teal Solid Icon + Pastel Card) */}
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.hubListItem, styles.hubListItemTeal]}
                onPress={() => handleMenuNavigation('Tahfizh')}
              >
                <View style={[styles.hubListIconBox, { backgroundColor: '#0D9488' }]}>
                  <MaterialCommunityIcons name="book-open-page-variant-outline" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.hubListContent}>
                  <View style={styles.hubListHeaderRow}>
                    <Text style={[styles.hubListLabel, { color: '#0F766E' }]}>Setoran Terakhir</Text>
                    <View style={[styles.hubListTag, { backgroundColor: '#CCFBF1' }]}>
                      <Text numberOfLines={1} style={[styles.hubListTagText, { color: '#0F766E' }]}>
                        {hubTahfizhData.badge}
                      </Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={[styles.hubListValue, { color: '#134E4A' }]}>
                    {hubTahfizhData.surahText}
                  </Text>
                  {Boolean(hubTahfizhData.note) && (
                    <Text numberOfLines={1} style={[styles.hubListSubText, { color: '#0D9488' }]}>
                      {hubTahfizhData.note}
                    </Text>
                  )}
                </View>
                <View style={[styles.hubListActionBtn, { backgroundColor: '#CCFBF1' }]}>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#0D9488" />
                </View>
              </TouchableOpacity>

              {/* 4. Mutaba'ah Sholat & Ibadah Unit (Purple Solid Icon + Pastel Card) */}
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.hubListItem, styles.hubListItemPurple]}
                onPress={() => handleMenuNavigation('Mutabaah')}
              >
                <View style={[styles.hubListIconBox, { backgroundColor: '#7E22CE' }]}>
                  <MaterialCommunityIcons name="hands-pray" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.hubListContent}>
                  <View style={styles.hubListHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, marginRight: 4 }}>
                      <Text numberOfLines={1} style={[styles.hubListLabel, { color: '#6B21A8', flexShrink: 0 }]}>Ibadah & Mutaba'ah</Text>
                      {/* Petunjuk Pengisian / Verifikasi dari Sekolah / Ortu */}
                      <View style={[styles.hubVerifierBadge, { backgroundColor: hubMutabaahData.verifierBadge.bg, flexShrink: 1 }]}>
                        <MaterialCommunityIcons name={hubMutabaahData.verifierBadge.icon as any} size={11} color={hubMutabaahData.verifierBadge.color} style={{ marginRight: 2 }} />
                        <Text numberOfLines={1} style={[styles.hubVerifierText, { color: hubMutabaahData.verifierBadge.color }]}>
                          {hubMutabaahData.verifierBadge.label}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.hubListTag, { backgroundColor: '#F3E8FF' }]}>
                      <Text numberOfLines={1} style={[styles.hubListTagText, { color: '#6B21A8' }]}>
                        {hubMutabaahData.ratioText}
                      </Text>
                    </View>
                  </View>

                  {/* Deretan Pill Sholat Fardhu & Sunnah Sesuai Unit */}
                  <View style={styles.hubSholatPillsRow}>
                    {hubMutabaahData.prayers.map((p: any, pIdx: number) => (
                      <View
                        key={'pr-' + p.label + '-' + pIdx}
                        style={[
                          styles.hubSholatPill,
                          p.done ? (p.isSunnah ? styles.hubSholatPillSunnahDone : styles.hubSholatPillDone) : styles.hubSholatPillPending,
                        ]}
                      >
                        <Text style={[styles.hubSholatPillText, p.done && styles.hubSholatPillTextDone]}>
                          {p.short}
                        </Text>
                        {Boolean(p.verifiedBy === 'sekolah') && (
                          <View style={styles.hubPillVerifiedDot} />
                        )}
                      </View>
                    ))}
                  </View>

                  {/* Agenda Unit Tambahan jika ada (Tilawah, Dzikir, dll) */}
                  {hubMutabaahData.otherAgendas.length > 0 && (
                    <View style={styles.hubOtherAgendasRow}>
                      {hubMutabaahData.otherAgendas.map((oa: any, oaIdx: number) => (
                        <View key={'oa-' + oaIdx} style={[styles.hubOtherAgendaChip, oa.done ? styles.hubOtherAgendaDone : styles.hubOtherAgendaPending]}>
                          <MaterialCommunityIcons
                            name={oa.done ? 'check-circle' : 'circle-outline'}
                            size={11}
                            color={oa.done ? '#7E22CE' : '#94A3B8'}
                            style={{ marginRight: 2 }}
                          />
                          <Text numberOfLines={1} style={[styles.hubOtherAgendaText, oa.done && { color: '#7E22CE', fontWeight: '700' }]}>
                            {oa.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {Boolean(hubMutabaahData.note) && (
                    <Text numberOfLines={1} style={[styles.hubListSubText, { color: '#7E22CE', marginTop: 3 }]}>
                      {hubMutabaahData.note}
                    </Text>
                  )}
                </View>
                <View style={[styles.hubListActionBtn, { backgroundColor: '#F3E8FF' }]}>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#7E22CE" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ============================================================ */}
        {Boolean(student && !parent) && (
          <>
            {/* ── 1. Card Tugas Terbaru (Full-Width List Card) ── */}
            <View style={[styles.homeWidgetCardContainer, styles.homeWidgetCardContainerBlue]}>
              {/* Header Card */}
              <View style={[styles.homeWidgetCardHeaderRow, styles.homeWidgetCardHeaderRowBlue]}>
                <View style={styles.homeWidgetCardHeaderLeft}>
                  <View style={[styles.homeWidgetHeaderIconBox, styles.homeWidgetHeaderIconBoxBlue]}>
                    <MaterialCommunityIcons name="clipboard-text-clock" size={17} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.homeWidgetCardTitle, { color: '#1E3A8A' }]}>
                      Tugas Terbaru · {activeStudent?.nama_lengkap || activeStudent?.nama || activeStudent?.name || 'Ananda'}
                    </Text>
                    <Text numberOfLines={1} style={[styles.homeWidgetCardSub, { color: '#2563EB' }]}>
                      Daftar tugas & penugasan aktif
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => {
                    setShowTugasModal(true);
                    void fetchHomeWidgets(activeChildId);
                  }}
                  style={[styles.homeWidgetActionBadge, styles.homeWidgetActionBadgeBlue]}
                >
                  <Text style={[styles.homeWidgetActionBadgeText, { color: '#1D4ED8' }]}>Semua</Text>
                  <MaterialCommunityIcons name="chevron-right" size={13} color="#1D4ED8" />
                </TouchableOpacity>
              </View>

              {/* List Content */}
              {loadingHomeWidgets ? (
                <View style={styles.homeWidgetLoadingBox}>
                  <ActivityIndicator size="small" color="#2563EB" />
                </View>
              ) : homeAssignments.length > 0 ? (
                <View style={styles.homeWidgetList}>
                  <ScrollView
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                    style={styles.homeWidgetScrollArea}
                    contentContainerStyle={styles.homeWidgetListScrollContent}
                  >
                    {homeAssignments.map((task: any, idx: number) => {
                      const subjectName = task?.subject?.name ?? task?.subject?.nama_mapel ?? task?.mata_pelajaran ?? 'Mata Pelajaran';
                      const taskTitle = task?.judul_tugas ?? task?.judul ?? task?.title ?? 'Tugas';
                      const deadline = task?.deadline
                        ? new Date(task.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                        : null;
                      const submission = Array.isArray(task?.pengumpulanTugas) ? task.pengumpulanTugas[0]
                        : Array.isArray(task?.pengumpulan_tugas) ? task.pengumpulan_tugas[0]
                        : null;
                      const isSubmitted = submission && ['dikumpulkan', 'submitted', 'dinilai', 'graded'].includes(submission.status);
                      const isLate = !isSubmitted && task?.deadline && new Date(task.deadline) < new Date();

                      return (
                        <TouchableOpacity
                          key={`task-item-${task.id ?? idx}`}
                          activeOpacity={0.78}
                          style={[
                            styles.homeWidgetListItem,
                            styles.homeWidgetListItemBlue,
                            isLate && styles.homeWidgetListItemLate,
                          ]}
                          onPress={() => {
                            setShowTugasModal(true);
                            void fetchHomeWidgets(activeChildId);
                          }}
                        >
                          <View style={[
                            styles.homeWidgetListIconBox,
                            { backgroundColor: isSubmitted ? '#059669' : isLate ? '#DC2626' : '#2563EB' }
                          ]}>
                            <MaterialCommunityIcons
                              name={isSubmitted ? "check-circle-outline" : isLate ? "alert-circle-outline" : "clipboard-text-outline"}
                              size={18}
                              color="#FFFFFF"
                            />
                          </View>
                          <View style={styles.homeWidgetListContent}>
                            <View style={styles.homeWidgetListHeaderRow}>
                              <Text numberOfLines={1} style={[styles.homeWidgetListLabel, { color: isLate ? '#DC2626' : '#1D4ED8' }]}>
                                {subjectName}
                              </Text>
                              <View style={[
                                styles.homeWidgetListTag,
                                { backgroundColor: isSubmitted ? '#DCFCE7' : isLate ? '#FEE2E2' : '#DBEAFE' }
                              ]}>
                                <Text numberOfLines={1} style={[
                                  styles.homeWidgetListTagText,
                                  { color: isSubmitted ? '#047857' : isLate ? '#DC2626' : '#1D4ED8' }
                                ]}>
                                  {isSubmitted ? 'Selesai' : isLate ? 'Terlambat' : 'Belum Dikumpul'}
                                </Text>
                              </View>
                            </View>
                            <Text numberOfLines={1} style={styles.homeWidgetListTitle}>
                              {taskTitle}
                            </Text>
                            {deadline && (
                              <View style={styles.homeWidgetDeadlineRow}>
                                <MaterialCommunityIcons
                                  name="clock-outline"
                                  size={11}
                                  color={isLate ? '#DC2626' : '#64748B'}
                                  style={{ marginRight: 3 }}
                                />
                                <Text numberOfLines={1} style={[styles.homeWidgetDeadlineText, isLate && { color: '#DC2626', fontWeight: '700' }]}>
                                  {isLate ? 'Lewat deadline · ' : 'Batas: '}{deadline}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={[styles.homeWidgetListActionBtn, { backgroundColor: isLate ? '#FEE2E2' : '#DBEAFE' }]}>
                            <MaterialCommunityIcons name="chevron-right" size={18} color={isLate ? '#DC2626' : '#2563EB'} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {homeAssignments.length > 2 && (
                    <TouchableOpacity
                      activeOpacity={0.75}
                      style={[styles.homeWidgetMoreFooter, { marginTop: 4 }]}
                      onPress={() => {
                        setShowTugasModal(true);
                        void fetchHomeWidgets(activeChildId);
                      }}
                    >
                      <Text style={[styles.homeWidgetMoreText, { color: '#2563EB' }]}>
                        Menampilkan seluruh {homeAssignments.length} tugas aktif · Ketuk untuk rincian
                      </Text>
                      <MaterialCommunityIcons name="arrow-right" size={13} color="#2563EB" />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.homeWidgetEmptyRow}>
                  <View style={[styles.homeWidgetEmptyIconBox, { backgroundColor: '#DCFCE7' }]}>
                    <MaterialCommunityIcons name="check-circle-outline" size={20} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.homeWidgetEmptyTitle}>Semua Tugas Tuntas 🎉</Text>
                    <Text style={styles.homeWidgetEmptySubtitle}>Tidak ada PR atau tugas mendesak saat ini.</Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── 2. Card Jadwal Hari Ini (Full-Width List Card) ── */}
            <View style={[styles.homeWidgetCardContainer, styles.homeWidgetCardContainerIndigo]}>
              {/* Header Card */}
              <View style={[styles.homeWidgetCardHeaderRow, styles.homeWidgetCardHeaderRowIndigo]}>
                <View style={styles.homeWidgetCardHeaderLeft}>
                  <View style={[styles.homeWidgetHeaderIconBox, styles.homeWidgetHeaderIconBoxIndigo]}>
                    <MaterialCommunityIcons name="calendar-clock" size={17} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.homeWidgetCardTitle, { color: '#312E81' }]}>
                      Jadwal Hari Ini · {activeStudent?.nama_lengkap || activeStudent?.nama || activeStudent?.name || 'Ananda'}
                    </Text>
                    <Text numberOfLines={1} style={[styles.homeWidgetCardSub, { color: '#4F46E5' }]}>
                      Jadwal kegiatan belajar mengajar (KBM)
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setShowJadwalModal(true)}
                  style={[styles.homeWidgetActionBadge, styles.homeWidgetActionBadgeIndigo]}
                >
                  <Text style={[styles.homeWidgetActionBadgeText, { color: '#4338CA' }]}>Semua</Text>
                  <MaterialCommunityIcons name="chevron-right" size={13} color="#4338CA" />
                </TouchableOpacity>
              </View>

              {/* List Content */}
              {loadingHomeWidgets ? (
                <View style={styles.homeWidgetLoadingBox}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                </View>
              ) : (() => {
                const todayItems: any[] = Array.isArray(homeSchedule?.today_schedules)
                  ? homeSchedule.today_schedules
                  : Array.isArray(homeSchedule?.data?.today_schedules)
                  ? homeSchedule.data.today_schedules
                  : Array.isArray(homeSchedule?.schedules)
                  ? homeSchedule.schedules
                  : Array.isArray(homeSchedule)
                  ? homeSchedule
                  : [];
                const totalCount = homeSchedule?.kpi?.today_count ?? todayItems.length;

                return todayItems.length > 0 ? (
                  <View style={styles.homeWidgetList}>
                    <ScrollView
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                      style={styles.homeWidgetScrollArea}
                      contentContainerStyle={styles.homeWidgetListScrollContent}
                    >
                      {todayItems.map((s: any, i: number) => {
                        const isOngoing = Boolean(s.is_ongoing);
                        const subjectTitle = s.subject?.name ?? s.mata_pelajaran ?? 'Mata Pelajaran';
                        const timeStr = `${String(s.time_start ?? '').slice(0, 5)} - ${String(s.time_end ?? '').slice(0, 5)}`;
                        const teacherRoom = [s.teacher?.name || s.guru, s.ruangan || s.room].filter(Boolean).join(' · ') || 'KBM Reguler';

                        return (
                          <TouchableOpacity
                            key={`sched-item-${s.id ?? i}`}
                            activeOpacity={0.78}
                            style={[
                              styles.homeWidgetListItem,
                              isOngoing ? styles.homeWidgetListItemOngoing : styles.homeWidgetListItemIndigo,
                            ]}
                            onPress={() => setShowJadwalModal(true)}
                          >
                            <View style={[
                              styles.homeWidgetListIconBox,
                              { backgroundColor: isOngoing ? '#059669' : '#4F46E5' }
                            ]}>
                              <MaterialCommunityIcons
                                name={isOngoing ? "play-circle" : "clock-time-four-outline"}
                                size={18}
                                color="#FFFFFF"
                              />
                            </View>
                            <View style={styles.homeWidgetListContent}>
                              <View style={styles.homeWidgetListHeaderRow}>
                                <Text numberOfLines={1} style={[styles.homeWidgetListLabel, { color: isOngoing ? '#047857' : '#4338CA' }]}>
                                  {timeStr}
                                </Text>
                                {isOngoing ? (
                                  <View style={[styles.homeWidgetListTag, { backgroundColor: '#DCFCE7' }]}>
                                    <View style={styles.homeLivePulseDotSmall} />
                                    <Text numberOfLines={1} style={[styles.homeWidgetListTagText, { color: '#047857' }]}>
                                      Sedang Berlangsung
                                    </Text>
                                  </View>
                                ) : Boolean(s.ruangan || s.room) && (
                                  <View style={[styles.homeWidgetListTag, { backgroundColor: '#EEF2FF' }]}>
                                    <Text numberOfLines={1} style={[styles.homeWidgetListTagText, { color: '#4338CA' }]}>
                                      {s.ruangan || s.room}
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <Text numberOfLines={1} style={styles.homeWidgetListTitle}>
                                {subjectTitle}
                              </Text>
                              <Text numberOfLines={1} style={[styles.homeWidgetListSubText, { color: isOngoing ? '#047857' : '#6366F1' }]}>
                                {teacherRoom}
                              </Text>
                            </View>
                            <View style={[
                              styles.homeWidgetListActionBtn,
                              { backgroundColor: isOngoing ? '#DCFCE7' : '#EEF2FF' }
                            ]}>
                              <MaterialCommunityIcons
                                name="chevron-right"
                                size={18}
                                color={isOngoing ? '#059669' : '#4F46E5'}
                              />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    {todayItems.length > 2 && (
                      <TouchableOpacity
                        activeOpacity={0.75}
                        style={[styles.homeWidgetMoreFooter, { marginTop: 4 }]}
                        onPress={() => setShowJadwalModal(true)}
                      >
                        <Text style={[styles.homeWidgetMoreText, { color: '#4F46E5' }]}>
                          Menampilkan seluruh {todayItems.length} sesi KBM · Ketuk untuk rincian
                        </Text>
                        <MaterialCommunityIcons name="arrow-right" size={13} color="#4F46E5" />
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={styles.homeWidgetEmptyRow}>
                    <View style={[styles.homeWidgetEmptyIconBox, { backgroundColor: '#EEF2FF' }]}>
                      <MaterialCommunityIcons name="calendar-blank-outline" size={20} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.homeWidgetEmptyTitle}>Tidak Ada Jadwal Hari Ini</Text>
                      <Text style={styles.homeWidgetEmptySubtitle}>Hari ini tidak ada sesi KBM tatap muka terjadwal.</Text>
                    </View>
                  </View>
                );
              })()}
            </View>
          </>
        )}

        {/* ============================================================ */}
        {/* SECTION: DASHBOARD PERAN PEGAWAI / GURU / PIMPINAN (NON-ORTU) */}
        {/* ============================================================ */}
        {(!parent && !student && !alumni) && (
          <>
            {(foundation || superAdmin) && (
              <FoundationDashboardView dashboard={dashboard} navigation={navigation} />
            )}
            {/* Staff generik (Operator, dll) */}
            {staff && !tu && !teacher && !principal && !foundation && !superAdmin && !divisi && (
              <StaffDashboardView dashboard={dashboard} navigation={navigation} />
            )}
          </>
        )}

        {/* SECTION: Berita & Informasi (Harmonized Emerald Card Container & List Content) */}
        {!parent && !teacher && !principal && !divisi && (
          <View style={[styles.homeWidgetCardContainer, styles.homeWidgetCardContainerEmerald]}>
            {/* Header Card: Background Pastel Banner, Solid Emerald Squircle Icon, White Icon, Subtitle, Action Badge */}
            <View style={[styles.homeWidgetCardHeaderRow, styles.homeWidgetCardHeaderRowEmerald]}>
              <View style={styles.homeWidgetCardHeaderLeft}>
                <View style={[styles.homeWidgetHeaderIconBox, styles.homeWidgetHeaderIconBoxEmerald]}>
                  <MaterialCommunityIcons name="newspaper-variant" size={17} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.homeWidgetCardTitle, { color: '#064E3B' }]}>
                    Berita & Informasi
                  </Text>
                  <Text numberOfLines={1} style={[styles.homeWidgetCardSub, { color: '#059669' }]}>
                    Kabar terkini & pengumuman resmi sekolah
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setShowAllNews(true)}
                style={[styles.homeWidgetActionBadge, styles.homeWidgetActionBadgeEmerald]}
              >
                <Text style={[styles.homeWidgetActionBadgeText, { color: '#047857' }]}>Semua</Text>
                <MaterialCommunityIcons name="chevron-right" size={13} color="#047857" />
              </TouchableOpacity>
            </View>

            {/* Carousel Konten Berita (Sesuai Unit Santri & Terpadu) */}
            {unitFilteredAnnouncements.length === 0 ? (
              <View style={styles.homeWidgetEmptyRow}>
                <View style={[styles.homeWidgetEmptyIconBox, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="newspaper-variant-outline" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.homeWidgetEmptyTitle}>Belum Ada Berita Terbaru</Text>
                  <Text style={styles.homeWidgetEmptySubtitle}>Informasi & pengumuman khusus unit ini akan tampil di sini.</Text>
                </View>
              </View>
            ) : unitFilteredAnnouncements.length === 1 ? (
              /* Single Item: Render langsung tanpa ScrollView horizontal agar tidak ada overscroll batas kosong */
              (() => {
                const item = unitFilteredAnnouncements[0];
                const title = titleOf(item);
                const rawExcerpt = subtitleOf(item);
                const excerpt = stripHtmlAndClean(rawExcerpt) || 'Ketuk untuk membaca warta dan pengumuman sekolah selengkapnya.';
                const rawDate = item.created_at || item.published_at || item.date;
                const formattedDate = rawDate
                  ? new Date(rawDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Terbaru';
                const meta = item?.data_tambahan || {};
                const catLabel = item.kategori || meta.kategori || item.category || 'Warta';
                const unitLabel = resolveNewsUnitLabel(item);

                return (
                  <TouchableOpacity
                    key={`news-carousel-${item.id ?? 0}`}
                    activeOpacity={0.88}
                    style={styles.newsCarouselSlideCard}
                    onPress={() => setSelectedNews({ ...item, _index: 0 })}
                  >
                    {/* 1. Gambar / Banner Thumbnail Berita (Fit Tanpa Terpotong) */}
                    <View style={styles.newsCarouselImageBox}>
                      <Image
                        source={getNewsThumbnail(item, 0)}
                        style={styles.newsCarouselImage}
                        resizeMode="contain"
                      />
                    </View>

                    {/* 2. Informasi Konten: Tanggal Terbit, Judul, Potongan Berita */}
                    <View style={styles.newsCarouselBody}>
                      <View style={styles.newsCarouselDateRow}>
                        <MaterialCommunityIcons name="calendar-clock" size={12} color="#059669" style={{ marginRight: 4 }} />
                        <Text numberOfLines={1} style={styles.newsCarouselDateText}>
                          {formattedDate}
                        </Text>
                      </View>

                      <Text numberOfLines={2} style={styles.newsCarouselTitle}>
                        {title}
                      </Text>

                      <Text numberOfLines={2} style={styles.newsCarouselExcerpt}>
                        {excerpt}
                      </Text>

                      {/* Lencana Kategori & Unit di Atas Tombol Baca Selengkapnya */}
                      <View style={styles.newsCarouselBadgesRow}>
                        <View style={[styles.newsCarouselCategoryPill, { backgroundColor: '#004D32' }]}>
                          <MaterialCommunityIcons name="bullhorn" size={10} color="#FFFFFF" style={{ marginRight: 3 }} />
                          <Text style={styles.newsCarouselCategoryText}>
                            {String(catLabel).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.newsCarouselUnitPill}>
                          <Text numberOfLines={1} style={styles.newsCarouselUnitText}>
                            {unitLabel}
                          </Text>
                        </View>
                      </View>

                      {/* Tombol Baca Selengkapnya */}
                      <View style={styles.newsCarouselFooterRow}>
                        <Text style={styles.newsCarouselReadMoreText}>Baca Selengkapnya</Text>
                        <View style={styles.newsCarouselArrowBox}>
                          <MaterialCommunityIcons name="arrow-right" size={13} color="#059669" />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })()
            ) : (
              <>
                <ScrollView
                  ref={newsCarouselScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={SCREEN_WIDTH - 56}
                  snapToAlignment="start"
                  disableIntervalMomentum={true}
                  onMomentumScrollEnd={(e) => {
                    const offsetX = e.nativeEvent.contentOffset.x;
                    const idx = Math.round(offsetX / (SCREEN_WIDTH - 56));
                    if (idx >= 0 && idx < unitFilteredAnnouncements.length) {
                      setActiveNewsCarouselIndex(idx);
                    }
                  }}
                  scrollEventThrottle={16}
                >
                  {unitFilteredAnnouncements.map((item: any, idx: number) => {
                    const title = titleOf(item);
                    const rawExcerpt = subtitleOf(item);
                    const excerpt = stripHtmlAndClean(rawExcerpt) || 'Ketuk untuk membaca warta dan pengumuman sekolah selengkapnya.';
                    const rawDate = item.created_at || item.published_at || item.date;
                    const formattedDate = rawDate
                      ? new Date(rawDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Terbaru';
                    const meta = item?.data_tambahan || {};
                    const catLabel = item.kategori || meta.kategori || item.category || 'Warta';
                    const unitLabel = resolveNewsUnitLabel(item);

                    return (
                      <TouchableOpacity
                        key={`news-carousel-${item.id ?? idx}`}
                        activeOpacity={0.88}
                        style={styles.newsCarouselSlideCard}
                        onPress={() => setSelectedNews({ ...item, _index: idx })}
                      >
                        {/* 1. Gambar / Banner Thumbnail Berita (Fit Tanpa Terpotong) */}
                        <View style={styles.newsCarouselImageBox}>
                          <Image
                            source={getNewsThumbnail(item, idx)}
                            style={styles.newsCarouselImage}
                            resizeMode="contain"
                          />
                        </View>

                        {/* 2. Informasi Konten: Tanggal Terbit, Judul, Potongan Berita */}
                        <View style={styles.newsCarouselBody}>
                          <View style={styles.newsCarouselDateRow}>
                            <MaterialCommunityIcons name="calendar-clock" size={12} color="#059669" style={{ marginRight: 4 }} />
                            <Text numberOfLines={1} style={styles.newsCarouselDateText}>
                              {formattedDate}
                            </Text>
                          </View>

                          <Text numberOfLines={2} style={styles.newsCarouselTitle}>
                            {title}
                          </Text>

                          <Text numberOfLines={2} style={styles.newsCarouselExcerpt}>
                            {excerpt}
                          </Text>

                          {/* Lencana Kategori & Unit di Atas Tombol Baca Selengkapnya */}
                          <View style={styles.newsCarouselBadgesRow}>
                            <View style={[styles.newsCarouselCategoryPill, { backgroundColor: '#004D32' }]}>
                              <MaterialCommunityIcons name="bullhorn" size={10} color="#FFFFFF" style={{ marginRight: 3 }} />
                              <Text style={styles.newsCarouselCategoryText}>
                                {String(catLabel).toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.newsCarouselUnitPill}>
                              <Text numberOfLines={1} style={styles.newsCarouselUnitText}>
                                {unitLabel}
                              </Text>
                            </View>
                          </View>

                          {/* Tombol Baca Selengkapnya */}
                          <View style={styles.newsCarouselFooterRow}>
                            <Text style={styles.newsCarouselReadMoreText}>Baca Selengkapnya</Text>
                            <View style={styles.newsCarouselArrowBox}>
                              <MaterialCommunityIcons name="arrow-right" size={13} color="#059669" />
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Pagination Dots Indicator */}
                {unitFilteredAnnouncements.length > 1 && (
                  <View style={styles.newsCarouselDotsContainer}>
                    {unitFilteredAnnouncements.slice(0, 10).map((_, dotIdx) => {
                      const isActive = activeNewsCarouselIndex === dotIdx;
                      return (
                        <TouchableOpacity
                          key={`news-dot-${dotIdx}`}
                          activeOpacity={0.7}
                          onPress={() => {
                            setActiveNewsCarouselIndex(dotIdx);
                            newsCarouselScrollRef.current?.scrollTo({
                              x: dotIdx * (SCREEN_WIDTH - 56),
                              animated: true,
                            });
                          }}
                          style={[
                            styles.newsCarouselDot,
                            isActive ? styles.newsCarouselDotActive : styles.newsCarouselDotInactive,
                          ]}
                        />
                      );
                    })}
                  </View>
                )}

                {/* Tautan Lihat Semua Berita */}
                <TouchableOpacity
                  activeOpacity={0.75}
                  style={[styles.homeWidgetMoreFooter, { marginTop: 8 }]}
                  onPress={() => setShowAllNews(true)}
                >
                  <Text style={[styles.homeWidgetMoreText, { color: '#059669' }]}>
                    Lihat semua arsip warta & informasi seluruh unit pendidikan ananda
                  </Text>
                  <MaterialCommunityIcons name="arrow-right" size={13} color="#059669" />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Loading Indicator */}
        {loading && !refreshing && (
          <View style={styles.inlineLoader}>
            <ActivityIndicator size="small" color="#084835" />
          </View>
        )}

        {/* Error Card */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
          </Animated.View>
        )}
      </Animated.ScrollView>

      {/* MODAL DETAIL AKTIVITAS REALTIME */}
      <Modal
        visible={Boolean(selectedActivity)}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedActivity(null)}
      >
        <View style={styles.activityModalBackdrop}>
          <View style={styles.activityModalCard}>
            {/* Modal Header */}
            <View style={styles.activityModalHeader}>
              <View style={[styles.activityModalIconBox, { backgroundColor: selectedActivity?.icon_bg || '#ECFDF5' }]}>
                <MaterialCommunityIcons
                  name={(selectedActivity?.icon || 'star-outline') as any}
                  size={24}
                  color={selectedActivity?.icon_color || '#10B981'}
                />
              </View>
              <View style={styles.activityModalHeaderCol}>
                <Text style={styles.activityModalHeaderTitle}>Detail Aktivitas</Text>
                <Text style={styles.activityModalHeaderSub}>
                  {selectedActivity?.date_label || 'Hari ini'} · Pukul {selectedActivity?.time_label || '-'} WIB
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedActivity(null)}
                style={styles.activityModalCloseBtn}
                accessibilityLabel="Tutup Detail"
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Content Body */}
            <View style={styles.activityModalBody}>
              {/* Title & Badge */}
              <View style={styles.activityModalTitleRow}>
                <Text style={styles.activityModalMainTitle}>
                  {selectedActivity?.title}
                </Text>
                {selectedActivity && (
                  <View
                    style={[
                      styles.timelineBadgePill,
                      { backgroundColor: getActivityBadgeStyle(selectedActivity.badge_type).bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.timelineBadgeText,
                        { color: getActivityBadgeStyle(selectedActivity.badge_type).text },
                      ]}
                    >
                      {selectedActivity.badge_label}
                    </Text>
                  </View>
                )}
              </View>

              {/* Subtitle / Description Card */}
              <View style={styles.activityModalDescCard}>
                <Text style={styles.activityModalDescLabel}>Keterangan / Rincian:</Text>
                <Text style={styles.activityModalDescText}>
                  {selectedActivity?.subtitle || '-'}
                </Text>
              </View>

              {/* Info Items List */}
              <View style={styles.activityModalInfoList}>
                <View style={styles.activityModalInfoItem}>
                  <MaterialCommunityIcons name="account-school-outline" size={18} color="#059669" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityModalInfoLabel}>Nama Siswa</Text>
                    <Text style={styles.activityModalInfoVal}>
                      {todayTimeline?.student?.name || 'Siswa'} ({todayTimeline?.student?.class_name || 'Kelas'})
                    </Text>
                  </View>
                </View>

                <View style={styles.activityModalInfoItem}>
                  <MaterialCommunityIcons name="clock-time-four-outline" size={18} color="#059669" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityModalInfoLabel}>Waktu Pencatatan</Text>
                    <Text style={styles.activityModalInfoVal}>
                      {selectedActivity?.time_label ? `Pukul ${selectedActivity.time_label} WIB (${selectedActivity.date_label || 'Hari ini'})` : 'Realtime'}
                    </Text>
                  </View>
                </View>

                <View style={styles.activityModalInfoItem}>
                  <MaterialCommunityIcons name="account-tie-outline" size={18} color="#059669" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityModalInfoLabel}>Guru / Musyrif Verifikator</Text>
                    <Text style={styles.activityModalInfoVal}>
                      {selectedActivity?.verifier_name
                        ? `${selectedActivity.verifier_name} (${selectedActivity.verifier_role || 'Pengampu'})`
                        : (selectedActivity?.subtitle?.includes('Guru: ')
                            ? selectedActivity.subtitle.replace(/^.*?Guru:\s*/, 'Guru: ')
                            : (selectedActivity?.subtitle?.includes('Musyrif: ')
                                ? selectedActivity.subtitle.replace(/^.*?Musyrif:\s*/, 'Musyrif: ')
                                : 'Ustadz / Ustadzah Pengampu'))}
                    </Text>
                  </View>
                </View>

                <View style={styles.activityModalInfoItem}>
                  <MaterialCommunityIcons name="shield-check-outline" size={18} color="#059669" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityModalInfoLabel}>Status Validasi</Text>
                    <Text style={styles.activityModalInfoVal}>
                      {selectedActivity?.verifier_name
                        ? `Telah diverifikasi oleh ${selectedActivity.verifier_name} (${selectedActivity.verifier_role || 'Guru/Musyrif'})`
                        : (selectedActivity?.subtitle?.includes('Guru: ')
                            ? `Telah diverifikasi oleh Guru Mapel (${selectedActivity.subtitle.replace(/^.*?Guru:\s*/, '')})`
                            : (selectedActivity?.subtitle?.includes('Musyrif: ')
                                ? `Telah diverifikasi oleh Musyrif Pembina (${selectedActivity.subtitle.replace(/^.*?Musyrif:\s*/, '')})`
                                : (selectedActivity?.type === 'tahfizh'
                                    ? 'Telah diverifikasi oleh Guru Pembimbing Tahfizh'
                                    : (selectedActivity?.type === 'sholat'
                                        ? 'Telah diverifikasi oleh Musyrif Pembina Asrama'
                                        : 'Telah diverifikasi resmi oleh Guru Pengampu'))))}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.activityModalActionsRow}>
              {selectedActivity?.screen && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    const targetScreen = selectedActivity.screen;
                    setSelectedActivity(null);
                    try {
                      navigation.navigate(targetScreen);
                    } catch {}
                  }}
                  style={styles.activityModalPrimaryBtn}
                >
                  <MaterialCommunityIcons name="arrow-right-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.activityModalPrimaryBtnText}>
                    Buka {selectedActivity.screen}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedActivity(null)}
                style={[
                  styles.activityModalCloseActionBtn,
                  !selectedActivity?.screen && { flex: 1 },
                ]}
              >
                <Text style={styles.activityModalCloseActionBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL QR CODE SISWA */}
      <Modal
        visible={Boolean(selectedQrStudent)}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedQrStudent(null)}
      >
        <View style={styles.qrModalBackdrop}>
          <View style={styles.qrModalCard}>
            <View style={styles.qrModalHeader}>
              <View style={styles.qrModalHeaderIcon}>
                <MaterialCommunityIcons name="qrcode" size={22} color="#084835" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.qrModalTitle}>QR Code Siswa</Text>
                <Text numberOfLines={1} style={styles.qrModalSub}>
                  {selectedQrStudent?.full_name || selectedQrStudent?.nama_lengkap || 'Siswa'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedQrStudent(null)}
                style={styles.qrModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.qrCodeContainer}>
              <Image
                source={{
                  uri: `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
                    selectedQrStudent?.nis || selectedQrStudent?.id || 'STUDENT'
                  )}`,
                }}
                style={styles.qrImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.qrStudentInfoBox}>
              <Text style={styles.qrStudentName}>
                {selectedQrStudent?.full_name || selectedQrStudent?.nama_lengkap || 'Siswa'}
              </Text>
              <Text style={styles.qrStudentNis}>
                NIS: {selectedQrStudent?.nis || '-'} · Kelas: {selectedQrStudent?.kelas?.nama_kelas || selectedQrStudent?.kelas?.name || '-'}
              </Text>
              <Text style={styles.qrStudentUnit}>
                {selectedQrStudent?.education_unit?.name || selectedQrStudent?.unit_name || ''}
              </Text>
            </View>

            <Text style={styles.qrHelpText}>
              Arahkan kode QR ini ke mesin pemindai gerbang atau scanner guru untuk presensi otomatis dan verifikasi santri.
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedQrStudent(null)}
              style={styles.qrCloseActionBtn}
            >
              <Text style={styles.qrCloseActionBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL KARTU PELAJAR / SISWA (SEPERTI WEB-DASHBOARD) */}
      <Modal
        visible={Boolean(selectedIdCardStudent)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedIdCardStudent(null)}
      >
        <View style={styles.idCardModalBackdrop}>
          <View style={styles.idCardModalCard}>
            <View style={styles.idCardModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="card-account-details" size={22} color="#084835" />
                <Text style={styles.idCardModalTitle}>Kartu Tanda Siswa (KTS)</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedIdCardStudent(null)}
                style={styles.qrModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Sisi Depan / Belakang Switcher */}
            <View style={styles.idCardTabRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIdCardSide('front')}
                style={[styles.idCardTabBtn, idCardSide === 'front' && styles.idCardTabBtnActive]}
              >
                <Text style={[styles.idCardTabBtnText, idCardSide === 'front' && styles.idCardTabBtnTextActive]}>
                  Tampak Depan
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIdCardSide('back')}
                style={[styles.idCardTabBtn, idCardSide === 'back' && styles.idCardTabBtnActive]}
              >
                <Text style={[styles.idCardTabBtnText, idCardSide === 'back' && styles.idCardTabBtnTextActive]}>
                  Tampak Belakang
                </Text>
              </TouchableOpacity>
            </View>

            {/* CARD PREVIEW AREA (100% Identical to Web Dashboard StudentCardHorizontal) */}
            {(() => {
              const activeCardTheme = CARD_THEMES[cardSetting?.template_color || 'green'] || CARD_THEMES.green;
              const showCardPhoto = cardSetting?.show_photo ?? true;
              const showCardLogo = cardSetting?.show_logo ?? true;
              const showCardQr = cardSetting?.show_qrcode ?? true;
              const showCardNis = cardSetting?.show_nis ?? true;
              const showCardNisn = cardSetting?.show_nisn ?? true;
              const showCardClass = cardSetting?.show_class ?? true;
              const showCardRombel = cardSetting?.show_rombel ?? true;
              const showCardUnit = cardSetting?.show_unit ?? true;
              const showCardAcademicYear = cardSetting?.show_academic_year ?? false;
              const showCardMotto = cardSetting?.show_motto ?? true;

              const sName = selectedIdCardStudent?.full_name || selectedIdCardStudent?.nama_lengkap || selectedIdCardStudent?.name || 'Siswa';
              const sInitial = sName.charAt(0).toUpperCase();
              const sNis = selectedIdCardStudent?.nis || '-';
              const sNisn = selectedIdCardStudent?.nisn || selectedIdCardStudent?.metadata?.nisn || '-';
              const cardBloodType = selectedIdCardStudent?.golongan_darah || selectedIdCardStudent?.metadata?.golongan_darah || selectedIdCardStudent?.blood_type || '-';
              const cardClassName = selectedIdCardStudent?.kelas?.nama_kelas || selectedIdCardStudent?.kelas?.name || selectedIdCardStudent?.class_name || '';
              const cardRombelName = selectedIdCardStudent?.kelas?.rombel || selectedIdCardStudent?.rombel || selectedIdCardStudent?.metadata?.rombel || '';
              const cardClassDisplay = showCardRombel && cardRombelName ? `${cardClassName} (${cardRombelName})` : cardClassName;

              let formattedBirthDate = '-';
              const rawDate = selectedIdCardStudent?.birth_date || selectedIdCardStudent?.tanggal_lahir;
              if (rawDate) {
                try {
                  formattedBirthDate = new Date(rawDate).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  });
                } catch {
                  formattedBirthDate = String(rawDate);
                }
              }

              const qrValue = selectedIdCardStudent?.qr_token || `STUDENT_CARD:${sNis}:${sName}`;
              const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrValue)}`;
              const studentPhotoUrl = getProfileImageUrl(selectedIdCardStudent);

              return (
                <View style={styles.idCardPreviewBox}>
                  {idCardSide === 'front' ? (
                    // TAMPAK DEPAN (Persis StudentCardHorizontal Web Dashboard)
                    <View style={styles.webCardFrame}>
                      {/* 1. TOP HEADER */}
                      <View style={styles.webCardHeaderRow}>
                        {/* Curved Wave Header Left */}
                        <View style={[styles.webCardWaveLeft, { backgroundColor: activeCardTheme.primary, borderColor: activeCardTheme.accent }]}>
                          {showCardLogo && (
                            <View style={[styles.webCardLogoCircle, { borderColor: activeCardTheme.accent }]}>
                              <Image
                                source={require('../../assets/logo.png')}
                                style={styles.webCardLogoImg}
                                resizeMode="contain"
                              />
                            </View>
                          )}
                          <View style={styles.webCardBrandCol}>
                            <Text style={styles.webCardYayasanLabel}>
                              {mobileConfig.branding?.school_name?.toUpperCase().includes('YAYASAN') ? 'LEMBAGA' : 'YAYASAN'}
                            </Text>
                            <Text numberOfLines={1} style={styles.webCardBrandName}>
                              {mobileConfig.branding?.school_name || selectedIdCardStudent?.education_unit?.name || 'SEKOLAH'}
                            </Text>
                            <Text style={styles.webCardSchoolSub}>
                              {selectedIdCardStudent?.education_unit?.name || 'Islamic School'}
                            </Text>
                          </View>
                        </View>

                        {/* Header Right: Badge & Motto */}
                        <View style={styles.webCardHeaderRight}>
                          <View style={[styles.webCardPillBadge, { backgroundColor: activeCardTheme.primary }]}>
                            <Text style={styles.webCardPillText}>KARTU PELAJAR</Text>
                          </View>
                          {showCardMotto && (
                            <View style={styles.webCardMottoBox}>
                              <Text style={[styles.webCardMottoText, { color: activeCardTheme.primary }]}>
                                {cardSetting?.motto || selectedIdCardStudent?.education_unit?.metadata?.motto || 'Berilmu, Berakhlak, Beramal'}
                              </Text>
                              <MaterialCommunityIcons name="star-four-points" size={10} color={activeCardTheme.accent} style={{ alignSelf: 'flex-end', marginTop: 1 }} />
                            </View>
                          )}
                        </View>
                      </View>

                      {/* 2. THREE-COLUMN BODY (Photo | Details | QR) */}
                      <View style={styles.webCardBody}>
                        {/* Left Column: Photo Frame + Unit Pill */}
                        {showCardPhoto && (
                          <View style={styles.webCardPhotoCol}>
                            <View style={styles.webCardPhotoFrame}>
                              {studentPhotoUrl ? (
                                <Image
                                  source={{ uri: studentPhotoUrl }}
                                  style={styles.webCardPhotoImg}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View style={[styles.webCardPhotoFallback, { backgroundColor: activeCardTheme.primary }]}>
                                  <Text style={styles.webCardPhotoFallbackText}>{sInitial}</Text>
                                </View>
                              )}
                            </View>
                            {showCardUnit && (
                              <View style={[styles.webCardUnitPill, { backgroundColor: activeCardTheme.primary, borderColor: activeCardTheme.accent }]}>
                                <Text numberOfLines={1} style={styles.webCardUnitPillText}>
                                  {selectedIdCardStudent?.education_unit?.name || '-'}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}

                        {/* Center Column: Student Name + Details Table */}
                        <View style={styles.webCardDetailsCol}>
                          <Text numberOfLines={1} style={[styles.webCardStudentName, { color: activeCardTheme.primary }]}>
                            {sName}
                          </Text>

                          {/* Golden Ornament Line */}
                          <View style={styles.webCardOrnamentRow}>
                            <View style={[styles.webCardOrnamentLine, { backgroundColor: activeCardTheme.accent }]} />
                            <MaterialCommunityIcons name="star-four-points" size={10} color={activeCardTheme.accent} />
                            <View style={[styles.webCardOrnamentLine, { backgroundColor: activeCardTheme.accent }]} />
                          </View>

                          {/* Details Table */}
                          <View style={styles.webCardTable}>
                            {showCardNis && (
                              <View style={styles.webTableRow}>
                                <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                  <MaterialCommunityIcons name="card-account-details-outline" size={11} color={activeCardTheme.primary} />
                                </View>
                                <Text style={styles.webTableLabel}>NIS</Text>
                                <Text style={styles.webTableColon}>:</Text>
                                <Text numberOfLines={1} style={styles.webTableVal}>{sNis}</Text>
                              </View>
                            )}

                            {showCardNisn && (
                              <View style={styles.webTableRow}>
                                <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                  <MaterialCommunityIcons name="shield-check-outline" size={11} color={activeCardTheme.primary} />
                                </View>
                                <Text style={styles.webTableLabel}>NISN</Text>
                                <Text style={styles.webTableColon}>:</Text>
                                <Text numberOfLines={1} style={styles.webTableVal}>{sNisn}</Text>
                              </View>
                            )}

                            {showCardClass && (
                              <View style={styles.webTableRow}>
                                <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                  <MaterialCommunityIcons name="account-outline" size={11} color={activeCardTheme.primary} />
                                </View>
                                <Text style={styles.webTableLabel}>Kelas</Text>
                                <Text style={styles.webTableColon}>:</Text>
                                <Text numberOfLines={1} style={styles.webTableVal}>{cardClassDisplay}</Text>
                              </View>
                            )}

                            <View style={styles.webTableRow}>
                              <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                <MaterialCommunityIcons name="calendar-month-outline" size={11} color={activeCardTheme.primary} />
                              </View>
                              <Text style={styles.webTableLabel}>Tanggal Lahir</Text>
                              <Text style={styles.webTableColon}>:</Text>
                              <Text numberOfLines={1} style={styles.webTableVal}>{formattedBirthDate}</Text>
                            </View>

                            <View style={styles.webTableRow}>
                              <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                <MaterialCommunityIcons name="water-outline" size={11} color={activeCardTheme.primary} />
                              </View>
                              <Text style={styles.webTableLabel}>Gol. Darah</Text>
                              <Text style={styles.webTableColon}>:</Text>
                              <Text numberOfLines={1} style={styles.webTableVal}>{cardBloodType}</Text>
                            </View>

                            {showCardAcademicYear && (
                              <View style={styles.webTableRow}>
                                <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                  <MaterialCommunityIcons name="school-outline" size={11} color={activeCardTheme.primary} />
                                </View>
                                <Text style={styles.webTableLabel}>Thn Ajaran</Text>
                                <Text style={styles.webTableColon}>:</Text>
                                <Text numberOfLines={1} style={styles.webTableVal}>
                                  {selectedIdCardStudent?.academic_year?.name || selectedIdCardStudent?.tahun_ajaran || '-'}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Right Column: QR Code Box */}
                        {showCardQr && (
                          <View style={styles.webCardQrCol}>
                            <View style={styles.webCardQrBox}>
                              <Image
                                source={{ uri: qrImageUrl }}
                                style={styles.webCardQrImg}
                                resizeMode="contain"
                              />
                            </View>
                          </View>
                        )}
                      </View>

                      {/* 3. BOTTOM FOOTER */}
                      <View style={[styles.webCardFooter, { backgroundColor: activeCardTheme.primary, borderTopColor: activeCardTheme.accent }]}>
                        <View style={styles.webCardFooterLeft}>
                          <MaterialCommunityIcons name="book-open-outline" size={16} color={activeCardTheme.accent} />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.webCardMottoHeader}>Sekolah Unggulan</Text>
                            <Text style={styles.webCardMottoSub}>Berbasis Al-Qur'an</Text>
                          </View>
                        </View>

                        <View style={styles.webCardFooterDivider} />

                        <View style={styles.webCardFooterRight}>
                          <MaterialCommunityIcons name="web" size={14} color={activeCardTheme.accent} />
                          <Text style={styles.webCardWebText}>www.dareliman.sch.id</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    // TAMPAK BELAKANG (Persis StudentCardBackHorizontal Web Dashboard)
                    <View style={styles.webCardFrame}>
                      {/* Top Header Wave */}
                      <View style={styles.webCardHeaderRow}>
                        <View style={[styles.webCardWaveLeft, { backgroundColor: activeCardTheme.primary, borderColor: activeCardTheme.accent, width: '68%' }]}>
                          {showCardLogo && (
                            <View style={[styles.webCardLogoCircle, { borderColor: activeCardTheme.accent }]}>
                              <Image
                                source={require('../../assets/logo.png')}
                                style={styles.webCardLogoImg}
                                resizeMode="contain"
                              />
                            </View>
                          )}
                          <View style={styles.webCardBrandCol}>
                            <Text style={styles.webCardYayasanLabel}>
                              {mobileConfig.branding?.school_name?.toUpperCase().includes('YAYASAN') ? 'LEMBAGA' : 'YAYASAN'}
                            </Text>
                            <Text numberOfLines={1} style={styles.webCardBrandName}>
                              {mobileConfig.branding?.school_name || selectedIdCardStudent?.education_unit?.name || 'SEKOLAH'}
                            </Text>
                            <Text style={styles.webCardSchoolSub}>
                              {selectedIdCardStudent?.education_unit?.name || mobileConfig.branding?.app_name || 'Sistem Terpadu SIMSIT'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.webCardHeaderRight}>
                          <View style={[styles.webCardPillBadge, { backgroundColor: activeCardTheme.dark }]}>
                            <Text style={styles.webCardPillText}>TATA TERTIB</Text>
                          </View>
                        </View>
                      </View>

                      {/* Rules Content */}
                      <View style={styles.webCardBackContent}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.webCardBackHeading, { color: activeCardTheme.primary }]}>
                            TATA TERTIB SISWA
                          </Text>
                          <View style={[styles.webCardBackDivider, { backgroundColor: activeCardTheme.accent }]} />
                          <View style={styles.webCardBackList}>
                            <Text style={styles.webCardBackItem}>
                              <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>1. </Text>
                              Kartu ini adalah kartu identitas resmi siswa {mobileConfig.branding?.school_name || selectedIdCardStudent?.education_unit?.name || 'sekolah'}.
                            </Text>
                            <Text style={styles.webCardBackItem}>
                              <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>2. </Text>
                              Wajib dibawa & dikenakan selama jam KBM sekolah.
                            </Text>
                            <Text style={styles.webCardBackItem}>
                              <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>3. </Text>
                              Apabila menemukan kartu ini, harap mengembalikan ke piket sekolah.
                            </Text>
                            <Text style={styles.webCardBackItem}>
                              <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>4. </Text>
                              QR Code digunakan untuk absensi gerbang & verifikasi SIMSIT.
                            </Text>
                          </View>
                        </View>

                        {/* Back Mini QR */}
                        <View style={styles.webCardBackQrCol}>
                          <View style={styles.webCardBackQrBox}>
                            <Image
                              source={{ uri: qrImageUrl }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="contain"
                            />
                          </View>
                          <Text style={styles.webCardBackQrSub}>Scan Verifikasi</Text>
                        </View>
                      </View>

                      {/* Back Footer */}
                      <View style={[styles.webCardFooter, { backgroundColor: activeCardTheme.primary, borderTopColor: activeCardTheme.accent }]}>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={styles.webCardFooterAddress}>
                            Jl. Gajah Mada No. 28 Padang, Sumatera Barat
                          </Text>
                        </View>
                        <Text style={styles.webCardFooterPhone}>
                          Telp: (0751) 123456 · dareliman.or.id
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })()}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSelectedIdCardStudent(null)}
              style={styles.qrCloseActionBtn}
            >
              <Text style={styles.qrCloseActionBtnText}>Tutup Kartu Siswa</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL PROFIL SEKOLAH TERPADU (MENCELUPKAN SETIAP ANANDA JIKA LEBIH DARI 1) */}
      <Modal
        visible={showSchoolProfileModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowSchoolProfileModal(false)}
      >
        <View style={styles.newsModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowSchoolProfileModal(false)}
          />

          <View style={[styles.newsModalSheet, { maxHeight: SCREEN_HEIGHT * 0.9 }]}>
            <LinearGradient
              colors={['#0F766E', '#0D9488', '#14B8A6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newsModalHeaderGradient}
            >
              <View style={styles.newsHeaderDecorWave} />
              <View style={styles.newsHeaderDecorCircle} />

              <View style={styles.newsModalHeaderRow}>
                <View style={styles.newsModalRoundcubeBtn}>
                  <MaterialCommunityIcons name="domain" size={20} color="#0D9488" />
                </View>

                <View style={styles.newsModalTitleCol}>
                  <Text style={styles.newsModalEyebrow}>PROFIL SEKOLAH TERPADU</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>
                    Identitas Unit Pendidikan
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setShowSchoolProfileModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Tutup"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#0D9488" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
              {/* JIKA ANAK LEBIH DARI 1: TAMPILKAN TAB PEMILIH ANANDA */}
              {parentChildren.length > 1 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                      Pilih Unit Sekolah Ananda ({parentChildren.length} Ananda)
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                      Ketuk untuk berganti
                    </Text>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {parentChildren.map((ch, cIdx) => {
                      const cid = String(ch.id || ch.student_id);
                      const isSelected = selectedSchoolProfileChildId ? cid === selectedSchoolProfileChildId : cIdx === 0;
                      const cName = ch.nama_lengkap || ch.name || ch.full_name || `Ananda ${cIdx + 1}`;
                      const cUnit = ch.education_unit?.name || ch.unit_name || ch.kelas?.unit_pendidikan?.name || 'Unit Belajar';

                      return (
                        <TouchableOpacity
                          key={`school-prof-child-${cid}`}
                          activeOpacity={0.8}
                          onPress={() => setSelectedSchoolProfileChildId(cid)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: isSelected ? '#F0FDF4' : '#FFFFFF',
                            borderRadius: 14,
                            paddingHorizontal: 12,
                            paddingVertical: 9,
                            borderWidth: 1.5,
                            borderColor: isSelected ? '#059669' : '#E2E8F0',
                            gap: 8,
                          }}
                        >
                          <View
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              backgroundColor: isSelected ? '#059669' : '#F1F5F9',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <MaterialCommunityIcons
                              name="account"
                              size={16}
                              color={isSelected ? '#FFFFFF' : '#64748B'}
                            />
                          </View>
                          <View>
                            <Text
                              style={{
                                fontSize: 12.5,
                                fontWeight: isSelected ? '800' : '700',
                                color: isSelected ? '#065F46' : '#1E293B',
                              }}
                              numberOfLines={1}
                            >
                              {cName}
                            </Text>
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '600',
                                color: isSelected ? '#047857' : '#64748B',
                              }}
                              numberOfLines={1}
                            >
                              {String(cUnit).replace(/^Unit\s+/i, '')}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* CARD DETAIL IDENTITAS SEKOLAH DARI ANANDA TERPILIH */}
              {(() => {
                const targetChild = parentChildren.find(
                  (c) => String(c.id || c.student_id) === String(selectedSchoolProfileChildId)
                ) || parentChildren[0];

                if (!targetChild) {
                  return (
                    <View style={{ padding: 24, backgroundColor: '#FFFFFF', borderRadius: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, color: '#64748B' }}>Data unit sekolah tidak ditemukan.</Text>
                    </View>
                  );
                }

                const eduUnit = targetChild?.education_unit || targetChild?.kelas?.unit_pendidikan || {};
                const meta = eduUnit?.metadata || {};
                const unitName = eduUnit?.name || targetChild?.unit_name || 'Unit Pendidikan Terpadu';
                const level = meta?.jenjang || eduUnit?.level || 'Terpadu';
                const principal = meta?.principal_name || 'Kepala Sekolah';
                const address = meta?.address || '-';
                const city = meta?.city || '';
                const province = meta?.province || '';
                const fullLoc = [address, city, province].filter(Boolean).join(', ');
                const phone = meta?.phone || '-';
                const email = meta?.email || '-';
                const npsn = meta?.npsn || eduUnit?.code || '-';
                const accreditation = meta?.accreditation || 'A';
                const program = `${eduUnit?.program_type ? String(eduUnit.program_type).toUpperCase() : 'REGULER'} · ${eduUnit?.jam_kegiatan || 'Jam KBM Terpadu'}`;
                const totalStudents = meta?.total_siswa || '-';
                const totalTeachers = meta?.total_guru || '-';
                const totalClasses = meta?.total_rombel || meta?.total_kelas || '-';
                const description = eduUnit?.description || 'Unit pendidikan Islam terpadu yang berdedikasi mencetak generasi rabbani berakhlak mulia dan unggul dalam prestasi akademik serta tahfizh Al-Qur\'an.';

                return (
                  <View>
                    {/* Hero Badge Unit */}
                    <View
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 18,
                        borderWidth: 1.5,
                        borderColor: '#CCFBF1',
                        marginBottom: 14,
                        shadowColor: '#0F766E',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.08,
                        shadowRadius: 10,
                        elevation: 3,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <View
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: 16,
                            backgroundColor: '#ECFDF5',
                            borderWidth: 1.5,
                            borderColor: '#A7F3D0',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 14,
                          }}
                        >
                          <MaterialCommunityIcons name="school" size={28} color="#059669" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <View style={{ backgroundColor: '#0D9488', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>{level}</Text>
                            </View>
                            <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ color: '#92400E', fontSize: 10, fontWeight: '800' }}>Akreditasi {accreditation}</Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A', lineHeight: 22 }}>
                            {unitName}
                          </Text>
                          <Text style={{ fontSize: 11.5, color: '#64748B', fontWeight: '600', marginTop: 2 }}>
                            NPSN: {npsn}
                          </Text>
                        </View>
                      </View>

                      {/* Pill Ananda Terkait */}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: '#F8FAFC',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: '#E2E8F0',
                          gap: 6,
                        }}
                      >
                        <MaterialCommunityIcons name="account-check" size={16} color="#0D9488" />
                        <Text style={{ fontSize: 11.5, color: '#334155', fontWeight: '600', flex: 1 }}>
                          Unit belajar dari: <Text style={{ fontWeight: '800', color: '#0F766E' }}>{targetChild.nama_lengkap || targetChild.name}</Text>
                        </Text>
                      </View>
                    </View>

                    {/* 3 Metric Stats */}
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                      <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
                        <MaterialCommunityIcons name="account-group" size={20} color="#2563EB" />
                        <Text style={{ fontSize: 15, fontWeight: '900', color: '#1E293B', marginTop: 4 }}>{totalStudents}</Text>
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>Santri / Siswa</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
                        <MaterialCommunityIcons name="human-male-board" size={20} color="#059669" />
                        <Text style={{ fontSize: 15, fontWeight: '900', color: '#1E293B', marginTop: 4 }}>{totalTeachers}</Text>
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>Guru & Staf</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
                        <MaterialCommunityIcons name="google-classroom" size={20} color="#D97706" />
                        <Text style={{ fontSize: 15, fontWeight: '900', color: '#1E293B', marginTop: 4 }}>{totalClasses}</Text>
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>Rombel / Kelas</Text>
                      </View>
                    </View>

                    {/* Informasi Utama & Kontak */}
                    <View
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 18,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        marginBottom: 14,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 12 }}>
                        Informasi Operasional Unit
                      </Text>

                      <View style={{ gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialCommunityIcons name="account-tie" size={18} color="#2563EB" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Kepala Sekolah / Pimpinan Unit</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B', marginTop: 1 }}>{principal}</Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialCommunityIcons name="clock-outline" size={18} color="#059669" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Program & Jam KBM</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B', marginTop: 1 }}>{program}</Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialCommunityIcons name="phone" size={18} color="#EA580C" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Kontak Telepon / WhatsApp</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B', marginTop: 1 }}>{phone}</Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FAF5FF', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialCommunityIcons name="email-outline" size={18} color="#9333EA" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Email Resmi</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B', marginTop: 1 }}>{email}</Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFF1F2', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialCommunityIcons name="map-marker" size={18} color="#E11D48" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Alamat Kampus</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B', marginTop: 1, lineHeight: 18 }}>{fullLoc}</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Deskripsi & Visi Unit */}
                    <View
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 18,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 8 }}>
                        Profil & Nilai Pendidikan
                      </Text>
                      <Text style={{ fontSize: 12.5, color: '#475569', lineHeight: 19 }}>
                        {description}
                      </Text>
                    </View>
                  </View>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL POP UP TAGIHAN & SPP ANANDA (UNTUK ORANG TUA PADA HALAMAN UTAMA) */}
      <Modal
        visible={showSppModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowSppModal(false)}
      >
        <View style={styles.newsModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowSppModal(false)}
          />

          <View style={[styles.newsModalSheet, { maxHeight: SCREEN_HEIGHT * 0.9 }]}>
            <LinearGradient
              colors={['#065F46', '#047857', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newsModalHeaderGradient}
            >
              <View style={styles.newsHeaderDecorWave} />
              <View style={styles.newsHeaderDecorCircle} />

              <View style={styles.newsModalHeaderRow}>
                <View style={styles.newsModalRoundcubeBtn}>
                  <MaterialCommunityIcons name="cash-multiple" size={20} color="#047857" />
                </View>

                <View style={styles.newsModalTitleCol}>
                  <Text style={styles.newsModalEyebrow}>SISTEM KEUANGAN SIPDEI</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>
                    Tagihan & SPP Ananda
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setShowSppModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Tutup"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#047857" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
              {/* JIKA ANAK LEBIH DARI 1: TAMPILKAN TAB PEMILIH ANANDA */}
              {parentChildren.length > 1 && (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                      Pilih Tagihan Ananda ({parentChildren.length} Ananda)
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                      Ketuk untuk berganti
                    </Text>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {parentChildren.map((ch, cIdx) => {
                      const cid = String(ch.id || ch.student_id);
                      const isSelected = sppSelectedChildId ? cid === sppSelectedChildId : cIdx === 0;
                      const cName = ch.nama_lengkap || ch.name || ch.full_name || `Ananda ${cIdx + 1}`;
                      const cUnit = ch.education_unit?.name || ch.unit_name || ch.kelas?.unit_pendidikan?.name || 'Unit Belajar';

                      return (
                        <TouchableOpacity
                          key={`spp-modal-chip-${cid}`}
                          activeOpacity={0.8}
                          onPress={() => {
                            setSppSelectedChildId(cid);
                            void fetchSppBills(cid);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: isSelected ? '#F0FDF4' : '#FFFFFF',
                            borderRadius: 14,
                            paddingHorizontal: 12,
                            paddingVertical: 9,
                            borderWidth: 1.5,
                            borderColor: isSelected ? '#059669' : '#E2E8F0',
                            gap: 8,
                          }}
                        >
                          <View
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              backgroundColor: isSelected ? '#059669' : '#F1F5F9',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <MaterialCommunityIcons
                              name="account"
                              size={16}
                              color={isSelected ? '#FFFFFF' : '#64748B'}
                            />
                          </View>
                          <View>
                            <Text
                              style={{
                                fontSize: 12.5,
                                fontWeight: isSelected ? '800' : '700',
                                color: isSelected ? '#065F46' : '#1E293B',
                              }}
                              numberOfLines={1}
                            >
                              {cName}
                            </Text>
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '600',
                                color: isSelected ? '#047857' : '#64748B',
                              }}
                              numberOfLines={1}
                            >
                              {String(cUnit).replace(/^Unit\s+/i, '')}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* CARD VIRTUAL ACCOUNT (HANYA VA, TANPA REKENING UMUM) */}
              {(() => {
                const targetChild = parentChildren.find(
                  (c) => String(c.id || c.student_id) === String(sppSelectedChildId)
                ) || parentChildren[0];
                const studentName = targetChild?.nama_lengkap || targetChild?.name || 'Ananda';
                const studentNis = targetChild?.nis || '';
                const cleanNis = String(studentNis).replace(/\D/g, '');
                const vaNumber = sppPaymentInfo?.student_va || (cleanNis ? `9023${cleanNis}` : null);
                const bankName = sppPaymentInfo?.va_bank_name || 'Bank Syariah Indonesia (BSI)';

                if (!vaNumber) return null;

                return (
                  <View
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 18,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: '#A7F3D0',
                      marginBottom: 14,
                      shadowColor: '#047857',
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: 0.08,
                      shadowRadius: 6,
                      elevation: 2,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, gap: 5 }}>
                        <MaterialCommunityIcons name="bank" size={13} color="#047857" />
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#047857' }}>
                          {bankName.toUpperCase()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          Share.share({
                            message: `Nomor Virtual Account ${bankName}\nAnanda: ${studentName}\nNomor VA: ${vaNumber}\nSistem Keuangan SIPDEI Yayasan`,
                          });
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, gap: 4 }}
                      >
                        <MaterialCommunityIcons name="share-variant-outline" size={13} color="#047857" />
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#047857' }}>Bagikan VA</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={{ fontSize: 11.5, color: '#64748B', marginBottom: 4 }}>
                      Nomor VA Ananda: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{studentName}</Text>
                    </Text>

                    <View style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', marginBottom: 8 }}>
                      <Text selectable style={{ fontSize: 18, fontWeight: '900', color: '#004D32', letterSpacing: 2 }}>
                        {vaNumber}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialCommunityIcons name="information-outline" size={13} color="#059669" />
                      <Text style={{ fontSize: 10.5, color: '#059669', flex: 1, lineHeight: 15 }}>
                        Pembayaran via Mobile Banking, ATM BSI, atau transfer antar-bank (Kode 451). Terverifikasi otomatis oleh sistem SIPDEI.
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {/* STATISTIK KPI 3 KARTU */}
              {(() => {
                let totalNominal = 0;
                let paidNominal = 0;
                let unpaidNominal = 0;
                let countPaid = 0;
                let countUnpaid = 0;

                sppBills.forEach((b: any) => {
                  const amt = Number(b.amount || 0);
                  totalNominal += amt;
                  if (String(b.status).toUpperCase() === 'PAID') {
                    paidNominal += amt;
                    countPaid++;
                  } else {
                    unpaidNominal += amt;
                    countUnpaid++;
                  }
                });

                const formatRp = (val: number) =>
                  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

                return (
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                    <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 10, borderRadius: 14, borderWidth: 1, borderColor: '#A7F3D0', alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B' }}>Total Tagihan</Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '900', color: '#004D32', marginTop: 2 }}>
                        {formatRp(totalNominal)}
                      </Text>
                      <Text style={{ fontSize: 9.5, color: '#059669', marginTop: 1 }}>{sppBills.length} pos</Text>
                    </View>

                    <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 10, borderRadius: 14, borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B' }}>Sudah Lunas</Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '900', color: '#1D4ED8', marginTop: 2 }}>
                        {formatRp(paidNominal)}
                      </Text>
                      <Text style={{ fontSize: 9.5, color: '#2563EB', marginTop: 1 }}>{countPaid} lunas</Text>
                    </View>

                    <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 10, borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B' }}>Sisa Belum Lunas</Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '900', color: '#B45309', marginTop: 2 }}>
                        {formatRp(unpaidNominal)}
                      </Text>
                      <Text style={{ fontSize: 9.5, color: '#D97706', marginTop: 1 }}>{countUnpaid} menunggu</Text>
                    </View>
                  </View>
                );
              })()}

              {/* FILTER CHIPS (SEMUA, BELUM LUNAS, LUNAS) */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {[
                  { id: 'all', label: 'Semua' },
                  { id: 'unpaid', label: 'Belum Lunas' },
                  { id: 'paid', label: 'Lunas' },
                ].map((item) => {
                  const isActive = sppFilter === item.id;
                  return (
                    <TouchableOpacity
                      key={`spp-flt-${item.id}`}
                      activeOpacity={0.8}
                      onPress={() => setSppFilter(item.id as any)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 10,
                        backgroundColor: isActive ? '#004D32' : '#F1F5F9',
                        borderWidth: 1,
                        borderColor: isActive ? '#004D32' : '#E2E8F0',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isActive ? '#FFFFFF' : '#64748B' }}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* LIST TAGIHAN ATAU EMPTY STATE */}
              {sppLoading ? (
                <View style={{ padding: 30, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#059669" size="large" />
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 10 }}>
                    Memeriksa data tagihan dari server SIPDEI...
                  </Text>
                </View>
              ) : (() => {
                const filtered = sppBills.filter((b: any) => {
                  const st = String(b.status || 'UNPAID').toUpperCase();
                  if (sppFilter === 'unpaid') return st === 'UNPAID';
                  if (sppFilter === 'paid') return st === 'PAID';
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <View
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 18,
                        padding: 24,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      <View
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          backgroundColor: '#ECFDF5',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 12,
                        }}
                      >
                        <MaterialCommunityIcons name="receipt-text-outline" size={30} color="#059669" />
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>
                        Belum Ada Tagihan di SIPDEI
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', lineHeight: 18 }}>
                        {sppFilter === 'unpaid'
                          ? 'Alhamdulillah, tidak ada tagihan tertunggak pada sistem SIPDEI.'
                          : 'Data tagihan resmi belum diterbitkan pada sistem keuangan SIPDEI untuk ananda saat ini.'}
                      </Text>
                    </View>
                  );
                }

                const formatRp = (val: number) =>
                  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

                return (
                  <View style={{ gap: 10 }}>
                    {filtered.map((b: any, bIdx: number) => {
                      const isPaid = String(b.status).toUpperCase() === 'PAID';
                      return (
                        <View
                          key={String(b.id || bIdx)}
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: 16,
                            padding: 14,
                            borderWidth: 1.5,
                            borderColor: isPaid ? '#A7F3D0' : '#FED7AA',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.05,
                            shadowRadius: 3,
                            elevation: 1,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#047857' }}>
                                  {b.fee_category?.name || 'SPP'}
                                </Text>
                              </View>
                              <View style={{ backgroundColor: '#F0FDF4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <MaterialCommunityIcons name="check-decagram" size={10} color="#047857" />
                                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#047857' }}>SIPDEI</Text>
                              </View>
                            </View>

                            <View
                              style={{
                                backgroundColor: isPaid ? '#ECFDF5' : '#FFF7ED',
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 8,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <MaterialCommunityIcons
                                name={isPaid ? 'check-decagram' : 'clock-outline'}
                                size={12}
                                color={isPaid ? '#047857' : '#EA580C'}
                              />
                              <Text style={{ fontSize: 10, fontWeight: '800', color: isPaid ? '#047857' : '#EA580C' }}>
                                {isPaid ? 'LUNAS' : 'BELUM LUNAS'}
                              </Text>
                            </View>
                          </View>

                          <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0F172A', marginTop: 4 }}>
                            {b.title}
                          </Text>

                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                            <Text style={{ fontSize: 11, color: '#64748B' }}>
                              Jatuh tempo: {b.due_date ? String(b.due_date).substring(0, 10) : '-'}
                            </Text>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: '#004D32' }}>
                              {formatRp(Number(b.amount || 0))}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL POP UP PUSAT BANTUAN & LAYANAN TERPADU */}
      <Modal
        visible={showHelpModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowHelpModal(false)}
      >
        <View style={styles.newsModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowHelpModal(false)}
          />

          <View style={[styles.newsModalSheet, { maxHeight: SCREEN_HEIGHT * 0.9 }]}>
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newsModalHeaderGradient}
            >
              <View style={styles.newsHeaderDecorWave} />
              <View style={styles.newsHeaderDecorCircle} />

              <View style={styles.newsModalHeaderRow}>
                <View style={styles.newsModalRoundcubeBtn}>
                  <MaterialCommunityIcons name="lifebuoy" size={20} color="#047857" />
                </View>

                <View style={styles.newsModalTitleCol}>
                  <Text style={styles.newsModalEyebrow}>LAYANAN PENGADUAN & DUKUNGAN</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>
                    Pusat Bantuan Terpadu
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setShowHelpModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Tutup"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#047857" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
              {/* KARTU KONTAK UTAMA HELPDESK */}
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1.5,
                  borderColor: '#A7F3D0',
                  marginBottom: 16,
                  shadowColor: '#047857',
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.08,
                  shadowRadius: 6,
                  elevation: 2,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name="headset" size={24} color="#047857" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                      Layanan Bantuan & Customer Care
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                      Yayasan & Unit Pendidikan Dar El-Iman
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: '#334155', lineHeight: 18, marginBottom: 12 }}>
                  Memerlukan bantuan terkait administrasi sekolah, pembayaran SPP, kendala akun, atau informasi kepulangan santri? Tim kami siap melayani Anda.
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    Linking.openURL('https://wa.me/6281212345678?text=Halo%20Admin%20Sekolah%20Terpadu,%20saya%20orang%20tua%20siswa%20ingin%20bertanya%20terkait:');
                  }}
                  style={{
                    backgroundColor: '#004D32',
                    borderRadius: 12,
                    paddingVertical: 11,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <MaterialCommunityIcons name="whatsapp" size={18} color="#FFFFFF" />
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' }}>
                    Hubungi WhatsApp Call Center
                  </Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="clock-outline" size={12} color="#64748B" />
                  <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                    Senin – Jum'at: 07.30 – 16.00 WIB
                  </Text>
                </View>
              </View>

              {/* SALURAN BANTUAN UNIT SEKOLAH */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 10 }}>
                  Kontak Layanan Unit Pendidikan
                </Text>

                <View style={{ gap: 8 }}>
                  {((Array.isArray((mobileConfig as any)?.education_units) && (mobileConfig as any).education_units.length > 0)
                    ? (mobileConfig as any).education_units.map((u: any, uIdx: number) => {
                        const palette = [
                          { icon: 'school-outline', color: '#F59E0B' },
                          { icon: 'book-open-page-variant', color: '#10B981' },
                          { icon: 'account-school', color: '#0284C7' },
                          { icon: 'mosque', color: '#6366F1' },
                          { icon: 'domain', color: '#EC4899' },
                        ];
                        const styleItem = palette[uIdx % palette.length];
                        return {
                          name: u.name,
                          phone: u.phone || mobileConfig?.branding?.contact?.phone || '08116661141',
                          icon: styleItem.icon,
                          color: styleItem.color,
                        };
                      })
                    : [
                        { name: 'TKIT Dar El-Iman', phone: mobileConfig?.branding?.contact?.phone || '08116661141', icon: 'school-outline', color: '#F59E0B' },
                        { name: 'SDIT 01 & 02 Dar El-Iman', phone: mobileConfig?.branding?.contact?.phone || '08116661141', icon: 'book-open-page-variant', color: '#10B981' },
                        { name: 'SMPIT Dar El-Iman', phone: mobileConfig?.branding?.contact?.phone || '08116661141', icon: 'account-school', color: '#0284C7' },
                        { name: 'SMAIT & Ponpes Dar El-Iman', phone: mobileConfig?.branding?.contact?.phone || '08116661141', icon: 'mosque', color: '#6366F1' },
                      ]
                  ).map((unit: any, uIdx: number) => (
                    <TouchableOpacity
                      key={`unit-contact-${uIdx}`}
                      activeOpacity={0.8}
                      onPress={() => {
                        const cleanNum = String(unit.phone).replace(/\D/g, '').replace(/^0/, '62');
                        const waUrl = `whatsapp://send?phone=${cleanNum}&text=${encodeURIComponent(`Assalamu'alaikum Admin ${unit.name}`)}`;
                        const webWaUrl = `https://wa.me/${cleanNum}?text=${encodeURIComponent(`Assalamu'alaikum Admin ${unit.name}`)}`;
                        void (async () => {
                          try {
                            const can = await Linking.canOpenURL(waUrl);
                            if (can) {
                              await Linking.openURL(waUrl);
                            } else {
                              await Linking.openURL(webWaUrl);
                            }
                          } catch {
                            // Fallback
                          }
                        })();
                      }}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 14,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons name={unit.icon as any} size={18} color={unit.color} />
                        </View>
                        <View>
                          <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#1E293B' }}>{unit.name}</Text>
                          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>{unit.phone}</Text>
                        </View>
                      </View>
                      <View style={{ backgroundColor: '#ECFDF5', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialCommunityIcons name="whatsapp" size={16} color="#059669" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* PERTANYAAN POPULER / FAQ */}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 10 }}>
                  Pertanyaan Sering Diajukan (FAQ)
                </Text>

                <View style={{ gap: 8 }}>
                  {[
                    {
                      q: 'Bagaimana cara membayar SPP ananda?',
                      a: 'Pembayaran dilakukan menggunakan nomor Virtual Account (VA) Bank Syariah Indonesia (BSI) khusus ananda. Buka menu Info SPP untuk melihat nomor VA dan instruksi transfer.',
                    },
                    {
                      q: 'Kapan data presensi dan nilai rapor diperbarui?',
                      a: 'Presensi gerbang terhubung otomatis saat ananda tap kartu di gerbang, sedangkan presensi kelas dan nilai diperbarui secara langsung setelah guru mengisi jurnal harian.',
                    },
                    {
                      q: 'Bagaimana cara mengajukan izin santri asrama?',
                      a: 'Orang tua dapat mengajukan izin kepulangan melalui menu Izin Santri pada Beranda, lalu menunggu verifikasi digital dari musyrif kamar dan kesantrian.',
                    },
                    {
                      q: 'Bagaimana jika nama anak atau nomor WhatsApp salah?',
                      a: 'Silakan hubungi staf Tata Usaha unit sekolah ananda melalui kontak WhatsApp di atas untuk pembaruan biodata pada database pokok sekolah.',
                    },
                  ].map((faq, fIdx) => (
                    <View
                      key={`faq-card-${fIdx}`}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 14,
                        padding: 13,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                        <MaterialCommunityIcons name="help-circle-outline" size={16} color="#047857" style={{ marginTop: 1 }} />
                        <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0F172A', flex: 1 }}>
                          {faq.q}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11.5, color: '#475569', lineHeight: 17, marginLeft: 24 }}>
                        {faq.a}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* TOMBOL TUTUP MODAL */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowHelpModal(false)}
                style={{
                  backgroundColor: '#F1F5F9',
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#475569' }}>
                  Tutup Pusat Bantuan
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL POP UP NOTIFIKASI & WARTA TERPADU SELURUH UNIT ANANDA */}
      <Modal
        visible={showNotificationModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowNotificationModal(false)}
      >
        <View style={styles.newsModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowNotificationModal(false)}
          />

          <View style={[styles.newsModalSheet, { maxHeight: SCREEN_HEIGHT * 0.9 }]}>
            <LinearGradient
              colors={['#065F46', '#047857', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newsModalHeaderGradient}
            >
              <View style={styles.newsHeaderDecorWave} />
              <View style={styles.newsHeaderDecorCircle} />

              <View style={styles.newsModalHeaderRow}>
                <View style={styles.newsModalRoundcubeBtn}>
                  <MaterialCommunityIcons name="bell-ring-outline" size={20} color="#047857" />
                </View>

                <View style={styles.newsModalTitleCol}>
                  <Text style={styles.newsModalEyebrow}>PENGUMUMAN & WARTA RESMI</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>
                    Notifikasi Sekolah Ananda
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setShowNotificationModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Tutup"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#047857" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {/* ACTION TOOLBAR: BACA SEMUA & HAPUS NOTIFIKASI */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 12,
                backgroundColor: '#F8FAFC',
                borderBottomWidth: 1,
                borderBottomColor: '#E2E8F0',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <MaterialCommunityIcons name="information-outline" size={14} color="#047857" />
                <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>
                  {accessibleChildUnits.length > 1
                    ? `Terhubung ${accessibleChildUnits.length} Unit Sekolah`
                    : 'Informasi Unit Sekolah Ananda'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                {/* TOMBOL BACA SEMUA */}
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => {
                    const allIds = unitFilteredAnnouncements.map((a: any) => String(a.id));
                    setReadNotificationIds((prev) => Array.from(new Set([...prev, ...allIds])));
                    setUnreadNotificationCount(0);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#ECFDF5',
                    borderRadius: 9,
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderWidth: 1,
                    borderColor: '#A7F3D0',
                    gap: 4,
                  }}
                >
                  <MaterialCommunityIcons name="check-all" size={13} color="#047857" />
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#047857' }}>
                    Baca Semua
                  </Text>
                </TouchableOpacity>

                {/* TOMBOL HAPUS NOTIFIKASI */}
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => {
                    const allIds = unitFilteredAnnouncements.map((a: any) => String(a.id));
                    setDismissedNotificationIds((prev) => Array.from(new Set([...prev, ...allIds])));
                    setUnreadNotificationCount(0);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#FFF1F2',
                    borderRadius: 9,
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderWidth: 1,
                    borderColor: '#FECDD3',
                    gap: 4,
                  }}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={13} color="#E11D48" />
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#E11D48' }}>
                    Hapus
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* TAB FILTER UNIT ANANDA (JIKA LEBIH DARI 1 UNIT) */}
            {accessibleChildUnits.length > 1 && (
              <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setNotificationUnitFilter('all')}
                    style={{
                      paddingHorizontal: 11,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: notificationUnitFilter === 'all' ? '#004D32' : '#F1F5F9',
                      borderWidth: 1,
                      borderColor: notificationUnitFilter === 'all' ? '#004D32' : '#E2E8F0',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: notificationUnitFilter === 'all' ? '#FFFFFF' : '#64748B' }}>
                      Semua Unit ({accessibleChildUnits.length})
                    </Text>
                  </TouchableOpacity>

                  {accessibleChildUnits.map((u) => {
                    const isSelected = notificationUnitFilter === u.name;
                    return (
                      <TouchableOpacity
                        key={`notif-unit-filter-${u.id || u.name}`}
                        activeOpacity={0.8}
                        onPress={() => setNotificationUnitFilter(u.name)}
                        style={{
                          paddingHorizontal: 11,
                          paddingVertical: 6,
                          borderRadius: 10,
                          backgroundColor: isSelected ? '#004D32' : '#F1F5F9',
                          borderWidth: 1,
                          borderColor: isSelected ? '#004D32' : '#E2E8F0',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: isSelected ? '#FFFFFF' : '#64748B' }}>
                          {u.name.replace(/^Unit\s+/i, '')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
              {(() => {
                const activeList = unitFilteredAnnouncements.filter((item: any) => {
                  const itemId = String(item.id);
                  if (dismissedNotificationIds.includes(itemId)) return false;

                  if (notificationUnitFilter !== 'all') {
                    const uLabel = resolveNewsUnitLabel(item).toLowerCase();
                    const targetU = notificationUnitFilter.toLowerCase();
                    if (!uLabel.includes(targetU) && !targetU.includes(uLabel)) return false;
                  }

                  return true;
                });

                if (activeList.length === 0) {
                  return (
                    <View
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 18,
                        padding: 28,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        marginTop: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          backgroundColor: '#ECFDF5',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 12,
                        }}
                      >
                        <MaterialCommunityIcons name="bell-check-outline" size={30} color="#059669" />
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>
                        Tidak Ada Notifikasi Baru
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', lineHeight: 18 }}>
                        Alhamdulillah, seluruh warta dan pengumuman unit sekolah ananda telah dibaca atau dibersihkan.
                      </Text>
                    </View>
                  );
                }

                return (
                  <View style={{ gap: 10 }}>
                    {activeList.map((item: any, idx: number) => {
                      const itemId = String(item.id || idx);
                      const isRead = readNotificationIds.includes(itemId);
                      const title = titleOf(item);
                      const rawExcerpt = subtitleOf(item);
                      const excerpt = stripHtmlAndClean(rawExcerpt) || 'Ketuk untuk membaca warta dan pengumuman sekolah selengkapnya.';
                      const rawDate = item.created_at || item.published_at || item.date;
                      const formattedDate = rawDate
                        ? new Date(rawDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Baru saja';
                      const unitLabel = resolveNewsUnitLabel(item);

                      return (
                        <TouchableOpacity
                          key={`notif-card-${itemId}`}
                          activeOpacity={0.88}
                          onPress={() => {
                            setReadNotificationIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
                            setShowNotificationModal(false);
                            setSelectedNews({ ...item, _index: idx });
                          }}
                          style={{
                            backgroundColor: isRead ? '#FFFFFF' : '#F0FDF4',
                            borderRadius: 16,
                            padding: 14,
                            borderWidth: 1.5,
                            borderColor: isRead ? '#E2E8F0' : '#A7F3D0',
                            shadowColor: '#004D32',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: isRead ? 0.03 : 0.08,
                            shadowRadius: 4,
                            elevation: 1,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {!isRead && (
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#059669' }} />
                              )}
                              <View
                                style={{
                                  backgroundColor: '#ECFDF5',
                                  paddingHorizontal: 8,
                                  paddingVertical: 2.5,
                                  borderRadius: 6,
                                  borderWidth: 0.5,
                                  borderColor: '#A7F3D0',
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#047857' }}>
                                  {unitLabel}
                                </Text>
                              </View>
                            </View>

                            <Text style={{ fontSize: 10.5, color: '#64748B', fontWeight: '600' }}>
                              {formattedDate}
                            </Text>
                          </View>

                          <Text
                            numberOfLines={2}
                            style={{
                              fontSize: 13,
                              fontWeight: isRead ? '700' : '900',
                              color: isRead ? '#334155' : '#065F46',
                              lineHeight: 18,
                              marginBottom: 4,
                            }}
                          >
                            {title}
                          </Text>

                          <Text
                            numberOfLines={2}
                            style={{
                              fontSize: 11.5,
                              color: isRead ? '#64748B' : '#334155',
                              lineHeight: 16,
                            }}
                          >
                            {excerpt}
                          </Text>

                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, gap: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#047857' }}>
                              Baca Warta
                            </Text>
                            <MaterialCommunityIcons name="chevron-right" size={14} color="#047857" />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowNotificationModal(false)}
                style={{
                  backgroundColor: '#F1F5F9',
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 16,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#475569' }}>
                  Tutup Notifikasi
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL LIHAT SEMUA BERITA & INFORMASI (NON-FULLSCREEN) */}
      <Modal
        visible={showAllNews}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowAllNews(false)}
      >
        <View style={styles.newsModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAllNews(false)}
          />

          <View style={styles.newsModalSheet}>
            <LinearGradient
              colors={['#0D6B42', '#18A165', '#2BD988']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newsModalHeaderGradient}
            >
              <View style={styles.newsHeaderDecorWave} />
              <View style={styles.newsHeaderDecorCircle} />

              <View style={styles.newsModalHeaderRow}>
                <TouchableOpacity
                  onPress={() => setShowAllNews(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Kembali"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="arrow-left" size={20} color="#18A165" />
                </TouchableOpacity>

                <View style={styles.newsModalTitleCol}>
                  <Text style={styles.newsModalEyebrow}>ARSIP WARTA TERPADU</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>
                    Warta Seluruh Unit Ananda
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setShowAllNews(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Tutup"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#18A165" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView contentContainerStyle={styles.allNewsListContainer} showsVerticalScrollIndicator={false}>
              <View style={styles.allNewsHeaderBox}>
                <Text style={styles.allNewsHeaderTitle}>Warta Seluruh Unit Pendidikan Ananda</Text>
                <Text style={styles.allNewsHeaderSub}>
                  Pembaruan warta resmi, agenda akademik, dan pengumuman dari seluruh unit pendidikan ananda.
                </Text>
              </View>

              {unitFilteredAnnouncements.length === 0 ? (
                <View style={[styles.homeWidgetEmptyRow, { padding: 24, backgroundColor: '#FFFFFF', borderRadius: 16 }]}>
                  <View style={[styles.homeWidgetEmptyIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons name="newspaper-variant-outline" size={24} color="#004D32" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.homeWidgetEmptyTitle}>Belum Ada Arsip Warta</Text>
                    <Text style={styles.homeWidgetEmptySubtitle}>
                      Seluruh berita dan warta dari unit pendidikan ananda akan terangkum di sini.
                    </Text>
                  </View>
                </View>
              ) : (
                unitFilteredAnnouncements.map((item: any, idx: number) => {
                  const itemDate = item.created_at || item.published_at || item.date
                    ? new Date(item.created_at || item.published_at || item.date).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Terbaru';
                  const meta = item?.data_tambahan || {};
                  const catLabel = item.kategori || meta.kategori || item.category || 'Warta';
                  const unitLabel = resolveNewsUnitLabel(item);
                  const rawThumb = item.cover || item.image_url || item.gambar_url || meta.gambar_url || meta.cover;

                  return (
                    <TouchableOpacity
                      key={String(item.id || idx)}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedNews({ ...item, _index: idx });
                      }}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 18,
                        padding: 16,
                        marginBottom: 12,
                        borderWidth: 1.2,
                        borderColor: '#E2E8F0',
                        borderLeftWidth: 4,
                        borderLeftColor: '#059669',
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.04,
                        shadowRadius: 6,
                        elevation: 2,
                      }}
                    >
                      {/* Top Badges: Category & Unit */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                          <View
                            style={{
                              backgroundColor: '#004D32',
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                            }}
                          >
                            <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#FFFFFF' }}>{String(catLabel).toUpperCase()}</Text>
                          </View>
                          <View
                            style={{
                              backgroundColor: '#F0FDF4',
                              borderWidth: 1,
                              borderColor: '#DCFCE7',
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                              maxWidth: '70%',
                            }}
                          >
                            <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '700', color: '#047857' }}>{unitLabel}</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <MaterialCommunityIcons name="calendar-outline" size={12} color="#94A3B8" />
                          <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                            {itemDate}
                          </Text>
                        </View>
                      </View>

                      {/* Optional Thumbnail */}
                      {rawThumb ? (
                        <View style={{ width: '100%', height: 130, backgroundColor: '#F1F5F9', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
                          <Image
                            source={getNewsThumbnail(item, idx)}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                          />
                        </View>
                      ) : null}

                      <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#0F172A', marginBottom: 6, lineHeight: 20 }}>
                        {titleOf(item)}
                      </Text>
                      <Text numberOfLines={3} style={{ fontSize: 12, color: '#475569', lineHeight: 18, marginBottom: 12 }}>
                        {subtitleOf(item)}
                      </Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: '#ECFDF5',
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: '#BBF7D0',
                            gap: 4,
                          }}
                        >
                          <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#047857' }}>Baca Selengkapnya</Text>
                          <MaterialCommunityIcons name="arrow-right" size={14} color="#047857" />
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={18} color="#CBD5E1" />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DETAIL BERITA MODAL (NON-FULLSCREEN BOTTOM SHEET DENGAN HEADER KALENDER) */}
      <Modal
        visible={Boolean(selectedNews)}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setSelectedNews(null)}
      >
        <View style={styles.newsModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setSelectedNews(null)}
          />

          <View style={styles.newsModalSheet}>
            <LinearGradient
              colors={['#0D6B42', '#18A165', '#2BD988']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newsModalHeaderGradient}
            >
              <View style={styles.newsHeaderDecorWave} />
              <View style={styles.newsHeaderDecorCircle} />

              <View style={styles.newsModalHeaderRow}>
                <TouchableOpacity
                  onPress={() => setSelectedNews(null)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Kembali"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="arrow-left" size={20} color="#18A165" />
                </TouchableOpacity>

                <View style={styles.newsModalTitleCol}>
                  <Text style={styles.newsModalEyebrow}>INFORMASI SEKOLAH</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>
                    {titleOf(selectedNews || {})}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedNews(null)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Tutup"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#18A165" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Cover Image Identical to Card Thumbnail (Fit Tanpa Terpotong) */}
              <View style={[styles.modalNewsCoverBox, { borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: '#A7F3D0', marginBottom: 14, backgroundColor: '#F8FAFC' }]}>
                <Image
                  source={getNewsThumbnail(selectedNews, selectedNews?._index ?? 0)}
                  style={styles.modalNewsCoverImage}
                  resizeMode="contain"
                />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#059669',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 10,
                    gap: 5,
                  }}
                >
                  <MaterialCommunityIcons name="bullhorn" size={13} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>Warta & Pengumuman</Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F0FDF4',
                    borderWidth: 1,
                    borderColor: '#BBF7D0',
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 10,
                    gap: 5,
                  }}
                >
                  <MaterialCommunityIcons name="calendar-blank-outline" size={13} color="#059669" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>
                    {selectedNews?.created_at
                      ? new Date(selectedNews.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : 'Informasi Resmi Sekolah'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.modalMainTitle, { fontSize: 18, fontWeight: '900', color: '#064E3B', lineHeight: 24, marginBottom: 12 }]}>
                {titleOf(selectedNews || {})}
              </Text>

              <View
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderLeftWidth: 4,
                  borderLeftColor: '#10B981',
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 13.5, color: '#334155', lineHeight: 22 }}>
                  {selectedNews?.isi_pengumuman ||
                    selectedNews?.isi ||
                    subtitleOf(selectedNews || {}) ||
                    'Kegiatan belajar mengajar dan operasional sekolah mengikuti agenda terpadu yang telah ditetapkan.'}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL SEMUA MENU */}
      <Modal
        visible={showAllMenusModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAllMenusModal(false)}
      >
        <View style={[styles.qrModalBackdrop, { justifyContent: 'flex-end', padding: 0 }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAllMenusModal(false)}
          />
          <View style={styles.allMenusModalContent}>
            <View style={styles.allMenusModalHeader}>
              <View>
                <Text style={styles.allMenusModalTitle}>Semua Menu</Text>
                <Text style={styles.allMenusModalSub}>Pilih layanan & modul sistem terpadu</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAllMenusModal(false)}
                style={styles.allMenusModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.allMenusGridScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.allMenusGrid}>
                {roleMenus.map(([label, icon, color, bgPastel, route], idx) => (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.75}
                    style={styles.allMenusItem}
                    onPress={() => {
                      setShowAllMenusModal(false);
                      const tabKey = (roleMenus[idx] as any)?.[5];
                      handleMenuNavigation(String(route), tabKey ? String(tabKey) : undefined);
                    }}
                  >
                    <View style={[styles.allMenusSolidSquircle, { backgroundColor: String(color) }]}>
                      <MaterialCommunityIcons name={String(icon) as any} size={22} color="#FFFFFF" />
                    </View>
                    <Text numberOfLines={2} style={styles.allMenusItemLabel}>
                      {String(label)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL: Tugas Terbaru                                         */}
      {/* ============================================================ */}
      <Modal
        visible={showTugasModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowTugasModal(false)}
      >
        <View style={styles.newsModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowTugasModal(false)}
          />
          <View style={styles.newsModalSheet}>
            {/* Header Gradient — ungu untuk Tugas */}
            <LinearGradient
              colors={['#4C1D95', '#7C3AED', '#A78BFA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newsModalHeaderGradient}
            >
              <View style={styles.newsHeaderDecorWave} />
              <View style={styles.newsHeaderDecorCircle} />
              <View style={styles.newsModalHeaderRow}>
                <TouchableOpacity
                  onPress={() => setShowTugasModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Kembali"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="arrow-left" size={20} color="#7C3AED" />
                </TouchableOpacity>
                <View style={styles.newsModalTitleCol}>
                  <Text style={styles.newsModalEyebrow}>PORTAL AKADEMIK · LMS</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>Tugas Terbaru</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowTugasModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Tutup"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#7C3AED" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView
              contentContainerStyle={styles.allNewsListContainer}
              showsVerticalScrollIndicator={false}
            >
              {/* Subheader */}
              <View style={styles.allNewsHeaderBox}>
                <Text style={styles.allNewsHeaderTitle}>Daftar Tugas Aktif</Text>
                <Text style={styles.allNewsHeaderSub}>
                  Tugas yang diberikan guru dan perlu dikumpulkan sesuai deadline.
                </Text>
              </View>

              {loadingHomeWidgets && homeAssignments.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <ActivityIndicator size="large" color="#7C3AED" />
                  <Text style={{ color: '#64748B', fontWeight: '600', marginTop: 12 }}>
                    Memuat tugas aktif...
                  </Text>
                </View>
              ) : homeAssignments.length === 0 ? (
                <EmptyStateCard
                  icon="check-circle-outline"
                  title="Tidak Ada Tugas Aktif"
                  description="Semua tugas dan tagihan belajar telah selesai dikerjakan."
                  compact
                />
              ) : (
                homeAssignments.map((item: any, idx: number) => {
                  const subjectName = item?.subject?.name ?? item?.subject?.nama_mapel ?? item?.mata_pelajaran ?? item?.subject_name ?? '';
                  const taskTitle = item?.judul_tugas ?? item?.judul ?? item?.title ?? item?.nama_tugas ?? 'Tugas';
                  const taskDesc = item?.deskripsi ?? item?.instruksi ?? item?.description ?? '';
                  const deadline = item?.deadline ?? item?.tenggat_waktu ?? item?.due_date;
                  const deadlineFormatted = deadline
                    ? new Date(deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : null;
                  const teacher = item?.teacher?.nama_lengkap ?? item?.teacher?.name ?? item?.guru?.nama_lengkap ?? item?.guru?.nama ?? item?.teacher_name ?? null;
                  const submission = Array.isArray(item?.pengumpulanTugas) && item.pengumpulanTugas.length > 0 ? item.pengumpulanTugas[0]
                    : Array.isArray(item?.pengumpulan_tugas) && item.pengumpulan_tugas.length > 0 ? item.pengumpulan_tugas[0]
                    : item?.submission ?? null;
                  const isGraded = submission && (submission.status === 'dinilai' || submission.status === 'graded' || (submission.nilai_guru !== null && submission.nilai_guru !== undefined));
                  const isSubmitted = submission && ['dikumpulkan', 'submitted', 'revisi'].includes(submission.status);
                  const isLate = !isSubmitted && !isGraded && deadline && new Date(deadline) < new Date();
                  const statusLabel = isGraded ? 'Dinilai' : isSubmitted ? 'Sudah Dikumpulkan' : isLate ? 'Terlambat' : 'Belum Dikumpulkan';
                  const statusColor = isGraded ? '#059669' : isSubmitted ? '#2563EB' : isLate ? '#DC2626' : '#D97706';
                  const statusBg = isGraded ? '#ECFDF5' : isSubmitted ? '#EFF6FF' : isLate ? '#FEF2F2' : '#FFFBEB';
                  const score = submission?.nilai_guru ?? submission?.nilai ?? null;
                  const teacherNote = submission?.catatan_guru ?? submission?.catatan ?? null;

                  return (
                    <TouchableOpacity
                      key={String(item.id || idx)}
                      activeOpacity={0.88}
                      onPress={() => {
                        setShowTugasModal(false);
                        navigation.navigate('Tugas', {
                          child_id: parent && activeChildId ? String(activeChildId) : undefined,
                          student_id: parent && activeChildId ? String(activeChildId) : undefined,
                        });
                      }}
                      style={styles.allNewsCard}
                    >
                      <View style={styles.allNewsCardTopRow}>
                        {subjectName ? (
                          <View style={[styles.newsTagBadge, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                            <MaterialCommunityIcons name="clipboard-text" size={11} color="#7C3AED" style={{ marginRight: 4 }} />
                            <Text style={[styles.newsTagText, { color: '#7C3AED' }]}>{subjectName}</Text>
                          </View>
                        ) : (
                          <View style={[styles.newsTagBadge, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                            <MaterialCommunityIcons name="clipboard-text" size={11} color="#7C3AED" style={{ marginRight: 4 }} />
                            <Text style={[styles.newsTagText, { color: '#7C3AED' }]}>Tugas LMS</Text>
                          </View>
                        )}
                        <View style={[styles.newsTagBadge, { backgroundColor: statusBg }]}>
                          <Text style={[styles.newsTagText, { color: statusColor }]}>{statusLabel}</Text>
                        </View>
                      </View>

                      <Text style={styles.allNewsTitle}>{taskTitle}</Text>

                      {taskDesc ? (
                        <Text numberOfLines={2} style={[styles.allNewsSnippet, { marginBottom: 8 }]}>
                          {taskDesc}
                        </Text>
                      ) : null}

                      <View style={{ gap: 4, marginTop: 2 }}>
                        {teacher ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialCommunityIcons name="account-tie" size={13} color="#94A3B8" style={{ marginRight: 5 }} />
                            <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '500' }}>{teacher}</Text>
                          </View>
                        ) : null}

                        {deadlineFormatted ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialCommunityIcons
                              name="clock-outline"
                              size={13}
                              color={isLate ? '#DC2626' : '#64748B'}
                              style={{ marginRight: 5 }}
                            />
                            <Text style={{ fontSize: 12, color: isLate ? '#DC2626' : '#64748B', fontWeight: '500' }}>
                              {isLate ? 'Terlambat · ' : 'Deadline: '}{deadlineFormatted}
                            </Text>
                          </View>
                        ) : null}

                        {score !== null && score !== undefined && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <MaterialCommunityIcons name="star-circle" size={15} color="#059669" style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#059669' }}>
                              Nilai: {score}
                            </Text>
                          </View>
                        )}

                        {teacherNote ? (
                          <View style={{ backgroundColor: '#F0FDF4', borderRadius: 8, padding: 8, marginTop: 4, borderWidth: 1, borderColor: '#DCFCE7' }}>
                            <Text style={{ fontSize: 11, color: '#166534', fontWeight: '600' }}>
                              Catatan: {teacherNote}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C3AED', marginRight: 4 }}>
                          {isSubmitted || isGraded ? 'Lihat Detail' : 'Buka & Kerjakan'}
                        </Text>
                        <MaterialCommunityIcons name="chevron-right" size={15} color="#7C3AED" />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}

              {/* Tombol lihat semua di AssignmentScreen */}
              <TouchableOpacity
                style={styles.allNewsReadMoreRow}
                activeOpacity={0.8}
                onPress={() => {
                  setShowTugasModal(false);
                  navigation.navigate('Tugas', parent && activeChildId ? { child_id: String(activeChildId), student_id: String(activeChildId) } : undefined);
                }}
              >
                <Text style={[styles.allNewsReadMoreText, { color: '#7C3AED' }]}>Lihat Semua Tugas</Text>
                <MaterialCommunityIcons name="arrow-right" size={15} color="#7C3AED" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL: Jadwal Hari Ini                                       */}
      {/* ============================================================ */}
      <Modal
        visible={showJadwalModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowJadwalModal(false)}
      >
        <View style={styles.newsModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowJadwalModal(false)}
          />
          <View style={styles.newsModalSheet}>
            {/* Header Gradient — biru untuk Jadwal */}
            <LinearGradient
              colors={['#1E3A8A', '#2563EB', '#60A5FA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newsModalHeaderGradient}
            >
              <View style={styles.newsHeaderDecorWave} />
              <View style={styles.newsHeaderDecorCircle} />
              <View style={styles.newsModalHeaderRow}>
                <TouchableOpacity
                  onPress={() => setShowJadwalModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Kembali"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="arrow-left" size={20} color="#2563EB" />
                </TouchableOpacity>
                <View style={styles.newsModalTitleCol}>
                  <Text style={styles.newsModalEyebrow}>AKADEMIK · HARI INI</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>
                    {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowJadwalModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Tutup"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#2563EB" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView
              contentContainerStyle={styles.allNewsListContainer}
              showsVerticalScrollIndicator={false}
            >
              {/* Subheader */}
              <View style={styles.allNewsHeaderBox}>
                <Text style={styles.allNewsHeaderTitle}>Jadwal Pelajaran</Text>
                <Text style={styles.allNewsHeaderSub}>
                  Daftar sesi belajar lengkap untuk hari ini beserta status presensi.
                </Text>
              </View>

              {(() => {
                const todayItems: any[] = Array.isArray(homeSchedule?.today_schedules)
                  ? homeSchedule.today_schedules
                  : Array.isArray(homeSchedule?.data?.today_schedules)
                  ? homeSchedule.data.today_schedules
                  : [];

                if (loadingHomeWidgets && todayItems.length === 0) {
                  return (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <ActivityIndicator size="large" color="#2563EB" />
                      <Text style={{ color: '#64748B', fontWeight: '600', marginTop: 12 }}>
                        Memuat jadwal hari ini...
                      </Text>
                    </View>
                  );
                }

                if (todayItems.length === 0) {
                  return (
                    <EmptyStateCard
                      icon="calendar-blank-outline"
                      title="Tidak Ada Jadwal Hari Ini"
                      description="Tidak ada kegiatan belajar mengajar terjadwal untuk hari ini."
                      compact
                    />
                  );
                }

                return todayItems.map((s: any, idx: number) => {
                  const isOngoing = Boolean(s.is_ongoing);
                  const isPast = Boolean(s.is_past);
                  const isFirst = idx === 0;
                  const isLast = idx === todayItems.length - 1;
                  const timeStart = s.time_start ? String(s.time_start).slice(0, 5) : '07:30';
                  const timeEnd = s.time_end ? String(s.time_end).slice(0, 5) : '08:50';
                  const subjectName = s.subject?.name ?? s.subject?.nama_mapel ?? 'Mata Pelajaran';
                  const teacherName = s.teacher?.nama_lengkap ?? s.teacher?.name ?? s.guru?.nama_lengkap ?? s.guru?.nama ?? null;
                  const room = s.room ?? s.ruangan ?? null;
                  const attStatus = s.attendance?.status_label ?? (s.attendance?.status ? String(s.attendance.status).toUpperCase() : null);
                  const statusColor = isOngoing ? '#2563EB' : isPast ? '#059669' : '#D97706';
                  const statusBg = isOngoing ? '#DBEAFE' : isPast ? '#ECFDF5' : '#FEF3C7';
                  const statusLabel = isOngoing ? 'Berlangsung' : isPast ? 'Selesai' : 'Akan Datang';

                  return (
                    <View key={s.id ?? idx} style={styles.milestoneRow}>
                      {/* Col 1: Time Stamp */}
                      <View style={styles.milestoneTimeCol}>
                        <Text style={[styles.milestoneTimeStart, isOngoing && { color: '#2563EB' }]}>
                          {timeStart}
                        </Text>
                        <Text style={styles.milestoneTimeEnd}>
                          {timeEnd}
                        </Text>
                        <View style={[styles.milestoneSessionPill, isOngoing && { backgroundColor: '#EFF6FF' }]}>
                          <Text style={[styles.milestoneSessionText, isOngoing && { color: '#2563EB' }]}>
                            Sesi {idx + 1}
                          </Text>
                        </View>
                      </View>

                      {/* Col 2: Milestone Track & Node */}
                      <View style={styles.milestoneTrackCol}>
                        {/* Top track line */}
                        <View
                          style={[
                            styles.milestoneTrackLineTop,
                            isFirst && { opacity: 0 },
                            isPast && styles.milestoneTrackLinePast,
                            isOngoing && styles.milestoneTrackLineActive,
                          ]}
                        />

                        {/* Milestone Node */}
                        <View style={styles.milestoneNodeWrap}>
                          {isOngoing ? (
                            <View style={styles.milestoneNodeOngoing}>
                              <View style={styles.milestoneNodeOngoingInner} />
                            </View>
                          ) : isPast ? (
                            <View style={styles.milestoneNodePast}>
                              <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" />
                            </View>
                          ) : (
                            <View style={styles.milestoneNodeUpcoming} />
                          )}
                        </View>

                        {/* Bottom track line */}
                        <View
                          style={[
                            styles.milestoneTrackLineBottom,
                            isLast && { opacity: 0 },
                            isPast && styles.milestoneTrackLinePast,
                          ]}
                        />
                      </View>

                      {/* Col 3: Milestone Card */}
                      <View style={styles.milestoneCardCol}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            setShowJadwalModal(false);
                            navigation.navigate('Jadwal', parent && activeChildId ? { child_id: String(activeChildId), student_id: String(activeChildId) } : undefined);
                          }}
                          style={[
                            styles.milestoneCard,
                            isOngoing && styles.milestoneCardOngoing,
                          ]}
                        >
                          <View style={styles.milestoneCardHeader}>
                            <View style={styles.milestoneSubjectRow}>
                              <View style={[
                                styles.milestoneSubjectIconBox,
                                { backgroundColor: isOngoing ? '#DBEAFE' : isPast ? '#F1F5F9' : '#FEF3C7' }
                              ]}>
                                <MaterialCommunityIcons
                                  name="book-open-page-variant"
                                  size={15}
                                  color={isOngoing ? '#2563EB' : isPast ? '#64748B' : '#D97706'}
                                />
                              </View>
                              <Text numberOfLines={1} style={styles.milestoneSubjectTitle}>
                                {subjectName}
                              </Text>
                            </View>

                            <View style={[styles.milestoneStatusBadge, { backgroundColor: statusBg }]}>
                              {isOngoing && <View style={styles.milestoneLiveDot} />}
                              <Text style={[styles.milestoneStatusText, { color: statusColor }]}>{statusLabel}</Text>
                            </View>
                          </View>

                          {/* Metadata: Guru & Ruangan */}
                          <View style={styles.milestoneMetaRow}>
                            {teacherName ? (
                              <View style={styles.milestoneMetaItem}>
                                <MaterialCommunityIcons name="account-tie" size={13} color="#94A3B8" />
                                <Text numberOfLines={1} style={styles.milestoneMetaText}>{teacherName}</Text>
                              </View>
                            ) : null}

                            {room ? (
                              <View style={styles.milestoneMetaItem}>
                                <MaterialCommunityIcons name="door" size={13} color="#94A3B8" />
                                <Text numberOfLines={1} style={styles.milestoneMetaText}>{room}</Text>
                              </View>
                            ) : null}
                          </View>

                          {attStatus && (
                            <View style={styles.milestoneAttendanceRow}>
                              <MaterialCommunityIcons name="check-circle" size={13} color="#059669" />
                              <Text style={styles.milestoneAttendanceText}>
                                Presensi: {attStatus}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                });
              })()}

              {/* Tombol lihat jadwal lengkap */}
              <TouchableOpacity
                style={styles.allNewsReadMoreRow}
                activeOpacity={0.8}
                onPress={() => {
                  setShowJadwalModal(false);
                  navigation.navigate('Jadwal', parent && activeChildId ? { child_id: String(activeChildId), student_id: String(activeChildId) } : undefined);
                }}
              >
                <Text style={[styles.allNewsReadMoreText, { color: '#2563EB' }]}>Lihat Jadwal Lengkap</Text>
                <MaterialCommunityIcons name="arrow-right" size={15} color="#2563EB" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL: Pilih Anak (Orang Tua)                                */}
      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* HALAMAN DEDIKASI: Pilih Anak (Sesuai Desain Screenshot)       */}
      {/* ============================================================ */}
      <Modal
        visible={showChildSelectorModal}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent={true}
        statusBarTranslucent={true}
        hardwareAccelerated={true}
        onRequestClose={() => setShowChildSelectorModal(false)}
      >
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
        <View style={{ flex: 1, backgroundColor: '#ECFDF5' }}>
          {/* Background lembut senada halaman utama */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Image
              source={PARENT_HOME_BG}
              style={{ width: SCREEN_WIDTH, height: '100%', opacity: 0.15 }}
              resizeMode="cover"
            />
          </View>

          {/* Header Bar di Ujung Atas Layar (Penuh ke Atas dengan Inset Status Bar Aman) */}
          <View
            style={{
              paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 12) + 6,
              paddingHorizontal: 16,
              paddingBottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setShowChildSelectorModal(false)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
                borderWidth: 1.5,
                borderColor: '#A7F3D0',
                shadowColor: '#047857',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.12,
                shadowRadius: 4,
                elevation: 2,
              }}
              accessibilityLabel="Kembali"
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color="#004D32" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 21, fontWeight: '800', color: '#004D32' }}>Pilih Anak</Text>
              <Text style={{ fontSize: 12.5, color: '#047857', fontWeight: '600', marginTop: 1 }}>
                Pilih data anak untuk melihat informasi dan aktivitasnya.
              </Text>
            </View>
          </View>

          {/* List Kartu Siswa */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 6 }}
            showsVerticalScrollIndicator={false}
          >
            {parentChildren.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#047857', fontWeight: '600' }}>Tidak ada data anak terhubung.</Text>
              </View>
            ) : (
              parentChildren.map((child: any, cIdx: number) => {
                const isSelected = cIdx === activeChildIndex;
                const photoUri = getProfileImageUrl(child);
                const gender = child.gender || child.jenis_kelamin;
                const isGirl = gender === 'P' || gender === 'female' || gender === 'perempuan';
                const defaultAvatar = isGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;
                const childId = child.id != null ? child.id : child.student_id;
                const childName = child.full_name || child.nama_lengkap || child.name || 'Ananda';
                const childUnit = child.unit_name || child.education_unit?.name || 'Sekolah';
                const childClassName = getSafeStudentClassName(child) || '-';
                const childNis = child.nis || child.student_nis || '-';

                // Warna tema bergantian sesuai 4 palet harmonis pada Layanan Sekolah (Tanpa Garis Hitam)
                const SERVICE_THEMES = [
                  {
                    avatarBg: '#EFF6FF',
                    border: '#BFDBFE',
                    activeBorder: '#2563EB',
                    accent: '#2563EB',
                    badgeBg: '#EFF6FF',
                    badgeText: '#1D4ED8',
                    shadow: '#2563EB',
                  },
                  {
                    avatarBg: '#ECFDF5',
                    border: '#A7F3D0',
                    activeBorder: '#047857',
                    accent: '#047857',
                    badgeBg: '#ECFDF5',
                    badgeText: '#047857',
                    shadow: '#047857',
                  },
                  {
                    avatarBg: '#FFF7ED',
                    border: '#FED7AA',
                    activeBorder: '#EA580C',
                    accent: '#EA580C',
                    badgeBg: '#FFF7ED',
                    badgeText: '#C2410C',
                    shadow: '#EA580C',
                  },
                  {
                    avatarBg: '#FDF2F8',
                    border: '#FBCFE8',
                    activeBorder: '#8B5CF6',
                    accent: '#8B5CF6',
                    badgeBg: '#FDF2F8',
                    badgeText: '#7C3AED',
                    shadow: '#8B5CF6',
                  },
                ];
                const cardTheme = SERVICE_THEMES[cIdx % SERVICE_THEMES.length];

                return (
                  <TouchableOpacity
                    key={`child-select-card-${cIdx}-${String(childId || cIdx)}`}
                    activeOpacity={0.88}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 22,
                      padding: 16,
                      marginBottom: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: isSelected ? cardTheme.activeBorder : cardTheme.border,
                      shadowColor: cardTheme.shadow,
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: isSelected ? 0.16 : 0.06,
                      shadowRadius: 8,
                      elevation: isSelected ? 3 : 1.5,
                    }}
                    onPress={() => {
                      goToLoopChild(cIdx, true);
                      if (childId) {
                        useActiveChildStore.getState().setActiveChildId(childId);
                        void fetchTodayTimeline(String(childId), undefined, true);
                        void fetchHomeWidgets(String(childId));
                      }
                      setIsChildViewActive(true);
                      setShowChildSelectorModal(false);
                    }}
                  >
                    {/* Avatar Siswa dengan Ukuran Proporsional & Senada */}
                    <View
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        backgroundColor: cardTheme.avatarBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        borderWidth: 2,
                        borderColor: isSelected ? cardTheme.activeBorder : cardTheme.border,
                      }}
                    >
                      <Image
                        source={photoUri ? { uri: String(photoUri) } : defaultAvatar}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    </View>

                    {/* Informasi Siswa (Nama Hijau Zamrud, Lencana Unit & Kelas Berwarna) */}
                    <View style={{ flex: 1, marginLeft: 14, marginRight: 8 }}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: '800',
                          color: '#004D32',
                          marginBottom: 4,
                        }}
                        numberOfLines={1}
                      >
                        {childName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: '#047857',
                          marginBottom: 3,
                        }}
                        numberOfLines={1}
                      >
                        {childUnit} | Kelas {childClassName}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: '#059669', fontWeight: '600' }}>
                        NIS: {childNis}
                      </Text>
                    </View>

                    {/* Tombol Chevron Bulat */}
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: isSelected ? cardTheme.activeBorder : cardTheme.avatarBg,
                        borderWidth: 1,
                        borderColor: isSelected ? cardTheme.activeBorder : cardTheme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: cardTheme.shadow,
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: isSelected ? 0.2 : 0.08,
                        shadowRadius: 4,
                        elevation: 2,
                      }}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={22} color={isSelected ? '#FFFFFF' : cardTheme.accent} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {/* Tombol Tambah Data Anak (Sesuai Mockup) */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 22,
                padding: 16,
                marginTop: 6,
                marginBottom: 36,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: '#A7F3D0',
                borderStyle: 'dashed',
                shadowColor: '#047857',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 6,
                elevation: 1.5,
              }}
              onPress={() => {
                const schoolName = mobileConfig.branding?.school_name || 'Yayasan Dar El-Iman';
                const csPhone = mobileConfig.branding?.contact?.phone || '08116661141';
                const cleanPhone = csPhone.replace(/\D/g, '').replace(/^0/, '62');
                const parentName = (user as any)?.name || 'Wali Santri';
                const waMessage = encodeURIComponent(
                  `Assalamu'alaikum Warahmatullahi Wabarakatuh, Admin Tata Usaha & Pendaftaran ${schoolName}.\nSaya ${parentName}, bermaksud menambahkan / menghubungkan data ananda dari unit lain ke akun portal saya.`
                );

                Alert.alert(
                  'Tambah Data Anak',
                  `Untuk menghubungkan data ananda dari unit lain (PAUD/TK, SD, SMP, SMA, atau Pondok Pesantren di lingkungan ${schoolName}), Anda dapat menghubungi langsung Bagian Tata Usaha & Pendaftaran melalui WhatsApp resmi atau mendatangi kantor administrasi dengan membawa fotokopi KK & NIS ananda.`,
                  [
                    { text: 'Tutup', style: 'cancel' },
                    {
                      text: 'Hubungi WhatsApp TU',
                      style: 'default',
                      onPress: () => {
                        const waUrl = `whatsapp://send?phone=${cleanPhone}&text=${waMessage}`;
                        const webWaUrl = `https://wa.me/${cleanPhone}?text=${waMessage}`;
                        void (async () => {
                          try {
                            const can = await Linking.canOpenURL(waUrl);
                            if (can) {
                              await Linking.openURL(waUrl);
                            } else {
                              await Linking.openURL(webWaUrl);
                            }
                          } catch {
                            // no-op
                          }
                        })();
                      },
                    },
                  ]
                );
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: '#004D32',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#004D32' }}>
                  Tambah Data Anak
                </Text>
                <Text style={{ fontSize: 11.5, color: '#047857', marginTop: 1, lineHeight: 16, fontWeight: '500' }}>
                  Daftarkan anak dari unit sekolah lain (SD IT, SMP IT, SMA IT, atau PAUD IT).
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL: Menu Utama Portal Siswa (Ananda)                       */}
      {/* ============================================================ */}
      <Modal
        visible={showChildPortalModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowChildPortalModal(false)}
      >
        <View style={styles.newsModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowChildPortalModal(false)}
          />
          <View style={styles.newsModalSheet}>
            {/* Header Gradient — Hijau Emerald Portal */}
            <LinearGradient
              colors={['#064E3B', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newsModalHeaderGradient}
            >
              <View style={styles.newsHeaderDecorWave} />
              <View style={styles.newsHeaderDecorCircle} />
              <View style={styles.newsModalHeaderRow}>
                <TouchableOpacity
                  onPress={() => setShowChildPortalModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Kembali"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
                </TouchableOpacity>
                <View style={styles.newsModalTitleCol}>
                  <Text style={styles.newsModalEyebrow}>PORTAL ANANDA · MENU UTAMA</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>
                    {selectedPortalChild?.full_name || selectedPortalChild?.nama_lengkap || selectedPortalChild?.name || 'Ananda'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowChildPortalModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Tutup"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#059669" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView
              contentContainerStyle={styles.allNewsListContainer}
              showsVerticalScrollIndicator={false}
            >
              {/* Subheader */}
              <View style={styles.allNewsHeaderBox}>
                <Text style={styles.allNewsHeaderTitle}>
                  {selectedPortalChild?.kelas?.nama_kelas || selectedPortalChild?.kelas?.name || selectedPortalChild?.class_name || 'Portal Siswa Terpadu'}
                </Text>
                <Text style={styles.allNewsHeaderSub}>
                  Pilih menu layanan akademik, ibadah, atau evaluasi ananda di bawah ini.
                </Text>
              </View>

              {/* Grid Menu 4 Kolom */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, paddingHorizontal: 2 }}>
                {childPortalMenus.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.75}
                    style={{ width: '25%', alignItems: 'center', paddingHorizontal: 1, paddingVertical: 2 }}
                    onPress={() => handleChildPortalMenuClick(item.route, item.tab)}
                  >
                    <View style={[styles.childPortalIconSquircle, { backgroundColor: item.color }]}>
                      <MaterialCommunityIcons name={item.icon as any} size={20} color="#FFFFFF" />
                    </View>
                    <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.childPortalMenuLabel}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL: Notifikasi Akademik Siswa (Tugas, Ujian CBT, Kuis)    */}
      {/* ============================================================ */}
      <Modal
        visible={showStudentNotificationModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowStudentNotificationModal(false)}
      >
        <View style={styles.newsModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowStudentNotificationModal(false)}
          />
          <View style={styles.newsModalSheet}>
            {/* Header Gradient — Emerald Emas Akademik */}
            <LinearGradient
              colors={['#064E3B', '#0D6B42', '#18A165']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newsModalHeaderGradient}
            >
              <View style={styles.newsHeaderDecorWave} />
              <View style={styles.newsHeaderDecorCircle} />
              <View style={styles.newsModalHeaderRow}>
                <TouchableOpacity
                  onPress={() => setShowStudentNotificationModal(false)}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Kembali"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
                </TouchableOpacity>
                <View style={styles.newsModalTitleCol}>
                  <Text style={styles.newsModalEyebrow}>NOTIFIKASI & PENGINGAT AKADEMIK</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>
                    {selectedNotificationStudent?.full_name || selectedNotificationStudent?.nama_lengkap || selectedNotificationStudent?.name || 'Ananda'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (selectedNotificationStudent) {
                      void handleOpenStudentNotifications(selectedNotificationStudent);
                    }
                  }}
                  style={styles.newsModalRoundcubeBtn}
                  accessibilityLabel="Muat Ulang"
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="refresh" size={20} color="#059669" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView
              contentContainerStyle={[styles.allNewsListContainer, { paddingBottom: 28 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Subheader */}
              <View style={styles.allNewsHeaderBox}>
                <Text style={styles.allNewsHeaderTitle}>
                  Agenda & Tugas Terjadwal
                </Text>
                <Text style={styles.allNewsHeaderSub}>
                  Pengingat penugasan LMS, jadwal ujian CBT, kuis daring, dan maklumat sekolah.
                </Text>
              </View>

              {/* Filter Tabs */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 4, gap: 8, marginBottom: 16 }}
              >
                {[
                  {
                    key: 'all',
                    label: 'Semua Agenda',
                    icon: 'view-grid-outline',
                    count: studentAssignmentsList.length + studentCbtList.length + announcements.length,
                    activeBg: '#059669',
                    activeBorder: '#047857',
                    inactiveBg: '#ECFDF5',
                    inactiveBorder: '#A7F3D0',
                    textColor: '#047857',
                  },
                  {
                    key: 'tugas',
                    label: 'Tugas & Kuis',
                    icon: 'clipboard-text-outline',
                    count: studentAssignmentsList.length,
                    activeBg: '#D97706',
                    activeBorder: '#B45309',
                    inactiveBg: '#FFFBEB',
                    inactiveBorder: '#FDE68A',
                    textColor: '#B45309',
                  },
                  {
                    key: 'cbt',
                    label: 'Ujian CBT',
                    icon: 'laptop',
                    count: studentCbtList.length,
                    activeBg: '#2563EB',
                    activeBorder: '#1D4ED8',
                    inactiveBg: '#EFF6FF',
                    inactiveBorder: '#BFDBFE',
                    textColor: '#1D4ED8',
                  },
                  {
                    key: 'pengumuman',
                    label: 'Pengumuman',
                    icon: 'bullhorn-outline',
                    count: announcements.length,
                    activeBg: '#0D9488',
                    activeBorder: '#0F766E',
                    inactiveBg: '#F0FDFA',
                    inactiveBorder: '#99F6E4',
                    textColor: '#0F766E',
                  },
                ].map((tab) => {
                  const isActive = studentNotifFilter === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      activeOpacity={0.8}
                      onPress={() => setStudentNotifFilter(tab.key as any)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 7,
                        paddingHorizontal: 13,
                        borderRadius: 20,
                        backgroundColor: isActive ? tab.activeBg : tab.inactiveBg,
                        borderWidth: 1.2,
                        borderColor: isActive ? tab.activeBorder : tab.inactiveBorder,
                      }}
                    >
                      <MaterialCommunityIcons
                        name={tab.icon as any}
                        size={15}
                        color={isActive ? '#FFFFFF' : tab.textColor}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: isActive ? '#FFFFFF' : tab.textColor,
                        }}
                      >
                        {tab.label} ({tab.count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Loader */}
              {studentNotificationsLoading ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#059669" />
                  <Text style={{ marginTop: 12, fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                    Memuat agenda & notifikasi siswa...
                  </Text>
                </View>
              ) : (
                <>
                  {/* Bagian Ujian CBT (jika tab all atau cbt) */}
                  {(studentNotifFilter === 'all' || studentNotifFilter === 'cbt') && studentCbtList.length > 0 && (
                    <View style={{ marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons name="laptop" size={13} color="#2563EB" />
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E3A8A' }}>
                          Ujian CBT & Asesmen Daring
                        </Text>
                      </View>
                      {studentCbtList.map((exam: any, eIdx: number) => {
                        const sId = selectedNotificationStudent?.id || selectedNotificationStudent?.student_id;
                        return (
                          <TouchableOpacity
                            key={exam.id || eIdx}
                            activeOpacity={0.85}
                            onPress={() => {
                              setShowStudentNotificationModal(false);
                              navigation.navigate('CbtExams', sId ? { child_id: String(sId), student_id: String(sId) } : undefined);
                            }}
                            style={{
                              backgroundColor: '#F8FAFC',
                              borderColor: '#BFDBFE',
                              borderWidth: 1.2,
                              borderLeftWidth: 4,
                              borderLeftColor: '#2563EB',
                              borderRadius: 16,
                              padding: 13,
                              marginBottom: 10,
                              shadowColor: '#2563EB',
                              shadowOffset: { width: 0, height: 1 },
                              shadowOpacity: 0.05,
                              shadowRadius: 4,
                              elevation: 2,
                            }}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '800', color: '#1E3A8A' }}>
                                  {exam.title || exam.nama_ujian || 'Ujian CBT Online'}
                                </Text>
                                <Text style={{ fontSize: 11, color: '#3B82F6', marginTop: 3, fontWeight: '600' }}>
                                  {exam.subject?.name || exam.mapel || 'Mata Pelajaran'} • {exam.duration_minutes || exam.durasi || 60} Menit
                                </Text>
                              </View>
                              <View style={{ backgroundColor: '#2563EB', paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 8 }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 }}>CBT ONLINE</Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <MaterialCommunityIcons name="calendar-clock-outline" size={13} color="#64748B" />
                                <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                                  {exam.start_time || exam.jadwal || 'Terjadwal'}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 3 }}>
                                <Text style={{ fontSize: 11, fontWeight: '800', color: '#2563EB' }}>Ikuti Ujian</Text>
                                <MaterialCommunityIcons name="arrow-right" size={13} color="#2563EB" />
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* Bagian Tugas & Kuis LMS (jika tab all atau tugas) */}
                  {(studentNotifFilter === 'all' || studentNotifFilter === 'tugas') && studentAssignmentsList.length > 0 && (
                    <View style={{ marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons name="clipboard-text-clock" size={13} color="#D97706" />
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400E' }}>
                          Tugas & Kuis LMS Aktif
                        </Text>
                      </View>
                      {studentAssignmentsList.map((item: any, tIdx: number) => {
                        const sId = selectedNotificationStudent?.id || selectedNotificationStudent?.student_id;
                        const deadline = item.due_date || item.deadline || item.tanggal_jatuh_tempo || '';
                        const isQuiz = item.jenis_tugas === 'quiz' || 
                                       item.type === 'quiz' || 
                                       (item.title || item.judul || '').toLowerCase().includes('kuis');

                        const cardBg = isQuiz ? '#FAF5FF' : '#FFFBEB';
                        const cardBorder = isQuiz ? '#E9D5FF' : '#FDE68A';
                        const accentColor = isQuiz ? '#7C3AED' : '#D97706';
                        const titleColor = isQuiz ? '#581C87' : '#92400E';
                        const subColor = isQuiz ? '#6D28D9' : '#B45309';

                        return (
                          <TouchableOpacity
                            key={item.id || tIdx}
                            activeOpacity={0.85}
                            onPress={() => {
                              setShowStudentNotificationModal(false);
                              navigation.navigate('Tugas', {
                                ...(sId ? { child_id: String(sId), student_id: String(sId) } : {}),
                                target_assignment_id: String(item.id),
                              });
                            }}
                            style={{
                              backgroundColor: cardBg,
                              borderColor: cardBorder,
                              borderWidth: 1.2,
                              borderLeftWidth: 4,
                              borderLeftColor: accentColor,
                              borderRadius: 16,
                              padding: 13,
                              marginBottom: 10,
                              shadowColor: accentColor,
                              shadowOffset: { width: 0, height: 1 },
                              shadowOpacity: 0.05,
                              shadowRadius: 4,
                              elevation: 2,
                            }}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                  {isQuiz && <MaterialCommunityIcons name="lightning-bolt" size={14} color="#7C3AED" />}
                                  <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '800', color: titleColor, flex: 1 }}>
                                    {item.title || item.judul || (isQuiz ? 'Kuis CBT Siswa' : 'Tugas Siswa')}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 11, color: subColor, fontWeight: '600' }}>
                                  {item.subject?.name || item.mapel || 'Mata Pelajaran'} • {item.teacher?.name || item.guru || 'Guru Pengampu'}
                                </Text>
                              </View>
                              <View style={{ backgroundColor: accentColor, paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 8 }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 }}>
                                  {isQuiz ? '⚡ KUIS' : 'TUGAS'}
                                </Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: isQuiz ? '#F3E8FF' : '#FEF3C7' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <MaterialCommunityIcons name="clock-outline" size={13} color={subColor} />
                                <Text style={{ fontSize: 11, color: subColor, fontWeight: '700' }}>
                                  Batas: {deadline ? deadline : 'Segera kerjakan'}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isQuiz ? '#F3E8FF' : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 3 }}>
                                <Text style={{ fontSize: 11, fontWeight: '800', color: accentColor }}>
                                  {isQuiz ? 'Kerjakan Kuis' : 'Buka Tugas'}
                                </Text>
                                <MaterialCommunityIcons name="arrow-right" size={13} color={accentColor} />
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* Bagian Pengumuman Sekolah (jika tab all atau pengumuman) */}
                  {(studentNotifFilter === 'all' || studentNotifFilter === 'pengumuman') && announcements.length > 0 && (
                    <View style={{ marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons name="bullhorn" size={13} color="#059669" />
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#065F46' }}>
                          Pemberitahuan & Maklumat Sekolah
                        </Text>
                      </View>
                      {announcements.slice(0, 5).map((ann: any, aIdx: number) => {
                        const cleanBody = (ann.content || ann.isi || ann.description || '').replace(/<[^>]*>?/gm, '').trim();
                        const dateStr = ann.created_at ? new Date(ann.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : (ann.date || '');
                        return (
                          <View
                            key={ann.id || aIdx}
                            style={{
                              backgroundColor: '#F0FDF4',
                              borderColor: '#BBF7D0',
                              borderWidth: 1.2,
                              borderLeftWidth: 4,
                              borderLeftColor: '#059669',
                              borderRadius: 16,
                              padding: 13,
                              marginBottom: 10,
                              shadowColor: '#059669',
                              shadowOffset: { width: 0, height: 1 },
                              shadowOpacity: 0.05,
                              shadowRadius: 4,
                              elevation: 2,
                            }}
                          >
                            <Text numberOfLines={2} style={{ fontSize: 13.5, fontWeight: '800', color: '#065F46' }}>
                              {ann.title || ann.judul || 'Pemberitahuan Sekolah'}
                            </Text>
                            {cleanBody ? (
                              <Text numberOfLines={2} style={{ fontSize: 11.5, color: '#047857', marginTop: 4, lineHeight: 17 }}>
                                {cleanBody}
                              </Text>
                            ) : null}
                            {dateStr ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 }}>
                                <MaterialCommunityIcons name="calendar-outline" size={12} color="#059669" />
                                <Text style={{ fontSize: 10.5, color: '#059669', fontWeight: '700' }}>
                                  {dateStr}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Empty State jika tidak ada data untuk filter yang dipilih */}
                  {((studentNotifFilter === 'all' && studentAssignmentsList.length === 0 && studentCbtList.length === 0 && announcements.length === 0) ||
                    (studentNotifFilter === 'tugas' && studentAssignmentsList.length === 0) ||
                    (studentNotifFilter === 'cbt' && studentCbtList.length === 0) ||
                    (studentNotifFilter === 'pengumuman' && announcements.length === 0)) && (
                    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <MaterialCommunityIcons name="bell-check-outline" size={28} color="#16A34A" />
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B', textAlign: 'center' }}>
                        Tidak Ada Pengingat Mendesak
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                        Semua tugas, ujian CBT, atau agenda ananda telah tuntas atau belum ada pengumuman baru.
                      </Text>
                    </View>
                  )}
                </>
              )}

              {/* Tombol Akses Pusat Notifikasi Lengkap */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#ECFDF5',
                  borderColor: '#A7F3D0',
                  borderWidth: 1.2,
                  paddingVertical: 13,
                  paddingHorizontal: 16,
                  borderRadius: 16,
                  marginTop: 10,
                  gap: 8,
                  shadowColor: '#059669',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: 2,
                }}
                activeOpacity={0.82}
                onPress={() => {
                  setShowStudentNotificationModal(false);
                  navigation.navigate('Notifikasi');
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="bell-ring" size={15} color="#FFFFFF" />
                </View>
                <Text style={{ color: '#047857', fontSize: 13, fontWeight: '800' }}>
                  Buka Pusat Notifikasi Lengkap
                </Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color="#047857" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: LAPORAN PERKEMBANGAN PEKANAN SISWA (ORANG TUA & SISWA)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showWeeklyReportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWeeklyReportModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'flex-end' }}>
          <View style={{ width: '100%', maxHeight: '92%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
            {/* Header Modal */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="file-document-check-outline" size={22} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }}>
                    Laporan Perkembangan Pekanan
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: '#059669', fontWeight: '700' }}>
                    {selectedWeeklyStudent?.full_name || selectedWeeklyStudent?.nama_lengkap || selectedWeeklyStudent?.name || 'Ananda'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowWeeklyReportModal(false)}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {weeklyReportLoading ? (
              <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#059669" />
                <Text style={{ marginTop: 12, fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                  Memuat data perkembangan ananda...
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
                {/* Kop & Info Card */}
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Image
                        source={require('../../assets/logo.png')}
                        style={{ width: 22, height: 22, resizeMode: 'contain' }}
                      />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#064E3B' }}>
                        {mobileConfig.branding?.school_name?.toUpperCase() || selectedWeeklyStudent?.education_unit?.name?.toUpperCase() || 'LEMBAGA PENDIDIKAN'}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#047857' }}>
                        {selectedWeeklyStudent?.education_unit?.metadata?.akreditasi
                          ? `Terakreditasi ${selectedWeeklyStudent.education_unit.metadata.akreditasi}`
                          : (selectedWeeklyStudent?.education_unit?.level ? `Jenjang ${selectedWeeklyStudent.education_unit.level}` : 'Terakreditasi Resmi')}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12.5, fontWeight: '900', color: '#0F172A' }}>
                    {selectedWeeklyStudent?.education_unit?.name || (typeof selectedWeeklyStudent?.unit === 'string' ? selectedWeeklyStudent?.unit : selectedWeeklyStudent?.unit?.name) || 'Unit Pendidikan'}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: '#64748B', marginTop: 2 }}>
                    {weeklyReportData?.academic_context?.date
                      ? `Periode: ${weeklyReportData.academic_context.date}`
                      : (weeklyReportData?.academic_context?.academic_year
                      ? `Tahun Ajaran ${weeklyReportData.academic_context.academic_year}`
                      : 'Periode Berjalan')}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                    <Text style={{ fontSize: 11, color: '#334155' }}>
                      Kelas: <Text style={{ fontWeight: '800' }}>{getSafeStudentClassName(selectedWeeklyStudent) || weeklyReportData?.student?.kelas?.nama_kelas || '-'}</Text>
                    </Text>
                    <Text style={{ fontSize: 11, color: '#334155' }}>
                      Wali Kelas: <Text style={{ fontWeight: '800' }}>{selectedWeeklyStudent?.wali_kelas || selectedWeeklyStudent?.homeroom_teacher || weeklyReportData?.student?.wali_kelas || weeklyReportData?.latest_note?.teacher_name || '-'}</Text>
                    </Text>
                  </View>
                </View>

                {/* 1. KEDISIPLINAN & KEHADIRAN PAGI */}
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <MaterialCommunityIcons name="alarm-check" size={16} color="#059669" />
                    <Text style={{ fontSize: 12.5, fontWeight: '900', color: '#0F172A' }}>
                      1. Kedisiplinan & Kehadiran Pagi
                    </Text>
                  </View>
                  <View style={{ backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={{ fontSize: 10, color: '#047857', fontWeight: '600' }}>Tingkat Kehadiran</Text>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#064E3B' }}>
                        {weeklyReportData?.kpi?.attendance_summary?.total_days > 0
                          ? `${weeklyReportData.kpi.attendance_rate}% (${weeklyReportData.kpi.attendance_summary.present_days}/${weeklyReportData.kpi.attendance_summary.total_days} Hari)`
                          : (weeklyReportData?.kpi?.attendance_rate != null
                              ? `${weeklyReportData.kpi.attendance_rate}% Hadir`
                              : (weeklyReportData?.attendance_today || 'Tercatat Hadir'))}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 10, color: '#047857', fontWeight: '600' }}>Perizinan Resmi</Text>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#047857' }}>
                        {weeklyReportData?.parent_summary?.perizinan?.count ? `${weeklyReportData.parent_summary.perizinan.count} Izin` : 'Nihil (-)'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 2. ABSENSI SHALAT BERJAMAAH / MUTABAAH */}
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <MaterialCommunityIcons name="mosque" size={16} color="#0284C7" />
                    <Text style={{ fontSize: 12.5, fontWeight: '900', color: '#0F172A' }}>
                      2. Aktivitas Ibadah & Mutaba'ah
                    </Text>
                  </View>
                  <View style={{ backgroundColor: '#F0F9FF', borderRadius: 10, padding: 10 }}>
                    <Text style={{ fontSize: 10, color: '#0369A1', fontWeight: '600' }}>Status Mutaba'ah Yaumiyyah Hari Ini</Text>
                    <Text style={{ fontSize: 12.5, fontWeight: '900', color: '#0C4A6E', marginTop: 2 }}>
                      {weeklyReportData?.mutabaah_today?.status_label || (weeklyReportData?.mutabaah_today ? '✅ Sudah Terisi Lengkap' : '📅 Menunggu Pengisian')}
                    </Text>
                  </View>
                </View>

                {/* 3. CAPAIAN TAHSIN & TAHFIZH */}
                <View style={{ backgroundColor: '#FFF7ED', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#FED7AA', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialCommunityIcons name="book-open-page-variant" size={16} color="#EA580C" />
                      <Text style={{ fontSize: 12.5, fontWeight: '900', color: '#9A3412' }}>
                        3. Capaian Tahsin & Tahfizh
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#10B981', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#FFFFFF' }}>
                        {weeklyReportData?.latest_tahfizh?.status ? String(weeklyReportData.latest_tahfizh.status).toUpperCase() : 'AKTIF'}
                      </Text>
                    </View>
                  </View>
                  <View>
                    <Text style={{ fontSize: 11, color: '#7C2D12' }}>
                      Hafalan Terakhir:{' '}
                      <Text style={{ fontWeight: '800' }}>
                        {weeklyReportData?.latest_tahfizh
                          ? `${weeklyReportData.latest_tahfizh.surah_name || 'Al-Qur\'an'}${weeklyReportData.latest_tahfizh.ayah_start != null && weeklyReportData.latest_tahfizh.ayah_end != null ? ` (Ayat ${weeklyReportData.latest_tahfizh.ayah_start}-${weeklyReportData.latest_tahfizh.ayah_end})` : ''}`
                          : 'Belum ada setoran terbaru pekan ini'}
                      </Text>
                    </Text>
                    <Text style={{ fontSize: 11, color: '#7C2D12', marginTop: 2 }}>
                      {weeklyReportData?.latest_tahfizh
                        ? `Capaian: Juz ${weeklyReportData.latest_tahfizh.juz != null ? weeklyReportData.latest_tahfizh.juz : '-'} · Skor ${weeklyReportData.latest_tahfizh.score != null ? weeklyReportData.latest_tahfizh.score : '-'}`
                        : 'Terjadwal pada sesi halaqah tahfizh berikutnya'}
                    </Text>
                  </View>
                </View>

                {/* 4. KEHADIRAN PER MATA PELAJARAN */}
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <MaterialCommunityIcons name="notebook-outline" size={16} color="#4F46E5" />
                    <Text style={{ fontSize: 12.5, fontWeight: '900', color: '#0F172A' }}>
                      4. Pembelajaran & Penugasan Akademik
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
                    {weeklyReportData?.latest_grades && weeklyReportData.latest_grades.length > 0
                      ? `Tercatat ${weeklyReportData.latest_grades.length} rekaman evaluasi mata pelajaran terbaru.`
                      : 'Seluruh sesi KBM terkoordinasi aktif dengan jadwal sekolah.'}
                  </Text>
                  <View style={{ backgroundColor: '#EEF2FF', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#3730A3' }}>Status Presensi Akademik</Text>
                    <Text style={{ fontSize: 11, fontWeight: '900', color: '#4338CA' }}>
                      {weeklyReportData?.kpi?.attendance_summary?.total_days > 0
                        ? `${weeklyReportData.kpi.attendance_rate}% Hadir (${weeklyReportData.kpi.attendance_summary.present_days}/${weeklyReportData.kpi.attendance_summary.total_days} Hari)`
                        : (weeklyReportData?.kpi?.attendance_rate != null ? `${weeklyReportData.kpi.attendance_rate}% Hadir` : '—')}
                    </Text>
                  </View>
                </View>

                {/* 5. CATATAN GURU & DOA */}
                <View style={{ backgroundColor: '#FEFCE8', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#FEF08A', marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MaterialCommunityIcons name="comment-text-outline" size={16} color="#CA8A04" />
                    <Text style={{ fontSize: 12.5, fontWeight: '900', color: '#854D0E' }}>
                      5. Catatan Guru & Kemitraan
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#713F12', lineHeight: 16 }}>
                    {weeklyReportData?.latest_note?.content ||
                      weeklyReportData?.latest_note?.title ||
                      '🤝 Keberhasilan pendidikan Ananda merupakan hasil sinergi antara sekolah dan keluarga. Semoga Allah ﷻ senantiasa menjaga dan memberkahi ananda.'}
                  </Text>
                  {Boolean(weeklyReportData?.latest_note?.teacher_name) && (
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#A16207', marginTop: 4 }}>
                      — {weeklyReportData.latest_note.teacher_name}
                    </Text>
                  )}
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#854D0E', textAlign: 'center', marginTop: 10 }}>
                    جَزَاكُمُ اللَّهُ خَيْرًا وَبَارَكَ اللَّهُ فِيكُمْ
                  </Text>
                </View>

                {/* Tombol Tutup */}
                <TouchableOpacity
                  onPress={() => setShowWeeklyReportModal(false)}
                  style={{
                    backgroundColor: '#059669',
                    paddingVertical: 13,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>Tutup Pratinjau Perkembangan</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D7A4E',
  },
  // ─────────────────────────────────────────────────────────────────────────
  // RICH STICKY HEADER STYLES
  // ─────────────────────────────────────────────────────────────────────────
  stickyHeaderBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    overflow: 'hidden',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: '#F0FDF4',
    shadowColor: '#003822',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  stickyDecorCircle1: {
    position: 'absolute',
    top: -30,
    right: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    pointerEvents: 'none',
  },
  stickyDecorCircle2: {
    position: 'absolute',
    bottom: -20,
    left: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    pointerEvents: 'none',
  },
  // Top bar: Logo + Brand + Right actions
  stickyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 10,
  },
  stickyBrandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stickyLogoWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  stickyLogoImg: {
    width: 26,
    height: 26,
  },
  stickyBrandTextCol: {
    marginLeft: 8,
    flex: 1,
  },
  stickyBrandLabel: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
    ...textShadowStyle('rgba(0, 0, 0, 0.4)', 0, 1, 3),
  },
  stickyBrandSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#A7F3D0',
    marginTop: 0.5,
    letterSpacing: 0.1,
  },
  stickyTopRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stickySquircleActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  stickyBellBadgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#064E3B',
  },
  stickyAvatarSquircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  stickyTopAvatarImg: {
    width: '100%',
    height: '100%',
  },
  // ─── Rich Card (Parent / Siswa): kartu hijau gradient (background dari LinearGradient) ───
  stickyRichCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    overflow: 'hidden',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  stickyRichCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stickyRichAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  stickyRichAvatarImg: {
    width: '100%',
    height: '100%',
  },
  stickyRichInfoCol: {
    flex: 1,
    marginLeft: 10,
  },
  stickyRichStudentName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 2.5,
  },
  stickyRichNisText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.88)',
    marginBottom: 3.5,
  },
  stickyRichUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  stickyRichUnitText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stickyRichMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  stickyRichMetaText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stickyRichMetaSep: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  stickyRichPresensiDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginLeft: 4,
  },
  stickyRichMiniActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  stickyMiniBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  // Quick Action Chips (putih ala halaman Jadwal)
  stickyQuickChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  stickyQuickChip: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6.5,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.28)',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  stickyQuickChipText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.1,
  },
  stickyQuickChipSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6.5,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.28)',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  stickyQuickChipSecondaryText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.1,
  },
  stickyQuickChipPrimary: {
    flex: 0.85,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6.5,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 58, 237, 0.28)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  stickyQuickChipPrimaryText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 0.1,
  },
  // Child Switcher Chips
  stickyChildSwitcherRow: {
    marginTop: 4,
  },
  stickyChildSwitcherScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  stickyChildChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  stickyChildChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  stickyChildChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A7F3D0',
  },
  stickyChildChipTextActive: {
    color: '#064E3B',
  },
  // ─── Compact Info Strip (Guru / Staff / dll) ───
  stickyCompactInfoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  stickyCompactAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  stickyCompactAvatarImg: {
    width: '100%',
    height: '100%',
  },
  stickyCompactTextCol: {
    flex: 1,
    marginLeft: 10,
  },
  stickyCompactName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  stickyCompactRole: {
    fontSize: 10,
    fontWeight: '600',
    color: '#A7F3D0',
    marginTop: 1,
  },
  stickyCompactProfileBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bottom divider glassmorphism
  stickyBottomDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginHorizontal: 0,
  },
  // ─── Preserved legacy styles (used elsewhere) ───
  stickyHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 16,
  },
  stickyUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  stickyAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  stickyAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  stickyTextCol: {
    marginLeft: 10,
    flex: 1,
    justifyContent: 'center',
  },
  stickyRoleTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#A7F3D0',
    letterSpacing: 0.2,
    marginBottom: 1,
    ...textShadowStyle('rgba(0, 0, 0, 0.3)', 0, 1, 2),
  },
  stickyUserName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    ...textShadowStyle('rgba(0, 0, 0, 0.35)', 0, 1, 3),
  },
  stickyBellBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  extendedHeaderGradient: {
    paddingBottom: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  headerMosqueBgImage: {
    height: '150%',
    transform: [{ translateY: -110 }],
  },
  // Varian untuk sticky: tampilkan bagian foto yang lebih terang (langit +
  // gedung) agar area bawah sticky tidak terlihat seperti bayangan hijau tua.
  stickyMosqueBgImage: {
    height: '150%',
    transform: [{ translateY: -40 }],
  },
  headerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 1,
  },
  headerBrandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  headerLogoOuter: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  headerLogoImg: {
    width: 34,
    height: 34,
  },
  headerBrandTextCol: {
    marginLeft: 8,
    flex: 1,
    justifyContent: 'center',
  },
  headerWelcomeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DEF7EC',
    letterSpacing: 0.2,
    ...textShadowStyle('rgba(0, 0, 0, 0.25)', 0, 1, 2),
  },
  headerAppTitleText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginTop: 1,
    ...textShadowStyle('rgba(0, 0, 0, 0.35)', 0, 1.5, 3),
  },
  headerActionBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerAvatarBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  studentCardContainerInHeader: {
    marginTop: 16,
    marginBottom: 0,
    position: 'relative',
  },
  singleHeroCardContainer: {
    paddingHorizontal: 16,
    width: '100%',
  },
  studentCarouselHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
    zIndex: 2,
  },
  studentCarouselHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  studentCarouselIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  studentCarouselHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  studentCarouselCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  studentCarouselCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentSwitcherChipsContainer: {
    marginBottom: 10,
    zIndex: 2,
  },
  studentSwitcherChipsScroll: {
    paddingHorizontal: 16,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentSwitcherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    shadowColor: '#003822',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  studentSwitcherChipActive: {
    backgroundColor: '#047857',
    borderColor: '#064E3B',
    borderWidth: 1.2,
  },
  studentSwitcherChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  studentSwitcherChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  bodyOverlapBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: -60,
    zIndex: 0,
    pointerEvents: 'none',
  },
  bodyOverlapSheet: {
    position: 'absolute',
    top: 86,
    left: 0,
    right: 0,
    bottom: -60,
    backgroundColor: '#EBF8F2',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.65)',
  },
  studentCardHeaderRowInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
    zIndex: 1,
  },
  sectionTitleBoldWhite: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  seeAllTextMint: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#DEF7EC',
  },
  studentDotsRowInHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    zIndex: 1,
  },
  studentDotTouchable: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentDotActiveInHeader: {
    width: 18,
    backgroundColor: '#0D6B42',
  },
  studentDotInactiveInHeader: {
    width: 6,
    backgroundColor: 'rgba(13, 107, 66, 0.3)',
  },
  curvedSheetBody: {
    backgroundColor: '#ECFDF5',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: 0,
    paddingTop: 8,
    paddingBottom: 94,
    minHeight: 0,
  },
  studentToastFloatingBox: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 78, 59, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
    maxWidth: SCREEN_WIDTH - 40,
  },
  studentToastText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  mainScrollContent: {
    flexGrow: 1,
    backgroundColor: '#F8FAF9',
  },
  headerWrapper: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 26,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
    zIndex: 20,
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    paddingTop: 10,
    paddingBottom: 94,
  },
  headerDecorWave: {
    position: 'absolute',
    top: -30,
    right: -25,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 0,
  },
  headerDecorCircle: {
    position: 'absolute',
    top: 25,
    right: 70,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    zIndex: 0,
  },
  userProfileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
    zIndex: 1,
  },
  avatarWrapper: {
    width: 60,
    height: 60,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#084835',
    fontSize: 24,
    fontWeight: '900',
  },
  greetingTextColumn: {
    marginLeft: 12,
    flex: 1,
  },
  greetingSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  greetingName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 1,
    letterSpacing: 0.2,
  },
  greetingRole: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
    marginTop: 1,
  },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
    zIndex: 1,
  },
  unreadBadgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  carouselHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  carouselTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  carouselHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  allNewsListContainer: {
    padding: 18,
    paddingBottom: 36,
  },
  allNewsHeaderBox: {
    marginBottom: 16,
  },
  allNewsHeaderTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#084835',
  },
  allNewsHeaderSub: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  allNewsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  allNewsCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  newsTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  newsTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#084835',
  },
  allNewsDate: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  allNewsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  allNewsSnippet: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 12,
  },
  allNewsReadMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  allNewsReadMoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#084835',
  },
  carouselContainerWrapper: {
    width: '100%',
    marginTop: 8,
    marginBottom: 6,
  },
  newsEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(236, 253, 245, 0.7)',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 6,
  },
  newsEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#047857',
    marginTop: 4,
  },
  newsEmptySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  carouselCleanBox: {
    width: '100%',
    paddingVertical: 4,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  carouselIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAllBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 2,
  },
  carouselSection: {
    marginTop: 16,
  },
  carouselTrack: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  newsCard: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    position: 'relative',
    minHeight: 110,
    justifyContent: 'center',
  },
  newsCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    zIndex: 1,
  },
  newsThumbnail: {
    width: 82,
    height: 82,
    borderRadius: 16,
    backgroundColor: '#0D6B42',
  },
  newsContentCol: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  newsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carouselTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  carouselTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  newsDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  newsCardDate: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '600',
  },
  newsCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 17,
    marginTop: 5,
  },
  newsCardSnippet: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 14,
    marginTop: 3,
  },
  newsActionCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    height: 5,
    borderRadius: 2.5,
  },
  dotActive: {
    width: 16,
    backgroundColor: '#18A165',
  },
  dotInactive: {
    width: 5,
    backgroundColor: '#CBD5E1',
  },
  seeAllTextBlue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitleBold: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.2,
  },
  familyBannerContainer: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 16,
  },
  familyBannerCard: {
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  familyBannerImg: {
    width: 100,
    height: 72,
    marginRight: 12,
  },
  familyBannerTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  familyBannerHeading: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#064E3B',
    lineHeight: 18,
  },
  familyBannerSubheading: {
    fontSize: 11,
    fontWeight: '500',
    color: '#047857',
    marginTop: 4,
    lineHeight: 15,
  },
  newsSectionContainer: {
    marginBottom: 18,
  },
  newsSectionHeaderRow: {
    paddingHorizontal: 16,
  },
  cleanNewsTrack: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: STUDENT_CARD_GAP,
  },
  cleanNewsCard: {
    borderRadius: 18,
    padding: 13,
    minHeight: 110,
    flexDirection: 'row',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  cleanNewsDecorCircle: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 88,
    height: 88,
    borderRadius: 44,
    zIndex: 0,
  },
  cleanNewsThumbnail: {
    width: 96,
    height: 86,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    zIndex: 1,
  },
  cleanNewsContentCol: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
    zIndex: 1,
  },
  cleanNewsTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 20,
    ...textShadowStyle('rgba(0, 0, 0, 0.15)', 0, 1, 2),
  },
  cleanNewsDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  cleanNewsDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DEF7EC',
  },
  newsEmptyStateClean: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activityTimelineCard: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  activityTimelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 11,
    backgroundColor: '#ECFDF5',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  activityTimelineHeaderCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 4,
  },
  activityTimelineHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  activityDayNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  activityDayNavBtnDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#F1F5F9',
    opacity: 0.4,
  },
  activityTodayBadge: {
    marginLeft: 4,
    backgroundColor: '#059669',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    flexShrink: 0,
  },
  activityTodayBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  activityTimelinePulseBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
    flexShrink: 0,
  },
  activityTimelineTitleCol: {
    flex: 1,
    justifyContent: 'center',
  },
  activityTimelineStudentName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#064E3B',
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  activityTimelineDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    flexShrink: 1,
  },
  activityTimelineDateTitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#059669',
    lineHeight: 14,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  activityTimelineSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
    flexShrink: 1,
  },
  activityTimelineHeaderRight: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  activityTimelineStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 14,
    gap: 4,
  },
  activityTimelineStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activityTimelineStatusPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  activityTimelineScrollArea: {
    maxHeight: 280,
  },
  activityTimelineFeedList: {
    width: '100%',
    paddingTop: 4,
    paddingRight: 2,
  },
  timelineRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  timelineColTime: {
    width: 46,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 6,
  },
  timelineTimeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  timelinePastDateText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  timelinePastTimeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },
  timelineColTrack: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    position: 'relative',
  },
  timelineTrackLineTop: {
    position: 'absolute',
    top: 0,
    bottom: '50%',
    width: 2,
    backgroundColor: '#34D399',
  },
  timelineTrackLineBottom: {
    position: 'absolute',
    top: '50%',
    bottom: 0,
    width: 2,
    backgroundColor: '#34D399',
  },
  timelineTrackLinePast: {
    backgroundColor: '#CBD5E1',
  },
  timelineTrackNodeRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#10B981',
    zIndex: 2,
  },
  timelineTrackNodeRingActive: {
    borderColor: '#10B981',
  },
  timelineTrackNodeRingPast: {
    borderColor: '#94A3B8',
  },
  timelineColCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#E8F5EE',
    borderLeftWidth: 3.5,
    borderLeftColor: '#10B981',
    marginLeft: 6,
    marginBottom: 6,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1.5,
  },
  timelineCardIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineCardTextCol: {
    flex: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  timelineCardTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  timelineCardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  timelineBadgeContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineBadgePill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 10,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  timelineBadgeRedDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  activityTimelineLoadingBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  activityTimelineLoadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  activityTimelineEmptyBox: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  activityTimelineEmptyTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#334155',
    marginTop: 4,
  },
  activityTimelineEmptySub: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
  },
  // Modal Detail Aktivitas Styles
  activityModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  activityModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  activityModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  activityModalIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityModalHeaderCol: {
    flex: 1,
    marginLeft: 12,
  },
  activityModalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  activityModalHeaderSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  activityModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityModalBody: {
    paddingVertical: 14,
  },
  activityModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  activityModalMainTitle: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
  },
  activityModalDescCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  activityModalDescLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activityModalDescText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 20,
  },
  activityModalInfoList: {
    gap: 10,
  },
  activityModalInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityModalInfoLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  activityModalInfoVal: {
    fontSize: 12.5,
    color: '#1E293B',
    fontWeight: '700',
    marginTop: 1,
  },
  activityModalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  activityModalPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  activityModalPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activityModalCloseActionBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityModalCloseActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  menuCardContainer: {
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingTop: 14,
    paddingBottom: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  menuSectionHeaderRow: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  menuTitleWithChildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 8,
  },
  selectedChildInlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BCF0DA',
    maxWidth: 155,
  },
  selectedChildInlineText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#084835',
  },
  menuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  menuHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#18A165',
  },
  menuItem: {
    width: (SCREEN_WIDTH - 32) / 4,
    alignItems: 'center',
  },
  menuCardTile: {
    width: Math.floor((SCREEN_WIDTH - 76) / 4),
    maxWidth: Math.floor((SCREEN_WIDTH - 76) / 4),
    minWidth: Math.floor((SCREEN_WIDTH - 76) / 4),
    borderRadius: 18,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  menuCardTileSpacer: {
    width: Math.floor((SCREEN_WIDTH - 76) / 4),
    maxWidth: Math.floor((SCREEN_WIDTH - 76) / 4),
    minWidth: Math.floor((SCREEN_WIDTH - 76) / 4),
  },
  menuIconCircleHalo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  menuTileTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
    textAlign: 'center',
    letterSpacing: -0.2,
    minHeight: 16,
  },
  menuTileSubtitle: {
    fontSize: 8.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1.5,
    textAlign: 'center',
    letterSpacing: -0.1,
    minHeight: 12,
  },
  iconSquircle: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  quoteBannerCard: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: 'hidden',
  },
  quoteSproutBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quoteText: {
    fontSize: 11.5,
    fontStyle: 'italic',
    fontWeight: '600',
    color: '#334155',
    lineHeight: 16,
    flex: 1,
    marginHorizontal: 10,
  },
  quoteIllustration: {
    width: 90,
    height: 55,
  },
  inlineLoader: {
    marginTop: 20,
    alignItems: 'center',
  },
  errorContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 12,
    color: '#B91C1C',
    textAlign: 'center',
  },
  newsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  newsModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  newsModalHeaderGradient: {
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  newsHeaderDecorWave: {
    position: 'absolute',
    top: -30,
    right: -10,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    transform: [{ scaleX: 1.3 }, { rotate: '-25deg' }],
  },
  newsHeaderDecorCircle: {
    position: 'absolute',
    bottom: -20,
    left: 30,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  newsModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  newsModalRoundcubeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  newsModalTitleCol: {
    flex: 1,
    marginHorizontal: 12,
  },
  newsModalEyebrow: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#D4F5E6',
  },
  newsModalTopTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  newsModalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  carouselTagBadgeModal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#084835',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  carouselTagTextModal: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  newsModalDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalDateTextClean: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  modalNewsCoverBox: {
    width: '100%',
    height: 210,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  modalNewsCoverImage: {
    width: '100%',
    height: '100%',
  },
  modalContent: {
    padding: 20,
    paddingBottom: 36,
  },
  modalMainTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 28,
  },
  modalDateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 6,
    marginBottom: 20,
  },
  modalBodyText: {
    fontSize: 14,
    lineHeight: 24,
    color: '#334155',
  },
  modalIllustrationFrame: {
    marginTop: 32,
    borderRadius: 16,
    overflow: 'hidden',
    height: 180,
  },
  illustrationGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationCaption: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
    letterSpacing: 1,
  },
  // Student Card Styles (Horizontal Swipeable & No Top Tab)
  studentCardContainer: {
    marginTop: 2,
    marginBottom: 4,
  },
  studentCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  studentCardHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studentCardHeaderIconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentCardHeaderTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#084835',
    letterSpacing: 0.2,
  },
  studentCardCountBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  studentCardCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#084835',
  },
  childSelectorChipsTrack: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  childChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  childChipBtnActive: {
    backgroundColor: '#084835',
    borderColor: '#084835',
  },
  childChipAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 6,
  },
  childChipAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  childChipAvatarText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  childChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  childChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  studentCardsTrack: {
    paddingHorizontal: 16,
    gap: STUDENT_CARD_GAP,
    paddingBottom: 4,
    zIndex: 1,
  },
  studentMainCard: {
    overflow: 'hidden',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    // Bayangan DIHAPUS total sesuai permintaan (berlaku juga untuk card bodi
    // karena memakai style yang sama).
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    position: 'relative',
  },
  cardDecorCircle: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 0,
  },
  studentCardTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    zIndex: 1,
  },
  studentUnitBadgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    flexShrink: 1,
    marginRight: 8,
  },
  studentCardProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    zIndex: 1,
  },
  studentCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  studentAvatarBox: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  studentAvatarInitial: {
    fontSize: 26,
    fontWeight: '900',
    color: '#084835',
  },
  studentInfoCol: {
    flex: 1,
  },
  studentNameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentFullName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  studentNisText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    marginTop: 2,
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentCardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 6,
  },
  studentQrBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  studentQrBtnText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#18A165',
    marginTop: 1,
  },
  studentAttributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1,
  },
  studentAttrBox: {
    flex: 1,
    alignItems: 'center',
  },
  studentAttrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  studentAttrLabel: {
    fontSize: 9.5,
    color: '#A7F3D0',
    fontWeight: '700',
  },
  studentAttrValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  studentPresensiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  presensiGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  studentAttrDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  studentCardActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    zIndex: 1,
  },
  studentActionBtnCard: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.28)',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  studentActionBtnCardText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  studentActionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.28)',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  studentActionBtnSecondaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  studentActionBtnPrimary: {
    flex: 0.85,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 58, 237, 0.28)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  studentActionBtnPrimaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7C3AED',
  },
  studentActionBtnClose: {
    backgroundColor: '#047857',
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  studentDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  studentDot: {
    height: 5,
    borderRadius: 2.5,
  },
  studentDotActive: {
    width: 16,
    backgroundColor: '#084835',
  },
  studentDotInactive: {
    width: 5,
    backgroundColor: '#CBD5E1',
  },
  monitoringStatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 16,
  },
  monitoringStatCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  monitoringStatIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  monitoringStatLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  monitoringStatValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  integratedMonitoringSection: {
    marginTop: 14,
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  integratedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  integratedIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  integratedTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E293B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  integratedSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  integratedTabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  integratedTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  integratedTabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  mutabaahGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mutabaahBox: {
    width: (SCREEN_WIDTH - 76) / 2,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  mutabaahBoxLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  mutabaahBoxValue: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  subTabDetailCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subTabDetailBadgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  subTabDetailTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  subTabDetailMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  statusPillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // QR Modal Styles
  qrModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  qrModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  qrModalHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  qrModalSub: {
    fontSize: 12,
    color: '#64748B',
  },
  qrModalCloseBtn: {
    padding: 6,
  },
  qrCodeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#DEF7EC',
    marginBottom: 14,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  qrStudentInfoBox: {
    alignItems: 'center',
    marginBottom: 12,
  },
  qrStudentName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  qrStudentNis: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  qrStudentUnit: {
    fontSize: 11,
    color: '#084835',
    fontWeight: '800',
    marginTop: 2,
  },
  qrHelpText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 16,
  },
  qrCloseActionBtn: {
    backgroundColor: '#084835',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  qrCloseActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ID Card Modal Styles
  idCardModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    padding: 18,
  },
  idCardModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 7,
  },
  idCardModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  idCardModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  idCardTabRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  idCardTabBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  idCardTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  idCardTabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  idCardTabBtnTextActive: {
    color: '#084835',
    fontWeight: '900',
  },
  idCardPreviewBox: {
    marginBottom: 16,
    alignItems: 'center',
  },
  idCardPhysical: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#084835',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  idCardTopBar: {
    backgroundColor: '#004D32',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  idCardLogoCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idCardOrgTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  idCardUnitTitle: {
    fontSize: 8,
    fontWeight: '700',
    color: '#A7F3D0',
  },
  idCardGoldStripe: {
    backgroundColor: '#E5A93C',
    paddingVertical: 3,
    alignItems: 'center',
  },
  idCardGoldStripeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#003822',
    letterSpacing: 0.8,
  },
  idCardBodyRow: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  idCardPhotoFrame: {
    width: 70,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#DEF7EC',
    borderWidth: 1.5,
    borderColor: '#004D32',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  idCardPhotoInitial: {
    fontSize: 32,
    fontWeight: '900',
    color: '#004D32',
  },
  idCardDetailsTable: {
    flex: 1,
    gap: 4,
  },
  idCardDetailItem: {
    flexDirection: 'row',
  },
  idCardDetailLabel: {
    width: 65,
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  idCardDetailVal: {
    flex: 1,
    fontSize: 10,
    color: '#1E293B',
    fontWeight: '700',
  },
  idCardDetailValBold: {
    flex: 1,
    fontSize: 11,
    color: '#004D32',
    fontWeight: '900',
  },
  idCardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  idCardMiniQr: {
    width: 48,
    height: 48,
  },
  idCardSignBox: {
    alignItems: 'flex-end',
  },
  idCardSignCity: {
    fontSize: 8,
    color: '#64748B',
  },
  idCardStampBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  idCardStampText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#059669',
  },
  idCardSignTitle: {
    fontSize: 8,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  idCardBackHeader: {
    backgroundColor: '#004D32',
    paddingVertical: 8,
    alignItems: 'center',
  },
  idCardBackHeading: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  idCardBackContent: {
    padding: 14,
    gap: 6,
  },
  idCardRuleItem: {
    fontSize: 9,
    color: '#334155',
    lineHeight: 14,
  },
  idCardBackFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    padding: 10,
    alignItems: 'center',
  },
  idCardBackAddress: {
    fontSize: 8,
    color: '#64748B',
    textAlign: 'center',
  },
  idCardBackWeb: {
    fontSize: 8,
    fontWeight: '800',
    color: '#004D32',
    marginTop: 2,
  },
  menuGridPage: {
    paddingTop: 2,
  },
  menuExpandedGrid: {
    paddingTop: 2,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  menuRowLast: {
    marginBottom: 2,
  },
  menuExpandIconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BCF0DA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  menuCollapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BCF0DA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  menuCollapseButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0D6B42',
  },
  menuDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  menuDot: {
    height: 5,
    borderRadius: 2.5,
  },
  menuDotActive: {
    width: 16,
    backgroundColor: '#18A165',
  },
  menuDotInactive: {
    width: 5,
    backgroundColor: '#CBD5E1',
  },
  allMenusModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: '85%',
    width: '100%',
  },
  allMenusModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  allMenusModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  allMenusModalSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  allMenusModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  allMenusGridScroll: {
    paddingVertical: 18,
    paddingBottom: 36,
  },
  allMenusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    rowGap: 18,
    columnGap: 8,
  },
  allMenusItem: {
    width: (SCREEN_WIDTH - 40 - 24) / 4,
    alignItems: 'center',
    paddingVertical: 2,
  },
  allMenusSolidSquircle: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  allMenusItemLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 14,
    height: 28,
  },
  studentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  idCardPhotoImg: {
    width: '100%',
    height: '100%',
  },
  // Web Dashboard Exact Replica Styles
  webCardFrame: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  webCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    height: 58,
    backgroundColor: '#FFFFFF',
  },
  webCardWaveLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '68%',
    height: 56,
    borderBottomRightRadius: 34,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    paddingLeft: 10,
    paddingRight: 14,
  },
  webCardLogoCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 8,
    padding: 2,
  },
  webCardLogoImg: {
    width: '100%',
    height: '100%',
  },
  webCardBrandCol: {
    flex: 1,
  },
  webCardYayasanLabel: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#D1FAE5',
  },
  webCardBrandName: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  webCardSchoolSub: {
    fontSize: 7.5,
    fontWeight: '600',
    color: '#A7F3D0',
  },
  webCardHeaderRight: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  webCardPillBadge: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3.5,
  },
  webCardPillText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  webCardMottoBox: {
    alignItems: 'flex-end',
    marginTop: 3,
  },
  webCardMottoText: {
    fontSize: 7.5,
    fontStyle: 'italic',
    fontWeight: '800',
  },
  webCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  webCardPhotoCol: {
    alignItems: 'center',
    width: 82,
    marginRight: 6,
  },
  webCardPhotoFrame: {
    width: 80,
    height: 94,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 2.5,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardPhotoImg: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
  },
  webCardPhotoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardPhotoFallbackText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  webCardUnitPill: {
    width: 80,
    height: 17,
    borderRadius: 8.5,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  webCardUnitPillText: {
    fontSize: 6.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  webCardDetailsCol: {
    flex: 1,
    paddingHorizontal: 4,
  },
  webCardStudentName: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  webCardOrnamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginVertical: 3.5,
    width: '95%',
  },
  webCardOrnamentLine: {
    flex: 1,
    height: 1.2,
  },
  webCardTable: {
    gap: 3,
  },
  webTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webTableIconBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  webTableLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#334155',
    width: 68,
  },
  webTableColon: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#64748B',
    width: 8,
  },
  webTableVal: {
    flex: 1,
    fontSize: 9,
    fontWeight: '800',
    color: '#0F172A',
  },
  webCardQrCol: {
    alignItems: 'center',
    width: 82,
    marginLeft: 4,
  },
  webCardQrBox: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardQrImg: {
    width: '100%',
    height: '100%',
  },
  webCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderTopWidth: 2.5,
  },
  webCardFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webCardMottoHeader: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  webCardMottoSub: {
    fontSize: 6.8,
    fontWeight: '600',
    color: '#D1FAE5',
  },
  webCardFooterDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  webCardFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  webCardWebText: {
    fontSize: 7.8,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  webCardBackContent: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  webCardBackHeading: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  webCardBackDivider: {
    height: 1.5,
    width: '100%',
    marginBottom: 6,
  },
  webCardBackList: {
    gap: 4,
  },
  webCardBackItem: {
    fontSize: 7.5,
    color: '#334155',
    lineHeight: 11,
  },
  webCardBackQrCol: {
    alignItems: 'center',
    width: 70,
  },
  webCardBackQrBox: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardBackQrSub: {
    fontSize: 6.5,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },
  webCardFooterAddress: {
    fontSize: 7.5,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  webCardFooterPhone: {
    fontSize: 7.5,
    color: '#D1FAE5',
    fontWeight: '700',
  },
  // ── Home Widget Container Cards (Full-Width List Style) ──
  homeWidgetCardContainer: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  homeWidgetCardContainerBlue: {
    borderColor: '#BFDBFE',
    shadowColor: '#2563EB',
  },
  homeWidgetCardContainerIndigo: {
    borderColor: '#C7D2FE',
    shadowColor: '#4F46E5',
  },
  homeWidgetCardContainerEmerald: {
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
  },
  homeWidgetCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 11,
    borderRadius: 13,
    borderWidth: 1,
  },
  homeWidgetCardHeaderRowBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  homeWidgetCardHeaderRowIndigo: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  homeWidgetCardHeaderRowEmerald: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  homeWidgetCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    marginRight: 8,
  },
  homeWidgetHeaderIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  homeWidgetHeaderIconBoxBlue: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
  },
  homeWidgetHeaderIconBoxIndigo: {
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
  },
  homeWidgetHeaderIconBoxEmerald: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  homeWidgetCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  homeWidgetCardSub: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 2,
  },
  homeWidgetActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  homeWidgetActionBadgeBlue: {
    backgroundColor: '#FFFFFF',
    borderColor: '#BFDBFE',
  },
  homeWidgetActionBadgeIndigo: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C7D2FE',
  },
  homeWidgetActionBadgeEmerald: {
    backgroundColor: '#FFFFFF',
    borderColor: '#A7F3D0',
  },
  homeWidgetActionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    marginRight: 2,
  },
  homeWidgetList: {
    gap: 8,
  },
  homeWidgetScrollArea: {
    maxHeight: 240,
  },
  homeWidgetListScrollContent: {
    gap: 8,
    paddingRight: 2,
    paddingBottom: 2,
  },
  homeWidgetListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderLeftWidth: 3.5,
  },
  homeWidgetListItemBlue: {
    backgroundColor: '#F8FAFC',
    borderColor: '#DBEAFE',
    borderLeftColor: '#2563EB',
  },
  homeWidgetListItemLate: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderLeftColor: '#DC2626',
  },
  homeWidgetListItemIndigo: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E0E7FF',
    borderLeftColor: '#4F46E5',
  },
  homeWidgetListItemOngoing: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderLeftColor: '#059669',
  },
  // ── Home News List Styles (Berita & Informasi Harmonized Card) ──
  homeNewsListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderLeftWidth: 3.5,
    backgroundColor: '#F8FAFC',
    borderColor: '#A7F3D0',
    borderLeftColor: '#059669',
    gap: 10,
  },
  homeNewsThumbnail: {
    width: 68,
    height: 68,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexShrink: 0,
  },
  homeNewsContentCol: {
    flex: 1,
    justifyContent: 'center',
  },
  homeNewsDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    gap: 3,
  },
  homeNewsDateText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
    lineHeight: 14,
  },
  homeNewsCategoryBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#A7F3D0',
    marginLeft: 3,
  },
  homeNewsCategoryText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#047857',
  },
  homeNewsTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 16.5,
    marginBottom: 2.5,
  },
  homeNewsExcerpt: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#475569',
    lineHeight: 14.5,
  },
  homeNewsActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexShrink: 0,
  },
  // ── News Carousel Card Styles (Unit-Filtered Slide Carousel) ──
  newsCarouselSlideCard: {
    width: SCREEN_WIDTH - 56,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
  },
  newsCarouselImageBox: {
    width: '100%',
    height: 140,
    position: 'relative',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  newsCarouselImage: {
    width: '100%',
    height: '100%',
  },
  newsCarouselBadgeOverlay: {
    display: 'none',
  },
  newsCarouselBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 6,
  },
  newsCarouselCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004D32',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  newsCarouselCategoryText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  newsCarouselUnitPill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 7,
    maxWidth: '65%',
  },
  newsCarouselUnitText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#065F46',
  },
  newsCarouselBody: {
    padding: 11,
  },
  newsCarouselDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  newsCarouselDateText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#059669',
  },
  newsCarouselTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 3.5,
  },
  newsCarouselExcerpt: {
    fontSize: 11,
    fontWeight: '500',
    color: '#475569',
    lineHeight: 15.5,
    marginBottom: 8,
  },
  newsCarouselFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  newsCarouselReadMoreText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  newsCarouselArrowBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  newsCarouselDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 5,
  },
  newsCarouselDot: {
    height: 5.5,
    borderRadius: 3,
  },
  newsCarouselDotActive: {
    width: 20,
    backgroundColor: '#059669',
  },
  newsCarouselDotInactive: {
    width: 6,
    backgroundColor: '#CBD5E1',
  },
  homeWidgetListIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  homeWidgetListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  homeWidgetListHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
    gap: 6,
  },
  homeWidgetListLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 14,
    flex: 1,
    marginRight: 6,
  },
  homeWidgetListTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  homeWidgetListTagText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  homeWidgetListTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginVertical: 2,
  },
  homeWidgetListSubText: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
  },
  homeWidgetDeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  homeWidgetDeadlineText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
    lineHeight: 14,
  },
  homeWidgetListActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  homeLivePulseDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
    marginRight: 4,
  },
  homeWidgetMoreFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    gap: 4,
  },
  homeWidgetMoreText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  homeWidgetEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
  },
  homeWidgetEmptyIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeWidgetEmptyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  homeWidgetEmptySubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  homeWidgetLoadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  // Milestone Schedule Styles
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  milestoneTimeCol: {
    width: 58,
    alignItems: 'flex-end',
    paddingTop: 2,
    paddingRight: 10,
  },
  milestoneTimeStart: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  milestoneTimeEnd: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  milestoneSessionPill: {
    marginTop: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  milestoneSessionText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  milestoneTrackCol: {
    width: 24,
    alignItems: 'center',
    alignSelf: 'stretch',
    position: 'relative',
  },
  milestoneTrackLineTop: {
    position: 'absolute',
    top: 0,
    bottom: '50%',
    width: 2,
    backgroundColor: '#E2E8F0',
  },
  milestoneTrackLineBottom: {
    position: 'absolute',
    top: '50%',
    bottom: 0,
    width: 2,
    backgroundColor: '#E2E8F0',
  },
  milestoneTrackLineActive: {
    backgroundColor: '#93C5FD',
  },
  milestoneTrackLinePast: {
    backgroundColor: '#CBD5E1',
  },
  milestoneNodeWrap: {
    marginTop: 2,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneNodeOngoing: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneNodeOngoingInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2563EB',
  },
  milestoneNodePast: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneNodeUpcoming: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
  },
  milestoneCardCol: {
    flex: 1,
    paddingLeft: 10,
  },
  milestoneCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  milestoneCardOngoing: {
    borderColor: '#2563EB',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
  },
  milestoneCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  milestoneSubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  milestoneSubjectIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  milestoneSubjectTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  milestoneStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  milestoneLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#2563EB',
    marginRight: 4,
  },
  milestoneStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  milestoneMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  milestoneMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  milestoneMetaText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
    marginLeft: 4,
  },
  milestoneAttendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  milestoneAttendanceText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
    marginLeft: 4,
  },

  hubContainer: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  hubHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 11,
    backgroundColor: '#ECFDF5',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  hubHeaderLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    marginRight: 8,
  },
  hubHeaderIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  hubHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#064E3B',
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  hubHeaderSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#059669',
    lineHeight: 14,
    marginTop: 2,
  },
  hubLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
    flexShrink: 0,
  },
  hubLivePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 5,
  },
  hubLiveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  hubList: {
    flexDirection: 'column',
    gap: 8,
  },
  hubListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.2,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1.5,
  },
  hubListItemEmerald: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderLeftColor: '#059669',
  },
  hubListItemBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderLeftColor: '#2563EB',
  },
  hubListItemTeal: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
    borderLeftColor: '#0D9488',
  },
  hubListItemPurple: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
    borderLeftColor: '#7E22CE',
  },
  hubListIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  hubListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  hubListHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
    gap: 6,
  },
  hubListLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 14,
    marginRight: 6,
  },
  hubListTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  hubListTagText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  hubListValue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginVertical: 2,
  },
  hubListSubText: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
  },
  hubListActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  hubVerifierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  hubVerifierText: {
    fontSize: 9,
    fontWeight: '800',
  },
  hubSholatPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  hubSholatPill: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  hubSholatPillDone: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  hubSholatPillSunnahDone: {
    backgroundColor: '#7C3AED',
    borderColor: '#6D28D9',
  },
  hubSholatPillPending: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  hubSholatPillText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#64748B',
  },
  hubSholatPillTextDone: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  hubPillVerifiedDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  hubOtherAgendasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  hubOtherAgendaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  hubOtherAgendaDone: {
    backgroundColor: '#F3E8FF',
    borderColor: '#D8B4FE',
  },
  hubOtherAgendaPending: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  hubOtherAgendaText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '500',
  },

  // Child Portal Menu Container Styles (Card Container)
  childPortalMenuContainer: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  childPortalMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 11,
    backgroundColor: '#ECFDF5',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  childPortalMenuHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    marginRight: 8,
  },
  childPortalMenuHeaderIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  childPortalMenuHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#064E3B',
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  childPortalMenuHeaderSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#059669',
    lineHeight: 14,
    marginTop: 2,
  },
  childPortalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexShrink: 0,
  },
  childPortalBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  childPortalMenuPage: {
    width: SCREEN_WIDTH - 56,
    flexDirection: 'column',
    gap: 8,
    paddingVertical: 0,
  },
  childPortalMenuRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 0,
  },
  childPortalCarouselItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  childPortalCarouselItemEmpty: {
    flex: 1,
  },
  childPortalPaginationDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
    paddingBottom: 2,
  },
  childPortalDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
  },
  childPortalDotActive: {
    width: 15,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#059669',
  },
  childPortalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  childPortalGridItem: {
    width: '25%',
    alignItems: 'center',
    paddingHorizontal: 1,
    paddingVertical: 2,
  },
  childPortalIconSquircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 2.5,
    elevation: 2,
  },
  childPortalMenuLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 13,
  },

  // ============================================================
  // PARENT DASHBOARD STYLES (UI/UX HARMONIZED SESUAI MOCKUP)
  // ============================================================
  parentMainContainer: {
    backgroundColor: '#ECFDF5',
    paddingBottom: 96,
    position: 'relative',
  },
  parentSheetBody: {
    backgroundColor: '#ECFDF5',
    paddingBottom: 0,
    minHeight: 0,
  },
  parentHomeBgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    width: '100%',
  },
  parentHomeBgFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  parentHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  parentBrandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  parentLogoBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  parentLogoImg: {
    width: 38,
    height: 38,
  },
  parentBrandTextCol: {
    marginLeft: 10,
    flex: 1,
  },
  parentSchoolTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
    letterSpacing: -0.3,
  },
  parentSchoolTagline: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 2,
  },
  parentHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  parentChildSwitchBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  parentBellBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  parentUnreadDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  parentAvatarBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#10B981',
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  parentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  parentHeroGreetingBox: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    width: '68%',
  },
  parentSalamText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2,
  },
  parentGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  parentGreetingText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: -0.4,
  },
  parentGreetingHand: {
    fontSize: 22,
    marginLeft: 4,
  },
  parentSubDescText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
    color: '#4B5563',
  },
  parentSelectChildCard: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  parentSelectChildTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  parentChildIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentChildTextCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
  },
  parentChildTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  parentChildSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#047857',
    marginTop: 3,
    lineHeight: 17,
  },
  parentChildChevronCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  parentSelectChildFullBtn: {
    backgroundColor: '#047857',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
    marginTop: 14,
  },
  parentSelectChildFullBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  parentSectionHeader: {
    marginHorizontal: 18,
    marginTop: 22,
    marginBottom: 10,
  },
  parentSectionTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  parentServicesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 14,
    gap: 8,
  },
  parentServiceCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  parentServiceIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  parentServiceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#004D32',
    textAlign: 'center',
  },
  parentEmptyChildCard: {
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  // Active Child Dashboard Styles (Sesuai Desain Lampiran)
  parentActiveTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  parentActiveBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  parentActiveChildDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  parentActiveAvatarWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  parentActiveInfoCol: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
    justifyContent: 'center',
  },
  parentActiveChildName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  parentActiveChildClass: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#047857',
    marginTop: 1,
    marginBottom: 6,
  },
  parentActiveMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  parentActiveUnitText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
    flexShrink: 1,
  },
  parentActiveClassText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
    flexShrink: 1,
  },
  parentActiveActionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  parentGantiAnakBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004D32',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 4,
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  parentGantiAnakBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  parentActiveAttendanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  parentActiveAttendanceText: {
    fontSize: 11,
    fontWeight: '800',
  },
  parentActiveSettingsBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  parentActiveHeroBox: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  parentActiveSalam: {
    fontSize: 13,
    fontWeight: '600',
    color: '#047857',
  },
  parentActiveAyahBunda: {
    fontSize: 22,
    fontWeight: '900',
    color: '#004D32',
    letterSpacing: -0.3,
  },
  parentActiveSummary: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#047857',
    marginTop: 3,
    lineHeight: 18,
  },
  parentActiveMenuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 14,
    rowGap: 12,
  },
  parentActiveMenuCard: {
    width: (SCREEN_WIDTH - 32 - 16) / 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  parentActiveIconHalo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  parentActiveTaskBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  parentActiveTaskBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  parentActiveMenuLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#004D32',
    textAlign: 'center',
  },
  parentSchedSectionHeader: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  parentSchedSectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  parentSchedSeeAllText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#047857',
  },
  parentSchedCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  parentSchedIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentSchedTime: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  parentSchedSubject: {
    fontSize: 15,
    fontWeight: '800',
    color: '#004D32',
    marginTop: 2,
  },
  parentSchedRoom: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  parentSchedEmptyCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 1.5,
  },
  parentSchedEmptyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentSchedEmptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#004D32',
  },
  parentSchedEmptySub: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  parentEmptyChildTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#004D32',
    marginBottom: 4,
    textAlign: 'center',
  },
  parentEmptyChildSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#047857',
    textAlign: 'center',
    lineHeight: 17,
  },
  parentBuildingCardOuter: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 14,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  parentBuildingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    overflow: 'hidden',
  },
  parentBuildingImage: {
    width: '100%',
    height: 155,
    backgroundColor: '#064E3B',
  },
  parentBuildingInfoCol: {
    padding: 16,
    alignItems: 'center',
  },
  parentBuildingTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#064E3B',
    textAlign: 'center',
    marginBottom: 4,
  },
  parentBuildingSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 6,
  },
  parentBuildingActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 6,
  },
  parentBuildingActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#004D32',
  },
  parentMenuGrid: {
    marginHorizontal: 16,
    marginTop: 14,
  },
  parentMenuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  parentMenuItem: {
    width: (SCREEN_WIDTH - 32 - 24) / 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  parentMenuIconHalo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  parentMenuLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  parentPromoBannerOuter: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  parentPromoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  parentPromoTextCol: {
    flex: 1.35,
    paddingRight: 8,
  },
  parentPromoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#064E3B',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  parentPromoSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#047857',
    marginTop: 5,
    lineHeight: 16,
  },
  parentPromoImageCol: {
    flex: 0.95,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentSchoolImage: {
    width: 105,
    height: 75,
    borderRadius: 12,
  },
  childSelectModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  childSelectModalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  childSelectModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  childSelectHeaderIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  childSelectModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#064E3B',
  },
  childSelectModalSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  childSelectCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childSelectItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  childSelectItemCardActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  childSelectAvatarBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  childSelectAvatarImg: {
    width: '100%',
    height: '100%',
  },
  childSelectName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
    marginRight: 6,
  },
  childSelectActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  childSelectActivePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  childSelectPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  childSelectPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  childSelectNisText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  childSelectCardBtn: {
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childSelectCardBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#065F46',
  },
});

