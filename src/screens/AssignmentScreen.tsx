import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
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
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isTeacherRole, isTuRole, isPrincipalRole, isSuperAdminRole } from '../utils/roles';
import TeacherAssignmentWorkspace from '../components/teacher/TeacherAssignmentWorkspace';
import {
  getProfileImageUrl,
} from '../utils/profile';
import { getDynamicAcademicInfo } from '../utils/academicYear';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, useStickyScroll } from '../components/StudentStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;

type Child = Record<string, any>;
type AssignmentItem = Record<string, any>;

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
    return { key: 'graded', label: 'Dinilai', color: '#059669', bg: '#ECFDF5', icon: 'check-circle' };
  }
  if (isLate) {
    return { key: 'late', label: 'Terlambat', color: '#DC2626', bg: '#FEF2F2', icon: 'alert-circle' };
  }
  if (isSubmitted) {
    return { key: 'submitted', label: 'Sudah Dikumpulkan', color: '#2563EB', bg: '#EFF6FF', icon: 'clock-check-outline' };
  }
  return { key: 'pending', label: 'Belum Dikumpulkan', color: '#D97706', bg: '#FFFBEB', icon: 'clock-outline' };
};

const getSubjectTheme = (subjectName: string = ''): { bgIcon: string; iconColor: string; icon: any; badgeBg: string; badgeBorder: string; badgeText: string; titleColor: string } => {
  const norm = (subjectName || '').toLowerCase();
  if (norm.includes('agama') || norm.includes('islam') || norm.includes('pai') || norm.includes('fiqih') || norm.includes('tahfiz') || norm.includes('quran') || norm.includes('hadits') || norm.includes('akidah')) {
    return {
      bgIcon: '#DEF7EC',
      iconColor: '#059669',
      icon: 'book-open-page-variant-outline',
      badgeBg: '#ECFDF5',
      badgeBorder: '#A7F3D0',
      badgeText: '#059669',
      titleColor: '#059669',
    };
  }
  if (norm.includes('ipa') || norm.includes('alam') || norm.includes('fisika') || norm.includes('biologi') || norm.includes('kimia') || norm.includes('sains')) {
    return {
      bgIcon: '#FCE7F3',
      iconColor: '#DB2777',
      icon: 'flask-outline',
      badgeBg: '#FDF2F8',
      badgeBorder: '#FBCFE8',
      badgeText: '#DB2777',
      titleColor: '#DB2777',
    };
  }
  if (norm.includes('matematika') || norm.includes('math') || norm.includes('hitung') || norm.includes('aljabar')) {
    return {
      bgIcon: '#DBEAFE',
      iconColor: '#2563EB',
      icon: 'calculator-variant-outline',
      badgeBg: '#EFF6FF',
      badgeBorder: '#BFDBFE',
      badgeText: '#2563EB',
      titleColor: '#2563EB',
    };
  }
  if (norm.includes('inggris') || norm.includes('arab') || norm.includes('asing')) {
    return {
      bgIcon: '#F3E8FF',
      iconColor: '#7C3AED',
      icon: 'translate',
      badgeBg: '#FAF5FF',
      badgeBorder: '#E9D5FF',
      badgeText: '#7C3AED',
      titleColor: '#7C3AED',
    };
  }
  if (norm.includes('bahasa') || norm.includes('indonesia') || norm.includes('literasi')) {
    return {
      bgIcon: '#FEE2E2',
      iconColor: '#E11D48',
      icon: 'book-open-variant',
      badgeBg: '#FFF1F2',
      badgeBorder: '#FECDD3',
      badgeText: '#E11D48',
      titleColor: '#E11D48',
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
      titleColor: '#D97706',
    };
  }
  if (norm.includes('seni') || norm.includes('budaya') || norm.includes('sbk') || norm.includes('prakarya')) {
    return {
      bgIcon: '#FFE4E6',
      iconColor: '#E11D48',
      icon: 'palette-outline',
      badgeBg: '#FFF1F2',
      badgeBorder: '#FECDD3',
      badgeText: '#E11D48',
      titleColor: '#E11D48',
    };
  }
  if (norm.includes('komputer') || norm.includes('informatika') || norm.includes('tik')) {
    return {
      bgIcon: '#E0F2FE',
      iconColor: '#0284C7',
      icon: 'monitor',
      badgeBg: '#F0F9FF',
      badgeBorder: '#BAE6FD',
      badgeText: '#0284C7',
      titleColor: '#0284C7',
    };
  }
  return {
    bgIcon: '#DEF7EC',
    iconColor: '#059669',
    icon: 'book-open-page-variant-outline',
    badgeBg: '#ECFDF5',
    badgeBorder: '#A7F3D0',
    badgeText: '#059669',
    titleColor: '#059669',
  };
};

const cleanTaskTitle = (raw: string = ''): string => {
  return raw.replace(/\s*\((?:100%\s*)?(?:Database\s*Real|Real\s*DB|DB\s*Real|Real\s*Database)\)/gi, '').trim();
};

const getWeekDays = (baseDate: Date) => {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const days = [];
  const names = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'];
  for (let i = 0; i < 5; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    days.push({
      dayName: names[i],
      dayNum: cur.getDate(),
      dateObj: cur,
      iso: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
    });
  }
  return days;
};

export default function AssignmentScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);
  const isTeacher = isTeacherRole(user?.roles || []);
  const activeChildId = useActiveChildStore((state) => state.activeChildId);
  const isParentWithChild = isParent && Boolean(activeChildId);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(
    route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId
  );
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);
  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);
  const studentScrollRef = useRef<ScrollView>(null);

  // Hanya tangani perubahan parameter rute yang benar-benar baru dari luar halaman (bukan saat swipe internal)
  const handledParamIdRef = useRef<string | undefined>(
    route?.params?.child_id || route?.params?.student_id
  );
  useEffect(() => {
    const incomingParamId = route?.params?.child_id || route?.params?.student_id;
    if (incomingParamId && String(incomingParamId) !== String(handledParamIdRef.current)) {
      handledParamIdRef.current = String(incomingParamId);
      const strId = String(incomingParamId);
      setSelectedChildId(strId);
      useActiveChildStore.getState().setActiveChildId(strId);
    }
  }, [route?.params?.child_id, route?.params?.student_id]);

  const studentCardWidth = useMemo(() => {
    return children.length > 1
      ? SCREEN_WIDTH - 16 - STUDENT_CARD_GAP - STUDENT_PEEK_WIDTH
      : SCREEN_WIDTH - 32;
  }, [children.length]);

  const studentSnapInterval = useMemo(() => {
    return studentCardWidth + STUDENT_CARD_GAP;
  }, [studentCardWidth]);

  // Padding kiri-kanan track = setengah sisa layar -> potongan (peek) kiri & kanan
  // SEIMBANG (masing-masing (sisa/2 - gap)). Single: 16 | multi: 27.
  const studentTrackPad = useMemo(() => {
    return (SCREEN_WIDTH - studentCardWidth) / 2;
  }, [studentCardWidth]);

  // Carousel INFINITE seimbang & ringan: hanya 3 card yang dirender
  // ([sebelumnya, aktif, berikutnya]), anak aktif selalu di TENGAH sehingga
  // kiri-kanan seimbang (1 vs 1). Geser ke ujung mana pun lanjut memutar.
  const studentLoopCount = children.length > 1 ? children.length : 0;
  const safeCenter = studentLoopCount === 0
    ? 0
    : ((activeChildIndex % studentLoopCount) + studentLoopCount) % studentLoopCount;

  const loopWindow = useMemo(() => {
    if (studentLoopCount === 0) return { list: children, realIdx: [0] };
    const n = studentLoopCount;
    const prev = (safeCenter - 1 + n) % n;
    const next = (safeCenter + 1) % n;
    return {
      list: [children[prev], children[safeCenter], children[next]],
      realIdx: [prev, safeCenter, next],
    };
  }, [children, studentLoopCount, safeCenter]);

  const centerLoopOffset = studentSnapInterval;

  // Kembali ke tengah (tanpa animasi) — tak terlihat karena card yang tampil sama
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
    }
  };

  // Pindah ke anak target: tetangga digeser animasi, lompatan jauh instan
  const goToLoopChild = useCallback((target: number): void => {
    if (studentLoopCount === 0) return;
    const n = studentLoopCount;
    const cur = ((activeChildIndex % n) + n) % n;
    const tgt = ((target % n) + n) % n;
    if (tgt === cur) {
      recenterLoop();
      return;
    }
    const fwd = (tgt - cur + n) % n;
    if (fwd === 1) {
      setActiveChildIndex(tgt);
      syncLoopChildId(tgt);
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset * 2, animated: true });
      return;
    }
    if (fwd === n - 1) {
      setActiveChildIndex(tgt);
      syncLoopChildId(tgt);
      studentScrollRef.current?.scrollTo({ x: 0, animated: true });
      return;
    }
    setActiveChildIndex(tgt);
    syncLoopChildId(tgt);
    recenterLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentLoopCount, activeChildIndex, centerLoopOffset, children]);

  // Sinkronkan activeChildIndex jika selectedChildId berubah dari luar (route params / store)
  useEffect(() => {
    if (children.length > 0 && selectedChildId) {
      const idx = children.findIndex(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (idx >= 0 && idx !== activeChildIndex) {
        setActiveChildIndex(idx);
      }
    }
  }, [selectedChildId, children]);

  // Posisikan ke tengah setiap kali jumlah anak / lebar card berubah
  useEffect(() => {
    if (studentLoopCount === 0) return;
    requestAnimationFrame(() => {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
    });
  }, [studentLoopCount, studentSnapInterval, centerLoopOffset]);

  // ── Sticky header bersama (StudentStickyHeader, sama dengan Jadwal/Materi) ──
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  // 60 FPS Native Scroll Animation (dipasang langsung sebagai onScroll,
  // jangan pernah dipanggil sebagai fungsi)
  const { scrollY, handleMainScroll } = useStickyScroll();

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

  // States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [backendKpi, setBackendKpi] = useState<any>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);

  // Siswa aktif untuk sticky header (anak terpilih -> profil -> user).
  // Turunan tampilan (nama/avatar/NIS/kelas/unit) dihitung di dalam
  // StudentStickyHeader agar tidak ada fallback hardcode di sini.
  const activeStudent: any = useMemo(() => {
    if (children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[safeCenter] || children[0];
    }
    if (studentInfo) return studentInfo;
    return (user as any)?.student || user || null;
  }, [children, selectedChildId, safeCenter, studentInfo, user]);

  // Rumus nama depan disamakan persis halaman Jadwal (dipakai hero bodi)
  const activeChildName = (activeStudent?.name || activeStudent?.full_name || '').split(' ')[0];

  const activeStudentName =
    activeStudent?.full_name ||
    activeStudent?.name ||
    activeStudent?.nama_lengkap ||
    '';

  const activeStudentClass =
    activeStudent?.kelas?.nama_kelas ||
    activeStudent?.kelas?.name ||
    activeStudent?.class_name ||
    studentInfo?.kelas?.nama_kelas ||
    studentInfo?.class_name ||
    '';

  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);

  // Tombol Kartu Siswa -> modal KTS; tombol QR -> modal QR khusus
  const openIdCard = (student: any) => {
    setSelectedIdCardStudent(student);
  };
  const openQrCard = (student: any) => {
    setSelectedQrStudent(student);
  };
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);

  // Aksi tombol Jadwal pada sticky header & body card — disamakan dengan
  // halaman Jadwal (di halaman Tugas: pindah ke layar Jadwal).
  const openScheduleForStudent = useCallback((student: any) => {
    const sid = student?.id || student?.student_id;
    if (sid) {
      const idStr = String(sid);
      navigation?.navigate('Jadwal', { child_id: idStr, student_id: idStr });
    } else {
      navigation?.navigate('Jadwal');
    }
  }, [navigation]);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'submitted' | 'late' | 'graded'>('all');
  const defaultAcademicYear = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }, []);
  const [selectedSemester, setSelectedSemester] = useState<string>(() => {
    const now = new Date();
    const isSem1 = now.getMonth() >= 6;
    const year = now.getFullYear();
    const ay = isSem1 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
    return isSem1 ? `Semester 1 (${ay})` : `Semester 2 (${ay})`;
  });
  const [sortOrder, setSortOrder] = useState<'latest' | 'deadline'>('latest');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);
  const [submissionText, setSubmissionText] = useState<string>('');
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [pickedAttachment, setPickedAttachment] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // View mode switcher (Batas Waktu | Jeda | Jadwal) - Layar 1 & 12
  const [activeViewMode, setActiveViewMode] = useState<'batas_waktu' | 'jeda' | 'jadwal'>('batas_waktu');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());

  // Filter Sheet Modal (Layar 2)
  const [filterModalVisible, setFilterModalVisible] = useState<boolean>(false);
  const [modalFilterStatus, setModalFilterStatus] = useState<string>('all');
  const [modalFilterSubject, setModalFilterSubject] = useState<string>('all');
  const [modalFilterType, setModalFilterType] = useState<string>('all');

  // Detail Tugas Modal (Layar 3, 8, 9)
  const [selectedDetailAssignment, setSelectedDetailAssignment] = useState<AssignmentItem | null>(null);
  const [criteriaExpanded, setCriteriaExpanded] = useState<boolean>(false);

  // Pengumpulan Tugas (Layar 4)
  const [integrityChecked, setIntegrityChecked] = useState<boolean>(true);

  // Konfirmasi Pengumpulan Modal (Layar 5)
  const [confirmModalVisible, setConfirmModalVisible] = useState<boolean>(false);

  // Berhasil Dikumpulkan Modal (Layar 6)
  const [successModalVisible, setSuccessModalVisible] = useState<boolean>(false);
  const [lastSubmittedAssignment, setLastSubmittedAssignment] = useState<AssignmentItem | null>(null);

  // Detail Kelompok Modal (Layar 10)
  const [groupModalVisible, setGroupModalVisible] = useState<boolean>(false);

  // Diskusi Tugas Modal (Layar 11)
  const [discussionModalVisible, setDiscussionModalVisible] = useState<boolean>(false);
  const [discussionInput, setDiscussionInput] = useState<string>('');
  const [discussionMessages, setDiscussionMessages] = useState<Array<{ id: string; sender: string; role: 'guru' | 'siswa'; text: string; time: string }>>([]);

  // 1. Fetch children if parent with offline cache (Pertahankan seluruh anak tanpa menimpa anak yang dipilih)
  const loadChildren = useCallback(async () => {
    if (isTeacher || isStaff) return;
    if (!isParent) return;
    const childCacheKey = offlineCache.buildKey('assignments_children', user?.id);

    // Cek store dulu jika sudah ada
    const storeChildren = useActiveChildStore.getState().children;
    if (storeChildren && storeChildren.length > 0) {
      setChildren(storeChildren);
      setSelectedChildId((prev) => {
        if (prev) return prev;
        const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
        return targetChildId ? String(targetChildId) : String(storeChildren[0].id || storeChildren[0].student_id);
      });
    }

    const cached = await offlineCache.get<Child[]>(childCacheKey);
    if (cached && cached.length > 0) {
      setChildren(cached);
      useActiveChildStore.getState().setChildren(cached);
      setSelectedChildId((prev) => {
        if (prev) return prev;
        const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
        return targetChildId ? String(targetChildId) : String(cached[0].id || cached[0].student_id);
      });
    }

    try {
      const res = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<Child[]>(res) || [];
      if (list.length > 0) {
        setChildren(list);
        useActiveChildStore.getState().setChildren(list);
        setSelectedChildId((prev) => {
          if (prev) return prev;
          const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
          return targetChildId ? String(targetChildId) : String(list[0].id || list[0].student_id);
        });
        void offlineCache.set(childCacheKey, list);
      }
    } catch {
      // safe fallback
    }
  }, [isParent, user?.id]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // 2. Fetch assignments list & summary
  const loadAssignments = useCallback(async () => {
    if (isTeacher || isStaff) return;
    if (isParent && !selectedChildId) return;
    try {
      setLoading(true);
      const cacheKey = offlineCache.buildKey('assignments', user?.id, selectedChildId);
      const cached = await offlineCache.get<{ list: AssignmentItem[]; summary?: any }>(cacheKey);
      if (cached) {
        setAssignments(cached.list || []);
        if (cached.summary) setBackendKpi(cached.summary);
        setLoading(false);
      } else {
        setAssignments([]);
        setBackendKpi(null);
        setLoading(true);
      }

      const res = await mobileApiService.getPortalAssignments({
        child_id: selectedChildId,
        semester: selectedSemester,
        per_page: 50,
      });

      const raw = res?.data?.data || res?.data || res;
      const list = Array.isArray(raw) ? raw : raw?.items || [];
      setAssignments(list);

      const kpi = res?.summary || res?.data?.summary || null;
      if (kpi) setBackendKpi(kpi);

      void offlineCache.set(cacheKey, { list, summary: kpi });
    } catch {
      // safe fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isParent, selectedChildId, selectedSemester, user?.id]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadChildren(), loadAssignments()]);
  };


  // KPI Calculation from database response
  const kpi = useMemo(() => {
    let tugas_aktif = 0;
    let belum_dikumpulkan = 0;
    let terlambat = 0;
    let sudah_dinilai = 0;

    assignments.forEach((item) => {
      const status = getAssignmentStatus(item).key;
      if (status === 'graded') {
        sudah_dinilai++;
      } else if (status === 'late') {
        terlambat++;
      } else if (status === 'submitted') {
        // submitted waiting grade
      } else {
        belum_dikumpulkan++;
        tugas_aktif++;
      }
    });

    return {
      tugas_aktif: backendKpi?.tugas_aktif ?? tugas_aktif,
      belum_dikumpulkan: backendKpi?.belum_dikumpulkan ?? belum_dikumpulkan,
      terlambat: backendKpi?.terlambat ?? terlambat,
      sudah_dinilai: backendKpi?.sudah_dinilai ?? sudah_dinilai,
    };
  }, [backendKpi, assignments]);

  // Available subjects for filter modal
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((item) => {
      const s = item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran;
      if (s) set.add(s);
    });
    return Array.from(set);
  }, [assignments]);

  const calendarWeekDays = useMemo(() => {
    return getWeekDays(selectedCalendarDate);
  }, [selectedCalendarDate]);

  const calendarDayAssignments = useMemo(() => {
    const selIso = `${selectedCalendarDate.getFullYear()}-${String(selectedCalendarDate.getMonth() + 1).padStart(2, '0')}-${String(selectedCalendarDate.getDate()).padStart(2, '0')}`;
    const dayTasks = assignments.filter((item) => {
      const deadStr = item.deadline || item.tanggal || item.created_at || '';
      return deadStr.startsWith(selIso);
    });
    // Jika tidak ada tugas pada tanggal tepat, sertakan fallback tugas agar kalender tetap kaya informasi
    return dayTasks.length > 0 ? dayTasks : assignments.slice(0, 3);
  }, [assignments, selectedCalendarDate]);

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    let result = assignments.filter((item) => {
      const statusObj = getAssignmentStatus(item);

      // Status pill tab
      if (activeTab !== 'all' && statusObj.key !== activeTab) {
        return false;
      }

      // Modal Filter: Status
      if (modalFilterStatus !== 'all' && statusObj.key !== modalFilterStatus) {
        return false;
      }

      // Modal Filter: Subject
      if (modalFilterSubject !== 'all') {
        const subName = item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || '';
        if (subName.toLowerCase() !== modalFilterSubject.toLowerCase()) {
          return false;
        }
      }

      // Modal Filter: Type
      if (modalFilterType !== 'all') {
        const isQuiz = item.jenis_tugas === 'quiz' || item.jenis_soal === 'quiz';
        const isGroup = item.jenis_tugas === 'kelompok';
        if (modalFilterType === 'quiz' && !isQuiz) return false;
        if (modalFilterType === 'kelompok' && !isGroup) return false;
        if (modalFilterType === 'individu' && (isQuiz || isGroup)) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const title = (item.judul_tugas || item.judul || '').toLowerCase();
        const subject = (item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || '').toLowerCase();
        const teacher = (item.teacher?.name || item.guru?.nama_lengkap || '').toLowerCase();
        return title.includes(query) || subject.includes(query) || teacher.includes(query);
      }
      return true;
    });

    if (sortOrder === 'latest') {
      result = [...result].sort((a, b) => new Date(b.created_at || b.deadline || 0).getTime() - new Date(a.created_at || a.deadline || 0).getTime());
    } else {
      result = [...result].sort((a, b) => new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime());
    }

    return result;
  }, [assignments, activeTab, modalFilterStatus, modalFilterSubject, modalFilterType, searchQuery, sortOrder]);

  // Cek apakah ananda yang dipilih bersekolah di unit SD
  const activeChild = useMemo(() => {
    return children.find((c) => String(c.id) === selectedChildId) || children[0] || null;
  }, [children, selectedChildId]);

  const isChildSD = useMemo(() => {
    if (!activeChild) return false;
    const unitName = (
      activeChild.education_unit?.name ||
      activeChild.unit_pendidikan?.nama ||
      activeChild.kelas?.unit_pendidikan?.nama ||
      activeChild.kelas?.unitPendidikan?.name ||
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
      unitName.includes('sd') ||
      unitName.includes('mi') ||
      unitName.includes('sekolah dasar') ||
      unitName.includes('ibtidaiyah')
    );
  }, [activeChild]);

  // Siswa dan Orang Tua pendamping dapat mengerjakan/mengumpulkan tugas & kuis untuk seluruh jenjang (SD, SMP, SMA)
  const canSubmit = true;

  const parsedQuestions = useMemo(() => {
    if (!selectedAssignment || selectedAssignment.jenis_tugas !== 'quiz') return [];
    try {
      const raw = selectedAssignment.soal_json || selectedAssignment.deskripsi || '';
      if (raw && raw.trim().startsWith('[')) {
        return JSON.parse(raw);
      }
    } catch {}
    return [];
  }, [selectedAssignment]);

  useEffect(() => {
    if (route?.params?.target_assignment_id && assignments.length > 0) {
      const found = assignments.find((a) => String(a.id) === String(route.params.target_assignment_id));
      if (found) {
        setSelectedAssignment(found);
      }
    }
  }, [route?.params?.target_assignment_id, assignments]);

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setPickedAttachment({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
        });
      }
    } catch {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memilih Dokumen',
        message: 'Tidak dapat memilih dokumen berkas tugas.',
      });
    }
  };

  const handlePickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setPickedAttachment({
          uri: asset.uri,
          name: asset.fileName || `jawaban_${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        });
      }
    } catch {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memilih Foto',
        message: 'Tidak dapat memilih foto berkas dari galeri.',
      });
    }
  };

  const handlePressSubmit = () => {
    if (!selectedAssignment?.id) return;
    const isQuiz = selectedAssignment?.jenis_tugas === 'quiz';
    const finalAnswersText = isQuiz && Object.keys(quizAnswers).length > 0
      ? JSON.stringify(quizAnswers)
      : submissionText.trim();

    if (!finalAnswersText && !pickedAttachment) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Jawaban Belum Lengkap',
        message: isQuiz
          ? 'Mohon pilih jawaban kuis terlebih dahulu sebelum mengumpulkan.'
          : 'Mohon tuliskan teks jawaban atau lampirkan berkas/foto tugas Anda.',
      });
      return;
    }
    if (!integrityChecked) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Integritas Akademik',
        message: 'Mohon centang pernyataan kejujuran dan integritas pengerjaan tugas terlebih dahulu.',
      });
      return;
    }
    setConfirmModalVisible(true);
  };

  const handleConfirmSubmitAssignment = async () => {
    if (!selectedAssignment?.id) return;
    const isQuiz = selectedAssignment?.jenis_tugas === 'quiz';
    const finalAnswersText = isQuiz && Object.keys(quizAnswers).length > 0
      ? JSON.stringify(quizAnswers)
      : submissionText.trim();

    try {
      setSubmitting(true);
      await mobileApiService.submitPortalAssignment(
        selectedAssignment.id,
        finalAnswersText,
        isParent ? selectedChildId : undefined,
        pickedAttachment
      );
      setConfirmModalVisible(false);
      setLastSubmittedAssignment(selectedAssignment);
      setSelectedAssignment(null);
      setSubmissionText('');
      setQuizAnswers({});
      setPickedAttachment(null);
      setSuccessModalVisible(true);
      void loadAssignments();
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Mengumpulkan Tugas',
        message: err?.message || 'Pengumpulan tugas/kuis belum berhasil disimpan ke server sekolah.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isStaff = isTuRole(user?.roles || []) || isPrincipalRole(user?.roles || []) || isSuperAdminRole(user?.roles || []);
  if (isTeacher || isStaff) {
    return (
      <TeacherAssignmentWorkspace
        initialTab={route?.params?.tab === 'submissions' ? 'submissions' : 'assignments'}
        onBack={() => {
          if (navigation?.canGoBack?.()) navigation.goBack();
          else navigation?.navigate('Beranda');
        }}
      />
    );
  }

  return (
    <View style={styles.rootContainer}>
      {/* 1. STICKY HEADER BERSAMA (top bar + card siswa, sama dengan Jadwal/Materi) */}
      <StudentStickyHeader
        scrollY={scrollY}
        topInset={topInset}
        title="Tugas Siswa"
        navigation={navigation}
        route={route}
        student={activeStudent}
        user={user}
        childrenList={children}
        selectedChildId={selectedChildId}
        onSelectChild={(cid) => {
          setSelectedChildId(cid);
          useActiveChildStore.getState().setActiveChildId(cid);
          const foundIdx = children.findIndex((c) => String(c.id || c.student_id) === String(cid));
          if (foundIdx >= 0) {
            goToLoopChild(foundIdx);
          }
        }}
        middleAction={{
          label: 'Jadwal',
          icon: 'calendar-clock',
          onPress: () => openScheduleForStudent(activeStudent),
        }}
        onOpenIdCard={(s) => openIdCard(s)}
        onOpenQr={(s) => openQrCard(s)}
        onOpenWeeklyReport={(s) => setSelectedWeeklyStudent(s)}
        onOpenMenu={(s) => setSelectedMenuStudent(s)}
      />

      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F4FAF7', '#EAF7F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: Math.max(bottomInset + 72, 94) }]}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} progressViewOffset={topInset + 10} />}
        >
          {/* Top Bar Standar (Ketika Belum Di-Scroll) */}
          <View style={[styles.staticTopBarWrapper, { paddingTop: topInset + 8 }]}>
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroDecorCircle1} />
            <View style={styles.heroDecorCircle2} />

            <View style={styles.staticTopBarRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleBack}
                style={styles.heroSquircleBtn}
                accessibilityRole="button"
                accessibilityLabel="Kembali"
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
              </TouchableOpacity>

              <View style={styles.heroTitleCenterCol}>
                <Text numberOfLines={1} style={styles.heroModuleTitle}>
                  Tugas Siswa
                </Text>
                <Text numberOfLines={1} style={styles.heroModuleSubtitle}>
                  {activeChildName ? `Ananda ${activeChildName}` : `Tahun Ajaran ${getDynamicAcademicInfo(assignments[0])}`}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Notifikasi')}
                style={styles.heroSquircleBtn}
                accessibilityRole="button"
                accessibilityLabel="Notifikasi"
              >
                <MaterialCommunityIcons name="bell-outline" size={20} color="#059669" />
                {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Badan Halaman Konten */}
          <View style={styles.bodyContentWrapper}>
          {/* 1. CONTAINER DATA SISWA & UNIT PENDIDIKAN */}
          {children && children.length > 0 ? (
            <Animated.View
              style={[
                styles.containerBlock,
                styles.studentContainerBlock,
                {
                  opacity: bodyCardOpacity,
                  transform: [{ translateY: bodyCardTranslateY }],
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Ananda</Text>
                </View>
                {children.length > 1 && (
                  <View style={styles.studentCardCountBadge}>
                    <Text style={styles.studentCardCountBadgeText}>
                      {safeCenter + 1} dari {children.length} Ananda
                    </Text>
                  </View>
                )}
              </View>

              {children.length === 1 ? (
                <View style={styles.singleHeroCardContainer}>
                  <StudentHeroCard
                    child={children[0]}
                    isSelected={true}
                    isSingleChild={true}
                    showActionButtons={true}
                    cardLabel="Kartu Siswa"
                    calendarLabel="Jadwal"
                    portalLabel="Menu"
                    onPressCard={() => openIdCard(children[0])}
                    onPressQr={() => openQrCard(children[0])}
                    onPressWeeklyReport={() => setSelectedWeeklyStudent(children[0])}
                    onPressNotifications={() => navigation?.navigate('Notifikasi')}
                    onPressCalendar={() => openScheduleForStudent(children[0])}
                    onPressPortal={() => setSelectedMenuStudent(children[0])}
                  />
                </View>
              ) : (
                <>
                  <ScrollView
                    ref={studentScrollRef}
                    horizontal
                    nestedScrollEnabled={true}
                    showsHorizontalScrollIndicator={false}
                    contentOffset={{ x: centerLoopOffset, y: 0 }}
                    contentContainerStyle={[
                      styles.studentCardsTrack,
                      { paddingHorizontal: studentTrackPad },
                    ]}
                    decelerationRate="fast"
                    snapToInterval={studentSnapInterval}
                    snapToAlignment="start"
                    disableIntervalMomentum
                    onMomentumScrollEnd={(e) => {
                      if (studentLoopCount === 0) return;
                      const offsetX = e.nativeEvent.contentOffset.x;
                      const slot = Math.round(offsetX / studentSnapInterval);
                      const n = studentLoopCount;
                      const cur = ((activeChildIndex % n) + n) % n;
                      let realIdx = cur;
                      if (slot === 2) realIdx = (cur + 1) % n;
                      else if (slot === 0) realIdx = (cur - 1 + n) % n;
                      if (realIdx !== cur) {
                        setActiveChildIndex(realIdx);
                        syncLoopChildId(realIdx);
                        requestAnimationFrame(() => {
                          recenterLoop();
                        });
                      } else {
                        recenterLoop();
                      }
                    }}
                    onScrollEndDrag={(e) => {
                      if (studentLoopCount === 0) return;
                      const offsetX = e.nativeEvent.contentOffset.x;
                      const slot = Math.round(offsetX / studentSnapInterval);
                      const n = studentLoopCount;
                      const cur = ((activeChildIndex % n) + n) % n;
                      let realIdx = cur;
                      if (slot === 2) realIdx = (cur + 1) % n;
                      else if (slot === 0) realIdx = (cur - 1 + n) % n;
                      if (realIdx !== cur) {
                        setActiveChildIndex(realIdx);
                        syncLoopChildId(realIdx);
                      }
                    }}
                    scrollEventThrottle={16}
                    style={styles.heroCardScrollContainer}
                  >
                    {loopWindow.list.map((child: any, sIdx: number) => {
                      const realIdx = loopWindow.realIdx[sIdx] ?? 0;
                      const isCardActive = realIdx === safeCenter;
                      return (
                        <StudentHeroCard
                          key={`win-${sIdx}-${String(child?.id ?? realIdx)}`}
                          child={child}
                          isSelected={isCardActive}
                          isSingleChild={false}
                          showActionButtons={true}
                          cardWidth={studentCardWidth}
                          cardLabel="Kartu Siswa"
                          calendarLabel="Jadwal"
                          portalLabel="Menu"
                          onSelect={isCardActive ? undefined : () => goToLoopChild(realIdx)}
                          onPressCard={() => openIdCard(child)}
                          onPressQr={() => openQrCard(child)}
                          onPressWeeklyReport={() => setSelectedWeeklyStudent(child)}
                          onPressNotifications={() => navigation?.navigate('Notifikasi')}
                          onPressCalendar={() => openScheduleForStudent(child)}
                          onPressPortal={() => setSelectedMenuStudent(child)}
                        />
                      );
                    })}
                  </ScrollView>

                  {/* DOT INDIKATOR SCROLL SISWA */}
                  <View style={styles.paginationDotsRow}>
                    {children.map((_, dotIdx) => {
                      const isDotActive = dotIdx === safeCenter;
                      return (
                        <TouchableOpacity
                          key={dotIdx}
                          activeOpacity={0.7}
                          onPress={() => goToLoopChild(dotIdx)}
                          style={[
                            styles.paginationDot,
                            isDotActive && styles.paginationDotActive,
                          ]}
                        />
                      );
                    })}
                  </View>
                </>
              )}
            </Animated.View>
          ) : studentInfo ? (
            <Animated.View
              style={[
                styles.containerBlock,
                styles.studentContainerBlock,
                {
                  opacity: bodyCardOpacity,
                  transform: [{ translateY: bodyCardTranslateY }],
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Ananda</Text>
                </View>
              </View>

              <View style={styles.singleHeroCardContainer}>
                <StudentHeroCard
                  child={studentInfo}
                  isSelected={true}
                  isSingleChild={true}
                  showActionButtons={true}
                  cardLabel="Kartu Siswa"
                  calendarLabel="Jadwal"
                  portalLabel="Menu"
                  onPressCard={() => openIdCard(studentInfo)}
                  onPressQr={() => openQrCard(studentInfo)}
                  onPressWeeklyReport={() => setSelectedWeeklyStudent(studentInfo)}
                  onPressNotifications={() => navigation?.navigate('Notifikasi')}
                  onPressCalendar={() => openScheduleForStudent(studentInfo)}
                  onPressPortal={() => setSelectedMenuStudent(studentInfo)}
                />
              </View>
            </Animated.View>
          ) : user ? (
            <Animated.View
              style={[
                styles.containerBlock,
                styles.studentContainerBlock,
                {
                  opacity: bodyCardOpacity,
                  transform: [{ translateY: bodyCardTranslateY }],
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Pengguna & Unit</Text>
                </View>
              </View>

              {(() => {
                const userName = String(user?.name || user?.full_name || user?.nama_lengkap || 'Pengguna');
                const userRole = typeof user?.role === 'string' ? user.role : (Array.isArray(user?.roles) && user.roles[0] ? String(user.roles[0]) : 'Pengguna');
                const userUnit = String((user as any)?.unit_name || (user as any)?.education_unit?.name || (user as any)?.unit?.name || 'Unit Pendidikan');
                const avatarUri = getProfileImageUrl(user);

                return (
                  <LinearGradient
                    colors={['#0D6B42', '#18A165', '#2BD988']}
                    locations={[0, 0.55, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.childCardHeroSizeSingle}
                  >
                    <View style={styles.cardDecorCircle} />

                    <View style={styles.childHeroTopRow}>
                      <View style={styles.avatarBorderWrapHero}>
                        {avatarUri ? (
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={styles.avatarInitialText}>{userName.charAt(0).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={styles.childInfoCol}>
                        <Text numberOfLines={1} style={styles.childNameHero}>
                          {userName}
                        </Text>
                        <Text style={styles.childSubInfoHero}>
                          Status: {userRole}
                        </Text>
                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {userUnit}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.selectedActionBtnRight}>
                        <MaterialCommunityIcons name="check-circle" size={18} color="#18A165" />
                        <Text style={styles.selectedActionBtnText}>Aktif</Text>
                      </View>
                    </View>

                    <View style={styles.studentAttributesGrid}>
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Peran</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{userRole}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Akses</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>Resmi</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Presensi</Text>
                        <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Hadir</Text>
                      </View>
                    </View>
                  </LinearGradient>
                );
              })()}
            </Animated.View>
          ) : null}

          {/* 1.5. VIEW MODE TABS: [Batas Waktu] | [Jeda] | [Jadwal] (Layar 1 & 12) */}
          <View style={styles.viewModeTabBar}>
            {[
              { key: 'batas_waktu', label: 'Batas Waktu', icon: 'calendar-clock-outline' },
              { key: 'jeda', label: 'Jeda', icon: 'coffee-outline' },
              { key: 'jadwal', label: 'Jadwal', icon: 'calendar-month-outline' },
            ].map((vTab) => {
              const isActive = activeViewMode === vTab.key;
              return (
                <TouchableOpacity
                  key={vTab.key}
                  activeOpacity={0.8}
                  onPress={() => setActiveViewMode(vTab.key as any)}
                  style={[styles.viewModeTabBtn, isActive && styles.viewModeTabBtnActive]}
                >
                  <MaterialCommunityIcons
                    name={vTab.icon as any}
                    size={16}
                    color={isActive ? '#FFFFFF' : '#475569'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.viewModeTabText, isActive && styles.viewModeTabTextActive]}>
                    {vTab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 2. RINGKASAN TUGAS (4 KPI HORIZONTAL ROW - Layar 1) */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderBetween}>
              <View style={styles.sectionHeaderLeft}>
                <View style={styles.sectionIconBadge}>
                  <MaterialCommunityIcons name="poll" size={18} color="#059669" />
                </View>
                <Text style={styles.sectionTitleBold}>Ringkasan Tugas</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedSemester((prev) =>
                    prev.startsWith('Semester 1')
                      ? `Semester 2 (${defaultAcademicYear})`
                      : `Semester 1 (${defaultAcademicYear})`
                  );
                }}
                style={styles.semesterDropdownPill}
              >
                <Text style={styles.semesterDropdownText}>{selectedSemester}</Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.kpiRowContainer}>
              {/* CARD 1: TUGAS AKTIF */}
              <View style={[styles.kpiPillCard, { backgroundColor: '#E6FBF2', borderColor: '#D1FAE5' }]}>
                <View style={styles.kpiCardTopRow}>
                  <View style={[styles.kpiBadgeIcon, { backgroundColor: '#10B981' }]}>
                    <MaterialCommunityIcons name="calendar-check" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCardNumber, { color: '#065F46' }]}>{kpi.tugas_aktif}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.kpiCardLabel, { color: '#065F46' }]}>
                  Tugas Aktif
                </Text>
              </View>

              {/* CARD 2: BELUM DIKERJAKAN */}
              <View style={[styles.kpiPillCard, { backgroundColor: '#FFF9E6', borderColor: '#FEF3C7' }]}>
                <View style={styles.kpiCardTopRow}>
                  <View style={[styles.kpiBadgeIcon, { backgroundColor: '#F59E0B' }]}>
                    <MaterialCommunityIcons name="clock-outline" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCardNumber, { color: '#92400E' }]}>{kpi.belum_dikumpulkan}</Text>
                </View>
                <Text numberOfLines={2} style={[styles.kpiCardLabel, { color: '#92400E' }]}>
                  Belum Dikerjakan
                </Text>
              </View>

              {/* CARD 3: TERLAMBAT */}
              <View style={[styles.kpiPillCard, { backgroundColor: '#FEECEB', borderColor: '#FEE2E2' }]}>
                <View style={styles.kpiCardTopRow}>
                  <View style={[styles.kpiBadgeIcon, { backgroundColor: '#EF4444' }]}>
                    <MaterialCommunityIcons name="alert-circle" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCardNumber, { color: '#B91C1C' }]}>{kpi.terlambat}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.kpiCardLabel, { color: '#B91C1C' }]}>
                  Terlambat
                </Text>
              </View>

              {/* CARD 4: SUDAH DINILAI */}
              <View style={[styles.kpiPillCard, { backgroundColor: '#F3E8FF', borderColor: '#E9D5FF' }]}>
                <View style={styles.kpiCardTopRow}>
                  <View style={[styles.kpiBadgeIcon, { backgroundColor: '#8B5CF6' }]}>
                    <MaterialCommunityIcons name="check-circle" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCardNumber, { color: '#6D28D9' }]}>{kpi.sudah_dinilai}</Text>
                </View>
                <Text numberOfLines={2} style={[styles.kpiCardLabel, { color: '#6D28D9' }]}>
                  Sudah Dinilai
                </Text>
              </View>
            </View>
          </View>

          {/* 3. FILTER TABS & SEARCH / FILTER BUTTON */}
          <View style={styles.filterSectionBlock}>
            {/* Filter Pills Scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterPillsScroll}
            >
              {[
                { key: 'all', label: 'Semua' },
                { key: 'pending', label: 'Belum Dikerjakan' },
                { key: 'submitted', label: 'Sudah Dikumpulkan' },
                { key: 'late', label: 'Terlambat' },
                { key: 'graded', label: 'Sudah Dinilai' },
              ].map((tabItem) => {
                const isActive = activeTab === tabItem.key;
                return (
                  <TouchableOpacity
                    key={tabItem.key}
                    activeOpacity={0.8}
                    onPress={() => setActiveTab(tabItem.key as any)}
                    style={[styles.filterCapsuleBtn, isActive && styles.filterCapsuleBtnActive]}
                  >
                    <Text style={[styles.filterCapsuleText, isActive && styles.filterCapsuleTextActive]}>
                      {tabItem.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Search Box & Filter Button Row */}
            <View style={styles.searchAndFilterRow}>
              <View style={styles.searchBarContainer}>
                <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" style={{ marginRight: 8 }} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Cari tugas, mapel, atau guru..."
                  placeholderTextColor="#94A3B8"
                  style={styles.searchInputField}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setFilterModalVisible(true)}
                style={[
                  styles.filterActionButton,
                  (modalFilterStatus !== 'all' || modalFilterSubject !== 'all' || modalFilterType !== 'all') && {
                    backgroundColor: '#ECFDF5',
                    borderColor: '#10B981',
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="filter-variant"
                  size={18}
                  color={
                    modalFilterStatus !== 'all' || modalFilterSubject !== 'all' || modalFilterType !== 'all'
                      ? '#059669'
                      : '#334155'
                  }
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.filterActionButtonText,
                    (modalFilterStatus !== 'all' || modalFilterSubject !== 'all' || modalFilterType !== 'all') && {
                      color: '#059669',
                      fontWeight: '800',
                    },
                  ]}
                >
                  Filter
                </Text>
                {(modalFilterStatus !== 'all' || modalFilterSubject !== 'all' || modalFilterType !== 'all') && (
                  <View style={styles.filterDotBadge} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* 4. CONTENT BERDASARKAN VIEW MODE: JADWAL (Layar 12) ATAU DAFTAR TUGAS (Layar 1 & 7) */}
          {activeViewMode === 'jadwal' ? (
            <View style={styles.containerBlock}>
              <View style={styles.calendarMonthHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="calendar-month" size={18} color="#059669" />
                  <Text style={styles.calendarMonthTitle}>
                    {selectedCalendarDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}
                  </Text>
                </View>
                <View style={styles.calendarMonthPill}>
                  <Text style={styles.calendarMonthPillText}>Pekan Aktif</Text>
                </View>
              </View>

              {/* 5-DAY STRIP (Senin - Jumat) */}
              <View style={styles.weekStripRow}>
                {calendarWeekDays.map((wd) => {
                  const isSelected =
                    wd.dateObj.getDate() === selectedCalendarDate.getDate() &&
                    wd.dateObj.getMonth() === selectedCalendarDate.getMonth();
                  return (
                    <TouchableOpacity
                      key={wd.iso}
                      activeOpacity={0.8}
                      onPress={() => setSelectedCalendarDate(wd.dateObj)}
                      style={[styles.weekDayCard, isSelected && styles.weekDayCardSelected]}
                    >
                      <Text style={[styles.weekDayName, isSelected && styles.weekDayNameSelected]}>
                        {wd.dayName}
                      </Text>
                      <Text style={[styles.weekDayNum, isSelected && styles.weekDayNumSelected]}>
                        {wd.dayNum}
                      </Text>
                      {isSelected && <View style={styles.weekDayActiveDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* DAFTAR TUGAS DALAM HARI INI */}
              <View style={[styles.sectionHeaderBetween, { marginTop: 14, marginBottom: 10 }]}>
                <View style={styles.sectionHeaderLeft}>
                  <MaterialCommunityIcons name="clipboard-clock-outline" size={18} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitleBold}>
                    Tugas ({calendarDayAssignments.length})
                  </Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
                  {calendarWeekDays.find((d) => d.dateObj.getDate() === selectedCalendarDate.getDate())?.dayName || 'Hari Ini'}, {selectedCalendarDate.getDate()} {selectedCalendarDate.toLocaleString('id-ID', { month: 'short' })}
                </Text>
              </View>

              {calendarDayAssignments.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialCommunityIcons name="calendar-check-outline" size={40} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>Tidak Ada Tugas pada Hari Ini</Text>
                  <Text style={styles.emptySubtitle}>Nikmati waktu belajar mandiri atau selesaikan tugas pekanan lainnya.</Text>
                </View>
              ) : (
                calendarDayAssignments.map((item, idx) => {
                  const statusObj = getAssignmentStatus(item);
                  const subjectName = item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || '';
                  const subjectTheme = getSubjectTheme(subjectName);
                  const taskTitle = cleanTaskTitle(item.judul_tugas || item.judul || item.title || 'Penugasan');
                  const sub = Array.isArray(item.pengumpulan_tugas) && item.pengumpulan_tugas.length > 0
                    ? item.pengumpulan_tugas[0]
                    : item.submission;
                  const isGraded = statusObj.key === 'graded' || (sub && sub.nilai_guru !== null && sub.nilai_guru !== undefined);

                  return (
                    <View key={String(item.id || idx)} style={styles.calendarTaskCard}>
                      <View style={styles.calendarTaskTimeBar}>
                        <MaterialCommunityIcons name="clock-outline" size={13} color="#059669" />
                        <Text style={styles.calendarTaskTimeText}>07.30 - 09.00 WIB</Text>
                        <View style={{ flex: 1 }} />
                        <View style={[styles.statusPillBadge, { backgroundColor: statusObj.bg }]}>
                          <Text style={[styles.statusPillText, { color: statusObj.color, fontSize: 9.5 }]}>{statusObj.label}</Text>
                        </View>
                      </View>

                      <View style={styles.calendarTaskBody}>
                        <View style={[styles.calendarSubjectPill, { backgroundColor: subjectTheme.badgeBg, borderColor: subjectTheme.badgeBorder }]}>
                          <MaterialCommunityIcons name={subjectTheme.icon} size={12} color={subjectTheme.iconColor} style={{ marginRight: 4 }} />
                          <Text style={[styles.calendarSubjectPillText, { color: subjectTheme.badgeText }]}>{subjectName || 'Umum'}</Text>
                        </View>
                        <Text numberOfLines={2} style={styles.calendarTaskTitleText}>{taskTitle}</Text>

                        <View style={styles.calendarTaskFooterRow}>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setSelectedDetailAssignment(item)}
                            style={styles.calendarTaskDetailBtn}
                          >
                            <Text style={styles.calendarTaskDetailBtnText}>Detail Tugas</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                              setSelectedAssignment(item);
                              setSubmissionText(sub?.jawaban_teks || '');
                              setPickedAttachment(null);
                            }}
                            style={styles.calendarTaskSubmitBtn}
                          >
                            <Text style={styles.calendarTaskSubmitBtnText}>
                              {isGraded ? 'Lihat Nilai' : statusObj.key === 'submitted' ? 'Kirim Ulang' : 'Kumpulkan'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            <View style={styles.containerBlock}>
              <View style={styles.sectionHeaderBetween}>
                <View style={styles.sectionHeaderLeft}>
                  <MaterialCommunityIcons name="clipboard-text" size={20} color="#059669" style={{ marginRight: 8 }} />
                  <Text numberOfLines={1} style={styles.sectionTitleBold}>
                    Daftar Tugas {activeStudentName ? `"${activeStudentName}"` : 'Siswa'} ({filteredAssignments.length})
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSortOrder((prev) => (prev === 'latest' ? 'deadline' : 'latest'))}
                  style={styles.sortPillButton}
                >
                  <MaterialCommunityIcons name="swap-vertical" size={16} color="#475569" style={{ marginRight: 4 }} />
                  <Text style={styles.sortPillText}>{sortOrder === 'latest' ? 'Terbaru' : 'Tenggat'}</Text>
                </TouchableOpacity>
              </View>

              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color="#18A165" size="large" />
                  <Text style={styles.loadingText}>Memuat tugas dari sistem...</Text>
                </View>
              ) : filteredAssignments.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialCommunityIcons name="clipboard-check-outline" size={46} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>Tidak Ada Tugas</Text>
                  <Text style={styles.emptySubtitle}>
                    {activeTab === 'all'
                      ? 'Belum ada tugas yang diterbitkan untuk kelas dan siswa ini.'
                      : `Tidak ada tugas dengan status "${activeTab}".`}
                  </Text>
                </View>
              ) : (
                filteredAssignments.map((item, idx) => {
                  const sub = Array.isArray(item.pengumpulan_tugas) && item.pengumpulan_tugas.length > 0
                    ? item.pengumpulan_tugas[0]
                    : Array.isArray(item.pengumpulanTugas) && item.pengumpulanTugas.length > 0
                    ? item.pengumpulanTugas[0]
                    : item.submission;

                  const statusObj = getAssignmentStatus(item);
                  const subjectName = item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || '';
                  const subjectTheme = getSubjectTheme(subjectName);
                  const teacherName = item.teacher?.name || item.teacher?.nama_lengkap || item.guru?.nama_lengkap || item.guru?.nama || item.teacher_name || '';
                  const taskTitle = cleanTaskTitle(item.judul_tugas || item.judul || item.title || 'Penugasan');
                  const taskDesc = item.deskripsi || item.instruksi || '';
                  const deadlineFormatted = formatDeadline(item.deadline);
                  const isGraded = statusObj.key === 'graded' || (sub && sub.nilai_guru !== null && sub.nilai_guru !== undefined);
                  const attachmentCount = item.attachments_count ?? (Array.isArray(item.attachments) ? item.attachments.length : (Array.isArray(item.files) ? item.files.length : (item.file_url || item.lampiran ? 1 : 0)));
                  const isGroup = item.jenis_tugas === 'kelompok';

                  return (
                    <View key={String(item.id || idx)} style={styles.assignmentCardModern}>
                      {/* Top Row: Left Subject Icon Box & Right Info */}
                      <View style={styles.cardHeaderFlex}>
                        <View style={[styles.subjectIconBoxLarge, { backgroundColor: subjectTheme.bgIcon }]}>
                          <MaterialCommunityIcons name={subjectTheme.icon} size={28} color={subjectTheme.iconColor} />
                        </View>

                        <View style={styles.cardInfoCol}>
                          <View style={styles.cardBadgesRow}>
                            {subjectName ? (
                              <View
                                style={[
                                  styles.subjectPillBadge,
                                  { backgroundColor: subjectTheme.badgeBg, borderColor: subjectTheme.badgeBorder },
                                ]}
                              >
                                <MaterialCommunityIcons
                                  name="book-outline"
                                  size={11}
                                  color={subjectTheme.badgeText}
                                  style={{ marginRight: 4 }}
                                />
                                <Text numberOfLines={1} style={[styles.subjectPillText, { color: subjectTheme.badgeText }]}>
                                  {subjectName}
                                </Text>
                              </View>
                            ) : null}

                            {(item.jenis_tugas === 'quiz' || item.jenis_soal === 'quiz') && (
                              <View style={[styles.statusPillBadge, { backgroundColor: '#F3E8FF', borderColor: '#D8B4FE', borderWidth: 1 }]}>
                                <MaterialCommunityIcons name="lightning-bolt" size={12} color="#7C3AED" style={{ marginRight: 3 }} />
                                <Text style={[styles.statusPillText, { color: '#7C3AED', fontWeight: '800' }]}>Kuis CBT</Text>
                              </View>
                            )}

                            {isGroup && (
                              <View style={[styles.statusPillBadge, { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD', borderWidth: 1 }]}>
                                <MaterialCommunityIcons name="account-group-outline" size={12} color="#0284C7" style={{ marginRight: 3 }} />
                                <Text style={[styles.statusPillText, { color: '#0284C7', fontWeight: '800' }]}>Kelompok</Text>
                              </View>
                            )}

                            <View style={[styles.statusPillBadge, { backgroundColor: statusObj.bg }]}>
                              <MaterialCommunityIcons
                                name={statusObj.icon}
                                size={12}
                                color={statusObj.color}
                                style={{ marginRight: 3 }}
                              />
                              <Text style={[styles.statusPillText, { color: statusObj.color }]}>
                                {statusObj.label}
                              </Text>
                            </View>
                          </View>

                          <Text style={styles.cardTaskTitle} numberOfLines={2}>
                            {taskTitle}
                          </Text>

                          {taskDesc ? (
                            <Text style={styles.cardTaskDesc} numberOfLines={2}>
                              {taskDesc}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      {/* Metadata 3-Column Box */}
                      <View style={styles.metadataContainerBox}>
                        {/* Col 1: Deadline */}
                        <View style={styles.metaColumnItem}>
                          <MaterialCommunityIcons name="calendar-blank-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.metaLabelText}>Deadline</Text>
                            <Text numberOfLines={1} style={styles.metaValueText}>{deadlineFormatted}</Text>
                          </View>
                        </View>

                        {teacherName ? (
                          <>
                            <View style={styles.metaVerticalDivider} />
                            {/* Col 2: Guru */}
                            <View style={styles.metaColumnItem}>
                              <MaterialCommunityIcons name="account-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.metaLabelText}>Guru</Text>
                                <Text numberOfLines={1} style={styles.metaValueText}>{teacherName}</Text>
                              </View>
                            </View>
                          </>
                        ) : null}

                        {attachmentCount > 0 ? (
                          <>
                            <View style={styles.metaVerticalDivider} />
                            {/* Col 3: Lampiran */}
                            <View style={[styles.metaColumnItem, { flex: 0.85 }]}>
                              <MaterialCommunityIcons name="file-document-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.metaLabelText}>Lampiran</Text>
                                <Text numberOfLines={1} style={styles.metaValueText}>{attachmentCount} file</Text>
                              </View>
                            </View>
                          </>
                        ) : null}
                      </View>

                      {(() => {
                        const mats = Array.isArray(item.materials) && item.materials.length > 0
                          ? item.materials
                          : (item.materi ? [item.materi] : []);
                        if (mats.length === 0) return null;
                        return mats.map((mat: any, mIdx: number) => (
                          <TouchableOpacity
                            key={mat.id || mIdx}
                            activeOpacity={mat?.link || mat?.file ? 0.75 : 1}
                            onPress={() => {
                              const targetUrl = mat?.link || mat?.file;
                              if (targetUrl) {
                                Linking.openURL(targetUrl);
                              }
                            }}
                            style={[styles.cardAttachmentLinkRow, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', marginBottom: 4 }]}
                          >
                            <MaterialCommunityIcons name="book-open-page-variant-outline" size={16} color="#059669" />
                            <Text numberOfLines={1} style={[styles.cardAttachmentLinkText, { color: '#065F46', flex: 1 }]}>
                              Materi: {mat.judul}
                            </Text>
                            {mat?.link || mat?.file ? (
                              <MaterialCommunityIcons name="open-in-new" size={14} color="#059669" />
                            ) : null}
                          </TouchableOpacity>
                        ));
                      })()}

                      {item.file_lampiran_url ? (
                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => Linking.openURL(item.file_lampiran_url)}
                          style={styles.cardAttachmentLinkRow}
                        >
                          <MaterialCommunityIcons name="file-pdf-box" size={16} color="#059669" />
                          <Text numberOfLines={1} style={styles.cardAttachmentLinkText}>Buka Lembar Berkas Soal Guru</Text>
                          <MaterialCommunityIcons name="chevron-right" size={16} color="#059669" />
                        </TouchableOpacity>
                      ) : null}

                      {/* Footer: Graded frame vs Pending reminder & buttons */}
                      {isGraded ? (
                        <View style={styles.gradedCardFrameModern}>
                          <View style={styles.gradedTopRow}>
                            <View style={styles.scorePillBadge}>
                              <MaterialCommunityIcons name="star" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                              <Text style={styles.scorePillLabel}>Nilai</Text>
                              <Text style={styles.scorePillValue}>{sub?.nilai_guru ?? sub?.nilai ?? '-'}</Text>
                            </View>
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => setSelectedDetailAssignment(item)}
                              style={styles.gradedDetailBtn}
                            >
                              <Text style={styles.gradedDetailBtnText}>Lihat Detail</Text>
                              <MaterialCommunityIcons name="chevron-right" size={14} color="#059669" />
                            </TouchableOpacity>
                          </View>

                          {sub?.catatan_guru || sub?.catatan ? (
                            <View style={styles.teacherNoteBoxModern}>
                              <MaterialCommunityIcons name="message-text" size={14} color="#059669" style={{ marginTop: 2, marginRight: 6 }} />
                              <Text style={styles.teacherNoteTextModern}>
                                <Text style={{ fontWeight: '800', color: '#065F46' }}>Catatan: </Text>
                                {sub?.catatan_guru || sub?.catatan}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <View style={styles.pendingActionRow}>
                          <View style={styles.pendingAlertBoxModern}>
                            <MaterialCommunityIcons
                              name={canSubmit ? 'information-outline' : 'shield-account'}
                              size={16}
                              color="#D97706"
                              style={{ marginRight: 6 }}
                            />
                            <Text numberOfLines={1} style={styles.pendingAlertTextModern}>
                              {item.jenis_tugas === 'quiz'
                                ? 'Kuis CBT berbatas waktu.'
                                : isGroup
                                ? 'Tugas kerja kelompok.'
                                : 'Selesaikan sebelum batas waktu.'}
                            </Text>
                          </View>

                          <View style={styles.actionButtonsCluster}>
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => setSelectedDetailAssignment(item)}
                              style={styles.detailOutlineBtn}
                            >
                              <Text style={styles.detailOutlineBtnText}>Detail</Text>
                            </TouchableOpacity>

                            {isGroup && (
                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setGroupModalVisible(true)}
                                style={styles.groupOutlineBtn}
                              >
                                <MaterialCommunityIcons name="account-group" size={13} color="#0284C7" />
                                <Text style={styles.groupOutlineBtnText}>Kelompok</Text>
                              </TouchableOpacity>
                            )}

                            {canSubmit && (
                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => {
                                  setSelectedAssignment(item);
                                  setSubmissionText(sub?.jawaban_teks || '');
                                  setPickedAttachment(null);
                                  try {
                                    if (item.jenis_tugas === 'quiz' && sub?.jawaban_teks && sub.jawaban_teks.trim().startsWith('{')) {
                                      setQuizAnswers(JSON.parse(sub.jawaban_teks));
                                    } else {
                                      setQuizAnswers({});
                                    }
                                  } catch {
                                    setQuizAnswers({});
                                  }
                                }}
                                style={[
                                  styles.kumpulkanBtnModern,
                                  item.jenis_tugas === 'quiz' && { backgroundColor: '#7C3AED' },
                                ]}
                              >
                                <MaterialCommunityIcons
                                  name={item.jenis_tugas === 'quiz' ? 'lightning-bolt' : 'tray-arrow-up'}
                                  size={14}
                                  color="#FFFFFF"
                                  style={{ marginRight: 4 }}
                                />
                                <Text style={styles.kumpulkanBtnTextModern}>
                                  {item.jenis_tugas === 'quiz'
                                    ? (statusObj.key === 'submitted' ? 'Kirim Ulang' : '⚡ Kuis')
                                    : (statusObj.key === 'submitted' ? 'Kirim Ulang' : 'Kumpulkan')}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}
          </View>
        </Animated.ScrollView>

        {/* ======================================================== */}
        {/* MODAL 1: FILTER & PENCARIAN (Layar 2)                   */}
        {/* ======================================================== */}
        <Modal
          visible={filterModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setFilterModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Filter Tugas Siswa</Text>
                  <Text style={styles.modalSubtitle}>Sesuaikan kriteria tampilan penugasan</Text>
                </View>
                <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.modalCloseBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                {/* Status Pengerjaan */}
                <Text style={styles.filterSectionHeading}>Status Pengerjaan:</Text>
                <View style={styles.filterPillsWrap}>
                  {[
                    { key: 'all', label: 'Semua Status' },
                    { key: 'pending', label: 'Belum Dikerjakan' },
                    { key: 'late', label: 'Terlambat' },
                    { key: 'submitted', label: 'Sudah Dikumpulkan' },
                    { key: 'graded', label: 'Sudah Dinilai' },
                  ].map((st) => {
                    const isSel = modalFilterStatus === st.key;
                    return (
                      <TouchableOpacity
                        key={st.key}
                        activeOpacity={0.8}
                        onPress={() => setModalFilterStatus(st.key)}
                        style={[styles.modalFilterPill, isSel && styles.modalFilterPillActive]}
                      >
                        <Text style={[styles.modalFilterPillText, isSel && styles.modalFilterPillTextActive]}>
                          {st.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Mata Pelajaran */}
                <Text style={[styles.filterSectionHeading, { marginTop: 16 }]}>Mata Pelajaran:</Text>
                <View style={styles.filterPillsWrap}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setModalFilterSubject('all')}
                    style={[styles.modalFilterPill, modalFilterSubject === 'all' && styles.modalFilterPillActive]}
                  >
                    <Text style={[styles.modalFilterPillText, modalFilterSubject === 'all' && styles.modalFilterPillTextActive]}>
                      Semua Mapel
                    </Text>
                  </TouchableOpacity>
                  {availableSubjects.map((subName) => {
                    const isSel = modalFilterSubject.toLowerCase() === subName.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={subName}
                        activeOpacity={0.8}
                        onPress={() => setModalFilterSubject(subName)}
                        style={[styles.modalFilterPill, isSel && styles.modalFilterPillActive]}
                      >
                        <Text style={[styles.modalFilterPillText, isSel && styles.modalFilterPillTextActive]}>
                          {subName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Jenis Penugasan */}
                <Text style={[styles.filterSectionHeading, { marginTop: 16 }]}>Jenis Penugasan:</Text>
                <View style={styles.filterPillsWrap}>
                  {[
                    { key: 'all', label: 'Semua Jenis' },
                    { key: 'individu', label: 'Tugas Individu' },
                    { key: 'kelompok', label: 'Tugas Kelompok' },
                    { key: 'quiz', label: 'Kuis CBT' },
                  ].map((tp) => {
                    const isSel = modalFilterType === tp.key;
                    return (
                      <TouchableOpacity
                        key={tp.key}
                        activeOpacity={0.8}
                        onPress={() => setModalFilterType(tp.key)}
                        style={[styles.modalFilterPill, isSel && styles.modalFilterPillActive]}
                      >
                        <Text style={[styles.modalFilterPillText, isSel && styles.modalFilterPillTextActive]}>
                          {tp.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  onPress={() => {
                    setModalFilterStatus('all');
                    setModalFilterSubject('all');
                    setModalFilterType('all');
                  }}
                  style={styles.modalResetBtn}
                >
                  <Text style={styles.modalResetBtnText}>Reset</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setFilterModalVisible(false)}
                  style={styles.modalApplyBtn}
                >
                  <Text style={styles.modalApplyBtnText}>Terapkan Filter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 2: DETAIL TUGAS (Layar 3, 8, 9)                    */}
        {/* ======================================================== */}
        <Modal
          visible={!!selectedDetailAssignment}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedDetailAssignment(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '92%' }]}>
              {(() => {
                if (!selectedDetailAssignment) return null;
                const statusObj = getAssignmentStatus(selectedDetailAssignment);
                const sub = Array.isArray(selectedDetailAssignment.pengumpulan_tugas) && selectedDetailAssignment.pengumpulan_tugas.length > 0
                  ? selectedDetailAssignment.pengumpulan_tugas[0]
                  : Array.isArray(selectedDetailAssignment.pengumpulanTugas) && selectedDetailAssignment.pengumpulanTugas.length > 0
                  ? selectedDetailAssignment.pengumpulanTugas[0]
                  : selectedDetailAssignment.submission;
                const isGraded = statusObj.key === 'graded' || (sub && sub.nilai_guru !== null && sub.nilai_guru !== undefined);
                const isLate = statusObj.key === 'late';
                const isGroup = selectedDetailAssignment.jenis_tugas === 'kelompok';
                const subjectName = selectedDetailAssignment.subject?.name || selectedDetailAssignment.subject?.nama_mapel || selectedDetailAssignment.mata_pelajaran || '';
                const subjectTheme = getSubjectTheme(subjectName);
                const teacherName = selectedDetailAssignment.teacher?.name || selectedDetailAssignment.teacher?.nama_lengkap || selectedDetailAssignment.guru?.nama_lengkap || selectedDetailAssignment.guru?.nama || '';
                const taskTitle = cleanTaskTitle(selectedDetailAssignment.judul_tugas || selectedDetailAssignment.judul || selectedDetailAssignment.title || 'Penugasan');

                return (
                  <>
                    <View style={styles.modalHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalTitle}>Detail Tugas</Text>
                        <Text numberOfLines={1} style={styles.modalSubtitle}>
                          {subjectName ? `${subjectName} • ` : ''}Tahun Ajaran {getDynamicAcademicInfo(selectedDetailAssignment)}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setSelectedDetailAssignment(null)} style={styles.modalCloseBtn}>
                        <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                      </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.modalBody}>
                      {/* Layar 9: Banner Peringatan Keterlambatan jika Terlambat */}
                      {isLate && (
                        <View style={styles.lateWarningBanner}>
                          <MaterialCommunityIcons name="alert-circle" size={22} color="#DC2626" />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.lateWarningTitle}>Tugas Ini Sudah Terlambat!</Text>
                            <Text style={styles.lateWarningDesc}>
                              Batas waktu telah berakhir. Segera kumpulkan tugas agar tidak mengurangi poin penilaian ananda.
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Layar 8: Pencapaian Nilai jika Sudah Dinilai */}
                      {isGraded && (
                        <View style={styles.gradedHeroBanner}>
                          <LinearGradient
                            colors={['#064E3B', '#047857']}
                            style={styles.gradedHeroGradient}
                          >
                            <View style={styles.gradedScoreCircle}>
                              <Text style={styles.gradedScoreVal}>{sub?.nilai_guru ?? sub?.nilai ?? 92}</Text>
                              <Text style={styles.gradedScoreMax}>/100</Text>
                            </View>
                            <View style={{ flex: 1, marginLeft: 14 }}>
                              <View style={styles.gradeLetterBadge}>
                                <Text style={styles.gradeLetterText}>Grade {sub?.nilai_huruf || 'A'}</Text>
                              </View>
                              <Text style={styles.gradedHeroTitle}>Tugas Sudah Dinilai</Text>
                              <Text style={styles.gradedHeroSub}>Diperiksa oleh {teacherName || 'Guru Pembimbing'}</Text>
                            </View>
                          </LinearGradient>

                          {(sub?.catatan_guru || sub?.catatan) && (
                            <View style={styles.feedbackCardBox}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 5 }}>
                                <MaterialCommunityIcons name="comment-text-outline" size={15} color="#059669" />
                                <Text style={styles.feedbackCardLabel}>Catatan & Evaluasi Guru:</Text>
                              </View>
                              <Text style={styles.feedbackCardContent}>
                                {sub?.catatan_guru || sub?.catatan}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Header Badge & Title */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: isLate || isGraded ? 12 : 0 }}>
                        <View style={[styles.subjectPillBadge, { backgroundColor: subjectTheme.badgeBg, borderColor: subjectTheme.badgeBorder }]}>
                          <Text style={[styles.subjectPillText, { color: subjectTheme.badgeText }]}>{subjectName || 'Umum'}</Text>
                        </View>
                        <View style={[styles.statusPillBadge, { backgroundColor: statusObj.bg }]}>
                          <Text style={[styles.statusPillText, { color: statusObj.color }]}>{statusObj.label}</Text>
                        </View>
                        {isGroup && (
                          <View style={[styles.statusPillBadge, { backgroundColor: '#E0F2FE' }]}>
                            <Text style={[styles.statusPillText, { color: '#0284C7' }]}>Kelompok</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.detailFullTitle}>{taskTitle}</Text>

                      {/* Info Guru & Tenggat */}
                      <View style={styles.detailMetaCard}>
                        <View style={styles.detailMetaRow}>
                          <MaterialCommunityIcons name="account-tie-outline" size={16} color="#059669" />
                          <Text style={styles.detailMetaLabel}>Guru Pembimbing:</Text>
                          <Text style={styles.detailMetaVal}>{teacherName || '-'}</Text>
                        </View>
                        <View style={styles.detailMetaDivider} />
                        <View style={styles.detailMetaRow}>
                          <MaterialCommunityIcons name="calendar-clock" size={16} color="#059669" />
                          <Text style={styles.detailMetaLabel}>Batas Waktu:</Text>
                          <Text style={[styles.detailMetaVal, isLate && { color: '#DC2626' }]}>
                            {formatDeadline(selectedDetailAssignment.deadline)}
                          </Text>
                        </View>
                      </View>

                      {/* Deskripsi & Instruksi */}
                      <Text style={[styles.inputLabel, { marginTop: 14 }]}>Petunjuk & Instruksi Soal:</Text>
                      <View style={styles.detailDescBox}>
                        <Text style={styles.detailDescText}>
                          {selectedDetailAssignment.deskripsi || selectedDetailAssignment.instruksi || 'Silakan kerjakan penugasan ini sesuai materi yang telah dipelajari di kelas.'}
                        </Text>
                      </View>

                      {/* Lampiran / Materi */}
                      {selectedDetailAssignment.file_lampiran_url && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => Linking.openURL(selectedDetailAssignment.file_lampiran_url)}
                          style={[styles.teacherFileAttachmentBtn, { marginTop: 12 }]}
                        >
                          <MaterialCommunityIcons name="file-download-outline" size={18} color="#0E5C44" />
                          <Text style={styles.teacherFileAttachmentText}>Unduh Berkas Lampiran Soal</Text>
                        </TouchableOpacity>
                      )}

                      {/* Layar 3: Kriteria Penilaian / Rubrik (Collapsible) */}
                      <View style={styles.rubricContainer}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setCriteriaExpanded((prev) => !prev)}
                          style={styles.rubricHeaderRow}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <MaterialCommunityIcons name="clipboard-check-outline" size={17} color="#059669" />
                            <Text style={styles.rubricTitle}>
                              Kriteria & Bobot Penilaian
                              {Array.isArray(selectedDetailAssignment?.rubrics || selectedDetailAssignment?.kriteria_penilaian) && (selectedDetailAssignment?.rubrics || selectedDetailAssignment?.kriteria_penilaian).length > 0
                                ? ` (${(selectedDetailAssignment?.rubrics || selectedDetailAssignment?.kriteria_penilaian).length} Kriteria)`
                                : ''}
                            </Text>
                          </View>
                          <MaterialCommunityIcons
                            name={criteriaExpanded ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color="#64748B"
                          />
                        </TouchableOpacity>

                        {criteriaExpanded && (
                          <View style={styles.rubricBody}>
                            {(() => {
                              const rawRubrics = selectedDetailAssignment?.rubrics || selectedDetailAssignment?.kriteria_penilaian;
                              const rubricsList = Array.isArray(rawRubrics) ? rawRubrics : [];

                              if (rubricsList.length === 0) {
                                return (
                                  <View style={{ paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 13, color: '#64748B', fontStyle: 'italic' }}>
                                      Rubrik belum tersedia
                                    </Text>
                                  </View>
                                );
                              }

                              return rubricsList.map((cr: any, cIdx: number) => {
                                const label = cr.label || cr.name || cr.kriteria || cr.nama || `Kriteria ${cIdx + 1}`;
                                const weightVal = cr.weight !== undefined ? cr.weight : (cr.bobot !== undefined ? cr.bobot : null);
                                const weightText = weightVal !== null ? (typeof weightVal === 'number' ? `${weightVal}%` : `${weightVal}`) : '';
                                return (
                                  <View key={cIdx} style={styles.rubricItemRow}>
                                    <Text style={styles.rubricItemLabel}>• {label}</Text>
                                    {weightText ? (
                                      <View style={styles.rubricWeightBadge}>
                                        <Text style={styles.rubricWeightText}>{weightText}</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                );
                              });
                            })()}
                          </View>
                        )}
                      </View>
                    </ScrollView>

                    <View style={styles.modalFooter}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setDiscussionModalVisible(true)}
                        style={styles.discussionTriggerBtn}
                      >
                        <MaterialCommunityIcons name="chat-processing-outline" size={16} color="#059669" />
                        <Text style={styles.discussionTriggerBtnText}>Diskusi</Text>
                      </TouchableOpacity>

                      {isGroup && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setGroupModalVisible(true)}
                          style={styles.groupTriggerBtn}
                        >
                          <MaterialCommunityIcons name="account-group" size={16} color="#0284C7" />
                          <Text style={styles.groupTriggerBtnText}>Kelompok</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          const target = selectedDetailAssignment;
                          setSelectedDetailAssignment(null);
                          setSelectedAssignment(target);
                          setSubmissionText(sub?.jawaban_teks || '');
                          setPickedAttachment(null);
                        }}
                        style={styles.modalSubmitBtn}
                      >
                        <MaterialCommunityIcons name="tray-arrow-up" size={16} color="#FFFFFF" />
                        <Text style={styles.modalSubmitBtnText}>
                          {isGraded ? 'Kirim Ulang' : statusObj.key === 'submitted' ? 'Kirim Ulang' : 'Kumpulkan'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 3: PENGUMPULAN TUGAS (Layar 4)                    */}
        {/* ======================================================== */}
        <Modal
          visible={!!selectedAssignment}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedAssignment(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '92%' }]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Kumpulkan Tugas</Text>
                  <Text numberOfLines={1} style={styles.modalSubtitle}>
                    {cleanTaskTitle(selectedAssignment?.judul_tugas || selectedAssignment?.judul || '')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedAssignment(null)} style={styles.modalCloseBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                {/* Dropzone Upload Berkas */}
                <Text style={styles.inputLabel}>Unggah Berkas / Dokumen Tugas:</Text>
                <View style={styles.dropzoneBox}>
                  <View style={styles.dropzoneIconCircle}>
                    <MaterialCommunityIcons name="cloud-upload-outline" size={28} color="#059669" />
                  </View>
                  <Text style={styles.dropzoneTitle}>Pilih Berkas atau Foto Tugas</Text>
                  <Text style={styles.dropzoneSub}>Format PDF, PNG, JPG (Maks. 10 MB)</Text>

                  <View style={styles.pickerBtnRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={handlePickDocument}
                      style={styles.pickerActionBtn}
                    >
                      <MaterialCommunityIcons name="file-pdf-box" size={16} color="#0E5C44" />
                      <Text style={styles.pickerActionBtnText}>Dokumen (PDF)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={handlePickImage}
                      style={styles.pickerActionBtn}
                    >
                      <MaterialCommunityIcons name="camera-outline" size={16} color="#0E5C44" />
                      <Text style={styles.pickerActionBtnText}>Foto / Galeri</Text>
                    </TouchableOpacity>
                  </View>

                  {pickedAttachment && (
                    <View style={styles.selectedAttachmentChip}>
                      <MaterialCommunityIcons name="paperclip" size={16} color="#18A165" />
                      <Text numberOfLines={1} style={styles.selectedAttachmentName}>
                        {pickedAttachment.name}
                      </Text>
                      <TouchableOpacity onPress={() => setPickedAttachment(null)} style={styles.removeAttachmentBtn}>
                        <MaterialCommunityIcons name="close-circle" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Lembar Soal CBT jika kuis */}
                {parsedQuestions.length > 0 ? (
                  <View style={{ marginTop: 14, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={[styles.inputLabel, { color: '#7C3AED', fontWeight: '800' }]}>
                        Lembar Soal Kuis CBT ({parsedQuestions.length} Butir):
                      </Text>
                      <View style={{ backgroundColor: '#F5F3FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#DDD6FE' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>
                          Terjawab: {Object.keys(quizAnswers).length} / {parsedQuestions.length}
                        </Text>
                      </View>
                    </View>

                    {parsedQuestions.map((q: any, qIdx: number) => {
                      const selectedOpt = String(quizAnswers[qIdx] || '').toUpperCase();
                      const isTf = q.tipe === 'tf';

                      return (
                        <View
                          key={qIdx}
                          style={{
                            backgroundColor: '#FAFAF9',
                            borderWidth: 1,
                            borderColor: '#E7E5E4',
                            borderRadius: 14,
                            padding: 12,
                            marginBottom: 12,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A' }}>
                              Soal No. {qIdx + 1}
                            </Text>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#059669', backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                              {q.poin || 2} Poin
                            </Text>
                          </View>

                          <Text style={{ fontSize: 13, color: '#1E293B', fontWeight: '600', marginBottom: 10, lineHeight: 18 }}>
                            {q.pertanyaan || q.soal}
                          </Text>

                          {isTf ? (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {['BENAR', 'SALAH'].map((val) => {
                                const isSel = selectedOpt === val;
                                return (
                                  <TouchableOpacity
                                    key={val}
                                    activeOpacity={0.8}
                                    onPress={() => setQuizAnswers((prev) => ({ ...prev, [qIdx]: val }))}
                                    style={{
                                      flex: 1,
                                      paddingVertical: 9,
                                      borderRadius: 10,
                                      borderWidth: 2,
                                      borderColor: isSel ? '#7C3AED' : '#E2E8F0',
                                      backgroundColor: isSel ? '#F5F3FF' : '#FFFFFF',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Text style={{ fontSize: 12, fontWeight: '800', color: isSel ? '#7C3AED' : '#475569' }}>
                                      {val}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ) : (
                            ['a', 'b', 'c', 'd', 'e'].map((letter) => {
                              const optText = q[`opsi_${letter}`];
                              if (!optText) return null;
                              const upper = letter.toUpperCase();
                              const isSel = selectedOpt === upper;

                              return (
                                <TouchableOpacity
                                  key={letter}
                                  activeOpacity={0.8}
                                  onPress={() => setQuizAnswers((prev) => ({ ...prev, [qIdx]: upper }))}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    padding: 8,
                                    borderRadius: 10,
                                    borderWidth: 1.5,
                                    borderColor: isSel ? '#7C3AED' : '#E2E8F0',
                                    backgroundColor: isSel ? '#F5F3FF' : '#FFFFFF',
                                    marginBottom: 6,
                                  }}
                                >
                                  <View
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: 7,
                                      backgroundColor: isSel ? '#7C3AED' : '#F1F5F9',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      marginRight: 8,
                                    }}
                                  >
                                    <Text style={{ fontSize: 11, fontWeight: '800', color: isSel ? '#FFFFFF' : '#64748B' }}>
                                      {upper}
                                    </Text>
                                  </View>
                                  <Text style={{ fontSize: 12, color: isSel ? '#5B21B6' : '#334155', fontWeight: isSel ? '700' : '500', flex: 1 }}>
                                    {optText}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <>
                    <Text style={[styles.inputLabel, { marginTop: 14 }]}>Catatan / Jawaban Teks Siswa:</Text>
                    <TextInput
                      value={submissionText}
                      onChangeText={setSubmissionText}
                      multiline
                      numberOfLines={4}
                      placeholder="Tuliskan jawaban atau keterangan pengerjaan tugas Anda di sini..."
                      placeholderTextColor="#94A3B8"
                      style={styles.modalTextInput}
                    />
                  </>
                )}

                {/* Checkbox Integritas Akademik */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setIntegrityChecked((prev) => !prev)}
                  style={styles.integrityCheckboxRow}
                >
                  <MaterialCommunityIcons
                    name={integrityChecked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={22}
                    color={integrityChecked ? '#059669' : '#94A3B8'}
                  />
                  <Text style={styles.integrityCheckboxText}>
                    Saya menyatakan bahwa tugas ini dikerjakan secara mandiri dan dengan penuh kejujuran akademik.
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  onPress={() => setSelectedAssignment(null)}
                  style={styles.modalCancelBtn}
                  disabled={submitting}
                >
                  <Text style={styles.modalCancelBtnText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePressSubmit}
                  style={styles.modalSubmitBtn}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                      <Text style={styles.modalSubmitBtnText}>Kirim Tugas</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 4: KONFIRMASI PENGUMPULAN (Layar 5)                */}
        {/* ======================================================== */}
        <Modal
          visible={confirmModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmModalVisible(false)}
        >
          <View style={[styles.modalOverlay, { justifyContent: 'center', paddingHorizontal: 20 }]}>
            <View style={styles.dialogCard}>
              <View style={styles.dialogIconCircle}>
                <MaterialCommunityIcons name="help-circle-outline" size={32} color="#059669" />
              </View>

              <Text style={styles.dialogTitle}>Konfirmasi Pengumpulan</Text>
              <Text style={styles.dialogSubtitle}>
                Apakah Anda yakin ingin mengumpulkan tugas ini sekarang?
              </Text>

              <View style={styles.dialogSummaryBox}>
                <Text numberOfLines={1} style={styles.dialogTaskName}>
                  {cleanTaskTitle(selectedAssignment?.judul_tugas || selectedAssignment?.judul || '')}
                </Text>
                <Text style={styles.dialogFileStatus}>
                  Berkas: {pickedAttachment ? pickedAttachment.name : submissionText ? 'Jawaban Teks Terisi' : 'Kuis CBT'}
                </Text>
              </View>

              <View style={styles.dialogNoticeBox}>
                <MaterialCommunityIcons name="information" size={15} color="#059669" />
                <Text style={styles.dialogNoticeText}>
                  Jawaban yang dikumpulkan akan langsung tercatat dan dapat diperiksa oleh guru.
                </Text>
              </View>

              <View style={styles.dialogButtonsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setConfirmModalVisible(false)}
                  style={styles.dialogCancelBtn}
                  disabled={submitting}
                >
                  <Text style={styles.dialogCancelBtnText}>Periksa Lagi</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleConfirmSubmitAssignment}
                  style={styles.dialogConfirmBtn}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.dialogConfirmBtnText}>Ya, Kumpulkan</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 5: BERHASIL DIKUMPULKAN (Layar 6)                  */}
        {/* ======================================================== */}
        <Modal
          visible={successModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSuccessModalVisible(false)}
        >
          <View style={[styles.modalOverlay, { justifyContent: 'center', paddingHorizontal: 20 }]}>
            <View style={styles.dialogCard}>
              <View style={[styles.dialogIconCircle, { backgroundColor: '#DEF7EC', borderColor: '#31C48D' }]}>
                <MaterialCommunityIcons name="check-decagram" size={38} color="#059669" />
              </View>

              <Text style={styles.dialogTitle}>Alhamdulillah! Berhasil</Text>
              <Text style={styles.dialogSubtitle}>
                Tugas ananda telah berhasil dikumpulkan dan tercatat di sistem akademik.
              </Text>

              {lastSubmittedAssignment && (
                <View style={styles.dialogSummaryBox}>
                  <Text numberOfLines={1} style={styles.dialogTaskName}>
                    {cleanTaskTitle(lastSubmittedAssignment?.judul_tugas || lastSubmittedAssignment?.judul || '')}
                  </Text>
                  <Text style={styles.dialogFileStatus}>
                    Waktu: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                  </Text>
                </View>
              )}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setSuccessModalVisible(false);
                  setLastSubmittedAssignment(null);
                }}
                style={[styles.dialogConfirmBtn, { width: '100%', marginTop: 8 }]}
              >
                <Text style={styles.dialogConfirmBtnText}>Tutup & Kembali</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 6: DETAIL KELOMPOK (Layar 10)                     */}
        {/* ======================================================== */}
        <Modal
          visible={groupModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setGroupModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Informasi Penugasan Kelompok</Text>
                  <Text style={styles.modalSubtitle}>Kolaborasi tim dan pembagian tugas</Text>
                </View>
                <TouchableOpacity onPress={() => setGroupModalVisible(false)} style={styles.modalCloseBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.groupBadgeHeaderBox}>
                  <MaterialCommunityIcons name="account-group" size={24} color="#0284C7" />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.groupHeaderName}>
                      {selectedDetailAssignment?.nama_kelompok || selectedDetailAssignment?.group_name || 'Penugasan Kelompok'}
                    </Text>
                    <Text style={styles.groupHeaderSub}>
                      {selectedDetailAssignment?.peran_user || (activeChildName ? `Ananda: ${activeChildName}` : 'Kolaborasi Tim')}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.inputLabel, { marginTop: 16 }]}>
                  Anggota Kelompok
                  {Array.isArray(selectedDetailAssignment?.anggota_kelompok || selectedDetailAssignment?.group_members || selectedDetailAssignment?.members) && (selectedDetailAssignment?.anggota_kelompok || selectedDetailAssignment?.group_members || selectedDetailAssignment?.members).length > 0
                    ? ` (${(selectedDetailAssignment?.anggota_kelompok || selectedDetailAssignment?.group_members || selectedDetailAssignment?.members).length} Santri):`
                    : ':'}
                </Text>

                {(() => {
                  const rawMembers = selectedDetailAssignment?.anggota_kelompok || selectedDetailAssignment?.group_members || selectedDetailAssignment?.members;
                  const membersList = Array.isArray(rawMembers) ? rawMembers : [];

                  if (membersList.length === 0) {
                    return (
                      <View style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialCommunityIcons name="account-search-outline" size={32} color="#94A3B8" />
                        <Text style={{ marginTop: 8, fontSize: 13, color: '#64748B', fontWeight: '500' }}>
                          Daftar anggota kelompok belum tersedia
                        </Text>
                      </View>
                    );
                  }

                  return membersList.map((member: any, mIdx: number) => {
                    const memberName = typeof member === 'string' ? member : (member?.name || member?.nama_lengkap || member?.nama || `Anggota ${mIdx + 1}`);
                    const memberNis = typeof member === 'object' ? (member?.nis || member?.nisn || '') : '';
                    const memberRole = typeof member === 'object' ? (member?.role || member?.peran || (member?.is_leader || member?.isLeader ? 'Ketua Kelompok' : 'Anggota')) : 'Anggota';
                    const isLeader = typeof member === 'object' ? Boolean(member?.is_leader || member?.isLeader || memberRole?.toLowerCase?.().includes('ketua')) : false;

                    return (
                      <View key={mIdx} style={styles.groupMemberRow}>
                        <View style={styles.groupMemberAvatar}>
                          <Text style={styles.groupMemberAvatarText}>{memberName.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.groupMemberName}>{memberName}</Text>
                          {memberNis ? <Text style={styles.groupMemberNis}>NIS: {memberNis}</Text> : null}
                        </View>
                        <View
                          style={[
                            styles.groupMemberRoleBadge,
                            isLeader && { backgroundColor: '#DEF7EC', borderColor: '#31C48D' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.groupMemberRoleText,
                              isLeader && { color: '#047857' },
                            ]}
                          >
                            {memberRole}
                          </Text>
                        </View>
                      </View>
                    );
                  });
                })()}

                <Text style={[styles.inputLabel, { marginTop: 16 }]}>Petunjuk Kerja Kelompok:</Text>
                <View style={styles.groupInstructionsBox}>
                  <Text style={styles.groupInstructionsText}>
                    Diskusikan pembagian materi secara proporsional. Pengumpulan tugas cukup diwakilkan oleh salah satu anggota atau ketua kelompok dengan menyertakan nama seluruh anggota di lembar jawaban.
                  </Text>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  onPress={() => setGroupModalVisible(false)}
                  style={[styles.modalSubmitBtn, { width: '100%', justifyContent: 'center' }]}
                >
                  <Text style={styles.modalSubmitBtnText}>Tutup</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 7: DISKUSI TUGAS (Layar 11)                        */}
        {/* ======================================================== */}
        <Modal
          visible={discussionModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setDiscussionModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '90%' }]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Ruang Diskusi Tugas</Text>
                  <Text style={styles.modalSubtitle}>Tanya jawab seputar materi penugasan</Text>
                </View>
                <TouchableOpacity onPress={() => setDiscussionModalVisible(false)} style={styles.modalCloseBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={[styles.modalBody, { maxHeight: 380 }]}>
                {discussionMessages.length === 0 ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 36, paddingHorizontal: 16 }}>
                    <MaterialCommunityIcons name="forum-outline" size={44} color="#CBD5E1" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B', marginTop: 10 }}>Belum Ada Diskusi</Text>
                    <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                      Tuliskan pertanyaan atau tanggapan pertama seputar tugas ini pada kolom di bawah.
                    </Text>
                  </View>
                ) : (
                  discussionMessages.map((msg) => {
                    const isSiswa = msg.role === 'siswa';
                    return (
                      <View
                        key={msg.id}
                        style={[
                          styles.chatMessageRow,
                          isSiswa ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' },
                        ]}
                      >
                        <View
                          style={[
                            styles.chatBubble,
                            isSiswa ? styles.chatBubbleSiswa : styles.chatBubbleGuru,
                          ]}
                        >
                          <Text style={[styles.chatSenderName, isSiswa && { color: '#047857' }]}>
                            {msg.sender}
                          </Text>
                          <Text style={styles.chatMessageText}>{msg.text}</Text>
                          <Text style={styles.chatMessageTime}>{msg.time}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.chatInputBarRow}>
                <TextInput
                  value={discussionInput}
                  onChangeText={setDiscussionInput}
                  placeholder="Tulis pertanyaan seputar tugas ini..."
                  placeholderTextColor="#94A3B8"
                  style={styles.chatInputField}
                />
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    if (!discussionInput.trim()) return;
                    setDiscussionMessages((prev) => [
                      ...prev,
                      {
                        id: `msg-${Date.now()}`,
                        sender: activeChildName ? `Ananda ${activeChildName}` : 'Siswa',
                        role: 'siswa',
                        text: discussionInput.trim(),
                        time: 'Baru saja',
                      },
                    ]);
                    setDiscussionInput('');
                  }}
                  style={styles.chatSendBtn}
                >
                  <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL KARTU PELAJAR SISWA */}
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

        {/* MODAL MENU SISWA LENGKAP */}
        <StudentMenuModal
          visible={Boolean(selectedMenuStudent)}
          student={selectedMenuStudent}
          onClose={() => setSelectedMenuStudent(null)}
          navigation={navigation}
        />

        {/* MODAL LAPORAN PERKEMBANGAN PEKANAN */}
        <StudentWeeklyReportModal
          visible={Boolean(selectedWeeklyStudent)}
          student={selectedWeeklyStudent}
          onClose={() => setSelectedWeeklyStudent(null)}
        />

        {feedbackModal && (
          <AppFeedbackModal
            visible={feedbackModal.visible}
            type={feedbackModal.type || 'info'}
            title={feedbackModal.title}
            message={feedbackModal.message}
            onClose={() => setFeedbackModal(null)}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: { flex: 1, backgroundColor: 'transparent' },
  mainScrollContent: {
    flexGrow: 1,
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  content: { padding: 16, paddingTop: Platform.OS === 'android' ? 16 : 12 },

  containerBlock: {
    marginBottom: 18,
  },
  studentContainerBlock: {
    marginBottom: 10,
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
    gap: 7,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  studentCardCountBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  studentCardCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
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
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    shadowColor: '#064E3B',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeSingle: {
    width: '100%',
    minHeight: 148,
    justifyContent: 'space-between',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    shadowColor: '#064E3B',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeInactive: {
    opacity: 0.88,
  },
  cardDecorCircle: {
    position: 'absolute',
    top: -28,
    right: -28,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    zIndex: 0,
  },
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  avatarBorderWrapHero: {
    width: 64,
    height: 64,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarBorderWrapHeroInactive: {
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  avatarInitialText: {
    fontSize: 24,
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
    fontSize: 14.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  studentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
    marginTop: 1,
  },
  childNameHero: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  childSubInfoHero: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 1,
    fontWeight: '600',
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 7,
    alignSelf: 'flex-start',
    marginTop: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  studentUnitBadgeInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: SCREEN_WIDTH - 220,
  },
  selectedActionBtnRight: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 4,
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
    fontSize: 8.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  selectedActionBtnTextInactive: {
    color: '#FFFFFF',
  },
  studentAttributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.32)',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 6,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    zIndex: 1,
  },
  studentAttributesGridInactive: {
    backgroundColor: 'rgba(4, 47, 30, 0.32)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
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
    color: '#6EE7B7',
    fontWeight: '700',
  },
  studentAttrValue: {
    fontSize: 11.5,
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
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
    marginTop: 10,
  },
  paginationDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 18,
    borderRadius: 3,
    backgroundColor: '#18A165',
  },

  // Section Header Between
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  sectionTitleBold: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  semesterDropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 4,
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  semesterDropdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },

  // 4 KPI Horizontal Row — Premium Cards
  kpiRowContainer: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 4,
  },
  kpiPillCard: {
    flex: 1,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1.5,
    justifyContent: 'space-between',
    minHeight: 76,
    shadowColor: '#0F172A',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  kpiCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiBadgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  kpiCardNumber: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  kpiCardLabel: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
    letterSpacing: 0.1,
  },

  // Filter Tabs & Search — Modern
  filterSectionBlock: {
    marginBottom: 18,
    gap: 10,
  },
  filterPillsScroll: {
    gap: 8,
    paddingVertical: 3,
  },
  filterCapsuleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  filterCapsuleBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  filterCapsuleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterCapsuleTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  searchAndFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchInputField: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  filterActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
    gap: 5,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  filterActionButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  sortPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 6,
    gap: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sortPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
  },

  // Loading & Empty States — Premium
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    paddingVertical: 38,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
    marginTop: 12,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '500',
  },

  // Premium Assignment Card
  assignmentCardModern: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 0,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    overflow: 'hidden',
  },
  cardHeaderFlex: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    paddingBottom: 10,
  },
  subjectIconBoxLarge: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardInfoCol: {
    flex: 1,
  },
  cardBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 6,
  },
  subjectPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 1,
  },
  subjectPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardTaskTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 19,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  cardTaskDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 2,
  },

  // Metadata 3-Column Box — Glassmorphism Style
  metadataContainerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 0,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#D1FAE5',
    marginBottom: 0,
  },
  metaColumnItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabelText: {
    fontSize: 9,
    color: '#059669',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValueText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  metaVerticalDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#A7F3D0',
    marginHorizontal: 8,
  },

  // Graded Card Frame — Premium
  gradedCardFrameModern: {
    backgroundColor: '#F0FDF4',
    borderTopWidth: 1,
    borderColor: '#BBF7D0',
    padding: 12,
    gap: 8,
  },
  gradedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scorePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  scorePillLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#A7F3D0',
  },
  scorePillValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  gradedCheckText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  teacherNoteBoxModern: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
  },
  teacherNoteTextModern: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 17,
    flex: 1,
  },

  // Pending Action Row — Modern
  pendingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    paddingTop: 10,
    backgroundColor: '#FFFBEB',
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  pendingAlertBoxModern: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pendingAlertTextModern: {
    fontSize: 10.5,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
    lineHeight: 15,
  },
  kumpulkanBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 4,
    shadowColor: '#059669',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  kumpulkanBtnTextModern: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Modal — Premium Design
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#059669',
    marginTop: 3,
    fontWeight: '600',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
  },
  modalBody: {
    padding: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  modalTextInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    padding: 14,
    fontSize: 13,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 120,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1.5,
    borderTopColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
  },
  modalCancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  modalSubmitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardAttachmentLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    gap: 8,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardAttachmentLinkText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  teacherQuestionCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  teacherQuestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  teacherQuestionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: -0.2,
  },
  teacherQuestionContent: {
    fontSize: 12.5,
    color: '#1E293B',
    lineHeight: 19,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  teacherFileAttachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    marginBottom: 14,
    gap: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  teacherFileAttachmentText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  pickerBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  pickerActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#F0FDF4',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#34D399',
    paddingVertical: 13,
    borderRadius: 16,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pickerActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  selectedAttachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 6,
    gap: 8,
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  selectedAttachmentName: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  removeAttachmentBtn: {
    padding: 2,
  },

  /* ── 3-Tab View Mode Switcher (Batas Waktu | Jeda | Jadwal) ── */
  viewModeTabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  viewModeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  viewModeTabBtnActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  viewModeTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  viewModeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterDotBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
  },

  /* ── Screen 12: Calendar Mode Styles ── */
  calendarMonthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarMonthTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarMonthPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  calendarMonthPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  weekStripRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  weekDayCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    position: 'relative',
  },
  weekDayCardSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  weekDayName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  weekDayNameSelected: {
    color: '#DEF7EC',
    fontWeight: '700',
  },
  weekDayNum: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  weekDayNumSelected: {
    color: '#FFFFFF',
  },
  weekDayActiveDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  calendarTaskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  calendarTaskTimeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 6,
  },
  calendarTaskTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  calendarTaskBody: {
    padding: 14,
  },
  calendarSubjectPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  calendarSubjectPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  calendarTaskTitleText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 19,
    marginBottom: 12,
  },
  calendarTaskFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  calendarTaskDetailBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  calendarTaskDetailBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  calendarTaskSubmitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  calendarTaskSubmitBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── Action Buttons Cluster & Links ── */
  gradedDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    gap: 2,
  },
  gradedDetailBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  actionButtonsCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailOutlineBtn: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  detailOutlineBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  groupOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
    gap: 4,
  },
  groupOutlineBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284C7',
  },

  /* ── Modal 1: Filter Sheet ── */
  filterSectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  filterPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalFilterPillActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  modalFilterPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  modalFilterPillTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  modalResetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  modalResetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  modalApplyBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#059669',
  },
  modalApplyBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── Modal 2: Detail Tugas ── */
  lateWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  lateWarningTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 2,
  },
  lateWarningDesc: {
    fontSize: 11,
    color: '#B91C1C',
    lineHeight: 15,
  },
  gradedHeroBanner: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    marginBottom: 12,
  },
  gradedHeroGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  gradedScoreCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradedScoreVal: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  gradedScoreMax: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A7F3D0',
    marginTop: -4,
  },
  gradeLetterBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 4,
  },
  gradeLetterText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#92400E',
  },
  gradedHeroTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gradedHeroSub: {
    fontSize: 11,
    color: '#DEF7EC',
    marginTop: 2,
  },
  feedbackCardBox: {
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#D1FAE5',
  },
  feedbackCardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  feedbackCardContent: {
    fontSize: 11.5,
    color: '#1E293B',
    lineHeight: 17,
  },
  detailFullTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
    lineHeight: 22,
    marginBottom: 10,
  },
  detailMetaCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 8,
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailMetaLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  detailMetaVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'right',
  },
  detailMetaDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  detailDescBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  detailDescText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 19,
  },
  rubricContainer: {
    marginTop: 14,
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    overflow: 'hidden',
  },
  rubricHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  rubricTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  rubricBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  rubricItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rubricItemLabel: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  rubricWeightBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  rubricWeightText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  discussionTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    gap: 5,
  },
  discussionTriggerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  groupTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
    gap: 5,
  },
  groupTriggerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
  },

  /* ── Modal 3: Dropzone & Integrity ── */
  dropzoneBox: {
    alignItems: 'center',
    padding: 18,
    backgroundColor: '#F0FDF4',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#6EE7B7',
    borderRadius: 18,
    marginTop: 4,
  },
  dropzoneIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dropzoneTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  dropzoneSub: {
    fontSize: 11,
    color: '#059669',
    marginTop: 2,
    marginBottom: 12,
  },
  integrityCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  integrityCheckboxText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    flex: 1,
    fontWeight: '600',
  },

  /* ── Modals 4 & 5: Dialog Confirmation & Success ── */
  dialogCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  dialogIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  dialogSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  dialogSummaryBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 14,
  },
  dialogTaskName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  dialogFileStatus: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  dialogNoticeBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 6,
  },
  dialogNoticeText: {
    fontSize: 10.5,
    color: '#065F46',
    flex: 1,
    fontWeight: '600',
  },
  dialogButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 18,
  },
  dialogCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  dialogCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  dialogConfirmBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#059669',
  },
  dialogConfirmBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── Modal 6: Group Details ── */
  groupBadgeHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    padding: 14,
  },
  groupHeaderName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0369A1',
  },
  groupHeaderSub: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '600',
    marginTop: 2,
  },
  groupMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 8,
  },
  groupMemberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  groupMemberAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284C7',
  },
  groupMemberName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  groupMemberNis: {
    fontSize: 10.5,
    color: '#64748B',
  },
  groupMemberRoleBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  groupMemberRoleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  groupInstructionsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  groupInstructionsText: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 17,
  },

  /* ── Modal 7: Discussion Chat ── */
  chatMessageRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  chatBubble: {
    maxWidth: '82%',
    borderRadius: 16,
    padding: 12,
  },
  chatBubbleSiswa: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderBottomRightRadius: 2,
  },
  chatBubbleGuru: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 2,
  },
  chatSenderName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 3,
  },
  chatMessageText: {
    fontSize: 12.5,
    color: '#0F172A',
    lineHeight: 18,
  },
  chatMessageTime: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  chatInputBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
    gap: 8,
  },
  chatInputField: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#0F172A',
  },
  chatSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Sticky header ala halaman Jadwal (self-contained) ── */
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
});
