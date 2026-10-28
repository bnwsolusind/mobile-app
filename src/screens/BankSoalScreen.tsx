import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuthStore } from '../stores/authStore';
import { getApiErrorMessage } from '../services/api';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
  getStudentAvatarSource,
  isGirlStudent,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { useDebounce } from '../hooks/useDebounce';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { TeacherStickyHeader } from '../components/TeacherStickyHeader';
import { TeacherHeroCard } from '../components/TeacherHeroCard';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';

import { isParentRole, isStudentRole, isTeacherRole, isTuRole, isPrincipalRole, isSuperAdminRole } from '../utils/roles';
import TeacherBankSoalWorkspace from '../components/teacher/TeacherBankSoalWorkspace';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;
const STUDENT_CARD_WIDTH = Math.round(SCREEN_WIDTH - (STUDENT_PEEK_WIDTH * 2) - STUDENT_CARD_GAP);
const STUDENT_SNAP_INTERVAL = STUDENT_CARD_WIDTH + STUDENT_CARD_GAP;

export type BankSoalItem = {
  id: string;
  kode_soal?: string;
  pertanyaan: string;
  tipe_soal: string;
  opsi_a?: string;
  opsi_b?: string;
  opsi_c?: string;
  opsi_d?: string;
  opsi_e?: string;
  kunci_jawaban?: string;
  pembahasan?: string;
  poin?: number;
  tingkat_kesulitan?: string;
  indikator?: string;
  gambar_path?: string;
  mata_pelajaran_id?: string;
  created_at?: string;
  updated_at?: string;
  user_answer?: string;
  is_completed?: boolean;
  subject?: { id?: string; name?: string; code?: string };
  kisi_kisi?: {
    id?: string;
    judul_kisi?: string;
    jenis_ujian?: string;
    created_at?: string;
    tanggal_ujian?: string;
    guru?: { id?: string; name?: string; nama_lengkap?: string; full_name?: string };
    kelas?: { id?: string; name?: string; nama_kelas?: string };
  };
};

export type SubjectGroup = {
  id: string;
  name: string;
  code?: string;
  questionsCount: number;
  questions: BankSoalItem[];
  teacherName?: string;
};

export default function BankSoalScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const userRoles = useMemo(() => (roles?.length ? roles : user?.roles || []), [roles, user?.roles]);
  const isParent = isParentRole(userRoles);
  const isTeacher = isTeacherRole(userRoles);
  const isStaff = isTuRole(userRoles) || isPrincipalRole(userRoles) || isSuperAdminRole(userRoles);
  const isTeacherOrStaff = isTeacher || isStaff;

  if (isTeacherOrStaff) {
    return <TeacherBankSoalWorkspace navigation={navigation} route={route} />;
  }

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

  // ── Sticky header bersama ──
  const isTeacherOnly = false;
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const { scrollY, handleMainScroll } = useStickyScroll();
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  // ── Loop carousel (identik pola ScheduleScreen) ──
  const studentCardWidth = useMemo(() => {
    return children.length > 1
      ? SCREEN_WIDTH - 16 - STUDENT_CARD_GAP - STUDENT_PEEK_WIDTH
      : SCREEN_WIDTH - 32;
  }, [children.length]);
  const studentSnapInterval = useMemo(() => studentCardWidth + STUDENT_CARD_GAP, [studentCardWidth]);
  const studentTrackPad = useMemo(() => (SCREEN_WIDTH - studentCardWidth) / 2, [studentCardWidth]);
  const studentLoopCount = children.length > 1 ? children.length : 0;
  const safeCenter = studentLoopCount === 0
    ? 0
    : ((activeChildIndex % studentLoopCount) + studentLoopCount) % studentLoopCount;
  const loopWindow = useMemo(() => {
    if (studentLoopCount === 0) return { list: children, realIdx: [0] };
    const n = studentLoopCount;
    const prev = (safeCenter - 1 + n) % n;
    const next = (safeCenter + 1) % n;
    return { list: [children[prev], children[safeCenter], children[next]], realIdx: [prev, safeCenter, next] };
  }, [children, studentLoopCount, safeCenter]);
  const centerLoopOffset = studentSnapInterval;
  const recenterLoop = (): void => {
    if (studentLoopCount === 0) return;
    studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
  };
  const syncLoopChildId = (realIdx: number): void => {
    const selChild = children[realIdx];
    const sid = selChild?.id || selChild?.student_id;
    if (sid) {
      const strSid = String(sid);
      setSelectedChildId(strSid);
      useActiveChildStore.getState().setActiveChildId(strSid);
      setSelectedSubjectModal(null);
    }
  };
  const goToLoopChild = useCallback((target: number): void => {
    if (studentLoopCount === 0) return;
    const n = studentLoopCount;
    const cur = ((activeChildIndex % n) + n) % n;
    const tgt = ((target % n) + n) % n;
    if (tgt === cur) { recenterLoop(); return; }
    const fwd = (tgt - cur + n) % n;
    if (fwd === 1) {
      setActiveChildIndex(tgt); syncLoopChildId(tgt);
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset * 2, animated: true }); return;
    }
    if (fwd === n - 1) {
      setActiveChildIndex(tgt); syncLoopChildId(tgt);
      studentScrollRef.current?.scrollTo({ x: 0, animated: true }); return;
    }
    setActiveChildIndex(tgt); syncLoopChildId(tgt); recenterLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentLoopCount, activeChildIndex, centerLoopOffset, children]);

  // ── Animated fade card on scroll ──
  const bodyCardOpacity = useMemo(() => scrollY.interpolate({ inputRange: [45, 105], outputRange: [1, 0], extrapolate: 'clamp' }), [scrollY]);
  const bodyCardTranslateY = useMemo(() => scrollY.interpolate({ inputRange: [45, 105], outputRange: [0, -16], extrapolate: 'clamp' }), [scrollY]);

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

  const openIdCard = (student: any) => setSelectedIdCardStudent(student);
  const openQrCard = (student: any) => setSelectedQrStudent(student);
  const openMenuModal = (student: any) => setSelectedMenuStudent(student);
  const openWeeklyReport = (student: any) => setSelectedWeeklyStudent(student);

  // ── Data & Subject States ──
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<BankSoalItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 350);
  const [selectedSubjectModal, setSelectedSubjectModal] = useState<SubjectGroup | null>(null);

  // ── Filter States (Mapel, Tanggal, Belum Dikerjakan) ──
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all');
  const [customSelectedDate, setCustomSelectedDate] = useState<string | null>(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'uncompleted' | 'completed'>('all');

  // Filter Modals & Calendar
  const [showSubjectFilterModal, setShowSubjectFilterModal] = useState(false);
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(() => new Date());

  // Modal Questions Filter (Semua Soal vs Belum Dikerjakan)
  const [modalFilterStatus, setModalFilterStatus] = useState<'all' | 'uncompleted'>('all');

  // Interactive study mode: tracking user selected option and revealed answers
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [revealedSolutions, setRevealedSolutions] = useState<Record<string, boolean>>({});

  // Muat riwayat jawaban tersimpan (persistent) untuk siswa yang aktif
  useEffect(() => {
    const targetChild = isParent ? selectedChildId : (user as any)?.student?.id || user?.id;
    if (!targetChild) return;
    const ansCacheKey = offlineCache.buildKey('bank_soal_answers', user?.id, String(targetChild));
    let isMounted = true;
    void (async () => {
      const saved = await offlineCache.get<Record<string, string>>(ansCacheKey);
      if (isMounted && saved && typeof saved === 'object') {
        setSelectedAnswers(saved);
      } else if (isMounted) {
        setSelectedAnswers({});
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [isParent, selectedChildId, user?.id]);

  // Reset modal jika siswa berganti
  useEffect(() => {
    setRevealedSolutions({});
    setSelectedSubjectModal(null);
    setModalFilterStatus('all');
  }, [selectedChildId]);

  // 1. Load Children if parent with offline cache
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id || route?.params?.student_id || globalActiveChildId;
      const childCacheKey = offlineCache.buildKey('bank_soal_children', user?.id);
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
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, globalActiveChildId]);

  // 2. Fetch Bank Soal Questions
  const loadBankSoal = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);

    const targetChild = isParent ? selectedChildId : undefined;
    const cacheKey = offlineCache.buildKey('bank_soal_list', user?.id, targetChild || 'self');

    const cached = await offlineCache.get<{ questions: BankSoalItem[]; student: any }>(cacheKey);
    if (cached && !isRefresh) {
      setQuestions(cached.questions || []);
      if (cached.student) setStudentInfo(cached.student);
      setLoading(false);
    }

    try {
      const response = isTeacher
        ? await mobileApiService.getTeacherBankSoal({ per_page: 50 })
        : await mobileApiService.getPortalBankSoal(targetChild, { per_page: 50 });
      let items: BankSoalItem[] = [];
      let studentData: any = null;

      if (response && response.data) {
        if (Array.isArray(response.data)) {
          items = response.data;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          items = response.data.data;
        }
        studentData = response.student || response.data.student || null;
      }

      setQuestions(items);
      if (studentData) setStudentInfo(studentData);
      void offlineCache.set(cacheKey, { questions: items, student: studentData });
    } catch (err: any) {
      console.log('Error fetching bank soal:', err);
      if (!cached) {
        setError(getApiErrorMessage(err, 'Gagal memuat bank soal dan latihan.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isParent, selectedChildId, user?.id]);

  useEffect(() => {
    void loadBankSoal();
  }, [loadBankSoal]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadBankSoal(true);
  }, [loadBankSoal]);

  // Active student display
  const activeStudent = useMemo(() => {
    if (isParent && children.length > 0) {
      return children.find((c) => String(c.id || c.student_id) === String(selectedChildId)) || children[0];
    }
    return studentInfo || (user as any)?.student || user;
  }, [isParent, children, selectedChildId, studentInfo, user]);

  const { displayName, nis: resolvedNis, unit: resolvedUnit, kelas: resolvedClass } = useMemo(
    () => resolveStudentDisplay(activeStudent, user),
    [activeStudent, user]
  );
  const resolvedName = displayName;

  const [showChildSelectorModal, setShowChildSelectorModal] = useState(false);

  const activeStudentGender = useMemo(() => {
    const raw = String(activeStudent?.gender || activeStudent?.jenis_kelamin || '').toLowerCase();
    if (raw.includes('p') || raw.includes('wanita') || raw.includes('perempuan') || raw.includes('female')) {
      return 'female';
    }
    return 'male';
  }, [activeStudent]);

  const studentAvatarSource = useMemo(() => {
    return getStudentAvatarSource(activeStudent);
  }, [activeStudent]);

  const studentFullName = useMemo(() => {
    return String(resolvedName || 'Nama Santri');
  }, [resolvedName]);

  const studentUnit = useMemo(() => {
    return String(resolvedUnit || 'Unit Pendidikan');
  }, [resolvedUnit]);

  const studentClass = useMemo(() => {
    return String(resolvedClass || 'Kelas');
  }, [resolvedClass]);

  // Resolusi Dinamis Status Kehadiran Siswa Hari Ini — Single Source of Truth selaras dengan HomeScreen
  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(activeStudent);
  }, [activeStudent]);

  // ── Helper: Cek Status Pengerjaan Butir Soal ──
  const isQuestionCompleted = useCallback(
    (q: BankSoalItem): boolean => {
      if (Boolean(selectedAnswers[q.id])) return true;
      if (Boolean(q.user_answer) || Boolean(q.is_completed)) return true;
      return false;
    },
    [selectedAnswers]
  );

  // ── Helper: Cek Filter Rentang Tanggal ──
  const isQuestionInDateRange = useCallback(
    (q: BankSoalItem): boolean => {
      if (selectedDateFilter === 'all') return true;
      const rawDate = q.created_at || q.kisi_kisi?.created_at || q.kisi_kisi?.tanggal_ujian;
      if (!rawDate) return true;
      const qDate = new Date(rawDate);
      if (isNaN(qDate.getTime())) return true;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const qTime = qDate.getTime();

      if (selectedDateFilter === 'today') {
        return qTime >= todayStart;
      }
      if (selectedDateFilter === '7days') {
        const sevenDaysAgo = todayStart - 7 * 24 * 60 * 60 * 1000;
        return qTime >= sevenDaysAgo;
      }
      if (selectedDateFilter === '30days') {
        const thirtyDaysAgo = todayStart - 30 * 24 * 60 * 60 * 1000;
        return qTime >= thirtyDaysAgo;
      }
      if (selectedDateFilter === 'custom' && customSelectedDate) {
        const [y, m, d] = customSelectedDate.split('-').map(Number);
        const targetStart = new Date(y, m - 1, d).getTime();
        const targetEnd = targetStart + 24 * 60 * 60 * 1000;
        return qTime >= targetStart && qTime < targetEnd;
      }
      return true;
    },
    [selectedDateFilter, customSelectedDate]
  );

  // ── Helper: Cek Filter Status Belum Dikerjakan vs Selesai ──
  const isQuestionInStatusRange = useCallback(
    (q: BankSoalItem): boolean => {
      if (selectedStatusFilter === 'all') return true;
      const completed = isQuestionCompleted(q);
      if (selectedStatusFilter === 'uncompleted') return !completed;
      if (selectedStatusFilter === 'completed') return completed;
      return true;
    },
    [selectedStatusFilter, isQuestionCompleted]
  );

  // ── Daftar Seluruh Mata Pelajaran (Untuk Modal Filter Mapel) ──
  const allSubjectsList = useMemo(() => {
    const map = new Map<string, { name: string; count: number; uncompletedCount: number }>();
    questions.forEach((q) => {
      const sName = q.subject?.name || q.kisi_kisi?.judul_kisi || 'Mata Pelajaran Umum';
      if (!map.has(sName)) {
        map.set(sName, { name: sName, count: 0, uncompletedCount: 0 });
      }
      const item = map.get(sName)!;
      item.count += 1;
      if (!isQuestionCompleted(q)) {
        item.uncompletedCount += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [questions, isQuestionCompleted]);

  // ── Subject Groups Calculation (Sesuai Siswa Aktif) ──
  const subjectGroups = useMemo<SubjectGroup[]>(() => {
    const map = new Map<string, SubjectGroup>();
    questions.forEach((q) => {
      const sName = q.subject?.name || q.kisi_kisi?.judul_kisi || 'Mata Pelajaran Umum';
      const sId = q.mata_pelajaran_id || q.subject?.id || sName;
      const sCode = q.subject?.code;
      const teacher = q.kisi_kisi?.guru?.nama_lengkap || q.kisi_kisi?.guru?.name;

      if (!map.has(sId)) {
        map.set(sId, {
          id: sId,
          name: sName,
          code: sCode,
          questionsCount: 0,
          questions: [],
          teacherName: teacher,
        });
      }

      const grp = map.get(sId)!;
      grp.questionsCount += 1;
      grp.questions.push(q);
      if (!grp.teacherName && teacher) grp.teacherName = teacher;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [questions]);

  // ── Filtered Subject Groups (Mapel, Tanggal, Belum Dikerjakan, dan Pencarian) ──
  const filteredSubjectGroups = useMemo(() => {
    const map = new Map<string, SubjectGroup>();

    questions.forEach((q) => {
      const sName = q.subject?.name || q.kisi_kisi?.judul_kisi || 'Mata Pelajaran Umum';
      const sId = q.mata_pelajaran_id || q.subject?.id || sName;
      const sCode = q.subject?.code;
      const teacher = q.kisi_kisi?.guru?.nama_lengkap || q.kisi_kisi?.guru?.name;

      // 1. Filter Mapel
      if (selectedSubjectFilter !== 'all' && sName !== selectedSubjectFilter && sId !== selectedSubjectFilter) {
        return;
      }

      // 2. Filter Tanggal
      if (!isQuestionInDateRange(q)) {
        return;
      }

      // 3. Filter Status Pengerjaan (Belum Dikerjakan / Selesai)
      if (!isQuestionInStatusRange(q)) {
        return;
      }

      // 4. Pencarian Teks (Debounced)
      if (debouncedSearchQuery.trim()) {
        const query = debouncedSearchQuery.toLowerCase();
        const matchSubject = sName.toLowerCase().includes(query) || (sCode && sCode.toLowerCase().includes(query));
        const matchTeacher = Boolean(teacher && teacher.toLowerCase().includes(query));
        const matchQuestion =
          (q.pertanyaan || '').toLowerCase().includes(query) ||
          (q.indikator || '').toLowerCase().includes(query);
        if (!matchSubject && !matchTeacher && !matchQuestion) {
          return;
        }
      }

      if (!map.has(sId)) {
        map.set(sId, {
          id: sId,
          name: sName,
          code: sCode,
          questionsCount: 0,
          questions: [],
          teacherName: teacher,
        });
      }

      const grp = map.get(sId)!;
      grp.questionsCount += 1;
      grp.questions.push(q);
      if (!grp.teacherName && teacher) grp.teacherName = teacher;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [
    questions,
    selectedSubjectFilter,
    isQuestionInDateRange,
    isQuestionInStatusRange,
    debouncedSearchQuery,
  ]);

  // ── Ringkasan KPI Real-Time ──
  const stats = useMemo(() => {
    const totalSubjects = subjectGroups.length;
    const totalQuestions = questions.length;
    const completedCount = questions.filter(isQuestionCompleted).length;
    const uncompletedCount = Math.max(0, totalQuestions - completedCount);
    const progressPercent = totalQuestions > 0 ? Math.round((completedCount / totalQuestions) * 100) : 0;
    return {
      totalSubjects,
      totalQuestions,
      completedCount,
      uncompletedCount,
      progressPercent,
    };
  }, [subjectGroups.length, questions, isQuestionCompleted]);

  // Indikator apakah ada filter aktif
  const hasActiveFilters = useMemo(() => {
    return (
      selectedSubjectFilter !== 'all' ||
      selectedDateFilter !== 'all' ||
      selectedStatusFilter !== 'all' ||
      Boolean(debouncedSearchQuery.trim())
    );
  }, [selectedSubjectFilter, selectedDateFilter, selectedStatusFilter, debouncedSearchQuery]);

  // Reset Seluruh Filter
  const handleResetAllFilters = useCallback(() => {
    setSelectedSubjectFilter('all');
    setSelectedDateFilter('all');
    setCustomSelectedDate(null);
    setSelectedStatusFilter('all');
    setSearchQuery('');
  }, []);

  // Toggle user answer selection with persistent offline cache
  const handleSelectOption = (questionId: string, optionKey: string) => {
    setSelectedAnswers((prev) => {
      const next = {
        ...prev,
        [questionId]: optionKey,
      };
      const targetChild = isParent ? selectedChildId : (user as any)?.student?.id || user?.id;
      if (targetChild) {
        const ansCacheKey = offlineCache.buildKey('bank_soal_answers', user?.id, String(targetChild));
        void offlineCache.set(ansCacheKey, next);
      }
      return next;
    });
  };

  // Toggle solution reveal
  const toggleSolution = (questionId: string) => {
    setRevealedSolutions((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  // Tema Ikon & Warna Mapel
  const getSubjectTheme = (name: string) => {
    const lower = (name || '').toLowerCase();
    if (lower.includes('agama') || lower.includes('pai') || lower.includes('tahfizh') || lower.includes('qur') || lower.includes('fiqih') || lower.includes('hadis')) {
      return { icon: 'book-open-page-variant-outline', bg: '#ECFDF5', border: '#A7F3D0', color: '#047857' };
    }
    if (lower.includes('matematika') || lower.includes('hitung') || lower.includes('aljabar')) {
      return { icon: 'calculator-variant-outline', bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8' };
    }
    if (lower.includes('bahasa') || lower.includes('inggris') || lower.includes('arab') || lower.includes('indonesia')) {
      return { icon: 'translate', bg: '#FAF5FF', border: '#E9D5FF', color: '#7E22CE' };
    }
    if (lower.includes('ipa') || lower.includes('fisika') || lower.includes('biologi') || lower.includes('kimia') || lower.includes('sains')) {
      return { icon: 'flask-outline', bg: '#F0FDF4', border: '#BBF7D0', color: '#15803D' };
    }
    if (lower.includes('ips') || lower.includes('sejarah') || lower.includes('geografi') || lower.includes('ekonomi') || lower.includes('sosial')) {
      return { icon: 'earth', bg: '#FFF7ED', border: '#FED7AA', color: '#C2410C' };
    }
    return { icon: 'notebook-outline', bg: '#F0FDFA', border: '#99F6E4', color: '#0F766E' };
  };

  return (
    <View style={styles.container}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK HALAMAN JADWAL & UTAMA, JERNIH & CRISP) ── */}
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
          Bank Soal & Latihan
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
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#0E5C44"
              colors={['#0E5C44', '#10B981']}
            />
          }
        >
          <View style={styles.cleanScrollInner}>
            {/* ── Data Ananda / Card Siswa / Teacher Hero Card ── */}
            <View style={styles.bodyContentWrapper}>
              {isTeacherOnly ? (
                <TeacherHeroCard
                  title={String((user as any)?.name || (user as any)?.username || 'Guru Pengajar')}
                  badgeText="Bank Soal Guru"
                  badgeIcon="database-outline"
                  stats={[
                    {
                      label: 'Total Soal',
                      value: questions.length,
                      icon: 'database-outline',
                      color: '#10B981',
                    },
                    {
                      label: 'Mata Pelajaran',
                      value: subjectGroups.length,
                      icon: 'book-open-page-variant',
                      color: '#38BDF8',
                    },
                    {
                      label: 'Latihan CBT',
                      value: stats.totalSubjects,
                      icon: 'checkbox-marked-circle-outline',
                      color: '#A7F3D0',
                    },
                  ]}
                />
              ) : (
                /* OPEN STUDENT PROFILE ROW (GOLD STANDARD) */
                <View style={styles.studentProfileRow}>
                  {/* 60x60 Avatar with Mint Ring (Klik untuk lihat KTS Siswa Terpilih) */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedIdCardStudent(activeStudent)}
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
                          {studentClass.toLowerCase().startsWith('kelas') ? studentClass : `Kelas ${studentClass}`}
                        </Text>
                      </View>
                    ) : null}

                    {/* Baris Aksi: Tombol Ganti Siswa + Lencana Status Kehadiran */}
                    <View style={styles.studentActionBadgeRow}>
                      {children && children.length > 1 && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setShowChildSelectorModal(true)}
                          style={styles.parentGantiAnakBtn}
                        >
                          <Text style={styles.parentGantiAnakBtnText}>Ganti Siswa</Text>
                          <MaterialCommunityIcons name="chevron-down" size={14} color="#FFFFFF" />
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
              )}

              {/* ── HERO KPI GROUP CARD (TAILGRIDS SCREEN STYLE) ── */}
              <View style={[styles.bankSoalGroupCard, { marginTop: 6 }]}>
                <LinearGradient
                  colors={['#059669', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.bankSoalGroupHeaderGradient}
                >
                  <View style={styles.bankSoalGroupHeaderLeft}>
                    <View style={styles.bankSoalGroupHeaderIconBoxWhite}>
                      <MaterialCommunityIcons name="database-outline" size={18} color="#047857" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.bankSoalGroupTitleWhite}>
                        Bank Soal & Latihan Mandiri
                      </Text>
                      <Text numberOfLines={1} style={styles.bankSoalGroupSubWhite}>
                        Akses butir soal terkurasi per bidang studi
                      </Text>
                    </View>
                  </View>
                  <View style={styles.bankSoalGroupBadge}>
                    <MaterialCommunityIcons name="check-decagram" size={12} color="#047857" style={{ marginRight: 3 }} />
                    <Text style={styles.bankSoalGroupBadgeText}>
                      {stats.totalQuestions} Soal
                    </Text>
                  </View>
                </LinearGradient>

                {/* 2 Kolom KPI Atas: Mata Pelajaran & Total Butir Soal (Lega & Rapi) */}
                <View style={styles.kpiRowModern}>
                  {/* Card 1: Mata Pelajaran */}
                  <View style={[styles.kpiCardModern, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#D1FAE5' }]}>
                      <MaterialCommunityIcons name="book-open-page-variant-outline" size={20} color="#047857" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={1} style={styles.kpiLabelModern}>Mata Pelajaran</Text>
                      <Text style={[styles.kpiValueModern, { color: '#047857' }]}>{stats.totalSubjects}</Text>
                      <Text numberOfLines={1} style={styles.kpiSubModern}>Total Bidang Studi</Text>
                    </View>
                  </View>

                  {/* Card 2: Total Butir Soal */}
                  <View style={[styles.kpiCardModern, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#E0F2FE' }]}>
                      <MaterialCommunityIcons name="file-document-edit-outline" size={20} color="#0284C7" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={1} style={styles.kpiLabelModern}>Total Butir Soal</Text>
                      <Text style={[styles.kpiValueModern, { color: '#0284C7' }]}>{stats.totalQuestions}</Text>
                      <Text numberOfLines={1} style={styles.kpiSubModern}>{stats.completedCount} Selesai Dikerjakan</Text>
                    </View>
                  </View>
                </View>

                {/* Banner Bawah: Status Pengerjaan & Progress Bar Interaktif */}
                <View style={styles.kpiProgressBannerWrapper}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setSelectedStatusFilter((prev) => (prev === 'uncompleted' ? 'all' : 'uncompleted'))}
                    style={[
                      styles.kpiProgressBanner,
                      stats.uncompletedCount > 0
                        ? selectedStatusFilter === 'uncompleted'
                          ? styles.kpiProgressBannerAmberActive
                          : styles.kpiProgressBannerAmber
                        : styles.kpiProgressBannerEmerald,
                    ]}
                  >
                    <View style={styles.kpiProgressBannerTop}>
                      <View style={styles.kpiProgressBannerLeft}>
                        <View
                          style={[
                            styles.kpiStatusIconBox,
                            {
                              backgroundColor: stats.uncompletedCount > 0 ? '#FEF3C7' : '#D1FAE5',
                            },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={stats.uncompletedCount > 0 ? 'clock-alert-outline' : 'check-decagram'}
                            size={18}
                            color={stats.uncompletedCount > 0 ? '#D97706' : '#059669'}
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text numberOfLines={1} style={styles.kpiProgressBannerTitle}>
                            {stats.uncompletedCount > 0
                              ? `${stats.uncompletedCount} Soal Belum Dikerjakan`
                              : 'Semua Soal Latihan Selesai! 🎉'}
                          </Text>
                          <Text numberOfLines={1} style={styles.kpiProgressBannerSub}>
                            {stats.completedCount} dari {stats.totalQuestions} butir soal selesai ({stats.progressPercent}%)
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.kpiProgressFilterPill,
                          selectedStatusFilter === 'uncompleted' && styles.kpiProgressFilterPillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.kpiProgressFilterPillText,
                            selectedStatusFilter === 'uncompleted' && styles.kpiProgressFilterPillTextActive,
                          ]}
                        >
                          {selectedStatusFilter === 'uncompleted' ? 'Filter Aktif' : 'Tampilkan Belum'}
                        </Text>
                        <MaterialCommunityIcons
                          name={selectedStatusFilter === 'uncompleted' ? 'check' : 'chevron-right'}
                          size={13}
                          color={selectedStatusFilter === 'uncompleted' ? '#FFFFFF' : '#B45309'}
                        />
                      </View>
                    </View>

                    {/* Mini Progress Bar */}
                    <View style={styles.kpiMiniProgressBarBg}>
                      <View
                        style={[
                          styles.kpiMiniProgressBarFill,
                          {
                            width: `${Math.min(Math.max(stats.progressPercent, 0), 100)}%`,
                            backgroundColor: stats.uncompletedCount === 0 ? '#059669' : '#10B981',
                          },
                        ]}
                      />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Search Bar (TailGrids Emerald Style) */}
              <View style={styles.searchContainerModern}>
                <MaterialCommunityIcons name="magnify" size={20} color="#059669" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInputModern}
                  placeholder="Cari mata pelajaran atau butir soal..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* ── FILTER SECTION (STATUS PENGERJAAN, MAPEL, TANGGAL) ── */}
              <View style={styles.filterSectionContainer}>
                {/* Baris 1: Filter Cepat Status Pengerjaan */}
                {/* Baris 1: Filter Cepat Status Pengerjaan (Pill Horizontal Scrollable) */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.statusFilterScrollContent}
                  style={styles.statusFilterScroll}
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedStatusFilter('all')}
                    style={[
                      styles.statusFilterChip,
                      selectedStatusFilter === 'all' && styles.statusFilterChipActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="layers-outline"
                      size={14}
                      color={selectedStatusFilter === 'all' ? '#047857' : '#64748B'}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.statusFilterChipText,
                        selectedStatusFilter === 'all' && styles.statusFilterChipTextActive,
                      ]}
                    >
                      Semua ({stats.totalQuestions})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedStatusFilter('uncompleted')}
                    style={[
                      styles.statusFilterChip,
                      selectedStatusFilter === 'uncompleted' && styles.statusFilterChipAmberActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="clock-alert-outline"
                      size={14}
                      color={selectedStatusFilter === 'uncompleted' ? '#B45309' : '#D97706'}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.statusFilterChipText,
                        selectedStatusFilter === 'uncompleted' && styles.statusFilterChipAmberTextActive,
                      ]}
                    >
                      Belum Dikerjakan ({stats.uncompletedCount})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedStatusFilter('completed')}
                    style={[
                      styles.statusFilterChip,
                      selectedStatusFilter === 'completed' && styles.statusFilterChipEmeraldActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="checkbox-marked-circle-outline"
                      size={14}
                      color={selectedStatusFilter === 'completed' ? '#047857' : '#059669'}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.statusFilterChipText,
                        selectedStatusFilter === 'completed' && styles.statusFilterChipEmeraldTextActive,
                      ]}
                    >
                      Selesai ({stats.completedCount})
                    </Text>
                  </TouchableOpacity>
                </ScrollView>

                {/* Baris 2: Dropdown Filter Mapel & Tanggal */}
                <View style={styles.dropdownFiltersRow}>
                  {/* Dropdown Filter Mapel */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowSubjectFilterModal(true)}
                    style={[
                      styles.filterDropdownBtn,
                      selectedSubjectFilter !== 'all' && styles.filterDropdownBtnActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="book-open-variant"
                      size={15}
                      color={selectedSubjectFilter !== 'all' ? '#047857' : '#065F46'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.filterDropdownBtnText,
                        selectedSubjectFilter !== 'all' && styles.filterDropdownBtnTextActive,
                      ]}
                    >
                      {selectedSubjectFilter === 'all' ? 'Semua Mapel' : selectedSubjectFilter}
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-down"
                      size={16}
                      color={selectedSubjectFilter !== 'all' ? '#047857' : '#065F46'}
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>

                  {/* Dropdown Filter Tanggal */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowDateFilterModal(true)}
                    style={[
                      styles.filterDropdownBtn,
                      selectedDateFilter !== 'all' && styles.filterDropdownBtnActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="calendar-month-outline"
                      size={15}
                      color={selectedDateFilter !== 'all' ? '#047857' : '#065F46'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.filterDropdownBtnText,
                        selectedDateFilter !== 'all' && styles.filterDropdownBtnTextActive,
                      ]}
                    >
                      {selectedDateFilter === 'all'
                        ? 'Semua Tanggal'
                        : selectedDateFilter === 'today'
                        ? 'Hari Ini'
                        : selectedDateFilter === '7days'
                        ? '7 Hari Terakhir'
                        : selectedDateFilter === '30days'
                        ? 'Bulan Ini'
                        : customSelectedDate || 'Pilih Tanggal'}
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-down"
                      size={16}
                      color={selectedDateFilter !== 'all' ? '#047857' : '#065F46'}
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>

                  {/* Reset Button jika ada filter aktif */}
                  {hasActiveFilters && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={handleResetAllFilters}
                      style={styles.filterResetBtn}
                    >
                      <MaterialCommunityIcons name="filter-off-outline" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Baris 3: Active Filter Tags */}
                {hasActiveFilters && (
                  <View style={styles.activeFilterPillRow}>
                    <Text style={styles.activeFilterLabelText}>Filter:</Text>
                    {selectedStatusFilter !== 'all' && (
                      <View style={styles.activeFilterTag}>
                        <Text style={styles.activeFilterTagText}>
                          Status: {selectedStatusFilter === 'uncompleted' ? 'Belum Dikerjakan' : 'Selesai'}
                        </Text>
                        <TouchableOpacity onPress={() => setSelectedStatusFilter('all')}>
                          <MaterialCommunityIcons name="close" size={12} color="#047857" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      </View>
                    )}
                    {selectedSubjectFilter !== 'all' && (
                      <View style={styles.activeFilterTag}>
                        <Text style={styles.activeFilterTagText}>Mapel: {selectedSubjectFilter}</Text>
                        <TouchableOpacity onPress={() => setSelectedSubjectFilter('all')}>
                          <MaterialCommunityIcons name="close" size={12} color="#047857" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      </View>
                    )}
                    {selectedDateFilter !== 'all' && (
                      <View style={styles.activeFilterTag}>
                        <Text style={styles.activeFilterTagText}>
                          Tanggal:{' '}
                          {selectedDateFilter === 'today'
                            ? 'Hari Ini'
                            : selectedDateFilter === '7days'
                            ? '7 Hari'
                            : selectedDateFilter === '30days'
                            ? 'Bulan Ini'
                            : customSelectedDate}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedDateFilter('all');
                            setCustomSelectedDate(null);
                          }}
                        >
                          <MaterialCommunityIcons name="close" size={12} color="#047857" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>

            {/* Section Header */}
            <View style={styles.listHeaderRow}>
              <View style={styles.listTitleCol}>
                <Text style={styles.listTitle}>Daftar Mata Pelajaran</Text>
                <Text style={styles.listSubtitle}>
                  {hasActiveFilters
                    ? `Menampilkan ${filteredSubjectGroups.length} mapel tersaring`
                    : 'Pilih mata pelajaran untuk mulai latihan'}
                </Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{filteredSubjectGroups.length} Mapel</Text>
              </View>
            </View>

            {/* Content States */}
            {loading && !refreshing ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0E5C44" />
                <Text style={styles.loadingText}>Memuat materi latihan...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle-outline" size={42} color="#EF4444" />
                <Text style={styles.errorTitle}>Gagal Memuat Data</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => loadBankSoal(true)} style={styles.retryBtn}>
                  <Text style={styles.retryBtnText}>Coba Lagi</Text>
                </TouchableOpacity>
              </View>
            ) : filteredSubjectGroups.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <MaterialCommunityIcons name="book-open-page-variant-outline" size={44} color="#0D6B42" />
                </View>
                <Text style={styles.emptyTitle}>
                  {selectedStatusFilter === 'uncompleted'
                    ? 'Semua Soal Sudah Selesai!'
                    : 'Belum Ada Soal Latihan'}
                </Text>
                <Text style={styles.emptyDesc}>
                  {selectedStatusFilter === 'uncompleted'
                    ? 'Alhamdulillah! Seluruh butir soal latihan sudah selesai kamu kerjakan pada kriteria filter ini.'
                    : hasActiveFilters
                    ? 'Tidak ditemukan butir soal yang sesuai dengan kombinasi filter yang dipilih.'
                    : `Guru belum mengunggah butir soal latihan untuk kelas ini (${resolvedClass || 'Semua Kelas'}).`}
                </Text>
                {hasActiveFilters && (
                  <TouchableOpacity onPress={handleResetAllFilters} style={styles.resetFilterBtn}>
                    <Text style={styles.resetFilterBtnText}>Reset Seluruh Filter</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filteredSubjectGroups.map((group) => {
                const theme = getSubjectTheme(group.name);
                const uncompletedInGroup = group.questions.filter((q) => !isQuestionCompleted(q)).length;
                const isGroupAllDone = uncompletedInGroup === 0 && group.questionsCount > 0;

                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[styles.subjectCard, { borderColor: theme.border }]}
                    activeOpacity={0.88}
                    onPress={() => setSelectedSubjectModal(group)}
                  >
                    <View style={[styles.subjectIconBox, { backgroundColor: theme.bg }]}>
                      <MaterialCommunityIcons name={theme.icon as any} size={26} color={theme.color} />
                    </View>

                    <View style={styles.subjectInfoCol}>
                      <Text style={styles.subjectCardTitle} numberOfLines={2}>
                        {group.name}
                      </Text>
                      {Boolean(group.teacherName) && (
                        <View style={styles.subjectTeacherRow}>
                          <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                          <Text style={styles.subjectTeacherText} numberOfLines={1}>
                            Penyusun: {group.teacherName}
                          </Text>
                        </View>
                      )}

                      <View style={styles.subjectBadgeRow}>
                        <View style={[styles.subjectCountBadge, { backgroundColor: theme.bg }]}>
                          <MaterialCommunityIcons name="file-document-edit-outline" size={12} color={theme.color} style={{ marginRight: 3 }} />
                          <Text style={[styles.subjectCountBadgeText, { color: theme.color }]}>
                            {group.questionsCount} Soal
                          </Text>
                        </View>

                        {isGroupAllDone ? (
                          <View style={styles.subjectDoneBadge}>
                            <MaterialCommunityIcons name="check-circle" size={11} color="#059669" style={{ marginRight: 3 }} />
                            <Text style={styles.subjectDoneBadgeText}>Selesai</Text>
                          </View>
                        ) : uncompletedInGroup > 0 ? (
                          <View style={styles.subjectPendingBadge}>
                            <MaterialCommunityIcons name="clock-alert-outline" size={11} color="#D97706" style={{ marginRight: 3 }} />
                            <Text style={styles.subjectPendingBadgeText}>{uncompletedInGroup} Belum</Text>
                          </View>
                        ) : null}

                        {Boolean(group.code) && (
                          <View style={styles.subjectCodeBadge}>
                            <Text style={styles.subjectCodeBadgeText}>{group.code}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.subjectArrowWrap}>
                      <View style={[styles.subjectActionSquircle, { backgroundColor: theme.bg }]}>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.color} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            </View>
          </View>
        </Animated.ScrollView>
      </View>

      {/* ── Modal Latihan Soal Interaktif (TailGrids Modern Style) ── */}
      <Modal
        visible={Boolean(selectedSubjectModal)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedSubjectModal(null)}
      >
        <View style={styles.modalRootContainer}>
          {/* Modal Top Bar (TailGrids Modern Style) */}
          <View style={[styles.modalTopBar, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 20 : 14) }]}>
            <View style={styles.modalTopBarRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedSubjectModal(null)}
                style={styles.modalTopBarBackBtn}
                accessibilityRole="button"
                accessibilityLabel="Tutup Latihan"
              >
                <MaterialCommunityIcons name="close" size={20} color="#004D32" />
              </TouchableOpacity>

              <View style={styles.modalTopBarCenterCol}>
                <Text numberOfLines={1} style={styles.modalTopBarTitle}>
                  {selectedSubjectModal?.name}
                </Text>
                <View style={styles.modalTopBarPill}>
                  <Text numberOfLines={1} style={styles.modalTopBarSubtitle}>
                    {studentFullName} • {selectedSubjectModal?.questionsCount} Soal Latihan
                  </Text>
                </View>
              </View>

              <View style={{ width: 38 }} />
            </View>
          </View>

          {/* Modal Scroll Body (Opsi A: List Vertikal) */}
          <ScrollView
            style={styles.modalScrollBody}
            contentContainerStyle={[styles.modalScrollContent, { paddingBottom: Math.max(bottomInset + 40, 60) }]}
            showsVerticalScrollIndicator={true}
          >
            {/* Notice Banner */}
            <View style={styles.modalNoticeBanner}>
              <MaterialCommunityIcons name="information" size={18} color="#0D9488" style={{ marginRight: 8, marginTop: 1 }} />
              <Text style={styles.modalNoticeText}>
                Ketuk salah satu opsi (A, B, C, D, E) untuk memilih jawaban mandiri. Buka pembahasan untuk mengevaluasi pemahaman konsep secara mendalam.
              </Text>
            </View>

            {/* Modal Questions Calculations & Filter */}
            {(() => {
              const modalQuestions = selectedSubjectModal ? selectedSubjectModal.questions : [];
              const modalCompletedCount = modalQuestions.filter(isQuestionCompleted).length;
              const modalUncompletedCount = modalQuestions.length - modalCompletedCount;
              const displayedModalQuestions =
                modalFilterStatus === 'uncompleted'
                  ? modalQuestions.filter((q) => !isQuestionCompleted(q))
                  : modalQuestions;

              return (
                <>
                  {/* Segmented Filter di dalam Modal: Semua Soal vs Belum Dikerjakan */}
                  <View style={styles.modalFilterSegmentRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setModalFilterStatus('all')}
                      style={[
                        styles.modalFilterTab,
                        modalFilterStatus === 'all' && styles.modalFilterTabActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalFilterTabText,
                          modalFilterStatus === 'all' && styles.modalFilterTabTextActive,
                        ]}
                      >
                        Semua Soal ({modalQuestions.length})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setModalFilterStatus('uncompleted')}
                      style={[
                        styles.modalFilterTab,
                        modalFilterStatus === 'uncompleted' && styles.modalFilterTabActiveAmber,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="clock-alert-outline"
                        size={14}
                        color={modalFilterStatus === 'uncompleted' ? '#B45309' : '#D97706'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.modalFilterTabText,
                          modalFilterStatus === 'uncompleted' && styles.modalFilterTabTextActiveAmber,
                        ]}
                      >
                        Belum Dikerjakan ({modalUncompletedCount})
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Progress Bar Pengerjaan Soal */}
                  <View style={styles.modalProgressCard}>
                    <View style={styles.modalProgressHeader}>
                      <Text style={styles.modalProgressLabel}>Progres Latihan Mandiri</Text>
                      <Text style={styles.modalProgressValue}>
                        {modalCompletedCount} dari {modalQuestions.length} Selesai
                      </Text>
                    </View>
                    <View style={styles.modalProgressBarBg}>
                      <View
                        style={[
                          styles.modalProgressBarFill,
                          {
                            width: `${
                              modalQuestions.length > 0
                                ? Math.round((modalCompletedCount / modalQuestions.length) * 100)
                                : 0
                            }%`,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* State jika seluruh soal telah dikerjakan saat filter uncompleted */}
                  {displayedModalQuestions.length === 0 ? (
                    <View style={styles.modalAllCompletedCard}>
                      <View style={styles.modalAllCompletedIconCircle}>
                        <MaterialCommunityIcons name="trophy-award" size={38} color="#047857" />
                      </View>
                      <Text style={styles.modalAllCompletedTitle}>Alhamdulillah, Hebat!</Text>
                      <Text style={styles.modalAllCompletedDesc}>
                        Seluruh {modalQuestions.length} butir soal latihan pada mata pelajaran ini sudah berhasil kamu selesaikan.
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setModalFilterStatus('all')}
                        style={styles.modalViewAllBtn}
                      >
                        <MaterialCommunityIcons name="eye-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.modalViewAllBtnText}>Tampilkan Semua Soal & Pembahasan</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    displayedModalQuestions.map((item, idx) => {
                      const isSolutionOpen = Boolean(revealedSolutions[item.id]);
                      const userSelectedOption = selectedAnswers[item.id];
                      const isItemAnswered = Boolean(userSelectedOption || item.user_answer || item.is_completed);

                      const options = [
                        { key: 'A', text: item.opsi_a },
                        { key: 'B', text: item.opsi_b },
                        { key: 'C', text: item.opsi_c },
                        { key: 'D', text: item.opsi_d },
                        { key: 'E', text: item.opsi_e },
                      ].filter((o) => Boolean(o.text && o.text.trim()));

                      return (
                        <View key={item.id} style={styles.questionCard}>
                          {/* Card Header (Nomor Soal, Status Pengerjaan, & Poin) */}
                          <View style={styles.cardHeader}>
                            <View style={styles.numberPill}>
                              <Text style={styles.numberPillText}>Soal No. {idx + 1}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {isItemAnswered ? (
                                <View style={styles.questionAnsweredBadge}>
                                  <MaterialCommunityIcons name="check-circle" size={12} color="#047857" style={{ marginRight: 3 }} />
                                  <Text style={styles.questionAnsweredBadgeText}>
                                    Selesai {userSelectedOption ? `(${userSelectedOption})` : ''}
                                  </Text>
                                </View>
                              ) : (
                                <View style={styles.questionUnansweredBadge}>
                                  <MaterialCommunityIcons name="clock-alert-outline" size={12} color="#D97706" style={{ marginRight: 3 }} />
                                  <Text style={styles.questionUnansweredBadgeText}>Belum Dikerjakan</Text>
                                </View>
                              )}
                              <View style={styles.pointsBadge}>
                                <Text style={styles.pointsBadgeText}>{item.poin ?? 10} Poin</Text>
                              </View>
                            </View>
                          </View>

                          {/* Kode Soal jika ada */}
                          {Boolean(item.kode_soal) && (
                            <View style={styles.metaRow}>
                              <Text style={styles.metaCode}>Kode: {item.kode_soal}</Text>
                            </View>
                          )}

                          {/* Teks Pertanyaan */}
                          <Text style={styles.questionText}>{item.pertanyaan}</Text>

                          {/* Opsi Jawaban (A, B, C, D, E) */}
                          {options.length > 0 && (
                            <View style={styles.optionsList}>
                              {options.map((opt) => {
                                const isChosen = userSelectedOption === opt.key;
                                const isCorrectKey = (item.kunci_jawaban || '').toUpperCase() === opt.key;
                                const showCorrectHighlight = isSolutionOpen && isCorrectKey;
                                const showWrongHighlight = isSolutionOpen && isChosen && !isCorrectKey;

                                let optBorder = '#E2E8F0';
                                let optBg = '#FFFFFF';
                                let badgeBg = '#E2E8F0';
                                let badgeText = '#475569';

                                if (isChosen) {
                                  optBorder = '#10B981';
                                  optBg = '#ECFDF5';
                                  badgeBg = '#10B981';
                                  badgeText = '#FFFFFF';
                                }

                                if (showCorrectHighlight) {
                                  optBorder = '#059669';
                                  optBg = '#D1FAE5';
                                  badgeBg = '#059669';
                                  badgeText = '#FFFFFF';
                                } else if (showWrongHighlight) {
                                  optBorder = '#EF4444';
                                  optBg = '#FEE2E2';
                                  badgeBg = '#EF4444';
                                  badgeText = '#FFFFFF';
                                }

                                return (
                                  <TouchableOpacity
                                    key={opt.key}
                                    onPress={() => handleSelectOption(item.id, opt.key)}
                                    style={[styles.optionItem, { borderColor: optBorder, backgroundColor: optBg }]}
                                    activeOpacity={0.75}
                                  >
                                    <View style={[styles.optionKeyCircle, { backgroundColor: badgeBg }]}>
                                      <Text style={[styles.optionKeyText, { color: badgeText }]}>{opt.key}</Text>
                                    </View>
                                    <Text style={styles.optionContentText}>{opt.text}</Text>
                                    {showCorrectHighlight && (
                                      <MaterialCommunityIcons name="check-circle" size={18} color="#059669" style={{ marginLeft: 6 }} />
                                    )}
                                    {showWrongHighlight && (
                                      <MaterialCommunityIcons name="close-circle" size={18} color="#EF4444" style={{ marginLeft: 6 }} />
                                    )}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}

                          {/* Tombol Buka Kunci Jawaban & Pembahasan */}
                          <TouchableOpacity
                            onPress={() => toggleSolution(item.id)}
                            style={[styles.solutionToggleBtn, isSolutionOpen && styles.solutionToggleBtnActive]}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons
                              name={isSolutionOpen ? 'eye-off-outline' : 'lightbulb-on-outline'}
                              size={16}
                              color={isSolutionOpen ? '#475569' : '#0D6B42'}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={[styles.solutionToggleBtnText, isSolutionOpen && { color: '#475569' }]}>
                              {isSolutionOpen ? 'Sembunyikan Kunci & Pembahasan' : 'Lihat Kunci & Pembahasan Soal'}
                            </Text>
                            <MaterialCommunityIcons
                              name={isSolutionOpen ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color={isSolutionOpen ? '#475569' : '#0D6B42'}
                            />
                          </TouchableOpacity>

                          {/* Konten Kunci Jawaban & Pembahasan */}
                          {isSolutionOpen && (
                            <View style={styles.solutionBox}>
                              <View style={styles.solutionHeaderRow}>
                                <MaterialCommunityIcons name="check-decagram" size={18} color="#059669" />
                                <Text style={styles.solutionTitle}>Kunci Jawaban Resmi:</Text>
                                <View style={styles.answerKeyPill}>
                                  <Text style={styles.answerKeyPillText}>
                                    {item.kunci_jawaban || 'Tersedia pada evaluasi guru'}
                                  </Text>
                                </View>
                              </View>

                              {/* Pembahasan */}
                              <View style={styles.explanationSection}>
                                <Text style={styles.explanationLabel}>Pembahasan & Analisis:</Text>
                                <Text style={styles.explanationContent}>
                                  {item.pembahasan && item.pembahasan.trim()
                                    ? item.pembahasan
                                    : 'Pelajari kembali materi pelajaran terkait untuk memahami konsep kunci butir soal ini dengan tuntas.'}
                                </Text>
                              </View>

                              {/* Indikator */}
                              {Boolean(item.indikator) && (
                                <View style={styles.indicatorRow}>
                                  <MaterialCommunityIcons name="target" size={13} color="#0D9488" style={{ marginRight: 4, marginTop: 1 }} />
                                  <Text style={styles.indicatorText}>Indikator: {item.indikator}</Text>
                                </View>
                              )}

                              {/* Penyusun */}
                              {Boolean(item.kisi_kisi?.guru?.nama_lengkap || item.kisi_kisi?.guru?.name) && (
                                <View style={styles.teacherAuthorRow}>
                                  <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                                  <Text style={styles.teacherAuthorText}>
                                    Penyusun: {item.kisi_kisi?.guru?.nama_lengkap || item.kisi_kisi?.guru?.name}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </>
              );
            })()}

            {/* Tombol Selesai Latihan */}
            <TouchableOpacity
              style={styles.modalFinishBtn}
              activeOpacity={0.85}
              onPress={() => setSelectedSubjectModal(null)}
            >
              <LinearGradient
                colors={['#059669', '#047857']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.modalFinishBtnGrad}
              >
                <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalFinishBtnText}>Selesai Latihan</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Sub Modals (KTS, QR, Menu, Weekly Report) ── */}
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
                const cAvatar = c.photo_url || c.avatar_url;

                return (
                  <TouchableOpacity
                    key={cId || idx}
                    activeOpacity={0.8}
                    onPress={() => {
                      setShowChildSelectorModal(false);
                      setSelectedChildId(cId);
                      useActiveChildStore.getState().setActiveChildId(cId);
                      setSelectedSubjectModal(null);
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

      {/* ── MODAL FILTER MATA PELAJARAN (TAILGRIDS BOTTOM SHEET) ── */}
      <Modal
        visible={showSubjectFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubjectFilterModal(false)}
      >
        <View style={styles.childModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowSubjectFilterModal(false)}
          />
          <View style={styles.filterModalSheet}>
            <View style={styles.filterModalHeader}>
              <View style={styles.filterModalHeaderLeft}>
                <View style={styles.filterModalIconSquircle}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={20} color="#047857" />
                </View>
                <View>
                  <Text style={styles.filterModalTitle}>Pilih Mata Pelajaran</Text>
                  <Text style={styles.filterModalSubtitle}>Filter materi soal berdasarkan bidang studi</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowSubjectFilterModal(false)}
                style={styles.filterModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={true}>
              {/* Opsi Semua Mata Pelajaran */}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  setSelectedSubjectFilter('all');
                  setShowSubjectFilterModal(false);
                }}
                style={[
                  styles.filterModalItem,
                  selectedSubjectFilter === 'all' && styles.filterModalItemActive,
                ]}
              >
                <View style={[styles.filterModalItemIcon, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="view-grid-outline" size={18} color="#047857" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={[
                      styles.filterModalItemTitle,
                      selectedSubjectFilter === 'all' && styles.filterModalItemTitleActive,
                    ]}
                  >
                    Semua Mata Pelajaran
                  </Text>
                  <Text style={styles.filterModalItemSub}>
                    Menampilkan seluruh butir soal ({stats.totalQuestions} butir)
                  </Text>
                </View>
                {selectedSubjectFilter === 'all' && (
                  <MaterialCommunityIcons name="check-circle" size={20} color="#047857" />
                )}
              </TouchableOpacity>

              {/* List Mata Pelajaran */}
              {allSubjectsList.map((subj) => {
                const isSelected = selectedSubjectFilter === subj.name;
                const theme = getSubjectTheme(subj.name);
                return (
                  <TouchableOpacity
                    key={subj.name}
                    activeOpacity={0.75}
                    onPress={() => {
                      setSelectedSubjectFilter(subj.name);
                      setShowSubjectFilterModal(false);
                    }}
                    style={[
                      styles.filterModalItem,
                      isSelected && styles.filterModalItemActive,
                    ]}
                  >
                    <View style={[styles.filterModalItemIcon, { backgroundColor: theme.bg }]}>
                      <MaterialCommunityIcons name={theme.icon as any} size={18} color={theme.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={[
                          styles.filterModalItemTitle,
                          isSelected && styles.filterModalItemTitleActive,
                        ]}
                      >
                        {subj.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={styles.filterModalItemSub}>
                          {subj.count} Butir Soal
                        </Text>
                        {subj.uncompletedCount > 0 ? (
                          <View style={styles.uncompletedMiniPill}>
                            <Text style={styles.uncompletedMiniPillText}>
                              {subj.uncompletedCount} Belum
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.completedMiniPill}>
                            <Text style={styles.completedMiniPillText}>Selesai</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={20} color="#047857" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL FILTER TANGGAL (TAILGRIDS BOTTOM SHEET) ── */}
      <Modal
        visible={showDateFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDateFilterModal(false)}
      >
        <View style={styles.childModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowDateFilterModal(false)}
          />
          <View style={styles.filterModalSheet}>
            <View style={styles.filterModalHeader}>
              <View style={styles.filterModalHeaderLeft}>
                <View style={styles.filterModalIconSquircle}>
                  <MaterialCommunityIcons name="calendar-clock" size={20} color="#047857" />
                </View>
                <View>
                  <Text style={styles.filterModalTitle}>Filter Tanggal Bank Soal</Text>
                  <Text style={styles.filterModalSubtitle}>Pilih rentang waktu publikasi butir soal</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowDateFilterModal(false)}
                style={styles.filterModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={true}>
              {/* Presets Rentang Tanggal */}
              <View style={styles.datePresetsGrid}>
                {[
                  { key: 'all', label: 'Semua Tanggal', desc: 'Tampilkan seluruh soal latihan' },
                  { key: 'today', label: 'Hari Ini', desc: 'Soal dirilis / dibuat hari ini' },
                  { key: '7days', label: '7 Hari Terakhir', desc: 'Satu pekan terakhir' },
                  { key: '30days', label: 'Bulan Ini', desc: '30 hari terakhir' },
                ].map((preset) => {
                  const isSel = selectedDateFilter === preset.key;
                  return (
                    <TouchableOpacity
                      key={preset.key}
                      activeOpacity={0.8}
                      onPress={() => {
                        setSelectedDateFilter(preset.key as any);
                        setCustomSelectedDate(null);
                        setShowDateFilterModal(false);
                      }}
                      style={[
                        styles.datePresetCard,
                        isSel && styles.datePresetCardActive,
                      ]}
                    >
                      <View style={styles.datePresetCardRow}>
                        <Text style={[styles.datePresetLabel, isSel && styles.datePresetLabelActive]}>
                          {preset.label}
                        </Text>
                        {isSel && (
                          <MaterialCommunityIcons name="check-circle" size={16} color="#047857" />
                        )}
                      </View>
                      <Text style={styles.datePresetDesc}>{preset.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom Calendar Picker */}
              <View style={styles.customCalendarWrapper}>
                <View style={styles.calendarHeaderRow}>
                  <TouchableOpacity
                    onPress={() => {
                      const prev = new Date(calendarViewDate);
                      prev.setMonth(prev.getMonth() - 1);
                      setCalendarViewDate(prev);
                    }}
                    style={styles.calNavBtn}
                  >
                    <MaterialCommunityIcons name="chevron-left" size={20} color="#047857" />
                  </TouchableOpacity>

                  <Text style={styles.calMonthTitle}>
                    {calendarViewDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                  </Text>

                  <TouchableOpacity
                    onPress={() => {
                      const next = new Date(calendarViewDate);
                      next.setMonth(next.getMonth() + 1);
                      setCalendarViewDate(next);
                    }}
                    style={styles.calNavBtn}
                  >
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#047857" />
                  </TouchableOpacity>
                </View>

                {/* Day of Week */}
                <View style={styles.calDaysOfWeekRow}>
                  {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d) => (
                    <Text key={d} style={styles.calDayColHeader}>
                      {d}
                    </Text>
                  ))}
                </View>

                {/* Calendar Days Matrix */}
                <View style={styles.calDaysGrid}>
                  {(() => {
                    const year = calendarViewDate.getFullYear();
                    const month = calendarViewDate.getMonth();
                    const firstDay = new Date(year, month, 1).getDay();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const days = [];
                    for (let i = 0; i < firstDay; i++) {
                      days.push(<View key={`empty-${i}`} style={styles.calDayCell} />);
                    }
                    for (let d = 1; d <= daysInMonth; d++) {
                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const isSel = selectedDateFilter === 'custom' && customSelectedDate === dateStr;
                      days.push(
                        <TouchableOpacity
                          key={`day-${d}`}
                          activeOpacity={0.75}
                          onPress={() => {
                            setCustomSelectedDate(dateStr);
                            setSelectedDateFilter('custom');
                            setShowDateFilterModal(false);
                          }}
                          style={[
                            styles.calDayCell,
                            isSel && styles.calDayCellActive,
                          ]}
                        >
                          <Text style={[styles.calDayNum, isSel && styles.calDayNumActive]}>
                            {d}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                    return days;
                  })()}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  bankSoalGroupCard: {
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 14,
  },
  bankSoalGroupHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bankSoalGroupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  bankSoalGroupHeaderIconBoxWhite: {
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
  bankSoalGroupTitleWhite: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  bankSoalGroupSubWhite: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D1FAE5',
    marginTop: 1,
  },
  bankSoalGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 999,
  },
  bankSoalGroupBadgeText: {
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
  kpiProgressBannerAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  kpiProgressBannerAmberActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
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
  kpiProgressBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  kpiStatusIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiProgressBannerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiProgressBannerSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  kpiProgressFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 2,
  },
  kpiProgressFilterPillActive: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  kpiProgressFilterPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B45309',
  },
  kpiProgressFilterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  kpiMiniProgressBarBg: {
    height: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  kpiMiniProgressBarFill: {
    height: '100%',
    borderRadius: 999,
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
  // ── Standard sheet layout (identik ScheduleScreen) ──
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: { flex: 1, backgroundColor: 'transparent' },
  mainScrollContent: { flexGrow: 1 },
  scrollContent: { flexGrow: 1 },
  // ── Static Top Bar (standar Jadwal) ──
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
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    shadowColor: '#059669',
    shadowOpacity: 0.15,
    shadowRadius: 4,
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
  // ── Body Content Wrapper ──
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  containerBlock: { marginBottom: 16 },
  studentContainerBlock: { marginBottom: 8 },
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
  heroCardScrollContainer: { marginHorizontal: -16 },
  studentCardsTrack: { gap: STUDENT_CARD_GAP, paddingBottom: 4, zIndex: 1 },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 18,
    backgroundColor: '#059669',
    borderRadius: 3,
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Nunito_800ExtraBold',
  },
  kpiSub: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  listTitleCol: {
    flex: 1,
  },
  listSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontFamily: 'Nunito_500Medium',
    marginTop: 1,
  },
  subjectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  subjectIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  subjectInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  subjectCardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#0F172A',
    marginBottom: 3,
  },
  subjectTeacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  subjectTeacherText: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: 'Nunito_500Medium',
  },
  subjectBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subjectCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  subjectCountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
  },
  subjectCodeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  subjectCodeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
  },
  subjectDoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  subjectDoneBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
    fontFamily: 'Nunito_700Bold',
  },
  subjectPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  subjectPendingBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B45309',
    fontFamily: 'Nunito_700Bold',
  },
  subjectArrowWrap: {
    marginLeft: 8,
  },
  subjectActionSquircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  errorContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#991B1B',
    marginTop: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  retryBtn: {
    backgroundColor: '#0D6B42',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  resetFilterBtn: {
    marginTop: 14,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  resetFilterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  numberPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  numberPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#334155',
  },
  subjectPill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    maxWidth: 140,
  },
  subjectPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  diffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  diffPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  pointsBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pointsBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#92400E',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metaType: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  metaCode: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  questionText: {
    fontSize: 13.5,
    color: '#1E293B',
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  optionsList: {
    gap: 8,
    marginBottom: 12,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  optionKeyCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  optionKeyText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  optionContentText: {
    flex: 1,
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
    fontWeight: '500',
  },
  solutionToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  solutionToggleBtnActive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  solutionToggleBtnText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
    textAlign: 'center',
  },
  solutionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 10,
  },
  solutionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  solutionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 6,
    marginRight: 8,
  },
  answerKeyPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  answerKeyPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  explanationSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 8,
  },
  explanationLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 3,
  },
  explanationContent: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  indicatorText: {
    fontSize: 10.5,
    color: '#0D9488',
    fontWeight: '600',
    flex: 1,
  },
  teacherAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  teacherAuthorText: {
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic',
  },
  modalRootContainer: {
    flex: 1,
    backgroundColor: '#ECFDF5',
  },
  modalTopBar: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#A7F3D0',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 14,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  modalTopBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
    width: '100%',
  },
  modalTopBarBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modalTopBarCenterCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  modalTopBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#004D32',
    textAlign: 'center',
  },
  modalTopBarPill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 3,
  },
  modalTopBarSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Nunito_600SemiBold',
    color: '#047857',
    textAlign: 'center',
  },
  modalScrollBody: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
  },
  modalNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    marginBottom: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  modalNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#0F766E',
    fontFamily: 'Nunito_500Medium',
    lineHeight: 18,
  },
  modalFinishBtn: {
    marginTop: 12,
    marginBottom: 20,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  modalFinishBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  modalFinishBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },

  // ── FILTER SECTION STYLES ──
  filterSectionContainer: {
    marginBottom: 16,
    gap: 10,
  },
  statusFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusFilterScroll: {
    flexGrow: 0,
  },
  statusFilterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
  },
  statusFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  statusFilterChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  statusFilterChipAmberActive: {
    backgroundColor: '#FFFBEB',
    borderColor: '#D97706',
  },
  statusFilterChipEmeraldActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#047857',
  },
  statusFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    fontFamily: 'Nunito_700Bold',
  },
  statusFilterChipTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  statusFilterChipAmberTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  statusFilterChipEmeraldTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  dropdownFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterDropdownBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  filterDropdownBtnActive: {
    borderColor: '#047857',
    backgroundColor: '#ECFDF5',
  },
  filterDropdownBtnText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    fontFamily: 'Nunito_700Bold',
  },
  filterDropdownBtnTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  filterResetBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1.2,
    borderColor: '#FECDD3',
  },
  activeFilterPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 2,
  },
  activeFilterLabelText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  activeFilterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  activeFilterTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },

  // ── MODAL INNER FILTER & PROGRESS STYLES ──
  modalFilterSegmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  modalFilterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 11,
  },
  modalFilterTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  modalFilterTabActiveAmber: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modalFilterTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modalFilterTabTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  modalFilterTabTextActiveAmber: {
    color: '#B45309',
    fontWeight: '800',
  },
  modalProgressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 12,
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  modalProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalProgressLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  modalProgressValue: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#047857',
  },
  modalProgressBarBg: {
    height: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 999,
    overflow: 'hidden',
  },
  modalProgressBarFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 999,
  },
  modalAllCompletedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  modalAllCompletedIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalAllCompletedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#004D32',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalAllCompletedDesc: {
    fontSize: 12.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  modalViewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  modalViewAllBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  questionAnsweredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  questionAnsweredBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  questionUnansweredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  questionUnansweredBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },

  // ── FILTER MODALS (SUBJECT & DATE) STYLES ──
  filterModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '85%',
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#ECFDF5',
    marginBottom: 12,
  },
  filterModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  filterModalIconSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  filterModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#004D32',
    fontFamily: 'Poppins_700Bold',
  },
  filterModalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  filterModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  filterModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  filterModalItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  filterModalItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterModalItemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  filterModalItemTitleActive: {
    color: '#047857',
    fontWeight: '800',
  },
  filterModalItemSub: {
    fontSize: 11,
    color: '#64748B',
  },
  uncompletedMiniPill: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  uncompletedMiniPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B45309',
  },
  completedMiniPill: {
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  completedMiniPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
  },

  // ── DATE FILTER PRESETS & MINI CALENDAR STYLES ──
  datePresetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  datePresetCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  datePresetCardActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  datePresetCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  datePresetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  datePresetLabelActive: {
    color: '#047857',
    fontWeight: '800',
  },
  datePresetDesc: {
    fontSize: 10,
    color: '#64748B',
  },
  customCalendarWrapper: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    padding: 12,
    marginTop: 4,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#004D32',
  },
  calDaysOfWeekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  calDayColHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  calDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDayCell: {
    width: `${100 / 7}%`,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginVertical: 1,
  },
  calDayCellActive: {
    backgroundColor: '#059669',
  },
  calDayNum: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  calDayNumActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
