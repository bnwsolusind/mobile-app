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
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isTeacherRole, isTuRole, isPrincipalRole, isSuperAdminRole } from '../utils/roles';
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
import { StudentHeroCard } from '../components/StudentHeroCard';
import { GenericCarousel } from '../components/GenericCarousel';
import { StudentStickyHeader, useStickyScroll } from '../components/StudentStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { StudentNotificationModal } from '../components/StudentNotificationModal';
import TuScheduleWorkspace from '../components/schedule/TuScheduleWorkspace';
import TeacherScheduleWorkspace from '../components/schedule/TeacherScheduleWorkspace';
import { resolveUnitName } from '../utils/employeeUtils';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;

type Child = Record<string, any>;
type ScheduleItem = Record<string, any>;

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const padZero = (num: number): string => (num < 10 ? '0' + num : String(num));

const formatDateISO = (d: Date): string => {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
};

const formatIndonesianDate = (d: Date): string => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const monthName = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
};

// Helper: Deteksi status waktu sesi jadwal (past / current / upcoming)
const getSessionTimelineStatus = (
  timeStartStr?: string,
  timeEndStr?: string,
  selectedDate?: Date
): 'past' | 'current' | 'upcoming' => {
  if (!selectedDate) return 'upcoming';
  const now = new Date();
  const isToday =
    now.getFullYear() === selectedDate.getFullYear() &&
    now.getMonth() === selectedDate.getMonth() &&
    now.getDate() === selectedDate.getDate();

  if (!isToday) {
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const selMidnight = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime();
    if (selMidnight < todayMidnight) return 'past';
    return 'upcoming';
  }

  if (!timeStartStr || !timeEndStr) return 'upcoming';

  const parseToMinutes = (t: string) => {
    const clean = t.replace(/\./g, ':').trim();
    const parts = clean.split(':');
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    return h * 60 + m;
  };

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseToMinutes(timeStartStr);
  const endMinutes = parseToMinutes(timeEndStr);

  if (currentMinutes < startMinutes) return 'upcoming';
  if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) return 'current';
  return 'past';
};

// Helper: Dapatkan tanggal Senin dari minggu yang mengandung tanggal d
const getMonday = (d: Date): Date => {
  const date = new Date(d);
  const day = date.getDay();
  // Jika Minggu (0), mundur 6 hari ke Senin; selain itu mundur (day - 1) hari ke Senin
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
};

const getSubjectStyle = (name: string = '', index: number) => {
  const n = (name || '').toLowerCase();
  if (n.includes('apel') || n.includes('upacara') || n.includes('senam') || n.includes('baris')) {
    return {
      bg: '#E0F2FE',
      color: '#0284C7',
      icon: 'bullhorn-outline',
    };
  }
  if (n.includes('dzikir') || n.includes('doa') || n.includes('wirid') || n.includes('sholat') || n.includes('dhuha') || n.includes('kultum')) {
    return {
      bg: '#ECFDF5',
      color: '#059669',
      icon: 'hands-pray',
    };
  }
  if (n.includes('istirahat') || n.includes('ishoma') || n.includes('makan') || n.includes('snack') || n.includes('jeda')) {
    return {
      bg: '#FFF7ED',
      color: '#EA580C',
      icon: 'coffee-outline',
    };
  }
  if (n.includes('matematika') || n.includes('hitung') || n.includes('aljabar')) {
    return {
      bg: '#DCFCE7',
      color: '#10B981',
      icon: 'format-list-bulleted-square',
    };
  }
  if (n.includes('inggris') || n.includes('english')) {
    return {
      bg: '#FFE4E6',
      color: '#EF4444',
      icon: 'alpha-a-box',
    };
  }
  if (n.includes('indonesia') || n.includes('literasi') || (n.includes('bahasa') && !n.includes('arab'))) {
    return {
      bg: '#E0F2FE',
      color: '#2563EB',
      icon: 'book-open-page-variant',
    };
  }
  if (n.includes('agama') || n.includes('islam') || n.includes('pai') || n.includes('fiqih') || n.includes('akidah') || n.includes('akhlak')) {
    return {
      bg: '#FEF3C7',
      color: '#F59E0B',
      icon: 'weather-night',
    };
  }
  if (n.includes('ipas') || n.includes('ipa') || n.includes('sains') || n.includes('biologi') || n.includes('fisika') || n.includes('kimia')) {
    return {
      bg: '#F3E8FF',
      color: '#8B5CF6',
      icon: 'flask',
    };
  }
  if (n.includes('arab')) {
    return {
      bg: '#CCFBF1',
      color: '#0D9488',
      icon: 'translate',
    };
  }
  if (n.includes('tahfizh') || n.includes('quran') || n.includes('hadits') || n.includes('tajwid')) {
    return {
      bg: '#DCFCE7',
      color: '#059669',
      icon: 'book-open-variant',
    };
  }
  if (n.includes('pjok') || n.includes('olahraga') || n.includes('penjas')) {
    return {
      bg: '#FEF9C3',
      color: '#D97706',
      icon: 'run-fast',
    };
  }
  if (n.includes('seni') || n.includes('budaya') || n.includes('sbdp') || n.includes('prakarya')) {
    return {
      bg: '#FCE7F3',
      color: '#DB2777',
      icon: 'palette',
    };
  }
  if (n.includes('ips') || n.includes('sosial') || n.includes('sejarah') || n.includes('geografi') || n.includes('ppkn') || n.includes('pancasila')) {
    return {
      bg: '#E0E7FF',
      color: '#4F46E5',
      icon: 'earth',
    };
  }
  const palettes = [
    { bg: '#E0F2FE', color: '#2563EB', icon: 'book-open-page-variant' },
    { bg: '#DCFCE7', color: '#10B981', icon: 'format-list-bulleted-square' },
    { bg: '#FEF3C7', color: '#F59E0B', icon: 'weather-night' },
    { bg: '#FFE4E6', color: '#EF4444', icon: 'alpha-a-box' },
    { bg: '#F3E8FF', color: '#8B5CF6', icon: 'flask' },
    { bg: '#CCFBF1', color: '#0D9488', icon: 'translate' },
    { bg: '#FEF9C3', color: '#D97706', icon: 'run-fast' },
    { bg: '#FCE7F3', color: '#DB2777', icon: 'palette' },
  ];
  return palettes[index % palettes.length];
};

const getAttendanceMeta = (att?: any) => {
  if (!att || !att.status) {
    return {
      label: 'Belum Dicatat',
      subtext: 'Menunggu guru mencatat presensi sesi ini',
      bg: '#F8FAFC',
      border: '#E2E8F0',
      color: '#64748B',
      icon: 'clock-outline',
    };
  }
  const st = String(att.status).toLowerCase();
  if (st === 'hadir') {
    return {
      label: att.status_label || 'Hadir',
      subtext: att.recorded_at ? `Tercatat hadir pukul ${att.recorded_at} WIB` : 'Hadir mengikuti sesi pembelajaran KBM',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      color: '#059669',
      icon: 'check-circle-outline',
    };
  }
  if (st === 'sakit') {
    return {
      label: att.status_label || 'Sakit',
      subtext: att.keterangan || att.notes || 'Surat keterangan sakit',
      bg: '#F0F9FF',
      border: '#BAE6FD',
      color: '#0284C7',
      icon: 'medical-bag',
    };
  }
  if (st === 'izin') {
    return {
      label: att.status_label || 'Izin',
      subtext: att.keterangan || att.notes || 'Izin dengan konfirmasi orang tua',
      bg: '#EEF2FF',
      border: '#C7D2FE',
      color: '#4F46E5',
      icon: 'file-document-check-outline',
    };
  }
  if (st === 'terlambat') {
    return {
      label: att.status_label || 'Terlambat',
      subtext: att.recorded_at ? `Tiba di kelas pukul ${att.recorded_at} WIB` : (att.keterangan || 'Terlambat masuk sesi pelajaran'),
      bg: '#FFFBEB',
      border: '#FDE68A',
      color: '#D97706',
      icon: 'clock-alert-outline',
    };
  }
  if (st === 'alpa' || st === 'alpha') {
    return {
      label: att.status_label || 'Alpa',
      subtext: att.keterangan || att.notes || 'Tidak hadir tanpa keterangan',
      bg: '#FFF1F2',
      border: '#FECDD3',
      color: '#E11D48',
      icon: 'close-circle-outline',
    };
  }
  return {
    label: att.status_label || (st.charAt(0).toUpperCase() + st.slice(1)),
    subtext: att.keterangan || att.notes || 'Status kehadiran siswa tercatat',
    bg: '#F8FAFC',
    border: '#E2E8F0',
    color: '#475569',
    icon: 'information-outline',
  };
};

export default function ScheduleScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 16);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);
  const isTeacher = isTeacherRole(user?.roles || []);
  const isTu = isTuRole(user?.roles || []);
  const isPrincipal = isPrincipalRole(user?.roles || []);
  const isSuperAdmin = isSuperAdminRole(user?.roles || []);

  // Akses penuh untuk Tata Usaha & Kepala Sekolah: Tampilkan workspace monitoring jadwal unit selaras web-dashboard
  if (route?.params?.role === 'tu' || ((isTu || isPrincipal || isSuperAdmin) && !isParent && !isTeacher)) {
    return <TuScheduleWorkspace navigation={navigation} user={user} />;
  }

  // Akses penuh untuk Guru/Pendidik: Tampilkan TeacherScheduleWorkspace modern, lega, bebas berhimpitan dan tanpa hardcode
  if (
    route?.params?.role === 'teacher' ||
    Boolean(route?.params?.kelas_id) ||
    Boolean(route?.params?.fromTeacher) ||
    (isTeacher && !route?.params?.child_id && !route?.params?.student_id && !isParent)
  ) {
    if (isTeacher) {
      return <TeacherScheduleWorkspace navigation={navigation} user={user} route={route} />;
    }
  }

  const [children, setChildren] = useState<Child[]>(() => {
    const storeChildren = useActiveChildStore.getState().children;
    return Array.isArray(storeChildren) && storeChildren.length > 0 ? storeChildren : [];
  });
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(
    route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId
  );
  const globalActiveChildId = useActiveChildStore((s) => s.activeChildId);
  const studentScrollRef = useRef<ScrollView>(null);
  const prevRouteParamRef = useRef<string | null>(
    route?.params?.child_id || route?.params?.student_id ? String(route?.params?.child_id || route?.params?.student_id) : null
  );

  // Sinkronkan selectedChildId hanya saat route params baru masuk secara eksplisit
  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (incomingId && String(incomingId) !== prevRouteParamRef.current) {
      prevRouteParamRef.current = String(incomingId);
      const strId = String(incomingId);
      setSelectedChildId(strId);
      latestActiveChildIdRef.current = strId;
      handledParamIdRef.current = strId;
      useActiveChildStore.getState().setActiveChildId(strId);
    }
  }, [route?.params?.child_id, route?.params?.student_id]);

  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);

  const defaultAcademicYear = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }, []);

  const defaultSemesterName = useMemo(() => {
    const now = new Date();
    return now.getMonth() >= 6 ? 'Semester 1' : 'Semester 2';
  }, []);

  // Date selection state: langsung ke hari KBM aktif (jika dibuka akhir pekan, arahkan default ke Senin pekan berjalan)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const now = new Date();
    const day = now.getDay();
    if (day === 0) {
      const mon = new Date(now);
      mon.setDate(now.getDate() - 6);
      return mon;
    }
    if (day === 6) {
      const mon = new Date(now);
      mon.setDate(now.getDate() - 5);
      return mon;
    }
    return now;
  });
  const [selectedScheduleDetail, setSelectedScheduleDetail] = useState<ScheduleItem | null>(null);

  // Modal Kalender Pemilih Tanggal Interaktif (TailGrids DatePicker Modal)
  const [isDatePickerModalVisible, setIsDatePickerModalVisible] = useState<boolean>(false);
  const [calendarViewingMonth, setCalendarViewingMonth] = useState<Date>(() => new Date());
  const dayScrollRef = useRef<ScrollView>(null);

  // 60 FPS Native Scroll Animation (identik AssignmentScreen / GradeScreen / MaterialScreen)
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

  // Modal-modal kartu ananda & menu siswa
  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);
  const [selectedNotificationStudent, setSelectedNotificationStudent] = useState<any>(null);
  const [showChildSelectorModal, setShowChildSelectorModal] = useState<boolean>(false);

  // Floating Toast State untuk Progress & Sukses Load Jadwal Siswa
  const latestActiveChildIdRef = useRef<string>('');
  const handledParamIdRef = useRef<string | null>(null);
  const scheduleAbortControllerRef = useRef<AbortController | null>(null);
  const scheduleDebounceTimerRef = useRef<any>(null);

  const openIdCard = (student: any) => setSelectedIdCardStudent(student);
  const openQrCard = (student: any) => setSelectedQrStudent(student);

  // Tab State: Harian vs Semua Jadwal vs Jadwal Ujian
  const [activeTab, setActiveTab] = useState<'kbm' | 'semua' | 'exam'>('kbm');
  const [semuaSelectedDay, setSemuaSelectedDay] = useState<number | 'all'>('all');
  const [semuaViewFormat, setSemuaViewFormat] = useState<'list' | 'matrix'>('list');
  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [loadingExams, setLoadingExams] = useState<boolean>(false);
  const [selectedExamDetail, setSelectedExamDetail] = useState<any | null>(null);
  const [selectedExamCategory, setSelectedExamCategory] = useState<string>('all');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [scheduleData, setScheduleData] = useState<any>(null);

  // 1. Load Children if parent (Pertahankan seluruh anak untuk carousel seimbang)
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id || route?.params?.student_id;
      const childCacheKey = offlineCache.buildKey('schedule_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any>(childCacheKey);
        const cachedList = Array.isArray(cached) ? cached : Array.isArray(cached?.data) ? cached.data : [];
        if (cachedList.length > 0 && isMounted) {
          setChildren(cachedList);
          useActiveChildStore.getState().setChildren(cachedList);
          if (targetChildId) {
            setSelectedChildId(String(targetChildId));
            latestActiveChildIdRef.current = String(targetChildId);
            const foundIdx = cachedList.findIndex((c: any) => String(c.id || c.student_id) === String(targetChildId));
            if (foundIdx >= 0) setActiveChildIndex(foundIdx);
          } else if (!selectedChildId) {
            const fallbackId = globalActiveChildId || String(cachedList[0].id || cachedList[0].student_id);
            setSelectedChildId(fallbackId);
            latestActiveChildIdRef.current = String(fallbackId);
            const fIdx = cachedList.findIndex((c: any) => String(c.id || c.student_id) === fallbackId);
            setActiveChildIndex(fIdx >= 0 ? fIdx : 0);
          }
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const raw = unwrapApiData<any>(res);
          const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          if (isMounted && arr.length > 0) {
            setChildren(arr);
            useActiveChildStore.getState().setChildren(arr);
            if (targetChildId) {
              setSelectedChildId(String(targetChildId));
              latestActiveChildIdRef.current = String(targetChildId);
              const foundIdx = arr.findIndex((c: any) => String(c.id || c.student_id) === String(targetChildId));
              if (foundIdx >= 0) setActiveChildIndex(foundIdx);
            } else if (!selectedChildId) {
              const fallbackId = globalActiveChildId || String(arr[0].id || arr[0].student_id);
              setSelectedChildId(fallbackId);
              latestActiveChildIdRef.current = String(fallbackId);
              const fIdx = arr.findIndex((c: any) => String(c.id || c.student_id) === fallbackId);
              setActiveChildIndex(fIdx >= 0 ? fIdx : 0);
            }
            void offlineCache.set(childCacheKey, arr);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, globalActiveChildId, route?.params?.child_id, route?.params?.student_id]);

  const hasLoadedRef = useRef<boolean>(false);

  // 2. Load schedules from backend API with date parameter, AbortController, SWR & offline cache
  const loadSchedules = useCallback(async (explicitChildIdOrAllowCache?: string | boolean) => {
    const isExplicitChild = typeof explicitChildIdOrAllowCache === 'string';
    const allowCache = typeof explicitChildIdOrAllowCache === 'boolean' ? explicitChildIdOrAllowCache : true;
    const targetChildId = isExplicitChild
      ? explicitChildIdOrAllowCache 
      : ((selectedChildId || useActiveChildStore.getState().activeChildId) || undefined);
    if (targetChildId) {
      latestActiveChildIdRef.current = String(targetChildId);
    }
    const dateStr = formatDateISO(selectedDate);
    const cacheKey = offlineCache.buildKey('schedule', user?.id, `${targetChildId || 'self'}_${dateStr}`);

    // BACA CACHE DULU (0ms RESPON INSTAN - STALE-WHILE-REVALIDATE JIKA allowCache = true)
    let cached = null;
    if (allowCache) {
      cached = await offlineCache.get<any>(cacheKey);
      if (cached) {
        setScheduleData(cached);
        setLoading(false);
      }
    }
    if (!cached) {
      setScheduleData(null);
      setLoading(true);
    }

    // BATALKAN REQUEST SEBELUMNYA AGAR TIDAK MENUMPUK DI ANTRIAN JARINGAN (ZERO NETWORK QUEUE)
    if (scheduleAbortControllerRef.current) {
      scheduleAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    scheduleAbortControllerRef.current = abortController;

    try {
      if (isTeacher && !isParent) {
        const res = await mobileApiService.getTeacherSchedules();
        const rawList = res?.data || (Array.isArray(res) ? res : []);
        const mapped = (Array.isArray(rawList) ? rawList : []).map((s: any) => {
          const isActivity = (s.activity_type ?? 'kbm') !== 'kbm';
          const actName = s.activity_name ?? '';
          const subjName = isActivity && actName
            ? actName
            : (s.subject?.name || s.subject?.nama_mapel || 'Mata Pelajaran');
          const subjCode = isActivity
            ? 'Kegiatan'
            : (s.subject?.code || s.subject?.kode_mapel || '');
          const teacherName = s.teacher?.name || user?.name || (isActivity ? 'Umum / Mandiri' : 'Saya');

          return {
            id: s.id,
            day_of_week: Number(s.day_of_week),
            time_start: s.time_start,
            time_end: s.time_end,
            time_display: `${(s.time_start || '').slice(0, 5)} - ${(s.time_end || '').slice(0, 5)}`,
            activity_type: s.activity_type || 'kbm',
            activity_name: actName,
            subject: {
              id: s.subject_id,
              name: subjName,
              code: subjCode,
            },
            room: s.room || s.ruangan || 'Ruang Kelas',
            class_name: s.kelas?.nama_kelas || s.kelas?.kode_kelas || 'Kelas',
            teacher: {
              name: teacherName,
            },
          };
        });
        const targetDay = selectedDate.getDay();
        const data = {
          all_schedules: mapped,
          today_schedules: mapped.filter((s: any) => s.day_of_week === targetDay),
          is_teacher_schedule: true,
        };
        setScheduleData(data);
        void offlineCache.set(cacheKey, data);
      } else {
        const res = await mobileApiService.getPortalSchedules(
          {
            child_id: targetChildId,
            date: dateStr,
          },
          { signal: abortController.signal }
        );
        const data = unwrapApiData<any>(res) || {};

        // Pastikan response disimpan jika cocok dengan anak yang sedang aktif
        if (!targetChildId || !latestActiveChildIdRef.current || latestActiveChildIdRef.current === String(targetChildId)) {
          setScheduleData(data);
          void offlineCache.set(cacheKey, data);
        }
      }
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        return;
      }
      if (!cached) {
        setScheduleData(null);
      }
    } finally {
      if (!targetChildId || !latestActiveChildIdRef.current || latestActiveChildIdRef.current === String(targetChildId)) {
        setLoading(false);
        hasLoadedRef.current = true;
      }
    }
  }, [selectedChildId, selectedDate, user?.id, isTeacher, isParent]);

  // 3. Load Exam Schedules (PTS, PAS, PAT & Ujian CBT Portal)
  const loadExamSchedules = useCallback(async () => {
    try {
      setLoadingExams(true);
      setExamSchedules([]);
      const targetChildId = selectedChildId || useActiveChildStore.getState().activeChildId || undefined;
      const activeChild = children.find((c) => String(c.id || c.student_id) === String(targetChildId)) || children[0];
      const kelasId = activeChild?.class_id || activeChild?.kelas_id || activeChild?.kelas?.id || (scheduleData?.student?.class_id ? String(scheduleData.student.class_id) : undefined);

      const [examRes, cbtRes] = await Promise.allSettled([
        mobileApiService.getExamSchedules({ kelas_id: kelasId }),
        mobileApiService.getPortalCbtExams(targetChildId || undefined),
      ]);

      let list: any[] = [];
      if (examRes.status === 'fulfilled') {
        const raw = unwrapApiData<any[]>(examRes.value) || (Array.isArray(examRes.value) ? examRes.value : (examRes.value as any)?.data || []);
        if (Array.isArray(raw) && raw.length > 0) {
          list = raw;
        }
      }

      if (list.length === 0 && cbtRes.status === 'fulfilled') {
        const rawCbt = unwrapApiData<any>(cbtRes.value);
        const cbtList = Array.isArray(rawCbt?.exams)
          ? rawCbt.exams
          : Array.isArray(rawCbt?.data)
          ? rawCbt.data
          : Array.isArray(rawCbt)
          ? rawCbt
          : [];

        list = cbtList.map((exam: any) => ({
          id: exam.id,
          exam_date: exam.waktu_mulai ? exam.waktu_mulai.slice(0, 10) : '',
          time_start: exam.waktu_mulai ? exam.waktu_mulai.slice(11, 16) : '',
          time_end: exam.waktu_selesai ? exam.waktu_selesai.slice(11, 16) : '',
          subject: {
            name: exam.mata_pelajaran || exam.judul_ujian || 'Ujian Terpadu',
            code: 'CBT',
          },
          exam_category: {
            id: 'cbt',
            name: exam.judul_ujian?.includes('PTS')
              ? 'PTS (Tengah Semester)'
              : exam.judul_ujian?.includes('PAS')
              ? 'PAS (Akhir Semester)'
              : 'Ujian CBT',
            color: '#2563EB',
          },
          invigilator: {
            nama_lengkap: exam.guru || 'Guru Pengampu',
          },
          room: 'LMS / Lab Komputer',
          raw_cbt: exam,
        }));
      }

      setExamSchedules(list);
    } catch {
      setExamSchedules([]);
    } finally {
      setLoadingExams(false);
    }
  }, [children, selectedChildId, scheduleData?.student?.class_id]);

  useEffect(() => {
    if (activeTab === 'exam') {
      void loadExamSchedules();
    }
  }, [activeTab, loadExamSchedules]);

  const examCategories = useMemo(() => {
    const cats: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    examSchedules.forEach((item) => {
      const cat = item.exam_category || item.examCategory;
      if (cat && cat.id && !seen.has(String(cat.id))) {
        seen.add(String(cat.id));
        cats.push({ id: String(cat.id), name: cat.name || cat.code || 'Kategori' });
      }
    });
    return cats;
  }, [examSchedules]);

  const filteredExamSchedules = useMemo(() => {
    if (selectedExamCategory === 'all') return examSchedules;
    return examSchedules.filter((item) => {
      const catId = item.exam_category_id || item.exam_category?.id || item.examCategory?.id;
      return String(catId) === String(selectedExamCategory);
    });
  }, [examSchedules, selectedExamCategory]);

  useEffect(() => {
    void loadSchedules(!hasLoadedRef.current);
  }, [loadSchedules]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      void offlineCache.clearPrefix('schedule');
      if (activeTab === 'exam') {
        void offlineCache.clearPrefix('cbt_exams');
        await loadExamSchedules();
      } else {
        await loadSchedules(false);
      }
    } finally {
      setRefreshing(false);
    }
  };

  // 7 day pill strip — mencakup seluruh siklus pekan (Senin s/d Ahad)
  const weekDays = useMemo(() => {
    const selISO = formatDateISO(selectedDate);
    const todayISO = formatDateISO(new Date());
    const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const DAY_NAMES_FULL  = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    // Senin minggu ini
    const monday = getMonday(selectedDate);

    // Sediakan 7 hari penuh (Senin s/d Ahad) agar Sabtu (17 Okt) & Ahad selalu ada di strip dan bisa dipilih langsung
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = formatDateISO(d);
      const dotw = d.getDay(); // 1=Sen, 2=Sel, ..., 6=Sab, 0=Min
      const isWeekend = dotw === 0 || dotw === 6;
      return {
        dayName: DAY_NAMES_SHORT[dotw],
        dayNum: d.getDate(),
        monthShort: MONTH_SHORT[d.getMonth()],
        iso,
        fullDay: DAY_NAMES_FULL[dotw],
        dayOfWeek: dotw,
        dateStr: `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`,
        isSelected: iso === selISO,
        isToday: iso === todayISO,
        isWeekend,
        isHoliday: isWeekend,
        dateObj: d,
      };
    });
  }, [selectedDate]);

  // Auto-scroll strip hari ke tanggal aktif (misal Sabtu 17 Okt langsung di tengah layar)
  useEffect(() => {
    const activeIndex = weekDays.findIndex((w) => w.isSelected);
    if (activeIndex >= 0 && dayScrollRef.current) {
      const pillWidth = 92;
      const targetOffset = Math.max(0, activeIndex * pillWidth - (SCREEN_WIDTH / 2 - 46));
      setTimeout(() => {
        dayScrollRef.current?.scrollTo({ x: targetOffset, animated: true });
      }, 120);
    }
  }, [selectedDate, weekDays]);

  // Grid kalender bulan interaktif (1 s/d 31 Oktober 2026 atau bulan yang dilihat)
  const calendarDays = useMemo(() => {
    const year = calendarViewingMonth.getFullYear();
    const month = calendarViewingMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0=Min, 1=Sen, ...
    const totalDays = new Date(year, month + 1, 0).getDate(); // misal 31 untuk Oktober

    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [calendarViewingMonth]);

  const formattedSelectedDate = useMemo(() => formatIndonesianDate(selectedDate), [selectedDate]);

  // Daftar mata pelajaran unik untuk filter horizontal
  const availableSubjects = useMemo(() => {
    const items: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    const list = Array.isArray(scheduleData?.all_schedules) && scheduleData.all_schedules.length > 0
      ? scheduleData.all_schedules
      : (Array.isArray(scheduleData?.today_schedules) ? scheduleData.today_schedules : []);

    list.forEach((s: any) => {
      const isActivity = (s.activity_type ?? 'kbm') !== 'kbm';
      const actName = s.activity_name ?? '';
      const name = (isActivity && actName) ? actName : (s.subject?.name || s.subject?.nama_mapel || '');
      const id = s.subject?.id ? String(s.subject.id) : name;
      if (name && !seen.has(name)) {
        seen.add(name);
        items.push({ id, name });
      }
    });
    return items;
  }, [scheduleData]);

  // Jadwal dasar hari ini sebelum filter mapel
  const dayBaseSchedules: ScheduleItem[] = useMemo(() => {
    const jsDay = selectedDate.getDay(); // 0=Min, 1=Sen, ..., 6=Sab
    const targetDayIso = jsDay === 0 ? 7 : jsDay;

    // Prioritas 1: Jika backend mengembalikan today_schedules untuk tanggal terpilih
    if (Array.isArray(scheduleData?.today_schedules) && scheduleData.today_schedules.length > 0) {
      return scheduleData.today_schedules;
    }

    // Prioritas 2: Filter dari all_schedules berdasarkan hari ISO (1=Sen s/d 7=Min) atau JS day (0-6)
    if (Array.isArray(scheduleData?.all_schedules) && scheduleData.all_schedules.length > 0) {
      return scheduleData.all_schedules.filter(
        (s: any) => Number(s.day_of_week) === targetDayIso || Number(s.day_of_week) === jsDay
      );
    }

    if (Array.isArray(scheduleData?.today_schedules)) {
      return scheduleData.today_schedules;
    }
    return [];
  }, [scheduleData, selectedDate]);

  // Jadwal setelah difilter per mata pelajaran dan pencarian
  const displaySchedules: ScheduleItem[] = useMemo(() => {
    let result = dayBaseSchedules;
    if (selectedSubjectFilter !== 'all') {
      result = result.filter((s: any) => {
        const isActivity = (s.activity_type ?? 'kbm') !== 'kbm';
        const actName = s.activity_name ?? '';
        const name = (isActivity && actName) ? actName : (s.subject?.name || s.subject?.nama_mapel || '');
        const id = s.subject?.id ? String(s.subject.id) : name;
        return id === selectedSubjectFilter || name === selectedSubjectFilter;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s: any) => {
        const subName = String(s.subject?.name || s.subject?.nama_mapel || s.activity_name || '').toLowerCase();
        const teacherName = String(s.teacher?.name || s.teacher?.nama_lengkap || '').toLowerCase();
        const roomName = String(s.room || s.ruangan || '').toLowerCase();
        return subName.includes(q) || teacherName.includes(q) || roomName.includes(q);
      });
    }
    return result;
  }, [dayBaseSchedules, selectedSubjectFilter, searchQuery]);

  const safeChildren = Array.isArray(children) ? children : [];

  const studentCardWidth = useMemo(() => {
    return safeChildren.length > 1
      ? SCREEN_WIDTH - 16 - STUDENT_CARD_GAP - STUDENT_PEEK_WIDTH
      : SCREEN_WIDTH - 32;
  }, [safeChildren.length]);

  const studentSnapInterval = useMemo(() => {
    return studentCardWidth + STUDENT_CARD_GAP;
  }, [studentCardWidth]);

  const studentTrackPad = useMemo(() => {
    return (SCREEN_WIDTH - studentCardWidth) / 2;
  }, [studentCardWidth]);

  // Real-time tracking titik dot carousel saat gesture drag/swipe berlangsung
  const [visualDotIndex, setVisualDotIndex] = useState<number | null>(null);
  const currentActiveDotIndex = visualDotIndex !== null ? visualDotIndex : activeChildIndex;

  const scrollToActiveChild = useCallback((idx: number, animated = false): void => {
    if (safeChildren.length <= 1) return;
    const clamped = Math.max(0, Math.min(safeChildren.length - 1, idx));
    studentScrollRef.current?.scrollTo({ x: clamped * studentSnapInterval, animated });
  }, [safeChildren.length, studentSnapInterval]);

  const syncLoopChildId = useCallback((realIdx: number) => {
    const selChild = safeChildren[realIdx];
    const sid = selChild?.id || selChild?.student_id;
    if (sid) {
      const strSid = String(sid);
      setSelectedChildId(strSid);
      useActiveChildStore.getState().setActiveChildId(strSid);
    }
  }, [safeChildren]);

  const goToLoopChild = useCallback((targetIndex: number, isDirectTap = false) => {
    if (safeChildren.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(safeChildren.length - 1, targetIndex));
    const targetChild = safeChildren[clampedIndex];
    if (!targetChild) return;

    const sid = String(targetChild.id || targetChild.student_id || '');
    const sFullName = targetChild.full_name || targetChild.nama_lengkap || targetChild.name || targetChild.nama || 'Ananda';
    const sNickname = targetChild.nickname || targetChild.nama || targetChild.name || sFullName.split(' ')[0] || 'Ananda';

    latestActiveChildIdRef.current = sid;
    handledParamIdRef.current = sid;
    if (prevRouteParamRef) prevRouteParamRef.current = sid;

    // Geser visual carousel segera untuk 60fps tanpa jeda UI
    setActiveChildIndex(clampedIndex);

    // Hapus timer debounce sebelumnya jika user masih menggeser kartu dengan cepat
    if (scheduleDebounceTimerRef.current) {
      clearTimeout(scheduleDebounceTimerRef.current);
    }

    const executeChildSwitch = (childId: string) => {
      setSelectedChildId(childId);
      latestActiveChildIdRef.current = childId;
      handledParamIdRef.current = childId;
      if (prevRouteParamRef) prevRouteParamRef.current = childId;
      useActiveChildStore.getState().setActiveChildId(childId);
      try {
        navigation?.setParams?.({ child_id: childId, student_id: childId });
      } catch (_) {}
      void loadSchedules(childId);
    };

    if (isDirectTap) {
      executeChildSwitch(sid);
    } else {
      // Debounce 200ms saat swipe gesture agar antrean burst HTTP tidak terbentuk
      scheduleDebounceTimerRef.current = setTimeout(() => {
        executeChildSwitch(sid);
      }, 200);
    }
  }, [safeChildren, loadSchedules, navigation]);

  useEffect(() => {
    return () => {
      if (scheduleDebounceTimerRef.current) clearTimeout(scheduleDebounceTimerRef.current);
      if (scheduleAbortControllerRef.current) scheduleAbortControllerRef.current.abort();
    };
  }, []);

  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (incomingId && safeChildren.length > 0 && handledParamIdRef.current !== String(incomingId)) {
      handledParamIdRef.current = String(incomingId);
      const foundIdx = safeChildren.findIndex((c: any) => String(c.id || c.student_id) === String(incomingId));
      if (foundIdx >= 0) {
        goToLoopChild(foundIdx, true);
      }
    }
  }, [route?.params?.child_id, route?.params?.student_id, safeChildren, goToLoopChild]);

  // Posisikan scroll ke kartu yang aktif saat awal load atau lebar card berubah
  useEffect(() => {
    if (safeChildren.length <= 1) return;
    requestAnimationFrame(() => {
      scrollToActiveChild(activeChildIndex, false);
    });
  }, [safeChildren.length, studentSnapInterval, activeChildIndex, scrollToActiveChild]);

  useEffect(() => {
    if (safeChildren.length > 0 && selectedChildId) {
      const idx = safeChildren.findIndex(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (idx >= 0 && idx !== activeChildIndex) {
        setActiveChildIndex(idx);
      }
    }
  }, [selectedChildId, safeChildren, activeChildIndex]);
  const safeDisplaySchedules = Array.isArray(displaySchedules) ? displaySchedules : [];
  const safeDayBaseSchedules = Array.isArray(dayBaseSchedules) ? dayBaseSchedules : [];
  const safeAvailableSubjects = Array.isArray(availableSubjects) ? availableSubjects : [];
  const safeFilteredExamSchedules = Array.isArray(filteredExamSchedules) ? filteredExamSchedules : [];
  const safeExamCategories = Array.isArray(examCategories) ? examCategories : [];

  // Daftar semua sesi jadwal sepekan (Senin s/d Ahad)
  const allWeekSchedules = useMemo(() => {
    if (Array.isArray(scheduleData?.all_schedules)) {
      return scheduleData.all_schedules;
    }
    if (Array.isArray(scheduleData?.schedules)) {
      return scheduleData.schedules;
    }
    if (Array.isArray(scheduleData?.today_schedules)) {
      return scheduleData.today_schedules;
    }
    if (Array.isArray(scheduleData)) {
      return scheduleData;
    }
    return [];
  }, [scheduleData]);

  // Slot waktu unik untuk tabel matriks jadwal mobile
  const mobileMatrixTimeSlots = useMemo(() => {
    const slotsMap = new Map();
    allWeekSchedules.forEach((s: any) => {
      const start = (s.time_start || '').slice(0, 5);
      const end = (s.time_end || '').slice(0, 5);
      if (start && end) {
        const key = `${start}-${end}`;
        if (!slotsMap.has(key)) {
          slotsMap.set(key, { start, end, label: `${start} - ${end}` });
        }
      }
    });

    const extracted = Array.from(slotsMap.values()).sort((a: any, b: any) => a.start.localeCompare(b.start));
    if (extracted.length > 0) return extracted;

    return [
      { start: '07:15', end: '08:00', label: '07:15 - 08:00' },
      { start: '08:00', end: '08:45', label: '08:00 - 08:45' },
      { start: '08:45', end: '09:30', label: '08:45 - 09:30' },
      { start: '09:30', end: '10:00', label: '09:30 - 10:00', isBreak: true },
      { start: '10:00', end: '10:45', label: '10:00 - 10:45' },
      { start: '10:45', end: '11:30', label: '10:45 - 11:30' },
      { start: '11:30', end: '12:45', label: '11:30 - 12:45', isBreak: true },
      { start: '12:45', end: '13:30', label: '12:45 - 13:30' },
      { start: '13:30', end: '14:15', label: '13:30 - 14:15' },
      { start: '14:15', end: '15:00', label: '14:15 - 15:00' },
    ];
  }, [allWeekSchedules]);

  // Ringkasan KPI metrik jadwal untuk kartu warna di bodi (selaras dengan style Halaman Tugas/Absensi)
  const scheduleKpi = useMemo(() => {
    const totalSessions = safeDayBaseSchedules.length;
    const uniqueSubjects = new Set(
      safeDayBaseSchedules.map((s: any) => s.subject?.name || s.subject?.nama_mapel).filter(Boolean)
    ).size;

    let startTime = '-';
    let endTime = '-';
    if (safeDayBaseSchedules.length > 0) {
      const first = safeDayBaseSchedules[0];
      const last = safeDayBaseSchedules[safeDayBaseSchedules.length - 1];
      startTime = (first.time_start || '07:30').slice(0, 5).replace(':', '.');
      endTime = (last.time_end || '15:00').slice(0, 5).replace(':', '.');
    }

    const isToday = formatDateISO(selectedDate) === formatDateISO(new Date());
    const isWeekend = selectedDate.getDay() === 0 || (selectedDate.getDay() === 6 && totalSessions === 0);

    return {
      totalSessions,
      uniqueSubjects,
      startTime,
      endTime,
      isToday,
      isWeekend,
    };
  }, [safeDayBaseSchedules, selectedDate]);

  const handleBack = () => {
    const currentActiveChildId = selectedChildId || useActiveChildStore.getState().activeChildId || route?.params?.child_id || route?.params?.student_id;
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation, {
      ...route?.params,
      child_id: currentActiveChildId,
      student_id: currentActiveChildId,
    });
    if (handled) return;
    if (currentActiveChildId) {
      navigation?.navigate('Beranda' as any, {
        reopen_child_portal_id: String(currentActiveChildId),
        reopen_timestamp: Date.now(),
      });
      return;
    }
    if (navigation?.canGoBack()) {
      navigation.goBack();
    } else {
      navigation?.navigate('Beranda' as any);
    }
  };

  const activeChild = (safeChildren.length > 0
    ? safeChildren.find((c) => String(c.id || c.student_id) === String(selectedChildId)) || safeChildren[0]
    : null) || scheduleData?.student || (user as any)?.student || user;
  const heroFirstName = activeChild ? String(activeChild.name || activeChild.nama_lengkap || '').trim().split(' ')[0] : undefined;

  const studentFullName = activeChild
    ? String(activeChild.name || activeChild.nama_lengkap || activeChild.full_name || (user as any)?.name || 'Ananda').trim()
    : String((user as any)?.name || 'Ananda');

  const studentUnit = activeChild
    ? String(
        activeChild.unit?.name ||
        activeChild.unit_name ||
        activeChild.education_unit?.name ||
        resolveUnitName(activeChild?.education_unit || activeChild?.unit || activeChild) ||
        ''
      ).trim()
    : '';

  const studentClass = activeChild
    ? String(
        activeChild.class?.name ||
        activeChild.kelas?.name ||
        activeChild.class_name ||
        (activeChild.grade ? `Kelas ${activeChild.grade}` : '')
      ).trim()
    : '';

  const studentSubtitleParts = [studentUnit, studentClass].filter(Boolean);
  const studentSubtitle = studentSubtitleParts.join('  ·  ');
  const studentPhotoUrl = getProfileImageUrl(activeChild);
  const isGirl = isGirlStudent(activeChild);
  const defaultAvatar = isGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;
  const studentAvatarSource = studentPhotoUrl ? { uri: studentPhotoUrl } : defaultAvatar;

  // Resolusi Dinamis Status Kehadiran Siswa Hari Ini — Single Source of Truth selaras dengan HomeScreen
  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(activeChild);
  }, [activeChild]);

  // Deteksi Dinamis Fullday vs Boarding (100% data riil dari backend tanpa hardcode)
  const isBoarding = useMemo(() => {
    const rawProgramType = String(
      activeChild?.program_type ||
      activeChild?.education_unit?.program_type ||
      activeChild?.unit?.program_type ||
      scheduleData?.student?.program_type ||
      ''
    ).toLowerCase();

    const rawLevel = String(
      activeChild?.level ||
      activeChild?.education_unit?.level ||
      activeChild?.unit?.level ||
      activeChild?.kelas?.jenjang ||
      activeChild?.kelas?.unitPendidikan?.level ||
      scheduleData?.student?.level ||
      ''
    ).toUpperCase();

    const unitStr = String(
      studentUnit ||
      activeChild?.unit?.name ||
      activeChild?.education_unit?.name ||
      scheduleData?.student?.unit ||
      ''
    ).toUpperCase();

    return (
      rawProgramType === 'boarding' ||
      rawLevel === 'PONPES' ||
      rawLevel === 'MAHAD' ||
      unitStr.includes('PONPES') ||
      unitStr.includes('PESANTREN') ||
      unitStr.includes('ASRAMA') ||
      unitStr.includes('MAHAD')
    );
  }, [activeChild, scheduleData, studentUnit]);

  const programTypeLabel = isBoarding
    ? 'Boarding School (Pesantren 24 Jam)'
    : 'Fullday School (07:15 - 16:00 WIB)';

  const programOperatingHours = useMemo(() => {
    if (activeChild?.jam_kegiatan) return activeChild.jam_kegiatan;
    if (activeChild?.education_unit?.jam_kegiatan) return activeChild.education_unit.jam_kegiatan;
    if (activeChild?.kelas?.unitPendidikan?.jam_kegiatan) return activeChild.kelas.unitPendidikan.jam_kegiatan;
    if (scheduleData?.student?.jam_kegiatan) return scheduleData.student.jam_kegiatan;
    return isBoarding ? '24 Jam (Pengasuhan Asrama & Halaqah)' : '07:15 - 16:00 WIB';
  }, [activeChild, scheduleData, isBoarding]);

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
          Jadwal Pelajaran
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setIsDatePickerModalVisible(true)}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Kalender"
        >
          <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#004D32" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.cleanMainScrollContent, { paddingBottom: bottomInset + 30 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0D6B42']} />
        }
      >
        <View style={styles.cleanScrollInner}>
          {/* 1. STUDENT PROFILE SECTION (TERBUKA, INDAH, DENGAN TOMBOL GANTI SISWA AKTIF) */}
          <View style={styles.studentProfileRow}>
            {/* Circular Avatar dengan mint ring */}
            <TouchableOpacity
              activeOpacity={safeChildren.length > 1 ? 0.75 : 1}
              onPress={safeChildren.length > 1 ? () => setShowChildSelectorModal(true) : undefined}
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
                activeOpacity={safeChildren.length > 1 ? 0.75 : 1}
                onPress={safeChildren.length > 1 ? () => setShowChildSelectorModal(true) : undefined}
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
                {safeChildren.length > 1 && (
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

          {/* 1.2. BANNER TAHUN AJARAN AKTIF & JADWAL OPERASIONAL ANANDA (FULLDAY / BOARDING) */}
          <View style={styles.academicYearBanner}>
            <LinearGradient
              colors={isBoarding ? ['#EEF2FF', '#F5F3FF', '#F8FAFC'] : ['#ECFDF5', '#F0FDF4', '#F8FAFC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.academicYearGradient}
            >
              {/* Top Colored Accent Strip */}
              <View
                style={[
                  styles.academicYearAccentStrip,
                  { backgroundColor: isBoarding ? '#6366F1' : '#059669' },
                ]}
              />

              {/* Row 1: Badge Tahun Ajaran & Status Aktif */}
              <View style={styles.academicYearHeaderRow}>
                <View
                  style={[
                    styles.academicYearBadge,
                    isBoarding && { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="calendar-check"
                    size={13.5}
                    color={isBoarding ? '#4F46E5' : '#047857'}
                  />
                  <Text
                    style={[
                      styles.academicYearBadgeText,
                      isBoarding && { color: '#4338CA' },
                    ]}
                  >
                    Tahun Ajaran {scheduleData?.academic_year || activeChild?.kelas?.tahun_ajaran?.name || defaultAcademicYear}
                    {scheduleData?.semester_name ? ` · ${scheduleData.semester_name}` : ` · ${defaultSemesterName}`}
                  </Text>
                </View>

                <View style={styles.activePillBadge}>
                  <View style={styles.activeGreenDot} />
                  <Text style={styles.activePillText}>Aktif</Text>
                </View>
              </View>

              {/* Title & Subtitle Operasional */}
              <Text style={styles.operationalScheduleTitle}>
                Jadwal Operasional Ananda {studentFullName}
              </Text>
              <Text style={styles.operationalScheduleSub} numberOfLines={1}>
                {studentUnit || 'Unit Pendidikan'} {studentClass ? ` · ${studentClass}` : ''}
              </Text>

              {/* Row 2: Lencana Program Sekolah (Fullday vs Boarding) */}
              <View style={styles.programTypeBadgeWrapper}>
                <View
                  style={[
                    styles.programTypeBadge,
                    isBoarding ? styles.programTypeBadgeBoarding : styles.programTypeBadgeFullday,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={isBoarding ? 'mosque' : 'weather-sunny'}
                    size={14}
                    color={isBoarding ? '#4338CA' : '#047857'}
                  />
                  <Text
                    style={[
                      styles.programTypeBadgeText,
                      isBoarding ? styles.programTypeBadgeTextBoarding : styles.programTypeBadgeTextFullday,
                    ]}
                  >
                    {programTypeLabel}
                  </Text>
                </View>
              </View>

              {/* Row 3: Meta Info Chips (Jam Operasional, Ruangan, Lingkup Kegiatan) */}
              <View style={styles.operationalMetaRow}>
                <View style={styles.operationalMetaItem}>
                  <View style={[styles.metaIconSquircle, isBoarding && { backgroundColor: '#E0E7FF' }]}>
                    <MaterialCommunityIcons
                      name="clock-time-four-outline"
                      size={12.5}
                      color={isBoarding ? '#4F46E5' : '#059669'}
                    />
                  </View>
                  <Text style={[styles.operationalMetaText, isBoarding && { color: '#3730A3' }]}>
                    {programOperatingHours}
                  </Text>
                </View>

                {studentClass ? (
                  <View style={styles.operationalMetaItem}>
                    <View style={[styles.metaIconSquircle, isBoarding && { backgroundColor: '#E0E7FF' }]}>
                      <MaterialCommunityIcons
                        name="door-open"
                        size={12.5}
                        color={isBoarding ? '#4F46E5' : '#059669'}
                      />
                    </View>
                    <Text style={[styles.operationalMetaText, isBoarding && { color: '#3730A3' }]}>
                      {studentClass}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.operationalMetaItem}>
                  <View style={[styles.metaIconSquircle, isBoarding && { backgroundColor: '#E0E7FF' }]}>
                    <MaterialCommunityIcons
                      name={isBoarding ? 'home-group' : 'school-outline'}
                      size={12.5}
                      color={isBoarding ? '#4F46E5' : '#059669'}
                    />
                  </View>
                  <Text style={[styles.operationalMetaText, isBoarding && { color: '#3730A3' }]}>
                    {isBoarding ? 'KBM & Halaqah Asrama' : 'KBM Terpadu'}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* 1.3. REKAP JAM BELAJAR (JP) & METRIK OPERASIONAL KBM (4 KARTU KPI) */}
          <View style={styles.kpiContainerBlock}>
            <View style={styles.kpiRow}>
              {/* CARD 1: Sesi / JP (EMERALD) */}
              <View style={[styles.kpiCard, styles.kpiCardEmerald]}>
                <LinearGradient
                  colors={['#ECFDF5', '#F0FDF4']}
                  style={styles.kpiCardGradient}
                >
                  <View style={styles.kpiTop}>
                    <Text style={[styles.kpiLabel, { color: '#047857' }]}>Rekap Jam Belajar (JP)</Text>
                    <View style={[styles.kpiIconBadge, { backgroundColor: '#D1FAE5' }]}>
                      <MaterialCommunityIcons name="book-clock-outline" size={15} color="#059669" />
                    </View>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#065F46' }]}>
                    {scheduleKpi.totalSessions} JP / Sesi
                  </Text>
                  <Text style={[styles.kpiSub, { color: '#047857' }]}>
                    {scheduleKpi.totalSessions > 0
                      ? (isBoarding ? 'Sesi KBM & Halaqah' : 'Total Jam Pelajaran')
                      : 'Tidak Ada Sesi'}
                  </Text>
                </LinearGradient>
              </View>

              {/* CARD 2: Waktu Belajar (SKY BLUE) */}
              <View style={[styles.kpiCard, styles.kpiCardSky]}>
                <LinearGradient
                  colors={['#EFF6FF', '#DBEAFE']}
                  style={styles.kpiCardGradient}
                >
                  <View style={styles.kpiTop}>
                    <Text style={[styles.kpiLabel, { color: '#1D4ED8' }]}>Waktu Belajar</Text>
                    <View style={[styles.kpiIconBadge, { backgroundColor: '#DBEAFE' }]}>
                      <MaterialCommunityIcons name="clock-time-four-outline" size={15} color="#2563EB" />
                    </View>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#1E40AF' }]}>
                    {scheduleKpi.startTime} - {scheduleKpi.endTime}
                  </Text>
                  <Text style={[styles.kpiSub, { color: '#2563EB' }]}>
                    {isBoarding ? 'WIB (Sesi Belajar)' : 'WIB Terjadwal'}
                  </Text>
                </LinearGradient>
              </View>
            </View>

            <View style={[styles.kpiRow, { marginTop: 8 }]}>
              {/* CARD 3: Mapel (PURPLE) */}
              <View style={[styles.kpiCard, styles.kpiCardPurple]}>
                <LinearGradient
                  colors={['#FAF5FF', '#F3E8FF']}
                  style={styles.kpiCardGradient}
                >
                  <View style={styles.kpiTop}>
                    <Text style={[styles.kpiLabel, { color: '#6D28D9' }]}>Mata Pelajaran</Text>
                    <View style={[styles.kpiIconBadge, { backgroundColor: '#EDE9FE' }]}>
                      <MaterialCommunityIcons name="notebook-outline" size={15} color="#7C3AED" />
                    </View>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#5B21B6' }]}>
                    {scheduleKpi.uniqueSubjects} Mapel
                  </Text>
                  <Text style={[styles.kpiSub, { color: '#7C3AED' }]}>Bidang Studi Terjadwal</Text>
                </LinearGradient>
              </View>

              {/* CARD 4: Status Operasional (AMBER / EMERALD) */}
              <View
                style={[
                  styles.kpiCard,
                  scheduleKpi.isWeekend ? styles.kpiCardAmber : styles.kpiCardEmerald,
                ]}
              >
                <LinearGradient
                  colors={scheduleKpi.isWeekend ? ['#FFFBEB', '#FEF9C3'] : ['#ECFDF5', '#F0FDF4']}
                  style={styles.kpiCardGradient}
                >
                  <View style={styles.kpiTop}>
                    <Text
                      style={[
                        styles.kpiLabel,
                        { color: scheduleKpi.isWeekend ? '#B45309' : '#047857' },
                      ]}
                    >
                      Status Hari Ini
                    </Text>
                    <View
                      style={[
                        styles.kpiIconBadge,
                        { backgroundColor: scheduleKpi.isWeekend ? '#FEF3C7' : '#D1FAE5' },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={scheduleKpi.isWeekend ? 'weather-sunny' : 'calendar-check-outline'}
                        size={15}
                        color={scheduleKpi.isWeekend ? '#D97706' : '#059669'}
                      />
                    </View>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.kpiValue,
                      { color: scheduleKpi.isWeekend ? '#92400E' : '#065F46' },
                    ]}
                  >
                    {scheduleKpi.isWeekend ? 'Akhir Pekan' : 'KBM Aktif'}
                  </Text>
                  <Text
                    style={[
                      styles.kpiSub,
                      { color: scheduleKpi.isWeekend ? '#B45309' : '#047857' },
                    ]}
                  >
                    {scheduleKpi.isWeekend
                      ? 'Libur Pembelajaran'
                      : `${scheduleKpi.totalSessions} Sesi Berjalan`}
                  </Text>
                </LinearGradient>
              </View>
            </View>
          </View>

          {/* 1.4. TAB SWITCHER: JADWAL HARIAN VS SEMUA JADWAL VS UJIAN (100% VISIBLE & HIGH CONTRAST) */}
          <View style={styles.tabSwitcherContainer}>
            {/* TAB 1: JADWAL HARIAN */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('kbm')}
              style={styles.tabSwitcherBtnItem}
            >
              {activeTab === 'kbm' ? (
                <LinearGradient
                  colors={['#064E3B', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillActiveKbm]}
                >
                  <MaterialCommunityIcons name="calendar-clock" size={15} color="#FFFFFF" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextActive}>
                    Jadwal Harian
                  </Text>
                </LinearGradient>
              ) : (
                <View style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillInactive]}>
                  <MaterialCommunityIcons name="calendar-clock" size={15} color="#047857" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextInactive}>
                    Jadwal Harian
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* TAB 2: SEMUA JADWAL */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('semua')}
              style={styles.tabSwitcherBtnItem}
            >
              {activeTab === 'semua' ? (
                <LinearGradient
                  colors={['#0F766E', '#0D9488']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillActiveSemua]}
                >
                  <MaterialCommunityIcons name="calendar-month-outline" size={15} color="#FFFFFF" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextActive}>
                    Semua Jadwal
                  </Text>
                </LinearGradient>
              ) : (
                <View style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillInactive]}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={15} color="#0D9488" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextInactive}>
                    Semua Jadwal
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* TAB 3: JADWAL UJIAN */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('exam')}
              style={styles.tabSwitcherBtnItem}
            >
              {activeTab === 'exam' ? (
                <LinearGradient
                  colors={['#1E3A8A', '#2563EB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillActiveExam]}
                >
                  <MaterialCommunityIcons name="file-document-edit-outline" size={15} color="#FFFFFF" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextActive}>
                    Jadwal Ujian
                  </Text>
                </LinearGradient>
              ) : (
                <View style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillInactive]}>
                  <MaterialCommunityIcons name="file-document-edit-outline" size={15} color="#2563EB" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextInactive}>
                    Jadwal Ujian
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {activeTab === 'kbm' ? (
            <>
              {/* 2. DAY STRIP (Sen, Sel, Rab, Kam, Jum - TEPAT DI BAWAH PROFIL SISWA) */}
              <View style={styles.cleanDayStripWrapper}>
                <ScrollView
                  ref={dayScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cleanDayStripScroll}
                >
                  {weekDays.map((item) => {
                    const isSel = item.isSelected;
                    const isHoliday = item.isHoliday || item.isWeekend;
                    return (
                      <TouchableOpacity
                        key={item.iso}
                        activeOpacity={0.8}
                        onPress={() => setSelectedDate(item.dateObj)}
                        style={[
                          styles.cleanDayPillBtn,
                          isHoliday
                            ? (isSel ? styles.cleanDayPillBtnHolidayActive : styles.cleanDayPillBtnHoliday)
                            : (isSel ? styles.cleanDayPillBtnActive : styles.cleanDayPillBtnInactive),
                        ]}
                      >
                        <View style={styles.cleanDayPillHeader}>
                          <Text
                            style={[
                              styles.cleanDayPillName,
                              isHoliday && styles.cleanDayPillNameHoliday,
                              isSel && (isHoliday ? styles.cleanDayPillNameHolidayActive : styles.cleanDayPillNameActive),
                            ]}
                          >
                            {item.dayName}
                          </Text>
                          {isHoliday && !isSel && (
                            <View style={styles.holidayMiniDot} />
                          )}
                        </View>
                        <Text
                          style={[
                            styles.cleanDayPillDate,
                            isHoliday && styles.cleanDayPillDateHoliday,
                            isSel && (isHoliday ? styles.cleanDayPillDateHolidayActive : styles.cleanDayPillDateActive),
                          ]}
                        >
                          {item.dateStr}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 3. SCHEDULE CARDS LIST (2 KOLOM: WAKTU DI KIRI, CARD DI KANAN) */}
              {loading ? (
                <ActivityIndicator color="#0D6B42" style={{ marginVertical: 32 }} />
              ) : safeDisplaySchedules.length > 0 ? (
                <View style={styles.cleanScheduleListContainer}>
                  {safeDisplaySchedules.map((item, idx) => {
                    const isActivity = item.activity_type === 'activity' || (item.activity_type && item.activity_type !== 'kbm');
                    const subjName = isActivity
                      ? (item.activity_name || 'Kegiatan')
                      : (item.subject?.name || item.subject?.nama_mapel || 'Mata Pelajaran');
                    const styleMeta = getSubjectStyle(subjName, idx);
                    const rawTime = item.time_display || (item.time_start && item.time_end ? `${item.time_start.slice(0, 5)} - ${item.time_end.slice(0, 5)}` : '07.30 - 08.15');
                    const timeParts = rawTime.replace(/:/g, '.').split('-');
                    const timeStart = timeParts[0]?.trim() || '';
                    const timeEnd = timeParts[1]?.trim() || '';
                    const teacherName = isActivity
                      ? (item.teacher?.name || 'Umum / Mandiri')
                      : (item.teacher?.name || item.teacher?.nama_lengkap || 'Guru Pengampu');
                    const roomName = item.room || 'Ruang Kelas';
                    const isOngoing = item.is_ongoing;
                    const attMeta = item.attendance ? getAttendanceMeta(item.attendance) : null;

                    return (
                      <View key={item.id || idx} style={styles.cleanScheduleRow}>
                        {/* Kolom Waktu di Kiri */}
                        <View style={styles.cleanTimeCol}>
                          <Text style={[styles.cleanTimeStartText, isOngoing && { color: '#059669' }]}>
                            {timeStart}
                          </Text>
                          <View style={styles.timelineDashRow}>
                            <View style={[styles.timelineMiniLine, { backgroundColor: isOngoing ? '#10B981' : '#CBD5E1' }]} />
                            <Text style={styles.cleanTimeEndText}>{timeEnd}</Text>
                          </View>
                        </View>

                        {/* Kolom Card di Kanan */}
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => setSelectedScheduleDetail(item)}
                          style={[
                            styles.cleanCardRight,
                            { borderLeftColor: styleMeta.color, borderLeftWidth: 3.5 },
                            isOngoing && styles.cleanCardRightOngoing,
                          ]}
                        >
                          {/* Squircle Pastel Icon Box */}
                          <View style={[styles.cleanSquircleIconBox, { backgroundColor: styleMeta.bg }]}>
                            <MaterialCommunityIcons
                              name={styleMeta.icon as any}
                              size={26}
                              color={styleMeta.color}
                            />
                          </View>

                          {/* Rincian Teks */}
                          <View style={styles.cleanTextCol}>
                            <View style={styles.cleanCardTitleRow}>
                              <Text numberOfLines={1} style={styles.cleanSubjectTitle}>
                                {subjName}
                              </Text>
                              {isOngoing && (
                                <View style={styles.ongoingBadgePill}>
                                  <View style={styles.ongoingPulseDot} />
                                  <Text style={styles.ongoingBadgeText}>Aktif</Text>
                                </View>
                              )}
                              {attMeta && attMeta.label !== 'Belum Dicatat' && (
                                <View style={[styles.attBadgePill, { backgroundColor: attMeta.bg, borderColor: attMeta.border }]}>
                                  <MaterialCommunityIcons name={attMeta.icon as any} size={10} color={attMeta.color} />
                                  <Text style={[styles.attBadgeText, { color: attMeta.color }]}>{attMeta.label}</Text>
                                </View>
                              )}
                            </View>

                            {/* Lokasi Ruang & Guru dengan badge aksen warna */}
                            <View style={styles.cleanMetaBadgeRow}>
                              <View style={[styles.cleanRoomBadge, { backgroundColor: styleMeta.bg }]}>
                                <MaterialCommunityIcons name="door-open" size={11.5} color={styleMeta.color} />
                                <Text numberOfLines={1} style={[styles.cleanRoomText, { color: styleMeta.color }]}>
                                  {roomName}
                                </Text>
                              </View>
                              <View style={styles.cleanTeacherBadge}>
                                <MaterialCommunityIcons name="account-outline" size={12} color="#64748B" />
                                <Text numberOfLines={1} style={styles.cleanTeacherText}>
                                  {teacherName}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* Panah Aksi */}
                          <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={[
                  styles.cleanEmptyContainer,
                  (selectedDate.getDay() === 0 || selectedDate.getDay() === 6) && styles.cleanHolidayEmptyContainer
                ]}>
                  {(selectedDate.getDay() === 0 || selectedDate.getDay() === 6) ? (
                    <>
                      <View style={styles.holidayBadgePill}>
                        <MaterialCommunityIcons name="calendar-heart" size={13} color="#E11D48" />
                        <Text style={styles.holidayBadgeText}>Tanggal Merah · Libur Akhir Pekan</Text>
                      </View>
                      <View style={styles.holidayIconCircle}>
                        <MaterialCommunityIcons name="weather-sunny" size={38} color="#E11D48" />
                      </View>
                      <Text style={styles.cleanHolidayTitle}>
                        Libur Pembelajaran (KBM Off)
                      </Text>
                      <Text style={styles.cleanHolidaySub}>
                        Tidak ada sesi KBM tatap muka terjadwal pada {formattedSelectedDate}. Ananda dapat beristirahat, muraja'ah mandiri, atau berkegiatan bersama keluarga.
                      </Text>
                    </>
                  ) : (
                    <>
                      <View style={styles.normalEmptyIconCircle}>
                        <MaterialCommunityIcons name="calendar-clock-outline" size={38} color="#0D6B42" />
                      </View>
                      <Text style={styles.cleanEmptyTitle}>
                        Tidak Ada Jadwal Terjadwal
                      </Text>
                      <Text style={styles.cleanEmptySub}>
                        Tidak ada sesi KBM untuk hari {formattedSelectedDate}.
                      </Text>
                    </>
                  )}

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedDate(getMonday(selectedDate))}
                    style={styles.cleanMondayBtn}
                  >
                    <MaterialCommunityIcons name="calendar-arrow-right" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.cleanMondayBtnText}>Lihat Jadwal Hari Senin</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : activeTab === 'semua' ? (
            /* ── VIEW TAB SEMUA JADWAL (MATRIKS & SELURUH HARI) ── */
            <View style={styles.semuaContainer}>
              {/* Summary Bar Semua Jadwal */}
              <LinearGradient
                colors={['#065F46', '#0D9488', '#0F766E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.semuaSummaryBar}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.semuaSummaryIconSquircle}>
                    <MaterialCommunityIcons name="calendar-month-outline" size={17} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                      Semua Jadwal Pelajaran Kelas
                    </Text>
                    <Text style={{ fontSize: 11, color: '#CCFBF1', marginTop: 1 }}>
                      {allWeekSchedules.length} Sesi Terjadwal Sepekan (Senin s/d Ahad)
                    </Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Format Switcher: Daftar per Hari vs Matriks Tabel (Gaya Segmented Pill) */}
              <View style={styles.semuaFormatSwitcherContainer}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSemuaViewFormat('list')}
                  style={styles.semuaFormatBtnItem}
                >
                  {semuaViewFormat === 'list' ? (
                    <LinearGradient
                      colors={['#065F46', '#0D9488']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.semuaFormatPillActiveGradient}
                    >
                      <MaterialCommunityIcons name="format-list-bulleted" size={15} color="#FFFFFF" />
                      <Text numberOfLines={1} style={styles.semuaFormatTextActive}>
                        Daftar Semua Hari
                      </Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.semuaFormatPillInactive}>
                      <MaterialCommunityIcons name="format-list-bulleted" size={15} color="#065F46" />
                      <Text numberOfLines={1} style={styles.semuaFormatTextInactive}>
                        Daftar Semua Hari
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSemuaViewFormat('matrix')}
                  style={styles.semuaFormatBtnItem}
                >
                  {semuaViewFormat === 'matrix' ? (
                    <LinearGradient
                      colors={['#065F46', '#0D9488']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.semuaFormatPillActiveGradient}
                    >
                      <MaterialCommunityIcons name="table-large" size={15} color="#FFFFFF" />
                      <Text numberOfLines={1} style={styles.semuaFormatTextActive}>
                        Tabel Matriks Mingguan
                      </Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.semuaFormatPillInactive}>
                      <MaterialCommunityIcons name="table-large" size={15} color="#065F46" />
                      <Text numberOfLines={1} style={styles.semuaFormatTextInactive}>
                        Tabel Matriks Mingguan
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Filter Cepat Hari (untuk Format Daftar) */}
              {semuaViewFormat === 'list' && (
                <View style={styles.semuaDayFilterWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.semuaDayFilterScroll}
                  >
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setSemuaSelectedDay('all')}
                      style={styles.semuaDayFilterBtnItem}
                    >
                      {semuaSelectedDay === 'all' ? (
                        <LinearGradient
                          colors={['#064E3B', '#047857']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.semuaDayFilterPillActive}
                        >
                          <Text style={styles.semuaDayFilterTextActive}>Semua Hari</Text>
                        </LinearGradient>
                      ) : (
                        <View style={styles.semuaDayFilterPillInactive}>
                          <Text style={styles.semuaDayFilterTextInactive}>Semua Hari</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    {[
                      { id: 1, name: 'Senin' },
                      { id: 2, name: 'Selasa' },
                      { id: 3, name: 'Rabu' },
                      { id: 4, name: 'Kamis' },
                      { id: 5, name: 'Jumat' },
                      { id: 6, name: 'Sabtu' },
                      { id: 0, name: 'Ahad' },
                    ].map((d) => {
                      const isSel = semuaSelectedDay === d.id;
                      const count = allWeekSchedules.filter((s: any) => {
                        const dotw = Number(s.day_of_week);
                        return dotw === d.id || (d.id === 0 && dotw === 7);
                      }).length;

                      return (
                        <TouchableOpacity
                          key={d.id}
                          activeOpacity={0.85}
                          onPress={() => setSemuaSelectedDay(d.id)}
                          style={styles.semuaDayFilterBtnItem}
                        >
                          {isSel ? (
                            <LinearGradient
                              colors={['#064E3B', '#047857']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.semuaDayFilterPillActive}
                            >
                              <Text style={styles.semuaDayFilterTextActive}>
                                {d.name} ({count})
                              </Text>
                            </LinearGradient>
                          ) : (
                            <View style={styles.semuaDayFilterPillInactive}>
                              <Text style={styles.semuaDayFilterTextInactive}>
                                {d.name} ({count})
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* TAMPILAN FORMAT 1: DAFTAR SEMUA HARI */}
              {semuaViewFormat === 'list' ? (
                <View style={{ gap: 14 }}>
                  {[
                    { id: 1, name: 'Senin' },
                    { id: 2, name: 'Selasa' },
                    { id: 3, name: 'Rabu' },
                    { id: 4, name: 'Kamis' },
                    { id: 5, name: 'Jumat' },
                    { id: 6, name: 'Sabtu' },
                    { id: 0, name: 'Ahad' },
                  ]
                    .filter((day) => semuaSelectedDay === 'all' || semuaSelectedDay === day.id)
                    .map((day) => {
                      const dayItems = allWeekSchedules.filter((s: any) => {
                        const dotw = Number(s.day_of_week);
                        return dotw === day.id || (day.id === 0 && dotw === 7);
                      });

                      if (semuaSelectedDay === 'all' && dayItems.length === 0) {
                        return null;
                      }

                      return (
                        <View key={day.id} style={styles.semuaDaySection}>
                          {/* Day Header Card */}
                          <View style={styles.semuaDayHeaderRow}>
                            <View style={styles.semuaDayHeaderLeft}>
                              <View style={styles.semuaDayBadge}>
                                <Text style={styles.semuaDayBadgeText}>{day.name}</Text>
                              </View>
                              <Text style={styles.semuaDaySubtext}>
                                {dayItems.length > 0 ? `${dayItems.length} Sesi Terjadwal` : 'Tidak ada sesi'}
                              </Text>
                            </View>
                          </View>

                          {/* Sessions List */}
                          {dayItems.length === 0 ? (
                            <View style={styles.semuaEmptyDayBox}>
                              <Text style={styles.semuaEmptyDayText}>Tidak ada jadwal KBM pada hari {day.name}</Text>
                            </View>
                          ) : (
                            <View style={{ gap: 8, marginTop: 8 }}>
                              {dayItems.map((item: any, idx: number) => {
                                const isActivity = (item.activity_type ?? 'kbm') !== 'kbm';
                                const actName = item.activity_name ?? '';
                                const subjName = isActivity && actName
                                  ? actName
                                  : (item.subject?.name || item.subject?.nama_mapel || 'Mata Pelajaran');
                                const teacherName = item.employee?.nama_lengkap || item.teacher?.name || 'Guru Pengampu';
                                const roomName = item.room || item.ruangan || 'Ruang Kelas';
                                const timeStr = `${(item.time_start || '07:30').slice(0, 5)} - ${(item.time_end || '08:45').slice(0, 5)}`;
                                const styleMeta = getSubjectStyle(subjName, idx);

                                return (
                                  <TouchableOpacity
                                    key={item.id || idx}
                                    activeOpacity={0.82}
                                    onPress={() => setSelectedScheduleDetail(item)}
                                    style={styles.semuaSessionCard}
                                  >
                                    <View style={[styles.semuaSessionIconSquircle, { backgroundColor: styleMeta.bg }]}>
                                      <MaterialCommunityIcons
                                        name={styleMeta.icon as any}
                                        size={18}
                                        color={styleMeta.color}
                                      />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                                        <Text style={styles.semuaSessionTimeText}>{timeStr}</Text>
                                        <Text style={styles.semuaSessionRoomText}>{roomName}</Text>
                                      </View>
                                      <Text style={styles.semuaSessionTitleText} numberOfLines={1}>
                                        {subjName}
                                      </Text>
                                      <Text style={styles.semuaSessionTeacherText} numberOfLines={1}>
                                        {teacherName}
                                      </Text>
                                    </View>
                                    <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                </View>
              ) : (
                /* TAMPILAN FORMAT 2: TABEL MATRIKS MINGGUAN (SCROLL HORIZONTAL) */
                <View style={styles.semuaMatrixContainer}>
                  <View style={styles.semuaMatrixHintRow}>
                    <MaterialCommunityIcons name="gesture-swipe-horizontal" size={15} color="#0D9488" />
                    <Text style={styles.semuaMatrixHintText}>
                      Geser ke samping untuk melihat seluruh hari (Senin s/d Ahad)
                    </Text>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.semuaMatrixScroll}>
                    <View style={styles.semuaMatrixTable}>
                      {/* Table Header Row */}
                      <View style={styles.semuaMatrixHeaderRow}>
                        <View style={[styles.semuaMatrixHeaderCell, { width: 85 }]}>
                          <Text style={styles.semuaMatrixHeaderCellText}>WAKTU</Text>
                        </View>
                        {[
                          { id: 1, name: 'Senin' },
                          { id: 2, name: 'Selasa' },
                          { id: 3, name: 'Rabu' },
                          { id: 4, name: 'Kamis' },
                          { id: 5, name: 'Jumat' },
                          { id: 6, name: 'Sabtu' },
                          { id: 0, name: 'Ahad' },
                        ].map((d) => (
                          <View key={d.id} style={[styles.semuaMatrixHeaderCell, { width: 130 }]}>
                            <Text style={styles.semuaMatrixHeaderCellText}>{d.name.toUpperCase()}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Table Rows per Time Slot */}
                      {mobileMatrixTimeSlots.map((slot: any, sIdx: number) => {
                        const isBreak = slot.isBreak || slot.start === '09:30' || slot.start === '11:30';

                        return (
                          <View
                            key={slot.key || sIdx}
                            style={[
                              styles.semuaMatrixDataRow,
                              isBreak && { backgroundColor: '#FFFBEB' },
                            ]}
                          >
                            <View style={[styles.semuaMatrixTimeCell, { width: 85 }]}>
                              <Text style={styles.semuaMatrixTimeLabel}>{slot.start}</Text>
                              <Text style={styles.semuaMatrixTimeSublabel}>{slot.end}</Text>
                            </View>

                            {[1, 2, 3, 4, 5, 6, 0].map((dayId) => {
                              const session = allWeekSchedules.find((s: any) => {
                                const dotw = Number(s.day_of_week);
                                const matchDay = dotw === dayId || (dayId === 0 && dotw === 7);
                                const start = (s.time_start || '').slice(0, 5);
                                return matchDay && start === slot.start;
                              });

                              if (!session) {
                                if (isBreak) {
                                  return (
                                    <View key={dayId} style={[styles.semuaMatrixCell, { width: 130, alignItems: 'center', justifyContent: 'center' }]}>
                                      <Text style={styles.semuaMatrixBreakText}>
                                        {slot.start === '11:30' ? 'Ishoma' : 'Istirahat'}
                                      </Text>
                                    </View>
                                  );
                                }
                                return (
                                  <View key={dayId} style={[styles.semuaMatrixCell, { width: 130, alignItems: 'center', justifyContent: 'center' }]}>
                                    <Text style={styles.semuaMatrixEmptyText}>-</Text>
                                  </View>
                                );
                              }

                              const isActivity = (session.activity_type ?? 'kbm') !== 'kbm';
                              const actName = session.activity_name ?? '';
                              const subjName = isActivity && actName
                                ? actName
                                : (session.subject?.name || session.subject?.nama_mapel || 'Mapel');
                              const teacherName = session.employee?.nama_lengkap || session.teacher?.name || '';
                              const roomName = session.room || session.ruangan || '';
                              const styleMeta = getSubjectStyle(subjName, dayId);

                              return (
                                <TouchableOpacity
                                  key={dayId}
                                  activeOpacity={0.8}
                                  onPress={() => setSelectedScheduleDetail(session)}
                                  style={[
                                    styles.semuaMatrixCell,
                                    { width: 130, backgroundColor: styleMeta.bg },
                                  ]}
                                >
                                  <Text style={[styles.semuaMatrixSubjText, { color: styleMeta.color }]} numberOfLines={2}>
                                    {subjName}
                                  </Text>
                                  {!!teacherName && (
                                    <Text style={styles.semuaMatrixTeacherText} numberOfLines={1}>
                                      {teacherName}
                                    </Text>
                                  )}
                                  {!!roomName && (
                                    <Text style={styles.semuaMatrixRoomText} numberOfLines={1}>
                                      {roomName}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}
            </View>
          ) : (
            /* ── VIEW TAB JADWAL UJIAN ── */
            <View style={styles.examContainer}>
              {/* Summary Bar */}
              <LinearGradient
                colors={['#1E3A8A', '#1D4ED8', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.examSummaryBar}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.examSummaryIconSquircle}>
                    <MaterialCommunityIcons name="file-document-edit-outline" size={16} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                      Jadwal Ujian Semester
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: '#BFDBFE', marginTop: 1 }}>
                      Penilaian Tengah & Akhir Semester
                    </Text>
                  </View>
                </View>
                <View style={styles.examSummaryBadgePill}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#1E40AF' }}>
                    {safeFilteredExamSchedules.length} Ujian
                  </Text>
                </View>
              </LinearGradient>

              {/* Filter Kategori Ujian jika ada lebih dari 1 */}
              {safeExamCategories.length > 0 && (
                <View style={styles.examCategoryFilterRow}>
                  <TouchableOpacity
                    style={styles.examCategoryBtnItem}
                    onPress={() => setSelectedExamCategory('all')}
                    activeOpacity={0.85}
                  >
                    {selectedExamCategory === 'all' ? (
                      <LinearGradient
                        colors={['#1E3A8A', '#2563EB']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.examFilterPillActive}
                      >
                        <Text style={styles.examFilterTextActive}>Semua Kategori</Text>
                      </LinearGradient>
                    ) : (
                      <View style={styles.examFilterPillInactive}>
                        <Text style={styles.examFilterTextInactive}>Semua Kategori</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {safeExamCategories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.examCategoryBtnItem}
                      onPress={() => setSelectedExamCategory(c.id)}
                      activeOpacity={0.85}
                    >
                      {selectedExamCategory === c.id ? (
                        <LinearGradient
                          colors={['#1E3A8A', '#2563EB']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.examFilterPillActive}
                        >
                          <Text style={styles.examFilterTextActive}>{c.name}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={styles.examFilterPillInactive}>
                          <Text style={styles.examFilterTextInactive}>{c.name}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {loadingExams ? (
                <ActivityIndicator color="#2563EB" style={{ marginVertical: 32 }} />
              ) : safeFilteredExamSchedules.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="file-certificate-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>Belum Ada Jadwal Ujian</Text>
                  <Text style={styles.emptyText}>
                    Jadwal ujian (PTS / PAS / PAT) belum dipublikasikan untuk kelas ini. Hubungi pihak kurikulum sekolah untuk informasi lebih lanjut.
                  </Text>
                </View>
              ) : (
                safeFilteredExamSchedules.map((exItem: any, exIdx: number) => {
                  const catName = exItem.exam_category?.name || exItem.examCategory?.name || 'Ujian Semester';
                  const catColor = exItem.exam_category?.color || exItem.examCategory?.color || '#2563EB';
                  const subjectName = exItem.subject?.name || exItem.subject?.nama_mapel || 'Mata Pelajaran';
                  const subjectCode = exItem.subject?.code || exItem.subject?.kode_mapel || '';
                  const examDate = exItem.exam_date || exItem.date || '';
                  const timeRange = `${(exItem.time_start || '').slice(0, 5)} - ${(exItem.time_end || '').slice(0, 5)} WIB`;
                  const invigilatorName = exItem.invigilator?.nama_lengkap || exItem.invigilator?.name || 'Pengawas Ditentukan';
                  const room = exItem.room || 'Ruang Ujian';

                  return (
                    <TouchableOpacity
                      key={exItem.id || exIdx}
                      style={[
                        styles.examCard,
                        { borderColor: `${catColor}40`, borderWidth: 1.5 },
                      ]}
                      activeOpacity={0.88}
                      onPress={() => setSelectedExamDetail(exItem)}
                    >
                      <View style={styles.examCardHeader}>
                        <View style={[styles.examBadge, { borderColor: catColor, backgroundColor: `${catColor}15` }]}>
                          <Text style={[styles.examBadgeText, { color: catColor }]}>
                            {catName}
                          </Text>
                        </View>
                        <Text style={styles.examDateBadgeText}>
                          {examDate}
                        </Text>
                      </View>

                      <Text numberOfLines={2} style={styles.examSubjectTitle}>
                        {subjectName} {subjectCode ? `(${subjectCode})` : ''}
                      </Text>

                      <View style={styles.examDetailGrid}>
                        <View style={styles.examDetailRow}>
                          <MaterialCommunityIcons name="clock-outline" size={15} color="#2563EB" />
                          <Text style={styles.examDetailText}>{timeRange}</Text>
                        </View>
                        <View style={styles.examDetailRow}>
                          <MaterialCommunityIcons name="map-marker-outline" size={15} color="#059669" />
                          <Text style={styles.examDetailText}>Ruang: {room}</Text>
                        </View>
                        <View style={styles.examDetailRow}>
                          <MaterialCommunityIcons name="account-tie-outline" size={15} color="#64748B" />
                          <Text style={styles.examDetailText}>Pengawas: {invigilatorName}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* 5. BOTTOM NOTICE BANNER */}
          <View style={styles.bottomNoticeBanner}>
            <MaterialCommunityIcons name="shield-check" size={18} color="#18A165" />
            <Text style={styles.bottomNoticeText}>
              {activeTab === 'exam'
                ? 'Harap hadir 15 menit sebelum ujian dimulai & membawa kelengkapan alat tulis.'
                : 'Jadwal pelajaran dan kegiatan sekolah dapat berubah sewaktu-waktu.'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* SCHEDULE DETAIL MODAL (KBM & KEGIATAN SEKOLAH) */}
      <Modal
        visible={!!selectedScheduleDetail}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSelectedScheduleDetail(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setSelectedScheduleDetail(null)}
          />
          <View style={styles.modalCard}>
            {selectedScheduleDetail && (
              <>
                <View style={styles.modalHeaderRow}>
                  <View
                    style={[
                      styles.modalIconBox,
                      {
                        backgroundColor:
                          selectedScheduleDetail.activity_type === 'activity'
                            ? '#EFF6FF'
                            : getSubjectStyle(selectedScheduleDetail.subject?.name, 0).bg,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={
                        selectedScheduleDetail.activity_type === 'activity'
                          ? 'star-outline'
                          : (getSubjectStyle(selectedScheduleDetail.subject?.name, 0).icon as any)
                      }
                      size={24}
                      color={
                        selectedScheduleDetail.activity_type === 'activity'
                          ? '#2563EB'
                          : getSubjectStyle(selectedScheduleDetail.subject?.name, 0).color
                      }
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.modalSubjectTitle}>
                      {selectedScheduleDetail.subject?.name || 'Mata Pelajaran'}
                    </Text>
                    <Text style={styles.modalSubjectCode}>
                      {selectedScheduleDetail.activity_type === 'activity'
                        ? 'Kegiatan Operasional Sekolah'
                        : selectedScheduleDetail.subject?.code
                          ? `Kode: ${selectedScheduleDetail.subject.code}`
                          : 'Kurikulum Terpadu'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedScheduleDetail(null)}
                    style={styles.modalCloseBtn}
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalDivider} />

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={styles.modalScrollBody}
                  contentContainerStyle={styles.modalScrollBodyContent}
                >
                  {/* Basic Schedule Info Grid */}
                  <View style={styles.modalInfoGrid}>
                    <View style={styles.modalInfoBox}>
                      <View style={styles.modalInfoBoxIcon}>
                        <MaterialCommunityIcons name="clock-outline" size={15} color="#059669" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalInfoBoxLabel}>Waktu KBM</Text>
                        <Text style={styles.modalInfoBoxValue} numberOfLines={1}>
                          {selectedScheduleDetail.time_display?.replace(/:/g, '.') || '08.00 - 09.00'} WIB
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalInfoBox}>
                      <View style={styles.modalInfoBoxIcon}>
                        <MaterialCommunityIcons
                          name={selectedScheduleDetail.activity_type === 'activity' ? 'account-outline' : 'account-tie-outline'}
                          size={15}
                          color="#2563EB"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalInfoBoxLabel}>
                          {selectedScheduleDetail.activity_type === 'activity' ? 'Pembina' : 'Guru Pengampu'}
                        </Text>
                        <Text style={styles.modalInfoBoxValue} numberOfLines={1}>
                          {selectedScheduleDetail.teacher?.name ||
                            (selectedScheduleDetail.activity_type === 'activity' ? 'Umum / Mandiri' : 'Belum Ditentukan')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalInfoBox}>
                      <View style={styles.modalInfoBoxIcon}>
                        <MaterialCommunityIcons name="map-marker-outline" size={15} color="#D97706" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalInfoBoxLabel}>Ruangan</Text>
                        <Text style={styles.modalInfoBoxValue} numberOfLines={1}>
                          {selectedScheduleDetail.room || 'Ruang Kelas'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalInfoBox}>
                      <View style={styles.modalInfoBoxIcon}>
                        <MaterialCommunityIcons name="check-decagram-outline" size={15} color="#7C3AED" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalInfoBoxLabel}>Kategori</Text>
                        <Text style={styles.modalInfoBoxValue} numberOfLines={1}>
                          {selectedScheduleDetail.activity_type === 'activity' ? 'Aktivitas Non-KBM' : 'KBM Pembelajaran'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* SECTION 1: STATUS PRESENSI SISWA */}
                  {(() => {
                    const att = selectedScheduleDetail.attendance;
                    const meta = getAttendanceMeta(att);
                    return (
                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeaderRow}>
                          <View style={[styles.modalSectionIconPill, { backgroundColor: '#DEF7EC' }]}>
                            <MaterialCommunityIcons name="account-check-outline" size={15} color="#059669" />
                          </View>
                          <Text style={styles.modalSectionTitle}>Status Presensi Ananda</Text>
                        </View>

                        <View style={[styles.modalStatusBox, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                          <View style={[styles.modalStatusIconSquircle, { backgroundColor: `${meta.color}18` }]}>
                            <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={styles.modalStatusTagRow}>
                              <Text style={[styles.modalStatusTagText, { color: meta.color }]}>
                                {meta.label}
                              </Text>
                              {att?.arrival_time || att?.recorded_at ? (
                                <Text style={styles.modalStatusTimeText}>
                                  Pukul {att.arrival_time || att.recorded_at} WIB
                                </Text>
                              ) : null}
                            </View>
                            <Text style={styles.modalStatusSubtext}>
                              {meta.subtext}
                            </Text>
                            {att?.keterangan || att?.notes ? (
                              <View style={styles.modalNoteCallout}>
                                <MaterialCommunityIcons name="comment-text-outline" size={13} color="#475569" style={{ marginTop: 1, marginRight: 5 }} />
                                <Text style={styles.modalNoteCalloutText}>
                                  {att.keterangan || att.notes}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })()}

                  {/* SECTION 2: PEMBELAJARAN & JURNAL KBM GURU */}
                  {(() => {
                    const journal = selectedScheduleDetail.journal || selectedScheduleDetail.learning;
                    const hasJournal = !!(journal && (journal.topic || journal.learning_material || journal.meeting_notes));
                    return (
                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeaderRow}>
                          <View style={[styles.modalSectionIconPill, { backgroundColor: '#EFF6FF' }]}>
                            <MaterialCommunityIcons name="book-open-variant" size={15} color="#2563EB" />
                          </View>
                          <Text style={styles.modalSectionTitle}>Pembelajaran & Jurnal Guru</Text>
                          {journal?.meeting_number ? (
                            <View style={styles.modalMeetingBadge}>
                              <Text style={styles.modalMeetingBadgeText}>
                                Pertemuan #{journal.meeting_number}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {hasJournal ? (
                          <View style={styles.modalJournalBox}>
                            {/* Topik / Materi Pembelajaran */}
                            <View style={styles.modalJournalTopicRow}>
                              <Text style={styles.modalJournalTopicLabel}>Materi / Topik KBM:</Text>
                              <Text style={styles.modalJournalTopicValue}>
                                {journal.topic || journal.learning_material || 'Materi KBM Reguler'}
                              </Text>
                            </View>

                            {/* Aktivitas Belajar jika ada */}
                            {journal.learning_activity ? (
                              <View style={styles.modalJournalActivityRow}>
                                <Text style={styles.modalJournalActivityLabel}>Aktivitas Kelas:</Text>
                                <Text style={styles.modalJournalActivityValue}>
                                  {journal.learning_activity}
                                </Text>
                              </View>
                            ) : null}

                            {/* Catatan Jurnal KBM */}
                            {journal.meeting_notes ? (
                              <View style={styles.modalJournalNotesContainer}>
                                <View style={styles.modalJournalNotesHeader}>
                                  <MaterialCommunityIcons name="notebook-outline" size={13} color="#0D9488" />
                                  <Text style={styles.modalJournalNotesHeaderTitle}>Catatan Guru di Akhir Mapel</Text>
                                </View>
                                <Text style={styles.modalJournalNotesContent}>
                                  {journal.meeting_notes}
                                </Text>
                              </View>
                            ) : null}

                            {journal.finalized_at ? (
                              <View style={styles.modalJournalFooterRow}>
                                <MaterialCommunityIcons name="check-all" size={12} color="#059669" />
                                <Text style={styles.modalJournalFooterText}>
                                  Disinkronkan oleh guru pukul {journal.finalized_at} WIB
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ) : (
                          <View style={styles.modalEmptyJournalBox}>
                            <MaterialCommunityIcons name="notebook-outline" size={24} color="#94A3B8" />
                            <Text style={styles.modalEmptyJournalTitle}>
                              Belum Ada Catatan Jurnal
                            </Text>
                            <Text style={styles.modalEmptyJournalSub}>
                              Guru pengampu belum mengisi catatan materi atau jurnal KBM untuk sesi tanggal ini.
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}
                </ScrollView>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedScheduleDetail(null)}
                  style={styles.modalActionBtn}
                >
                  <Text style={styles.modalActionBtnText}>Tutup</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* EXAM DETAIL MODAL */}
      <Modal
        visible={!!selectedExamDetail}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSelectedExamDetail(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setSelectedExamDetail(null)}
          />
          <View style={styles.modalCard}>
            {selectedExamDetail && (
              <>
                <View style={styles.modalHeaderRow}>
                  <View style={[styles.modalIconBox, { backgroundColor: '#EFF6FF' }]}>
                    <MaterialCommunityIcons
                      name="file-certificate-outline"
                      size={24}
                      color="#2563EB"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.modalSubjectTitle}>
                      {selectedExamDetail.subject?.name || selectedExamDetail.subject?.nama_mapel || 'Ujian'}
                    </Text>
                    <Text style={[styles.modalSubjectCode, { color: '#2563EB', fontWeight: '700' }]}>
                      {selectedExamDetail.exam_category?.name || selectedExamDetail.examCategory?.name || 'Ujian Semester'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedExamDetail(null)}
                    style={styles.modalCloseBtn}
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalDivider} />

                <View style={styles.modalBodyRows}>
                  <View style={styles.modalDetailRow}>
                    <MaterialCommunityIcons name="calendar-outline" size={18} color="#2563EB" />
                    <Text style={styles.modalDetailLabel}>Tanggal:</Text>
                    <Text style={styles.modalDetailValue}>
                      {selectedExamDetail.exam_date || selectedExamDetail.date || '-'}
                    </Text>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <MaterialCommunityIcons name="clock-outline" size={18} color="#2563EB" />
                    <Text style={styles.modalDetailLabel}>Waktu:</Text>
                    <Text style={styles.modalDetailValue}>
                      {(selectedExamDetail.time_start || '').slice(0, 5)} - {(selectedExamDetail.time_end || '').slice(0, 5)} WIB
                    </Text>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <MaterialCommunityIcons name="map-marker-outline" size={18} color="#2563EB" />
                    <Text style={styles.modalDetailLabel}>Ruangan:</Text>
                    <Text style={styles.modalDetailValue}>
                      {selectedExamDetail.room || 'Ruang Ujian'}
                    </Text>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <MaterialCommunityIcons name="account-tie-outline" size={18} color="#2563EB" />
                    <Text style={styles.modalDetailLabel}>Pengawas:</Text>
                    <Text style={styles.modalDetailValue}>
                      {selectedExamDetail.invigilator?.nama_lengkap || selectedExamDetail.invigilator?.name || 'Ditetapkan Panitia'}
                    </Text>
                  </View>

                  {selectedExamDetail.instructions || selectedExamDetail.notes ? (
                    <View style={styles.modalDetailRow}>
                      <MaterialCommunityIcons name="information-outline" size={18} color="#2563EB" />
                      <Text style={styles.modalDetailLabel}>Catatan:</Text>
                      <Text style={[styles.modalDetailValue, { fontSize: 11.5, color: '#475569' }]}>
                        {selectedExamDetail.instructions || selectedExamDetail.notes}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedExamDetail(null)}
                  style={[styles.modalActionBtn, { backgroundColor: '#2563EB' }]}
                >
                  <Text style={styles.modalActionBtnText}>Tutup</Text>
                </TouchableOpacity>
              </>
            )}
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

      {/* MODAL NOTIFIKASI & PENGINGAT AKADEMIK SISWA (MUNCUL DARI BAWAH KE ATAS) */}
      <StudentNotificationModal
        visible={Boolean(selectedNotificationStudent)}
        student={selectedNotificationStudent}
        onClose={() => setSelectedNotificationStudent(null)}
        navigation={navigation}
      />

      {/* ── MODAL KALENDER PEMILIH TANGGAL INTERAKTIF (TAILGRIDS CALENDAR PICKER) ── */}
      <Modal
        visible={isDatePickerModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDatePickerModalVisible(false)}
      >
        <View style={styles.dateModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsDatePickerModalVisible(false)}
          />
          <View style={styles.dateModalCard}>
            {/* Header Modal Kalender */}
            <LinearGradient
              colors={['#064E3B', '#047857', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.dateModalHeader}
            >
              <View style={styles.dateModalHeaderLeft}>
                <View style={styles.dateModalIconSquircle}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateModalTitle}>Pilih Tanggal Jadwal</Text>
                  <Text style={styles.dateModalSubtitle}>Jadwal KBM & Pembelajaran Terpadu</Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setIsDatePickerModalVisible(false)}
                style={styles.dateModalCloseBtn}
                accessibilityLabel="Tutup Kalender"
              >
                <MaterialCommunityIcons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>

            {/* Konten Kalender */}
            <View style={styles.dateModalBody}>
              {/* Navigasi Bulan */}
              <View style={styles.calendarMonthNav}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    const prev = new Date(calendarViewingMonth);
                    prev.setMonth(prev.getMonth() - 1);
                    setCalendarViewingMonth(prev);
                  }}
                  style={styles.calendarNavBtn}
                  accessibilityLabel="Bulan Sebelumnya"
                >
                  <MaterialCommunityIcons name="chevron-left" size={22} color="#065F46" />
                </TouchableOpacity>

                <View style={styles.calendarMonthTitleBadge}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={15} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.calendarMonthTitle}>
                    {MONTH_NAMES[calendarViewingMonth.getMonth()]} {calendarViewingMonth.getFullYear()}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    const next = new Date(calendarViewingMonth);
                    next.setMonth(next.getMonth() + 1);
                    setCalendarViewingMonth(next);
                  }}
                  style={styles.calendarNavBtn}
                  accessibilityLabel="Bulan Berikutnya"
                >
                  <MaterialCommunityIcons name="chevron-right" size={22} color="#065F46" />
                </TouchableOpacity>
              </View>

              {/* Header Nama Hari */}
              <View style={styles.calendarDayHeaderRow}>
                {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((dh, i) => (
                  <View key={dh} style={styles.calendarDayHeaderCell}>
                    <Text style={[styles.calendarDayHeaderText, (i === 0 || i === 6) && { color: '#E11D48' }]}>
                      {dh}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Grid Tanggal Bulanan */}
              <View style={styles.calendarGrid}>
                {calendarDays.map((cd, index) => {
                  if (!cd) {
                    return <View key={`empty-${index}`} style={styles.calendarEmptyCell} />;
                  }
                  const isSel = formatDateISO(cd) === formatDateISO(selectedDate);
                  const isToday = formatDateISO(cd) === formatDateISO(new Date());

                  return (
                    <TouchableOpacity
                      key={formatDateISO(cd)}
                      activeOpacity={0.75}
                      onPress={() => {
                        setSelectedDate(cd);
                        setIsDatePickerModalVisible(false);
                      }}
                      style={[
                        styles.calendarDayCell,
                        isToday && styles.calendarDayCellToday,
                        isSel && styles.calendarDayCellSelected,
                      ]}
                    >
                      {isSel && (
                        <LinearGradient
                          colors={['#064E3B', '#047857', '#059669']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                      )}
                      <Text
                        style={[
                          styles.calendarDayNum,
                          isToday && styles.calendarDayNumToday,
                          isSel && styles.calendarDayNumSelected,
                          (cd.getDay() === 0 || cd.getDay() === 6) && !isSel && { color: '#E11D48' },
                        ]}
                      >
                        {cd.getDate()}
                      </Text>
                      {isToday && (
                        <View style={[styles.calendarCellTodayDot, isSel && { backgroundColor: '#FFFFFF' }]} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Tombol Shortcut Hari Ini (17 Okt) */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  const today = new Date();
                  setSelectedDate(today);
                  setCalendarViewingMonth(today);
                  setIsDatePickerModalVisible(false);
                }}
                style={styles.modalQuickTodayBtn}
              >
                <LinearGradient
                  colors={['#064E3B', '#047857', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <MaterialCommunityIcons name="calendar-today" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalQuickTodayBtnText}>
                  Pilih Hari Ini (Sabtu, 17 Oktober 2026)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL PILIH ANANDA (JIKA LEBIH DARI 1 ANAK) ── */}
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
              {safeChildren.map((c, idx) => {
                const cId = String(c.id || c.student_id);
                const isSelected = cId === String(selectedChildId);
                const cName = c.name || c.nama_lengkap || 'Ananda';
                const cUnit = c.unit?.name || c.unit_name || c.education_unit?.name || resolveUnitName(c) || '';
                const cClass = c.class?.name || c.kelas?.nama_kelas || c.kelas?.name || c.class_name || '';
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
  // CLEAN SCREEN STYLES (EXACT 1:1 MATCH WITH MOCKUP SCREENSHOT)
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
  studentProfileSubtitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#047857',
    marginTop: 2,
    marginBottom: 4,
    lineHeight: 18,
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

  // BANNER TAHUN AJARAN AKTIF & JADWAL OPERASIONAL ANANDA
  academicYearBanner: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  academicYearGradient: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 19,
    position: 'relative',
  },
  academicYearAccentStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3.5,
  },
  academicYearHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginTop: 2,
  },
  academicYearBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8.5,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 5,
  },
  academicYearBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  activePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7.5,
    paddingVertical: 3,
    borderRadius: 999,
    gap: 4,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  activeGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  operationalScheduleTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#004D32',
    letterSpacing: -0.2,
    lineHeight: 20,
    marginTop: 3,
  },
  operationalScheduleSub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#047857',
    marginTop: 2,
  },
  programTypeBadgeWrapper: {
    marginTop: 7,
    marginBottom: 3,
  },
  programTypeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    borderWidth: 1.2,
    gap: 5,
  },
  programTypeBadgeFullday: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  programTypeBadgeBoarding: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  programTypeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  programTypeBadgeTextFullday: {
    color: '#047857',
  },
  programTypeBadgeTextBoarding: {
    color: '#4338CA',
  },
  operationalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  operationalMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaIconSquircle: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  operationalMetaText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  kpiContainerBlock: {
    marginHorizontal: 16,
    marginBottom: 14,
  },
  tabSwitcherContainer: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#F1F5F9',
    padding: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cleanDayStripWrapper: {
    marginTop: 4,
    marginBottom: 16,
  },
  cleanDayStripScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  cleanDayPillBtn: {
    borderRadius: 14,
    width: 63,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanDayPillBtnActive: {
    backgroundColor: '#0D6B42',
    shadowColor: '#0D6B42',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cleanDayPillBtnInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cleanDayPillBtnHoliday: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1.2,
    borderColor: '#FECDD3',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  cleanDayPillBtnHolidayActive: {
    backgroundColor: '#E11D48',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 4,
  },
  cleanDayPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cleanDayPillName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  cleanDayPillNameActive: {
    color: '#FFFFFF',
  },
  cleanDayPillNameHoliday: {
    color: '#E11D48',
  },
  cleanDayPillNameHolidayActive: {
    color: '#FFFFFF',
  },
  holidayMiniDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E11D48',
  },
  cleanDayPillDate: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  cleanDayPillDateActive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  cleanDayPillDateHoliday: {
    color: '#F43F5E',
    fontWeight: '600',
  },
  cleanDayPillDateHolidayActive: {
    color: '#FFE4E6',
    fontWeight: '600',
  },
  cleanScheduleListContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  cleanScheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cleanTimeCol: {
    width: 68,
    paddingRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanTimeStartText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F2C23',
    letterSpacing: -0.2,
  },
  timelineDashRow: {
    alignItems: 'center',
    marginTop: 2,
  },
  timelineMiniLine: {
    width: 2,
    height: 8,
    borderRadius: 1,
    marginBottom: 2,
  },
  cleanTimeEndText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: -0.1,
  },
  cleanCardRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cleanCardRightOngoing: {
    borderColor: '#A7F3D0',
    backgroundColor: '#FCFDFD',
    shadowColor: '#10B981',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  cleanSquircleIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  cleanCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  cleanSubjectTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  ongoingBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 4,
  },
  ongoingPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  ongoingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  attBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  attBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cleanMetaBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 5,
  },
  cleanRoomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    gap: 3,
  },
  cleanRoomText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cleanTeacherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cleanTeacherText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
    maxWidth: 130,
  },
  cleanEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  cleanHolidayEmptyContainer: {
    backgroundColor: '#FFF8F8',
    borderColor: '#FECDD3',
    borderWidth: 1.5,
    shadowColor: '#E11D48',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  holidayBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE4E6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FDA4AF',
    gap: 5,
    marginBottom: 12,
  },
  holidayBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#BE123C',
  },
  holidayIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFE4E6',
    borderWidth: 2,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  normalEmptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DCFCE7',
    borderWidth: 2,
    borderColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cleanHolidayTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#9F1239',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  cleanHolidaySub: {
    fontSize: 12.5,
    color: '#881337',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    opacity: 0.85,
  },
  cleanEmptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  cleanEmptySub: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  cleanMondayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D6B42',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 18,
    shadowColor: '#0D6B42',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cleanMondayBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
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
  rootContainer: {
    flex: 1,
    backgroundColor: '#F0FDF4',
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
  content: { padding: 16, paddingTop: 14 },

  // STATIC TOP BAR STYLES (Identik TahfizhScreen / MaterialScreen / AcademicCalendarScreen)
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
    zIndex: 10,
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
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  heroSubtitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  heroModuleSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
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

  // DATA ANANDA (CARD ANANDA - HARMONIZED WITH CAROUSEL FULL-WIDTH)
  studentCarouselContainerBlock: {
    marginHorizontal: -16,
    marginBottom: 4,
  },
  studentContainerBlock: {
    marginBottom: 4,
  },
  containerBlock: {
    marginBottom: 16,
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
    paddingBottom: 4,
    zIndex: 1,
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
    opacity: 0.9,
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
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
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
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
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
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
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
  studentAttributesGridInactive: {
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    backgroundColor: '#18A165',
  },

  // 1.5. MASTER STATS ROW (HARMONIZED EMERALD SUMMARY CONTAINER & 4 KPI CARDS)
  emeraldSummaryContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 13,
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginTop: 10,
    marginBottom: 12,
  },
  summaryHeaderContainer: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0FDF4',
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIconBadgeModern: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#047857',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  sectionTitleBold: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  summarySubtitleText: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },
  summaryTodayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  summaryTodayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#059669',
  },
  summaryTodayBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
  },
  kpiContainer: {
    gap: 8,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    overflow: 'hidden',
  },
  kpiCardGradient: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16.5,
    justifyContent: 'space-between',
    minHeight: 82,
  },
  kpiCardEmerald: {
    borderColor: '#A7F3D0',
    backgroundColor: '#FFFFFF',
  },
  kpiCardSky: {
    borderColor: '#BAE6FD',
    backgroundColor: '#FFFFFF',
  },
  kpiCardPurple: {
    borderColor: '#E9D5FF',
    backgroundColor: '#FFFFFF',
  },
  kpiCardAmber: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFFFF',
  },
  kpiTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  kpiIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 15.5,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  kpiSub: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
  // Fallbacks for legacy/other workspace references if any
  kpiGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    marginBottom: 14,
  },
  kpiGridCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderWidth: 1.5,
    justifyContent: 'space-between',
    minHeight: 80,
  },

  // 2. DAY SELECTOR PILLS & MODE SWITCHER CONTAINER
  dayStripContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginTop: 8,
    marginBottom: 10,
  },
  dayStripHeaderBanner: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1.2,
    borderBottomColor: '#D1FAE5',
  },
  dayStripHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dayStripHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  dayStripTitleColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  openCalendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  openCalendarBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  dayStripBody: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },
  dayStripBodyCompact: {
    paddingBottom: 8,
    gap: 0,
  },
  quickTodayBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
  },
  quickTodayBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    paddingRight: 6,
  },
  quickTodayIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTodayBannerText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
    flex: 1,
  },
  quickTodayActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#059669',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  quickTodayActionPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dayStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  dayPillBtn: {
    minWidth: 84,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  dayPillBtnWeekend: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  dayPillBtnToday: {
    backgroundColor: '#ECFDF5',
    borderColor: '#34D399',
    borderWidth: 1.8,
  },
  dayPillBtnActive: {
    borderColor: '#059669',
    backgroundColor: '#047857',
    shadowColor: '#059669',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
  },
  todayIndicatorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 0.5,
    borderColor: '#A7F3D0',
  },
  todayIndicatorTagActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  todayDotActive: {
    backgroundColor: '#FFFFFF',
  },
  todayTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#065F46',
  },
  todayTagTextActive: {
    color: '#FFFFFF',
  },
  dayPillName: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
  },
  dayPillNameWeekend: {
    color: '#D97706',
  },
  dayPillNameToday: {
    color: '#059669',
    fontWeight: '900',
  },
  dayPillNameActive: {
    color: '#D1FAE5',
    fontWeight: '900',
  },
  dayPillNumber: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 1,
  },
  dayPillNumberWeekend: {
    color: '#92400E',
  },
  dayPillNumberToday: {
    color: '#065F46',
    fontWeight: '900',
  },
  dayPillNumberActive: {
    color: '#FFFFFF',
  },
  dayPillMonth: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#059669',
  },
  dayPillMonthWeekend: {
    color: '#D97706',
  },
  dayPillMonthToday: {
    color: '#059669',
    fontWeight: '800',
  },
  dayPillMonthActive: {
    color: '#DEF7EC',
    fontWeight: '800',
  },

  // 3. DATE HEADER ROW (ELEVATED CARD STYLE INTERAKTIF)
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 12,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    shadowColor: '#059669',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  dateHeaderIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dateHeaderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateHeaderSub: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.6,
  },
  todayPillBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#A7F3D0',
  },
  todayPillDotSmall: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#059669',
  },
  todayPillTextSmall: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#065F46',
  },
  dateHeaderTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  dateHeaderTapHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  dateHeaderRightCluster: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  dateHeaderEditIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadgePill: {
    backgroundColor: '#047857',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  dateBadgePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  backToTodayBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  backToTodayBannerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // 4. CLEAN SCHEDULE CARDS
  scheduleListCol: {
    gap: 10,
  },
  // MILESTONE STYLES
  milestoneContainer: {
    marginTop: 4,
    marginBottom: 8,
  },
  milestoneSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    shadowColor: '#064E3B',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  milestoneSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  milestoneSummaryIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  milestoneSummaryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  milestoneSummarySub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#D1FAE5',
    marginTop: 1,
  },
  milestoneSummaryBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  milestoneSummaryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  milestoneList: {
    paddingLeft: 2,
    paddingRight: 2,
  },
  milestoneRow: {
    flexDirection: 'row',
    marginBottom: 14,
    minHeight: 88,
  },
  milestoneTimeCol: {
    width: 60,
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingRight: 8,
  },
  milestoneTimeStart: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
  },
  milestoneTimeStartCurrent: {
    color: '#059669',
    fontSize: 13,
  },
  milestoneTimeEnd: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
  },
  liveIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 6,
    gap: 3,
  },
  liveIndicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  liveIndicatorText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.5,
  },
  milestoneSpineCol: {
    width: 28,
    alignItems: 'center',
    position: 'relative',
  },
  milestoneSpineTop: {
    width: 2.5,
    flex: 1,
    backgroundColor: '#E2E8F0',
  },
  milestoneSpineBottom: {
    width: 2.5,
    flex: 1,
    backgroundColor: '#E2E8F0',
  },
  milestoneSpinePast: {
    backgroundColor: '#10B981',
  },
  milestoneNode: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  milestoneNodePast: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  milestoneNodeCurrent: {
    backgroundColor: '#FFFFFF',
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  milestoneNodeCurrentInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  milestoneNodeUpcoming: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  milestoneNodeNumber: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  milestoneCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 0,
    marginLeft: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    overflow: 'hidden',
  },
  milestoneCardGradient: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 17,
  },
  milestoneCardCurrent: {
    backgroundColor: '#F0FDF4',
    borderColor: '#059669',
    borderLeftWidth: 5.5,
    borderLeftColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  milestoneCardPast: {
    opacity: 0.96,
  },
  milestoneCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sessionBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sessionBadgeCurrent: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  sessionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.4,
  },
  sessionBadgeTextCurrent: {
    color: '#047857',
  },
  currentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    gap: 4,
  },
  currentStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  currentStatusText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  pastStatusBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pastStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  upcomingBadgePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.8,
  },
  upcomingStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  milestoneCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  milestoneIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  milestoneInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  milestoneSubjectTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  milestoneMetaDetails: {
    marginTop: 3,
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
  },
  milestoneChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  cleanScheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTimeCol: {
    width: 90,
  },
  cardTimeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  cardSubjectTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardTeacherText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  cardRoomText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },

  // 5. BOTTOM NOTICE BANNER
  bottomNoticeBanner: {
    backgroundColor: '#DEF7EC',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  },
  bottomNoticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D6B42',
  },

  dateBadgePillToday: {
    backgroundColor: '#047857',
    shadowColor: '#047857',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  // EMPTY & HOLIDAY SCHEDULE STYLES
  holidayScheduleCard: {
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    marginVertical: 10,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  holidayCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#064E3B',
    textAlign: 'center',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  holidayCardText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#047857',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  holidayActionsRow: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  holidayMondayShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  holidayMondayShortcutBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  holidayCalendarPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  holidayCalendarPickerBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#059669',
  },
  holidayTodayShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  holidayTodayShortcutBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#047857',
  },

  // ── STYLES MODAL KALENDER PEMILIH TANGGAL (TAILGRIDS CALENDAR PICKER) ──
  dateModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dateModalCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  dateModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  dateModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  dateModalIconSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  dateModalSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D1FAE5',
    marginTop: 1,
  },
  dateModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  dateModalBody: {
    padding: 16,
  },
  calendarMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  calendarNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  calendarMonthTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#065F46',
  },
  calendarDayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  calendarDayHeaderCell: {
    width: (SCREEN_WIDTH - 64) / 7 > 44 ? 44 : (SCREEN_WIDTH - 64) / 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayHeaderText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 14,
  },
  calendarEmptyCell: {
    width: `${100 / 7}%`,
    height: 42,
  },
  calendarDayCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginVertical: 1,
  },
  calendarDayCellToday: {
    borderWidth: 1.5,
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  calendarDayCellSelected: {
    backgroundColor: '#047857',
    shadowColor: '#059669',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  calendarDayNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  calendarDayNumToday: {
    fontWeight: '900',
    color: '#047857',
  },
  calendarDayNumSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  calendarCellTodayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#10B981',
    position: 'absolute',
    bottom: 3,
  },
  modalQuickTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  modalQuickTodayBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },

  // DETAIL MODAL (BOTTOM SHEET SLIDE-UP DARI BAWAH KE ATAS)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 20,
    paddingBottom: 28,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubjectTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubjectCode: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  modalBodyRows: {
    gap: 12,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalDetailLabel: {
    width: 70,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  modalDetailValue: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalPresensiBadge: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  modalPresensiText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0D6B42',
  },
  modalScrollBody: {
    maxHeight: 440,
    marginVertical: 2,
  },
  modalScrollBodyContent: {
    paddingBottom: 4,
  },
  modalInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  modalInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalInfoBoxIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalInfoBoxLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  modalInfoBoxValue: {
    fontSize: 11,
    color: '#0F172A',
    fontWeight: '800',
    marginTop: 1,
  },
  modalSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  modalSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 9,
  },
  modalSectionIconPill: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  modalMeetingBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: '#BFDBFE',
  },
  modalMeetingBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  modalStatusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  modalStatusIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStatusTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalStatusTagText: {
    fontSize: 12,
    fontWeight: '900',
  },
  modalStatusTimeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  modalStatusSubtext: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
    marginTop: 2,
  },
  modalNoteCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 8,
    padding: 6,
    marginTop: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  modalNoteCalloutText: {
    fontSize: 10.5,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  modalJournalBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalJournalTopicRow: {
    marginBottom: 5,
  },
  modalJournalTopicLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modalJournalTopicValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  modalJournalActivityRow: {
    marginBottom: 5,
  },
  modalJournalActivityLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  modalJournalActivityValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  modalJournalNotesContainer: {
    backgroundColor: '#F0FDFA',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    padding: 8,
    marginTop: 4,
  },
  modalJournalNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  modalJournalNotesHeaderTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0F766E',
  },
  modalJournalNotesContent: {
    fontSize: 11,
    color: '#134E4A',
    fontWeight: '600',
    lineHeight: 16,
  },
  modalJournalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  modalJournalFooterText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#059669',
  },
  modalEmptyJournalBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmptyJournalTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 4,
  },
  modalEmptyJournalSub: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 14,
  },
  modalActionBtn: {
    marginTop: 14,
    backgroundColor: '#18A165',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── TAB SWITCHER STYLES (SQUIRCLE PILL MODERN) ──
  tabSwitcherWrap: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 0,
    marginBottom: 0,
  },
  tabSwitcherWrapCompact: {
    marginBottom: 0,
  },
  tabSwitcherBtnItem: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
  },
  tabSwitcherPillBase: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
    borderRadius: 14,
  },
  tabSwitcherPillActiveKbm: {
    backgroundColor: '#047857',
    shadowColor: '#047857',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabSwitcherPillActiveSemua: {
    backgroundColor: '#0D9488',
    shadowColor: '#0D9488',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabSwitcherPillActiveExam: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabSwitcherPillInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabSwitcherTextActive: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  tabSwitcherTextInactive: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.1,
  },
  tabSwitcherBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
  },
  tabSwitcherText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },

  // ── SEMUA JADWAL STYLES ──
  semuaContainer: {
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  semuaSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    shadowColor: '#0D9488',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  semuaSummaryIconSquircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  semuaFormatSwitcherContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    backgroundColor: '#F1F5F9',
    padding: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  semuaFormatBtnItem: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
  },
  semuaFormatPillActiveGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#0D9488',
    shadowColor: '#0D9488',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  semuaFormatPillInactive: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  semuaFormatTextActive: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  semuaFormatTextInactive: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.1,
  },
  semuaDayFilterWrap: {
    marginHorizontal: -16,
    marginBottom: 14,
  },
  semuaDayFilterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  semuaDayFilterBtnItem: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  semuaDayFilterPillActive: {
    paddingHorizontal: 14,
    paddingVertical: 7.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#047857',
    shadowColor: '#047857',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  semuaDayFilterPillInactive: {
    paddingHorizontal: 14,
    paddingVertical: 7.5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  semuaDayFilterTextActive: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  semuaDayFilterTextInactive: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  // Fallbacks for legacy/other workspace references if any
  semuaFormatSwitcherRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  semuaFormatPill: {
    flex: 1,
    paddingVertical: 8,
  },
  semuaDayFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  semuaDaySection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  semuaDayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  semuaDayHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  semuaDayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  semuaDayBadgeText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#065F46',
  },
  semuaDaySubtext: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  semuaEmptyDayBox: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  semuaEmptyDayText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  semuaSessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  semuaSessionIconSquircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  semuaSessionTimeText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#047857',
  },
  semuaSessionRoomText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  semuaSessionTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  semuaSessionTeacherText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  semuaMatrixContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  semuaMatrixHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  semuaMatrixHintText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0D9488',
  },
  semuaMatrixScroll: {
    borderRadius: 12,
  },
  semuaMatrixTable: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  semuaMatrixHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1.5,
    borderBottomColor: '#A7F3D0',
  },
  semuaMatrixHeaderCell: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  semuaMatrixHeaderCellText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#065F46',
  },
  semuaMatrixDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    minHeight: 54,
  },
  semuaMatrixTimeCell: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  semuaMatrixTimeLabel: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#1E293B',
  },
  semuaMatrixTimeSublabel: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 1,
  },
  semuaMatrixCell: {
    padding: 6,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  semuaMatrixBreakText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },
  semuaMatrixEmptyText: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '700',
  },
  semuaMatrixSubjText: {
    fontSize: 10.5,
    fontWeight: '800',
    lineHeight: 13,
  },
  semuaMatrixTeacherText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  semuaMatrixRoomText: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#94A3B8',
  },

  // ── EXAM SCHEDULE STYLES ──
  examContainer: {
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  examSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  examSummaryIconSquircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  examSummaryBadgePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  examCategoryFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  examCategoryBtnItem: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  examFilterPillActive: {
    paddingHorizontal: 14,
    paddingVertical: 7.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  examFilterPillInactive: {
    paddingHorizontal: 14,
    paddingVertical: 7.5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  examFilterTextActive: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  examFilterTextInactive: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  examCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  examCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  examBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  examBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  examDateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  examSubjectTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  examDetailGrid: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  examDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  examDetailText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
  },
  // ── UNIFIED FILTER CARD JADWAL (Harmonisasi Layout Filter Mutabaah TU) ──
  scheduleFilterCard: {
    marginTop: 4,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 13,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 4,
  },
  scheduleFilterCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F0FDF4',
  },
  scheduleFilterCardTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.1,
  },
  filterBadgeCount: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  filterBadgeCountText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
  },
  scheduleFilterResetBtn: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E11D48',
  },
  scheduleSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    gap: 8,
    marginVertical: 6,
  },
  scheduleSearchInput: {
    flex: 1,
    fontSize: 11.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  scheduleScopeTabsScroll: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingVertical: 2,
  },
  scheduleScopePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6.5,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  scheduleScopePillActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
    borderWidth: 1.2,
    shadowColor: '#059669',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 1,
  },
  scheduleScopePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  scheduleScopePillTextActive: {
    color: '#047857',
    fontWeight: '900',
  },

  // ── MILESTONE CARD FOOTER & ATTENDANCE PILLS ──
  milestoneCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardAttPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  cardAttPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  cardAttPendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardAttPendingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  cardTapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardTapHintText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },

  // Fallbacks & legacy aliases
  subjectFilterBlock: {
    marginTop: 4,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  subjectFilterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subjectFilterHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subjectFilterHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  subjectFilterActiveBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subjectFilterIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectFilterActiveBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
  },
  subjectFilterResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: '#FFF1F2',
  },
  subjectFilterResetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E11D48',
  },
  subjectFilterScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subjectPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6.5,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  subjectPillBtnDefault: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1.5,
  },
  subjectPillBtnActiveAll: {
    backgroundColor: '#047857',
    borderColor: '#064E3B',
    borderWidth: 1.5,
  },
  subjectPillBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  subjectPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  subjectPillTextActiveAll: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  subjectPillTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  emptyResetBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#059669',
  },
  emptyResetBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
