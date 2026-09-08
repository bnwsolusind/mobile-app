import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  LayoutAnimation,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  Platform,
  StatusBar,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { Card, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { API_BASE_URL, getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { useActiveChildStore } from '../stores/activeChildStore';
import { SafeRemoteImage } from '../components/SafeRemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  isFoundationRole,
  isParentRole,
  isPrincipalRole,
  isStudentRole,
  isSuperAdminRole,
  isTeacherRole,
  roleLabel,
} from '../utils/roles';
import {
  getProfileImageUrl,
  DEFAULT_PARENT_AVATAR,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { canAccessScreen } from '../utils/accessControl';

// Latar belakang header Sekolah Islam Terpadu & Masjid
const HEADER_MOSQUE_BG = require('../../assets/header_mosque_bg.png');
const SPLASH_LOGO = require('../../assets/launcher_source.png');

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
  'Al-Qur\'an': 'Baca & tilawah',
  'Doa & Dzikir': 'Amalan harian',
  'Kalender': 'Agenda kegiatan',
  'Informasi': 'Pengumuman',
  'Jadwal': 'Jadwal pelajaran',
  'Materi': 'Materi pembelajaran',
  'Tugas': 'Kerjakan tugas',
  'Tahfizh': 'Hafalan Al-Qur\'an',
  'Tahfiz': 'Hafalan Al-Qur\'an',
  'Nilai': 'Lihat hasil belajar',
  'Komentar': 'Saran & masukan',
  'Mutabaah': 'Pantau ibadah',
  'Absensi': 'Kehadiran siswa',
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
  'Data Siswa': 'Kelola siswa',
  'Keuangan': 'Kelola keuangan',
  'Surat': 'Persuratan',
  'Inventaris': 'Aset & barang',
  'Arsip': 'Arsip dokumen',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;
const CARD_WIDTH = SCREEN_WIDTH - 32;
const NEWS_CARD_WIDTH = SCREEN_WIDTH - 50;
const ITEM_SPACING = 12;

function isValidHex(color: string | undefined): boolean {
  if (!color || typeof color !== 'string') return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color.trim());
}

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

const NEWS_FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=400&q=80',
  'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=400&q=80',
  'https://images.unsplash.com/photo-1584697964190-7bb8514101e4?w=400&q=80',
  'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=400&q=80',
];

const getNewsThumbnail = (item: any, index: number = 0) => {
  const raw =
    item?.image_url ||
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

  const safeIndex = typeof item?._index === 'number' ? item._index : index;
  return { uri: NEWS_FALLBACK_IMAGES[Math.abs(safeIndex) % NEWS_FALLBACK_IMAGES.length] };
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

export default function HomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 16);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 18 : 10);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const mobileConfig = useMobileConfigStore((state) => state.config);
  const theme = mobileConfig.theme || {};

  const [dashboard, setDashboard] = useState<DashboardData>({});
  const [fetchedAnnouncements, setFetchedAnnouncements] = useState<any[]>([]);
  const [parentChildren, setParentChildren] = useState<any[]>([]);
  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);
  const studentScrollRef = useRef<ScrollView>(null);
  const studentCardWidth = useMemo(() => {
    return parentChildren.length > 1
      ? SCREEN_WIDTH - 16 - STUDENT_CARD_GAP - STUDENT_PEEK_WIDTH
      : SCREEN_WIDTH - 32;
  }, [parentChildren.length]);
  const studentSnapInterval = useMemo(() => {
    return studentCardWidth + STUDENT_CARD_GAP;
  }, [studentCardWidth]);
  const newsScrollRef = useRef<ScrollView>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [cardSetting, setCardSetting] = useState<any>(null);

  // Live Timeline Aktivitas Siswa (Fullday & Boarding) — dengan navigasi hari
  const [todayTimeline, setTodayTimeline] = useState<any>(null);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);
  const [activeTimelineTab, setActiveTimelineTab] = useState<'pelajaran' | 'sholat' | 'tahfizh' | 'mutabaah'>('pelajaran');
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  // viewedDate: tanggal yang sedang ditampilkan di timeline (default = hari ini)
  const todayDateStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [viewedDate, setViewedDate] = useState<string>(todayDateStr);

  const isViewingToday = viewedDate === todayDateStr;

  const goToPrevDay = useCallback(() => {
    setViewedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  }, []);

  const goToNextDay = useCallback(() => {
    setViewedDate(prev => {
      if (prev >= todayDateStr) return prev; // tidak bisa maju melampaui hari ini
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  }, [todayDateStr]);

  const fetchTodayTimeline = useCallback(async (childId?: string, date?: string) => {
    try {
      setLoadingTimeline(true);
      const res = await mobileApiService.getTodayLiveTimeline(childId, date);
      const data = unwrapApiData<any>(res);
      if (data) {
        setTodayTimeline(data);
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
  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const [homeSchedule, setHomeSchedule] = useState<any>(null);
  const [homeAssignments, setHomeAssignments] = useState<any[]>([]);
  const [homeTahfizh, setHomeTahfizh] = useState<any>(null);
  const [homeMutabaah, setHomeMutabaah] = useState<any>(null);
  const [homeAttendance, setHomeAttendance] = useState<any>(null);
  const [loadingHomeWidgets, setLoadingHomeWidgets] = useState(false);

  // Sinkronisasi activeChildIndex saat globalActiveChildId berubah dari luar (Portal/GradeScreen)
  useEffect(() => {
    if (globalActiveChildId && parentChildren.length > 0) {
      const idx = parentChildren.findIndex(
        (c) => String(c.id || c.student_id) === String(globalActiveChildId)
      );
      if (idx !== -1 && idx !== activeChildIndex) {
        setActiveChildIndex(idx);
        studentScrollRef.current?.scrollTo({
          x: idx * studentSnapInterval,
          animated: true,
        });
      }
    }
  }, [globalActiveChildId, parentChildren, studentSnapInterval]);

  const fetchHomeWidgets = useCallback(async (childId?: string) => {
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
        mobileApiService.getPortalAssignments({ child_id: childId, per_page: 20 }),
        mobileApiService.getPortalTahfizh({ student_id: childId, per_page: 5 }),
        mobileApiService.getPortalMutabaah(childId, todayStr),
        mobileApiService.getPortalAttendance(childId),
      ]);

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
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);
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
  const [selectedPortalChild, setSelectedPortalChild] = useState<any>(null);

  // Modal Notifikasi & Pengingat Akademik Siswa (Tugas LMS, Ujian CBT, Kuis)
  const [showStudentNotificationModal, setShowStudentNotificationModal] = useState<boolean>(false);
  const [selectedNotificationStudent, setSelectedNotificationStudent] = useState<any>(null);
  const [studentNotificationsLoading, setStudentNotificationsLoading] = useState<boolean>(false);
  const [studentAssignmentsList, setStudentAssignmentsList] = useState<any[]>([]);
  const [studentCbtList, setStudentCbtList] = useState<any[]>([]);
  const [studentNotifFilter, setStudentNotifFilter] = useState<'all' | 'tugas' | 'cbt' | 'pengumuman'>('all');

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
      setShowChildPortalModal(false);
      const childId = selectedPortalChild?.id || selectedPortalChild?.student_id;
      const isGeneralIslamic = route === 'Quran' || route === 'DoaDzikir';
      const navParams: Record<string, any> = {};
      if (tabKey) {
        navParams.tab = String(tabKey);
      }
      if (childId && !isGeneralIslamic) {
        navParams.child_id = String(childId);
        navParams.student_id = String(childId);
        navParams.single_child_only = true;
      }
      navigation.navigate(
        String(route),
        Object.keys(navParams).length > 0 ? navParams : undefined
      );
    },
    [selectedPortalChild, navigation]
  );

  const childPortalMenus = useMemo(() => [
    { label: 'Jadwal', icon: 'clock-time-four', color: '#7C3AED', bg: '#F5F3FF', route: 'Jadwal' },
    { label: 'Tugas LMS', icon: 'clipboard-text', color: '#F59E0B', bg: '#FEF9EC', route: 'Tugas' },
    { label: 'Materi', icon: 'book-multiple', color: '#059669', bg: '#ECFDF5', route: 'Materi' },
    { label: 'Nilai & Rapor', icon: 'chart-box', color: '#0D9488', bg: '#E6FFFA', route: 'Nilai' },
    { label: 'Tahfizh', icon: 'book-marker', color: '#2563EB', bg: '#EFF6FF', route: 'Tahfizh' },
    { label: 'Mutaba’ah', icon: 'clipboard-check', color: '#F59E0B', bg: '#FEF9EC', route: 'Mutabaah' },
    { label: 'Setoran', icon: 'book-check-outline', color: '#059669', bg: '#ECFDF5', route: 'Orang Tua', tab: 'setoran' },
    { label: 'Target', icon: 'trophy-outline', color: '#0D9488', bg: '#CCFBF1', route: 'Orang Tua', tab: 'target' },
    { label: 'Presensi', icon: 'account-check', color: '#7C3AED', bg: '#F5F3FF', route: 'Absensi' },
    { label: 'Izin Sakit', icon: 'hand-heart-outline', color: '#2563EB', bg: '#EFF6FF', route: 'Orang Tua', tab: 'ortu' },
    { label: 'Kisi-kisi', icon: 'file-question', color: '#EF4444', bg: '#FEF2F2', route: 'KisiKisi' },
    { label: 'Ujian CBT', icon: 'laptop', color: '#2563EB', bg: '#EFF6FF', route: 'CbtExams' },
  ], []);
  const [imageError, setImageError] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [activeMenuPage, setActiveMenuPage] = useState(0);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [showAllMenusModal, setShowAllMenusModal] = useState(false);

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
  const stickyOpacity = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [35, 80],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  const stickyTranslateY = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [0, 34.9, 35, 80],
      outputRange: [-200, -200, -14, 0],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  // Gunakan useNativeDriver: true agar animasi berjalan di UI thread tanpa lag JS bridge
  const handleMainScroll = useMemo(() => {
    return Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      { useNativeDriver: true }
    );
  }, [scrollY]);



  const rolesKey = (roles || []).join(',');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    const uid = useAuthStore.getState().user?.id;
    const cacheKeyDash = offlineCache.buildKey('home_dashboard', uid);
    const cacheKeyAnn  = offlineCache.buildKey('home_announcements', uid);
    const cacheKeyChildren = offlineCache.buildKey('home_children', uid);

    // 1. Baca cache dulu — tampil instan saat offline
    const [cachedDash, cachedAnn, cachedChildren] = await Promise.all([
      offlineCache.get<DashboardData>(cacheKeyDash),
      offlineCache.get<any[]>(cacheKeyAnn),
      offlineCache.get<any[]>(cacheKeyChildren),
    ]);
    if (cachedDash) setDashboard(cachedDash);
    if (cachedAnn && cachedAnn.length > 0) setFetchedAnnouncements(cachedAnn);
    if (cachedChildren && cachedChildren.length > 0) {
      setParentChildren(cachedChildren);
      useActiveChildStore.getState().setChildren(cachedChildren);
      const gid = useActiveChildStore.getState().activeChildId;
      if (gid) {
        const found = cachedChildren.findIndex((c) => String(c.id || c.student_id) === String(gid));
        if (found !== -1) setActiveChildIndex(found);
      }
    }

    // 2. Fetch dari backend
    try {
      const currentRoles = useAuthStore.getState().roles;
      const [dashRes, profRes, infoRes, notifRes, childrenRes] = await Promise.allSettled([
        mobileApiService.getRoleDashboard(currentRoles),
        mobileApiService.getProfile(),
        mobileApiService.getSchoolInformation({ per_page: 10 }),
        mobileApiService.getNotifications(),
        mobileApiService.getPortalChildren(),
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
        }
      }
      if (infoRes.status === 'fulfilled') {
        const infoList = unwrapCollection<any>(infoRes.value);
        if (Array.isArray(infoList) && infoList.length > 0) {
          setFetchedAnnouncements(infoList);
          void offlineCache.set(cacheKeyAnn, infoList);
        }
      }
      if (notifRes.status === 'fulfilled') {
        const notifData = unwrapCollection<any>(notifRes.value);
        if (Array.isArray(notifData)) {
          const unread = notifData.filter((n: any) => !n.read_at && !n.is_read).length;
          setUnreadNotificationCount(unread > 0 ? unread : 0);
        }
      }
      if (childrenRes.status === 'fulfilled') {
        const chList = unwrapApiData<any[]>(childrenRes.value) || [];
        if (Array.isArray(chList)) {
          setParentChildren(chList);
          useActiveChildStore.getState().setChildren(chList);
          const gid = useActiveChildStore.getState().activeChildId;
          let curIdx = activeChildIndex;
          if (gid) {
            const found = chList.findIndex((c) => String(c.id || c.student_id) === String(gid));
            if (found !== -1) {
              curIdx = found;
              setActiveChildIndex(found);
            }
          }
          if (chList.length > 0) {
            void offlineCache.set(cacheKeyChildren, chList);
            const curActive = chList[curIdx] || chList[0];
            const curId = curActive?.id || curActive?.student_id;
            if (curId) {
              void fetchTodayTimeline(curId);
              void fetchHomeWidgets(curId);
            }
          } else {
            void fetchTodayTimeline(undefined);
            void fetchHomeWidgets(undefined);
          }
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

  const foundation = isFoundationRole(roles);
  const superAdmin = isSuperAdminRole(roles);
  const principal = isPrincipalRole(roles);
  const teacher = isTeacherRole(roles);
  const parent = isParentRole(roles);
  const student = isStudentRole(roles);

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

  const studentClass = dashboard?.student?.kelas?.nama_kelas || user?.kelas || '';
  const subGreeting = student
    ? studentClass ? `${studentClass} · Siswa` : 'Siswa'
    : parent
    ? `Orang Tua dari ${user?.student_name || 'Siswa'}`
    : teacher
    ? 'Guru Pengajar'
    : principal
    ? 'Kepala Sekolah'
    : foundation || superAdmin
    ? 'Divisi Pendidikan'
    : 'Tata Usaha';

  // 4-Column Dynamic Menus Mapped Per Role (Mockup #4)
  const roleMenus = useMemo(() => {
    if (principal) {
      return [
        ['Dashboard', 'view-dashboard-outline', '#059669', '#E6F4EA', 'Data'],
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#E6F4EA', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#0D9488', '#E6FFFA', 'DoaDzikir'],
        ['Absensi', 'calendar-check-outline', '#0D9488', '#E6FFFA', 'Absensi'],
        ['Tahfiz', 'book-open-page-variant', '#10B981', '#ECFDF5', 'Lainnya'],
        ['Mutabaah', 'check-decagram-outline', '#047857', '#DEF7EC', 'Lainnya'],
        ['Akademik', 'school-outline', '#3B82F6', '#EFF6FF', 'Data'],
        ['Laporan', 'file-chart-outline', '#F59E0B', '#FEF3C7', 'Data'],
        ['Prestasi', 'trophy-outline', '#D97706', '#FFFBEB', 'Data'],
        ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
      ];
    }
    if (foundation || superAdmin) {
      return [
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#E6F4EA', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#0D9488', '#E6FFFA', 'DoaDzikir'],
        ['Kalender', 'calendar-month-outline', '#0891B2', '#CFFAFE', 'Kalender'],
        ['Monev', 'chart-box-outline', '#4F46E5', '#EEF2FF', 'Data'],
        ['Tahfiz', 'book-open-page-variant', '#10B981', '#ECFDF5', 'Lainnya'],
        ['Mutabaah', 'check-decagram-outline', '#059669', '#E6F4EA', 'Lainnya'],
        ['Akademik', 'school-outline', '#2563EB', '#EFF6FF', 'Data'],
        ['Rapor', 'certificate-outline', '#0891B2', '#ECFEFF', 'Data'],
        ['Laporan', 'file-chart-outline', '#F59E0B', '#FEF3C7', 'Data'],
        ['Monitoring', 'monitor-dashboard', '#7C3AED', '#F5F3FF', 'Data'],
        ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
      ];
    }
    if (teacher) {
      return [
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
        ['Kalender', 'calendar-month', '#2563EB', '#EFF6FF', 'Kalender'],
        ['Absensi', 'account-check', '#7C3AED', '#F5F3FF', 'Absensi'],
        ['Tahfiz', 'book-marker', '#2563EB', '#EFF6FF', 'Tahfizh'],
        ['Mutabaah', 'clipboard-check', '#F59E0B', '#FEF9EC', 'Guru'],
        ['Tugas', 'clipboard-text', '#F59E0B', '#FEF9EC', 'Tugas'],
        ['Nilai', 'chart-box', '#10B981', '#E8FAF2', 'Guru'],
        ['Informasi', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Jadwal', 'clock-time-four', '#7C3AED', '#F5F3FF', 'Jadwal'],
        ['Materi', 'book-multiple', '#059669', '#ECFDF5', 'Materi'],
        ['Pengaturan', 'cog', '#64748B', '#F8FAFC', 'Lainnya'],
      ];
    }
    if (parent) {
      return [
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
        ['Kalender', 'calendar-month', '#2563EB', '#EFF6FF', 'Kalender'],
        ['Informasi', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Jadwal', 'clock-time-four', '#7C3AED', '#F5F3FF', 'Jadwal'],
        ['Materi', 'book-multiple', '#059669', '#ECFDF5', 'Materi'],
        ['Tugas', 'clipboard-text', '#F59E0B', '#FEF9EC', 'Tugas'],
        ['Tahfizh', 'book-marker', '#2563EB', '#EFF6FF', 'Tahfizh'],
        ['Nilai', 'chart-box', '#10B981', '#E8FAF2', 'Nilai'],
        ['Komentar', 'chat-processing', '#2563EB', '#EFF6FF', 'Komentar'],
        ['Mutabaah', 'clipboard-check', '#F59E0B', '#FEF9EC', 'Mutabaah'],
        ['Absensi', 'account-check', '#7C3AED', '#F5F3FF', 'Absensi'],
        ['Kisi-kisi', 'file-question', '#EF4444', '#FEF2F2', 'KisiKisi'],
        ['Ujian CBT', 'laptop', '#2563EB', '#EFF6FF', 'CbtExams'],
        ['Hasil Rapor', 'file-certificate', '#059669', '#ECFDF5', 'Nilai'],
      ];
    }
    if (student) {
      return [
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
        ['Kalender', 'calendar-month', '#2563EB', '#EFF6FF', 'Kalender'],
        ['Informasi', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Jadwal', 'clock-time-four', '#7C3AED', '#F5F3FF', 'Jadwal'],
        ['Materi', 'book-multiple', '#059669', '#ECFDF5', 'Materi'],
        ['Tugas', 'clipboard-text', '#F59E0B', '#FEF9EC', 'Tugas'],
        ['Tahfiz', 'book-marker', '#2563EB', '#EFF6FF', 'Tahfizh'],
        ['Nilai', 'chart-box', '#10B981', '#E8FAF2', 'Nilai'],
        ['Absensi', 'account-check', '#7C3AED', '#F5F3FF', 'Absensi'],
        ['Mutabaah', 'clipboard-check', '#F59E0B', '#FEF9EC', 'Mutabaah'],
        ['Kisi-kisi', 'file-question', '#EF4444', '#FEF2F2', 'KisiKisi'],
        ['Ujian CBT', 'laptop', '#2563EB', '#EFF6FF', 'CbtExams'],
        ['Hasil Rapor', 'file-certificate', '#059669', '#ECFDF5', 'Nilai'],
      ];
    }
    // Default Tata Usaha / Staff
    return [
      ['Al-Qur\'an', 'book-open-variant', '#059669', '#E6F4EA', 'Quran'],
      ['Doa & Dzikir', 'hands-pray', '#0D9488', '#E6FFFA', 'DoaDzikir'],
      ['Data Siswa', 'account-group-outline', '#059669', '#E6F4EA', 'Data'],
      ['Absensi', 'calendar-check-outline', '#0D9488', '#E6FFFA', 'Absensi'],
      ['Keuangan', 'cash-multiple', '#F59E0B', '#FEF3C7', 'Data'],
      ['Surat', 'email-newsletter', '#047857', '#DEF7EC', 'Data'],
      ['Inventaris', 'archive-outline', '#2563EB', '#EFF6FF', 'Data'],
      ['Laporan', 'file-chart-outline', '#EA580C', '#FFF7ED', 'Data'],
      ['Arsip', 'folder-file-outline', '#7C3AED', '#F5F3FF', 'Data'],
      ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
    ];
  }, [principal, foundation, superAdmin, teacher, parent, student]);

  const primaryMenuItems = useMemo(() => {
    const top7 = roleMenus.slice(0, 7);
    const toggleTile = isMenuExpanded
      ? ['Kembali', 'chevron-up', '#047857', '#DEF7EC', '__TOGGLE__']
      : ['Lainnya', 'view-grid-plus-outline', '#10B981', '#ECFDF5', '__TOGGLE__'];
    return [...top7, toggleTile];
  }, [roleMenus, isMenuExpanded]);

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
      }
      if (parent && activeChildId && !isGeneralIslamic) {
        navParams.child_id = String(activeChildId);
        navParams.student_id = String(activeChildId);
        navParams.single_child_only = true;
      }

      navigation.navigate(
        String(route),
        Object.keys(navParams).length > 0 ? navParams : undefined
      );
    },
    [parent, parentChildren, activeChildIndex, navigation]
  );

  const isMultiNewsCentered = announcements.length > 3;

  const newsGap = isMultiNewsCentered ? 10 : STUDENT_CARD_GAP;

  const newsCardWidth = useMemo(() => {
    if (announcements.length === 0) return SCREEN_WIDTH - 32;
    if (announcements.length === 1) return SCREEN_WIDTH - 32;
    if (isMultiNewsCentered) {
      // Jika > 3 card berita: tampilkan potongan kartu terpotong di kiri & kanan (centered peek carousel)
      return SCREEN_WIDTH - 64;
    }
    // Jika 2 atau 3 card berita: kartu panjang dengan cuplikan di sebelah kanan
    return SCREEN_WIDTH - 16 - STUDENT_CARD_GAP - STUDENT_PEEK_WIDTH;
  }, [announcements.length, isMultiNewsCentered]);

  const newsSnapInterval = useMemo(() => {
    return newsCardWidth + newsGap;
  }, [newsCardWidth, newsGap]);

  const newsTrackPaddingHorizontal = useMemo(() => {
    if (announcements.length <= 1) return 16;
    if (isMultiNewsCentered) {
      return Math.round((SCREEN_WIDTH - newsCardWidth) / 2); // 32px (10px gap + 22px peek)
    }
    return 16;
  }, [announcements.length, isMultiNewsCentered, newsCardWidth]);

  const handleCarouselScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / newsSnapInterval);
    if (index !== activeSlideIndex && index >= 0 && index < announcements.length) {
      setActiveSlideIndex(index);
    }
  };

  const activeStudent = parentChildren[activeChildIndex];
  const activeChildId = activeStudent ? String(activeStudent.id || activeStudent.student_id || '') : undefined;

  // Re-fetch saat child atau tanggal yang dilihat berubah
  useEffect(() => {
    void fetchTodayTimeline(activeChildId, viewedDate);
  }, [activeChildId, viewedDate, fetchTodayTimeline]);

  // Fetch widget tugas & jadwal hari ini saat child aktif berubah
  useEffect(() => {
    void fetchHomeWidgets(activeChildId);
  }, [activeChildId, fetchHomeWidgets]);

  const activeChildName = activeStudent?.full_name || activeStudent?.nama_lengkap || activeStudent?.name || '';
  const activeChildPhoto = activeStudent ? getProfileImageUrl(activeStudent) : null;
  const activeChildGender = activeStudent?.gender || activeStudent?.jenis_kelamin;
  const isFemaleStudent = activeChildGender === 'female' || activeChildGender === 'P';
  const defaultStudentAvatar = isFemaleStudent ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;

  const stickyDisplayName = parent && activeChildName ? activeChildName : `${name} 👋`;
  const stickyAvatarSource = useMemo(() => {
    if (parent && activeStudent) {
      if (activeChildPhoto) return { uri: activeChildPhoto };
      return defaultStudentAvatar;
    }
    if (profileImageUrl && !imageError) return { uri: String(profileImageUrl) };
    return DEFAULT_PARENT_AVATAR;
  }, [parent, activeStudent, activeChildPhoto, defaultStudentAvatar, profileImageUrl, imageError]);

  // Data Rangkuman Harian Ananda (Executive 360° Hub)
  const hubAttendanceData = useMemo(() => {
    const rawAtt =
      activeStudent?.attendance_today ||
      activeStudent?.presensi_hari_ini ||
      homeAttendance?.today ||
      homeAttendance ||
      todayTimeline?.attendance;

    const rawStatus = String(rawAtt?.status || rawAtt?.attendance_status || '').toLowerCase();
    let label = 'Belum Presensi';
    let color = '#64748B';
    let timeText = rawAtt?.time || rawAtt?.check_in_time || rawAtt?.jam_masuk || 'Hari ini';

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
    const items = Array.isArray(m?.items) ? m.items : Array.isArray(m?.prayers) ? m.prayers : Array.isArray(m) ? m : [];

    const isPrayerDone = (pName: string) => {
      const match = items.find((i: any) =>
        String(i.name || i.nama || i.key || '').toLowerCase().includes(pName)
      );
      if (match) {
        return Boolean(match.is_done || match.status === 'completed' || match.value === 1 || match.status === 'sudah');
      }
      if (m && typeof m === 'object') {
        const val = m[pName] || m[`shalat_${pName}`];
        if (val) return Boolean(val.is_done || val === true || val === 1 || val === 'completed');
      }
      return false;
    };

    const prayers = [
      { key: 'S', name: 'subuh', done: isPrayerDone('subuh') },
      { key: 'D', name: 'dzuhur', done: isPrayerDone('dzuhur') },
      { key: 'A', name: 'ashar', done: isPrayerDone('ashar') },
      { key: 'M', name: 'maghrib', done: isPrayerDone('maghrib') },
      { key: 'I', name: 'isya', done: isPrayerDone('isya') },
    ];

    const doneCount = prayers.filter((p) => p.done).length;
    return {
      ratioText: `${doneCount}/5 Shalat`,
      prayers,
      note: doneCount === 5 ? 'Alhamdulillah lengkap' : `${5 - doneCount} waktu shalat tersisa`,
    };
  }, [homeMutabaah, todayTimeline]);

  return (
    <View style={styles.safeArea}>
      {/* 1. STICKY COMPACT APP BAR (Hanya Avatar Profil, Nama, dan Icon Bell saat di-scroll) */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.stickyHeaderBar,
          {
            paddingTop: topInset + 6,
            opacity: stickyOpacity,
            transform: [{ translateY: stickyTranslateY }],
          },
        ]}
      >
        {/* Latar Belakang Gambar Masjid (Sama persis dengan header atas) */}
        <Image
          source={HEADER_MOSQUE_BG}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        {/* Overlay gradien halus persis seperti header atas */}
        <LinearGradient
          colors={['rgba(8, 90, 56, 0.35)', 'rgba(10, 100, 65, 0.08)', 'rgba(52, 211, 153, 0.12)']}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerDecorWave} />
        <View style={styles.headerDecorCircle} />

        <View style={styles.stickyHeaderContent}>
          {/* Avatar Profil / Siswa Terpilih + Nama */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              if (parent && activeStudent) {
                setSelectedIdCardStudent(activeStudent);
              } else {
                navigation.navigate('Profil');
              }
            }}
            style={styles.stickyUserRow}
          >
            <View style={styles.stickyAvatarWrap}>
              <Image
                source={stickyAvatarSource}
                style={styles.stickyAvatarImg}
                resizeMode="cover"
              />
            </View>
            <View style={styles.stickyTextCol}>
              {parent && activeChildName ? (
                <Text style={styles.stickyRoleTagText}>Siswa Terpilih</Text>
              ) : null}
              <Text numberOfLines={1} style={styles.stickyUserName}>
                {stickyDisplayName}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Bell Icon Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Notifikasi')}
            style={styles.stickyBellBtn}
            accessibilityLabel="Notifikasi"
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color="#054835" />
            {unreadNotificationCount > 0 && (
              <View style={styles.unreadBadgeDot} />
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* 2. MAIN SCROLLABLE DASHBOARD BODY */}
      <Animated.ScrollView
        style={styles.screen}
        contentContainerStyle={styles.mainScrollContent}
        onScroll={handleMainScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            colors={['#084835']}
            progressViewOffset={topInset + 10}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ============================================================ */}
        {/* HEADER DENGAN GAMBAR BACKGROUND: Greeting + Anak Saya        */}
        {/* ============================================================ */}
        <View style={[styles.extendedHeaderGradient, { paddingTop: topInset + 8 }]}>
          {/* Latar Belakang Gambar Masjid */}
          <Image
            source={HEADER_MOSQUE_BG}
            style={[StyleSheet.absoluteFill, styles.headerMosqueBgImage]}
            resizeMode="cover"
          />
          {/* Overlay gradien halus agar teks putih tetap tajam & kontras */}
          <LinearGradient
            colors={['rgba(8, 90, 56, 0.35)', 'rgba(10, 100, 65, 0.08)', 'rgba(52, 211, 153, 0.12)']}
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
                <Text style={styles.headerWelcomeText}>Selamat Datang</Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={styles.headerAppTitleText}
                >
                  DI SIMSIT DAR EL - IMAN
                </Text>
              </View>
            </View>

            {/* Header Right Actions: Login Avatar + Notification Bell */}
            <View style={styles.headerActionBtnsRow}>
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

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation.navigate('Notifikasi')}
                style={styles.bellButton}
                accessibilityLabel="Notifikasi"
              >
                <MaterialCommunityIcons name="bell-outline" size={20} color="#18A165" />
                {unreadNotificationCount > 0 && (
                  <View style={styles.unreadBadgeDot} />
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* SECTION: Kartu Data Siswa (Di dalam Header Hijau Penuh) */}
          {parentChildren.length > 0 && (
            <View style={styles.studentCardContainerInHeader}>
              {/* Latar Belakang 2 Warna: Setengah Gambar Header, Setengah Container Body #EBF8F2 */}
              <View style={styles.bodyOverlapBackdrop} pointerEvents="none">
                <View style={styles.bodyOverlapSheet} />
              </View>

            {/* Horizontal Scrollable Track of Student Cards */}
            <ScrollView
              ref={studentScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.studentCardsTrack}
              decelerationRate="fast"
              snapToInterval={studentSnapInterval}
              onScroll={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const idx = Math.round(offsetX / studentSnapInterval);
                if (idx !== activeChildIndex && idx >= 0 && idx < parentChildren.length) {
                  setActiveChildIndex(idx);
                  const selChild = parentChildren[idx];
                  const sid = selChild?.id || selChild?.student_id;
                  if (sid) useActiveChildStore.getState().setActiveChildId(sid);
                }
              }}
              scrollEventThrottle={16}
            >
              {parentChildren.map((student: any, sIdx: number) => {
                const sName = student.full_name || student.nama_lengkap || student.name || 'Siswa';
                const sNis = student.nis || '-';
                const sNisn = student.nisn || student.metadata?.nisn || '-';
                const sUnit = student.education_unit?.name || student.unit_name || 'Unit Pendidikan';
                const sKelas = student.kelas?.nama_kelas || student.kelas?.name || student.class_name || 'Kelas Belum Ditentukan';
                const sJenjang = student.kelas?.jenjang || student.education_unit?.level || 'Terpadu';
                const rawPresensi =
                  student.attendance_today?.status ||
                  student.presensi_hari_ini?.status ||
                  student.attendance_status ||
                  student.status_kehadiran ||
                  student.presensi_status ||
                  (String(todayTimeline?.student?.id || '') === String(student.id || '') ? todayTimeline?.summary?.attendance_status : undefined) ||
                  'Hadir';
                const isHadir = String(rawPresensi).toLowerCase().includes('hadir');
                const isIzinSakit = String(rawPresensi).toLowerCase().includes('izin') || String(rawPresensi).toLowerCase().includes('sakit');
                const isTerlambat = String(rawPresensi).toLowerCase().includes('terlambat') || String(rawPresensi).toLowerCase().includes('alpha');
                const presensiTextColor = isHadir ? '#DEF7EC' : isIzinSakit ? '#FEF08A' : isTerlambat ? '#FECACA' : '#E2E8F0';
                const presensiDotColor = isHadir ? '#10B981' : isIzinSakit ? '#F59E0B' : isTerlambat ? '#EF4444' : '#94A3B8';

                return (
                  <LinearGradient
                    key={String(student.id || sIdx)}
                    colors={['#0D6B42', '#18A165', '#2BD988']}
                    locations={[0, 0.55, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.studentMainCard,
                      { width: studentCardWidth },
                    ]}
                  >
                    {/* Decorative Blob Like Header */}
                    <View style={styles.cardDecorCircle} />

                    {/* Card Top Row: Avatar + Info + QR Icon */}
                    <View style={styles.studentCardTopRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedIdCardStudent(student)}
                        style={styles.studentAvatarBox}
                      >
                        {getProfileImageUrl(student) ? (
                          <Image
                            source={{ uri: getProfileImageUrl(student)! }}
                            style={styles.studentAvatarImg}
                            resizeMode="cover"
                          />
                        ) : (
                          <Image
                            source={
                              student?.gender === 'female' ||
                              student?.jenis_kelamin === 'P' ||
                              student?.jenis_kelamin === 'female' ||
                              student?.gender === 'P'
                                ? DEFAULT_STUDENT_GIRL_AVATAR
                                : DEFAULT_STUDENT_BOY_AVATAR
                            }
                            style={styles.studentAvatarImg}
                            resizeMode="cover"
                          />
                        )}
                      </TouchableOpacity>

                       <View style={styles.studentInfoCol}>
                        <View style={styles.studentNameBadgeRow}>
                          <Text numberOfLines={1} style={styles.studentFullName}>
                            {sName}
                          </Text>
                        </View>

                        <Text style={styles.studentNisText}>
                          NIS: {sNis} {sNisn !== '-' ? '· NISN: ' + sNisn : ''}
                        </Text>

                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {sUnit}
                          </Text>
                        </View>
                      </View>

                      {/* Icon Buttons Siswa: Notifikasi Akademik (Bel) & QR Code */}
                      <View style={styles.studentCardHeaderActions}>
                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => void handleOpenStudentNotifications(student)}
                          style={styles.studentQrBtn}
                          accessibilityLabel="Pengingat & Notifikasi Siswa"
                        >
                          <MaterialCommunityIcons name="bell-ring-outline" size={19} color="#18A165" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => setSelectedQrStudent(student)}
                          style={styles.studentQrBtn}
                          accessibilityLabel="Tampilkan QR Code Siswa"
                        >
                          <MaterialCommunityIcons name="qrcode-scan" size={19} color="#18A165" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Card Middle: Key Student Attributes (Glassmorphism Box with Icons) */}
                    <View style={styles.studentAttributesGrid}>
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Kelas</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{sKelas}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Jenjang</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{sJenjang}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Presensi</Text>
                        </View>
                        <View style={styles.studentPresensiValueRow}>
                          <Text numberOfLines={1} style={[styles.studentAttrValue, { color: presensiTextColor }]}>{rawPresensi}</Text>
                          <View style={[styles.presensiGreenDot, { backgroundColor: presensiDotColor }]} />
                        </View>
                      </View>
                    </View>

                    {/* Card Bottom: Quick Actions (Kartu Siswa, Kalender, Portal) */}
                    <View style={styles.studentCardActionsRow}>
                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => {
                          setIdCardSide('front');
                          setSelectedIdCardStudent(student);
                        }}
                        style={styles.studentActionBtnCard}
                      >
                        <MaterialCommunityIcons name="card-account-details-outline" size={15} color="#084835" style={{ marginRight: 4 }} />
                        <Text style={styles.studentActionBtnCardText}>Kartu Siswa</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => navigation.navigate('Kalender', { child_id: String(student.id), student_id: String(student.id), single_child_only: true })}
                        style={styles.studentActionBtnSecondary}
                      >
                        <MaterialCommunityIcons name="calendar-month" size={15} color="#064E3B" style={{ marginRight: 4 }} />
                        <Text style={styles.studentActionBtnSecondaryText}>Kalender</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setSelectedPortalChild(student);
                          setShowChildPortalModal(true);
                        }}
                        style={styles.studentActionBtnPrimary}
                      >
                        <MaterialCommunityIcons name="view-grid" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.studentActionBtnPrimaryText}>Portal</Text>
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>
                );
              })}
            </ScrollView>

            {/* Pagination Dots for Multiple Children */}
            {parentChildren.length > 1 && (
              <View style={styles.studentDotsRowInHeader}>
                {parentChildren.map((_, dotIdx) => (
                  <TouchableOpacity
                    key={dotIdx}
                    activeOpacity={0.7}
                    onPress={() => {
                      setActiveChildIndex(dotIdx);
                      const targetC = parentChildren[dotIdx];
                      const sid = targetC?.id || targetC?.student_id;
                      if (sid) useActiveChildStore.getState().setActiveChildId(sid);
                      studentScrollRef.current?.scrollTo({
                        x: dotIdx * studentSnapInterval,
                        animated: true,
                      });
                    }}
                    style={[
                      styles.studentDot,
                      activeChildIndex === dotIdx ? styles.studentDotActiveInHeader : styles.studentDotInactiveInHeader,
                    ]}
                  />
                ))}
              </View>
            )}

          </View>
        )}
        </View>

        {/* ============================================================ */}
        {/* SHEET PUTIH/SLATE: Melengkung Dimulai Tepat di Bawah Anak    */}
        {/* ============================================================ */}
        <View style={styles.curvedSheetBody}>

        {/* ============================================================ */}
        {/* EXECUTIVE DAILY 360° HUB (Khusus Orang Tua / Siswa Aktif)    */}
        {/* ============================================================ */}
        {parent && activeStudent && (
          <View style={styles.hubContainer}>
            {/* Hub Header with Pulse Dot */}
            <View style={styles.hubHeaderRow}>
              <View style={styles.hubHeaderTitleWrap}>
                <View style={styles.hubHeaderIconBox}>
                  <MaterialCommunityIcons name="view-dashboard-variant-outline" size={17} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.hubHeaderTitle}>Rangkuman Harian Ananda</Text>
                  <Text numberOfLines={1} style={styles.hubHeaderSubtitle}>Kehadiran, tugas, hafalan, & ibadah hari ini</Text>
                </View>
              </View>
              <View style={styles.hubLiveBadge}>
                <View style={styles.hubLivePulseDot} />
                <Text style={styles.hubLiveBadgeText}>Hari Ini</Text>
              </View>
            </View>

            {/* 4 Quadrant Cards */}
            <View style={styles.hubGrid}>
              {/* 1. Presensi */}
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.hubCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                onPress={() => handleMenuNavigation('Absensi')}
              >
                <View style={styles.hubCardTopRow}>
                  <View style={[styles.hubCardIconBox, { backgroundColor: '#DCFCE7' }]}>
                    <MaterialCommunityIcons name="calendar-check-outline" size={17} color="#059669" />
                  </View>
                  <View style={[styles.hubCardTag, { backgroundColor: '#DCFCE7' }]}>
                    <Text numberOfLines={1} style={[styles.hubCardTagText, { color: '#047857' }]}>
                      {hubAttendanceData.timeText}
                    </Text>
                  </View>
                </View>
                <Text style={styles.hubCardLabel}>Presensi Masuk</Text>
                <Text numberOfLines={1} style={[styles.hubCardValue, { color: hubAttendanceData.color }]}>
                  {hubAttendanceData.label}
                </Text>
                <View style={styles.hubCardFooter}>
                  <Text style={[styles.hubCardFooterText, { color: '#059669' }]}>Lihat Riwayat</Text>
                  <MaterialCommunityIcons name="chevron-right" size={13} color="#059669" />
                </View>
              </TouchableOpacity>

              {/* 2. Tugas & Kuis */}
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.hubCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                onPress={() => handleMenuNavigation('Tugas')}
              >
                <View style={styles.hubCardTopRow}>
                  <View style={[styles.hubCardIconBox, { backgroundColor: '#DBEAFE' }]}>
                    <MaterialCommunityIcons name="clipboard-text-clock-outline" size={17} color="#1D4ED8" />
                  </View>
                  <View style={[styles.hubCardTag, { backgroundColor: '#DBEAFE' }]}>
                    <Text numberOfLines={1} style={[styles.hubCardTagText, { color: '#1D4ED8' }]}>
                      {hubTaskData.countText}
                    </Text>
                  </View>
                </View>
                <Text style={styles.hubCardLabel}>Tugas Terdekat</Text>
                <Text numberOfLines={1} style={[styles.hubCardValue, { color: '#1E293B' }]}>
                  {hubTaskData.title}
                </Text>
                <View style={styles.hubCardFooter}>
                  <Text numberOfLines={1} style={[styles.hubCardFooterText, { color: '#2563EB', flex: 1 }]}>
                    {hubTaskData.sub}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={13} color="#2563EB" />
                </View>
              </TouchableOpacity>

              {/* 3. Tahfizh */}
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.hubCard, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}
                onPress={() => handleMenuNavigation('Tahfizh')}
              >
                <View style={styles.hubCardTopRow}>
                  <View style={[styles.hubCardIconBox, { backgroundColor: '#CCFBF1' }]}>
                    <MaterialCommunityIcons name="book-open-page-variant-outline" size={17} color="#0D9488" />
                  </View>
                  <View style={[styles.hubCardTag, { backgroundColor: '#CCFBF1' }]}>
                    <Text numberOfLines={1} style={[styles.hubCardTagText, { color: '#0F766E' }]}>
                      {hubTahfizhData.badge}
                    </Text>
                  </View>
                </View>
                <Text style={styles.hubCardLabel}>Setoran Terakhir</Text>
                <Text numberOfLines={1} style={[styles.hubCardValue, { color: '#134E4A' }]}>
                  {hubTahfizhData.surahText}
                </Text>
                <View style={styles.hubCardFooter}>
                  <Text numberOfLines={1} style={[styles.hubCardFooterText, { color: '#0D9488', flex: 1 }]}>
                    {hubTahfizhData.note}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={13} color="#0D9488" />
                </View>
              </TouchableOpacity>

              {/* 4. Mutaba'ah Shalat */}
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.hubCard, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}
                onPress={() => handleMenuNavigation('Mutabaah')}
              >
                <View style={styles.hubCardTopRow}>
                  <View style={[styles.hubCardIconBox, { backgroundColor: '#F3E8FF' }]}>
                    <MaterialCommunityIcons name="hands-pray" size={17} color="#7E22CE" />
                  </View>
                  <View style={[styles.hubCardTag, { backgroundColor: '#F3E8FF' }]}>
                    <Text numberOfLines={1} style={[styles.hubCardTagText, { color: '#6B21A8' }]}>
                      {hubMutabaahData.ratioText}
                    </Text>
                  </View>
                </View>
                <Text style={styles.hubCardLabel}>Shalat 5 Waktu</Text>
                <View style={styles.hubSholatPillsRow}>
                  {hubMutabaahData.prayers.map((p) => (
                    <View
                      key={p.key}
                      style={[
                        styles.hubSholatPill,
                        p.done ? styles.hubSholatPillDone : styles.hubSholatPillPending,
                      ]}
                    >
                      <Text style={[styles.hubSholatPillText, p.done && styles.hubSholatPillTextDone]}>
                        {p.key}
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={styles.hubCardFooter}>
                  <Text numberOfLines={1} style={[styles.hubCardFooterText, { color: '#7E22CE', flex: 1 }]}>
                    {hubMutabaahData.note}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={13} color="#7E22CE" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SECTION: Menu Utama (Expandable Card Container) */}
        <View style={styles.menuCardContainer}>
          {/* Baris Utama (2 Baris Pertama, Tepat 4 Ikon per Baris, Ikon ke-8 di Sebelah Tugas adalah Tombol Expand/Kembali) */}
          {primaryRows.map((rowItems, rIdx) => (
            <View
              key={`prim-${rIdx}`}
              style={[
                styles.menuRow,
                (!isMenuExpanded && rIdx === primaryRows.length - 1) && styles.menuRowLast,
              ]}
            >
              {rowItems.map(([label, icon, color, bgPastel, route], idx) => {
                const isToggleTile = route === '__TOGGLE__';
                const tabKey = isToggleTile ? undefined : (primaryMenuItems[rIdx * 4 + idx] as any)?.[5];
                const subtitle = MENU_SUBTITLES[String(label)] || 'Menu layanan';
                return (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.75}
                    style={[styles.menuCardTile, { backgroundColor: bgPastel }]}
                    onPress={() => {
                      if (isToggleTile) {
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

        {/* ============================================================ */}
        {/* ============================================================ */}
        {/* SECTION: Aktivitas Siswa Hari Berjalan (Realtime Feed)        */}
        {/* ============================================================ */}
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
              <MaterialCommunityIcons name="chevron-left" size={20} color="#059669" />
            </TouchableOpacity>

            {/* Tengah: Ikon Pulse + Tanggal + Subtitle */}
            <View style={styles.activityTimelineHeaderCenter}>
              <View style={styles.activityTimelinePulseBox}>
                <MaterialCommunityIcons name="pulse" size={18} color="#059669" />
              </View>
              <View style={styles.activityTimelineTitleCol}>
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
                <Text style={styles.activityTimelineSubtitle} numberOfLines={1}>
                  {todayTimeline?.program?.label ? `${todayTimeline.program.label}` : 'Aktivitas hari berjalan'}
                </Text>
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
              <MaterialCommunityIcons name="chevron-right" size={20} color={isViewingToday ? '#CBD5E1' : '#059669'} />
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
                      style={styles.timelineColCard}
                    >
                      {/* Pastel Icon Box */}
                      <View style={[styles.timelineCardIconBox, { backgroundColor: act.icon_bg || '#ECFDF5' }]}>
                        <MaterialCommunityIcons
                          name={(act.icon || 'star-outline') as any}
                          size={22}
                          color={act.icon_color || '#10B981'}
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
                        <View style={[styles.timelineBadgePill, { backgroundColor: badgeStyle.bg }]}>
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

        {/* ============================================================ */}
        {/* SECTION: Widget Tugas Terbaru & Jadwal Hari Ini              */}
        {/* ============================================================ */}
        {(student || parent) && (
          <View style={styles.homeWidgetRow}>

            {/* ── Card Kiri: Tugas Terbaru ── */}
            <TouchableOpacity
              activeOpacity={0.82}
              style={styles.homeWidgetCard}
              onPress={() => {
                setShowTugasModal(true);
                void fetchHomeWidgets(activeChildId);
              }}
            >
              {/* Header */}
              <View style={styles.homeWidgetCardHeader}>
                <View style={[styles.homeWidgetIconBox, { backgroundColor: '#F5F3FF' }]}>
                  <MaterialCommunityIcons name="clipboard-text" size={18} color="#7C3AED" />
                </View>
                <Text style={styles.homeWidgetCardTitle}>Tugas Terbaru</Text>
              </View>

              {loadingHomeWidgets ? (
                <View style={styles.homeWidgetLoadingBox}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                </View>
              ) : homeAssignments.length > 0 ? (() => {
                const latestTask = homeAssignments[0];
                const subjectName = latestTask?.subject?.name ?? latestTask?.subject?.nama_mapel ?? latestTask?.mata_pelajaran ?? '';
                const taskTitle = latestTask?.judul_tugas ?? latestTask?.judul ?? latestTask?.title ?? 'Tugas';
                const deadline = latestTask?.deadline
                  ? new Date(latestTask.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                  : null;
                const submission = Array.isArray(latestTask?.pengumpulanTugas) ? latestTask.pengumpulanTugas[0]
                  : Array.isArray(latestTask?.pengumpulan_tugas) ? latestTask.pengumpulan_tugas[0]
                  : null;
                const isSubmitted = submission && ['dikumpulkan','submitted','dinilai','graded'].includes(submission.status);
                const isLate = !isSubmitted && latestTask?.deadline && new Date(latestTask.deadline) < new Date();
                const pendingCount = homeAssignments.filter((a: any) => {
                  const sub = Array.isArray(a?.pengumpulanTugas) ? a.pengumpulanTugas[0] : Array.isArray(a?.pengumpulan_tugas) ? a.pengumpulan_tugas[0] : null;
                  return !sub || !['dikumpulkan','submitted','dinilai','graded'].includes(sub?.status);
                }).length;
                return (
                  <View style={styles.homeWidgetBody}>
                    <Text style={styles.homeWidgetSubject} numberOfLines={1}>{subjectName}</Text>
                    <Text style={styles.homeWidgetMainText} numberOfLines={2}>{taskTitle}</Text>
                    {deadline && (
                      <View style={styles.homeWidgetDeadlineRow}>
                        <MaterialCommunityIcons name="clock-outline" size={11} color={isLate ? '#DC2626' : '#64748B'} style={{ marginRight: 3 }} />
                        <Text style={[styles.homeWidgetDeadlineText, isLate && { color: '#DC2626' }]}>
                          {isLate ? 'Terlambat · ' : 'Kumpulkan sebelum '}{deadline}
                        </Text>
                      </View>
                    )}
                    {pendingCount > 0 && (
                      <View style={styles.homeWidgetBadgeRow}>
                        <View style={styles.homeWidgetBadge}>
                          <Text style={styles.homeWidgetBadgeText}>{pendingCount} belum dikumpul</Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })() : (
                <View style={styles.homeWidgetEmptyBox}>
                  <MaterialCommunityIcons name="check-circle-outline" size={22} color="#A7F3D0" />
                  <Text style={styles.homeWidgetEmptyText}>Semua tugas selesai 🎉</Text>
                </View>
              )}

              <View style={styles.homeWidgetFooter}>
                <Text style={styles.homeWidgetFooterText}>Lihat semua tugas</Text>
                <MaterialCommunityIcons name="chevron-right" size={14} color="#7C3AED" />
              </View>
            </TouchableOpacity>

            {/* ── Card Kanan: Jadwal Hari Ini ── */}
            <TouchableOpacity
              activeOpacity={0.82}
              style={styles.homeWidgetCard}
              onPress={() => setShowJadwalModal(true)}
            >
              {/* Header */}
              <View style={styles.homeWidgetCardHeader}>
                <View style={[styles.homeWidgetIconBox, { backgroundColor: '#EFF6FF' }]}>
                  <MaterialCommunityIcons name="calendar-today" size={18} color="#2563EB" />
                </View>
                <Text style={styles.homeWidgetCardTitle}>Jadwal Hari Ini</Text>
              </View>

              {loadingHomeWidgets ? (
                <View style={styles.homeWidgetLoadingBox}>
                  <ActivityIndicator size="small" color="#2563EB" />
                </View>
              ) : (() => {
                const todayItems: any[] = Array.isArray(homeSchedule?.today_schedules)
                  ? homeSchedule.today_schedules
                  : Array.isArray(homeSchedule?.data?.today_schedules)
                  ? homeSchedule.data.today_schedules
                  : [];
                const totalCount = homeSchedule?.kpi?.today_count ?? todayItems.length;
                const preview = todayItems.slice(0, 3);
                const ongoingItem = todayItems.find((s: any) => s.is_ongoing);

                return preview.length > 0 ? (
                  <View style={styles.homeWidgetBody}>
                    {ongoingItem && (
                      <View style={styles.homeWidgetOngoingBadge}>
                        <View style={styles.homeWidgetOngoingDot} />
                        <Text style={styles.homeWidgetOngoingText}>Sedang Berlangsung</Text>
                      </View>
                    )}
                    {preview.map((s: any, i: number) => (
                      <View key={s.id ?? i} style={styles.homeWidgetScheduleRow}>
                        <Text style={[
                          styles.homeWidgetScheduleTime,
                          s.is_ongoing && { color: '#2563EB', fontWeight: '700' },
                        ]}>
                          {String(s.time_start ?? '').slice(0, 5)}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.homeWidgetScheduleSubject,
                            s.is_ongoing && { color: '#1E40AF', fontWeight: '700' },
                          ]}
                        >
                          {s.subject?.name ?? 'Mapel'}
                        </Text>
                      </View>
                    ))}
                    {totalCount > 3 && (
                      <Text style={styles.homeWidgetMoreText}>+{totalCount - 3} jadwal lainnya</Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.homeWidgetEmptyBox}>
                    <MaterialCommunityIcons name="calendar-blank-outline" size={22} color="#93C5FD" />
                    <Text style={styles.homeWidgetEmptyText}>Tidak ada jadwal hari ini</Text>
                  </View>
                );
              })()}

              <View style={styles.homeWidgetFooter}>
                <Text style={[styles.homeWidgetFooterText, { color: '#2563EB' }]}>Lihat jadwal</Text>
                <MaterialCommunityIcons name="chevron-right" size={14} color="#2563EB" />
              </View>
            </TouchableOpacity>

          </View>
        )}

        {/* SECTION: Berita & Informasi (Clean Modern Card Sesuai Mockup Gambar) */}
        <View style={styles.newsSectionContainer}>
          <View style={[styles.sectionHeaderRow, styles.newsSectionHeaderRow]}>
            <View style={styles.sectionHeaderTitleWithIcon}>
              <MaterialCommunityIcons name="newspaper-variant" size={20} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitleBold}>Berita & Informasi</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Informasi')}
              style={styles.seeAllButton}
            >
              <Text style={styles.seeAllTextBlue}>Lihat Semua</Text>
              <MaterialCommunityIcons name="chevron-right" size={14} color="#2563EB" />
            </TouchableOpacity>
          </View>

          {announcements.length === 0 ? (
            /* Empty State: Tidak ada data dari backend */
            <View style={styles.newsEmptyStateClean}>
              <MaterialCommunityIcons name="newspaper-variant-outline" size={38} color="#94A3B8" />
              <Text style={styles.newsEmptyTitle}>Belum Ada Berita</Text>
              <Text style={styles.newsEmptySubtitle}>Informasi & pengumuman dari sekolah akan tampil di sini</Text>
            </View>
          ) : (
            <>
              <ScrollView
                ref={newsScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  styles.cleanNewsTrack,
                  {
                    paddingHorizontal: newsTrackPaddingHorizontal,
                    gap: newsGap,
                  },
                ]}
                decelerationRate="fast"
                snapToInterval={newsSnapInterval}
                onScroll={handleCarouselScroll}
                scrollEventThrottle={16}
              >
                {announcements.map((item: any, index: number) => {
                  const theme = NEWS_CARD_THEMES[index % NEWS_CARD_THEMES.length];
                  const formattedDate = (item.created_at || item.published_at || item.date)
                    ? new Date(item.created_at || item.published_at || item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '-';

                  return (
                    <TouchableOpacity
                      key={String(item.id || index)}
                      activeOpacity={0.88}
                      onPress={() => setSelectedNews({ ...item, _index: index })}
                      style={{ width: newsCardWidth }}
                    >
                      <LinearGradient
                        colors={theme.gradient as [string, string, ...string[]]}
                        locations={theme.locations as [number, number, ...number[]]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.cleanNewsCard,
                          {
                            shadowColor: theme.shadowColor,
                            borderColor: theme.borderColor,
                          },
                        ]}
                      >
                        {/* Decorative background circle */}
                        <View
                          style={[
                            styles.cleanNewsDecorCircle,
                            { backgroundColor: theme.decorColor },
                          ]}
                        />

                        {/* Left: Rounded Thumbnail Image */}
                        <Image
                          source={getNewsThumbnail(item, index)}
                          style={styles.cleanNewsThumbnail}
                          resizeMode="cover"
                        />

                        {/* Right: Content Info */}
                        <View style={styles.cleanNewsContentCol}>
                          <Text style={styles.cleanNewsTitle}>
                            {titleOf(item) || 'Informasi Sekolah'}
                          </Text>
                          <View style={styles.cleanNewsDateRow}>
                            <MaterialCommunityIcons
                              name="calendar-clock"
                              size={13}
                              color={theme.dateColor}
                              style={{ marginRight: 4 }}
                            />
                            <Text style={[styles.cleanNewsDate, { color: theme.dateColor }]}>
                              {formattedDate}
                            </Text>
                          </View>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Carousel Pagination Dots Indicator */}
              {announcements.length > 1 && (
                <View style={styles.dotsRow}>
                  {announcements.slice(0, 5).map((_, i) => {
                    const dotTheme = NEWS_CARD_THEMES[i % NEWS_CARD_THEMES.length];
                    const isActive = activeSlideIndex === i;
                    return (
                      <TouchableOpacity
                        key={i}
                        activeOpacity={0.7}
                        onPress={() => {
                          setActiveSlideIndex(i);
                          newsScrollRef.current?.scrollTo({
                            x: i * newsSnapInterval,
                            animated: true,
                          });
                        }}
                        style={[
                          styles.dot,
                          isActive
                            ? [styles.dotActive, { backgroundColor: dotTheme.base, width: 22 }]
                            : styles.dotInactive,
                        ]}
                      />
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

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
        </View>
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
                  <MaterialCommunityIcons name="shield-check-outline" size={18} color="#059669" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityModalInfoLabel}>Status Validasi</Text>
                    <Text style={styles.activityModalInfoVal}>
                      Telah terverifikasi oleh sistem sekolah / musyrif
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

              const qrValue = `STUDENT_CARD:${sNis}:${sName}`;
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
                            <Text style={styles.webCardYayasanLabel}>YAYASAN</Text>
                            <Text numberOfLines={1} style={styles.webCardBrandName}>DAR EL-IMAN</Text>
                            <Text style={styles.webCardSchoolSub}>Islamic School</Text>
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
                                Berilmu, Berakhlak, Beramal
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
                            <Text style={styles.webCardYayasanLabel}>YAYASAN</Text>
                            <Text numberOfLines={1} style={styles.webCardBrandName}>DAR EL-IMAN</Text>
                            <Text style={styles.webCardSchoolSub}>Sistem Terpadu SIMSIT</Text>
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
                              Kartu ini adalah kartu identitas resmi siswa Yayasan Dar el-Iman.
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
                  <Text style={styles.newsModalEyebrow}>AGENDA & PENGUMUMAN</Text>
                  <Text numberOfLines={1} style={styles.newsModalTopTitle}>
                    Berita & Informasi Sekolah
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
                <Text style={styles.allNewsHeaderTitle}>Warta & Agenda Terpadu</Text>
                <Text style={styles.allNewsHeaderSub}>
                  Pembaruan informasi resmi, agenda akademik, dan pengumuman sekolah.
                </Text>
              </View>

              {announcements.map((item: any, idx: number) => (
                <TouchableOpacity
                  key={String(item.id || idx)}
                  activeOpacity={0.82}
                  onPress={() => {
                    setSelectedNews({ ...item, _index: idx });
                  }}
                  style={styles.allNewsCard}
                >
                  <View style={styles.allNewsCardTopRow}>
                    <View style={styles.newsTagBadge}>
                      <MaterialCommunityIcons name="bullhorn" size={11} color="#084835" style={{ marginRight: 4 }} />
                      <Text style={styles.newsTagText}>Warta Sekolah</Text>
                    </View>
                    <Text style={styles.allNewsDate}>
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Terbaru'}
                    </Text>
                  </View>

                  <Text style={styles.allNewsTitle}>{titleOf(item)}</Text>
                  <Text numberOfLines={3} style={styles.allNewsSnippet}>
                    {subtitleOf(item)}
                  </Text>

                  <View style={styles.allNewsReadMoreRow}>
                    <Text style={styles.allNewsReadMoreText}>Baca Selengkapnya</Text>
                    <MaterialCommunityIcons name="arrow-right" size={15} color="#084835" />
                  </View>
                </TouchableOpacity>
              ))}
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
              {/* Cover Image Identical to Card Thumbnail */}
              <View style={styles.modalNewsCoverBox}>
                <Image
                  source={getNewsThumbnail(selectedNews, selectedNews?._index ?? 0)}
                  style={styles.modalNewsCoverImage}
                  resizeMode="cover"
                />
              </View>

              <View style={styles.newsModalMetaRow}>
                <View style={styles.carouselTagBadgeModal}>
                  <MaterialCommunityIcons name="bullhorn" size={12} color="#FFFFFF" style={{ marginRight: 5 }} />
                  <Text style={styles.carouselTagTextModal}>Pengumuman</Text>
                </View>
                <View style={styles.newsModalDateBadge}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                  <Text style={styles.modalDateTextClean}>
                    {selectedNews?.created_at
                      ? new Date(selectedNews.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : 'Informasi Sekolah'}
                  </Text>
                </View>
              </View>

              <Text style={styles.modalMainTitle}>{titleOf(selectedNews || {})}</Text>

              <Text style={styles.modalBodyText}>
                {selectedNews?.isi_pengumuman ||
                  selectedNews?.isi ||
                  subtitleOf(selectedNews || {}) ||
                  'Kegiatan belajar mengajar dan operasional sekolah mengikuti agenda terpadu yang telah ditetapkan.'}
              </Text>
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
          <View style={styles.allMenusModalContent}>
            <View style={styles.allMenusModalHeader}>
              <View>
                <Text style={styles.allMenusModalTitle}>Semua Menu</Text>
                <Text style={styles.allMenusModalSub}>Pilih layanan & modul sistem</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAllMenusModal(false)}
                style={styles.allMenusModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.allMenusGridScroll}>
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
                    <View style={[styles.iconSquircle, { backgroundColor: bgPastel }]}>
                      <MaterialCommunityIcons name={String(icon) as any} size={24} color={String(color)} />
                    </View>
                    <Text numberOfLines={1} style={styles.menuLabel}>
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
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <MaterialCommunityIcons name="check-circle-outline" size={48} color="#A7F3D0" />
                  <Text style={{ color: '#64748B', fontWeight: '600', marginTop: 8 }}>Tidak ada tugas aktif 🎉</Text>
                </View>
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
                    <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                      <MaterialCommunityIcons name="calendar-blank-outline" size={48} color="#93C5FD" />
                      <Text style={{ color: '#64748B', fontWeight: '600', marginTop: 8 }}>Tidak ada jadwal hari ini</Text>
                    </View>
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
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', rowGap: 18, paddingHorizontal: 4 }}>
                {childPortalMenus.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.75}
                    style={{ width: '25%', alignItems: 'center', paddingHorizontal: 2 }}
                    onPress={() => handleChildPortalMenuClick(item.route, item.tab)}
                  >
                    <View style={[styles.iconSquircle, { backgroundColor: item.bg }]}>
                      <MaterialCommunityIcons name={item.icon as any} size={24} color={item.color} />
                    </View>
                    <Text numberOfLines={1} style={[styles.menuLabel, { textAlign: 'center', marginTop: 6, fontSize: 11 }]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tombol Buka Dashboard Portal Lengkap */}
              <TouchableOpacity
                style={[
                  styles.allNewsReadMoreRow,
                  {
                    backgroundColor: '#F0FDF4',
                    borderColor: '#BBF7D0',
                    borderWidth: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    justifyContent: 'center',
                    marginTop: 22,
                    marginBottom: 10,
                  }
                ]}
                activeOpacity={0.82}
                onPress={() => {
                  setShowChildPortalModal(false);
                  const childId = selectedPortalChild?.id || selectedPortalChild?.student_id;
                  navigation.navigate('Orang Tua', childId ? { child_id: String(childId), student_id: String(childId), single_child_only: true } : undefined);
                }}
              >
                <MaterialCommunityIcons name="view-dashboard-outline" size={18} color="#059669" style={{ marginRight: 6 }} />
                <Text style={[styles.allNewsReadMoreText, { color: '#059669', fontSize: 13, fontWeight: '800' }]}>
                  Buka Dashboard Portal Lengkap
                </Text>
                <MaterialCommunityIcons name="arrow-right" size={15} color="#059669" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
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
                  { key: 'all', label: 'Semua Agenda', icon: 'view-grid-outline', count: studentAssignmentsList.length + studentCbtList.length + announcements.length },
                  { key: 'tugas', label: 'Tugas & Kuis', icon: 'clipboard-text-outline', count: studentAssignmentsList.length },
                  { key: 'cbt', label: 'Ujian CBT', icon: 'laptop', count: studentCbtList.length },
                  { key: 'pengumuman', label: 'Pengumuman', icon: 'bullhorn-outline', count: announcements.length },
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
                        paddingHorizontal: 12,
                        borderRadius: 20,
                        backgroundColor: isActive ? '#059669' : '#F1F5F9',
                        borderWidth: 1,
                        borderColor: isActive ? '#047857' : '#E2E8F0',
                      }}
                    >
                      <MaterialCommunityIcons
                        name={tab.icon as any}
                        size={15}
                        color={isActive ? '#FFFFFF' : '#475569'}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: isActive ? '#FFFFFF' : '#475569',
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
                        <MaterialCommunityIcons name="laptop" size={16} color="#2563EB" />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                          Ujian CBT & Asesmen Daring
                        </Text>
                      </View>
                      {studentCbtList.map((exam: any, eIdx: number) => {
                        const sId = selectedNotificationStudent?.id || selectedNotificationStudent?.student_id;
                        return (
                          <TouchableOpacity
                            key={exam.id || eIdx}
                            activeOpacity={0.82}
                            onPress={() => {
                              setShowStudentNotificationModal(false);
                              navigation.navigate('CbtExams', sId ? { child_id: String(sId), student_id: String(sId) } : undefined);
                            }}
                            style={{
                              backgroundColor: '#EFF6FF',
                              borderColor: '#BFDBFE',
                              borderWidth: 1,
                              borderRadius: 14,
                              padding: 12,
                              marginBottom: 8,
                            }}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '800', color: '#1E3A8A' }}>
                                  {exam.title || exam.nama_ujian || 'Ujian CBT Online'}
                                </Text>
                                <Text style={{ fontSize: 11, color: '#3B82F6', marginTop: 2 }}>
                                  {exam.subject?.name || exam.mapel || 'Mata Pelajaran'} · {exam.duration_minutes || exam.durasi || 60} Menit
                                </Text>
                              </View>
                              <View style={{ backgroundColor: '#2563EB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>CBT</Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#DBEAFE' }}>
                              <Text style={{ fontSize: 11, color: '#64748B' }}>
                                📅 {exam.start_time || exam.jadwal || 'Terjadwal'}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>Ikuti Ujian</Text>
                                <MaterialCommunityIcons name="chevron-right" size={14} color="#2563EB" />
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
                        <MaterialCommunityIcons name="clipboard-text-clock" size={16} color="#D97706" />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
                          Tugas & Kuis LMS Aktif
                        </Text>
                      </View>
                      {studentAssignmentsList.map((item: any, tIdx: number) => {
                        const sId = selectedNotificationStudent?.id || selectedNotificationStudent?.student_id;
                        const deadline = item.due_date || item.deadline || item.tanggal_jatuh_tempo || '';
                        return (
                          <TouchableOpacity
                            key={item.id || tIdx}
                            activeOpacity={0.82}
                            onPress={() => {
                              setShowStudentNotificationModal(false);
                              navigation.navigate('Tugas', sId ? { child_id: String(sId), student_id: String(sId) } : undefined);
                            }}
                            style={{
                              backgroundColor: '#FFFBEB',
                              borderColor: '#FDE68A',
                              borderWidth: 1,
                              borderRadius: 14,
                              padding: 12,
                              marginBottom: 8,
                            }}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '800', color: '#92400E' }}>
                                  {item.title || item.judul || 'Tugas Siswa'}
                                </Text>
                                <Text style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
                                  {item.subject?.name || item.mapel || 'Mata Pelajaran'} · {item.teacher?.name || item.guru || 'Guru Pengampu'}
                                </Text>
                              </View>
                              <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>LMS</Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#FEF3C7' }}>
                              <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '600' }}>
                                ⏰ Batas: {deadline ? deadline : 'Segera kumpulkan'}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>Buka Tugas</Text>
                                <MaterialCommunityIcons name="chevron-right" size={14} color="#D97706" />
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
                        <MaterialCommunityIcons name="bullhorn" size={16} color="#059669" />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>
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
                              borderWidth: 1,
                              borderRadius: 14,
                              padding: 12,
                              marginBottom: 8,
                            }}
                          >
                            <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '800', color: '#065F46' }}>
                              {ann.title || ann.judul || 'Pemberitahuan Sekolah'}
                            </Text>
                            {cleanBody ? (
                              <Text numberOfLines={2} style={{ fontSize: 11, color: '#047857', marginTop: 4 }}>
                                {cleanBody}
                              </Text>
                            ) : null}
                            {dateStr ? (
                              <Text style={{ fontSize: 10, color: '#65A30D', marginTop: 6 }}>
                                📅 {dateStr}
                              </Text>
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
                style={[
                  styles.allNewsReadMoreRow,
                  {
                    backgroundColor: '#F8FAFC',
                    borderColor: '#CBD5E1',
                    borderWidth: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    justifyContent: 'center',
                    marginTop: 10,
                  }
                ]}
                activeOpacity={0.82}
                onPress={() => {
                  setShowStudentNotificationModal(false);
                  navigation.navigate('Notifications');
                }}
              >
                <MaterialCommunityIcons name="bell-outline" size={18} color="#475569" style={{ marginRight: 6 }} />
                <Text style={[styles.allNewsReadMoreText, { color: '#334155', fontSize: 13, fontWeight: '800' }]}>
                  Buka Pusat Notifikasi Lengkap
                </Text>
                <MaterialCommunityIcons name="arrow-right" size={15} color="#475569" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </ScrollView>
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
  stickyHeaderBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#0D7A4E',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
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
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  stickyUserName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerAppTitleText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginTop: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 3,
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
    marginTop: 60,
    marginBottom: 0,
    position: 'relative',
  },
  bodyOverlapBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: -60,
    zIndex: 0,
  },
  bodyOverlapSheet: {
    position: 'absolute',
    top: 138,
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
    gap: 6,
    marginTop: 6,
    zIndex: 1,
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
    backgroundColor: '#EBF8F2',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: 0,
    paddingTop: 4,
    paddingBottom: 94,
    minHeight: 500,
  },
  mainScrollContent: {
    flexGrow: 1,
    backgroundColor: '#EBF8F2',
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
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
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
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
  // Tinjau Aktivitas Styles (Sesuai Desain Mockup Timeline Terbaru)
  activityTimelineCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  activityTimelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  activityTimelineHeaderCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  activityTimelineHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  activityDayNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  activityDayNavBtnDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  activityTodayBadge: {
    marginLeft: 5,
    backgroundColor: '#059669',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  activityTodayBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  activityTimelinePulseBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  activityTimelineTitleCol: {
    flex: 1,
    justifyContent: 'center',
  },
  activityTimelineDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    flexShrink: 1,
  },
  activityTimelineDateTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
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
    maxHeight: 270,
  },
  activityTimelineFeedList: {
    width: '100%',
    paddingTop: 2,
    paddingRight: 4,
  },
  timelineRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
  },
  timelineColTime: {
    width: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 8,
  },
  timelineTimeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  timelinePastDateText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  timelinePastTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },
  timelineColTrack: {
    width: 22,
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
    paddingVertical: 7,
    paddingLeft: 8,
  },
  timelineCardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineCardTextCol: {
    flex: 1,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  timelineCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  timelineCardSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  timelineBadgeContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineBadgePill: {
    paddingHorizontal: 11,
    paddingVertical: 4.5,
    borderRadius: 14,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineBadgeText: {
    fontSize: 11,
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
    marginBottom: 20,
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
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
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
    shadowColor: '#0D6B42',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
  studentCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  studentAvatarBox: {
    width: 62,
    height: 62,
    borderRadius: 22,
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
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  studentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
    marginTop: 1,
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
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
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
    marginTop: 10,
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
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  studentActionBtnCardText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
  },
  studentActionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  studentActionBtnSecondaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
  },
  studentActionBtnPrimary: {
    flex: 0.85,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#064E3B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  studentActionBtnPrimaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
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
  // ── Home Widget: Tugas Terbaru & Jadwal Hari Ini ──
  homeWidgetRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    gap: 12,
  },
  homeWidgetCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  homeWidgetCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  homeWidgetIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeWidgetCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E293B',
    flex: 1,
  },
  homeWidgetBody: {
    flex: 1,
    marginBottom: 8,
  },
  homeWidgetSubject: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7C3AED',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  homeWidgetMainText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 17,
    marginBottom: 6,
  },
  homeWidgetDeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeWidgetDeadlineText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 1,
  },
  homeWidgetBadgeRow: {
    marginTop: 6,
  },
  homeWidgetBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  homeWidgetBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#B45309',
  },
  homeWidgetScheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    gap: 6,
  },
  homeWidgetScheduleTime: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    width: 36,
    flexShrink: 0,
  },
  homeWidgetScheduleSubject: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  homeWidgetOngoingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 6,
    gap: 4,
  },
  homeWidgetOngoingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#2563EB',
  },
  homeWidgetOngoingText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  homeWidgetMoreText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 2,
  },
  homeWidgetEmptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  homeWidgetEmptyText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '500',
    textAlign: 'center',
  },
  homeWidgetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    marginTop: 4,
    gap: 2,
  },
  homeWidgetFooterText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#7C3AED',
  },
  homeWidgetLoadingBox: {
    flex: 1,
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

  // 360° Executive Daily Hub Styles
  hubContainer: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  hubHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  hubHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  hubHeaderIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  hubHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: 'Nunito_800ExtraBold',
  },
  hubHeaderSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '500',
  },
  hubLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
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
  hubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  hubCard: {
    width: '48%',
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    justifyContent: 'space-between',
    minHeight: 110,
  },
  hubCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  hubCardIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubCardTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: '65%',
  },
  hubCardTagText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  hubCardLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  hubCardValue: {
    fontSize: 12.5,
    fontWeight: '800',
    marginBottom: 6,
  },
  hubCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  hubCardFooterText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  hubSholatPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 6,
  },
  hubSholatPill: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  hubSholatPillDone: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  hubSholatPillPending: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  hubSholatPillText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#64748B',
  },
  hubSholatPillTextDone: {
    color: '#FFFFFF',
  },
});
