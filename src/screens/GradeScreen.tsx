import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isTeacherRole, isTuRole, isPrincipalRole, isSuperAdminRole, isDivisiRole } from '../utils/roles';
import TeacherGradeWorkspace from '../components/teacher/TeacherGradeWorkspace';
import StaffLmsGradeWorkspace from '../components/staff/StaffLmsGradeWorkspace';
import { offlineCache } from '../utils/offlineCache';
import {
  getDynamicAcademicYear,
  getDynamicAcademicSemester,
  getDynamicAcademicMonths,
} from '../utils/academicYear';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { WeeklyEvaluationReportPaperModal } from '../components/WeeklyEvaluationReportPaperModal';
import { portalBodyStyles } from '../components/PortalBodyStyles';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';
import { GradeSemesterSelector } from '../components/grade/GradeSemesterSelector';
import { GradeHeroSummary } from '../components/grade/GradeHeroSummary';
import { GradeAkademikTab } from '../components/grade/GradeAkademikTab';
import { GradeTahfizhTab } from '../components/grade/GradeTahfizhTab';
import { GradeMutabaahTab } from '../components/grade/GradeMutabaahTab';
import {
  SubjectDetailModal,
  TahfizhDetailModal,
  MutabaahDetailModal,
  SemesterReportModal,
  PdfReportModal,
  SemesterPickerModal,
} from '../components/grade/GradeModals';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
  getStudentAvatarSource,
  isGirlStudent,
} from '../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;
const studentCardWidth = SCREEN_WIDTH - (STUDENT_PEEK_WIDTH * 2) - STUDENT_CARD_GAP;
const studentSnapInterval = studentCardWidth + STUDENT_CARD_GAP;
const studentTrackPad = STUDENT_PEEK_WIDTH;

type GradePayload = {
  items: any[];
  summary: {
    average_score: number | null;
    highest_score: number | null;
    passed_subjects: number;
    remedial_subjects: number;
    total_subjects: number;
  };
  student: any;
  period: any;
  publication: any;
};

const emptyPayload: GradePayload = {
  items: [],
  summary: {
    average_score: null,
    highest_score: null,
    passed_subjects: 0,
    remedial_subjects: 0,
    total_subjects: 0,
  },
  student: null,
  period: null,
  publication: null,
};

const scoreText = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : '-';
};

const getTahfizhPredicate = (score: unknown): string => {
  if (score === null || score === undefined || score === '') return '-';
  const num = Number(score);
  if (!Number.isFinite(num)) return '-';
  if (num >= 90) return 'Mumtaz';
  if (num >= 80) return 'Jayyid Jiddan';
  if (num >= 70) return 'Jayyid';
  if (num >= 60) return 'Maqbul';
  return 'Dhaif';
};

const formatDeadline = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}.${minutes}`;
};

const getDynamicCurrentWeekRange = (weekOffset = 0): string => {
  const now = new Date();
  now.setDate(now.getDate() + weekOffset * 7);
  const day = now.getDay();
  const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${monday.getDate()} – ${sunday.getDate()} ${months[sunday.getMonth()]} ${sunday.getFullYear()}`;
};

const getDynamicTodayString = (dayOffset = 0): string => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const now = new Date();
  now.setDate(now.getDate() + dayOffset);
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
};


const getAssignmentStatus = (item: any): { key: string; label: string; color: string; bg: string; icon: any } => {
  const sub = Array.isArray(item.pengumpulan_tugas) && item.pengumpulan_tugas.length > 0
    ? item.pengumpulan_tugas[0]
    : Array.isArray(item.pengumpulanTugas) && item.pengumpulanTugas.length > 0
    ? item.pengumpulanTugas[0]
    : item.submission;

  const isGraded = sub && (sub.status === 'dinilai' || sub.status === 'graded' || (sub.nilai_guru !== null && sub.nilai_guru !== undefined));
  const isSubmitted = sub && (sub.status === 'dikumpulkan' || sub.status === 'submitted' || sub.status === 'revisi');
  const isLate = (sub && sub.status === 'terlambat') || (!sub && item.deadline && new Date(item.deadline) < new Date());

  if (isGraded) {
    return { key: 'graded', label: 'Sudah Dinilai', color: '#059669', bg: '#ECFDF5', icon: 'check-circle' };
  }
  if (isLate) {
    return { key: 'late', label: 'Terlambat', color: '#DC2626', bg: '#FEF2F2', icon: 'alert-circle' };
  }
  if (isSubmitted) {
    return { key: 'submitted', label: 'Sudah Dikumpulkan', color: '#2563EB', bg: '#EFF6FF', icon: 'clock-check-outline' };
  }
  return { key: 'pending', label: 'Belum Dikumpulkan', color: '#D97706', bg: '#FFFBEB', icon: 'clock-outline' };
};

const getSubjectTheme = (subjectName: string = ''): { bgIcon: string; iconColor: string; icon: any; badgeBg: string; badgeBorder: string; badgeText: string } => {
  const norm = (subjectName || '').toLowerCase();
  if (norm.includes('agama') || norm.includes('islam') || norm.includes('pai') || norm.includes('fiqih') || norm.includes('tahfiz') || norm.includes('quran') || norm.includes('hadits') || norm.includes('akidah')) {
    return {
      bgIcon: '#E6F8F0',
      iconColor: '#10B981',
      icon: 'book-open-page-variant-outline',
      badgeBg: '#ECFDF5',
      badgeBorder: '#A7F3D0',
      badgeText: '#059669',
    };
  }
  if (norm.includes('ipa') || norm.includes('alam') || norm.includes('fisika') || norm.includes('biologi') || norm.includes('kimia') || norm.includes('sains')) {
    return {
      bgIcon: '#F3E8FF',
      iconColor: '#9333EA',
      icon: 'flask-outline',
      badgeBg: '#EFF6FF',
      badgeBorder: '#BFDBFE',
      badgeText: '#2563EB',
    };
  }
  if (norm.includes('matematika') || norm.includes('math') || norm.includes('hitung') || norm.includes('aljabar')) {
    return {
      bgIcon: '#EFF6FF',
      iconColor: '#2563EB',
      icon: 'calculator-variant-outline',
      badgeBg: '#EFF6FF',
      badgeBorder: '#BFDBFE',
      badgeText: '#2563EB',
    };
  }
  if (norm.includes('bahasa') || norm.includes('indonesia') || norm.includes('inggris') || norm.includes('arab') || norm.includes('literasi')) {
    return {
      bgIcon: '#FFE4E6',
      iconColor: '#E11D48',
      icon: 'book-open-variant',
      badgeBg: '#FFF1F2',
      badgeBorder: '#FECDD3',
      badgeText: '#E11D48',
    };
  }
  if (norm.includes('ips') || norm.includes('sosial') || norm.includes('sejarah') || norm.includes('geografi') || norm.includes('ekonomi')) {
    return {
      bgIcon: '#FEF3C7',
      iconColor: '#D97706',
      icon: 'earth',
      badgeBg: '#FFFBEB',
      badgeBorder: '#FDE68A',
      badgeText: '#D97706',
    };
  }
  return {
    bgIcon: '#E6F8F0',
    iconColor: '#10B981',
    icon: 'book-open-page-variant-outline',
    badgeBg: '#ECFDF5',
    badgeBorder: '#A7F3D0',
    badgeText: '#059669',
  };
};

// 62 Doa Harian kurikulum resmi sekolah (sesuai dokumen fisik)
const FALLBACK_62_DOA_ITEMS = [
  { no: 1, nama: 'Doa sebelum Makan', grup: 'Adab Makan & Minum' },
  { no: 2, nama: 'Doa lupa baca bismillah', grup: 'Adab Makan & Minum' },
  { no: 3, nama: 'Doa lupa baca bismillah (ketika ingat)', grup: 'Adab Makan & Minum' },
  { no: 4, nama: 'Doa Setelah makan', grup: 'Adab Makan & Minum' },
  { no: 5, nama: 'Doa sebelum tidur', grup: 'Aktivitas Harian' },
  { no: 6, nama: 'Doa Bangun tidur', grup: 'Aktivitas Harian' },
  { no: 7, nama: 'Doa Masuk Wc :', grup: 'Adab Bersuci' },
  { no: 8, nama: 'Doa keluar Wc :', grup: 'Adab Bersuci' },
  { no: 9, nama: 'Doa akan berbuka', grup: 'Ibadah Puasa' },
  { no: 10, nama: 'Doa Keluar rumah', grup: 'Rumah & Safar' },
  { no: 11, nama: 'Doa Masuk Rumah', grup: 'Rumah & Safar' },
  { no: 12, nama: 'Doa naik kendaraan', grup: 'Rumah & Safar' },
  { no: 13, nama: 'Doa kedua orang tua', grup: 'Keluarga & Birrul Walidain' },
  { no: 14, nama: 'Doa minta dikuatkan iman', grup: 'Keimanan & Keteguhan' },
  { no: 15, nama: 'Doa ketika bersin', grup: 'Adab Harian' },
  { no: 16, nama: 'Doa Bagi yang mendengar', grup: 'Adab Harian' },
  { no: 17, nama: 'Doa Bagi yang bersin kembali', grup: 'Adab Harian' },
  { no: 18, nama: 'Doa agar diterima amal ibadah dan taubat', grup: 'Taubat & Amal Shalih' },
  { no: 19, nama: 'Doa agar dijadikan hamba yang bersyukur', grup: 'Syukur & Hidayah' },
  { no: 20, nama: 'Doa berlindung dari setan', grup: 'Perlindungan Diri' },
  { no: 21, nama: 'Doa agar hati ditetapkan dalam hidayah', grup: 'Keimanan & Keteguhan' },
  { no: 22, nama: 'Doa Sebelum Berwuduk', grup: 'Adab Bersuci' },
  { no: 23, nama: 'Doa setelah Berwuduk', grup: 'Adab Bersuci' },
  { no: 24, nama: 'Doa Pergi ke Masjid', grup: 'Masjid & Sholat' },
  { no: 25, nama: 'Doa Masuk Masjid', grup: 'Masjid & Sholat' },
  { no: 26, nama: 'Doa Keluar Masjid', grup: 'Masjid & Sholat' },
  { no: 27, nama: 'Doa Ditetapkan hati dalam Iman', grup: 'Keimanan & Keteguhan' },
  { no: 28, nama: 'Doa Berlindung dari Keburukan Amal', grup: 'Perlindungan Diri' },
  { no: 29, nama: 'Doa Mohon Bisa Melihat Wajah Allah', grup: 'Ketinggian Harapan' },
  { no: 30, nama: 'Doa Ampunan dalam segala hal', grup: 'Taubat & Istighfar' },
  { no: 31, nama: 'Doa Mohon Diperbaiki Segala Urusan', grup: 'Kelancaran Urusan' },
  { no: 32, nama: 'Doa Berlindung dari Keburukan Amal', grup: 'Perlindungan Diri' },
  { no: 33, nama: 'Doa Dicukupkan dari Harta Yang Halal', grup: 'Rezeki & Keberkahan' },
  { no: 34, nama: 'Doa Mohon Ampunan dan Rahmad', grup: 'Taubat & Rahmat' },
  { no: 35, nama: 'Doa ketetapan diri dan keluarga dalam mendirikan Sholat', grup: 'Keluarga & Sholat' },
  { no: 36, nama: 'Doa Diselamatkan dari orang orang yang Zholim', grup: 'Perlindungan dari Kezaliman' },
  { no: 37, nama: 'Doa agar amal ibadah diterima', grup: 'Penerimaan Amal' },
  { no: 38, nama: 'Doa berlindung dari keburukan orang-orang kafir', grup: 'Perlindungan Diri' },
  { no: 39, nama: 'Doa agar disempurnakan cahayanya', grup: 'Cahaya Iman' },
  { no: 40, nama: 'Doa agar dijadikan hamba yang bersyukur', grup: 'Syukur & Hidayah' },
  { no: 41, nama: 'Doa agar hati ditetapkan dalam hidayah', grup: 'Keimanan & Keteguhan' },
  { no: 42, nama: 'Doa agar dilapangkan hati dan dimudahkan dalam urusan', grup: 'Kelancaran Urusan' },
  { no: 43, nama: 'Doa meminta keamanan negeri dan berlindung dari syirik', grup: 'Keamanan & Tauhid' },
  { no: 44, nama: 'DOA UNTUK ORANG YANG SAKIT 1', grup: 'Kesehatan & Kesembuhan' },
  { no: 45, nama: 'DOA UNTUK ORANG YANG SAKIT 2', grup: 'Kesehatan & Kesembuhan' },
  { no: 46, nama: 'Doa ketika hujan Turun', grup: 'Fenomena Alam' },
  { no: 47, nama: 'Doa ketika Hujan Lebat', grup: 'Fenomena Alam' },
  { no: 48, nama: 'Setelah Turun Hujan:', grup: 'Fenomena Alam' },
  { no: 49, nama: 'Doa ketika mendengar petir.', grup: 'Fenomena Alam' },
  { no: 50, nama: 'Doa ketika mendengar petir. (2)', grup: 'Fenomena Alam' },
  { no: 51, nama: 'Doa ketika ada angin kencang', grup: 'Fenomena Alam' },
  { no: 52, nama: 'Doa memakai pakaian', grup: 'Adab Berpakaian' },
  { no: 53, nama: 'Doa ketika beli kendaraan baru', grup: 'Rumah & Kendaraan' },
  { no: 54, nama: 'Doa Naik Kendaraan', grup: 'Rumah & Safar' },
  { no: 55, nama: 'Doa orang mau safar dan berdoa buat yang tinggal', grup: 'Safar & Perjalanan' },
  { no: 56, nama: 'Orang yang ditinggalkan membaca doa sebagaimana yang ada dalam hadis ini:', grup: 'Safar & Perjalanan' },
  { no: 57, nama: 'doa pembuka pintu Rizki', grup: 'Rezeki & Keberkahan' },
  { no: 58, nama: 'Doa Agar dicukupkan dengan yang Halal', grup: 'Rezeki & Keberkahan' },
  { no: 59, nama: 'Do\'a Memohon Kemudahan', grup: 'Kelancaran Urusan' },
  { no: 60, nama: 'Do\'a Agar Terlepas dari Sulitnya Utang', grup: 'Perlindungan dari Utang' },
  { no: 61, nama: 'Do\'a dari sifat Malas', grup: 'Perlindungan dari Malas' },
  { no: 62, nama: 'Doa Perbaikan Akhlak', grup: 'Akhlak & Kepribadian' },
];

export default function GradeScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);
  const studentScrollRef = useRef<ScrollView>(null);
  const navigation = useNavigation<any>();

  // ── Sticky header bersama (StudentStickyHeader, sama dengan Tugas/Jadwal/Materi) ──
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const { scrollY, handleMainScroll } = useStickyScroll();
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  // Mockup View Mode: 'overview' (Screen 1) | 'detail' (Screen 2)
  const [academicViewMode, setAcademicViewMode] = useState<'overview' | 'detail'>('overview');

  const handleBack = () => {
    if (academicViewMode === 'detail') {
      setAcademicViewMode('overview');
      return;
    }
    const currentActiveChildId = selectedChildId || useActiveChildStore.getState().activeChildId || route?.params?.child_id || route?.params?.student_id;
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation, {
      ...route?.params,
      child_id: currentActiveChildId,
      student_id: currentActiveChildId,
    });
    if (handled) return;
    if (currentActiveChildId) {
      navigation?.navigate('Beranda', {
        reopen_child_portal_id: String(currentActiveChildId),
        reopen_timestamp: Date.now(),
      });
      return;
    }
    const navState = navigation?.getState?.();
    const canPop = navState && typeof navState.index === 'number' && navState.index > 0;
    if (canPop && navigation?.canGoBack?.()) {
      try {
        navigation.goBack();
        return;
      } catch {}
    }
    navigation?.navigate('Beranda' as any);
  };

  // States
  const [children, setChildren] = useState<any[]>([]);
  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(
    route?.params?.child_id || route?.params?.student_id || globalActiveChildId
  );

  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);
  const activeChildIndexRef = useRef<number>(0);
  useEffect(() => {
    activeChildIndexRef.current = activeChildIndex;
  }, [activeChildIndex]);
  const initialScrollDoneRef = useRef<boolean>(false);
  const handledParamIdRef = useRef<string | null>(null);
  const lastHandledGlobalChildIdRef = useRef<string | null>(null);
  const lastDirectTapTimeRef = useRef<number>(0);
  const isUserDraggingRef = useRef<boolean>(false);
  const isSyncingDataRef = useRef<boolean>(false);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollTimerRef = useRef<any>(null);

  // Real-time tracking titik dot carousel saat gesture drag/swipe berlangsung
  const [visualDotIndex, setVisualDotIndex] = useState<number | null>(null);
  const currentActiveDotIndex = visualDotIndex !== null ? visualDotIndex : activeChildIndex;

  const scrollToActiveChild = useCallback((idx: number, animated = false): void => {
    if (children.length <= 1) return;
    const clamped = Math.max(0, Math.min(children.length - 1, idx));
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, animated ? 650 : 80);
    studentScrollRef.current?.scrollTo({ x: clamped * studentSnapInterval, animated });
  }, [children.length, studentSnapInterval]);

  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (!incomingId) return;
    const incomingStr = String(incomingId);
    if (handledParamIdRef.current === incomingStr) return;
    handledParamIdRef.current = incomingStr;
    lastHandledGlobalChildIdRef.current = incomingStr;

    setSelectedChildId(incomingStr);
    useActiveChildStore.getState().setActiveChildId(incomingStr);
    if (children.length > 0) {
      const idx = children.findIndex((c) => String(c.id || c.student_id) === incomingStr);
      if (idx >= 0 && idx !== activeChildIndexRef.current) {
        activeChildIndexRef.current = idx;
        setActiveChildIndex(idx);
        scrollToActiveChild(idx, true);
      }
    }
  }, [route?.params?.child_id, route?.params?.student_id, children, scrollToActiveChild]);

  // Sinkronisasi selectedChildId & activeChildIndex saat globalActiveChildId berubah dari luar
  useEffect(() => {
    if (!globalActiveChildId || children.length === 0) return;
    const targetStr = String(globalActiveChildId);
    if (targetStr === lastHandledGlobalChildIdRef.current) return;
    lastHandledGlobalChildIdRef.current = targetStr;

    setSelectedChildId((prev) => (prev !== targetStr ? targetStr : prev));
    const idx = children.findIndex((c) => String(c.id || c.student_id) === targetStr);
    if (idx >= 0 && idx !== activeChildIndexRef.current) {
      activeChildIndexRef.current = idx;
      setActiveChildIndex(idx);
      if (!isUserDraggingRef.current && !isProgrammaticScrollRef.current) {
        scrollToActiveChild(idx, true);
      }
    }
  }, [globalActiveChildId, children, scrollToActiveChild]);

  const syncLoopChildId = useCallback((newIdx: number) => {
    if (!children || children.length === 0) return;
    const n = children.length;
    const norm = Math.max(0, Math.min(n - 1, newIdx));
    const targetChild = children[norm];
    if (targetChild) {
      const targetId = String(targetChild.id || targetChild.student_id);
      lastHandledGlobalChildIdRef.current = targetId;
      setSelectedChildId(targetId);
      useActiveChildStore.getState().setActiveChildId(targetId);
    }
  }, [children]);

  const goToLoopChild = useCallback((targetIndex: number, isDirectTap = false) => {
    if (children.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(children.length - 1, targetIndex));
    lastDirectTapTimeRef.current = Date.now();
    activeChildIndexRef.current = clampedIndex;
    setActiveChildIndex(clampedIndex);
    syncLoopChildId(clampedIndex);
    scrollToActiveChild(clampedIndex, true);
  }, [children.length, syncLoopChildId, scrollToActiveChild]);

  // Posisikan scroll ke kartu yang aktif HANYA sekali saat awal load data
  useEffect(() => {
    if (children.length <= 1 || initialScrollDoneRef.current) return;
    initialScrollDoneRef.current = true;
    requestAnimationFrame(() => {
      scrollToActiveChild(activeChildIndexRef.current, false);
    });
  }, [children.length, scrollToActiveChild]);

  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);

  // Tombol Kartu Siswa -> modal KTS; tombol QR -> modal QR khusus
  const openIdCard = (student: any) => {
    setSelectedIdCardStudent(student);
  };
  const openQrCard = (student: any) => {
    setSelectedQrStudent(student);
  };

  // Tombol Jadwal pada sticky header & body card (disamakan dengan halaman Jadwal)
  const openScheduleForStudent = useCallback((student: any) => {
    const sid = student?.id || student?.student_id;
    if (sid) {
      const idStr = String(sid);
      navigation?.navigate('Jadwal', { child_id: idStr, student_id: idStr });
    } else {
      navigation?.navigate('Jadwal');
    }
  }, [navigation]);
  const [payload, setPayload] = useState<GradePayload>(emptyPayload);
  const [activeTab, setActiveTab] = useState<'academic' | 'tahfizh' | 'mutabaah'>('academic');
  const [tahfizh, setTahfizh] = useState<any>(null);
  const [mutabaah, setMutabaah] = useState<any>(null);
  const [mutabaahOverview, setMutabaahOverview] = useState<any>(null);
  const [worshipContext, setWorshipContext] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [backendKpi, setBackendKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Akademik States
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'latest' | 'deadline'>('latest');
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [showAcademicRaportModal, setShowAcademicRaportModal] = useState(false);
  const [showTahfizhRaportModal, setShowTahfizhRaportModal] = useState(false);
  const [showMutabaahRaportModal, setShowMutabaahRaportModal] = useState(false);
  const [showPrayerRaportModal, setShowPrayerRaportModal] = useState(false);
  const [showWeeklyEvaluationModal, setShowWeeklyEvaluationModal] = useState(false);
  const [weeklyReportType, setWeeklyReportType] = useState<'tahfizh' | 'mutabaah' | 'all'>('all');
  const [showReportCard, setShowReportCard] = useState(false);

  // Mockup View States (10 Screen Components)
  const [academicFilter, setAcademicFilter] = useState<'all' | 'high' | 'remedial' | 'pending'>('all');
  const [selectedSemester, setSelectedSemester] = useState<{
    year: string;
    semester: 'Ganjil' | 'Genap';
    months: string;
  }>(() => {
    const yr = getDynamicAcademicYear();
    const sem = getDynamicAcademicSemester();
    return {
      year: yr,
      semester: sem,
      months: getDynamicAcademicMonths(sem, yr),
    };
  });
  const [showSemesterModal, setShowSemesterModal] = useState(false);
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState<any | null>(null);
  const [subjectDetailTab, setSubjectDetailTab] = useState<'penilaian' | 'deskripsi'>('penilaian');
  const [selectedTahfizhDetail, setSelectedTahfizhDetail] = useState<any | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [selectedMutabaahAspect, setSelectedMutabaahAspect] = useState<any | null>(null);
  const [showSemesterReportModal, setShowSemesterReportModal] = useState(false);
  const [semesterReportTab, setSemesterReportTab] = useState<'ringkasan' | 'detail'>('ringkasan');
  const [showPdfReportModal, setShowPdfReportModal] = useState(false);
  const [pdfPage, setPdfPage] = useState(1);

  // Tahfizh Tab States
  const defaultAcademicYear = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }, []);
  const defaultSemester = useMemo(() => {
    const isSem1 = new Date().getMonth() >= 6;
    return isSem1 ? `Semester 1 (${defaultAcademicYear})` : `Semester 2 (${defaultAcademicYear})`;
  }, [defaultAcademicYear]);

  const [tahfizhFilter, setTahfizhFilter] = useState<'all' | 'hafalan_baru' | 'setoran' | 'murojaah' | 'dinilai'>('all');
  const [tahfizhSearch, setTahfizhSearch] = useState('');
  const [tahfizhSort, setTahfizhSort] = useState<'latest' | 'deadline'>('latest');
  const [showTahfizhVerified, setShowTahfizhVerified] = useState(false);
  const [tahfizhSemester, setTahfizhSemester] = useState<string>(defaultSemester);
  const [tahfizhLogs, setTahfizhLogs] = useState<any[]>([]);
  const [selectedTahfizhItem, setSelectedTahfizhItem] = useState<any | null>(null);

  // Mutabaah Tab States (Pembeda Jelas: Sholat Wajib/Sunnah vs Doa & Dzikir)
  const [mutabaahSubTab, setMutabaahSubTab] = useState<'all' | 'sholat_ibadah' | 'doa_dzikir'>('all');
  const [mutabaahFilter, setMutabaahFilter] = useState<'all' | 'belum_selesai' | 'selesai' | 'dalam_proses'>('all');
  const [mutabaahPeriod, setMutabaahPeriod] = useState('Minggu Ini');
  const [mutabaahWeekOffset, setMutabaahWeekOffset] = useState(0);
  const mutabaahDateRange = useMemo(() => getDynamicCurrentWeekRange(mutabaahWeekOffset), [mutabaahWeekOffset]);
  const [showMutabaahDetails, setShowMutabaahDetails] = useState(false);
  const [showCharacterIndicators, setShowCharacterIndicators] = useState(false);
  const [selectedMutabaahItem, setSelectedMutabaahItem] = useState<any | null>(null);

  // Poin Penilaian Doa States
  const [prayerSheet, setPrayerSheet] = useState<any>(null);
  const [selectedPrayerItem, setSelectedPrayerItem] = useState<any | null>(null);
  const [prayerSearch, setPrayerSearch] = useState('');
  const [prayerStatusFilter, setPrayerStatusFilter] = useState<'all' | 'selesai' | 'belum'>('all');
  const [prayerDayOffset, setPrayerDayOffset] = useState(0);
  const prayerModalDate = useMemo(() => getDynamicTodayString(prayerDayOffset), [prayerDayOffset]);

  // 1. Fetch children if parent
  const loadChildren = useCallback(async () => {
    if (!isParent) return;
    const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
    isSyncingDataRef.current = true;
    try {
      const response = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<any[]>(response) || [];
      const safeList = Array.isArray(list) ? list : [];
      setChildren(safeList);
      useActiveChildStore.getState().setChildren(safeList);
      const resolvedId = targetChildId || useActiveChildStore.getState().activeChildId || (safeList[0]?.id || safeList[0]?.student_id ? String(safeList[0].id || safeList[0].student_id) : undefined);
      if (resolvedId) {
        setSelectedChildId((prev) => prev || String(resolvedId));
        useActiveChildStore.getState().setActiveChildId(String(resolvedId));
        const foundIdx = safeList.findIndex((c: any) => String(c.id || c.student_id) === String(resolvedId));
        const safeIdx = foundIdx >= 0 ? foundIdx : 0;
        setActiveChildIndex(safeIdx);
        requestAnimationFrame(() => {
          scrollToActiveChild(safeIdx, false);
          setTimeout(() => { isSyncingDataRef.current = false; }, 250);
        });
      } else {
        setTimeout(() => { isSyncingDataRef.current = false; }, 250);
      }
    } catch {
      isSyncingDataRef.current = false;
    }
  }, [isParent, route?.params?.child_id, route?.params?.student_id, scrollToActiveChild]);

  // 2. Fetch grades, tahfizh, mutabaah, assignments, and prayer assessment
  const loadGrades = useCallback(async () => {
    if (isParent && !selectedChildId) return;
    setError('');

    // Baca cache dulu
    const extraKey = `${selectedChildId || ''}_${selectedSemester?.year || ''}_${selectedSemester?.semester || ''}`;
    const cacheKey = offlineCache.buildKey('grades_v7', user?.id, extraKey);
    const cached = await offlineCache.get<{
      payload: GradePayload;
      tahfizh: any;
      tahfizhLogs?: any[];
      mutabaah: any;
      mutabaahOverview: any;
      worshipContext: any;
      assignments: any[];
      backendKpi: any;
      prayerSheet: any;
    }>(cacheKey);

    if (cached) {
      setPayload(cached.payload || emptyPayload);
      setTahfizh(cached.tahfizh || null);
      setTahfizhLogs(Array.isArray(cached.tahfizhLogs) ? cached.tahfizhLogs : []);
      setMutabaah(cached.mutabaah || null);
      setMutabaahOverview(cached.mutabaahOverview || null);
      setWorshipContext(cached.worshipContext || null);
      setAssignments(Array.isArray(cached.assignments) ? cached.assignments : []);
      setBackendKpi(cached.backendKpi || null);
      setPrayerSheet(cached.prayerSheet || null);
    } else {
      // Reset state untuk siswa baru agar data siswa lama tidak tertahan (stale state)
      setPayload(emptyPayload);
      setTahfizh(null);
      setTahfizhLogs([]);
      setMutabaah(null);
      setMutabaahOverview(null);
      setWorshipContext(null);
      setAssignments([]);
      setBackendKpi(null);
      setPrayerSheet(null);
    }

    try {
      const [
        response,
        tahfizhResponse,
        tahfizhLogsResponse,
        mutabaahResponse,
        assignmentsResponse,
        mutabaahOverviewRes,
        worshipContextRes,
        prayerAssessmentRes,
      ] = await Promise.all([
        mobileApiService
          .getPortalGrades(selectedChildId, {
            semester: selectedSemester?.semester,
            academic_year: selectedSemester?.year,
          })
          .catch(() => null),
        selectedChildId ? mobileApiService.getPortalTahfizhAchievement(selectedChildId).catch(() => null) : Promise.resolve(null),
        selectedChildId ? mobileApiService.getPortalTahfizh({ child_id: selectedChildId, student_id: selectedChildId, per_page: 50 }).catch(() => null) : Promise.resolve(null),
        mobileApiService.getPortalMutabaah(selectedChildId).catch(() => null),
        mobileApiService.getPortalAssignments({ child_id: selectedChildId, per_page: 50 }).catch(() => null),
        selectedChildId ? mobileApiService.getParentMutabaahOverview(selectedChildId).catch(() => null) : Promise.resolve(null),
        selectedChildId ? mobileApiService.getParentWorshipInputContext(selectedChildId).catch(() => null) : Promise.resolve(null),
        selectedChildId ? mobileApiService.getParentPrayerAssessment(selectedChildId).catch(() => null) : Promise.resolve(null),
      ]);

      const data = unwrapApiData<GradePayload>(response);
      const freshPayload = {
        ...emptyPayload,
        ...(data || {}),
        items: Array.isArray(data?.items) ? data.items : [],
        summary: { ...emptyPayload.summary, ...(data?.summary || {}) },
      };
      setPayload(freshPayload);

      const freshTahfizh = unwrapApiData<any>(tahfizhResponse);
      const freshTahfizhLogs = unwrapApiData<any>(tahfizhLogsResponse);
      const logsList = Array.isArray(freshTahfizhLogs?.data)
        ? freshTahfizhLogs.data
        : (Array.isArray(freshTahfizhLogs) ? freshTahfizhLogs : []);
      const mutabaahPayload = unwrapApiData<any>(mutabaahResponse);
      const freshMutabaah = mutabaahPayload?.today ?? null;
      const freshOverview = unwrapApiData<any>(mutabaahOverviewRes);
      const freshWorship = unwrapApiData<any>(worshipContextRes);

      setTahfizh(freshTahfizh);
      setTahfizhLogs(logsList);
      setMutabaah(freshMutabaah);
      if (freshOverview) setMutabaahOverview(freshOverview);
      if (freshWorship) setWorshipContext(freshWorship);

      // Handle assignments response
      let taskList: any[] = [];
      let kpiData: any = null;
      if (assignmentsResponse) {
        if (assignmentsResponse.data?.data && Array.isArray(assignmentsResponse.data.data)) {
          taskList = assignmentsResponse.data.data;
          kpiData = assignmentsResponse.kpi || assignmentsResponse.data?.kpi;
        } else if (Array.isArray(assignmentsResponse.data)) {
          taskList = assignmentsResponse.data;
          kpiData = assignmentsResponse.kpi;
        } else if (Array.isArray(assignmentsResponse)) {
          taskList = assignmentsResponse;
        }
      }
      setAssignments(taskList);
      setBackendKpi(kpiData);

      // Handle prayer assessment response
      let freshPrayerSheet = cached?.prayerSheet || null;
      if (prayerAssessmentRes?.success || prayerAssessmentRes?.items) {
        freshPrayerSheet = prayerAssessmentRes;
        setPrayerSheet(prayerAssessmentRes);
      }

      // Simpan ke offline cache
      void offlineCache.set(cacheKey, {
        payload: freshPayload,
        tahfizh: freshTahfizh,
        mutabaah: freshMutabaah,
        mutabaahOverview: freshOverview,
        worshipContext: freshWorship,
        assignments: taskList,
        backendKpi: kpiData,
        prayerSheet: freshPrayerSheet,
      });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Data nilai belum berhasil dimuat.');
    }
  }, [isParent, selectedChildId, user?.id, selectedSemester?.year, selectedSemester?.semester]);

  useEffect(() => {
    loadChildren().catch(() => setChildren([]));
  }, [loadChildren]);

  useEffect(() => {
    setLoading(true);
    loadGrades().finally(() => setLoading(false));
  }, [loadGrades]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      void offlineCache.clearPrefix('grades_');
      await Promise.all([loadChildren(), loadGrades()]);
    } finally {
      setRefreshing(false);
    }
  };

  // Active Child & Permission (Parent can submit ONLY if child's unit is SD)
  const activeChild = useMemo(() => {
    return (
      children.find((c) => String(c.id || c.student_id) === String(selectedChildId)) ||
      children[0] ||
      null
    );
  }, [children, selectedChildId]);

  // Siswa aktif untuk sticky header & hero (anak terpilih -> data nilai -> profil -> user).
  // Turunan tampilan dihitung di dalam StudentStickyHeader (tanpa fallback hardcode).
  const headerStudent = useMemo(() => {
    return activeChild || payload?.student || (user as any)?.student || user || null;
  }, [activeChild, payload, user]);

  const activeStudentName =
    headerStudent?.full_name ||
    headerStudent?.name ||
    headerStudent?.nama_lengkap ||
    '';

  const [showChildSelectorModal, setShowChildSelectorModal] = useState(false);

  const currentChild = headerStudent || activeChild;
  const studentFullName = currentChild?.full_name || currentChild?.nama_lengkap || currentChild?.name || 'Ananda';
  const studentUnit = currentChild?.unit_name || currentChild?.education_unit?.name || currentChild?.unit_pendidikan?.nama || '';
  const studentClass = currentChild?.class_name || currentChild?.classroom?.name || currentChild?.kelas?.nama || '';
  const studentPhotoUrl = getProfileImageUrl(currentChild);
  const isGirl = isGirlStudent(currentChild);
  const defaultAvatar = isGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;
  const studentAvatarSource = studentPhotoUrl ? { uri: studentPhotoUrl } : defaultAvatar;

  // Resolusi Dinamis Status Kehadiran Siswa Hari Ini — Single Source of Truth selaras dengan HomeScreen
  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(headerStudent || activeChild);
  }, [headerStudent, activeChild]);

  // Nama depan + fallback tahun ajaran untuk subtitle hero statis
  const heroFirstName = useMemo(
    () => resolveStudentDisplay(headerStudent, user).firstName,
    [headerStudent, user]
  );
  const heroSubtitleFallback = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `Tahun Ajaran ${y}/${y + 1}` : `Tahun Ajaran ${y - 1}/${y}`;
  }, []);

  const isChildSD = useMemo(() => {
    if (!activeChild) return false;
    const unit = (
      activeChild.education_unit?.name ||
      activeChild.unit_pendidikan?.nama ||
      activeChild.kelas?.unit_pendidikan?.nama ||
      activeChild.unit_name ||
      ''
    ).toLowerCase();
    const jenjang = (
      activeChild.kelas?.jenjang ||
      activeChild.education_unit?.level ||
      activeChild.jenjang ||
      ''
    ).toLowerCase();

    return (
      jenjang.includes('sd') ||
      jenjang.includes('mi') ||
      unit.includes('sd') ||
      unit.includes('mi') ||
      unit.includes('sekolah dasar')
    );
  }, [activeChild]);

  // Akademik Assignments KPI
  const kpi = useMemo(() => {
    if (backendKpi && typeof backendKpi === 'object') {
      return {
        tugas_aktif: backendKpi.tugas_aktif ?? assignments.length,
        belum_dikumpulkan: backendKpi.belum_dikumpulkan ?? 0,
        terlambat: backendKpi.terlambat ?? 0,
        sudah_dinilai: backendKpi.sudah_dinilai ?? 0,
      };
    }

    let activeCount = assignments.length;
    let pendingCount = 0;
    let lateCount = 0;
    let gradedCount = 0;

    assignments.forEach((item) => {
      const st = getAssignmentStatus(item);
      if (st.key === 'graded') gradedCount++;
      else if (st.key === 'late') lateCount++;
      else if (st.key === 'pending') pendingCount++;
    });

    return {
      tugas_aktif: activeCount,
      belum_dikumpulkan: pendingCount,
      terlambat: lateCount,
      sudah_dinilai: gradedCount,
    };
  }, [assignments, backendKpi]);

  // Filtered & Sorted Assignments for Academic
  const filteredAssignments = useMemo(() => {
    let list = [...assignments];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((item) => {
        const title = (item.judul_tugas || item.judul || '').toLowerCase();
        const subject = (item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || '').toLowerCase();
        const teacher = (item.teacher?.name || item.guru?.nama_lengkap || item.teacher_name || '').toLowerCase();
        return title.includes(q) || subject.includes(q) || teacher.includes(q);
      });
    }

    list.sort((a, b) => {
      if (sortOrder === 'deadline') {
        const dateA = a.deadline ? new Date(a.deadline).getTime() : 0;
        const dateB = b.deadline ? new Date(b.deadline).getTime() : 0;
        return dateA - dateB;
      }
      const dateA = a.created_at ? new Date(a.created_at).getTime() : (a.id || 0);
      const dateB = b.created_at ? new Date(b.created_at).getTime() : (b.id || 0);
      return Number(dateB) - Number(dateA);
    });

    return list;
  }, [assignments, search, sortOrder]);

  // Deteksi Tipe Program Siswa: Boarding (Asrama 24 Jam) vs Fullday School (Jam Sekolah)
  const isBoarding = useMemo(() => {
    const prog = String(
      worshipContext?.program ||
      worshipContext?.data?.program ||
      activeChild?.program ||
      activeChild?.program_type ||
      ''
    ).toLowerCase();
    if (prog === 'boarding' || prog === 'pesantren' || prog === 'asrama') return true;
    if (prog === 'fullday' || prog === 'regular') return false;

    const unitLower = String(
      activeChild?.education_unit?.name ||
      activeChild?.unit_pendidikan?.nama ||
      activeChild?.unit_name ||
      activeChild?.kelas?.nama_kelas ||
      ''
    ).toLowerCase();

    return (
      unitLower.includes('boarding') ||
      unitLower.includes('pesantren') ||
      unitLower.includes('asrama') ||
      unitLower.includes('mahad') ||
      unitLower.includes('pondok')
    );
  }, [worshipContext, activeChild]);

  const evaluatorRole = isBoarding ? 'Musyrif Asrama' : 'Wali Kelas / Guru';
  const evaluatorName = isBoarding
    ? (typeof activeChild?.musyrif === 'string' ? activeChild.musyrif : activeChild?.musyrif?.name || activeChild?.musyrif_name || mutabaahOverview?.supervisor_name || 'Pembina Asrama')
    : (typeof activeChild?.wali_kelas === 'string' ? activeChild.wali_kelas : activeChild?.wali_kelas?.nama || activeChild?.wali_kelas?.name || activeChild?.homeroom_teacher || activeChild?.teacher_name || 'Wali Kelas');
  const programLabel = isBoarding ? 'Boarding School (24 Jam Asrama)' : 'Fullday School (Jam Sekolah)';

  // Dynamic Tahfizh Tasks from Real Logs
  const dynamicTahfizhTasks = useMemo(() => {
    if (!Array.isArray(tahfizhLogs) || tahfizhLogs.length === 0) return [];
    return tahfizhLogs.map((log: any, idx: number) => {
      const typeKey = String(log.category || log.type || 'hafalan_baru').toLowerCase();
      let type: 'hafalan_baru' | 'murojaah' | 'setoran' | 'dinilai' = 'hafalan_baru';
      let typeLabel = 'Hafalan Baru';
      let icon = 'book-open-page-variant-outline';
      let iconBg = '#EFF6FF';
      let iconColor = '#2563EB';
      let badgeBg = '#E6FBF2';
      let badgeText = '#059669';

      if (typeKey.includes('murojaah') || typeKey.includes('murajaah')) {
        type = 'murojaah';
        typeLabel = 'Murojaah';
        icon = 'sync';
        iconBg = '#E6FBF2';
        iconColor = '#10B981';
        badgeBg = '#F3E8FF';
        badgeText = '#7C3AED';
      } else if (typeKey.includes('setor') || typeKey.includes('ziyadah')) {
        type = 'setoran';
        typeLabel = 'Setoran';
        icon = 'tray-arrow-up';
        iconBg = '#EFF6FF';
        iconColor = '#2563EB';
        badgeBg = '#EFF6FF';
        badgeText = '#2563EB';
      } else if (log.nilai_tajwid || log.grade || log.score) {
        type = 'dinilai';
        typeLabel = 'Dinilai';
        icon = 'star-outline';
        iconBg = '#FEF3C7';
        iconColor = '#D97706';
        badgeBg = '#FEF3C7';
        badgeText = '#D97706';
      }

      const surahName = log.surah || log.nama_surah || log.hafalan_surah_name || 'Setoran Tahfizh';
      const range = log.ayat_start ? ` (${log.ayat_start}–${log.ayat_end || log.ayat_start})` : '';
      const deadline = log.record_date || log.date || log.created_at || '';
      const deadlineDate = deadline ? new Date(deadline) : null;
      const deadlineFormatted = deadlineDate && !isNaN(deadlineDate.getTime())
        ? deadlineDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
        : '-';

      const isValidated = log.status === 'validated' || log.status === 'disetujui' || log.status === 'approved';

      return {
        id: String(log.id || `th-${idx}`),
        type,
        typeLabel,
        title: `${surahName}${range}`,
        instruction: log.catatan || log.notes_teacher || log.notes_parent || 'Setoran hafalan Al-Qur\'an santri.',
        deadline: deadline || '',
        deadlineFormatted,
        teacher: log.teacher?.full_name || log.teacher?.name || log.teacher_name || evaluatorName,
        status: isValidated ? 'submitted' : (log.status === 'late' ? 'late' : 'in_progress'),
        icon,
        iconBg,
        iconColor,
        badgeBg,
        badgeText,
        juz: log.juz_number ? `Juz ${log.juz_number}` : (log.juz || '-'),
      };
    });
  }, [tahfizhLogs, evaluatorName]);

  // Tahfizh Filtered List
  const filteredTahfizhTasks = useMemo(() => {
    let list = [...dynamicTahfizhTasks];
    if (tahfizhFilter !== 'all') {
      list = list.filter((t) => t.type === tahfizhFilter);
    }
    const q = tahfizhSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.instruction.toLowerCase().includes(q) ||
        t.teacher.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (tahfizhSort === 'deadline') {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      return b.id.localeCompare(a.id);
    });
    return list;
  }, [dynamicTahfizhTasks, tahfizhFilter, tahfizhSearch, tahfizhSort]);

  // Mutabaah Filtered List Dinamis (Real API + Adaptif Fullday / Boarding)
  const filteredMutabaahList = useMemo(() => {
    // 1. Cek apakah ada data aktivitas real hari ini dari API
    const details = mutabaahOverview?.today?.details || mutabaah?.details || [];
    let list: any[] = [];

    if (Array.isArray(details) && details.length > 0) {
      list = details.map((d: any, idx: number) => {
        const isGood = d.status_value === 'good' || d.verification_status === 'verified';
        const isLess = d.status_value === 'less' || d.status_value === 'in_progress';
        const status = isGood ? 'selesai' : isLess ? 'dalam_proses' : 'belum_selesai';
        const isSchool = d.location === 'school' || d.input_location === 'school';

        return {
          id: d.id || `mt-${idx}`,
          category: isBoarding 
            ? (d.category || 'Amalan Asrama 24 Jam')
            : (isSchool ? 'Ibadah di Sekolah (Verifikasi Guru)' : 'Ibadah di Rumah (Laporan Orang Tua)'),
          categoryKey: isSchool ? 'sekolah' : 'rumah',
          title: d.name || d.agenda_item?.name || 'Ibadah Harian',
          description: d.notes || (isSchool ? 'Dipantau langsung oleh Guru di sekolah.' : 'Dipantau oleh Orang Tua di rumah.'),
          status,
          statusLabel: isGood ? 'Terlaksana (Baik)' : isLess ? 'Dalam Proses' : 'Belum Terlaksana',
          progress: d.progress || (isGood ? 'Tercapai' : isLess ? 'Dalam Proses' : '-'),
          poin: d.poin ?? d.points ?? d.point ?? null,
          icon: isSchool ? 'school-outline' : 'home-outline',
          iconBg: isGood ? '#E6FBF2' : isLess ? '#FEF3C7' : '#FFE4E6',
          iconColor: isGood ? '#10B981' : isLess ? '#D97706' : '#E11D48',
          tips: isBoarding ? 'Dinilai oleh Musyrif Asrama.' : (isSchool ? 'Dinilai oleh Guru di Sekolah.' : 'Laporan Ibadah Mandiri di Rumah.'),
          evaluator: isBoarding ? 'Musyrif Asrama' : (isSchool ? 'Guru / Wali Kelas' : 'Orang Tua'),
        };
      });
    } else {
      // 2. Daftar agenda standar sesuai program jika belum ada input hari ini
      if (isBoarding) {
        list = [
          {
            id: 'b-1',
            category: 'Ibadah Wajib Berjamaah (Masjid Asrama)',
            categoryKey: 'asrama',
            title: 'Shalat Subuh Berjamaah di Masjid',
            description: 'Shalat Subuh berjamaah tepat waktu di Masjid Asrama.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'mosque',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Dinilai langsung oleh Musyrif Asrama melalui Roll Call Shubuh.',
            evaluator: 'Musyrif Asrama',
          },
          {
            id: 'b-2',
            category: 'Ibadah Wajib Berjamaah (Masjid Asrama)',
            categoryKey: 'asrama',
            title: 'Shalat Dzuhur & Ashar Berjamaah',
            description: 'Shalat berjamaah terjadwal di masjid pesantren.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'mosque',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Presensi ibadah oleh Musyrif / Pembina.',
            evaluator: 'Musyrif Asrama',
          },
          {
            id: 'b-3',
            category: 'Ibadah Wajib Berjamaah (Masjid Asrama)',
            categoryKey: 'asrama',
            title: 'Shalat Maghrib & Isya Berjamaah',
            description: 'Shalat Maghrib, kultum santri, dan Isya berjamaah.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'mosque',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Pengawasan keasramaan 24 jam.',
            evaluator: 'Musyrif Asrama',
          },
          {
            id: 'b-4',
            category: 'Kedisiplinan & Amalan Asrama',
            categoryKey: 'asrama',
            title: 'Qiyamul Lail & Kebersihan Kamar',
            description: 'Bangun tahajud bersama dan merapikan ranjang asrama.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'weather-night',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Pemeriksaan kamar berkala oleh Musyrif Asrama.',
            evaluator: 'Musyrif Asrama',
          },
        ];
      } else {
        // Fullday School
        list = [
          {
            id: 'fd-1',
            category: 'Ibadah di Sekolah (Verifikasi Guru)',
            categoryKey: 'sekolah',
            title: 'Shalat Dhuha di Sekolah',
            description: 'Pembiasaan shalat sunnah dhuha sebelum jam pelajaran dimulai.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'weather-sunny',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Dinilai oleh Wali Kelas / Guru PAI di musholla sekolah.',
            evaluator: 'Guru / Wali Kelas',
          },
          {
            id: 'fd-2',
            category: 'Ibadah di Sekolah (Verifikasi Guru)',
            categoryKey: 'sekolah',
            title: 'Shalat Dzuhur & Ashar Berjamaah',
            description: 'Shalat fardhu berjamaah selama siswa berada di lingkungan sekolah.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'mosque',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Verifikasi presensi ibadah sekolah oleh Guru.',
            evaluator: 'Guru / Wali Kelas',
          },
          {
            id: 'fd-3',
            category: 'Ibadah di Sekolah (Verifikasi Guru)',
            categoryKey: 'sekolah',
            title: 'Tadarus & Adab Islami di Kelas',
            description: 'Membaca Al-Qur\'an dan menjaga adab santun kepada guru dan teman.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'book-open-variant',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Pemantauan karakter harian di sekolah.',
            evaluator: 'Guru / Wali Kelas',
          },
          {
            id: 'fd-4',
            category: 'Pantauan Ibadah di Rumah (Laporan Orang Tua)',
            categoryKey: 'rumah',
            title: 'Shalat Subuh, Maghrib & Isya di Rumah',
            description: 'Ibadah mandiri ananda di rumah di bawah bimbingan Orang Tua.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'home-heart',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Orang tua dapat memberikan paraf konfirmasi di menu Portal Orang Tua.',
            evaluator: 'Orang Tua',
          },
        ];
      }
    }

    if (mutabaahFilter !== 'all') {
      list = list.filter((m) => m.status === mutabaahFilter);
    }
    return list;
  }, [mutabaahOverview, mutabaah, isBoarding, mutabaahFilter]);

  // Dynamic KPI Stats untuk Sholat Wajib & Sunnah (Bebas Hardcode)
  const sholatKpiStats = useMemo(() => {
    const details = mutabaahOverview?.today?.details || mutabaah?.details || [];
    const hasApiDetails = Array.isArray(details) && details.length > 0;

    if (hasApiDetails) {
      const wajibItems = details.filter((d: any) => {
        const name = String(d.name || d.agenda_item?.name || '').toLowerCase();
        const cat = String(d.category || '').toLowerCase();
        return (
          cat.includes('wajib') ||
          cat.includes('fardhu') ||
          name.includes('subuh') ||
          name.includes('dzuhur') ||
          name.includes('ashar') ||
          name.includes('maghrib') ||
          name.includes('isya')
        );
      });
      const wajibDone = wajibItems.filter((d: any) => d.status_value === 'good' || d.verification_status === 'verified').length;
      const wajibTotal = wajibItems.length;

      const sunnahItems = details.filter((d: any) => {
        const name = String(d.name || d.agenda_item?.name || '').toLowerCase();
        const cat = String(d.category || '').toLowerCase();
        return (
          cat.includes('sunnah') ||
          name.includes('dhuha') ||
          name.includes('tahajud') ||
          name.includes('rawatib') ||
          name.includes('witir')
        );
      });
      const sunnahDone = sunnahItems.filter((d: any) => d.status_value === 'good' || d.verification_status === 'verified').length;
      const sunnahTotal = sunnahItems.length;

      const adabItems = details.filter((d: any) => {
        const name = String(d.name || d.agenda_item?.name || '').toLowerCase();
        const cat = String(d.category || '').toLowerCase();
        return (
          cat.includes('adab') ||
          cat.includes('akhlak') ||
          cat.includes('kedisiplinan') ||
          name.includes('tadarus') ||
          name.includes('kamar')
        );
      });
      const adabDone = adabItems.filter((d: any) => d.status_value === 'good' || d.verification_status === 'verified').length;
      const adabTotal = adabItems.length;

      const score = mutabaahOverview?.today?.score != null
        ? `${Math.round(Number(mutabaahOverview.today.score))}%`
        : mutabaah?.score != null
        ? `${Math.round(Number(mutabaah.score))}%`
        : (wajibTotal + sunnahTotal > 0 ? `${Math.round(((wajibDone + sunnahDone) / (wajibTotal + sunnahTotal)) * 100)}%` : '0%');

      return {
        wajibDone,
        wajibTotal,
        wajibText: `${wajibDone}/${wajibTotal}`,
        sunnahDone,
        sunnahTotal,
        sunnahText: `${sunnahDone}/${sunnahTotal}`,
        adabDone,
        adabTotal,
        adabText: `${adabDone}/${adabTotal}`,
        consistencyScore: score,
      };
    }

    const score = mutabaahOverview?.today?.score != null
      ? `${Math.round(Number(mutabaahOverview.today.score))}%`
      : mutabaah?.score != null
      ? `${Math.round(Number(mutabaah.score))}%`
      : '0%';

    return {
      wajibDone: 0,
      wajibTotal: 0,
      wajibText: '0/0',
      sunnahDone: 0,
      sunnahTotal: 0,
      sunnahText: '0/0',
      adabDone: 0,
      adabTotal: 0,
      adabText: '0/0',
      consistencyScore: score,
    };
  }, [mutabaahOverview, mutabaah]);

  // KPI Stats untuk Modal Poin Doa & Mutabaah (Bebas Hardcode)
  const prayerKpiStats = useMemo(() => {
    if (prayerSheet?.kpi || prayerSheet?.summary) {
      const k = prayerSheet.kpi || prayerSheet.summary;
      const totalCount = Number(k.total || k.total_count || 0);
      const selesaiCount = Number(k.completed || k.selesai || k.passed || 0);
      const belumCount = Number(k.pending || k.belum || Math.max(0, totalCount - selesaiCount));
      const totalPoin = Number(k.total_score || k.total_poin || (selesaiCount * 5));
      const maxPoin = Number(k.max_score || k.max_poin || (totalCount * 5));
      const percent = totalCount > 0 ? Math.round((selesaiCount / totalCount) * 100) : 0;
      return { totalCount, selesaiCount, belumCount, totalPoin, maxPoin, percent };
    }

    const rawItems =
      prayerSheet?.items && Array.isArray(prayerSheet.items) && prayerSheet.items.length > 0
        ? prayerSheet.items
        : Array.isArray(prayerSheet) && prayerSheet.length > 0
        ? prayerSheet
        : FALLBACK_62_DOA_ITEMS.map(() => ({
            is_passed: false,
            poin: null,
          }));

    const totalCount = rawItems.length;
    const selesaiCount = rawItems.filter((r: any) => {
      const threshold = typeof r.passing_score === 'number' && r.passing_score > 0
        ? r.passing_score
        : (typeof r.kkm === 'number' && r.kkm > 0 ? r.kkm : null);
      if (Boolean(r.is_passed)) return true;
      if (threshold !== null && r.poin !== null && r.poin !== undefined) return Number(r.poin) >= threshold;
      return false;
    }).length;
    const belumCount = Math.max(0, totalCount - selesaiCount);
    const totalPoin = rawItems.reduce((acc: number, r: any) => acc + (Number(r.poin) || 0), 0);
    const maxPoin = totalCount * 5;
    const percent = totalCount > 0 ? Math.round((selesaiCount / totalCount) * 100) : 0;
    return {
      totalCount,
      selesaiCount,
      belumCount,
      totalPoin,
      maxPoin,
      percent,
    };
  }, [prayerSheet]);

  // Tabel Doa (dari prayerSheet API atau Fallback Kurikulum)
  const assessmentPrayerRows = useMemo(() => {
    let rows: any[] = [];
    if (prayerSheet?.items && Array.isArray(prayerSheet.items) && prayerSheet.items.length > 0) {
      rows = prayerSheet.items;
    } else if (Array.isArray(prayerSheet) && prayerSheet.length > 0) {
      rows = prayerSheet;
    } else {
      // Data kurikulum doa jika belum ada riwayat pengujian tersimpan
      rows = FALLBACK_62_DOA_ITEMS.map((item) => ({
        id: `row-${item.no}`,
        no: item.no,
        nama: item.nama,
        grup: item.grup,
        passing_score: (item as any).passing_score ?? null,
        poin: null,
        grade: null,
        is_passed: false,
        paraf_name: null,
        paraf_at: null,
        notes: null,
      }));
    }

    if (prayerSearch.trim()) {
      const q = prayerSearch.toLowerCase().trim();
      rows = rows.filter(
        (r: any) =>
          r.nama?.toLowerCase().includes(q) ||
          r.grup?.toLowerCase().includes(q) ||
          String(r.no).includes(q)
      );
    }

    if (prayerStatusFilter === 'selesai') {
      rows = rows.filter((r: any) => {
        const threshold = typeof r.passing_score === 'number' && r.passing_score > 0
          ? r.passing_score
          : (typeof r.kkm === 'number' && r.kkm > 0 ? r.kkm : null);
        if (Boolean(r.is_passed)) return true;
        if (threshold !== null && r.poin !== null && r.poin !== undefined) return Number(r.poin) >= threshold;
        return false;
      });
    } else if (prayerStatusFilter === 'belum') {
      rows = rows.filter((r: any) => {
        const threshold = typeof r.passing_score === 'number' && r.passing_score > 0
          ? r.passing_score
          : (typeof r.kkm === 'number' && r.kkm > 0 ? r.kkm : null);
        if (Boolean(r.is_passed)) return false;
        if (threshold !== null && r.poin !== null && r.poin !== undefined) return Number(r.poin) < threshold;
        return true;
      });
    }

    return rows;
  }, [prayerSheet, prayerSearch, prayerStatusFilter]);



  const tabs = [
    { key: 'academic', label: 'Akademik', icon: 'book-open-outline' },
    { key: 'tahfizh', label: 'Tahfizh', icon: 'book-open-page-variant-outline' },
    { key: 'mutabaah', label: 'Mutabaah', icon: 'clipboard-check-outline' },
  ] as const;

  const student = activeChild || payload.student || children.find((child) => String(child.id || child.student_id) === String(selectedChildId));
  const studentName = activeChild?.full_name || activeChild?.nama_lengkap || activeChild?.name || student?.name || student?.full_name || 'Siswa';
  const className = activeChild?.kelas?.nama_kelas || activeChild?.kelas?.name || activeChild?.class_name || payload.period?.class_name || student?.class_name;
  const unitName = activeChild?.education_unit?.name || activeChild?.unit_pendidikan?.nama || activeChild?.unit_name || payload.period?.unit_name || student?.unit_name;

  const stats = [
    { label: 'Rata-rata Nilai', sub: 'Rata-rata nilai resmi', value: scoreText(payload.summary.average_score), icon: 'chart-line', color: '#2563EB', bg: '#DBEAFE' },
    { label: 'Nilai Tertinggi', sub: 'Capaian skor tertinggi', value: scoreText(payload.summary.highest_score), icon: 'trophy-outline', color: '#D97706', bg: '#FEF3C7' },
    { label: 'Mapel Tuntas', sub: 'Sesuai KKM mapel', value: String(payload.summary.passed_subjects), icon: 'check-decagram-outline', color: '#059669', bg: '#D1FAE5' },
    { label: 'Perlu Perbaikan', sub: 'Di bawah KKM mapel', value: String(payload.summary.remedial_subjects), icon: 'book-refresh-outline', color: '#E11D48', bg: '#FFE4E6' },
  ];

  // Dynamic Helpers & Calculations for 10 Mockup Screens (Bebas Hardcode)
  const getPredicate = useCallback((score: number): string => {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'E';
  }, []);

  // 1. Dynamic Academic Subjects (Tergantung Siswa Aktif)
  const academicSubjects = useMemo(() => {
    if (Array.isArray(payload.items) && payload.items.length > 0) {
      return payload.items.map((it: any, idx: number) => {
        const name = it.subject?.name || it.subject_name || it.mata_pelajaran || 'Mata Pelajaran';
        const score = Math.round(Number(it.final_score ?? it.score ?? 0));
        const predicate = it.grade_letter || it.predicate || getPredicate(score);
        const harian = it.score_assignment != null ? Math.round(Number(it.score_assignment)) : (it.nilai_tugas != null ? Math.round(Number(it.nilai_tugas)) : null);
        const uts = it.score_mid != null ? Math.round(Number(it.score_mid)) : (it.nilai_uts != null ? Math.round(Number(it.nilai_uts)) : null);
        const uas = it.score_final != null ? Math.round(Number(it.score_final)) : (it.nilai_uas != null ? Math.round(Number(it.nilai_uas)) : null);
        const kkm = it.kkm != null ? Math.round(Number(it.kkm)) : null;
        const theme = getSubjectTheme(name);
        return {
          id: String(it.id || idx),
          name,
          teacher: it.teacher_name || it.teacher?.name || it.guru?.nama_lengkap || '-',
          score,
          predicate,
          kkm,
          score_assignment: harian,
          score_mid: uts,
          score_final: uas,
          theme,
          description: it.notes || it.description || '',
          assignments: Array.isArray(it.assignments) ? it.assignments : (Array.isArray(it.tugas) ? it.tugas : []),
          exams: Array.isArray(it.exams) ? it.exams : (Array.isArray(it.ujian) ? it.ujian : []),
          teacher_note: it.teacher_note || it.catatan_guru || it.notes || it.description || '',
        };
      });
    }

    return [];
  }, [payload.items, getPredicate]);

  const filteredAcademicSubjects = useMemo(() => {
    return academicSubjects;
  }, [academicSubjects]);

  const academicAverage = useMemo<number | null>(() => {
    if (payload.summary?.average_score != null) return Math.round(Number(payload.summary.average_score));
    if (academicSubjects.length === 0) return null;
    const sum = academicSubjects.reduce((acc, curr) => acc + curr.score, 0);
    return Math.round(sum / academicSubjects.length);
  }, [payload.summary, academicSubjects]);

  const academicTotalCount = useMemo(() => {
    return payload.summary?.total_subjects || academicSubjects.length;
  }, [payload.summary, academicSubjects]);

  const academicPredicate = useMemo(() => {
    if (academicAverage == null) return '-';
    return getPredicate(academicAverage);
  }, [academicAverage, getPredicate]);

  // Dynamic Trend Progression (Tugas, PTS, PAS, Akhir) dari data evaluasi belajar riil
  const trendData = useMemo(() => {
    if (academicAverage == null || academicSubjects.length === 0) return [];

    const validAssignments = academicSubjects
      .map((s) => s.score_assignment)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const validMid = academicSubjects
      .map((s) => s.score_mid)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const validFinal = academicSubjects
      .map((s) => s.score_final)
      .filter((v): v is number => typeof v === 'number' && v > 0);

    const avgAssignment =
      validAssignments.length > 0
        ? Math.round(validAssignments.reduce((a, b) => a + b, 0) / validAssignments.length)
        : null;
    const avgMid =
      validMid.length > 0
        ? Math.round(validMid.reduce((a, b) => a + b, 0) / validMid.length)
        : null;
    const avgFinal =
      validFinal.length > 0
        ? Math.round(validFinal.reduce((a, b) => a + b, 0) / validFinal.length)
        : null;

    const items: { semester: string; score: number }[] = [];
    if (avgAssignment != null) items.push({ semester: 'Tugas', score: avgAssignment });
    if (avgMid != null) items.push({ semester: 'PTS', score: avgMid });
    if (avgFinal != null) items.push({ semester: 'PAS', score: avgFinal });
    items.push({ semester: 'Akhir', score: Math.round(academicAverage) });

    return items;
  }, [academicAverage, academicSubjects]);

  // 2. Dynamic Tahfizh List & Stats (Tergantung Siswa Aktif)
  const dynamicTahfizhList = useMemo(() => {
    if (Array.isArray(tahfizhLogs) && tahfizhLogs.length > 0) {
      return tahfizhLogs.map((log: any, idx: number) => {
        const sName = log.surah_name || log.surah || log.nama_surah || `Surah #${idx + 1}`;
        const range = log.ayat_start && log.ayat_end ? ` (${log.ayat_start}-${log.ayat_end})` : '';

        // Ambil nilai numerik HANYA jika data aktual berupa angka
        let sc = 0;
        if (typeof log.score === 'number' && !isNaN(log.score) && log.score > 0) {
          sc = log.score;
        } else if (typeof log.nilai_tajwid === 'number' && !isNaN(log.nilai_tajwid) && log.nilai_tajwid > 0) {
          sc = log.nilai_tajwid;
        } else if (typeof log.nilai === 'number' && !isNaN(log.nilai) && log.nilai > 0) {
          sc = log.nilai;
        } else if (typeof log.nilai === 'string' && !isNaN(Number(log.nilai)) && Number(log.nilai) > 0) {
          sc = Number(log.nilai);
        }

        const dt = log.record_date || log.date || '-';
        const rawKelancaran = log.kelancaran ?? log.metadata?.kelancaran ?? null;
        const rawMakhraj = log.makhraj ?? log.makharijul_huruf ?? log.metadata?.makhraj ?? null;
        const rawTajwid = log.tajwid ?? log.metadata?.tajwid ?? null;
        const rawAdab = log.adab ?? log.metadata?.adab ?? null;

        const pred = log.grade || log.predicate || (typeof log.nilai === 'string' && isNaN(Number(log.nilai)) ? log.nilai : (sc > 0 ? getPredicate(sc) : (rawKelancaran || '-')));

        const isPureNum = (v: any) => v !== null && v !== undefined && (typeof v === 'number' || (/^\d+(\.\d+)?$/.test(String(v).trim())));

        return {
          id: String(log.id || idx),
          surah: `${sName}${range}`,
          date: dt,
          score: sc,
          predicate: pred,
          teacher: log.teacher_name || log.teacher?.name || log.teacher?.full_name || log.signature_teacher || '-',
          note: log.notes_teacher || log.catatan || log.note || '',
          notes_teacher: log.notes_teacher || log.catatan || '',
          notes_parent: log.notes_parent || '',
          audio_url: log.audio_url || log.metadata?.audio_url || null,
          kelancaran: rawKelancaran,
          makhraj: rawMakhraj,
          tajwid: rawTajwid,
          fluency: isPureNum(rawKelancaran) ? Number(rawKelancaran) : (sc > 0 ? sc : null),
          adab: isPureNum(rawAdab) ? Number(rawAdab) : null,
          raw_kelancaran: rawKelancaran,
          raw_makhraj: rawMakhraj,
          raw_tajwid: rawTajwid,
        };
      });
    }

    return [];
  }, [tahfizhLogs, getPredicate]);

  const tahfizhAverage = useMemo<number | null>(() => {
    if (dynamicTahfizhList.length === 0) return null;
    const scoredList = dynamicTahfizhList.filter((item) => typeof item.score === 'number' && item.score > 0);
    if (scoredList.length === 0) return null;
    const sum = scoredList.reduce((acc, curr) => acc + curr.score, 0);
    return Math.round(sum / scoredList.length);
  }, [dynamicTahfizhList]);

  const tahfizhCount = useMemo(() => dynamicTahfizhList.length, [dynamicTahfizhList]);
  const tahfizhPredicate = useMemo(() => (tahfizhAverage != null ? getPredicate(tahfizhAverage) : '-'), [tahfizhAverage, getPredicate]);

  // 3. Canonical Mutabaah Aspects & Stats (Berasal murni dari API)
  const mutabaahAspects = useMemo(() => {
    const rawList =
      (Array.isArray(mutabaahOverview?.aspects) && mutabaahOverview.aspects.length > 0 ? mutabaahOverview.aspects : null) ||
      (Array.isArray(mutabaahOverview?.today?.details) && mutabaahOverview.today.details.length > 0 ? mutabaahOverview.today.details : null) ||
      (Array.isArray(mutabaah?.details) && mutabaah.details.length > 0 ? mutabaah.details : null) ||
      (Array.isArray(mutabaahOverview?.items) && mutabaahOverview.items.length > 0 ? mutabaahOverview.items : null) ||
      [];

    if (!Array.isArray(rawList) || rawList.length === 0) {
      return [];
    }

    const supervisor =
      (typeof activeChild?.musyrif === 'string'
        ? activeChild.musyrif
        : activeChild?.musyrif?.name ||
          activeChild?.musyrif_name ||
          (typeof activeChild?.wali_kelas === 'string' ? activeChild.wali_kelas : activeChild?.wali_kelas?.nama || activeChild?.wali_kelas?.name) ||
          mutabaahOverview?.supervisor_name) || '-';

    return rawList.map((item: any, idx: number) => {
      const score = item.score != null
        ? Number(item.score)
        : item.poin != null
        ? Number(item.poin)
        : (item.status_value === 'good' || item.verification_status === 'verified' ? 100 : item.status_value === 'less' ? 75 : 0);

      const predicate = item.predicate || item.grade || getPredicate(score);
      const aspectName = item.aspect || item.name || item.agenda_item?.name || item.title || `Aspek #${idx + 1}`;
      const note = item.notes || item.catatan || '-';
      const monthlyScores = Array.isArray(item.monthlyScores)
        ? item.monthlyScores
        : Array.isArray(item.history)
        ? item.history
        : [];

      return {
        key: item.key || item.id || `aspect-${idx}`,
        aspect: aspectName,
        score,
        predicate,
        icon: item.icon || 'checkbox-marked-circle-outline',
        monthlyScores,
        teacher: supervisor,
        date: item.date || item.record_date || '-',
        notes: note,
      };
    });
  }, [activeChild, mutabaahOverview, mutabaah, getPredicate]);

  const mutabaahAverage = useMemo<number | null>(() => {
    if (mutabaahOverview?.today?.score != null) {
      return Math.round(Number(mutabaahOverview.today.score));
    }
    if (mutabaahAspects.length === 0) return null;
    const sum = mutabaahAspects.reduce((acc, curr) => acc + curr.score, 0);
    return Math.round(sum / mutabaahAspects.length);
  }, [mutabaahOverview, mutabaahAspects]);

  const mutabaahPredicate = useMemo(() => {
    if (mutabaahAverage == null) return '-';
    return getPredicate(mutabaahAverage);
  }, [mutabaahAverage, getPredicate]);

  const isTeacher = isTeacherRole(user?.roles || []);
  const isDivisi = isDivisiRole(user?.roles || []);
  const isStaff = isTuRole(user?.roles || []) || isPrincipalRole(user?.roles || []) || isDivisi || isSuperAdminRole(user?.roles || []);

  if (isStaff) {
    return (
      <StaffLmsGradeWorkspace
        onBack={() => {
          const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation, route?.params);
          if (handled) return;
          const navState = navigation?.getState?.();
          const canPop = navState && typeof navState.index === 'number' && navState.index > 0;
          if (canPop && navigation?.canGoBack?.()) {
            try {
              navigation.goBack();
              return;
            } catch {}
          }
          navigation?.navigate('Beranda' as any);
        }}
      />
    );
  }

  if (isTeacher) {
    return (
      <TeacherGradeWorkspace
        navigation={navigation}
        onBack={() => {
          const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation, route?.params);
          if (handled) return;
          const navState = navigation?.getState?.();
          const canPop = navState && typeof navState.index === 'number' && navState.index > 0;
          if (canPop && navigation?.canGoBack?.()) {
            try {
              navigation.goBack();
              return;
            } catch {}
          }
          navigation?.navigate('Beranda' as any);
        }}
      />
    );
  }

  return (
    <View style={styles.rootContainer}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK HALAMAN UTAMA, JERNIH & CRISP) ── */}
      <View style={[styles.topFoliageWrapper, { height: 380 }]} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
          locations={[0.5, 0.82, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK HALAMAN UTAMA (TOMBOL KARTU PUTIH MINT GREEN SHADOW) ── */}
      <View style={[styles.cleanTopHeader, { paddingTop: topInset + 6 }]}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={handleBack}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color="#004D32" />
        </TouchableOpacity>

        <Text numberOfLines={1} style={styles.cleanHeaderTitle}>
          Nilai Hasil Belajar
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setShowSemesterModal(true)}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Pilih Semester"
        >
          <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#004D32" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.cleanMainScrollContent, { paddingBottom: Math.max(bottomInset + 72, 94) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />}
      >
        <View style={styles.cleanScrollInner}>
          {/* 1. STUDENT PROFILE SECTION (TERBUKA, INDAH, DENGAN TOMBOL GANTI SISWA AKTIF) */}
          <View style={styles.studentProfileRow}>
            {/* Circular Avatar dengan mint ring */}
            <TouchableOpacity
              activeOpacity={children && children.length > 1 ? 0.75 : 1}
              onPress={children && children.length > 1 ? () => setShowChildSelectorModal(true) : undefined}
              style={styles.studentAvatarRing}
            >
              <Image
                source={studentAvatarSource}
                style={styles.studentAvatarImg}
                resizeMode="cover"
              />
            </TouchableOpacity>

            {/* Profile Info */}
            <View style={styles.studentProfileInfoCol}>
              <TouchableOpacity
                activeOpacity={children && children.length > 1 ? 0.75 : 1}
                onPress={children && children.length > 1 ? () => setShowChildSelectorModal(true) : undefined}
                style={styles.studentNameRow}
              >
                <Text numberOfLines={1} style={styles.studentProfileName}>
                  {studentFullName}
                </Text>
              </TouchableOpacity>

              {/* Baris 2: Unit Pendidikan */}
              {studentUnit ? (
                <View style={styles.studentMetaRow}>
                  <MaterialCommunityIcons name="school-outline" size={12} color="#047857" style={{ marginRight: 4 }} />
                  <Text numberOfLines={1} style={styles.studentProfileUnitText}>
                    {studentUnit}
                  </Text>
                </View>
              ) : null}

              {/* Baris 3: Kelas Siswa tepat di bawah Unit Pendidikan */}
              {studentClass ? (
                <View style={styles.studentMetaRow}>
                  <MaterialCommunityIcons name="door-open" size={12} color="#065F46" style={{ marginRight: 4 }} />
                  <Text numberOfLines={1} style={styles.studentProfileClassText}>
                    {studentClass}
                  </Text>
                </View>
              ) : null}

              {/* Baris Aksi: Tombol Ganti Siswa + Lencana Status Kehadiran di Sebelahnya */}
              <View style={styles.studentActionBadgeRow}>
                {children && children.length > 1 && (
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
                    styles.attendanceStatusBadge,
                    { backgroundColor: attendanceStatus.bg, borderColor: attendanceStatus.border },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={attendanceStatus.icon}
                    size={12}
                    color={attendanceStatus.color}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.attendanceStatusText, { color: attendanceStatus.color }]}>
                    {attendanceStatus.label}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Badan Halaman Konten */}
          <View style={styles.bodyContentWrapper}>

            {/* 2. RINGKASAN HASIL BELAJAR (4 KARTU KPI INTERAKTIF - Identik MaterialScreen) */}
            <View style={styles.emeraldSummaryContainer}>
              <LinearGradient
                colors={['#ECFDF5', '#F0FDF4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryHeaderContainerBanner}
              >
                <View style={styles.summaryTitleRow}>
                  <LinearGradient
                    colors={['#059669', '#047857']}
                    style={styles.sectionIconBadgeModern}
                  >
                    <MaterialCommunityIcons name="school-outline" size={18} color="#FFFFFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitleBold}>Ringkasan Hasil Belajar</Text>
                    <Text style={styles.summarySubtitleText}>
                      {activeStudentName
                        ? `Capaian kompetensi Ananda ${activeStudentName}`
                        : 'Rangkuman nilai & capaian kompetensi santri'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowSemesterModal(true)}
                    style={styles.summaryCountPill}
                  >
                    <Text style={styles.summaryCountPillText}>
                      {selectedSemester ? `${selectedSemester.semester} ${selectedSemester.year}` : 'Ganjil 2026/2027'} ▾
                    </Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>

              {/* 4 KPI Cards (2 Baris x 2 Kolom) */}
              <View style={styles.kpiContainer}>
                <View style={styles.kpiRow}>
                  {/* CARD 1: RATA-RATA NILAI (EMERALD) */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setActiveTab('academic');
                      setAcademicFilter('all');
                    }}
                    style={[
                      styles.kpiCard,
                      styles.kpiCardEmerald,
                      academicFilter === 'all' && styles.kpiCardActiveRing,
                    ]}
                  >
                    <View style={styles.kpiTop}>
                      <Text style={[styles.kpiLabel, { color: '#047857' }]}>Rata-Rata</Text>
                      <MaterialCommunityIcons name="chart-line" size={16} color="#059669" />
                    </View>
                    <Text style={[styles.kpiValue, { color: '#065F46' }]}>
                      {academicAverage != null ? academicAverage : (scoreText(payload.summary?.average_score) || '-')}
                    </Text>
                    <Text style={[styles.kpiSub, { color: '#047857' }]}>
                      Predikat: {academicPredicate}
                    </Text>
                  </TouchableOpacity>

                  {/* CARD 2: NILAI TERTINGGI (AMBER) */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setActiveTab('academic');
                      setAcademicFilter('high');
                    }}
                    style={[
                      styles.kpiCard,
                      styles.kpiCardAmber,
                      academicFilter === 'high' && styles.kpiCardActiveRing,
                    ]}
                  >
                    <View style={styles.kpiTop}>
                      <Text style={[styles.kpiLabel, { color: '#D97706' }]}>Tertinggi</Text>
                      <MaterialCommunityIcons name="trophy-outline" size={16} color="#D97706" />
                    </View>
                    <Text style={[styles.kpiValue, { color: '#92400E' }]}>
                      {payload.summary?.highest_score != null
                        ? scoreText(payload.summary.highest_score)
                        : (academicSubjects.length > 0 ? Math.max(...academicSubjects.map(s => s.score)) : '-')}
                    </Text>
                    <Text style={[styles.kpiSub, { color: '#B45309' }]}>Skor Maksimal</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.kpiRow}>
                  {/* CARD 3: MAPEL TUNTAS (SKY) */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setActiveTab('academic');
                      setAcademicFilter('high');
                    }}
                    style={[
                      styles.kpiCard,
                      styles.kpiCardSky,
                    ]}
                  >
                    <View style={styles.kpiTop}>
                      <Text style={[styles.kpiLabel, { color: '#0284C7' }]}>Tuntas</Text>
                      <MaterialCommunityIcons name="check-decagram-outline" size={16} color="#0284C7" />
                    </View>
                    <Text style={[styles.kpiValue, { color: '#0369A1' }]}>
                      {payload.summary?.passed_subjects != null
                        ? payload.summary.passed_subjects
                        : academicSubjects.filter(s => s.score >= (s.kkm || 75)).length} Mapel
                    </Text>
                    <Text style={[styles.kpiSub, { color: '#0284C7' }]}>Di Atas KKM</Text>
                  </TouchableOpacity>

                  {/* CARD 4: PERLU REMEDIAL (ROSE) */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setActiveTab('academic');
                      setAcademicFilter('remedial');
                    }}
                    style={[
                      styles.kpiCard,
                      styles.kpiCardRose,
                      academicFilter === 'remedial' && styles.kpiCardActiveRing,
                    ]}
                  >
                    <View style={styles.kpiTop}>
                      <Text style={[styles.kpiLabel, { color: '#E11D48' }]}>Remedial</Text>
                      <MaterialCommunityIcons name="book-refresh-outline" size={16} color="#E11D48" />
                    </View>
                    <Text style={[styles.kpiValue, { color: '#9F1239' }]}>
                      {payload.summary?.remedial_subjects != null
                        ? payload.summary.remedial_subjects
                        : academicSubjects.filter(s => s.score < (s.kkm || 75)).length} Mapel
                    </Text>
                    <Text style={[styles.kpiSub, { color: '#BE123C' }]}>Perlu Bimbingan</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* 3. SUB-TAB SWITCHER ([ 📖 Akademik ] [ 📖 Tahfizh ] [ 📋 Mutabaah ]) */}
            <View style={styles.pillTabsContainer}>
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    activeOpacity={0.85}
                    onPress={() => setActiveTab(tab.key)}
                    style={[styles.pillTabBtn, isActive && styles.pillTabBtnActive]}
                  >
                    <View style={[styles.tabIconSquircle, isActive && styles.tabIconSquircleActive]}>
                      <MaterialCommunityIcons
                        name={tab.icon as any}
                        size={15}
                        color={isActive ? '#FFFFFF' : '#059669'}
                      />
                    </View>
                    <Text style={[styles.pillTabText, isActive && styles.pillTabTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 4. EMERALD DATATABLE OUTER CONTAINER */}
            <View style={styles.materialDatatableContainer}>
              {/* Header Card Banner */}
              <LinearGradient
                colors={['#ECFDF5', '#F0FDF4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.materialDatatableHeader}
              >
                <View style={styles.sectionHeaderBetweenModern}>
                  <View style={styles.sectionHeaderLeftModern}>
                    <LinearGradient
                      colors={['#059669', '#047857']}
                      style={styles.sectionIconBadgeModern}
                    >
                      <MaterialCommunityIcons
                        name={(activeTab === 'academic' ? 'notebook-outline' : activeTab === 'tahfizh' ? 'book-open-page-variant' : 'format-list-checks') as any}
                        size={18}
                        color="#FFFFFF"
                      />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.emeraldDatatableTitle}>
                        {activeTab === 'academic'
                          ? 'Rincian Nilai Akademik'
                          : activeTab === 'tahfizh'
                          ? 'Capaian Hafalan & Tahfizh'
                          : 'Mutabaah Yaumiyyah'}
                      </Text>
                      <Text numberOfLines={1} style={styles.emeraldDatatableSubtitle}>
                        {activeTab === 'academic'
                          ? `${filteredAcademicSubjects.length} mata pelajaran terdaftar`
                          : activeTab === 'tahfizh'
                          ? `${dynamicTahfizhList.length} riwayat setoran hafalan`
                          : `${mutabaahAspects.length} aspek pembiasaan santri`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.materialHeaderRightActions}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        if (activeTab === 'academic') {
                          setShowSemesterReportModal(true);
                        } else if (activeTab === 'tahfizh') {
                          setWeeklyReportType('tahfizh');
                          setShowWeeklyEvaluationModal(true);
                        } else {
                          setWeeklyReportType('mutabaah');
                          setShowWeeklyEvaluationModal(true);
                        }
                      }}
                      style={styles.actionRaporBtn}
                    >
                      <MaterialCommunityIcons name="file-document-outline" size={14} color="#047857" style={{ marginRight: 3 }} />
                      <Text style={styles.actionRaporBtnText}>
                        {activeTab === 'academic' ? 'Rapor' : 'Evaluasi'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </LinearGradient>

              {/* Inner Datatable Content */}
              <View style={styles.datatableInnerPadding}>
                {/* ==================== TAB 1: AKADEMIK ==================== */}
                {activeTab === 'academic' && (
                  <GradeAkademikTab
                    searchQuery={search}
                    setSearchQuery={setSearch}
                    academicFilter={academicFilter}
                    setAcademicFilter={setAcademicFilter}
                    subjects={filteredAcademicSubjects}
                    trendData={trendData}
                    studentName={studentName}
                    onSelectSubject={(subject) => setSelectedSubjectDetail(subject)}
                  />
                )}

                {/* ==================== TAB 2: TAHFIZH ==================== */}
                {activeTab === 'tahfizh' && (
                  <GradeTahfizhTab
                    tahfizhList={dynamicTahfizhList}
                    tahfizhAchievement={tahfizh}
                    averageScore={tahfizhAverage ?? undefined}
                    predicate={tahfizhPredicate}
                    studentName={studentName}
                    className={className}
                    academicYear={selectedSemester?.year || defaultAcademicYear}
                    semester={selectedSemester?.semester || (tahfizhSemester?.includes('2') ? 'Genap' : 'Ganjil')}
                    kkm={typeof tahfizh?.kkm === 'number' && tahfizh.kkm > 0 ? tahfizh.kkm : undefined}
                    evaluationNote={tahfizh?.notes || tahfizh?.catatan_ustadz}
                    tasmiStatus={tahfizh?.tasmi_status || tahfizh?.exam_status}
                    targetDescription={tahfizh?.target_description || (tahfizh?.target_juz ? `Juz ${tahfizh.target_juz}` : undefined)}
                    onSelectTahfizh={(item) => setSelectedTahfizhDetail(item)}
                    onOpenWeeklyReport={() => {
                      setWeeklyReportType('tahfizh');
                      setShowWeeklyEvaluationModal(true);
                    }}
                    onNavigateToTahfizh={() => {
                      const sid = activeChild?.id || activeChild?.student_id || selectedChildId;
                      if (sid) {
                        navigation?.navigate('Tahfizh', { child_id: String(sid), student_id: String(sid) });
                      } else {
                        navigation?.navigate('Tahfizh');
                      }
                    }}
                  />
                )}

                {/* ==================== TAB 3: MUTABAAH ==================== */}
                {activeTab === 'mutabaah' && (
                  <GradeMutabaahTab
                    aspects={mutabaahAspects}
                    onSelectAspect={(aspect) => setSelectedMutabaahAspect(aspect)}
                    onOpenWeeklyReport={() => {
                      setWeeklyReportType('mutabaah');
                      setShowWeeklyEvaluationModal(true);
                    }}
                  />
                )}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

        {/* MODAL KARTU SISWA / QR / MENU / LAPORAN (dibuka dari header & card bodi) */}
        <StudentIdCardModal
          visible={Boolean(selectedIdCardStudent)}
          student={selectedIdCardStudent}
          onClose={() => setSelectedIdCardStudent(null)}
        />
        <StudentQrModal
          visible={Boolean(selectedQrStudent)}
          student={selectedQrStudent}
          onClose={() => setSelectedQrStudent(null)}
        />
        <StudentMenuModal
          visible={Boolean(selectedMenuStudent)}
          student={selectedMenuStudent}
          onClose={() => setSelectedMenuStudent(null)}
          navigation={navigation}
        />
        <StudentWeeklyReportModal
          visible={Boolean(selectedWeeklyStudent)}
          student={selectedWeeklyStudent}
          onClose={() => setSelectedWeeklyStudent(null)}
        />

        {/* ==================== 10 MOCKUP MODALS ==================== */}
        {/* Mockup 3: Detail Nilai Mapel */}
        <SubjectDetailModal
          visible={!!selectedSubjectDetail}
          subject={selectedSubjectDetail}
          onClose={() => setSelectedSubjectDetail(null)}
        />

        {/* Mockup 5: Detail Tahfizh with Audio Player */}
        <TahfizhDetailModal
          visible={!!selectedTahfizhDetail}
          item={selectedTahfizhDetail}
          onClose={() => setSelectedTahfizhDetail(null)}
        />

        {/* Mockup 7: Detail Mutabaah with Monthly Bar Chart */}
        <MutabaahDetailModal
          visible={!!selectedMutabaahAspect}
          aspect={selectedMutabaahAspect}
          onClose={() => setSelectedMutabaahAspect(null)}
        />

        {/* Mockup 8: Rapor Semester */}
        <SemesterReportModal
          visible={showSemesterReportModal}
          student={student}
          average={academicAverage ?? 0}
          predicate={academicPredicate}
          onOpenPdf={() => setShowPdfReportModal(true)}
          onClose={() => setShowSemesterReportModal(false)}
        />

        {/* Mockup 9: Tampilan Rapor PDF */}
        <PdfReportModal
          visible={showPdfReportModal}
          student={student}
          subjects={filteredAcademicSubjects}
          academicYear={selectedSemester?.year || defaultAcademicYear}
          semester={selectedSemester?.semester || (tahfizhSemester?.includes('2') ? 'Genap' : 'Ganjil')}
          reportId={student?.active_report_id || student?.rapor_id || student?.id}
          onClose={() => setShowPdfReportModal(false)}
        />

        {/* Mockup 10: Pilih Semester */}
        <SemesterPickerModal
          visible={showSemesterModal}
          selectedSemester={selectedSemester}
          onSelect={(sem) => {
            const isGenap = String(sem).includes('Genap');
            const yearMatch = String(sem).match(/\d{4}\/\d{4}/);
            const defaultYear = getDynamicAcademicYear();
            const yearStr = yearMatch ? yearMatch[0] : defaultYear;
            const semType: 'Ganjil' | 'Genap' = isGenap ? 'Genap' : 'Ganjil';
            setSelectedSemester({
              year: yearStr,
              semester: semType,
              months: getDynamicAcademicMonths(semType, yearStr),
            });
          }}
          onClose={() => setShowSemesterModal(false)}
        />

        {/* Weekly Evaluation Printable Paper Modal (Tahfizh & Mutabaah) */}
        <WeeklyEvaluationReportPaperModal
          visible={showWeeklyEvaluationModal}
          student={student}
          activeReportType={weeklyReportType}
          periodText={payload.period?.title || mutabaahDateRange}
          morningAttendance={(payload as any)?.morning_attendance || []}
          prayerAttendance={
            Array.isArray(prayerSheet?.records) && prayerSheet.records.length > 0
              ? prayerSheet.records.map((r: any) => ({
                  dayDate: r.day_date || r.date || '-',
                  zuhur: r.zuhur || '-',
                  ashar: r.ashar || '-',
                }))
              : []
          }
          tahfizhData={{
            lastSurah: dynamicTahfizhList?.[0]
              ? `${(dynamicTahfizhList[0] as any).surah || '-'}`
              : (tahfizh?.current_surah ? `${tahfizh.current_surah}` : '-'),
            lastDepositDate: dynamicTahfizhList?.[0]?.date || (tahfizh?.last_deposit_date || '-'),
            totalLines: tahfizh?.total_lines ?? (dynamicTahfizhList?.[0] as any)?.lines ?? (dynamicTahfizhList.length > 0 ? dynamicTahfizhList.length * 15 : '-'),
            targetLines: tahfizh?.target_lines ?? 15,
            status: tahfizh?.status || (dynamicTahfizhList?.[0]?.score && dynamicTahfizhList[0].score >= 80 ? 'Mutqin' : 'Dalam Bimbingan'),
          }}
          academicAttendance={(payload as any)?.academic_attendance || []}
          teacherNotes={
            student?.catatan_guru ||
            student?.teacher_notes ||
            (payload as any)?.summary?.notes ||
            (dynamicTahfizhList?.[0] as any)?.note ||
            ''
          }
          homeroomTeacher={
            student?.wali_kelas ||
            student?.homeroom_teacher ||
            (student as any)?.guru_wali ||
            student?.kelas?.wali_kelas ||
            '-'
          }
          onClose={() => setShowWeeklyEvaluationModal(false)}
        />

        {/* MODAL PEMILIH ANANDA (JIKA ORANG TUA MEMILIKI >1 ANAK) */}
        <Modal
          visible={showChildSelectorModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowChildSelectorModal(false)}
        >
          <View style={styles.childModalBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setShowChildSelectorModal(false)}
            />
            <View style={styles.childModalSheet}>
              <View style={styles.childModalHeader}>
                <Text style={styles.childModalTitle}>Pilih Ananda</Text>
                <TouchableOpacity onPress={() => setShowChildSelectorModal(false)}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 320 }}>
                {children.map((c, idx) => {
                  const cId = String(c.id || c.student_id);
                  const isSelected = cId === String(selectedChildId);
                  const cName = c.name || c.nama_lengkap || c.full_name || 'Ananda';
                  const cUnit = c.unit?.name || c.unit_name || c.education_unit?.name || c.kelas?.unit_pendidikan?.name || '';
                  const cClass = c.class?.name || c.kelas?.nama_kelas || c.kelas?.name || c.class_name || '';
                  const cAvatar = c.photo_url || c.avatar_url;

                  return (
                    <TouchableOpacity
                      key={cId || idx}
                      activeOpacity={0.8}
                      onPress={() => {
                        setShowChildSelectorModal(false);
                        goToLoopChild(idx, true);
                      }}
                      style={[
                        styles.childModalItem,
                        isSelected && styles.childModalItemActive,
                      ]}
                    >
                      <Image
                        source={getStudentAvatarSource(c)}
                        style={styles.childModalAvatar}
                        resizeMode="cover"
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.childModalItemName, isSelected && { color: '#0D6B42', fontWeight: '800' }]}>
                          {cName}
                        </Text>
                        {cUnit || cClass ? (
                          <Text style={styles.childModalItemSub}>
                            {[cUnit, cClass].filter(Boolean).join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                      {isSelected && (
                        <MaterialCommunityIcons name="check-circle" size={20} color="#0D6B42" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: '#ECFDF5' },
  topFoliageWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    ...(StyleSheet.absoluteFill as any),
    opacity: 1,
  },
  cleanTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  cleanHeaderIconBtn: {
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
  cleanHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  cleanMainScrollContent: {
    paddingTop: 4,
  },
  cleanScrollInner: {
    flex: 1,
  },
  studentProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    marginBottom: 6,
  },
  studentAvatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  studentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  studentProfileInfoCol: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  studentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  studentProfileName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
    lineHeight: 24,
    flexShrink: 1,
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  studentProfileUnitText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
    flexShrink: 1,
  },
  studentProfileClassText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
    flexShrink: 1,
  },
  studentActionBadgeRow: {
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
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 4,
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  parentGantiAnakBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  attendanceStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  attendanceStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  childModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  childModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  childModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  childModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  childModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  childModalItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#0D6B42',
  },
  childModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#0D6B42',
  },
  childModalItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  childModalItemSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sheetContainer: { flex: 1, overflow: 'hidden' },
  screen: { flex: 1, backgroundColor: 'transparent' },
  mainScrollContent: {
    flexGrow: 1,
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  staticTopBarWrapper: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.22)',
    paddingBottom: 14,
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
  staticTopBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
    width: '100%',
  },
  heroSquircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    position: 'relative',
  },
  heroTitleCenterCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  heroModuleTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  heroModuleSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: 'Nunito_600SemiBold',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: 1,
  },
  heroBellDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  containerBlock: { marginBottom: 16 },
  studentContainerBlock: { marginBottom: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionHeaderTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 13.5, fontWeight: '900', color: '#0F172A' },
  sectionSubtitle: { fontSize: 10.5, color: '#64748B', marginTop: 2 },

  // Data Ananda Hero Carousel Styles
  studentCardCountBadge: {
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  studentCardCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#084835',
  },
  singleHeroCardContainer: {
    width: '100%',
    alignSelf: 'stretch',
  },
  heroCardScrollContainer: {
    marginHorizontal: -16,
  },
  studentCardsTrack: {
    gap: STUDENT_CARD_GAP,
    paddingBottom: 4,
    zIndex: 1,
  },
  heroCardScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  childCardHeroSize: {
    width: SCREEN_WIDTH - 50,
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#059669',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeSingle: {
    width: '100%',
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#059669',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: 'hidden',
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
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  avatarBorderWrapHero: {
    width: 60,
    height: 60,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  childInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  studentNameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentFullName: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  studentNisText: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.88)',
    fontFamily: 'Nunito_600SemiBold',
    marginTop: 1,
  },
  childNameHero: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  childSubInfoHero: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 1,
    fontFamily: 'Nunito_600SemiBold',
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  studentUnitText: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
    maxWidth: SCREEN_WIDTH - 220,
  },
  selectedActionBtnRight: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6.5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 8,
    minWidth: 48,
  },
  selectedActionBtnRightInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    elevation: 0,
  },
  selectedActionBtnText: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#059669',
    marginTop: 2,
  },
  selectedActionBtnTextInactive: {
    color: '#FFFFFF',
  },
  studentAttributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderRadius: 14,
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
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  paginationDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 16,
    backgroundColor: '#059669',
  },

  // ── Emerald Summary Container (Identik MaterialScreen) ──
  emeraldSummaryContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginTop: 6,
    marginBottom: 16,
  },
  summaryHeaderContainerBanner: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIconBadgeModern: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitleBold: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  summarySubtitleText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '500',
    marginTop: 1,
  },
  summaryCountPill: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  summaryCountPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  kpiContainer: {
    marginBottom: 2,
    gap: 8,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiCardActiveRing: {
    borderWidth: 2,
    borderColor: '#047857',
  },
  kpiCardEmerald: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    shadowColor: '#059669',
  },
  kpiCardAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
  },
  kpiCardSky: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
  },
  kpiCardRose: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    shadowColor: '#E11D48',
  },
  kpiTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  kpiSub: {
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 1,
  },

  // ── Datatable Outer Container (Identik MaterialScreen) ──
  materialDatatableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.09,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    overflow: 'hidden',
    marginBottom: 24,
  },
  materialDatatableHeader: {
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1.2,
    borderBottomColor: '#D1FAE5',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionHeaderBetweenModern: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeaderLeftModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  emeraldDatatableTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  emeraldDatatableSubtitle: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '500',
    marginTop: 1,
  },
  materialHeaderRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionRaporBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  actionRaporBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  datatableInnerPadding: {
    padding: 14,
  },

  // Round Cube Tabs ([ 📖 Akademik ] [ 📖 Tahfizh ] [ 📋 Mutabaah ])
  pillTabsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  pillTabBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    paddingHorizontal: 4,
  },
  pillTabBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2.5 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  tabIconSquircle: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#DEF7EC',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  tabIconSquircleActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  pillTabText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    color: '#334155',
  },
  pillTabTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
  },

  // 4 Horizontal Mini KPI Cards
  kpiMiniRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 14,
  },
  kpiMiniCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    padding: 8,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiMiniTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiMiniIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiMiniNumber: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  kpiMiniLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    lineHeight: 12,
  },

  // Filter Pills Scroll (gaya dari portalBodyStyles)

  // Search & Filter Row
  searchAndFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  filterActionButton: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  filterActionButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: '#334155',
  },

  // Section Header Between (gaya dari portalBodyStyles)
  semesterDropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5.5,
    gap: 4,
  },
  semesterDropdownText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    color: '#334155',
  },

  // Date Range Picker Pill for Mutabaah
  dateRangePickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  dateRangeArrowBtn: {
    padding: 3,
  },
  dateRangeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    paddingHorizontal: 4,
  },

  // Compact Cards General
  compactCardMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  compactSubjectBox: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactCenterCol: {
    flex: 1,
  },
  compactTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 3,
  },
  compactDescText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },

  // Compact Assignment Card (Akademik)
  compactAssignmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  compactBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 4,
  },
  subjectBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 0.8,
  },
  subjectBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  statusBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  compactFarRightAction: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  gradedScoreBoxRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gradedScorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4.5,
  },
  gradedScoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
    marginRight: 3,
  },
  gradedScoreValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#059669',
  },
  submittedPillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4.5,
    gap: 3,
  },
  submittedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
  },
  kumpulkanBtnFarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  kumpulkanBtnTextFarRight: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
    marginRight: 2,
  },
  portalSiswaBadgeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4.5,
    gap: 2,
  },
  portalSiswaTextRight: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#D97706',
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  compactMetaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactMetaDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },
  compactMetaLabel: {
    fontSize: 8.5,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  compactMetaValue: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
  },

  // Tahfizh Card Styles (Image 1)
  compactTahfizhCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tahfizhTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  tahfizhTypeBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  compactFarRightActionTahfizh: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 4,
    minHeight: 48,
  },
  tahfizhStatusRightCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tahfizhCircleIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tahfizhStatusRightText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  tahfizhMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  tahfizhMetaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Mutabaah Card Styles (Image 2)
  compactMutabaahCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  compactMutabaahIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactMutabaahRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  mutabaahPointBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  mutabaahPointText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
    color: '#64748B',
  },
  mutabaahStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
  },
  mutabaahStatusBadgeSelesai: {
    backgroundColor: '#ECFDF5',
  },
  mutabaahStatusBadgeProses: {
    backgroundColor: '#FFFBEB',
  },
  mutabaahStatusBadgeBelum: {
    backgroundColor: '#FEF2F2',
  },
  mutabaahStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
  mutabaahProgressText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
  },

  // Rapor Accordion
  raporAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DDEBE4',
  },

  // Rapor KPI & Subject Cards Legacy
  kpiGridLegacy: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCardLegacy: { width: '48.5%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  kpiIconLegacy: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiValueLegacy: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  kpiLabelLegacy: { fontSize: 11, fontWeight: '800', color: '#334155', marginTop: 3 },
  kpiSubLegacy: { fontSize: 9.5, color: '#94A3B8', marginTop: 2 },
  // Isi kartu nilai (bingkai memakai portalBodyStyles.modernCard)
  gradeCardInner: { padding: 14 },
  gradeTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  subjectCode: { fontSize: 9.5, color: '#64748B', fontWeight: '800' },
  subjectName: { fontSize: 13.5, color: '#0F172A', fontWeight: '900', marginTop: 3 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  statusPassed: { backgroundColor: '#D1FAE5' },
  statusRemedial: { backgroundColor: '#FFE4E6' },
  statusText: { fontSize: 9.5, fontWeight: '900' },
  scoreRow: { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  scoreRight: { marginLeft: 28 },
  scoreLabel: { fontSize: 9, color: '#94A3B8', fontWeight: '800', textTransform: 'uppercase' },
  scoreValue: { fontSize: 24, color: '#18A165', fontWeight: '900', marginTop: 2 },
  gradeLetter: { fontSize: 18, color: '#334155', fontWeight: '900', marginTop: 4 },
  notes: { fontSize: 10.5, color: '#64748B', fontStyle: 'italic', marginTop: 10, lineHeight: 16 },

  // Empty & Loading States (gaya dari portalBodyStyles)
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 28, alignItems: 'center' },
  emptyText: { fontSize: 10.5, color: '#94A3B8', textAlign: 'center', marginTop: 3 },

  // Tahfizh & Mutabaah
  infoCard: { marginTop: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDEBE4', borderRadius: 16, padding: 14 },
  infoCardTitle: { fontSize: 12, color: '#0F172A', fontWeight: '900' },
  infoScore: { fontSize: 28, color: '#138A56', fontWeight: '900', marginTop: 5 },
  infoNote: { fontSize: 10.5, color: '#64748B', lineHeight: 16, marginTop: 4 },

  // ==================== PREMIUM REDESIGNED MODALS ====================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCardPremium: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
  },
  modalDragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleText: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubTitleText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseBtnCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBodyScroll: {
    maxHeight: 460,
  },
  modalBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  modalContentTitle: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 22,
    marginBottom: 10,
  },
  modalDescCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  modalCardHeaderMini: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  modalDescContentText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  modalGradedContainer: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 12,
    marginTop: 10,
  },
  modalGradedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalGradedCheckText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  modalTeacherNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 10,
    padding: 10,
  },
  modalTeacherNoteText: {
    fontSize: 11.5,
    color: '#065F46',
    lineHeight: 16,
    flex: 1,
  },
  modalInputSectionTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  modalStyledTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    fontSize: 12.5,
    color: '#0F172A',
    minHeight: 90,
    marginBottom: 14,
  },
  modalButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  modalSecondaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#64748B',
  },
  modalPrimaryBtn: {
    flex: 2,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  modalPrimaryBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalSingleCloseBtn: {
    width: '100%',
    height: 42,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  modalSingleCloseBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalPermissionAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  modalPermissionAlertText: {
    flex: 1,
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
    fontWeight: '600',
  },
  modalProgressCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 4,
  },
  modalProgressLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
  },
  modalProgressValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#059669',
  },
  modalProgressSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 3,
  },

  // Raport Bayangan Banner Styles
  raportBayanganBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  raportBayanganGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  raportBayanganIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  raportBayanganTextCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  raportBayanganTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  raportBayanganTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  raportBadgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  raportBadgePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  raportBayanganSub: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 14,
  },
  raportActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    gap: 3,
  },
  raportActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Assignment Pending / Unsubmitted Score Badges
  pendingScorePillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pendingScorePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#D97706',
    marginRight: 3,
  },

  // Modal Rubric & Evaluation Box
  modalEvalRubricBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  modalRubricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalRubricCol: {
    flex: 1,
    alignItems: 'center',
  },
  modalRubricLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 3,
  },
  modalRubricValue: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#1E293B',
  },
  modalRubricDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },

  // Raport Bayangan Sheet & Card Styles
  raportDocOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  raportDocCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'android' ? 24 : 32,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  raportDocScroll: {
    marginTop: 8,
    marginBottom: 4,
  },

  // KOP & Identity
  raportKopBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  raportKopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6FBF2',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginBottom: 4,
  },
  raportKopBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  raportKopTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  raportKopSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },

  raportIdentityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 10,
  },
  raportIdentityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  raportIdentityItem: {
    flex: 1,
  },
  raportIdentityLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  raportIdentityValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 1,
  },

  // Raport KPI Grid
  raportKpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  raportKpiBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  raportKpiVal: {
    fontSize: 13.5,
    fontWeight: '900',
  },
  raportKpiLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },

  raportSectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },

  // Tables
  raportTableContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  raportTableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  raportTableHeaderCell: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#475569',
    textTransform: 'uppercase',
  },
  raportTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  raportTableCell: {
    fontSize: 10.5,
    color: '#334155',
  },
  raportTableCellBold: {
    fontSize: 11,
    fontWeight: '900',
  },
  raportTableCellTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  raportTableCellNotes: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },

  raportBadgeBase: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  raportBadgePassed: {
    backgroundColor: '#DCFCE7',
  },
  raportBadgeRemedial: {
    backgroundColor: '#FEE2E2',
  },
  raportBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },

  // Teacher Note Box
  raportTeacherNoteBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  raportTeacherNoteTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  raportTeacherNoteText: {
    fontSize: 10,
    color: '#334155',
    lineHeight: 15,
    fontStyle: 'italic',
  },

  raportSealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 10,
    padding: 8,
    marginBottom: 14,
  },
  raportSealText: {
    fontSize: 9.5,
    color: '#166534',
    fontWeight: '700',
    flex: 1,
  },

  // Tahfizh Rubrik Grid
  raportRubrikGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  raportRubrikCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 8,
  },
  raportRubrikLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
  },
  raportRubrikScore: {
    fontSize: 11,
    fontWeight: '900',
    color: '#059669',
    marginTop: 2,
  },

  // Mutabaah Section Card
  mutabaahSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    overflow: 'hidden',
  },
  mutabaahSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  mutabaahSectionCategoryText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#1E293B',
  },
  mutabaahItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  mutabaahItemLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#334155',
  },
  mutabaahItemStatus: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },
  mutabaahItemScorePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mutabaahItemScoreText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669',
  },

  // Buttons Row
  raportBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 12,
  },
  raportBtnSecondary: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  raportBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  raportBtnPrimary: {
    flex: 1.3,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  raportBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // Penilaian Doa Styles (Tabel Fisik Otentik 62 Doa)
  prayerKpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  prayerInstructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 0.8,
    borderColor: '#BBF7D0',
  },
  prayerInstructionText: {
    flex: 1,
    fontSize: 11,
    color: '#166534',
    lineHeight: 15,
  },
  prayerSearchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  prayerSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    padding: 0,
    fontWeight: '500',
  },
  // TABEL FISIK RESMI DOKUMEN SEKOLAH
  physicalTableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  docHeaderContainer: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
    backgroundColor: '#FAFDFB',
  },
  docMainHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  docSubHeading: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  tableWrapper: {
    width: '100%',
  },
  // Baris Header Hijau Sage (Persis Dokumen Fisik Kertas)
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#B8D8BA', // Sage Green persis dokumen fisik sekolah
    borderTopWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: '#0F172A',
  },
  headerCellNo: {
    width: 38,
    borderRightWidth: 1,
    borderColor: '#0F172A',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCellDoa: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: '#0F172A',
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  headerCellPoint: {
    width: 52,
    borderRightWidth: 1,
    borderColor: '#0F172A',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCellParaf: {
    width: 68,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  // Data Rows
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    minHeight: 34,
  },
  tableDataRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tableDataRowLast: {
    borderBottomWidth: 0,
  },
  cellNo: {
    width: 38,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellNoText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  cellDoa: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  cellDoaText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 15,
  },
  cellPoint: {
    width: 52,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPointText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
  },
  cellPointTextActive: {
    color: '#047857',
  },
  cellParaf: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  cellParafEmpty: {
    fontSize: 11,
    color: '#94A3B8',
  },
  parafBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 0.6,
    borderColor: '#A7F3D0',
    gap: 2,
  },
  parafBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
  },
  // Modal Detail Item Doa
  prayerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  prayerModalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  prayerModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  prayerModalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  prayerModalTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  prayerModalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  prayerModalCloseBtn: {
    padding: 4,
  },
  prayerModalScoreSection: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  prayerModalScoreBox: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  prayerModalScoreVal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#047857',
  },
  prayerModalScoreLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  prayerModalStatusBox: {
    flex: 1.5,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  prayerModalStatusVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  prayerModalNotesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 0.8,
    borderColor: '#BBF7D0',
  },
  prayerModalNotesText: {
    flex: 1,
    fontSize: 11,
    color: '#166534',
    lineHeight: 16,
  },
  prayerModalConfirmBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  prayerModalConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },

  // Modern Mutabaah / Prayer Assessment Styles (Matched to UI Reference)
  prayerSectionHeaderContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 4,
  },
  mutabaahSubTabContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  mutabaahSubTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  mutabaahSubTabItemActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  mutabaahSubTabText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
    color: '#64748B',
  },
  mutabaahSubTabTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  subTabCounterBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    marginLeft: 5,
  },
  subTabCounterBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  subTabCounterText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#64748B',
  },
  subTabCounterTextActive: {
    color: '#059669',
  },
  // Distinct Mutabaah Banners & Badges
  mutabaahDistinctBannerSholat: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.2,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  mutabaahDistinctBannerIconBoxSholat: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  mutabaahDistinctBannerTitleSholat: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#065F46',
  },
  mutabaahCategoryBadgeGreen: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: '#A7F3D0',
  },
  mutabaahCategoryBadgeTextGreen: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  mutabaahDistinctBannerDoa: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1.2,
    borderColor: '#99F6E4',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  mutabaahDistinctBannerIconBoxDoa: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#5EEAD4',
  },
  mutabaahDistinctBannerTitleDoa: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#115E59',
  },
  mutabaahCategoryBadgeTeal: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: '#99F6E4',
  },
  mutabaahCategoryBadgeTextTeal: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
  },
  mutabaahDistinctBannerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  mutabaahSectionDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 10,
  },
  mutabaahDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  mutabaahDividerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mutabaahDividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  prayerModalHeader: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  prayerModalHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prayerModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  prayerHeaderIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  prayerHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  prayerHeaderSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  prayerDatePillContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 8,
  },
  prayerDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  prayerDatePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },

  // 4 KPI Cards Scroll Track
  prayerKpiScroll: {
    marginTop: 10,
    marginBottom: 4,
  },
  prayerKpiScrollContent: {
    paddingVertical: 2,
    gap: 8,
    flexDirection: 'row',
  },
  prayerKpiCard: {
    width: 138,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 2,
  },
  prayerKpiCardGauge: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    width: 145,
  },
  prayerKpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  prayerKpiIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prayerKpiValue: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  prayerKpiTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
  prayerKpiSub: {
    fontSize: 10,
    fontFamily: 'Nunito_600SemiBold',
    marginTop: 1,
  },

  // Circular Gauge
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gaugeRingOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: '#E2E8F0',
    borderTopColor: '#059669',
    borderRightColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeRingInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  gaugeRingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  gaugeTextCol: {
    marginLeft: 8,
    flex: 1,
  },
  gaugeLabelTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  gaugeLabelSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },

  // Toolbar
  prayerToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 8,
  },
  prayerToolbarSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    paddingHorizontal: 8,
    height: 38,
  },
  prayerToolbarSearchInput: {
    flex: 1,
    fontSize: 11.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  prayerToolbarFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    paddingHorizontal: 9,
    height: 38,
    justifyContent: 'center',
  },
  prayerToolbarFilterBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  prayerToolbarFilterText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  prayerToolbarFilterTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  prayerToolbarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    borderRadius: 9,
    paddingHorizontal: 10,
    height: 38,
    justifyContent: 'center',
  },
  prayerToolbarActionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Section Header Row
  prayerSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
  },
  prayerSectionHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  prayerSectionHeaderTotal: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // Modern Table Card
  prayerTableCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  prayerTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  colHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  colNoHeader: {
    width: 28,
    alignItems: 'center',
  },
  colDoaHeader: {
    flex: 1,
    paddingLeft: 6,
  },
  colPoinHeader: {
    width: 36,
    alignItems: 'center',
  },
  colStatusHeader: {
    width: 72,
    alignItems: 'center',
  },
  colParafHeader: {
    width: 38,
    alignItems: 'center',
  },
  colActionHeader: {
    width: 26,
    alignItems: 'center',
  },

  // Table Data Row
  prayerTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  prayerTableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  prayerTableRowLast: {
    borderBottomWidth: 0,
  },
  colNoCell: {
    width: 28,
    alignItems: 'center',
  },
  numberBadgePill: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  numberBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  colDoaCell: {
    flex: 1,
    paddingLeft: 6,
    justifyContent: 'center',
  },
  prayerDoaTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  prayerDoaSubtitle: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  colPoinCell: {
    width: 36,
    alignItems: 'center',
  },
  prayerPoinText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  prayerPoinTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  colStatusCell: {
    width: 72,
    alignItems: 'center',
  },
  statusBadgeDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
  },
  statusTextDone: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#059669',
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
  },
  statusTextPending: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  colParafCell: {
    width: 38,
    alignItems: 'center',
  },
  parafCircleDone: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parafEmptyDash: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '700',
  },
  colActionCell: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prayerTeacherNoteBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  prayerTeacherNoteTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  prayerTeacherNoteText: {
    fontSize: 11,
    color: '#14532D',
    lineHeight: 16,
    fontStyle: 'italic',
  },

  // Student Carousel & Quick Switcher Styles
  studentCarouselHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 4,
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
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentCarouselHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  studentCarouselCountBadge: {
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: 'rgba(5, 150, 105, 0.25)',
  },
  studentCarouselCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#003822',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
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
});
