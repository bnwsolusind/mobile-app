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
import TeacherDashboardView from '../components/dashboard/TeacherDashboardView';
import TeacherRombelSelectorCard from '../components/dashboard/TeacherRombelSelectorCard';
import FoundationDashboardView from '../components/dashboard/FoundationDashboardView';
import StaffDashboardView from '../components/dashboard/StaffDashboardView';
import TuDashboardView from '../components/dashboard/TuDashboardView';
import PrincipalHomeSection from '../components/dashboard/PrincipalHomeSection';
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
  'Materi': 'Materi pembelajaran',
  'Tugas': 'Kerjakan tugas',
  'Tahfizh': 'Hafalan Al-Qur\'an',
  'Tahfiz': 'Hafalan Al-Qur\'an',
  'Nilai': 'Lihat hasil belajar',
  'Komentar': 'Saran & masukan',
  'Buku Penghubung': 'Catatan guru & ortu',
  'Tagihan & SPP': 'Biaya pendidikan',
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
  'Data Master': 'Kelola data pokok',
  'Data Siswa': 'Kelola siswa',
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
  'Tugas LMS': 'Tugas & penugasan',
  'Bank Soal': 'Kelola butir soal',
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

export default function HomeScreen({ navigation, route }: any) {
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
  const activeChildIndexRef = useRef<number>(0);
  useEffect(() => {
    activeChildIndexRef.current = activeChildIndex;
  }, [activeChildIndex]);
  const studentScrollRef = useRef<ScrollView>(null);
  const mainScrollViewRef = useRef<any>(null);
  const studentCardWidth = useMemo(() => {
    return parentChildren.length > 1
      ? SCREEN_WIDTH - 16 - STUDENT_CARD_GAP - STUDENT_PEEK_WIDTH
      : SCREEN_WIDTH - 32;
  }, [parentChildren.length]);
  const studentSnapInterval = useMemo(() => {
    return studentCardWidth + STUDENT_CARD_GAP;
  }, [studentCardWidth]);
  // Padding kiri-kanan track = setengah sisa layar -> potongan (peek) kiri & kanan
  // SEIMBANG (masing-masing (sisa/2 - gap)). Single: 16 | multi: 27.
  const studentTrackPad = useMemo(() => {
    return (SCREEN_WIDTH - studentCardWidth) / 2;
  }, [studentCardWidth]);

  // ── Carousel Kartu Siswa Linear Stabil & Konsisten ──
  const lastDirectTapTimeRef = useRef<number>(0);
  const triggerInstantChildFetchRef = useRef<((childId: string) => void) | null>(null);
  const lastHandledGlobalChildIdRef = useRef<string | null>(null);

  const syncLoopChildId = (realIdx: number): void => {
    const selChild = parentChildren[realIdx];
    const sid = selChild?.id || selChild?.student_id;
    if (sid) {
      const strId = String(sid);
      lastHandledGlobalChildIdRef.current = strId;
      useActiveChildStore.getState().setActiveChildId(strId);
    }
  };

  const handleStudentScrollEnd = useCallback((offsetX: number) => {
    // Abaikan jika baru saja terjadi direct tap (animasi scrollTo sedang berlangsung)
    if (Date.now() - lastDirectTapTimeRef.current < 750) return;
    if (parentChildren.length === 0 || !studentSnapInterval) return;
    const newIdx = Math.max(0, Math.min(parentChildren.length - 1, Math.round(offsetX / studentSnapInterval)));
    if (newIdx !== activeChildIndexRef.current) {
      activeChildIndexRef.current = newIdx;
      setActiveChildIndex(newIdx);
      syncLoopChildId(newIdx);
      const selChild = parentChildren[newIdx];
      const sid = selChild?.id || selChild?.student_id;
      if (sid && triggerInstantChildFetchRef.current) {
        triggerInstantChildFetchRef.current(String(sid));
      }
    }
  }, [parentChildren, studentSnapInterval]);

  // Navigasi ke target ananda: scroll halus ke posisi kartu target dan sinkronkan data
  const goToLoopChild = useCallback((target: number, isDirectTap = false): void => {
    if (parentChildren.length === 0) return;
    const tgt = Math.max(0, Math.min(parentChildren.length - 1, target));
    activeChildIndexRef.current = tgt;
    setActiveChildIndex(tgt);
    syncLoopChildId(tgt);

    lastDirectTapTimeRef.current = Date.now();
    const selChild = parentChildren[tgt];
    const sid = selChild?.id || selChild?.student_id;
    if (sid && triggerInstantChildFetchRef.current) {
      triggerInstantChildFetchRef.current(String(sid));
    }

    studentScrollRef.current?.scrollTo({
      x: tgt * studentSnapInterval,
      animated: true,
    });
  }, [parentChildren, studentSnapInterval]);
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

  // Link ref trigger instan saat direct tap
  useEffect(() => {
    triggerInstantChildFetchRef.current = (cid: string) => {
      void fetchTodayTimeline(cid, undefined, true);
      void fetchHomeWidgets(cid);
    };
    return () => {
      triggerInstantChildFetchRef.current = null;
    };
  }, [fetchTodayTimeline]);

  // Sinkronisasi activeChildIndex saat globalActiveChildId berubah dari luar (Portal/GradeScreen)
  useEffect(() => {
    if (!globalActiveChildId || parentChildren.length === 0) return;
    const strId = String(globalActiveChildId);
    if (strId === lastHandledGlobalChildIdRef.current) return;
    lastHandledGlobalChildIdRef.current = strId;

    const idx = parentChildren.findIndex(
      (c) => String(c.id || c.student_id) === strId
    );
    if (idx !== -1 && idx !== activeChildIndex) {
      setActiveChildIndex(idx);
      studentScrollRef.current?.scrollTo({
        x: idx * studentSnapInterval,
        animated: true,
      });
    }
  }, [globalActiveChildId, parentChildren, activeChildIndex, studentSnapInterval]);

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
        mobileApiService.getPortalTahfizh({ child_id: childId, student_id: childId, per_page: 5 }),
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
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);
  const setUnreadNotificationCount = useNotificationBadgeStore((state) => state.setUnreadNotificationCount);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
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
    }, [setUnreadNotificationCount])
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
  const [selectedPortalChild, setSelectedPortalChild] = useState<any>(null);

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
      setShowChildPortalModal(false);
      const activeChild = parentChildren[activeChildIndex];
      const childId = selectedPortalChild?.id || selectedPortalChild?.student_id || activeChild?.id || activeChild?.student_id;
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
    [selectedPortalChild, parentChildren, activeChildIndex, navigation]
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
        setActiveChildIndex(targetIndex);
        setSelectedPortalChild(allChildren[targetIndex]);
      }
      navigation.setParams({ reopen_child_portal_id: undefined, reopen_timestamp: undefined });
    }
  }, [route?.params?.reopen_child_portal_id, route?.params?.reopen_timestamp, parentChildren, navigation]);

  const childPortalMenus: { label: string; icon: string; color: string; bg: string; route: string; tab?: string }[] = useMemo(() => [
    { label: 'Jadwal', icon: 'clock-time-four', color: '#7C3AED', bg: '#F5F3FF', route: 'Jadwal' },
    { label: 'Tugas LMS', icon: 'clipboard-text', color: '#F59E0B', bg: '#FEF9EC', route: 'Tugas' },
    { label: 'Materi', icon: 'book-multiple', color: '#0D9488', bg: '#E6FFFA', route: 'Materi' },
    { label: 'Nilai & Rapor', icon: 'chart-box', color: '#10B981', bg: '#E8FAF2', route: 'Nilai' },
    { label: 'Tahfizh', icon: 'book-marker', color: '#2563EB', bg: '#EFF6FF', route: 'Tahfizh' },
    { label: 'Mutaba’ah', icon: 'clipboard-check', color: '#D97706', bg: '#FFFBEB', route: 'Mutabaah' },
    { label: 'Buku Hubung', icon: 'book-open-page-variant', color: '#8B5CF6', bg: '#F5F3FF', route: 'Komentar' },
    { label: 'Presensi', icon: 'account-check', color: '#059669', bg: '#ECFDF5', route: 'Absensi' },
    { label: 'Kisi-kisi', icon: 'file-question', color: '#EF4444', bg: '#FEF2F2', route: 'KisiKisi' },
    { label: 'Bank Soal', icon: 'database-outline', color: '#0D9488', bg: '#E6FFFA', route: 'BankSoal' },
    { label: 'Ujian CBT', icon: 'laptop', color: '#2563EB', bg: '#EFF6FF', route: 'CbtExams' },
    { label: 'Kalender Akademik', icon: 'calendar-month', color: '#0284C7', bg: '#F0F9FF', route: 'Kalender' },
  ], []);

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
  // Menu Portal Orang Tua di Beranda disembunyikan sesuai permintaan pengguna (tidak dihapus agar mudah dimunculkan kembali)
  const SHOW_PARENT_PORTAL_MENU = false;

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
      setParentChildren(cachedChildren);
      useActiveChildStore.getState().setChildren(cachedChildren);
      const gid = useActiveChildStore.getState().activeChildId;
      let initialIdx = 0;
      if (gid) {
        const found = cachedChildren.findIndex((c) => String(c.id || c.student_id) === String(gid));
        if (found !== -1) {
          initialIdx = found;
          setActiveChildIndex(found);
        }
      }
      requestAnimationFrame(() => {
        studentScrollRef.current?.scrollTo({
          x: initialIdx * studentSnapInterval,
          animated: false,
        });
      });
    } else if (!isParentUser) {
      setParentChildren([]);
      useActiveChildStore.getState().clear();
    }

    // 2. Fetch dari backend
    try {
      const currentRoles = useAuthStore.getState().roles;
      const isParentActive = isParentRole(currentRoles);
      const [dashRes, profRes, infoRes, notifRes, unreadCountRes, childrenRes] = await Promise.allSettled([
        mobileApiService.getRoleDashboard(currentRoles),
        mobileApiService.getProfile(),
        mobileApiService.getSchoolInformation({ per_page: 50 }),
        mobileApiService.getNotifications(),
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
        }
      }
      if (infoRes.status === 'fulfilled') {
        const infoList = unwrapCollection<any>(infoRes.value);
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
      } else if (notifRes.status === 'fulfilled') {
        const notifData = unwrapCollection<any>(notifRes.value);
        if (Array.isArray(notifData)) {
          const unread = notifData.filter((n: any) => !n.read_at && !n.is_read).length;
          setUnreadNotificationCount(unread > 0 ? unread : 0);
        }
      }
      if (isParentActive && childrenRes.status === 'fulfilled') {
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
          // Pastikan scroll tetap berada di posisi anak aktif, jangan melompat ke anak pertama
          requestAnimationFrame(() => {
            studentScrollRef.current?.scrollTo({
              x: curIdx * studentSnapInterval,
              animated: false,
            });
          });
          if (chList.length > 0) {
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
        }
      } else if (!isParentActive) {
        setParentChildren([]);
        useActiveChildStore.getState().clear();
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
  const tu = isTuRole(roles);
  const operator = isOperatorRole(roles);
  const staff = tu || operator;
  const alumni = isAlumniRole(roles);
  const divisi = isDivisiRole(roles);
  const musyrif = isMusyrifRole(roles);

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

  const studentClass = dashboard?.student?.kelas?.nama_kelas || user?.kelas || '';
  const subGreeting = student
    ? studentClass ? `${studentClass} · Siswa` : 'Siswa'
    : parent
    ? `Orang Tua dari ${user?.student_name || 'Siswa'}`
    : alumni
    ? 'Alumni'
    : musyrif
    ? 'Musyrif Asrama'
    : teacher
    ? 'Guru Pengajar'
    : principal
    ? 'Kepala Sekolah'
    : foundation || superAdmin || divisi
    ? 'Yayasan & Pimpinan'
    : 'Tata Usaha / Staf';

  // 4-Column Dynamic Menus Mapped Per Role (Mockup #4)
  const roleMenus = useMemo(() => {
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
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
        ['Absensi Asrama', 'home-account', '#0D9488', '#E6FFFA', 'Absensi', 'boarding'],
        ['Izin Santri', 'card-account-details-outline', '#EF4444', '#FEF2F2', 'Perizinan'],
        ['Mutabaah Asrama', 'clipboard-check', '#F59E0B', '#FEF9EC', 'Mutabaah'],
        ['Tahfizh', 'book-marker', '#2563EB', '#EFF6FF', 'Tahfizh'],
        ['Kalender', 'calendar-month', '#2563EB', '#EFF6FF', 'Kalender'],
        ['Informasi', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Pengaturan', 'cog', '#64748B', '#F8FAFC', 'Lainnya'],
      ];
    }
    if (principal) {
      return [
        ['Dashboard Kepala Sekolah', 'view-dashboard-outline', '#059669', '#E6F4EA', 'PrincipalDashboard'],
        ['Presensi Guru', 'account-check-outline', '#059669', '#ECFDF5', 'RekapPresensiGuru', 'pegawai'],
        ['Presensi Siswa', 'account-group', '#0284C7', '#E0F2FE', 'RekapPresensiSiswa', 'siswa'],
        ['Presensi Mandiri', 'account-clock-outline', '#10B981', '#ECFDF5', 'PresensiMandiriStaff'],
        ['Monitoring Guru Mengajar', 'google-classroom', '#D97706', '#FEF3C7', 'PantauKelas'],
        ['Buku Induk Siswa', 'database-outline', '#0284C7', '#E0F2FE', 'Data'],
        ['Kelola Alumni & Mutasi', 'account-switch', '#7C3AED', '#F5F3FF', 'MutasiSiswa'],
        ['KBM Pengganti', 'account-switch-outline', '#0D9488', '#CCFBF1', 'PresensiKbmPengganti'],
        ['Izin & Cuti', 'file-document-edit', '#D97706', '#FEF3C7', 'Perizinan'],
        ['Izin Asrama', 'door-open', '#E11D48', '#FFE4E6', 'Perizinan', 'asrama'],
        ['Jadwal Pelajaran', 'calendar-clock', '#2563EB', '#EFF6FF', 'Jadwal'],
        ['Kalender Akademik', 'calendar-month', '#0891B2', '#CFFAFE', 'Kalender'],
        ['Materi Belajar', 'book-open-page-variant', '#0D9488', '#CCFBF1', 'Materi'],
        ['Tugas Siswa', 'clipboard-text', '#F59E0B', '#FEF9EC', 'Tugas'],
        ['Penilaian & Rapor', 'card-account-details-star-outline', '#059669', '#E6F4EA', 'Nilai'],
        ['Bank Soal', 'laptop', '#7C3AED', '#F5F3FF', 'BankSoal'],
        ['Setoran Tahfizh', 'book-marker', '#059669', '#E6F4EA', 'Tahfizh'],
        ['Mutaba\'ah Yaumiyah', 'clipboard-check', '#E11D48', '#FFE4E6', 'Mutabaah'],
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
        ['Tagihan SPP', 'cash-multiple', '#059669', '#ECFDF5', 'Tagihan'],
        ['Penilaian & Rapor', 'file-document', '#3B82F6', '#EFF6FF', 'Nilai'],
        ['Buku Penghubung', 'book-open-page-variant', '#7C3AED', '#FAF5FF', 'Komentar'],
        ['Kalender Akademik', 'calendar-month', '#2563EB', '#EFF6FF', 'Kalender'],
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
        ['Informasi Sekolah', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Jadwal Pelajaran', 'clock-time-four', '#7C3AED', '#F5F3FF', 'Jadwal'],
        ['Materi Belajar', 'book-multiple', '#059669', '#ECFDF5', 'Materi'],
        ['Tugas Siswa', 'clipboard-text', '#F59E0B', '#FEF9EC', 'Tugas'],
        ['Tahfizh', 'book-marker', '#2563EB', '#EFF6FF', 'Tahfizh'],
        ['Mutabaah Yaumiyah', 'clipboard-check', '#F59E0B', '#FEF9EC', 'Mutabaah'],
        ['Presensi Siswa', 'account-check', '#7C3AED', '#F5F3FF', 'Absensi'],
        ['Kisi-kisi', 'file-question', '#EF4444', '#FEF2F2', 'KisiKisi'],
        ['Bank Soal', 'database-outline', '#0D9488', '#E6FFFA', 'BankSoal'],
        ['CBT Ujian Online', 'laptop', '#2563EB', '#EFF6FF', 'CbtExams'],
        ['Perizinan', 'file-document-edit', '#EF4444', '#FEF2F2', 'Perizinan'],
      ];
    }
    if (student) {
      return [
        ['Al-Qur\'an', 'book-open-variant', '#059669', '#F0FDF4', 'Quran'],
        ['Doa & Dzikir', 'hands-pray', '#F97316', '#FFF7ED', 'DoaDzikir'],
        ['Kalender Akademik', 'calendar-month', '#0284C7', '#F0F9FF', 'Kalender'],
        ['Informasi Sekolah', 'bullhorn', '#E11D48', '#FFF1F2', 'Informasi'],
        ['Jadwal Pelajaran', 'clock-time-four', '#7C3AED', '#F5F3FF', 'Jadwal'],
        ['Materi Belajar', 'book-multiple', '#059669', '#ECFDF5', 'Materi'],
        ['Tugas Siswa', 'clipboard-text', '#F59E0B', '#FEF9EC', 'Tugas'],
        ['Tahfizh', 'book-marker', '#2563EB', '#EFF6FF', 'Tahfizh'],
        ['Penilaian & Rapor', 'chart-box', '#10B981', '#E8FAF2', 'Nilai'],
        ['Presensi Siswa', 'account-check', '#7C3AED', '#F5F3FF', 'Absensi'],
        ['Mutabaah Yaumiyah', 'clipboard-check', '#F59E0B', '#FEF9EC', 'Mutabaah'],
        ['Kisi-kisi', 'file-question', '#EF4444', '#FEF2F2', 'KisiKisi'],
        ['Bank Soal', 'database-outline', '#0D9488', '#E6FFFA', 'BankSoal'],
        ['CBT Ujian Online', 'laptop', '#2563EB', '#EFF6FF', 'CbtExams'],
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
  }, [principal, foundation, superAdmin, divisi, musyrif, alumni, teacher, parent, student, tu]);

  const primaryMenuItems = useMemo(() => {
    if (parent) {
      return [
        ['Pembayaran', 'wallet', '#E11D48', '#FFF1F4', 'Tagihan'],
        ['Tagihan SPP', 'cash-multiple', '#059669', '#ECFDF5', 'Tagihan'],
        ['Rekap Aktivitas', 'chart-bar', '#10B981', '#F0FDF4', 'Absensi'],
        ['Perkembangan Anak', 'chart-line', '#059669', '#ECFDF5', 'Nilai'],
        ['Laporan & Rapor', 'file-document', '#3B82F6', '#EFF6FF', 'Nilai'],
        ['Buku Penghubung', 'book-open-page-variant', '#7C3AED', '#FAF5FF', 'Komentar'],
        ['Agenda Orang Tua', 'calendar-check', '#10B981', '#F0FDF4', 'Kalender'],
        ['Lihat Semua', 'view-grid-plus-outline', '#0D9488', '#E6FFFA', '__OPEN_MODAL__'],
      ];
    }
    const top7 = roleMenus.slice(0, 7);
    const toggleTile = isMenuExpanded
      ? ['Kembali', 'chevron-up', '#047857', '#DEF7EC', '__TOGGLE__']
      : ['Lainnya', 'view-grid-plus-outline', '#10B981', '#ECFDF5', '__TOGGLE__'];
    return [...top7, toggleTile];
  }, [parent, roleMenus, isMenuExpanded]);

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
    [parent, teacher, parentChildren, activeChildIndex, navigation]
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
    const isDirectTap = Date.now() - lastDirectTapTimeRef.current < 600;
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
    const isDirectTap = Date.now() - lastDirectTapTimeRef.current < 600;
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
  const stickyActiveStudentClass = typeof activeStudent?.kelas === 'object'
    ? (activeStudent?.kelas?.nama_kelas || activeStudent?.kelas?.name || '')
    : (activeStudent?.class_name || activeStudent?.kelas || (student ? studentClass : ''));
  const stickyActiveStudentUnit = typeof activeStudent?.education_unit === 'object'
    ? (activeStudent?.education_unit?.name || activeStudent?.education_unit?.nama || '')
    : (activeStudent?.unit_name || (student ? (user as any)?.unit_name || '' : ''));

  // Label Kelas/Jenjang/Presensi disamakan rumus dengan card bodi (sKelas/sJenjang/rawPresensi)
  const stickyStudentKelas = typeof activeStudent?.kelas === 'object'
    ? (activeStudent?.kelas?.nama_kelas || activeStudent?.kelas?.name || '')
    : (activeStudent?.class_name || activeStudent?.kelas || '');
  const stickyStudentJenjang =
    activeStudent?.kelas?.jenjang || activeStudent?.education_unit?.level || '';
  const stickyRawPresensi =
    activeStudent?.attendance_today?.status ||
    activeStudent?.presensi_hari_ini?.status ||
    activeStudent?.attendance_status ||
    activeStudent?.status_kehadiran ||
    activeStudent?.presensi_status ||
    (String(todayTimeline?.student?.id || '') === String(activeStudent?.id || '') ? todayTimeline?.summary?.attendance_status : undefined) ||
    'Hadir';
  const stickyIsHadir = String(stickyRawPresensi).toLowerCase().includes('hadir');
  const stickyIsIzinSakit = String(stickyRawPresensi).toLowerCase().includes('izin') || String(stickyRawPresensi).toLowerCase().includes('sakit');
  const stickyIsTerlambat = String(stickyRawPresensi).toLowerCase().includes('terlambat') || String(stickyRawPresensi).toLowerCase().includes('alpha');
  // Warna teks & titik disamakan persis card bodi
  const stickyPresensiTextColor = stickyIsHadir ? '#DEF7EC' : stickyIsIzinSakit ? '#FEF08A' : stickyIsTerlambat ? '#FECACA' : '#E2E8F0';
  const stickyPresensiDotColor = stickyIsHadir ? '#10B981' : stickyIsIzinSakit ? '#F59E0B' : stickyIsTerlambat ? '#EF4444' : '#94A3B8';
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

  const unitFilteredAnnouncements = useMemo(() => {
    if (!parent && !student) return announcements;
    if (!activeStudentUnitId && !activeStudentUnitName) return announcements;

    return announcements.filter((item: any) => {
      const meta = item?.data_tambahan || {};
      const itemUnitId = String(item?.unit_id || item?.education_unit_id || meta?.unit_id || meta?.education_unit_id || meta?.target_unit || '').trim();
      const itemUnitName = String(item?.unit_name || item?.education_unit || meta?.unit_name || meta?.education_unit || meta?.target_unit_name || '').toLowerCase().trim();
      const itemTitle = String(item?.judul_pengumuman || item?.judul || item?.title || '').toLowerCase();

      // 1. Jika bertarget 'all' / umum untuk seluruh yayasan
      const isYayasanGeneral =
        itemUnitId === 'all' ||
        meta?.target_unit === 'all' ||
        itemUnitName === 'all' ||
        itemUnitName.includes('seluruh unit') ||
        itemUnitName.includes('semua unit') ||
        itemUnitName.includes('yayasan') ||
        (!itemUnitId && !itemUnitName);

      // 2. Jika secara spesifik cocok dengan Unit ID siswa aktif
      const isUnitIdMatch = Boolean(
        activeStudentUnitId &&
        (itemUnitId === activeStudentUnitId || meta?.unit_id === activeStudentUnitId || meta?.education_unit_id === activeStudentUnitId)
      );

      // 3. Jika nama unit cocok
      const isUnitNameMatch = Boolean(
        activeStudentUnitName &&
        itemUnitName &&
        (itemUnitName.includes(activeStudentUnitName) || activeStudentUnitName.includes(itemUnitName))
      );

      if (isUnitIdMatch || isUnitNameMatch) {
        return true;
      }

      // 4. Jika general yayasan, pastikan tidak ada penyebutan unit spesifik lain pada judul atau unit_name
      if (isYayasanGeneral) {
        const otherUnitKeywords = [
          'tkit 1', 'tkit 2', 'tkit 3', 'taud saqu', 'sdit 1', 'sdit 2', 'sdit 3', 'sdit 4',
          'mit saqu', 'smpit 1', 'smpit 2', 'ponpes putri', 'ponpes putra', 'smait', "mahad abu ja'far"
        ];
        const hasOtherUnitKeyword = otherUnitKeywords.some((k) => {
          if (activeStudentUnitName.includes(k)) return false;
          return itemTitle.includes(k) || itemUnitName.includes(k);
        });

        return !hasOtherUnitKeyword;
      }

      return false;
    });
  }, [announcements, parent, student, activeStudentUnitId, activeStudentUnitName]);

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
    <View style={styles.safeArea}>
      {/* REALTIME IN-APP TOAST NOTIFICATION BANNER */}
      {realtimeBanner && (
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

      {/* 1. STICKY RICH APP BAR — Contextual per role, muncul saat halaman di-scroll ke bawah */}
      <Animated.View
        style={[
          styles.stickyHeaderBar,
          {
            paddingTop: topInset + 4,
            opacity: stickyOpacity,
            transform: [{ translateY: stickyTranslateY }],
            pointerEvents: 'box-none',
          },
        ]}
      >
        {/* Background: foto masjid + overlay + dekorasi, bawahnya dipotong 40px
            (sejajar batas atas deretan tombol / tengah card) saat rich card aktif
            sehingga card tampak melayang. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              bottom: (parent || student || teacher || tu || principal) ? 40 : 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            },
          ]}
        >
          <Image
            source={HEADER_MOSQUE_BG}
            style={[StyleSheet.absoluteFill, styles.stickyMosqueBgImage]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(8, 90, 56, 0.35)', 'rgba(10, 100, 65, 0.08)', 'rgba(52, 211, 153, 0.12)']}
            locations={[0, 0.45, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.stickyDecorCircle1} />
          <View style={styles.stickyDecorCircle2} />
        </View>

        {/* ── BARIS ATAS: Logo SIMSIT + Nama Sekolah + Bell + Avatar ── */}
        <View style={styles.stickyTopRow}>
          <View style={styles.stickyBrandGroup}>
            <View style={styles.stickyLogoWrap}>
              <Image source={SPLASH_LOGO} style={styles.stickyLogoImg} resizeMode="contain" />
            </View>
            <View style={styles.stickyBrandTextCol}>
              <Text style={styles.stickyBrandLabel}>SIMSIT</Text>
              <Text numberOfLines={1} style={styles.stickyBrandSub}>
                {mobileConfig.branding?.school_name || 'Yayasan Dar El-Iman'}
              </Text>
            </View>
          </View>

          <View style={styles.stickyTopRightActions}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Notifikasi')}
              style={styles.stickySquircleActionBtn}
              accessibilityLabel="Notifikasi"
            >
              <MaterialCommunityIcons name="bell-outline" size={18} color="#FFFFFF" />
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
              style={styles.stickyAvatarSquircleBtn}
              accessibilityLabel="Profil"
            >
              <Image source={stickyParentAvatarSource} style={styles.stickyTopAvatarImg} resizeMode="cover" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── RICH CARD: ukuran kompak ala sticky halaman Jadwal ── */}
        {(parent || student || teacher || tu || principal) && (
          <View style={{ marginHorizontal: 12, marginTop: 6, marginBottom: 10 }}>
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
          </View>
        )}

      </Animated.View>

      {/* 2. MAIN SCROLLABLE DASHBOARD BODY */}
      <Animated.ScrollView
        ref={mainScrollViewRef}
        style={styles.screen}
        contentContainerStyle={styles.mainScrollContent}
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
                    <MaterialCommunityIcons name="bell-outline" size={20} color="#059669" />
                    {unreadNotificationCount > 0 && (
                      <View style={styles.unreadBadgeDot} />
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

            {/* Horizontal Scrollable Track of Student Cards */}
            <ScrollView
              ref={studentScrollRef}
              horizontal
              nestedScrollEnabled={true}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.studentCardsTrack, { paddingHorizontal: studentTrackPad }]}
              decelerationRate="fast"
              snapToInterval={studentSnapInterval}
              snapToAlignment="start"
              keyboardShouldPersistTaps="always"
              onMomentumScrollEnd={(e) => {
                handleStudentScrollEnd(e.nativeEvent.contentOffset.x);
              }}
              onScrollEndDrag={(e) => {
                if (Date.now() - lastDirectTapTimeRef.current >= 750) {
                  const x = e.nativeEvent.contentOffset.x;
                  setTimeout(() => {
                    handleStudentScrollEnd(x);
                  }, 100);
                }
              }}
              scrollEventThrottle={16}
            >
              {parentChildren.map((student: any, realIdx: number) => {
                const isCardActive = realIdx === activeChildIndex;
                const sName = student.full_name || student.nama_lengkap || student.name || 'Siswa';
                const sNis = student.nis || '-';
                const sNisn = student.nisn || student.metadata?.nisn || '-';
                const sUnit = student.education_unit?.name || student.unit_name || 'Unit Pendidikan';
                const rawKelas =
                  (typeof student.kelas === 'object' && student.kelas ? (student.kelas.nama_kelas || student.kelas.name) : '') ||
                  (typeof student.class_name === 'string' ? student.class_name : '') ||
                  (typeof student.kelas === 'string' ? student.kelas : '') ||
                  (typeof student.rombel === 'string' ? student.rombel : '') ||
                  (typeof student.rombel === 'object' && student.rombel ? (student.rombel.name || student.rombel.nama_rombel) : '') ||
                  '-';
                const sKelas = rawKelas.replace(/\s*\([^)]*\)/g, '').trim() || rawKelas;
                const sJenjang = (student.kelas?.jenjang || student.education_unit?.level || 'Terpadu').replace(/\s*\([^)]*\)/g, '').trim();
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
                const displayPresensi = isHadir
                  ? 'Hadir'
                  : isIzinSakit
                  ? (String(rawPresensi).toLowerCase().includes('izin') ? 'Izin' : 'Sakit')
                  : isTerlambat
                  ? (String(rawPresensi).toLowerCase().includes('alpha') ? 'Alpha' : 'Terlambat')
                  : (String(rawPresensi).replace(/\s*\([^)]*\)/g, '').trim() || 'Hadir');
                const presensiTextColor = isHadir ? '#DEF7EC' : isIzinSakit ? '#FEF08A' : isTerlambat ? '#FECACA' : '#E2E8F0';
                const presensiDotColor = isHadir ? '#10B981' : isIzinSakit ? '#F59E0B' : isTerlambat ? '#EF4444' : '#94A3B8';

                const cardContent = (
                  <LinearGradient
                    colors={isCardActive ? ['#0D6B42', '#18A165', '#2BD988'] : ['#064E3B', '#0D6B42', '#10B981']}
                    locations={[0, 0.55, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.studentMainCard,
                      { width: studentCardWidth },
                      !isCardActive && { opacity: 0.9 },
                    ]}
                  >
                    {/* Decorative Blob Like Header */}
                    <View pointerEvents="none" style={styles.cardDecorCircle} />

                    {/* Konten Kartu: hanya merespons sentuhan jika kartu aktif, sehingga kartu non-aktif dapat diketuk di mana saja untuk memilih anak */}
                    <View pointerEvents={isCardActive ? 'auto' : 'none'}>
                      {/* 1. Baris Paling Atas: Lencana Unit Pendidikan (Kiri) & 3 Tombol Aksi Bel, Laporan, QR (Kanan) */}
                      <View style={styles.studentCardTopBar}>
                      <View style={styles.studentUnitBadgeTop}>
                        <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text numberOfLines={1} style={styles.studentUnitText}>
                          {sUnit}
                        </Text>
                      </View>

                      {/* 3 Tombol Aksi Siswa (Dipindahkan ke Baris Atas) */}
                      <View style={styles.studentCardHeaderActions}>
                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => void handleOpenStudentNotifications(student)}
                          style={[styles.studentQrBtn, { position: 'relative' }]}
                          accessibilityLabel="Pengingat & Notifikasi Siswa"
                        >
                          <MaterialCommunityIcons name="bell-ring-outline" size={17} color="#059669" />
                          {(Boolean(student?.unread_notifications_count > 0 || student?.unread_count > 0) ||
                            (unreadNotificationCount > 0 && String(student?.id || student?.student_id) === String(activeStudent?.id || activeStudent?.student_id))) && (
                            <View
                              style={{
                                position: 'absolute',
                                top: -2,
                                right: -2,
                                width: 9,
                                height: 9,
                                borderRadius: 4.5,
                                backgroundColor: '#EF4444',
                                borderWidth: 1.5,
                                borderColor: '#FFFFFF',
                              }}
                            />
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => handleOpenWeeklyReport(student)}
                          style={styles.studentQrBtn}
                          accessibilityLabel="Laporan Perkembangan Pekanan Siswa"
                        >
                          <MaterialCommunityIcons name="clipboard-text-outline" size={17} color="#059669" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => setSelectedQrStudent(student)}
                          style={styles.studentQrBtn}
                          accessibilityLabel="Tampilkan QR Code Siswa"
                        >
                          <MaterialCommunityIcons name="qrcode-scan" size={17} color="#059669" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* 2. Baris Profil Tengah: Avatar + Nama Siswa Penuh (Sangat Lega, Tanpa Terpotong/Terhimpit) */}
                    <View style={styles.studentCardProfileRow}>
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
                        <Text numberOfLines={2} style={styles.studentFullName}>
                          {sName}
                        </Text>
                        <Text numberOfLines={1} style={styles.studentNisText}>
                          NIS: {sNis} {sNisn !== '-' ? '· NISN: ' + sNisn : ''}
                        </Text>
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
                          <Text numberOfLines={1} style={[styles.studentAttrValue, { color: presensiTextColor }]}>{displayPresensi}</Text>
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
                        <MaterialCommunityIcons name="card-account-details" size={15} color="#059669" style={{ marginRight: 4 }} />
                        <Text style={styles.studentActionBtnCardText}>Kartu Siswa</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => navigation.navigate('Kalender', { child_id: String(student.id), student_id: String(student.id) })}
                        style={styles.studentActionBtnSecondary}
                      >
                        <MaterialCommunityIcons name="calendar-month" size={15} color="#2563EB" style={{ marginRight: 4 }} />
                        <Text style={styles.studentActionBtnSecondaryText}>Kalender</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setActiveChildIndex(realIdx);
                          setSelectedPortalChild(student);
                          const sid = student?.id || student?.student_id;
                          if (sid) {
                            useActiveChildStore.getState().setActiveChildId(sid);
                          }
                          setShowChildPortalModal(true);
                        }}
                        style={styles.studentActionBtnPrimary}
                      >
                        <MaterialCommunityIcons
                          name="view-grid"
                          size={15}
                          color="#7C3AED"
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.studentActionBtnPrimaryText}>
                          Menu
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </LinearGradient>
              );

              if (!isCardActive) {
                return (
                  <TouchableOpacity
                    key={`child-card-${realIdx}-${String(student?.id ?? realIdx)}`}
                    activeOpacity={0.85}
                    onPress={() => goToLoopChild(realIdx, true)}
                    style={{ width: studentCardWidth }}
                  >
                    {cardContent}
                  </TouchableOpacity>
                );
              }

              return (
                <View
                  key={`child-card-${realIdx}-${String(student?.id ?? realIdx)}`}
                  style={{ width: studentCardWidth }}
                >
                  {cardContent}
                </View>
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
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                    onPress={() => {
                      goToLoopChild(dotIdx, true);
                    }}
                    style={[
                      styles.studentDot,
                      activeChildIndex === dotIdx ? styles.studentDotActiveInHeader : styles.studentDotInactiveInHeader,
                    ]}
                  />
                ))}
              </View>
            )}

          </Animated.View>
        )}

        {/* SECTION: Kartu Identitas Pegawai / Guru / Pimpinan (Di dalam Header Hijau Penuh) */}
        {(!parent && !student && !alumni) && (
          <EmployeeHeaderCard
            user={user}
            dashboard={dashboard}
            roles={roles}
            navigation={navigation}
            onOpenAllMenus={() => setShowAllMenusModal(true)}
          />
        )}
        </View>

        {/* ============================================================ */}
        {/* SHEET PUTIH/SLATE: Melengkung Dimulai Tepat di Bawah Anak    */}
        {/* Body otomatis bergeser ke bawah saat sticky header aktif      */}
        {/* ============================================================ */}
        <Animated.View style={styles.curvedSheetBody}>

        {/* ============================================================ */}
        {/* KONTAINER MENU PORTAL ORANG TUA (Sesuai Style Menu Siswa)   */}
        {/* ============================================================ */}
        {(SHOW_PARENT_PORTAL_MENU && parent) ? (
          <View style={styles.childPortalMenuContainer}>
            {/* Header Kontainer Menu Portal Orang Tua */}
            <View style={styles.childPortalMenuHeader}>
              <View style={styles.childPortalMenuHeaderLeft}>
                <View style={styles.childPortalMenuHeaderIconBox}>
                  <MaterialCommunityIcons name="account-group" size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.childPortalMenuHeaderTitle}>
                    Portal Orang Tua · {activeStudent?.nama_lengkap || activeStudent?.nama || activeStudent?.name || 'Ananda'}
                  </Text>
                  <Text numberOfLines={1} style={styles.childPortalMenuHeaderSub}>
                    Layanan & Pemantauan Santri Terpadu
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setShowAllMenusModal(true)}
                style={styles.childPortalBadge}
              >
                <Text style={styles.childPortalBadgeText}>Semua Menu</Text>
              </TouchableOpacity>
            </View>

            {/* Grid 4 Kolom Menu Portal Orang Tua */}
            <View style={styles.childPortalGrid}>
              {primaryMenuItems.map(([label, icon, color, bgPastel, route], idx) => {
                const isModalTile = route === '__OPEN_MODAL__' || label === 'Lihat Semua';
                const tabKey = isModalTile ? undefined : (primaryMenuItems[idx] as any)?.[5];
                return (
                  <TouchableOpacity
                    key={`parent-menu-${idx}`}
                    activeOpacity={0.75}
                    style={styles.childPortalGridItem}
                    onPress={() => {
                      if (isModalTile) {
                        setShowAllMenusModal(true);
                      } else {
                        handleMenuNavigation(String(route), tabKey ? String(tabKey) : undefined);
                      }
                    }}
                  >
                    <View style={[styles.childPortalIconSquircle, { backgroundColor: String(color) }]}>
                      <MaterialCommunityIcons
                        name={String(icon) as any}
                        size={22}
                        color="#FFFFFF"
                      />
                    </View>
                    <Text
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={styles.childPortalMenuLabel}
                    >
                      {String(label)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : teacher && !principal ? (
          /* ============================================================ */
          /* DASHBOARD PENDIDIK / GURU TERPADU SESUAI MOCKUP GAMBAR       */
          /* 4 KPI Cards, Timeline Jadwal Hari Ini, 12 Menu Utama, Notif  */
          /* ============================================================ */
          <TeacherDashboardView
            dashboard={dashboard}
            navigation={navigation}
            announcements={announcements}
            onOpenAllMenus={() => setShowAllMenusModal(true)}
          />
        ) : tu && !principal && !foundation && !superAdmin && !divisi ? (
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
          </>
        ) : null}



        {/* ============================================================ */}
        {/* ============================================================ */}
        {/* KONTAINER MENU LAYANAN SISWA (PORTAL SISWA) — CAROUSEL 6 MENU */}
        {/* ============================================================ */}
        {Boolean((student || parent) && (student || activeStudent)) && (
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
        {/* CARD BANNER: PORTAL ORANG TUA (Tepat di Atas Menu Siswa)     */}
        {/* ============================================================ */}
        {parent && (
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.parentPortalBannerCard}
            onPress={() => setShowAllMenusModal(true)}
          >
            <View style={styles.parentPortalBannerIconCircle}>
              <MaterialCommunityIcons name="account-group" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.parentPortalBannerTextWrap}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.parentPortalBannerTitle}>Portal Orang Tua</Text>
                <View style={styles.parentPortalBannerTag}>
                  <Text style={styles.parentPortalBannerTagText}>TERPADU</Text>
                </View>
              </View>
              <Text style={styles.parentPortalBannerSubtitle}>
                Layanan & kebutuhan terpadu orang tua
              </Text>
            </View>
            <View style={styles.parentPortalBannerArrowBox}>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#059669" />
            </View>
          </TouchableOpacity>
        )}

        {/* ============================================================ */}
        {/* ============================================================ */}
        {/* SECTION: Aktivitas Siswa Hari Berjalan (Realtime Feed)        */}
        {/* ============================================================ */}
        {Boolean((parent && isChildDetailsExpanded) || (student && !parent)) && (
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
        {/* ============================================================ */}
        {Boolean(
          ((!parent && (student || activeStudent)) || (parent && activeStudent && isChildDetailsExpanded))
        ) && (
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
        {/* SECTION: Widget Tugas Terbaru & Jadwal Hari Ini (List Format)*/}
        {/* ============================================================ */}
        {Boolean((!parent && (student || parent)) || (parent && isChildDetailsExpanded)) && (
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
            {(foundation || superAdmin || divisi) && (
              <FoundationDashboardView dashboard={dashboard} navigation={navigation} />
            )}
            {/* Staff generik (Operator, dll) */}
            {staff && !tu && !teacher && !principal && !foundation && !superAdmin && !divisi && (
              <StaffDashboardView dashboard={dashboard} navigation={navigation} />
            )}
          </>
        )}

        {/* SECTION: Berita & Informasi (Harmonized Emerald Card Container & List Content) */}
        {!teacher && !principal && (
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
                onPress={() => navigation.navigate('Informasi')}
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
            ) : (
              <>
                <ScrollView
                  ref={newsCarouselScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={SCREEN_WIDTH - 56}
                  snapToAlignment="start"
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
                    const unitLabel = item.unit_name || meta.unit_name || meta.target_unit_name || (item.unit_id === 'all' || meta.target_unit === 'all' ? 'Yayasan' : 'Unit');

                    return (
                      <TouchableOpacity
                        key={`news-carousel-${item.id ?? idx}`}
                        activeOpacity={0.88}
                        style={styles.newsCarouselSlideCard}
                        onPress={() => setSelectedNews({ ...item, _index: idx })}
                      >
                        {/* 1. Gambar / Banner Thumbnail Berita */}
                        <View style={styles.newsCarouselImageBox}>
                          <Image
                            source={getNewsThumbnail(item, idx)}
                            style={styles.newsCarouselImage}
                            resizeMode="cover"
                          />
                          {/* Overlay Lencana Kategori & Unit */}
                          <View style={styles.newsCarouselBadgeOverlay}>
                            <View style={styles.newsCarouselCategoryPill}>
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
                  onPress={() => navigation.navigate('Informasi')}
                >
                  <Text style={[styles.homeWidgetMoreText, { color: '#059669' }]}>
                    Lihat semua arsip berita & informasi sekolah
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

              {announcements.map((item: any, idx: number) => {
                const itemDate = item.created_at
                  ? new Date(item.created_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Terbaru';

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
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: '#ECFDF5',
                          borderWidth: 1,
                          borderColor: '#A7F3D0',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 8,
                          gap: 4,
                        }}
                      >
                        <MaterialCommunityIcons name="bullhorn" size={12} color="#059669" />
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#047857' }}>Warta Sekolah</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <MaterialCommunityIcons name="calendar-outline" size={12} color="#94A3B8" />
                        <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                          {itemDate}
                        </Text>
                      </View>
                    </View>

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
              })}
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
              <View style={[styles.modalNewsCoverBox, { borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: '#A7F3D0', marginBottom: 14 }]}>
                <Image
                  source={getNewsThumbnail(selectedNews, selectedNews?._index ?? 0)}
                  style={styles.modalNewsCoverImage}
                  resizeMode="cover"
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
                      Kelas: <Text style={{ fontWeight: '800' }}>{selectedWeeklyStudent?.kelas?.nama_kelas || selectedWeeklyStudent?.kelas || selectedWeeklyStudent?.rombel || weeklyReportData?.student?.kelas?.nama_kelas || '-'}</Text>
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
    // Tepi bawah LURUS (radius dihapus): peran kurva dikembalikan seperti bodi —
    // header hijau lurus, sheet putih yang melengkung. Radius bawah di sini
    // justru membalik susunan itu (terlihat terbalik).
    // Bayangan DIHAPUS total sesuai permintaan (opacity 0 + elevation 0).
    shadowColor: '#003822',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
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
    pointerEvents: 'none',
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
    backgroundColor: '#F8FAF9',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: 0,
    paddingTop: 4,
    paddingBottom: 94,
    minHeight: 500,
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
  // Tinjau Aktivitas Styles (Sesuai Desain Mockup Timeline Terbaru)
  activityTimelineCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
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
    height: 125,
    position: 'relative',
    backgroundColor: '#E2E8F0',
  },
  newsCarouselImage: {
    width: '100%',
    height: '100%',
  },
  newsCarouselBadgeOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newsCarouselCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 150, 105, 0.92)',
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
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    maxWidth: '65%',
  },
  newsCarouselUnitText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
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

  // 360° Executive Daily Hub Styles
  hubContainer: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
  parentPortalBannerCardInside: {
    marginHorizontal: 12,
    marginTop: 0,
    marginBottom: 12,
    backgroundColor: '#F5F3FF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  parentPortalBannerCard: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  parentPortalBannerIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  parentPortalBannerTextWrap: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  parentPortalBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
    fontFamily: 'Nunito_800ExtraBold',
    letterSpacing: -0.2,
  },
  parentPortalBannerTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: '#FDE68A',
  },
  parentPortalBannerTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  parentPortalBannerSubtitle: {
    fontSize: 11,
    color: '#059669',
    marginTop: 1,
    fontWeight: '600',
  },
  parentPortalBannerArrowBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
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
});
