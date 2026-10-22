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
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isTeacherRole, isTuRole } from '../utils/roles';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, useStickyScroll } from '../components/StudentStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { StudentNotificationModal } from '../components/StudentNotificationModal';
import TuScheduleWorkspace from '../components/schedule/TuScheduleWorkspace';
import TeacherScheduleWorkspace from '../components/schedule/TeacherScheduleWorkspace';
import { resolveUnitName } from '../utils/employeeUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const n = name.toLowerCase();
  if (n.includes('apel') || n.includes('upacara') || n.includes('senam') || n.includes('baris')) {
    return {
      bg: '#E6FFFA',
      color: '#0D9488',
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
      bg: '#EFF6FF',
      color: '#2563EB',
      icon: 'file-document-outline',
    };
  }
  if (n.includes('bahasa') || n.includes('indonesia') || n.includes('inggris') || n.includes('arab') || n.includes('literasi')) {
    return {
      bg: '#FFE4E6',
      color: '#E11D48',
      icon: 'book-open-variant',
    };
  }
  if (n.includes('ipa') || n.includes('sains') || n.includes('biologi') || n.includes('fisika') || n.includes('kimia')) {
    return {
      bg: '#E0F2FE',
      color: '#0284C7',
      icon: 'flask-outline',
    };
  }
  if (n.includes('ips') || n.includes('sosial') || n.includes('sejarah') || n.includes('geografi')) {
    return {
      bg: '#EFF6FF',
      color: '#2563EB',
      icon: 'file-document-outline',
    };
  }
  if (n.includes('agama') || n.includes('islam') || n.includes('pai') || n.includes('fiqih') || n.includes('akidah')) {
    return {
      bg: '#E8F5E9',
      color: '#16A34A',
      icon: 'home-roof',
    };
  }
  if (n.includes('tahfizh') || n.includes('quran') || n.includes('hadits')) {
    return {
      bg: '#E8F5E9',
      color: '#16A34A',
      icon: 'book-open-page-variant',
    };
  }
  const palettes = [
    { bg: '#E6FFFA', color: '#0D9488', icon: 'bullhorn-outline' },
    { bg: '#EFF6FF', color: '#2563EB', icon: 'file-document-outline' },
    { bg: '#FFE4E6', color: '#E11D48', icon: 'book-open-variant' },
    { bg: '#E0F2FE', color: '#0284C7', icon: 'flask-outline' },
    { bg: '#E8F5E9', color: '#16A34A', icon: 'home-roof' },
    { bg: '#FEF3C7', color: '#D97706', icon: 'school-outline' },
    { bg: '#F3E8FF', color: '#9333EA', icon: 'palette-outline' },
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

  // Akses penuh untuk Tata Usaha: Tampilkan workspace monitoring & manajemen jadwal unit selaras web-dashboard
  if (isTu && !isParent && !isTeacher) {
    return <TuScheduleWorkspace navigation={navigation} user={user} />;
  }

  // Akses penuh untuk Guru/Pendidik: Tampilkan TeacherScheduleWorkspace modern, lega, bebas berhimpitan dan tanpa hardcode
  if (isTeacher && !isParent) {
    return <TeacherScheduleWorkspace navigation={navigation} user={user} route={route} />;
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

  // Sinkronkan selectedChildId saat route params atau global store berubah
  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (incomingId) {
      const strId = String(incomingId);
      if (strId !== selectedChildId) {
        setSelectedChildId(strId);
      }
      if (strId !== globalActiveChildId) {
        useActiveChildStore.getState().setActiveChildId(strId);
      }
    } else if (globalActiveChildId && globalActiveChildId !== selectedChildId) {
      setSelectedChildId(String(globalActiveChildId));
    }
  }, [route?.params?.child_id, route?.params?.student_id, globalActiveChildId, selectedChildId]);

  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 50 + 12;
    const index = Math.round(offsetX / cardWidth);
    const childList = Array.isArray(children) ? children : [];
    if (index >= 0 && index < childList.length) {
      const targetChild = childList[index];
      if (targetChild && String(targetChild.id) !== selectedChildId) {
        const sid = String(targetChild.id);
        setSelectedChildId(sid);
        useActiveChildStore.getState().setActiveChildId(sid);
      }
    }
  };

  const selectChildWithScroll = (childId: string, index: number) => {
    setSelectedChildId(childId);
    useActiveChildStore.getState().setActiveChildId(childId);
    studentScrollRef.current?.scrollTo({
      x: index * (SCREEN_WIDTH - 50 + 12),
      animated: true,
    });
  };

  // Date selection state: otomatis langsung ke hari ini (Sabtu, 17 Oktober 2026)
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
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

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [scheduleData, setScheduleData] = useState<any>(null);

  // 1. Load Children if parent (Pertahankan seluruh anak)
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const isSingleChild = route?.params?.single_child_only === true;
      const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
      const childCacheKey = offlineCache.buildKey('schedule_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any>(childCacheKey);
        const cachedList = Array.isArray(cached) ? cached : Array.isArray(cached?.data) ? cached.data : [];
        if (cachedList.length > 0 && isMounted) {
          const displayCached = (isSingleChild && targetChildId)
            ? cachedList.filter((c: any) => String(c.id || c.student_id) === String(targetChildId))
            : cachedList;
          const safeCached = displayCached.length > 0 ? displayCached : cachedList;
          setChildren(safeCached);
          useActiveChildStore.getState().setChildren(cachedList);
          const activeId = targetChildId || useActiveChildStore.getState().activeChildId || String(safeCached[0].id || safeCached[0].student_id);
          setSelectedChildId(activeId);
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const raw = unwrapApiData<any>(res);
          const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          if (isMounted && arr.length > 0) {
            const displayList = (isSingleChild && targetChildId)
              ? arr.filter((c: any) => String(c.id || c.student_id) === String(targetChildId))
              : arr;
            const safeList = displayList.length > 0 ? displayList : arr;
            setChildren(safeList);
            useActiveChildStore.getState().setChildren(arr);
            const activeId = targetChildId || useActiveChildStore.getState().activeChildId || String(safeList[0].id || safeList[0].student_id);
            setSelectedChildId(activeId);
            void offlineCache.set(childCacheKey, arr);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, route?.params?.child_id, route?.params?.student_id, route?.params?.single_child_only]);

  const hasLoadedRef = useRef<boolean>(false);

  // 2. Load schedules from backend API with date parameter & offline cache
  const loadSchedules = useCallback(async (showSpinner = false) => {
    const dateStr = formatDateISO(selectedDate);
    const cacheKey = offlineCache.buildKey('schedule', user?.id, `${selectedChildId || 'self'}_${dateStr}`);

    // Baca cache dulu agar tampil instan
    const cached = await offlineCache.get<any>(cacheKey);
    if (cached) {
      setScheduleData(cached);
      if (!hasLoadedRef.current) setLoading(false);
    } else if (showSpinner) {
      setLoading(true);
    }

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
        const res = await mobileApiService.getPortalSchedules({
          child_id: selectedChildId,
          date: dateStr,
        });
        const data = unwrapApiData<any>(res) || {};
        setScheduleData(data);
        void offlineCache.set(cacheKey, data);
      }
    } catch {
      // Jika offline dan belum ada cache, set empty object bukan crash
      if (!cached) {
        setScheduleData(null);
      }
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  }, [selectedChildId, selectedDate, user?.id]);

  // 3. Load Exam Schedules (PTS, PAS, PAT)
  const loadExamSchedules = useCallback(async () => {
    try {
      setLoadingExams(true);
      const activeChild = children.find((c) => String(c.id) === String(selectedChildId)) || children[0];
      const kelasId = activeChild?.class_id || (scheduleData?.student?.class_id ? String(scheduleData.student.class_id) : undefined);
      const res: any = await mobileApiService.getExamSchedules({
        kelas_id: kelasId,
      });
      const list = unwrapApiData<any[]>(res) || (Array.isArray(res) ? res : res?.data || []);
      setExamSchedules(Array.isArray(list) ? list : []);
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
    if (activeTab === 'exam') {
      await loadExamSchedules();
    } else {
      await loadSchedules(false);
    }
    setRefreshing(false);
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
    const targetDayOfWeek = selectedDate.getDay(); // 0=Min, 1=Sen, ..., 6=Sab

    if (Array.isArray(scheduleData?.all_schedules)) {
      return scheduleData.all_schedules.filter(
        (s: any) => Number(s.day_of_week) === targetDayOfWeek
      );
    }
    if (Array.isArray(scheduleData?.today_schedules)) {
      return scheduleData.today_schedules;
    }
    // Tidak ada data dari backend → kembalikan array kosong (tampilkan empty state)
    return [];
  }, [scheduleData, selectedDate]);

  // Jadwal setelah difilter per mata pelajaran
  const displaySchedules: ScheduleItem[] = useMemo(() => {
    if (selectedSubjectFilter === 'all') return dayBaseSchedules;
    return dayBaseSchedules.filter((s: any) => {
      const isActivity = (s.activity_type ?? 'kbm') !== 'kbm';
      const actName = s.activity_name ?? '';
      const name = (isActivity && actName) ? actName : (s.subject?.name || s.subject?.nama_mapel || '');
      const id = s.subject?.id ? String(s.subject.id) : name;
      return id === selectedSubjectFilter || name === selectedSubjectFilter;
    });
  }, [dayBaseSchedules, selectedSubjectFilter]);

  const safeChildren = Array.isArray(children) ? children : [];
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

  return (
    <View style={styles.rootContainer}>
      {/* 0. STICKY HEADER BERSAMA (identik Tugas/Materi/Nilai) */}
      <StudentStickyHeader
        scrollY={scrollY}
        topInset={topInset}
        title="Jadwal Pelajaran"
        navigation={navigation}
        route={route}
        student={activeChild}
        user={user}
        childrenList={safeChildren}
        selectedChildId={selectedChildId}
        onSelectChild={(cid, idx) => {
          setSelectedChildId(cid);
          useActiveChildStore.getState().setActiveChildId(cid);
          const foundIdx = typeof idx === 'number' && idx >= 0
            ? idx
            : safeChildren.findIndex((c) => String(c.id || c.student_id) === String(cid));
          if (foundIdx >= 0) {
            selectChildWithScroll(String(cid), foundIdx);
          }
        }}
        middleAction={{
          label: 'Tugas',
          icon: 'clipboard-text-clock-outline',
          onPress: () => navigation?.navigate('Tugas' as any),
        }}
        onOpenIdCard={(s) => openIdCard(s)}
        onOpenQr={(s) => openQrCard(s)}
        onOpenWeeklyReport={(s) => setSelectedWeeklyStudent(s)}
        onOpenMenu={(s) => setSelectedMenuStudent(s)}
        onOpenNotifications={(s) => setSelectedNotificationStudent(s || activeChild)}
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
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: bottomInset + 120 }]}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} progressViewOffset={topInset + 10} />
          }
        >
          {/* ── 0. TOP BAR STATIS (Ketika Belum Di-Scroll) ── */}
          <View style={[styles.staticTopBarWrapper, { paddingTop: topInset + 8 }]}>
            <LinearGradient
              colors={['#064E3B', '#047857', '#059669', '#10B981']}
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
                <MaterialCommunityIcons name="arrow-left" size={20} color="#047857" />
              </TouchableOpacity>

              <View style={styles.heroTitleCenterCol}>
                <Text numberOfLines={1} style={styles.heroModuleTitle}>
                  Jadwal Pelajaran
                </Text>
                <View style={styles.heroSubtitleBadge}>
                  <MaterialCommunityIcons name="account-school" size={11} color="#D1FAE5" style={{ marginRight: 4 }} />
                  <Text numberOfLines={1} style={styles.heroModuleSubtitle}>
                    {heroFirstName ? `Ananda ${heroFirstName}` : 'Jadwal KBM & Ujian Terpadu'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Notifikasi')}
                style={styles.heroSquircleBtn}
                accessibilityRole="button"
                accessibilityLabel="Notifikasi"
              >
                <MaterialCommunityIcons name="bell-outline" size={20} color="#047857" />
                {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Badan Halaman Konten */}
          <View style={styles.bodyContentWrapper}>
            {/* 1. CONTAINER DATA SISWA & UNIT PENDIDIKAN DENGAN ANIMASI FADE SCROLL */}
            {safeChildren.length > 0 ? (
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
                {safeChildren.length === 1 ? (
                  <View style={styles.singleHeroCardContainer}>
                    <StudentHeroCard
                      child={safeChildren[0]}
                      isSelected={true}
                      isSingleChild={true}
                      showActionButtons={true}
                      onPressCard={() => openIdCard(safeChildren[0])}
                      onPressWeeklyReport={() => setSelectedWeeklyStudent(safeChildren[0])}
                      onPressNotifications={() => setSelectedNotificationStudent(safeChildren[0])}
                      onPressQr={() => openQrCard(safeChildren[0])}
                      onPressPortal={() => setSelectedMenuStudent(safeChildren[0])}
                    />
                  </View>
                ) : (
                  <>
                    <ScrollView
                      ref={studentScrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={SCREEN_WIDTH - 50 + 12}
                      decelerationRate="fast"
                      onMomentumScrollEnd={handleStudentScrollEnd}
                      style={styles.heroCardScrollContainer}
                      contentContainerStyle={styles.heroCardScroll}
                    >
                      {safeChildren.map((child, idx) => (
                        <StudentHeroCard
                          key={String(child.id || idx)}
                          child={child}
                          isSelected={String(child.id) === selectedChildId}
                          isSingleChild={false}
                          showActionButtons={true}
                          onSelect={() => selectChildWithScroll(String(child.id), idx)}
                          onPressCard={() => openIdCard(child)}
                          onPressWeeklyReport={() => setSelectedWeeklyStudent(child)}
                          onPressNotifications={() => setSelectedNotificationStudent(child)}
                          onPressQr={() => openQrCard(child)}
                          onPressPortal={() => setSelectedMenuStudent(child)}
                        />
                      ))}
                    </ScrollView>

                    {/* DOT INDIKATOR SCROLL SISWA */}
                    <View style={styles.paginationDotsRow}>
                      {children.map((c, i) => {
                        const isDotActive = String(c.id) === selectedChildId;
                        return (
                          <TouchableOpacity
                            key={String(c.id || i)}
                            onPress={() => selectChildWithScroll(String(c.id), i)}
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
            ) : scheduleData?.student ? (
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
                <View style={styles.singleHeroCardContainer}>
                  <StudentHeroCard
                    child={scheduleData.student}
                    isSelected={true}
                    isSingleChild={true}
                    showActionButtons={true}
                    onPressCard={() => openIdCard(scheduleData.student)}
                    onPressWeeklyReport={() => setSelectedWeeklyStudent(scheduleData.student)}
                    onPressNotifications={() => setSelectedNotificationStudent(scheduleData.student)}
                    onPressQr={() => openQrCard(scheduleData.student)}
                    onPressPortal={() => setSelectedMenuStudent(scheduleData.student)}
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
                  const userUnit = resolveUnitName(user) || String((user as any)?.unit_name || (user as any)?.education_unit?.name || 'Unit Pendidikan Terpadu');
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
                          <Text style={styles.studentAttrLabel}>Status Akun</Text>
                          <Text numberOfLines={1} style={styles.studentAttrValue}>Terverifikasi</Text>
                        </View>
                        <View style={styles.studentAttrDivider} />
                        <View style={styles.studentAttrBox}>
                          <Text style={styles.studentAttrLabel}>Sesi KBM</Text>
                          <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>{safeDisplaySchedules.length} Sesi</Text>
                        </View>
                      </View>
                    </LinearGradient>
                  );
                })()}
              </Animated.View>
            ) : null}

            {/* 1.5. RINGKASAN METRIK JADWAL BERWARNA (TAILGRIDS HARMONIZED EMERALD SUMMARY) */}
            <View style={styles.emeraldSummaryContainer}>
              <View style={styles.summaryHeaderContainer}>
                <View style={styles.summaryTitleRow}>
                  <LinearGradient
                    colors={['#059669', '#047857']}
                    style={styles.sectionIconBadgeModern}
                  >
                    <MaterialCommunityIcons name="calendar-clock" size={17} color="#FFFFFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitleBold}>Ringkasan Jadwal & KBM</Text>
                    <Text style={styles.summarySubtitleText}>
                      {scheduleKpi.totalSessions > 0
                        ? `${scheduleKpi.totalSessions} sesi KBM aktif · ${formattedSelectedDate}`
                        : `Tidak ada sesi KBM · ${formattedSelectedDate}`}
                    </Text>
                  </View>
                  {scheduleKpi.isToday && (
                    <View style={styles.summaryTodayBadge}>
                      <View style={styles.summaryTodayDot} />
                      <Text style={styles.summaryTodayBadgeText}>Hari Ini</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* 4 KPI Cards Modern (2 Baris x 2 Kolom) */}
              <View style={styles.kpiContainer}>
                <View style={styles.kpiRow}>
                  {/* CARD 1: TOTAL SESI (EMERALD) */}
                  <View style={[styles.kpiCard, styles.kpiCardEmerald]}>
                    <LinearGradient
                      colors={['#ECFDF5', '#F0FDF4']}
                      style={styles.kpiCardGradient}
                    >
                      <View style={styles.kpiTop}>
                        <Text style={[styles.kpiLabel, { color: '#047857' }]}>Sesi KBM</Text>
                        <View style={[styles.kpiIconBadge, { backgroundColor: '#D1FAE5' }]}>
                          <MaterialCommunityIcons name="book-clock-outline" size={14} color="#059669" />
                        </View>
                      </View>
                      <Text style={[styles.kpiValue, { color: '#065F46' }]}>
                        {scheduleKpi.totalSessions} Sesi
                      </Text>
                      <Text style={[styles.kpiSub, { color: '#047857' }]}>Total Terjadwal</Text>
                    </LinearGradient>
                  </View>

                  {/* CARD 2: JAM MULAI (SKY BLUE) */}
                  <View style={[styles.kpiCard, styles.kpiCardSky]}>
                    <LinearGradient
                      colors={['#EFF6FF', '#DBEAFE']}
                      style={styles.kpiCardGradient}
                    >
                      <View style={styles.kpiTop}>
                        <Text style={[styles.kpiLabel, { color: '#1D4ED8' }]}>Jam Mulai</Text>
                        <View style={[styles.kpiIconBadge, { backgroundColor: '#DBEAFE' }]}>
                          <MaterialCommunityIcons name="clock-outline" size={14} color="#2563EB" />
                        </View>
                      </View>
                      <Text style={[styles.kpiValue, { color: '#1E40AF' }]}>
                        {scheduleKpi.startTime}
                      </Text>
                      <Text style={[styles.kpiSub, { color: '#2563EB' }]}>Waktu Masuk</Text>
                    </LinearGradient>
                  </View>
                </View>

                <View style={styles.kpiRow}>
                  {/* CARD 3: TOTAL MAPEL (PURPLE) */}
                  <View style={[styles.kpiCard, styles.kpiCardPurple]}>
                    <LinearGradient
                      colors={['#FAF5FF', '#F3E8FF']}
                      style={styles.kpiCardGradient}
                    >
                      <View style={styles.kpiTop}>
                        <Text style={[styles.kpiLabel, { color: '#6D28D9' }]}>Mata Pelajaran</Text>
                        <View style={[styles.kpiIconBadge, { backgroundColor: '#EDE9FE' }]}>
                          <MaterialCommunityIcons name="notebook-outline" size={14} color="#7C3AED" />
                        </View>
                      </View>
                      <Text style={[styles.kpiValue, { color: '#5B21B6' }]}>
                        {scheduleKpi.uniqueSubjects} Mapel
                      </Text>
                      <Text style={[styles.kpiSub, { color: '#7C3AED' }]}>Bidang Studi</Text>
                    </LinearGradient>
                  </View>

                  {/* CARD 4: STATUS (AMBER / EMERALD) */}
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
                            name={scheduleKpi.isWeekend ? 'weather-sunny' : 'check-circle-outline'}
                            size={14}
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
                        {scheduleKpi.isWeekend ? 'Libur Pembelajaran' : 'Kegiatan Belajar'}
                      </Text>
                    </LinearGradient>
                  </View>
                </View>
              </View>
            </View>

            {/* ── TAB SWITCHER: HARIAN VS SEMUA JADWAL VS UJIAN (TAILGRIDS HARMONIZED) ── */}
            <View style={styles.tabSwitcherWrap}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setActiveTab('kbm')}
                style={[
                  styles.tabSwitcherBtn,
                  activeTab === 'kbm' && styles.tabSwitcherBtnActiveKbm,
                ]}
              >
                {activeTab === 'kbm' && (
                  <LinearGradient
                    colors={['#064E3B', '#047857', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <View
                  style={[
                    styles.tabSwitcherIconSquircle,
                    activeTab === 'kbm' ? styles.tabSwitcherIconSquircleActiveKbm : styles.tabSwitcherIconSquircleInactive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="calendar-clock"
                    size={16}
                    color={activeTab === 'kbm' ? '#FFFFFF' : '#047857'}
                  />
                </View>
                <View style={styles.tabSwitcherTextWrap}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={[
                      styles.tabSwitcherText,
                      activeTab === 'kbm' && styles.tabSwitcherTextActiveKbm,
                    ]}
                  >
                    Harian
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setActiveTab('semua')}
                style={[
                  styles.tabSwitcherBtn,
                  activeTab === 'semua' && styles.tabSwitcherBtnActiveSemua,
                ]}
              >
                {activeTab === 'semua' && (
                  <LinearGradient
                    colors={['#0F766E', '#0D9488', '#14B8A6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <View
                  style={[
                    styles.tabSwitcherIconSquircle,
                    activeTab === 'semua' ? styles.tabSwitcherIconSquircleActiveSemua : styles.tabSwitcherIconSquircleInactive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="calendar-month-outline"
                    size={16}
                    color={activeTab === 'semua' ? '#FFFFFF' : '#0D9488'}
                  />
                </View>
                <View style={styles.tabSwitcherTextWrap}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={[
                      styles.tabSwitcherText,
                      activeTab === 'semua' && styles.tabSwitcherTextActiveSemua,
                    ]}
                  >
                    Semua Jadwal
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setActiveTab('exam')}
                style={[
                  styles.tabSwitcherBtn,
                  activeTab === 'exam' && styles.tabSwitcherBtnActiveExam,
                ]}
              >
                {activeTab === 'exam' && (
                  <LinearGradient
                    colors={['#1E3A8A', '#1D4ED8', '#2563EB']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <View
                  style={[
                    styles.tabSwitcherIconSquircle,
                    activeTab === 'exam' ? styles.tabSwitcherIconSquircleActiveExam : styles.tabSwitcherIconSquircleInactive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="file-document-edit-outline"
                    size={16}
                    color={activeTab === 'exam' ? '#FFFFFF' : '#2563EB'}
                  />
                </View>
                <View style={styles.tabSwitcherTextWrap}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={[
                      styles.tabSwitcherText,
                      activeTab === 'exam' && styles.tabSwitcherTextActiveExam,
                    ]}
                  >
                    Ujian
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {activeTab === 'kbm' ? (
              <>
                {/* 2. DAY SELECTOR ROW (7 PILLS: SENIN S/D AHAD DENGAN WARNA SEMANTIK & PILIHAN TANGGAL 17) */}
                <View style={styles.dayStripContainer}>
                  <View style={styles.dayStripHeader}>
                    {/* Baris 1: Judul Section & Tombol Kalender yang Lapang */}
                    <View style={styles.dayStripHeaderTopRow}>
                      <View style={styles.dayStripHeaderLeft}>
                        <View style={styles.dayStripHeaderIconWrap}>
                          <MaterialCommunityIcons name="calendar-range" size={15} color="#047857" />
                        </View>
                        <Text style={styles.dayStripHeaderTitle}>Hari & Tanggal Belajar</Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setIsDatePickerModalVisible(true)}
                        style={styles.openCalendarBtn}
                        accessibilityLabel="Buka Kalender Pemilih Tanggal"
                      >
                        <MaterialCommunityIcons name="calendar-month-outline" size={14} color="#047857" />
                        <Text numberOfLines={1} style={styles.openCalendarBtnText}>Kalender</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Baris 2: Tombol Pintas Ke Hari Ini (Hanya muncul saat bukan hari ini, dengan ruang penuh dan teks utuh) */}
                    {!scheduleKpi.isToday && (
                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => setSelectedDate(new Date())}
                        style={styles.quickTodayBannerRow}
                        accessibilityLabel="Pilih Hari Ini Tanggal 17 Oktober"
                      >
                        <View style={styles.quickTodayBannerLeft}>
                          <View style={styles.quickTodayIconCircle}>
                            <MaterialCommunityIcons name="calendar-today" size={12} color="#047857" />
                          </View>
                          <Text numberOfLines={1} style={styles.quickTodayBannerText}>
                            Kembali ke Hari Ini (Sabtu, 17 Okt 2026)
                          </Text>
                        </View>
                        <View style={styles.quickTodayActionPill}>
                          <Text style={styles.quickTodayActionPillText}>Pilih</Text>
                          <MaterialCommunityIcons name="chevron-right" size={13} color="#FFFFFF" />
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView
                    ref={dayScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dayStripRow}
                  >
                    {weekDays.map((item) => {
                      const isSel = item.isSelected;
                      const isWeekend = item.isWeekend;
                      return (
                        <TouchableOpacity
                          key={item.iso}
                          activeOpacity={0.8}
                          onPress={() => setSelectedDate(item.dateObj)}
                          style={[
                            styles.dayPillBtn,
                            isWeekend && styles.dayPillBtnWeekend,
                            item.isToday && !isSel && styles.dayPillBtnToday,
                            isSel && styles.dayPillBtnActive,
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
                          {item.isToday && (
                            <View style={[styles.todayIndicatorTag, isSel && styles.todayIndicatorTagActive]}>
                              <View style={[styles.todayDot, isSel && styles.todayDotActive]} />
                              <Text style={[styles.todayTagText, isSel && styles.todayTagTextActive]}>Hari Ini</Text>
                            </View>
                          )}
                          <Text
                            style={[
                              styles.dayPillName,
                              isWeekend && !isSel && styles.dayPillNameWeekend,
                              item.isToday && !isSel && styles.dayPillNameToday,
                              isSel && styles.dayPillNameActive,
                            ]}
                          >
                            {item.dayName}
                          </Text>
                          <Text
                            style={[
                              styles.dayPillNumber,
                              isWeekend && !isSel && styles.dayPillNumberWeekend,
                              item.isToday && !isSel && styles.dayPillNumberToday,
                              isSel && styles.dayPillNumberActive,
                            ]}
                          >
                            {item.dayNum}
                          </Text>
                          <Text
                            style={[
                              styles.dayPillMonth,
                              isWeekend && !isSel && styles.dayPillMonthWeekend,
                              item.isToday && !isSel && styles.dayPillMonthToday,
                              isSel && styles.dayPillMonthActive,
                            ]}
                          >
                            {item.monthShort}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* 2.5 FILTER MATA PELAJARAN DENGAN PALET WARNA SEMANTIK KAYA & ICON */}
                {safeAvailableSubjects.length > 0 && (
                  <View style={styles.subjectFilterBlock}>
                    <View style={styles.subjectFilterHeaderRow}>
                      <View style={styles.subjectFilterHeaderLeft}>
                        <View style={styles.subjectFilterIconBox}>
                          <MaterialCommunityIcons name="book-open-page-variant" size={14} color="#047857" />
                        </View>
                        <Text style={styles.subjectFilterHeaderTitle}>Filter Mata Pelajaran</Text>
                        {selectedSubjectFilter !== 'all' && (
                          <View style={styles.subjectFilterActiveBadge}>
                            <Text style={styles.subjectFilterActiveBadgeText}>1 Terpilih</Text>
                          </View>
                        )}
                      </View>
                      {selectedSubjectFilter !== 'all' && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setSelectedSubjectFilter('all')}
                          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                          style={styles.subjectFilterResetBtn}
                        >
                          <MaterialCommunityIcons name="close-circle-outline" size={14} color="#E11D48" />
                          <Text style={styles.subjectFilterResetText}>Reset Filter</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.subjectFilterScroll}
                    >
                      {/* Tombol Semua Mapel */}
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => setSelectedSubjectFilter('all')}
                        style={[
                          styles.subjectPillBtn,
                          selectedSubjectFilter === 'all'
                            ? styles.subjectPillBtnActiveAll
                            : styles.subjectPillBtnDefault,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="apps"
                          size={13}
                          color={selectedSubjectFilter === 'all' ? '#FFFFFF' : '#047857'}
                          style={{ marginRight: 5 }}
                        />
                        <Text
                          style={[
                            styles.subjectPillText,
                            selectedSubjectFilter === 'all'
                              ? styles.subjectPillTextActiveAll
                              : { color: '#065F46' },
                          ]}
                        >
                          Semua ({safeAvailableSubjects.length})
                        </Text>
                      </TouchableOpacity>

                      {/* Mapel Individual dengan Style Warna Semantik */}
                      {safeAvailableSubjects.map((sub, sIdx) => {
                        const isSel = selectedSubjectFilter === sub.name || selectedSubjectFilter === sub.id;
                        const sStyle = getSubjectStyle(sub.name, sIdx);
                        return (
                          <TouchableOpacity
                            key={sub.id || sIdx}
                            activeOpacity={0.75}
                            onPress={() => setSelectedSubjectFilter(sub.name)}
                            style={[
                              styles.subjectPillBtn,
                              {
                                backgroundColor: isSel ? sStyle.color : sStyle.bg,
                                borderColor: isSel ? sStyle.color : `${sStyle.color}50`,
                                borderWidth: 1.5,
                              },
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={(sStyle.icon as any) || 'book-outline'}
                              size={13}
                              color={isSel ? '#FFFFFF' : sStyle.color}
                              style={{ marginRight: 5 }}
                            />
                            <Text
                              style={[
                                styles.subjectPillText,
                                {
                                  color: isSel ? '#FFFFFF' : sStyle.color,
                                  fontWeight: isSel ? '900' : '700',
                                },
                              ]}
                            >
                              {sub.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* 3. DATE CARD DENGAN PILIHAN TANGGAL INTERAKTIF (TANGGAL 17 & KALENDER) */}
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => setIsDatePickerModalVisible(true)}
                  style={styles.dateHeaderRow}
                  accessibilityRole="button"
                  accessibilityLabel="Pilih Tanggal Jadwal atau Buka Kalender"
                >
                  <LinearGradient
                    colors={['#ECFDF5', '#F0FDF4', '#FFFFFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.dateHeaderIconBox}>
                    <LinearGradient
                      colors={['#059669', '#10B981']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <MaterialCommunityIcons name="calendar-clock" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, paddingRight: 6 }}>
                    <View style={styles.dateHeaderBadgeRow}>
                      <Text style={styles.dateHeaderSub}>
                        {scheduleKpi.isToday ? 'HARI INI · TANGGAL TERPILIH' : 'JADWAL PEMBELAJARAN'}
                      </Text>
                      {scheduleKpi.isToday && (
                        <View style={styles.todayPillBadgeSmall}>
                          <View style={styles.todayPillDotSmall} />
                          <Text style={styles.todayPillTextSmall}>Hari Ini (17 Okt)</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={1} style={styles.dateHeaderTitle}>
                      {formattedSelectedDate}
                    </Text>
                    <Text style={styles.dateHeaderTapHint}>
                      Ketuk card ini untuk memilih tanggal lain / kalender
                    </Text>
                  </View>

                  <View style={styles.dateHeaderRightCluster}>
                    <View style={styles.dateHeaderEditIconBox}>
                      <MaterialCommunityIcons name="calendar-search" size={17} color="#059669" />
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Tombol Cepat Kembali ke Hari Ini (17 Okt) Jika Sedang Memilih Tanggal Lain */}
                {!scheduleKpi.isToday && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setSelectedDate(new Date())}
                    style={styles.backToTodayBannerBtn}
                  >
                    <LinearGradient
                      colors={['#064E3B', '#047857', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <MaterialCommunityIcons name="calendar-today" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.backToTodayBannerBtnText}>
                      Kembali ke Jadwal Hari Ini (Sabtu, 17 Oktober 2026)
                    </Text>
                  </TouchableOpacity>
                )}

              {/* 4. MILESTONE SCHEDULE TIMELINE */}
              {loading ? (
                <ActivityIndicator color="#18A165" style={{ marginVertical: 32 }} />
              ) : safeDisplaySchedules.length > 0 ? (
                <View style={styles.milestoneContainer}>
                  {/* Milestone Tracker Summary Bar */}
                  <LinearGradient
                    colors={['#064E3B', '#047857', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.milestoneSummaryBar}
                  >
                    <View style={styles.milestoneSummaryLeft}>
                      <View style={styles.milestoneSummaryIconSquircle}>
                        <MaterialCommunityIcons name="map-marker-path" size={16} color="#FFFFFF" />
                      </View>
                      <View>
                        <Text style={styles.milestoneSummaryTitle}>Jalur Pembelajaran Hari Ini</Text>
                        <Text style={styles.milestoneSummarySub}>Urutan Sesi Pembelajaran & Kegiatan</Text>
                      </View>
                    </View>
                    <View style={styles.milestoneSummaryBadge}>
                      <Text style={styles.milestoneSummaryBadgeText}>
                        {safeDisplaySchedules.length} Sesi
                      </Text>
                    </View>
                  </LinearGradient>

                  {/* Milestone Items List */}
                  <View style={styles.milestoneList}>
                    {safeDisplaySchedules.map((item, idx) => {
                      const isActivity = item.activity_type === 'activity' || (item.activity_type && item.activity_type !== 'kbm');
                      const styleMeta = getSubjectStyle(item.subject?.name, idx);
                      const rawTime = item.time_display || (item.time_start && item.time_end ? `${item.time_start.slice(0, 5)} - ${item.time_end.slice(0, 5)}` : '08.00 - 09.00');
                      const timeText = rawTime.replace(/:/g, '.');
                      const timeParts = timeText.split('-').map((s: string) => s.trim());
                      const timeStart = timeParts[0] || '08.00';
                      const timeEnd = timeParts[1] || '09.00';
                      const teacherName = isActivity
                        ? (item.teacher?.name || 'Umum / Mandiri')
                        : item.teacher?.name;
                      const roomName = item.room;
                      const status = getSessionTimelineStatus(item.time_start || timeStart, item.time_end || timeEnd, selectedDate);
                      const isPast = status === 'past';
                      const isCurrent = status === 'current';
                      const isUpcoming = status === 'upcoming';
                      const isFirst = idx === 0;
                      const isLast = idx === displaySchedules.length - 1;

                      return (
                        <View key={item.id || idx} style={styles.milestoneRow}>
                          {/* Column 1: Time */}
                          <View style={styles.milestoneTimeCol}>
                            <Text style={[styles.milestoneTimeStart, isCurrent && styles.milestoneTimeStartCurrent]}>
                              {timeStart}
                            </Text>
                            <Text style={styles.milestoneTimeEnd}>
                              {timeEnd}
                            </Text>
                            {isCurrent && (
                              <View style={styles.liveIndicatorPill}>
                                <View style={styles.liveIndicatorDot} />
                                <Text style={styles.liveIndicatorText}>LIVE</Text>
                              </View>
                            )}
                          </View>

                          {/* Column 2: Milestone Node & Connecting Spine */}
                          <View style={styles.milestoneSpineCol}>
                            {/* Top Line Segment */}
                            <View
                              style={[
                                styles.milestoneSpineTop,
                                isFirst && { opacity: 0 },
                                (isPast || isCurrent) && styles.milestoneSpinePast,
                              ]}
                            />

                            {/* Node Circle */}
                            <View
                              style={[
                                styles.milestoneNode,
                                isPast && styles.milestoneNodePast,
                                isCurrent && styles.milestoneNodeCurrent,
                                isUpcoming && [
                                  styles.milestoneNodeUpcoming,
                                  {
                                    borderColor: `${styleMeta.color}80`,
                                    backgroundColor: `${styleMeta.color}12`,
                                  },
                                ],
                              ]}
                            >
                              {isPast ? (
                                <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" />
                              ) : isCurrent ? (
                                <View style={styles.milestoneNodeCurrentInner} />
                              ) : (
                                <Text
                                  style={[
                                    styles.milestoneNodeNumber,
                                    { color: styleMeta.color, fontWeight: '900' },
                                  ]}
                                >
                                  {idx + 1}
                                </Text>
                              )}
                            </View>

                            {/* Bottom Line Segment */}
                            <View
                              style={[
                                styles.milestoneSpineBottom,
                                isLast && { opacity: 0 },
                                isPast && styles.milestoneSpinePast,
                              ]}
                            />
                          </View>

                          {/* Column 3: Milestone Card */}
                          <TouchableOpacity
                            activeOpacity={0.88}
                            onPress={() => setSelectedScheduleDetail(item)}
                            style={[
                              styles.milestoneCard,
                              {
                                borderColor: isCurrent ? '#059669' : `${styleMeta.color}45`,
                                borderLeftWidth: 5.5,
                                borderLeftColor: isCurrent ? '#059669' : styleMeta.color,
                                shadowColor: styleMeta.color,
                              },
                              isPast && styles.milestoneCardPast,
                            ]}
                          >
                            <LinearGradient
                              colors={
                                isCurrent
                                  ? ['#ECFDF5', '#F0FDF4', '#FFFFFF']
                                  : [styleMeta.bg, '#FFFFFF', '#FFFFFF']
                              }
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0.85 }}
                              style={styles.milestoneCardGradient}
                            >
                              {/* Header: Sesi badge & live status */}
                              <View style={styles.milestoneCardHeader}>
                                <View
                                  style={[
                                    styles.sessionBadge,
                                    {
                                      backgroundColor: isCurrent
                                        ? '#059669'
                                        : isActivity
                                        ? '#2563EB'
                                        : styleMeta.color,
                                      borderColor: isCurrent
                                        ? '#047857'
                                        : isActivity
                                        ? '#1D4ED8'
                                        : styleMeta.color,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.sessionBadgeText,
                                      {
                                        color: '#FFFFFF',
                                        fontWeight: '900',
                                      },
                                    ]}
                                  >
                                    {isActivity ? 'KEGIATAN' : `SESI #${idx + 1}`}
                                  </Text>
                                </View>

                                {isCurrent ? (
                                  <View style={styles.currentStatusBadge}>
                                    <View style={styles.currentStatusDot} />
                                    <Text style={styles.currentStatusText}>Sedang Berlangsung</Text>
                                  </View>
                                ) : isPast ? (
                                  <View style={styles.pastStatusBadge}>
                                    <MaterialCommunityIcons name="check-circle" size={12} color="#10B981" style={{ marginRight: 3 }} />
                                    <Text style={styles.pastStatusText}>Selesai</Text>
                                  </View>
                                ) : (
                                  <View
                                    style={[
                                      styles.upcomingBadgePill,
                                      {
                                        backgroundColor: '#FFFFFF',
                                        borderColor: `${styleMeta.color}45`,
                                      },
                                    ]}
                                  >
                                    <MaterialCommunityIcons name="clock-outline" size={12} color={styleMeta.color} style={{ marginRight: 3 }} />
                                    <Text style={[styles.upcomingStatusText, { color: styleMeta.color }]}>
                                      Akan Datang
                                    </Text>
                                  </View>
                                )}
                              </View>

                              {/* Content: Subject + Icon + Teacher + Room */}
                              <View style={styles.milestoneCardBody}>
                                <View
                                  style={[
                                    styles.milestoneIconBox,
                                    {
                                      backgroundColor: '#FFFFFF',
                                      borderColor: isActivity ? '#BFDBFE' : `${styleMeta.color}45`,
                                      borderWidth: 1.5,
                                      shadowColor: styleMeta.color,
                                      shadowOpacity: 0.12,
                                      shadowRadius: 4,
                                      elevation: 2,
                                    },
                                  ]}
                                >
                                  <MaterialCommunityIcons
                                    name={isActivity ? 'star-outline' : (styleMeta.icon as any)}
                                    size={23}
                                    color={isActivity ? '#2563EB' : styleMeta.color}
                                  />
                                </View>

                                <View style={styles.milestoneInfoCol}>
                                  <Text numberOfLines={2} style={styles.milestoneSubjectTitle}>
                                    {item.subject?.name || 'Mata Pelajaran'}
                                  </Text>

                                  <View style={styles.milestoneMetaDetails}>
                                    {teacherName ? (
                                      <View style={styles.metaRow}>
                                        <MaterialCommunityIcons
                                          name={isActivity ? 'account-outline' : 'account-tie-outline'}
                                          size={13}
                                          color={styleMeta.color}
                                          style={{ marginRight: 4 }}
                                        />
                                        <Text numberOfLines={1} style={styles.metaText}>
                                          {isActivity ? `Pembina: ${teacherName}` : teacherName}
                                        </Text>
                                      </View>
                                    ) : null}

                                    {roomName ? (
                                      <View style={styles.metaRow}>
                                        <MaterialCommunityIcons
                                          name="door-open"
                                          size={13}
                                          color="#059669"
                                          style={{ marginRight: 4 }}
                                        />
                                        <Text numberOfLines={1} style={[styles.metaText, { color: '#047857' }]}>{roomName}</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                </View>

                                <View
                                  style={[
                                    styles.milestoneChevronWrap,
                                    {
                                      backgroundColor: '#FFFFFF',
                                      borderColor: `${styleMeta.color}35`,
                                      borderWidth: 1.2,
                                    },
                                  ]}
                                >
                                  <MaterialCommunityIcons
                                    name="chevron-right"
                                    size={18}
                                    color={styleMeta.color}
                                  />
                                </View>
                              </View>
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : safeDayBaseSchedules.length > 0 && safeDisplaySchedules.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="book-off-outline" size={44} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>Tidak Ada Jadwal {selectedSubjectFilter}</Text>
                  <Text style={styles.emptyText}>
                    Tidak ada sesi untuk mata pelajaran &quot;{selectedSubjectFilter}&quot; pada {formattedSelectedDate}.
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedSubjectFilter('all')}
                    style={styles.emptyResetBtn}
                  >
                    <Text style={styles.emptyResetBtnText}>Tampilkan Semua Mapel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.holidayScheduleCard}>
                  <LinearGradient
                    colors={['#ECFDF5', '#F0FDF4', '#FFFFFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.holidayIconCircle}>
                    <MaterialCommunityIcons name="weather-sunny" size={32} color="#059669" />
                  </View>
                  <Text style={styles.holidayCardTitle}>
                    {selectedDate.getDay() === 0 || selectedDate.getDay() === 6
                      ? 'Hari Ini Libur Pembelajaran (Akhir Pekan)'
                      : 'Tidak Ada KBM Terjadwal'}
                  </Text>
                  <Text style={styles.holidayCardText}>
                    {selectedDate.getDay() === 0 || selectedDate.getDay() === 6
                      ? `Tidak ada sesi KBM tatap muka reguler pada ${formattedSelectedDate}. Ananda dapat beristirahat, muraja'ah mandiri, atau menyiapkan perlengkapan belajar pekan depan.`
                      : `Tidak ada mata pelajaran atau kegiatan terjadwal untuk ${formattedSelectedDate}.`}
                  </Text>

                  <View style={styles.holidayActionsRow}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setSelectedDate(getMonday(selectedDate))}
                      style={styles.holidayMondayShortcutBtn}
                    >
                      <LinearGradient
                        colors={['#064E3B', '#047857', '#059669']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <MaterialCommunityIcons name="calendar-arrow-right" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.holidayMondayShortcutBtnText}>Lihat Jadwal KBM Hari Senin</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setIsDatePickerModalVisible(true)}
                      style={styles.holidayCalendarPickerBtn}
                    >
                      <MaterialCommunityIcons name="calendar-month-outline" size={17} color="#059669" style={{ marginRight: 6 }} />
                      <Text style={styles.holidayCalendarPickerBtnText}>Pilih Tanggal Lain / Buka Kalender</Text>
                    </TouchableOpacity>

                    {!scheduleKpi.isToday && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setSelectedDate(new Date())}
                        style={styles.holidayTodayShortcutBtn}
                      >
                        <MaterialCommunityIcons name="calendar-today" size={16} color="#047857" style={{ marginRight: 6 }} />
                        <Text style={styles.holidayTodayShortcutBtnText}>Pilih Hari Ini (Sabtu, 17 Oktober 2026)</Text>
                      </TouchableOpacity>
                    )}
                  </View>
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

              {/* Format Switcher: Daftar per Hari vs Matriks Tabel */}
              <View style={styles.semuaFormatSwitcherRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSemuaViewFormat('list')}
                  style={[
                    styles.semuaFormatPill,
                    semuaViewFormat === 'list' && styles.semuaFormatPillActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="format-list-bulleted"
                    size={15}
                    color={semuaViewFormat === 'list' ? '#065F46' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.semuaFormatPillText,
                      semuaViewFormat === 'list' && styles.semuaFormatPillTextActive,
                    ]}
                  >
                    Daftar Semua Hari
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSemuaViewFormat('matrix')}
                  style={[
                    styles.semuaFormatPill,
                    semuaViewFormat === 'matrix' && styles.semuaFormatPillActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="table-large"
                    size={15}
                    color={semuaViewFormat === 'matrix' ? '#065F46' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.semuaFormatPillText,
                      semuaViewFormat === 'matrix' && styles.semuaFormatPillTextActive,
                    ]}
                  >
                    Tabel Matriks Mingguan
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Filter Cepat Hari (untuk Format Daftar) */}
              {semuaViewFormat === 'list' && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.semuaDayFilterScroll}
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSemuaSelectedDay('all')}
                    style={[
                      styles.semuaDayFilterBtn,
                      semuaSelectedDay === 'all' && styles.semuaDayFilterBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.semuaDayFilterBtnText,
                        semuaSelectedDay === 'all' && styles.semuaDayFilterBtnTextActive,
                      ]}
                    >
                      Semua Hari
                    </Text>
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
                        activeOpacity={0.8}
                        onPress={() => setSemuaSelectedDay(d.id)}
                        style={[
                          styles.semuaDayFilterBtn,
                          isSel && styles.semuaDayFilterBtnActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.semuaDayFilterBtnText,
                            isSel && styles.semuaDayFilterBtnTextActive,
                          ]}
                        >
                          {d.name} ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
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
                    style={[
                      styles.examCategoryPill,
                      selectedExamCategory === 'all' && styles.examCategoryPillActive,
                    ]}
                    onPress={() => setSelectedExamCategory('all')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.examCategoryPillText,
                        selectedExamCategory === 'all' && styles.examCategoryPillTextActive,
                      ]}
                    >
                      Semua Kategori
                    </Text>
                  </TouchableOpacity>
                  {safeExamCategories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.examCategoryPill,
                        selectedExamCategory === c.id && styles.examCategoryPillActive,
                      ]}
                      onPress={() => setSelectedExamCategory(c.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.examCategoryPillText,
                          selectedExamCategory === c.id && styles.examCategoryPillTextActive,
                        ]}
                      >
                        {c.name}
                      </Text>
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
      </Animated.ScrollView>
    </View>

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

  // DATA ANANDA (CARD ANANDA - PRESERVED UNCHANGED)
  studentContainerBlock: {
    marginBottom: 8,
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
    borderRadius: 16,
    borderWidth: 1.2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  kpiCardGradient: {
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: 15,
    justifyContent: 'space-between',
    minHeight: 74,
  },
  kpiCardEmerald: {
    borderColor: '#A7F3D0',
  },
  kpiCardSky: {
    borderColor: '#BFDBFE',
  },
  kpiCardPurple: {
    borderColor: '#E9D5FF',
  },
  kpiCardAmber: {
    borderColor: '#FDE68A',
  },
  kpiTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  kpiIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  kpiSub: {
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 2,
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

  // 2. DAY SELECTOR PILLS (TAILGRIDS EMERALD SQUIRCLE)
  dayStripContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginTop: 10,
    marginBottom: 12,
  },
  dayStripHeader: {
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F0FDF4',
    gap: 8,
  },
  dayStripHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayStripHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  dayStripHeaderIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayStripHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  openCalendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 9,
    borderWidth: 1.2,
    borderColor: '#6EE7B7',
  },
  openCalendarBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
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
  holidayIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
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
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  tabSwitcherBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabSwitcherBtnActiveKbm: {
    borderColor: '#047857',
    shadowColor: '#059669',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  tabSwitcherBtnActiveSemua: {
    borderColor: '#0D9488',
    shadowColor: '#14B8A6',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  tabSwitcherBtnActiveExam: {
    borderColor: '#1D4ED8',
    shadowColor: '#2563EB',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  tabSwitcherIconSquircle: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  tabSwitcherIconSquircleActiveKbm: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabSwitcherIconSquircleActiveSemua: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabSwitcherIconSquircleActiveExam: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabSwitcherIconSquircleInactive: {
    backgroundColor: '#F1F5F9',
  },
  tabSwitcherTextWrap: {
    justifyContent: 'center',
  },
  tabSwitcherText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  tabSwitcherTextActiveKbm: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  tabSwitcherTextActiveSemua: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  tabSwitcherTextActiveExam: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  // ── SEMUA JADWAL STYLES ──
  semuaContainer: {
    marginTop: 4,
    marginBottom: 12,
  },
  semuaSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  semuaSummaryIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  semuaFormatSwitcherRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  semuaFormatPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  semuaFormatPillActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  semuaFormatPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  semuaFormatPillTextActive: {
    color: '#065F46',
    fontWeight: '900',
  },
  semuaDayFilterScroll: {
    gap: 6,
    paddingBottom: 10,
  },
  semuaDayFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  semuaDayFilterBtnActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  semuaDayFilterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  semuaDayFilterBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  semuaDaySection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  semuaSessionIconSquircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  semuaSessionTimeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#065F46',
  },
  semuaSessionRoomText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  semuaSessionTitleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  semuaSessionTeacherText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  semuaMatrixContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  },
  examSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  examSummaryIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  examSummaryBadgePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  examCategoryFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  examCategoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  examCategoryPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  examCategoryPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  examCategoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  examCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
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
  subjectFilterBlock: {
    marginTop: 4,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  subjectFilterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
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
    borderWidth: 1,
    borderColor: '#A7F3D0',
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
    borderWidth: 1,
    borderColor: '#FECDD3',
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
    paddingVertical: 2,
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
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
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
