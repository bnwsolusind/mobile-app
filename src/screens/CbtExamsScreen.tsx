import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
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
import { useAuthStore } from '../stores/authStore';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import {
  getProfileImageUrl,
  getStudentAvatarSource,
  isGirlStudent,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { EmptyStateCard } from '../components/EmptyStateCard';
import TeacherCbtWorkspace from '../components/teacher/TeacherCbtWorkspace';

import { isParentRole, isStudentRole, isTeacherRole, isTuRole, isPrincipalRole, isSuperAdminRole } from '../utils/roles';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;
const STUDENT_CARD_WIDTH = Math.round(SCREEN_WIDTH - (STUDENT_PEEK_WIDTH * 2) - STUDENT_CARD_GAP);
const STUDENT_SNAP_INTERVAL = STUDENT_CARD_WIDTH + STUDENT_CARD_GAP;

type CbtExamItem = {
  id: string;
  judul_ujian: string;
  instruksi?: string;
  waktu_mulai?: string;
  waktu_selesai?: string;
  durasi_menit: number;
  nilai_kkm: number;
  max_attempt: number;
  attempts_used: number;
  attempts_left: number;
  status: string;
  availability: 'available' | 'resume' | 'upcoming' | 'ended' | 'completed';
  mata_pelajaran?: string;
  kelas?: string;
  guru?: string;
  kisi_kisi?: {
    id?: string;
    judul?: string;
    jenis_ujian?: string;
    jumlah_soal?: number;
    alokasi_waktu_menit?: number;
  };
  latest_result?: {
    sesi_id?: string;
    nilai_final?: number | null;
    nilai_tersedia?: boolean;
    jumlah_benar?: number | null;
    jumlah_salah?: number | null;
    jumlah_kosong?: number | null;
    waktu_selesai?: string;
  };
};

const formatDate = (val?: string) => {
  if (!val) return 'Tanpa batas';
  const date = new Date(val);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const childName = (child: any) => child?.full_name || child?.nama_lengkap || child?.name || 'Siswa';
const childClass = (child: any) => child?.kelas?.nama_kelas || child?.kelas?.name || child?.class_name || 'Kelas belum ditentukan';
const childUnit = (child: any) => child?.education_unit?.name || child?.kelas?.unit_pendidikan?.name || child?.unit_name || 'Unit Sekolah';

// Safe wrappers for ScreenCapture to prevent native module crashes in Expo Go or unlinked dev builds
const safePreventScreenCapture = async () => {
  try {
    const ScreenCapture = require('expo-screen-capture');
    if (ScreenCapture && typeof ScreenCapture.preventScreenCaptureAsync === 'function') {
      await ScreenCapture.preventScreenCaptureAsync();
    }
  } catch {
    // Native module not linked in current runtime (e.g. Expo Go)
  }
};

const safeAllowScreenCapture = async () => {
  try {
    const ScreenCapture = require('expo-screen-capture');
    if (ScreenCapture && typeof ScreenCapture.allowScreenCaptureAsync === 'function') {
      await ScreenCapture.allowScreenCaptureAsync();
    }
  } catch {
    // Native module not linked in current runtime
  }
};

const safeAddScreenshotListener = (listener: () => void) => {
  try {
    const ScreenCapture = require('expo-screen-capture');
    if (ScreenCapture && typeof ScreenCapture.addScreenshotListener === 'function') {
      return ScreenCapture.addScreenshotListener(listener);
    }
  } catch {
    // Native module not linked in current runtime
  }
  return null;
};

const getSubjectMeta = (subjectName?: string) => {
  const s = (subjectName || '').toLowerCase();
  if (s.includes('matematika') || s.includes('mtk') || s.includes('hitung') || s.includes('aljabar')) {
    return { icon: 'calculator-variant' as const, color: '#2563EB', bg: '#EFF6FF' };
  }
  if (s.includes('ipa') || s.includes('fisika') || s.includes('biologi') || s.includes('kimia') || s.includes('sains')) {
    return { icon: 'flask-outline' as const, color: '#059669', bg: '#ECFDF5' };
  }
  if (s.includes('qur') || s.includes('tahfizh') || s.includes('hadits') || s.includes('pai') || s.includes('fiqih') || s.includes('akidah') || s.includes('islam') || s.includes('syariah')) {
    return { icon: 'book-open-page-variant' as const, color: '#047857', bg: '#D1FAE5' };
  }
  if (s.includes('arab')) {
    return { icon: 'translate' as const, color: '#D97706', bg: '#FEF3C7' };
  }
  if (s.includes('inggris') || s.includes('english')) {
    return { icon: 'earth' as const, color: '#7C3AED', bg: '#F3E8FF' };
  }
  if (s.includes('indonesia') || s.includes('literasi') || s.includes('bahasa')) {
    return { icon: 'book-outline' as const, color: '#0284C7', bg: '#E0F2FE' };
  }
  if (s.includes('ips') || s.includes('sejarah') || s.includes('geografi') || s.includes('pkn') || s.includes('sosial')) {
    return { icon: 'compass-outline' as const, color: '#EA580C', bg: '#FFEDD5' };
  }
  if (s.includes('olahraga') || s.includes('penjas') || s.includes('pjok')) {
    return { icon: 'soccer' as const, color: '#16A34A', bg: '#DCFCE7' };
  }
  if (s.includes('komputer') || s.includes('tik') || s.includes('informatika')) {
    return { icon: 'laptop' as const, color: '#4F46E5', bg: '#EEF2FF' };
  }
  if (s.includes('seni') || s.includes('budaya') || s.includes('sbk') || s.includes('prakarya')) {
    return { icon: 'palette-outline' as const, color: '#DB2777', bg: '#FCE7F3' };
  }
  return { icon: 'file-document-edit-outline' as const, color: '#047857', bg: '#ECFDF5' };
};

const getExamStatusMeta = (status: 'available' | 'resume' | 'completed' | 'upcoming' | 'ended') => {
  switch (status) {
    case 'completed':
      return {
        label: 'Selesai',
        icon: 'check-circle' as const,
        textColor: '#7C3AED',
        style: { backgroundColor: '#F3E8FF', borderColor: '#DDD6FE' },
      };
    case 'resume':
      return {
        label: 'Lanjutkan',
        icon: 'progress-clock' as const,
        textColor: '#2563EB',
        style: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
      };
    case 'available':
      return {
        label: 'Tersedia',
        icon: 'play-circle' as const,
        textColor: '#047857',
        style: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
      };
    case 'upcoming':
      return {
        label: 'Mendatang',
        icon: 'clock-outline' as const,
        textColor: '#D97706',
        style: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
      };
    case 'ended':
    default:
      return {
        label: 'Ditutup',
        icon: 'lock-outline' as const,
        textColor: '#64748B',
        style: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
      };
  }
};

export default function CbtExamsScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const userRoles = useMemo(() => (roles?.length ? roles : user?.roles || []), [roles, user?.roles]);
  const isParent = isParentRole(userRoles);
  const isStudent = isStudentRole(userRoles);
  const isTeacher = isTeacherRole(userRoles);
  const isStaff = isTuRole(userRoles) || isPrincipalRole(userRoles) || isSuperAdminRole(userRoles);
  const isTeacherOrStaff = isTeacher || isStaff;

  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const studentScrollRef = useRef<ScrollView>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(() => {
    const fromRoute = route?.params?.child_id || route?.params?.student_id;
    if (fromRoute) return String(fromRoute);
    const fromStore = useActiveChildStore.getState().activeChildId;
    return fromStore ? String(fromStore) : undefined;
  });
  const [activeChildIndex, setActiveChildIndex] = useState(0);
  const handledParamIdRef = useRef<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);

  // ── Sticky header bersama (StudentStickyHeader, sama dengan Tugas/Jadwal/Materi/Nilai) ──
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const { scrollY, handleMainScroll } = useStickyScroll();
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  const handleBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation, route?.params);
    if (handled) return;
    const childId = route?.params?.child_id || route?.params?.student_id;
    if (route?.params?.from_child_portal && childId) {
      navigation?.navigate('Beranda');
      return;
    }
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation?.navigate('Beranda');
    }
  };

  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);
  const [showChildSelectorModal, setShowChildSelectorModal] = useState(false);

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
  const [exams, setExams] = useState<CbtExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'semua' | 'available' | 'upcoming' | 'completed' | 'ended'>('semua');
  const [instructionModal, setInstructionModal] = useState<CbtExamItem | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  // CBT Exam Runner States
  const [activeExamSession, setActiveExamSession] = useState<{
    sesi_id: string;
    ujian: {
      id: string;
      judul_ujian: string;
      instruksi?: string;
      durasi_menit: number;
      sisa_waktu_detik: number;
      nilai_kkm?: number;
      tampilkan_nilai_langsung?: boolean;
    };
    soal: Array<{
      id: string;
      kode_soal?: string;
      pertanyaan: string;
      tipe_soal: string;
      poin: number;
      opsi?: Array<{ key: string; text: string }>;
      pasangan_menjodohkan?: {
        kiri?: string[];
        kanan?: string[];
      };
    }>;
  } | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({});
  const [doubtfulQuestions, setDoubtfulQuestions] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showQuestionPalette, setShowQuestionPalette] = useState<boolean>(false);
  const [submittingExam, setSubmittingExam] = useState<boolean>(false);
  const [savingAnswer, setSavingAnswer] = useState<boolean>(false);
  const [examResultModal, setExamResultModal] = useState<{
    sesi_id: string;
    nilai_tersedia: boolean;
    nilai_final: number | null;
    nilai_kkm: number | null;
    jumlah_benar: number | null;
    jumlah_salah: number | null;
    jumlah_kosong: number | null;
  } | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  } | null>(null);

  // 1. Load Children if parent with offline cache (seluruh anak ditampilkan)
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id || route?.params?.student_id || globalActiveChildId;
      const childCacheKey = offlineCache.buildKey('cbt_exams_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          setChildren(cached);
          if (!selectedChildId) {
            const initId = targetChildId
              ? String(targetChildId)
              : String(cached[0]?.id || cached[0]?.student_id);
            setSelectedChildId(initId);
            const foundIdx = cached.findIndex((c: any) => String(c.id || c.student_id) === initId);
            if (foundIdx >= 0) setActiveChildIndex(foundIdx);
          }
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const list = unwrapApiData<any[]>(res) || [];
          if (isMounted && list.length > 0) {
            setChildren(list);
            if (targetChildId) {
              setSelectedChildId(String(targetChildId));
              const foundIdx = list.findIndex((c: any) => String(c.id || c.student_id) === String(targetChildId));
              if (foundIdx >= 0) setActiveChildIndex(foundIdx);
            } else if (!selectedChildId) {
              const fallbackId = globalActiveChildId || String(list[0]?.id || list[0]?.student_id);
              setSelectedChildId(fallbackId);
              const fIdx = list.findIndex((c: any) => String(c.id || c.student_id) === fallbackId);
              setActiveChildIndex(fIdx >= 0 ? fIdx : 0);
            }
            void offlineCache.set(childCacheKey, list);
          }
        })
        .catch(() => { });
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, globalActiveChildId]);

  // Virtual loop window
  const safeCenter = children.length > 0 ? (activeChildIndex % children.length + children.length) % children.length : 0;
  const loopWindow = useMemo(() => {
    if (children.length <= 1) return [];
    const len = children.length;
    const prevIdx = (safeCenter - 1 + len) % len;
    const nextIdx = (safeCenter + 1) % len;
    return [
      { child: children[prevIdx], realIdx: prevIdx, slotKey: `prev-${prevIdx}` },
      { child: children[safeCenter], realIdx: safeCenter, slotKey: `center-${safeCenter}` },
      { child: children[nextIdx], realIdx: nextIdx, slotKey: `next-${nextIdx}` },
    ];
  }, [children, safeCenter]);

  const syncLoopChildId = useCallback((rawIdx: number) => {
    if (children.length === 0) return;
    const realIdx = ((rawIdx % children.length) + children.length) % children.length;
    const child = children[realIdx];
    if (child) {
      const childId = String(child.id || child.student_id);
      setSelectedChildId(childId);
      useActiveChildStore.getState().setActiveChildId(childId);
    }
  }, [children]);

  const recenterLoop = useCallback((e: any) => {
    if (children.length <= 1) return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const scrolledSlot = Math.round(offsetX / STUDENT_SNAP_INTERVAL);

    if (scrolledSlot !== 1) {
      const delta = scrolledSlot - 1;
      const newActive = ((safeCenter + delta) % children.length + children.length) % children.length;
      setActiveChildIndex(newActive);
      syncLoopChildId(newActive);
      requestAnimationFrame(() => {
        studentScrollRef.current?.scrollTo({ x: STUDENT_SNAP_INTERVAL, y: 0, animated: false });
      });
    }
  }, [children.length, safeCenter, syncLoopChildId]);

  const goToLoopChild = useCallback((targetRealIndex: number) => {
    if (children.length <= 1) {
      if (children.length === 1) {
        setActiveChildIndex(0);
        syncLoopChildId(0);
      }
      return;
    }
    const len = children.length;
    const normTarget = ((targetRealIndex % len) + len) % len;
    if (normTarget === safeCenter) return;

    let delta = normTarget - safeCenter;
    if (delta > len / 2) delta -= len;
    if (delta < -len / 2) delta += len;

    const targetSlot = delta > 0 ? 2 : 0;
    studentScrollRef.current?.scrollTo({
      x: targetSlot * STUDENT_SNAP_INTERVAL,
      y: 0,
      animated: true,
    });
    setTimeout(() => {
      setActiveChildIndex(normTarget);
      syncLoopChildId(normTarget);
      requestAnimationFrame(() => {
        studentScrollRef.current?.scrollTo({ x: STUDENT_SNAP_INTERVAL, y: 0, animated: false });
      });
    }, 280);
  }, [children.length, safeCenter, syncLoopChildId]);

  // Route params sync (hanya sekali saat parameter route baru terdeteksi)
  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (incomingId && children.length > 0 && handledParamIdRef.current !== String(incomingId)) {
      handledParamIdRef.current = String(incomingId);
      const foundIdx = children.findIndex((c: any) => String(c.id || c.student_id) === String(incomingId));
      if (foundIdx >= 0) {
        goToLoopChild(foundIdx);
      }
    }
  }, [route?.params?.child_id, route?.params?.student_id, children, goToLoopChild]);

  // 2. Load Real CBT Exams from Backend Database with offline cache
  const loadCbtExams = useCallback(async () => {
    setError('');
    const targetChildId = isParent ? selectedChildId : undefined;
    const cacheKey = offlineCache.buildKey('cbt_exams', user?.id, targetChildId || 'self');

    // Baca cache dulu
    const cached = await offlineCache.get<{ exams: CbtExamItem[]; student: any }>(cacheKey);
    if (cached) {
      if (cached.exams) setExams(cached.exams);
      if (cached.student) setStudentInfo(cached.student);
    }

    try {
      const response = isTeacher
        ? await mobileApiService.getTeacherCbtExams()
        : await mobileApiService.getPortalCbtExams(targetChildId);
      const raw = unwrapApiData<any>(response);
      const records = Array.isArray(raw?.exams)
        ? raw.exams
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw)
            ? raw
            : [];
      setExams(records);

      const resolvedStudent = response?.student || raw?.student || response?.data?.student;
      if (resolvedStudent) {
        setStudentInfo(resolvedStudent);
        void offlineCache.set(cacheKey, { exams: records, student: resolvedStudent });
      } else if (isStudent) {
        const currentUser = useAuthStore.getState().user;
        const currentStudent = currentUser?.student || currentUser;
        setStudentInfo((prev: any) => prev || currentStudent);
        void offlineCache.set(cacheKey, { exams: records, student: currentStudent });
      } else {
        void offlineCache.set(cacheKey, { exams: records, student: cached?.student || null });
      }
    } catch (err) {
      if (!cached) {
        setError(getApiErrorMessage(err, 'Jadwal ujian CBT belum berhasil dimuat.'));
        setExams([]);
      }
    }
  }, [isParent, isStudent, isTeacher, selectedChildId, user?.id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      if (isStudent) {
        try {
          const profRes = await mobileApiService.getPortalProfile();
          const profData = unwrapApiData<any>(profRes) || profRes?.data || profRes;
          if (profData) setStudentInfo(profData);
        } catch {
          const currentUser = useAuthStore.getState().user;
          setStudentInfo((prev: any) => prev || currentUser?.student || currentUser);
        }
      }
      await loadCbtExams();
    } finally {
      setLoading(false);
    }
  }, [isStudent, loadCbtExams]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Siswa aktif untuk sticky header & hero (anak terpilih -> info siswa -> profil -> user)
  const headerStudent = useMemo(() => {
    if (children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[0];
    }
    if (studentInfo) return studentInfo;
    return (user as any)?.student || user || null;
  }, [children, selectedChildId, studentInfo, user]);

  // Nama depan + fallback tahun ajaran untuk subtitle hero statis
  const heroFirstName = useMemo(
    () => resolveStudentDisplay(headerStudent, user).firstName,
    [headerStudent, user]
  );
  const activeStudentName = useMemo(() => {
    return resolveStudentDisplay(headerStudent, user).firstName || headerStudent?.name || 'Siswa';
  }, [headerStudent, user]);

  const heroSubtitleFallback = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `Tahun Ajaran ${y}/${y + 1}` : `Tahun Ajaran ${y - 1}/${y}`;
  }, []);

  const studentAvatarSource = useMemo(() => {
    return getStudentAvatarSource(headerStudent);
  }, [headerStudent]);

  const studentFullName = useMemo(() => {
    return (
      (typeof headerStudent?.name === 'string' && headerStudent.name) ||
      (typeof headerStudent?.nama_lengkap === 'string' && headerStudent.nama_lengkap) ||
      (typeof headerStudent?.full_name === 'string' && headerStudent.full_name) ||
      'Ananda'
    );
  }, [headerStudent]);

  const studentUnit = useMemo(() => {
    return (
      (typeof headerStudent?.unit?.name === 'string' && headerStudent.unit.name) ||
      (typeof headerStudent?.unit_name === 'string' && headerStudent.unit_name) ||
      (typeof headerStudent?.education_unit?.name === 'string' && headerStudent.education_unit.name) ||
      (typeof headerStudent?.education_unit_name === 'string' && headerStudent.education_unit_name) ||
      (typeof headerStudent?.unit === 'string' && headerStudent.unit) ||
      ''
    );
  }, [headerStudent]);

  const studentClass = useMemo(() => {
    return (
      (typeof headerStudent?.kelas?.nama_kelas === 'string' && headerStudent.kelas.nama_kelas) ||
      (typeof headerStudent?.kelas?.name === 'string' && headerStudent.kelas.name) ||
      (typeof headerStudent?.class?.name === 'string' && headerStudent.class.name) ||
      (typeof headerStudent?.class_name === 'string' && headerStudent.class_name) ||
      (typeof headerStudent?.kelas === 'string' && headerStudent.kelas) ||
      ''
    );
  }, [headerStudent]);

  // Resolusi Dinamis Status Kehadiran Siswa Hari Ini (Single Source of Truth)
  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(headerStudent);
  }, [headerStudent]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      void offlineCache.clearPrefix('cbt_exams');
      if (isParent) {
        const res = await mobileApiService.getPortalChildren();
        const list = unwrapApiData<any[]>(res) || [];
        setChildren(list);
      }
      await loadCbtExams();
    } finally {
      setRefreshing(false);
    }
  };

  // Helper determinasi status ujian presisi (Completed, Resume, Available, Upcoming, Ended)
  const getExamStatus = useCallback((exam: CbtExamItem): 'completed' | 'resume' | 'available' | 'upcoming' | 'ended' => {
    // 1. Siswa telah menyelesaikan ujian (punya riwayat nilai/sesi selesai atau status completed)
    if (exam.latest_result || exam.availability === 'completed') {
      return 'completed';
    }
    // 2. Sesi ujian sedang aktif berjalan (siswa dapat melanjutkan)
    if (exam.availability === 'resume') {
      return 'resume';
    }
    // 3. Ujian siap dikerjakan
    if (exam.availability === 'available') {
      return 'available';
    }
    // 4. Ujian belum dimulai
    if (exam.availability === 'upcoming') {
      return 'upcoming';
    }
    // 5. Ujian telah ditutup
    return 'ended';
  }, []);

  // KPIs
  const stats = useMemo(() => {
    const total = exams.length;
    let available = 0;
    let completed = 0;
    let upcoming = 0;
    let ended = 0;

    exams.forEach((exam) => {
      const st = getExamStatus(exam);
      if (st === 'completed') {
        completed += 1;
      } else if (st === 'available' || st === 'resume') {
        available += 1;
      } else if (st === 'upcoming') {
        upcoming += 1;
      } else {
        ended += 1;
      }
    });

    return { total, available, upcoming, completed, ended };
  }, [exams, getExamStatus]);

  // Filtered Exams (Sinkron 100% dengan KPI dan Filter Tab)
  const filteredExams = useMemo(() => {
    return exams.filter((item) => {
      const title = item.judul_ujian || '';
      const subject = item.mata_pelajaran || '';
      const teacher = item.guru || '';
      const matchesSearch =
        !search.trim() ||
        title.toLowerCase().includes(search.trim().toLowerCase()) ||
        subject.toLowerCase().includes(search.trim().toLowerCase()) ||
        teacher.toLowerCase().includes(search.trim().toLowerCase());

      const itemStatus = getExamStatus(item);
      let matchesFilter = true;
      if (selectedFilter === 'available') {
        matchesFilter = itemStatus === 'available' || itemStatus === 'resume';
      } else if (selectedFilter === 'upcoming') {
        matchesFilter = itemStatus === 'upcoming';
      } else if (selectedFilter === 'completed') {
        matchesFilter = itemStatus === 'completed';
      } else if (selectedFilter === 'ended') {
        matchesFilter = itemStatus === 'ended';
      }

      return matchesSearch && matchesFilter;
    });
  }, [exams, search, selectedFilter, getExamStatus]);

  // Real-time countdown timer for active CBT session
  useEffect(() => {
    if (!activeExamSession || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const currentInt = Math.floor(prev);
        if (currentInt <= 1) {
          clearInterval(timer);
          void handleAutoFinishExam();
          return 0;
        }
        return currentInt - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeExamSession?.sesi_id, timeLeft > 0]);

  const formatTimer = (seconds: number) => {
    const totalSecs = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hardware back press protection during active exam session
  useEffect(() => {
    if (!activeExamSession) return;
    const onBackPress = () => {
      handleConfirmFinish();
      return true;
    };
    const backHandlerSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandlerSub.remove();
  }, [activeExamSession, examAnswers, doubtfulQuestions]);

  // Anti-screenshot & Screen Capture Protection during active CBT exam
  useEffect(() => {
    if (!activeExamSession) return;

    let screenshotSub: any = null;

    const activateCaptureProtection = async () => {
      await safePreventScreenCapture();
      screenshotSub = safeAddScreenshotListener(() => {
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Pelanggaran Integritas Ujian',
          message: 'Tangkapan layar (screenshot) dilarang keras selama ujian CBT berlangsung demi menjaga kerahasiaan lembar soal.',
        });
      });
    };

    void activateCaptureProtection();

    return () => {
      if (screenshotSub && typeof screenshotSub.remove === 'function') {
        screenshotSub.remove();
      }
      void safeAllowScreenCapture();
    };
  }, [Boolean(activeExamSession)]);

  // Immersive full-screen status bar during active CBT exam
  useEffect(() => {
    if (activeExamSession) {
      StatusBar.setHidden(true, 'fade');
    } else {
      StatusBar.setHidden(false, 'fade');
    }
    return () => {
      StatusBar.setHidden(false, 'fade');
    };
  }, [Boolean(activeExamSession)]);

  const saveAnswerToServer = async (questionId: string, value: string) => {
    if (!activeExamSession) return;
    try {
      setSavingAnswer(true);
      const qItem = activeExamSession.soal.find((q) => q.id === questionId);
      const isEssay = qItem?.tipe_soal && ['esai', 'isian', 'menjodohkan'].includes(qItem.tipe_soal);
      await mobileApiService.savePortalCbtAnswers(activeExamSession.sesi_id, [
        {
          soal_id: questionId,
          jawaban_dipilih: isEssay ? null : value,
          jawaban_esai: isEssay ? value : null,
        },
      ]);
    } catch (e) {
      console.warn('Gagal menyimpan jawaban otomatis:', e);
    } finally {
      setSavingAnswer(false);
    }
  };

  const handleSelectOption = (questionId: string, optionKey: string, debounce: boolean = false) => {
    if (!activeExamSession) return;
    const updated = { ...examAnswers, [questionId]: optionKey };
    setExamAnswers(updated);

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (debounce) {
      autoSaveTimerRef.current = setTimeout(() => {
        void saveAnswerToServer(questionId, optionKey);
      }, 850);
    } else {
      void saveAnswerToServer(questionId, optionKey);
    }
  };

  const handleToggleDoubtful = (questionId: string) => {
    setDoubtfulQuestions((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const handleStartExam = async (exam: CbtExamItem) => {
    const targetChildId = isParent ? selectedChildId : undefined;
    setInstructionModal(null);
    setStartingId(exam.id);
    try {
      const startRes = await mobileApiService.startPortalCbtExam(exam.id, targetChildId);
      const sessionData = unwrapApiData<any>(startRes) || startRes?.data || startRes;

      if (!sessionData || !sessionData.sesi_id) {
        throw new Error('Sesi ujian tidak berhasil dibuat atau data soal belum lengkap.');
      }

      // Populate pre-saved answers if any (support both essay/isian/matching and multiple choice)
      const answersMap: Record<string, string> = {};
      if (Array.isArray(sessionData.jawaban_tersimpan)) {
        sessionData.jawaban_tersimpan.forEach((item: any) => {
          if (item.soal_id) {
            const restoredVal = item.jawaban_esai ?? item.jawaban_dipilih ?? '';
            if (restoredVal !== '') {
              answersMap[item.soal_id] = restoredVal;
            }
          }
        });
      }

      setExamAnswers(answersMap);
      setDoubtfulQuestions({});
      const rawSecs =
        sessionData.ujian?.sisa_waktu_detik != null
          ? Number(sessionData.ujian.sisa_waktu_detik)
          : Number(sessionData.ujian?.durasi_menit ?? 60) * 60;
      const remainingSeconds = Math.max(0, Math.floor(rawSecs));
      setCurrentQuestionIndex(0);
      setTimeLeft(remainingSeconds);
      setActiveExamSession(sessionData);
    } catch (startErr) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Ujian Belum Dapat Dimulai',
        message: getApiErrorMessage(startErr, 'Gagal memulai sesi ujian CBT.'),
      });
    } finally {
      setStartingId(null);
    }
  };

  const handleConfirmFinish = () => {
    if (!activeExamSession) return;
    const totalQuestions = activeExamSession.soal.length;
    const answeredCount = activeExamSession.soal.filter((q) => Boolean(examAnswers[q.id])).length;
    const unansweredCount = Math.max(0, totalQuestions - answeredCount);
    const doubtfulCount = Object.values(doubtfulQuestions).filter(Boolean).length;

    setFeedbackModal({
      visible: true,
      type: 'confirm',
      title: 'Kumpulkan Lembar Jawaban?',
      message: `Ringkasan pengerjaan ujian:\n\n• Soal Dijawab: ${answeredCount} dari ${totalQuestions} soal\n${doubtfulCount > 0 ? `• Ditandai Ragu-ragu: ${doubtfulCount} soal\n` : ''}${unansweredCount > 0 ? `• Belum Terjawab: ${unansweredCount} soal\n` : '• Semua soal telah dijawab lengkap\n'}\nApakah Anda yakin ingin menyelesaikan dan mengumpulkan ujian sekarang?`,
      confirmText: 'Ya, Kumpulkan',
      cancelText: 'Periksa Kembali',
      onConfirm: () => {
        setFeedbackModal(null);
        void submitExam();
      },
    });
  };

  const handleAutoFinishExam = async () => {
    setFeedbackModal({
      visible: true,
      type: 'warning',
      title: 'Waktu Ujian Habis',
      message: 'Waktu pengerjaan telah berakhir. Sistem mengumpulkan lembar jawaban Anda.',
    });
    await submitExam();
  };

  const submitExam = async () => {
    if (!activeExamSession) return;
    setSubmittingExam(true);
    try {
      const answersPayload = Object.entries(examAnswers).map(([soal_id, val]) => {
        const qItem = activeExamSession.soal.find((q) => q.id === soal_id);
        const isEssay = qItem?.tipe_soal && ['esai', 'isian', 'menjodohkan'].includes(qItem.tipe_soal);
        return {
          soal_id,
          jawaban_dipilih: isEssay ? null : val,
          jawaban_esai: isEssay ? val : null,
        };
      });

      const res = await mobileApiService.finishPortalCbtExam(activeExamSession.sesi_id, answersPayload);
      const resData = unwrapApiData<any>(res) || res?.data || res;

      setActiveExamSession(null);
      setExamAnswers({});
      setDoubtfulQuestions({});
      setExamResultModal(resData || { nilai_tersedia: false });
      await loadCbtExams();
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Mengumpulkan Ujian',
        message: getApiErrorMessage(err, 'Terjadi kendala saat mengumpulkan ujian. Silakan coba kembali.'),
      });
    } finally {
      setSubmittingExam(false);
    }
  };

  // Jika akun adalah Guru atau Staf/TU (dan bukan Orang Tua/Siswa), tampilkan TeacherCbtWorkspace
  if (isTeacherOrStaff) {
    return <TeacherCbtWorkspace navigation={navigation} route={route} />;
  }

  return (
    <View style={styles.rootContainer}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK HALAMAN BANK SOAL, JERNIH & CRISP) ── */}
      <View style={[styles.topFoliageWrapper, { height: 380 }]} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK HALAMAN UTAMA & BANK SOAL (TOMBOL KARTU PUTIH MINT GREEN SHADOW) ── */}
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
          Ujian CBT
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation?.navigate('Notifikasi')}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#004D32" />
          {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── Main Sheet Container ── */}
      <View style={styles.sheetContainer}>
        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.cleanMainScrollContent, { paddingBottom: Math.max(bottomInset + 72, 94) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0E5C44"
              colors={['#0E5C44', '#10B981']}
            />
          }
        >
          <View style={styles.cleanScrollInner}>
            <View style={styles.bodyContentWrapper}>
              {/* ── OPEN STUDENT PROFILE ROW (GOLD STANDARD IDENTIK BANK SOAL) ── */}
              <View style={styles.studentProfileRow}>
                {/* 60x60 Avatar with Mint Ring (Klik untuk lihat KTS Siswa Terpilih) */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedIdCardStudent(headerStudent)}
                  style={styles.studentAvatarRing}
                >
                  <Image
                    source={studentAvatarSource}
                    style={styles.studentAvatarImg}
                    resizeMode="cover"
                  />
                </TouchableOpacity>

                {/* 3-tier identity & action */}
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

                  {/* Baris 3: Kelas Siswa */}
                  {studentClass ? (
                    <View style={styles.studentMetaRow}>
                      <MaterialCommunityIcons name="door-open" size={12} color="#065F46" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.studentProfileClassText}>
                        {studentClass}
                      </Text>
                    </View>
                  ) : null}

                  {/* Baris Aksi Terpadu (Ganti Siswa + Lencana Presensi Dinamis) */}
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
                        styles.studentStatusBadge,
                        { backgroundColor: attendanceStatus.bg, borderColor: attendanceStatus.border },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={attendanceStatus.icon}
                        size={12}
                        color={attendanceStatus.color}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.studentStatusBadgeText, { color: attendanceStatus.color }]}>
                        {attendanceStatus.label}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* ── HERO KPI GROUP CARD (IDENTIK BANK SOAL SCREEN STYLE) ── */}
              <View style={[styles.cbtGroupCard, { marginTop: 6 }]}>
                <LinearGradient
                  colors={['#059669', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.cbtGroupHeaderGradient}
                >
                  <View style={styles.cbtGroupHeaderLeft}>
                    <View style={styles.cbtGroupHeaderIconBoxWhite}>
                      <MaterialCommunityIcons name="laptop" size={18} color="#047857" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.cbtGroupTitleWhite}>
                        Pusat Ujian CBT Mandiri
                      </Text>
                      <Text numberOfLines={1} style={styles.cbtGroupSubWhite}>
                        {isParent && activeStudentName ? `Jadwal & riwayat evaluasi ${activeStudentName}` : 'Evaluasi belajar berbasis komputer & pemantauan nilai'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cbtGroupBadge}>
                    <MaterialCommunityIcons name="check-decagram" size={12} color="#047857" style={{ marginRight: 3 }} />
                    <Text style={styles.cbtGroupBadgeText}>
                      {stats.total} Total CBT
                    </Text>
                  </View>
                </LinearGradient>

                {/* 2 Kolom KPI: Ujian Tersedia & Riwayat Selesai */}
                <View style={styles.kpiRowModern}>
                  {/* Card 1: Ujian Siap Dikerjakan */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedFilter(selectedFilter === 'available' ? 'semua' : 'available')}
                    style={[
                      styles.kpiCardModern,
                      {
                        borderColor: selectedFilter === 'available' ? '#059669' : '#A7F3D0',
                        backgroundColor: selectedFilter === 'available' ? '#D1FAE5' : '#ECFDF5',
                      },
                    ]}
                  >
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#A7F3D0' }]}>
                      <MaterialCommunityIcons name="play-circle-outline" size={20} color="#047857" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={1} style={styles.kpiLabelModern}>Tersedia</Text>
                      <Text style={[styles.kpiValueModern, { color: '#047857' }]}>{stats.available}</Text>
                      <Text numberOfLines={1} style={styles.kpiSubModern}>Siap Dikerjakan</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Card 2: Riwayat Selesai */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedFilter(selectedFilter === 'completed' ? 'semua' : 'completed')}
                    style={[
                      styles.kpiCardModern,
                      {
                        borderColor: selectedFilter === 'completed' ? '#7C3AED' : '#E9D5FF',
                        backgroundColor: selectedFilter === 'completed' ? '#F3E8FF' : '#FAF5FF',
                      },
                    ]}
                  >
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#E9D5FF' }]}>
                      <MaterialCommunityIcons name="shield-check-outline" size={20} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={1} style={styles.kpiLabelModern}>Selesai</Text>
                      <Text style={[styles.kpiValueModern, { color: '#7C3AED' }]}>{stats.completed}</Text>
                      <Text numberOfLines={1} style={styles.kpiSubModern}>Riwayat Ujian</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Progress Banner Ujian (Mini Progress Bar seperti Bank Soal) */}
                <View style={styles.kpiProgressBannerWrapper}>
                  <View style={[styles.kpiProgressBanner, styles.kpiProgressBannerEmerald]}>
                    <View style={styles.kpiProgressBannerTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <View style={[styles.kpiIconWrap, { width: 34, height: 34, borderRadius: 10, backgroundColor: '#D1FAE5' }]}>
                          <MaterialCommunityIcons name="trophy-outline" size={18} color="#059669" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text numberOfLines={1} style={styles.kpiProgressBannerTitle}>
                            {stats.completed > 0 ? `${stats.completed} Ujian Telah Dikerjakan` : 'Belum Ada Ujian Selesai'}
                          </Text>
                          <Text numberOfLines={1} style={styles.kpiProgressBannerSub}>
                            {stats.available} ujian aktif siap dikerjakan dari total {stats.total} CBT
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Mini Progress Bar */}
                    <View style={styles.kpiMiniProgressBarBg}>
                      <View
                        style={[
                          styles.kpiMiniProgressBarFill,
                          {
                            width: `${stats.total > 0 ? Math.min(Math.max(Math.round((stats.completed / stats.total) * 100), 0), 100) : 0}%`,
                            backgroundColor: '#059669',
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>

                {/* Filter Pills Row (Semua, Siap Dikerjakan, Mendatang, Riwayat Selesai) */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
                  {[
                    { id: 'semua', label: 'Semua', count: stats.total, color: '#0F172A' },
                    { id: 'available', label: 'Siap Dikerjakan', count: stats.available, color: '#059669' },
                    { id: 'upcoming', label: 'Mendatang', count: stats.upcoming, color: '#D97706' },
                    { id: 'completed', label: 'Riwayat Selesai', count: stats.completed, color: '#7C3AED' },
                  ].map((tab) => {
                    const isSelected = selectedFilter === tab.id;
                    return (
                      <TouchableOpacity
                        key={tab.id}
                        activeOpacity={0.8}
                        onPress={() => setSelectedFilter(tab.id as any)}
                        style={[
                          styles.kpiFilterPill,
                          isSelected && { backgroundColor: tab.color, borderColor: tab.color },
                        ]}
                      >
                        <Text style={[styles.kpiFilterPillText, isSelected && { color: '#FFFFFF' }]}>
                          {tab.label} ({tab.count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Search Bar Modern seperti Bank Soal */}
              <View style={styles.searchContainerModern}>
                <MaterialCommunityIcons name="magnify" size={20} color="#059669" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInputModern}
                  placeholder="Cari judul ujian atau mata pelajaran..."
                  placeholderTextColor="#94A3B8"
                  value={search}
                  onChangeText={setSearch}
                />
                {search.trim().length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} style={styles.clearSearchBtn}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

            {/* ══════════════════════════════════════════════════════════════
              SECTION 4: CBT EXAMS LIST (100% REAL DATA DATABASE)
             ══════════════════════════════════════════════════════════════ */}
            <View style={[styles.sectionHeaderRow, { marginBottom: 12, paddingHorizontal: 4 }]}>
              <Text style={styles.sectionTitle}>Daftar Ujian CBT</Text>
              <View style={styles.studentCardCountBadge}>
                <Text style={styles.studentCardCountBadgeText}>{filteredExams.length} Ujian</Text>
              </View>
            </View>
            {loading && !refreshing ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#18A165" />
                <Text style={styles.loadingText}>Memuat jadwal ujian CBT dari database...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => void loadAll()} style={styles.retryBtn}>
                  <Text style={styles.retryBtnText}>Muat Ulang</Text>
                </TouchableOpacity>
              </View>
            ) : filteredExams.length === 0 ? (
              <EmptyStateCard
                icon="file-check-outline"
                title="Belum Ada Ujian CBT"
                description={
                  search || selectedFilter !== 'semua'
                    ? 'Tidak ditemukan jadwal ujian yang sesuai dengan filter pencarian.'
                    : 'Belum ada paket ujian CBT yang diterbitkan oleh dewan guru untuk kelas ini.'
                }
              />
            ) : (
              <View style={styles.examsList}>
                {filteredExams.map((exam) => {
                  const status = getExamStatus(exam);
                  const isCompleted = status === 'completed';
                  const isResume = status === 'resume';
                  const isAvailable = status === 'available';
                  const isUpcoming = status === 'upcoming';
                  const isEnded = status === 'ended';
                  const statusMeta = getExamStatusMeta(status);
                  const subjectMeta = getSubjectMeta(exam.mata_pelajaran);
                  const hasScore = exam.latest_result?.nilai_tersedia && exam.latest_result?.nilai_final != null;

                  return (
                    <TouchableOpacity
                      key={exam.id}
                      activeOpacity={0.78}
                      onPress={() => setInstructionModal(exam)}
                      style={styles.examCard}
                    >
                      {/* Baris 1: Full-Width Badge Row (Subject Pill di kiri + Status Badge di kanan tanpa terhimpit) */}
                      <View style={styles.examCardHeaderRow}>
                        <View style={styles.subjectBadge}>
                          <Text numberOfLines={1} style={styles.subjectBadgeText}>
                            {exam.mata_pelajaran || 'Mata Pelajaran'}
                          </Text>
                        </View>

                        <View style={[styles.statusBadge, statusMeta.style]}>
                          <Text style={[styles.statusBadgeText, { color: statusMeta.textColor }]}>
                            {statusMeta.label}
                          </Text>
                        </View>
                      </View>

                      {/* Baris 2: Icon Box 46x46 + Judul Ujian & Meta Guru/Kelas */}
                      <View style={styles.examCardBodyRow}>
                        <View style={[styles.examSubjectIconBox, { backgroundColor: subjectMeta.bg }]}>
                          <MaterialCommunityIcons name={subjectMeta.icon as any} size={24} color={subjectMeta.color} />
                        </View>

                        <View style={styles.examTitleMetaCol}>
                          <Text style={styles.examTitle} numberOfLines={2}>
                            {exam.judul_ujian}
                          </Text>
                          <View style={styles.examTeacherRow}>
                            <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                            <Text style={styles.examTeacherText} numberOfLines={1}>
                              {exam.guru || 'Dewan Guru'} · {exam.kelas || 'Semua Kelas'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Middle: 3-column Spec Grid Card (Durasi, KKM, Format/Soal) */}
                      <View style={styles.examSpecsCard}>
                        <View style={styles.examSpecItem}>
                          <MaterialCommunityIcons name="clock-outline" size={15} color="#059669" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.examSpecLabel}>Durasi</Text>
                            <Text style={styles.examSpecValue}>{exam.durasi_menit} Menit</Text>
                          </View>
                        </View>

                        <View style={styles.examSpecDivider} />

                        <View style={styles.examSpecItem}>
                          <MaterialCommunityIcons name="target" size={15} color="#2563EB" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.examSpecLabel}>KKM</Text>
                            <Text style={styles.examSpecValue}>{exam.nilai_kkm}</Text>
                          </View>
                        </View>

                        <View style={styles.examSpecDivider} />

                        <View style={styles.examSpecItem}>
                          <MaterialCommunityIcons name="format-list-checks" size={15} color="#7C3AED" />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.examSpecLabel}>Format</Text>
                            <Text style={styles.examSpecValue}>
                              {exam.kisi_kisi?.jumlah_soal ? `${exam.kisi_kisi.jumlah_soal} Soal` : 'CBT Online'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Schedule Info Box */}
                      <View style={styles.scheduleInfoBox}>
                        <MaterialCommunityIcons name="calendar-clock" size={15} color="#047857" style={{ marginRight: 6, marginTop: 1 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.scheduleInfoText}>
                            {formatDate(exam.waktu_mulai)} s/d {formatDate(exam.waktu_selesai)}
                          </Text>
                        </View>
                      </View>

                      {/* Score Result Banner (Jika Selesai) */}
                      {isCompleted && (
                        <View style={styles.resultBannerBox}>
                          <View style={styles.resultBannerLeft}>
                            <View style={styles.resultTrophyIconBox}>
                              <MaterialCommunityIcons name="trophy-award" size={18} color="#7C3AED" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.resultBannerLabel}>Ujian Selesai Dikerjakan</Text>
                              <Text style={styles.resultBannerSub}>
                                {hasScore
                                  ? (Number(exam.latest_result?.nilai_final) >= Number(exam.nilai_kkm) ? '✓ Tuntas Memenuhi KKM' : 'Perlu Remedial / Evaluasi')
                                  : 'Hasil evaluasi sedang diproses dewan guru'}
                              </Text>
                            </View>
                          </View>
                          {hasScore && (
                            <View style={styles.resultBannerScoreBadge}>
                              <Text style={styles.resultBannerScoreNum}>{exam.latest_result?.nilai_final}</Text>
                              <Text style={styles.resultBannerScoreSub}>Nilai</Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Action Buttons */}
                      {isParent ? (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => setInstructionModal(exam)}
                            style={[styles.actionBtnParent, { flex: 1 }]}
                          >
                            <MaterialCommunityIcons name="information-outline" size={16} color="#0284C7" />
                            <Text style={styles.actionBtnParentText}>Petunjuk</Text>
                          </TouchableOpacity>

                          {(isAvailable || isResume) ? (
                            <TouchableOpacity
                              activeOpacity={0.8}
                              disabled={startingId === exam.id}
                              onPress={() => setInstructionModal(exam)}
                              style={[styles.actionBtn, { flex: 1.6 }]}
                            >
                              {startingId === exam.id ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <>
                                  <MaterialCommunityIcons name={isResume ? 'progress-clock' : 'play-circle'} size={16} color="#FFFFFF" />
                                  <Text style={styles.actionBtnText}>
                                    {isResume ? 'Lanjutkan Ujian' : 'Mulai Ujian Ananda'}
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          ) : isCompleted ? (
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => setInstructionModal(exam)}
                              style={[styles.actionBtn, styles.actionBtnCompleted, { flex: 1.6 }]}
                            >
                              <MaterialCommunityIcons name="clipboard-check-outline" size={16} color="#FFFFFF" />
                              <Text style={styles.actionBtnText}>Detail Hasil</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={[styles.actionBtn, styles.actionBtnDisabled, { flex: 1.6 }]}>
                              <MaterialCommunityIcons name={isUpcoming ? 'clock-outline' : 'lock-outline'} size={15} color="#94A3B8" />
                              <Text style={[styles.actionBtnText, { color: '#94A3B8' }]}>
                                {isUpcoming ? 'Belum Dimulai' : 'Ujian Ditutup'}
                              </Text>
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={{ marginTop: 4 }}>
                          {(isAvailable || isResume) ? (
                            <TouchableOpacity
                              activeOpacity={0.8}
                              disabled={startingId === exam.id}
                              onPress={() => setInstructionModal(exam)}
                              style={[styles.actionBtn, isResume && styles.actionBtnResume]}
                            >
                              {startingId === exam.id ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <>
                                  <MaterialCommunityIcons name={isResume ? 'progress-clock' : 'play-circle'} size={16} color="#FFFFFF" />
                                  <Text style={styles.actionBtnText}>
                                    {isResume ? 'Lanjutkan Ujian' : 'Mulai Ujian Sekarang'}
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          ) : isCompleted ? (
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => setInstructionModal(exam)}
                              style={[styles.actionBtn, styles.actionBtnCompleted]}
                            >
                              <MaterialCommunityIcons name="clipboard-check-outline" size={16} color="#FFFFFF" />
                              <Text style={styles.actionBtnText}>Lihat Hasil & Rincian</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={[styles.actionBtn, styles.actionBtnDisabled]}>
                              <MaterialCommunityIcons name={isUpcoming ? 'clock-outline' : 'lock-outline'} size={15} color="#94A3B8" />
                              <Text style={[styles.actionBtnText, { color: '#94A3B8' }]}>
                                {isUpcoming ? 'Ujian Belum Dimulai' : 'Ujian Telah Berakhir'}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
          </View>
        </Animated.ScrollView>
      </View>

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

      {/* ── MODAL PEMILIH ANANDA (JIKA ORANG TUA MEMILIKI >1 ANAK) ── */}
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
              {children.map((c: any, idx: number) => {
                const cId = String(c.id || c.student_id);
                const isSelected = cId === String(selectedChildId);
                const cName = (typeof c.name === 'string' && c.name) || (typeof c.nama_lengkap === 'string' && c.nama_lengkap) || (typeof c.full_name === 'string' && c.full_name) || 'Ananda';
                const cUnit =
                  (typeof c.unit?.name === 'string' && c.unit.name) ||
                  (typeof c.unit_name === 'string' && c.unit_name) ||
                  (typeof c.education_unit?.name === 'string' && c.education_unit.name) ||
                  (typeof c.education_unit_name === 'string' && c.education_unit_name) ||
                  (typeof c.unit === 'string' && c.unit) ||
                  '';
                const cClass =
                  (typeof c.kelas?.nama_kelas === 'string' && c.kelas.nama_kelas) ||
                  (typeof c.kelas?.name === 'string' && c.kelas.name) ||
                  (typeof c.class?.name === 'string' && c.class.name) ||
                  (typeof c.class_name === 'string' && c.class_name) ||
                  (typeof c.kelas === 'string' && c.kelas) ||
                  '';

                return (
                  <TouchableOpacity
                    key={cId || idx}
                    activeOpacity={0.8}
                    onPress={() => {
                      setShowChildSelectorModal(false);
                      setSelectedChildId(cId);
                      useActiveChildStore.getState().setActiveChildId(cId);
                      goToLoopChild(idx);
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
                      <Text
                        style={[
                          styles.childModalItemName,
                          isSelected && { color: '#0D6B42', fontWeight: '800' },
                        ]}
                      >
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

      {/* ══════════════════════════════════════════════════════════════
          MODAL: PETUNJUK & KONFIRMASI MULAI UJIAN CBT
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={!!instructionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setInstructionModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderTitle}>Petunjuk Pengerjaan Ujian</Text>
                <Text numberOfLines={1} style={styles.modalExamTitle}>
                  {instructionModal?.judul_ujian}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setInstructionModal(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalMetaInfo}>
                Mata Pelajaran: {instructionModal?.mata_pelajaran || '-'} · Durasi: {instructionModal?.durasi_menit} Menit · KKM: {instructionModal?.nilai_kkm}
              </Text>

              {/* Hasil Nilai jika Ujian Selesai */}
              {instructionModal?.latest_result && (
                <View style={styles.resultBannerBox}>
                  <View style={styles.resultBannerLeft}>
                    <View style={styles.resultTrophyIconBox}>
                      <MaterialCommunityIcons name="trophy-award" size={20} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultBannerLabel}>Hasil Ujian CBT</Text>
                      <Text style={styles.resultBannerSub}>
                        {instructionModal.latest_result.nilai_tersedia && instructionModal.latest_result.nilai_final != null
                          ? (Number(instructionModal.latest_result.nilai_final) >= Number(instructionModal.nilai_kkm)
                              ? '✓ Tuntas Memenuhi KKM'
                              : 'Perlu Remedial / Evaluasi')
                          : 'Hasil evaluasi sedang diproses dewan guru'}
                      </Text>
                    </View>
                  </View>
                  {instructionModal.latest_result.nilai_tersedia && instructionModal.latest_result.nilai_final != null && (
                    <View style={styles.resultBannerScoreBadge}>
                      <Text style={styles.resultBannerScoreNum}>{instructionModal.latest_result.nilai_final}</Text>
                      <Text style={styles.resultBannerScoreSub}>Nilai</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Parent Monitoring Info or Student Time Warning */}
              {isParent ? (
                <View style={styles.parentNoticeBox}>
                  <MaterialCommunityIcons name="shield-check" size={20} color="#0369A1" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.parentNoticeTitle}>Mode Pendampingan Orang Tua</Text>
                    <Text style={styles.parentNoticeText}>
                      Orang tua dapat mendampingi ananda mengerjakan ujian CBT melalui perangkat ini. Timer ujian akan otomatis berjalan saat tombol mulai ditekan.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.instructionNoticeBox}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#B45309" style={{ marginRight: 6 }} />
                  <Text style={styles.instructionNoticeText}>
                    Setelah menekan Mulai Ujian, hitungan mundur waktu akan otomatis berjalan. Pastikan koneksi internet stabil hingga lembar jawaban berhasil dikumpulkan.
                  </Text>
                </View>
              )}

              <View style={styles.securityNoticeBox}>
                <MaterialCommunityIcons name="shield-lock-outline" size={18} color="#DC2626" style={{ marginRight: 8 }} />
                <Text style={styles.securityNoticeText}>
                  Tangkapan layar (screenshot) dan perekaman layar otomatis diblokir sistem demi menjaga integritas serta kerahasiaan soal ujian.
                </Text>
              </View>

              {instructionModal?.instruksi ? (
                <View style={styles.instructionDetailBox}>
                  <Text style={styles.instructionDetailHeader}>Instruksi Guru:</Text>
                  <Text style={styles.instructionDetailContent}>{instructionModal.instruksi}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setInstructionModal(null)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>{isParent || (instructionModal && getExamStatus(instructionModal) === 'completed') ? 'Tutup' : 'Batal'}</Text>
              </TouchableOpacity>
              {instructionModal && (getExamStatus(instructionModal) === 'available' || getExamStatus(instructionModal) === 'resume') && (
                <TouchableOpacity
                  onPress={() => instructionModal && handleStartExam(instructionModal)}
                  style={styles.modalStartBtn}
                >
                  <MaterialCommunityIcons name="play" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.modalStartBtnText}>
                    {getExamStatus(instructionModal) === 'resume'
                      ? (isParent ? 'Lanjutkan Ujian Ananda' : 'Lanjutkan Kerjakan')
                      : (isParent ? 'Mulai Ujian Ananda' : 'Mulai Kerjakan')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL FULL-SCREEN: CBT EXAM RUNNER (RUANG UJIAN INTERAKTIF)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(activeExamSession)}
        animationType="slide"
        onRequestClose={handleConfirmFinish}
      >
        {activeExamSession && (
          <View style={[styles.runnerContainer, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 16) }]}>
            {/* Runner Header */}
            <View style={styles.runnerHeader}>
              <TouchableOpacity
                onPress={handleConfirmFinish}
                style={styles.runnerExitBtn}
              >
                <MaterialCommunityIcons name="chevron-left" size={26} color="#0F172A" />
              </TouchableOpacity>

              <View style={styles.runnerHeaderTitleBox}>
                <Text style={styles.runnerExamTitle} numberOfLines={1}>
                  {activeExamSession.ujian.judul_ujian}
                </Text>
                <Text style={styles.runnerExamSub}>
                  Soal {currentQuestionIndex + 1} dari {activeExamSession.soal.length}
                </Text>
              </View>

              {/* Countdown Timer Badge */}
              <View
                style={[
                  styles.runnerTimerBadge,
                  timeLeft <= 300 && styles.runnerTimerBadgeWarning,
                ]}
              >
                <MaterialCommunityIcons
                  name="timer-outline"
                  size={15}
                  color={timeLeft <= 300 ? '#DC2626' : '#059669'}
                />
                <Text
                  style={[
                    styles.runnerTimerText,
                    timeLeft <= 300 && styles.runnerTimerTextWarning,
                  ]}
                >
                  {formatTimer(timeLeft)}
                </Text>
              </View>

              {/* Question Palette Button */}
              <TouchableOpacity
                onPress={() => setShowQuestionPalette(true)}
                style={styles.runnerPaletteBtn}
              >
                <MaterialCommunityIcons name="view-grid-outline" size={18} color="#0F172A" />
                <Text style={styles.runnerPaletteBtnText}>
                  {activeExamSession.soal.filter((q) => Boolean(examAnswers[q.id])).length}/{activeExamSession.soal.length}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Progress Bar & Auto-save Status */}
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.round(
                      ((currentQuestionIndex + 1) / (activeExamSession.soal.length || 1)) * 100
                    )}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.savingIndicatorRow}>
              {savingAnswer ? (
                <>
                  <ActivityIndicator size="small" color="#18A165" style={{ transform: [{ scale: 0.7 }] }} />
                  <Text style={styles.savingIndicatorText}>Menyimpan ke server...</Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons name="cloud-check-outline" size={13} color="#059669" />
                  <Text style={styles.savingIndicatorText}>Jawaban tersimpan otomatis</Text>
                </>
              )}
            </View>

            {/* Question Body */}
            {activeExamSession.soal.length > 0 && activeExamSession.soal[currentQuestionIndex] ? (
              (() => {
                const currentQuestion = activeExamSession.soal[currentQuestionIndex];
                const isDoubtful = Boolean(doubtfulQuestions[currentQuestion.id]);
                const selectedKey = examAnswers[currentQuestion.id];

                return (
                  <ScrollView
                    style={styles.questionScroll}
                    contentContainerStyle={[styles.questionScrollContent, { paddingBottom: bottomInset + 80 }]}
                    showsVerticalScrollIndicator={false}
                  >
                    {/* Question Meta Row */}
                    <View style={styles.questionMetaRow}>
                      <View style={styles.questionIndexBadge}>
                        <Text style={styles.questionIndexText}>Nomor {currentQuestionIndex + 1}</Text>
                      </View>
                      <View style={styles.questionPointBadge}>
                        <MaterialCommunityIcons name="star-outline" size={13} color="#059669" />
                        <Text style={styles.questionPointText}>Poin: {currentQuestion.poin}</Text>
                      </View>
                      {isDoubtful && (
                        <View style={styles.doubtfulTag}>
                          <MaterialCommunityIcons name="alert-outline" size={12} color="#B45309" />
                          <Text style={styles.doubtfulTagText}>Ragu-ragu</Text>
                        </View>
                      )}
                    </View>

                    {/* Question Text Box */}
                    <View style={styles.questionCard}>
                      <Text style={styles.questionText}>{currentQuestion.pertanyaan}</Text>
                    </View>

                    {/* Render by question type (5 types supported) */}
                    {(() => {
                      const qType = currentQuestion.tipe_soal || 'pg';

                      // 1. Tipe Benar / Salah
                      if (qType === 'benar_salah') {
                        const valLower = String(selectedKey || '').toLowerCase();
                        return (
                          <View style={styles.trueFalseContainer}>
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => handleSelectOption(currentQuestion.id, 'benar', false)}
                              style={[
                                styles.trueFalseCard,
                                valLower === 'benar' && styles.trueFalseCardSelectedBenar,
                              ]}
                            >
                              <View style={[styles.trueFalseIconCircle, valLower === 'benar' && styles.trueFalseIconCircleSelectedBenar]}>
                                <MaterialCommunityIcons
                                  name={valLower === 'benar' ? 'check-circle' : 'check-circle-outline'}
                                  size={24}
                                  color={valLower === 'benar' ? '#059669' : '#64748B'}
                                />
                              </View>
                              <View style={styles.trueFalseTextBox}>
                                <Text style={[styles.trueFalseTitle, valLower === 'benar' && styles.trueFalseTitleSelectedBenar]}>
                                  BENAR
                                </Text>
                                <Text style={styles.trueFalseSub}>Pernyataan ini tepat / sesuai</Text>
                              </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => handleSelectOption(currentQuestion.id, 'salah', false)}
                              style={[
                                styles.trueFalseCard,
                                valLower === 'salah' && styles.trueFalseCardSelectedSalah,
                              ]}
                            >
                              <View style={[styles.trueFalseIconCircle, valLower === 'salah' && styles.trueFalseIconCircleSelectedSalah]}>
                                <MaterialCommunityIcons
                                  name={valLower === 'salah' ? 'close-circle' : 'close-circle-outline'}
                                  size={24}
                                  color={valLower === 'salah' ? '#DC2626' : '#64748B'}
                                />
                              </View>
                              <View style={styles.trueFalseTextBox}>
                                <Text style={[styles.trueFalseTitle, valLower === 'salah' && styles.trueFalseTitleSelectedSalah]}>
                                  SALAH
                                </Text>
                                <Text style={styles.trueFalseSub}>Pernyataan ini tidak tepat</Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        );
                      }

                      // 2. Tipe Isian Singkat
                      if (qType === 'isian') {
                        return (
                          <View style={styles.shortAnswerBox}>
                            <View style={styles.inputHeaderRow}>
                              <MaterialCommunityIcons name="form-textbox" size={17} color="#059669" />
                              <Text style={styles.shortAnswerPrompt}>Tuliskan jawaban singkat Anda:</Text>
                            </View>
                            <TextInput
                              style={styles.shortAnswerInput}
                              value={selectedKey || ''}
                              placeholder="Ketik jawaban singkat di sini..."
                              placeholderTextColor="#94A3B8"
                              autoCapitalize="none"
                              returnKeyType="done"
                              onChangeText={(text) => {
                                handleSelectOption(currentQuestion.id, text, true);
                              }}
                            />
                            <Text style={styles.inputSubHint}>
                              Jawaban Anda otomatis tersimpan saat mengetik.
                            </Text>
                          </View>
                        );
                      }

                      // 3. Tipe Menjodohkan
                      if (qType === 'menjodohkan') {
                        const leftItems: string[] = currentQuestion.pasangan_menjodohkan?.kiri || [];
                        const rightItems: string[] = currentQuestion.pasangan_menjodohkan?.kanan || [];

                        let currentPairs: Array<{ kiri: string; kanan: string }> = [];
                        try {
                          currentPairs = JSON.parse(selectedKey || '[]');
                          if (!Array.isArray(currentPairs)) currentPairs = [];
                        } catch {
                          currentPairs = [];
                        }

                        const updatePair = (leftVal: string, rightVal: string) => {
                          const existingPair = currentPairs.find((p) => p.kiri === leftVal);
                          const nextVal = existingPair?.kanan === rightVal ? '' : rightVal;
                          const nextPairs = leftItems.map((item) => ({
                            kiri: item,
                            kanan: item === leftVal ? nextVal : (currentPairs.find((p) => p.kiri === item)?.kanan || ''),
                          }));
                          handleSelectOption(currentQuestion.id, JSON.stringify(nextPairs), false);
                        };

                        return (
                          <View style={styles.matchingContainer}>
                            <View style={styles.matchingNoticeBox}>
                              <MaterialCommunityIcons name="swap-horizontal-bold" size={16} color="#0E5C44" />
                              <Text style={styles.matchingNoticeText}>
                                Pasangkan setiap item di sebelah kiri dengan pilihan yang tepat di bawahnya:
                              </Text>
                            </View>

                            {leftItems.map((leftText, lIdx) => {
                              const pairedRight = currentPairs.find((p) => p.kiri === leftText)?.kanan || '';
                              const otherUsedRights = currentPairs
                                .filter((p) => p.kiri !== leftText && Boolean(p.kanan))
                                .map((p) => p.kanan);

                              return (
                                <View key={`match-left-${lIdx}`} style={styles.matchingPairCard}>
                                  <View style={styles.matchingLeftHeader}>
                                    <View style={styles.matchingLeftIndexBadge}>
                                      <Text style={styles.matchingLeftIndexText}>{lIdx + 1}</Text>
                                    </View>
                                    <Text style={styles.matchingLeftText}>{leftText}</Text>
                                  </View>

                                  <View style={styles.matchingDividerRow}>
                                    <View style={styles.matchingDividerLine} />
                                    <Text style={styles.matchingDividerLabel}>Pilih Pasangan</Text>
                                    <View style={styles.matchingDividerLine} />
                                  </View>

                                  <View style={styles.matchingPillsWrap}>
                                    {rightItems.map((rText, rIdx) => {
                                      const isChosen = pairedRight === rText;
                                      const isUsedElsewhere = otherUsedRights.includes(rText);

                                      return (
                                        <TouchableOpacity
                                          key={`match-right-${lIdx}-${rIdx}`}
                                          activeOpacity={0.7}
                                          disabled={isUsedElsewhere}
                                          onPress={() => updatePair(leftText, rText)}
                                          style={[
                                            styles.matchingPill,
                                            isChosen && styles.matchingPillSelected,
                                            isUsedElsewhere && styles.matchingPillDisabled,
                                          ]}
                                        >
                                          <MaterialCommunityIcons
                                            name={isChosen ? 'check-circle' : isUsedElsewhere ? 'lock-outline' : 'circle-outline'}
                                            size={14}
                                            color={isChosen ? '#059669' : isUsedElsewhere ? '#94A3B8' : '#64748B'}
                                          />
                                          <Text
                                            style={[
                                              styles.matchingPillText,
                                              isChosen && styles.matchingPillTextSelected,
                                              isUsedElsewhere && styles.matchingPillTextDisabled,
                                            ]}
                                          >
                                            {rText}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        );
                      }

                      // 4. Tipe Esai Uraian
                      if (qType === 'esai' || (!currentQuestion.opsi || currentQuestion.opsi.length === 0)) {
                        return (
                          <View style={styles.essayBox}>
                            <View style={styles.inputHeaderRow}>
                              <MaterialCommunityIcons name="text-box-outline" size={17} color="#059669" />
                              <Text style={styles.essayPrompt}>Ketik uraian jawaban Anda pada kolom di bawah:</Text>
                            </View>
                            <TextInput
                              style={styles.essayInput}
                              multiline
                              numberOfLines={6}
                              textAlignVertical="top"
                              value={selectedKey || ''}
                              placeholder="Tuliskan uraian jawaban secara rinci dan jelas..."
                              placeholderTextColor="#94A3B8"
                              onChangeText={(text) => {
                                handleSelectOption(currentQuestion.id, text, true);
                              }}
                            />
                            <Text style={styles.inputSubHint}>
                              Jawaban uraian otomatis tersimpan ke server.
                            </Text>
                          </View>
                        );
                      }

                      // 5. Default: Pilihan Ganda (pg)
                      return (
                        <View style={styles.optionsContainer}>
                          {currentQuestion.opsi.map((opt) => {
                            const isSelected = selectedKey === opt.key;
                            return (
                              <TouchableOpacity
                                key={opt.key}
                                activeOpacity={0.8}
                                onPress={() => handleSelectOption(currentQuestion.id, opt.key, false)}
                                style={[
                                  styles.optionItem,
                                  isSelected && styles.optionItemSelected,
                                ]}
                              >
                                <View
                                  style={[
                                    styles.optionRadioCircle,
                                    isSelected && styles.optionRadioCircleSelected,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.optionRadioText,
                                      isSelected && styles.optionRadioTextSelected,
                                    ]}
                                  >
                                    {opt.key}
                                  </Text>
                                </View>
                                <Text
                                  style={[
                                    styles.optionText,
                                    isSelected && styles.optionTextSelected,
                                  ]}
                                >
                                  {opt.text}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })()}
                  </ScrollView>
                );
              })()
            ) : (
              <View style={styles.emptyQuestionBox}>
                <Text style={styles.emptyQuestionText}>Belum ada soal pada ujian ini.</Text>
              </View>
            )}

            {/* Bottom Navigation Toolbar */}
            <View style={[styles.runnerBottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              <TouchableOpacity
                disabled={currentQuestionIndex === 0}
                onPress={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                style={[
                  styles.runnerNavBtn,
                  currentQuestionIndex === 0 && styles.runnerNavBtnDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={18}
                  color={currentQuestionIndex === 0 ? '#94A3B8' : '#334155'}
                />
                <Text
                  style={[
                    styles.runnerNavBtnText,
                    currentQuestionIndex === 0 && styles.runnerNavBtnTextDisabled,
                  ]}
                >
                  Sebelumnya
                </Text>
              </TouchableOpacity>

              {/* Ragu-ragu Button */}
              {activeExamSession.soal[currentQuestionIndex] && (
                <TouchableOpacity
                  onPress={() => handleToggleDoubtful(activeExamSession.soal[currentQuestionIndex].id)}
                  style={[
                    styles.doubtfulToggleBtn,
                    doubtfulQuestions[activeExamSession.soal[currentQuestionIndex].id] &&
                    styles.doubtfulToggleBtnActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      doubtfulQuestions[activeExamSession.soal[currentQuestionIndex].id]
                        ? 'checkbox-marked'
                        : 'checkbox-blank-outline'
                    }
                    size={16}
                    color={
                      doubtfulQuestions[activeExamSession.soal[currentQuestionIndex].id]
                        ? '#D97706'
                        : '#64748B'
                    }
                  />
                  <Text
                    style={[
                      styles.doubtfulToggleBtnText,
                      doubtfulQuestions[activeExamSession.soal[currentQuestionIndex].id] &&
                      styles.doubtfulToggleBtnTextActive,
                    ]}
                  >
                    Ragu-ragu
                  </Text>
                </TouchableOpacity>
              )}

              {currentQuestionIndex < activeExamSession.soal.length - 1 ? (
                <TouchableOpacity
                  onPress={() => setCurrentQuestionIndex((prev) => Math.min(activeExamSession.soal.length - 1, prev + 1))}
                  style={[styles.runnerNavBtn, styles.runnerNavBtnNext]}
                >
                  <Text style={styles.runnerNavBtnTextNext}>Berikutnya</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleConfirmFinish}
                  disabled={submittingExam}
                  style={styles.finishBtnPrimary}
                >
                  {submittingExam ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check-all" size={18} color="#FFFFFF" />
                      <Text style={styles.finishBtnPrimaryText}>Kumpulkan</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL LEMBAR NOMOR SOAL (QUESTION PALETTE)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showQuestionPalette}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuestionPalette(false)}
      >
        <View style={styles.paletteModalBackdrop}>
          <View style={styles.paletteModalContainer}>
            <View style={styles.paletteHeader}>
              <Text style={styles.paletteTitle}>Daftar Nomor Soal</Text>
              <TouchableOpacity
                onPress={() => setShowQuestionPalette(false)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.paletteScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.paletteGrid}>
                {activeExamSession?.soal.map((q, idx) => {
                  const isCurrent = idx === currentQuestionIndex;
                  const isAnswered = Boolean(examAnswers[q.id]);
                  const isDoubtful = Boolean(doubtfulQuestions[q.id]);

                  return (
                    <TouchableOpacity
                      key={q.id}
                      activeOpacity={0.8}
                      onPress={() => {
                        setCurrentQuestionIndex(idx);
                        setShowQuestionPalette(false);
                      }}
                      style={[
                        styles.paletteItem,
                        isAnswered && styles.paletteItemAnswered,
                        isDoubtful && styles.paletteItemDoubtful,
                        isCurrent && styles.paletteItemCurrent,
                      ]}
                    >
                      <Text
                        style={[
                          styles.paletteItemText,
                          (isAnswered || isDoubtful) && styles.paletteItemTextAnswered,
                        ]}
                      >
                        {idx + 1}
                      </Text>
                      {isDoubtful ? (
                        <View style={styles.paletteDoubtfulDot} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Palette Legend */}
              <View style={styles.paletteLegendRow}>
                <View style={styles.paletteLegendItem}>
                  <View style={[styles.paletteLegendDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.paletteLegendText}>Sudah Dijawab</Text>
                </View>
                <View style={styles.paletteLegendItem}>
                  <View style={[styles.paletteLegendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.paletteLegendText}>Ragu-ragu</Text>
                </View>
                <View style={styles.paletteLegendItem}>
                  <View style={[styles.paletteLegendDot, { backgroundColor: '#E2E8F0', borderWidth: 1, borderColor: '#CBD5E1' }]} />
                  <Text style={styles.paletteLegendText}>Belum Dijawab</Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setShowQuestionPalette(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Tutup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowQuestionPalette(false);
                  handleConfirmFinish();
                }}
                style={styles.finishBtnPalette}
              >
                <MaterialCommunityIcons name="check-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.finishBtnPaletteText}>Selesaikan Ujian</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL HASIL UJIAN (EXAM RESULT)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(examResultModal)}
        transparent
        animationType="fade"
        onRequestClose={() => setExamResultModal(null)}
      >
        <View style={styles.resultModalBackdrop}>
          <View style={styles.resultModalContainer}>
            <View style={styles.resultIconCircle}>
              <MaterialCommunityIcons name="trophy-award" size={44} color="#18A165" />
            </View>

            <Text style={styles.resultTitle}>Ujian Berhasil Dikumpulkan!</Text>
            <Text style={styles.resultSub}>
              Seluruh lembar jawaban Anda telah tersimpan dengan aman pada sistem CBT sekolah.
            </Text>

            {examResultModal?.nilai_tersedia && examResultModal.nilai_final != null ? (
              <>
                <View style={styles.resultScoreCard}>
                  <Text style={styles.resultScoreLabel}>Nilai Akhir Anda</Text>
                  <Text style={styles.resultScoreValue}>
                    {Number(examResultModal.nilai_final).toFixed(1)}
                  </Text>
                  {examResultModal.nilai_kkm != null && (
                    <Text style={styles.resultKkmText}>
                      Standar KKM: {examResultModal.nilai_kkm} ·{' '}
                      {Number(examResultModal.nilai_final) >= Number(examResultModal.nilai_kkm) ? (
                        <Text style={{ color: '#059669', fontWeight: '800' }}>TUNTAS</Text>
                      ) : (
                        <Text style={{ color: '#DC2626', fontWeight: '800' }}>BELUM TUNTAS</Text>
                      )}
                    </Text>
                  )}
                </View>

                <View style={styles.resultStatsRow}>
                  <View style={styles.resultStatBox}>
                    <Text style={[styles.resultStatVal, { color: '#059669' }]}>
                      {examResultModal.jumlah_benar ?? '-'}
                    </Text>
                    <Text style={styles.resultStatLbl}>Benar</Text>
                  </View>
                  <View style={styles.resultStatBox}>
                    <Text style={[styles.resultStatVal, { color: '#DC2626' }]}>
                      {examResultModal.jumlah_salah ?? '-'}
                    </Text>
                    <Text style={styles.resultStatLbl}>Salah</Text>
                  </View>
                  <View style={styles.resultStatBox}>
                    <Text style={[styles.resultStatVal, { color: '#64748B' }]}>
                      {examResultModal.jumlah_kosong ?? '-'}
                    </Text>
                    <Text style={styles.resultStatLbl}>Kosong</Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.scorePendingBox}>
                <MaterialCommunityIcons name="clock-check-outline" size={24} color="#0E7490" />
                <Text style={styles.scorePendingText}>
                  Hasil penilaian dan rekapitulasi nilai akan diumumkan setelah proses evaluasi oleh dewan guru.
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={() => setExamResultModal(null)}
              style={styles.resultCloseBtn}
            >
              <Text style={styles.resultCloseBtnText}>Kembali ke Beranda Ujian</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Universal Feedback Modal */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'info'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          confirmText={feedbackModal.confirmText}
          cancelText={feedbackModal.cancelText}
          onConfirm={feedbackModal.onConfirm}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#ECFDF5',
  },
  topFoliageWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  // Struktur scroll + hero statis disamakan plek dengan Tugas/Jadwal/Materi/Nilai
  mainScrollContent: {
    flexGrow: 1,
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  studentProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004D32',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 999,
    gap: 4,
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  parentGantiAnakBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  studentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  studentStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cbtGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 14,
  },
  cbtGroupHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cbtGroupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  cbtGroupHeaderIconBoxWhite: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cbtGroupTitleWhite: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  cbtGroupSubWhite: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D1FAE5',
    marginTop: 1,
  },
  cbtGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 999,
  },
  cbtGroupBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  kpiRowModern: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  kpiCardModern: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.2,
  },
  kpiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabelModern: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  kpiValueModern: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  kpiSubModern: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  kpiProgressBannerWrapper: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  kpiProgressBanner: {
    borderRadius: 14,
    borderWidth: 1.2,
    padding: 12,
  },
  kpiProgressBannerEmerald: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  kpiProgressBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiProgressBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
  kpiProgressBannerSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  kpiMiniProgressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  kpiMiniProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  kpiFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiFilterPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  searchContainerModern: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInputModern: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    marginLeft: 8,
    padding: 0,
  },
  searchIcon: {
    marginRight: 2,
  },
  clearSearchBtn: {
    padding: 2,
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
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
  containerBlock: {
    marginBottom: 16,
  },
  studentContainerBlock: {
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
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
  heroCardScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  studentCardsTrack: {
    gap: STUDENT_CARD_GAP,
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
    shadowColor: '#0D6B42',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
    shadowColor: '#0D6B42',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowOpacity: 0.06,
    elevation: 2,
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
    width: 62,
    height: 62,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarBorderWrapHeroInactive: {
    borderColor: '#A7F3D0',
    backgroundColor: '#EBF8F2',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  avatarInitialText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#084835',
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
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  childSubInfoHero: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
    fontWeight: '600',
  },
  studentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
    fontWeight: '600',
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitBadgeInactive: {
    backgroundColor: '#E7F7EF',
    borderColor: '#A7F3D0',
  },
  studentUnitText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: SCREEN_WIDTH - 220,
  },
  selectedActionBtnRight: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 8,
    minWidth: 46,
  },
  selectedActionBtnRightInactive: {
    backgroundColor: '#F1F5F9',
    elevation: 1,
  },
  selectedActionBtnText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  selectedActionBtnTextInactive: {
    color: '#64748B',
  },
  studentAttributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1,
  },
  studentAttributesGridInactive: {
    backgroundColor: '#F1F8F4',
    borderColor: '#D1E8DC',
  },
  studentAttrBox: {
    flex: 1,
    alignItems: 'center',
  },
  studentAttrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  studentAttrLabel: {
    fontSize: 9,
    color: '#A7F3D0',
    fontWeight: '700',
  },
  studentAttrValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentPresensiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presensiGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    marginLeft: 4,
  },
  studentAttrDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  inactiveText: {
    color: '#0F172A',
  },
  inactiveSubText: {
    color: '#64748B',
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
    backgroundColor: '#18A165',
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },

  // Search & Filter Tabs
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  filterTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },

  // Exams List
  examsList: {
    gap: 12,
  },
  examCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    marginBottom: 12,
  },
  examCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  examCardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  examSubjectIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  examTitleMetaCol: {
    flex: 1,
    justifyContent: 'center',
  },
  subjectBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    maxWidth: '65%',
  },
  subjectBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  statusBadgeAvailable: { backgroundColor: '#DCFCE7', borderColor: '#A7F3D0' },
  statusBadgeUpcoming: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  statusBadgeEnded: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  statusBadgeTextAvailable: { color: '#047857' },
  statusBadgeTextUpcoming: { color: '#B45309' },
  statusBadgeTextEnded: { color: '#64748B' },
  examTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 21,
    marginBottom: 4,
  },
  examTeacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  examTeacherText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  examSpecsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  examSpecItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  examSpecDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },
  examSpecLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  examSpecValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  scheduleInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 10,
  },
  scheduleInfoText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '700',
    flex: 1,
  },
  resultBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F3FF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    padding: 10,
    marginBottom: 10,
  },
  resultBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  resultTrophyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  resultBannerLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#6D28D9',
  },
  resultBannerSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#7C3AED',
    marginTop: 1,
  },
  resultBannerScoreBadge: {
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 10,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  resultBannerScoreNum: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 18,
  },
  resultBannerScoreSub: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#DDD6FE',
    textTransform: 'uppercase',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaClassGuru: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 10,
  },
  attrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  attrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  attrPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  timeWindowBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  timeWindowText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    padding: 8,
    borderRadius: 10,
    marginBottom: 10,
  },
  scoreText: {
    fontSize: 11.5,
    color: '#065F46',
    fontWeight: '700',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  actionBtnCompleted: {
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
  },
  actionBtnResume: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
  },
  actionBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowOpacity: 0,
    elevation: 0,
  },
  actionBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // State Views
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  modalIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  modalHeaderTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    marginVertical: 12,
  },
  modalExamTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalMetaInfo: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 12,
  },
  instructionNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  instructionNoticeText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  securityNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  securityNoticeText: {
    fontSize: 11,
    color: '#991B1B',
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  instructionDetailBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  instructionDetailHeader: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  instructionDetailContent: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 18,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modalCancelBtnText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  modalStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18A165',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  modalStartBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  actionBtnParent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  actionBtnParentText: {
    color: '#0284C7',
    fontSize: 12,
    fontWeight: '700',
  },
  parentNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  parentNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0369A1',
    marginBottom: 2,
  },
  parentNoticeText: {
    fontSize: 11,
    color: '#0C4A6E',
    lineHeight: 16,
  },

  // CBT Runner Styles
  // CBT Runner Styles (Gold Standard TailGrids Emerald)
  runnerContainer: {
    flex: 1,
    backgroundColor: '#ECFDF5',
  },
  runnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  runnerExitBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  runnerHeaderTitleBox: {
    flex: 1,
    marginRight: 10,
  },
  runnerExamTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  runnerExamSub: {
    fontSize: 11.5,
    color: '#047857',
    fontWeight: '700',
    marginTop: 1,
  },
  runnerTimerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 999,
    marginRight: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  runnerTimerBadgeWarning: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    shadowColor: '#DC2626',
  },
  runnerTimerText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#047857',
  },
  runnerTimerTextWarning: {
    color: '#DC2626',
  },
  runnerPaletteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#004D32',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  runnerPaletteBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  progressBarBackground: {
    height: 4.5,
    backgroundColor: '#D1FAE5',
    width: '100%',
  },
  progressBarFill: {
    height: 4.5,
    backgroundColor: '#059669',
    borderRadius: 2.25,
  },
  savingIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 5,
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  savingIndicatorText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '700',
  },
  questionScroll: {
    flex: 1,
  },
  questionScrollContent: {
    padding: 16,
  },
  questionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  questionIndexBadge: {
    backgroundColor: '#004D32',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  questionIndexText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  questionPointBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 999,
  },
  questionPointText: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '800',
  },
  doubtfulTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 999,
  },
  doubtfulTagText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '800',
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  questionText: {
    fontSize: 15,
    lineHeight: 23,
    color: '#0F172A',
    fontWeight: '700',
  },
  optionsContainer: {
    gap: 12,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 15,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  optionItemSelected: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
    shadowColor: '#059669',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  optionRadioCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#F0FDF4',
  },
  optionRadioCircleSelected: {
    borderColor: '#059669',
    backgroundColor: '#059669',
  },
  optionRadioText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#047857',
  },
  optionRadioTextSelected: {
    color: '#FFFFFF',
  },
  optionText: {
    fontSize: 14,
    color: '#1E293B',
    flex: 1,
    lineHeight: 20,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#064E3B',
    fontWeight: '800',
  },
  essayBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  inputSubHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 8,
    fontStyle: 'italic',
  },
  essayPrompt: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '700',
  },
  essayInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 13.5,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 120,
  },
  // True / False (Benar / Salah) styles
  trueFalseContainer: {
    gap: 12,
  },
  trueFalseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  trueFalseCardSelectedBenar: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  trueFalseCardSelectedSalah: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  trueFalseIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trueFalseIconCircleSelectedBenar: {
    backgroundColor: '#D1FAE5',
  },
  trueFalseIconCircleSelectedSalah: {
    backgroundColor: '#FEE2E2',
  },
  trueFalseTextBox: {
    flex: 1,
  },
  trueFalseTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
  },
  trueFalseTitleSelectedBenar: {
    color: '#065F46',
  },
  trueFalseTitleSelectedSalah: {
    color: '#991B1B',
  },
  trueFalseSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },

  // Short Answer (Isian Singkat) styles
  shortAnswerBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shortAnswerPrompt: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },
  shortAnswerInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },

  // Matching (Menjodohkan) styles
  matchingContainer: {
    gap: 14,
  },
  matchingNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
  },
  matchingNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
    lineHeight: 17,
  },
  matchingPairCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  matchingLeftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  matchingLeftIndexBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchingLeftIndexText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  matchingLeftText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  matchingDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 2,
  },
  matchingDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  matchingDividerLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  matchingPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  matchingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  matchingPillSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  matchingPillDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.5,
  },
  matchingPillText: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
  },
  matchingPillTextSelected: {
    color: '#065F46',
    fontWeight: '700',
  },
  matchingPillTextDisabled: {
    color: '#94A3B8',
  },
  emptyQuestionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyQuestionText: {
    fontSize: 13,
    color: '#64748B',
  },
  runnerBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderTopColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 5,
    gap: 8,
  },
  runnerNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 4,
  },
  runnerNavBtnDisabled: {
    opacity: 0.45,
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  runnerNavBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#047857',
  },
  runnerNavBtnTextDisabled: {
    color: '#94A3B8',
  },
  runnerNavBtnNext: {
    backgroundColor: '#004D32',
    borderWidth: 0,
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  runnerNavBtnTextNext: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  doubtfulToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  doubtfulToggleBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  doubtfulToggleBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  doubtfulToggleBtnTextActive: {
    color: '#B45309',
  },
  finishBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  finishBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },

  // Question Palette Styles
  paletteModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  paletteModalContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  paletteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  paletteTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  paletteScroll: {
    maxHeight: 320,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
    paddingVertical: 4,
  },
  paletteItem: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  paletteItemAnswered: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  paletteItemDoubtful: {
    backgroundColor: '#F59E0B',
    borderColor: '#D97706',
  },
  paletteItemCurrent: {
    borderWidth: 2.5,
    borderColor: '#0F172A',
  },
  paletteItemText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  paletteItemTextAnswered: {
    color: '#FFFFFF',
  },
  paletteDoubtfulDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  paletteLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  paletteLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  paletteLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  paletteLegendText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  finishBtnPalette: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18A165',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  finishBtnPaletteText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Exam Result Modal Styles
  resultModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resultModalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  resultIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#A7F3D0',
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  resultSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 18,
  },
  resultScoreCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  resultScoreLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  resultScoreValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#18A165',
    marginBottom: 4,
  },
  resultKkmText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  resultStatsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  resultStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  resultStatVal: {
    fontSize: 16,
    fontWeight: '900',
  },
  resultStatLbl: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  scorePendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 14,
    borderRadius: 14,
    gap: 10,
    marginBottom: 20,
  },
  scorePendingText: {
    fontSize: 11.5,
    color: '#0369A1',
    flex: 1,
    lineHeight: 16,
    fontWeight: '600',
  },
  resultCloseBtn: {
    width: '100%',
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  resultCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
