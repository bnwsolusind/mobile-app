import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { getApiErrorMessage } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isTeacherRole, isStaffRole } from '../utils/roles';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { TeacherStickyHeader } from '../components/TeacherStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;

type Child = Record<string, any>;

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const QUICK_RANGE_CARDS = [
  {
    key: 'today',
    label: 'Hari Ini',
    icon: 'calendar-today',
    activeBg: '#18A165',
    activeColor: '#FFFFFF',
    inactiveBg: '#ECFDF5',
    inactiveBorder: '#A7F3D0',
    inactiveColor: '#065F46',
  },
  {
    key: 'week',
    label: '1 Minggu',
    icon: 'calendar-week',
    activeBg: '#2563EB',
    activeColor: '#FFFFFF',
    inactiveBg: '#EFF6FF',
    inactiveBorder: '#BFDBFE',
    inactiveColor: '#1E40AF',
  },
  {
    key: 'month',
    label: '1 Bulan',
    icon: 'calendar-month-outline',
    activeBg: '#EA580C',
    activeColor: '#FFFFFF',
    inactiveBg: '#FFF7ED',
    inactiveBorder: '#FED7AA',
    inactiveColor: '#9A3412',
  },
  {
    key: 'semester',
    label: 'Semester',
    icon: 'book-education-outline',
    activeBg: '#0D9488',
    activeColor: '#FFFFFF',
    inactiveBg: '#F0FDFA',
    inactiveBorder: '#99F6E4',
    inactiveColor: '#115E59',
  },
  {
    key: 'year',
    label: 'Tahun Ajaran',
    icon: 'school-outline',
    activeBg: '#7C3AED',
    activeColor: '#FFFFFF',
    inactiveBg: '#FAF5FF',
    inactiveBorder: '#E9D5FF',
    inactiveColor: '#581C87',
  },
];

const getMonthGrid = (
  year: number,
  month: number,
  selectedDateStr: string,
  eventsList: any[]
) => {
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDay = now.getDate();

  const eventDates = new Set(
    (eventsList || [])
      .map((e: any) => (e.date ? String(e.date).slice(0, 10) : ''))
      .filter(Boolean)
  );

  const grid: Array<{
    day: number;
    fullDate: string;
    isCurrentMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
    hasEvent: boolean;
  }> = [];

  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const prevMonthIdx = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const fullDate = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    grid.push({
      day: d,
      fullDate,
      isCurrentMonth: false,
      isToday: false,
      isSelected: fullDate === selectedDateStr,
      hasEvent: eventDates.has(fullDate),
    });
  }

  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const fullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = year === nowYear && month === nowMonth && d === nowDay;
    const isSelected = fullDate === selectedDateStr;
    grid.push({
      day: d,
      fullDate,
      isCurrentMonth: true,
      isToday,
      isSelected,
      hasEvent: eventDates.has(fullDate),
    });
  }

  const remaining = (7 - (grid.length % 7)) % 7;
  for (let n = 1; n <= remaining; n++) {
    const nextMonthIdx = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const fullDate = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
    grid.push({
      day: n,
      fullDate,
      isCurrentMonth: false,
      isToday: false,
      isSelected: fullDate === selectedDateStr,
      hasEvent: eventDates.has(fullDate),
    });
  }

  return grid;
};

export default function AcademicCalendarScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const userRoles = useMemo(() => (roles?.length ? roles : user?.roles || []), [roles, user?.roles]);
  const isParent = isParentRole(userRoles);
  const isTeacher = isTeacherRole(userRoles) || isStaffRole(userRoles);
  const isTeacherMode = Boolean(
    isTeacher && (!isParent || route?.params?.from_teacher_portal || !route?.params?.from_child_portal)
  );

  // ── Sticky header bersama (StudentStickyHeader, sama dengan Tugas/Jadwal/Materi/Nilai) ──
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const { scrollY, handleMainScroll } = useStickyScroll();
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  // Animasi fade + slide-up card siswa di body (identik dengan TahfizhScreen / ScheduleScreen)
  const bodyCardOpacity = useMemo(() =>
    scrollY.interpolate({
      inputRange: [45, 105],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    }), [scrollY]);

  const bodyCardTranslateY = useMemo(() =>
    scrollY.interpolate({
      inputRange: [45, 105],
      outputRange: [0, -16],
      extrapolate: 'clamp',
    }), [scrollY]);

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

  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const [children, setChildren] = useState<Child[]>(() => {
    if (isTeacherMode) return [];
    const fromStore = useActiveChildStore.getState().children;
    return Array.isArray(fromStore) && fromStore.length > 0 ? fromStore : [];
  });
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(() => {
    const fromRoute = route?.params?.child_id || route?.params?.student_id;
    if (fromRoute) return String(fromRoute);
    const fromStore = useActiveChildStore.getState().activeChildId;
    return fromStore ? String(fromStore) : undefined;
  });
  const [activeChildIndex, setActiveChildIndex] = useState(0);
  const handledParamIdRef = useRef<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const studentScrollRef = useRef<ScrollView>(null);

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

  const goToLoopChild = (targetRealIndex: number): void => {
    if (studentLoopCount === 0) {
      if (children.length === 1) {
        setActiveChildIndex(0);
        syncLoopChildId(0);
      }
      return;
    }
    const n = studentLoopCount;
    const normTarget = ((targetRealIndex % n) + n) % n;
    if (normTarget === safeCenter) return;

    let delta = normTarget - safeCenter;
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;

    if (delta === 1) {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset * 2, animated: true });
      setTimeout(() => {
        setActiveChildIndex(normTarget);
        syncLoopChildId(normTarget);
        recenterLoop();
      }, 240);
    } else if (delta === -1) {
      studentScrollRef.current?.scrollTo({ x: 0, animated: true });
      setTimeout(() => {
        setActiveChildIndex(normTarget);
        syncLoopChildId(normTarget);
        recenterLoop();
      }, 240);
    } else {
      setActiveChildIndex(normTarget);
      syncLoopChildId(normTarget);
      recenterLoop();
    }
  };

  const teacherUnit = useMemo(() => {
    return (
      (user as any)?.unit_name ||
      (user?.metadata as any)?.unit ||
      (user?.metadata as any)?.unit_name ||
      (user as any)?.education_unit?.name ||
      'Pondok Pesantren'
    );
  }, [user]);

  // Siswa aktif untuk sticky header & hero (anak terpilih -> info siswa -> profil -> user)
  const headerStudent = useMemo(() => {
    if (isTeacherMode) return null;
    if (children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[safeCenter] || children[0];
    }
    if (studentInfo) return studentInfo;
    return (user as any)?.student || user || null;
  }, [isTeacherMode, children, selectedChildId, safeCenter, studentInfo, user]);

  // Nama depan + fallback tahun ajaran untuk subtitle hero statis
  const heroFirstName = useMemo(
    () => (!isTeacherMode ? resolveStudentDisplay(headerStudent, user).firstName : ''),
    [isTeacherMode, headerStudent, user]
  );
  const heroSubtitleFallback = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `Tahun Ajaran ${y}/${y + 1}` : `Tahun Ajaran ${y - 1}/${y}`;
  }, []);

  const [calendarRange, setCalendarRange] = useState<string>('today');
  const [calendarDate, setCalendarDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState<number>(() => {
    const parts = new Date().toISOString().slice(0, 10).split('-');
    return parseInt(parts[0], 10) || new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const parts = new Date().toISOString().slice(0, 10).split('-');
    return (parseInt(parts[1], 10) || (new Date().getMonth() + 1)) - 1;
  });
  const [calendarViewMode, setCalendarViewMode] = useState<'hari' | 'minggu' | 'bulan' | 'agenda'>('minggu');
  const [calendarData, setCalendarData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showAllAgendaModal, setShowAllAgendaModal] = useState<boolean>(false);

  // 1. Load Children if Parent with offline cache (selaras penuh dengan ExamGridsScreen)
  useEffect(() => {
    let isMounted = true;
    if (isParent && !isTeacherMode) {
      const targetChildId = route?.params?.child_id || route?.params?.student_id || globalActiveChildId;
      const childCacheKey = offlineCache.buildKey('academic_cal_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<Child[]>(childCacheKey);
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
          const arr = unwrapApiData<Child[]>(res) || [];
          if (isMounted && arr.length > 0) {
            setChildren(arr);
            if (targetChildId) {
              setSelectedChildId(String(targetChildId));
              const foundIdx = arr.findIndex((c: any) => String(c.id || c.student_id) === String(targetChildId));
              if (foundIdx >= 0) setActiveChildIndex(foundIdx);
            } else if (!selectedChildId) {
              setSelectedChildId(String(arr[0]?.id || arr[0]?.student_id));
              setActiveChildIndex(0);
            }
            void offlineCache.set(childCacheKey, arr);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, isTeacherMode, user?.id, globalActiveChildId]);

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
  }, [route?.params?.child_id, route?.params?.student_id, children]);

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
  }, [selectedChildId, children, activeChildIndex]);

  // Posisikan ke tengah setiap kali jumlah anak / lebar card berubah
  useEffect(() => {
    if (studentLoopCount === 0) return;
    requestAnimationFrame(() => {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
    });
  }, [studentLoopCount, studentSnapInterval, centerLoopOffset]);

  // 2. Load Academic Calendar Data from Database API with offline cache
  const loadCalendar = useCallback(async () => {
    const cacheKey = offlineCache.buildKey('academic_calendar', user?.id, `${selectedChildId || 'self'}_${calendarRange}_${calendarDate}`);

    // Baca cache dulu
    const cached = await offlineCache.get<any>(cacheKey);
    if (cached) {
      if (cached.data) setCalendarData(cached.data);
      if (cached.student) setStudentInfo(cached.student);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      setError(null);
      let data: any = null;
      let freshStudent: any = null;

      if (isTeacherMode) {
        const res = await mobileApiService.getTeacherAcademicCalendar({
          range: calendarRange,
          date: calendarDate,
        });
        const rawList = unwrapApiData<any>(res) || [];
        const rawItems = Array.isArray(rawList?.data) ? rawList.data : (Array.isArray(rawList) ? rawList : []);
        const mappedEvents = rawItems.map((item: any) => ({
          id: item.id,
          title: item.judul_pengumuman || item.title || 'Agenda Sekolah',
          description: item.isi_pengumuman || item.description || '',
          date: (item.mulai_tampil || item.created_at || '').slice(0, 10),
          start_date: item.mulai_tampil,
          end_date: item.akhir_tampil,
          type: item.tipe || item.kategori || 'akademik',
          category: item.kategori || 'Umum',
        }));

        data = {
          events: mappedEvents,
          upcoming_events: mappedEvents.slice(0, 5),
          range: calendarRange,
          date: calendarDate,
          total_events: mappedEvents.length,
        };
      } else {
        const res = await mobileApiService.getAcademicCalendar({
          range: calendarRange,
          date: calendarDate,
          child_id: selectedChildId,
        });
        data = unwrapApiData<any>(res) || {};
        freshStudent = res?.student || data?.student || null;
        if (freshStudent) {
          setStudentInfo(freshStudent);
        }
      }

      setCalendarData(data);
      void offlineCache.set(cacheKey, { data, student: freshStudent });
    } catch (err: any) {
      if (!cached) {
        setCalendarData(null);
        setError(getApiErrorMessage(err, 'Jadwal kalender akademik belum berhasil dimuat.'));
      }
    } finally {
      setLoading(false);
    }
  }, [calendarRange, calendarDate, selectedChildId, user?.id, isTeacherMode]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  // Navigation handlers
  const handlePrevDate = () => {
    const cur = new Date(calendarDate);
    if (calendarRange === 'today' || calendarViewMode === 'hari') {
      cur.setDate(cur.getDate() - 1);
    } else if (calendarRange === 'month' || calendarViewMode === 'bulan') {
      cur.setMonth(cur.getMonth() - 1);
    } else {
      cur.setDate(cur.getDate() - 7);
    }
    setCalendarDate(cur.toISOString().slice(0, 10));
  };

  const handleNextDate = () => {
    const cur = new Date(calendarDate);
    if (calendarRange === 'today' || calendarViewMode === 'hari') {
      cur.setDate(cur.getDate() + 1);
    } else if (calendarRange === 'month' || calendarViewMode === 'bulan') {
      cur.setMonth(cur.getMonth() + 1);
    } else {
      cur.setDate(cur.getDate() + 7);
    }
    setCalendarDate(cur.toISOString().slice(0, 10));
  };

  const handlePrevMonth = () => {
    let nextMonth = viewMonth - 1;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);

    const mStr = String(nextMonth + 1).padStart(2, '0');
    const dayStr = calendarDate.split('-')[2] || '01';
    const daysInTargetMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
    const clampedDay = Math.min(parseInt(dayStr, 10) || 1, daysInTargetMonth);
    const newDateStr = `${nextYear}-${mStr}-${String(clampedDay).padStart(2, '0')}`;
    setCalendarDate(newDateStr);
  };

  const handleNextMonth = () => {
    let nextMonth = viewMonth + 1;
    let nextYear = viewYear;
    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);

    const mStr = String(nextMonth + 1).padStart(2, '0');
    const dayStr = calendarDate.split('-')[2] || '01';
    const daysInTargetMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
    const clampedDay = Math.min(parseInt(dayStr, 10) || 1, daysInTargetMonth);
    const newDateStr = `${nextYear}-${mStr}-${String(clampedDay).padStart(2, '0')}`;
    setCalendarDate(newDateStr);
  };

  const handleTodayDate = () => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    setCalendarDate(todayStr);
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setCalendarRange('today');
  };

  const activeChild = useMemo(() => {
    if (children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[safeCenter] || children[0];
    }
    return headerStudent;
  }, [children, selectedChildId, safeCenter, headerStudent]);
  const events = Array.isArray(calendarData?.events) ? calendarData.events : [];
  const upcomingEvents = Array.isArray(calendarData?.upcoming_events) ? calendarData.upcoming_events : [];
  const displayDates = Array.isArray(calendarData?.display_dates) && calendarData.display_dates.length > 0
    ? calendarData.display_dates
    : Array.isArray(calendarData?.week_dates)
      ? calendarData.week_dates
      : [];
  const quickRanges = Array.isArray(calendarData?.quick_ranges) && calendarData.quick_ranges.length > 0
    ? calendarData.quick_ranges
    : [
        { key: 'today', label: 'Hari Ini' },
        { key: 'week', label: '1 Minggu' },
        { key: 'month', label: '1 Bulan' },
        { key: 'semester', label: 'Semester' },
        { key: 'year', label: 'Tahun Ajaran' },
        { key: 'all', label: 'Semua Agenda' },
      ];

  const monthGridDays = getMonthGrid(viewYear, viewMonth, calendarDate, events);

  const formattedPanelDate = (() => {
    try {
      const parts = calendarDate.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dt = new Date(y, m, d);
        const dayNamesLong = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        return `${dayNamesLong[dt.getDay()]}, ${d} ${MONTH_NAMES[m]} ${y}`;
      }
    } catch {}
    return calendarDate;
  })();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Helper pemeriksa apakah suatu agenda berlangsung pada tanggal target
  const isEventOnDate = useCallback((e: any, targetDate: string) => {
    if (!targetDate) return false;
    const eDate = e.date ? String(e.date).slice(0, 10) : '';
    const sDate = e.start_date ? String(e.start_date).slice(0, 10) : eDate;
    const edDate = e.end_date ? String(e.end_date).slice(0, 10) : (sDate || eDate);

    if (eDate === targetDate) return true;
    if (sDate && edDate && sDate <= targetDate && edDate >= targetDate) return true;
    return false;
  }, []);

  // Agenda khusus hari ini (mengikuti tanggal hari ini secara ketat)
  const todayEvents = useMemo(() => {
    return events.filter((e: any) => isEventOnDate(e, todayStr));
  }, [events, isEventOnDate, todayStr]);

  // Agenda untuk tanggal yang dipilih di panel (tanpa menampilkan agenda tanggal lain jika kosong)
  const isSelectedDateToday = calendarDate === todayStr;
  const panelEvents = useMemo(() => {
    const targetDate = calendarDate || todayStr;
    return events.filter((e: any) => isEventOnDate(e, targetDate));
  }, [events, isEventOnDate, calendarDate, todayStr]);

  return (
    <View style={styles.rootContainer}>
      {/* 0. STICKY HEADER BERSAMA */}
      {!isTeacherMode ? (
        <StudentStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Kalender Akademik"
          navigation={navigation}
          route={route}
          student={headerStudent}
          user={user}
          childrenList={children}
          selectedChildId={selectedChildId}
          onSelectChild={(cid, idx) => {
            goToLoopChild(idx);
          }}
          middleAction={{
            label: 'Jadwal',
            icon: 'calendar-clock',
            onPress: () => openScheduleForStudent(headerStudent),
          }}
          onOpenIdCard={(s) => openIdCard(s)}
          onOpenQr={(s) => openQrCard(s)}
          onOpenWeeklyReport={(s) => setSelectedWeeklyStudent(s)}
          onOpenMenu={(s) => setSelectedMenuStudent(s)}
        />
      ) : (
        <TeacherStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Kalender Akademik"
          subtitle={teacherUnit}
          navigation={navigation}
          route={route}
          equalColumns={true}
          quickChips={[
            {
              id: 'total_agenda',
              label: `Agenda (${events.length})`,
              icon: 'calendar-text-outline',
              active: calendarRange !== 'today',
              onPress: () => {
                if (calendarRange === 'today') {
                  setCalendarRange('month');
                }
              },
            },
            {
              id: 'today_btn',
              label: 'Hari Ini',
              icon: 'calendar-today',
              active: calendarRange === 'today',
              iconColor: '#059669',
              onPress: handleTodayDate,
            },
          ]}
        />
      )}
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: Math.max(bottomInset + 72, 94) }]}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadCalendar} colors={['#18A165']} progressViewOffset={topInset + 10} />}
        >
          {/* Top Bar Statis (ketika belum di-scroll) — sama style dengan Tugas/Jadwal/Materi/Nilai */}
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
                  Kalender Akademik
                </Text>
                <Text numberOfLines={1} style={styles.heroModuleSubtitle}>
                  {isTeacherMode
                    ? `${teacherUnit} • Agenda Guru`
                    : (heroFirstName ? `Ananda ${heroFirstName}` : heroSubtitleFallback)}
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
      {/* 1. TEACHER STATS CARDS (TOTAL AGENDA, FILTER PERIODE, AGENDA HARIAN) / PARENT DATA */}
      {isTeacherMode ? (
        <View style={styles.teacherStatsWrapper}>
          <View style={styles.teacherStatsRow}>
            {/* Card 1: Total Agenda */}
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => setCalendarRange(calendarRange === 'today' ? 'month' : 'today')}
              style={[styles.teacherStatCard, styles.teacherStatCardEmerald]}
            >
              <View style={styles.teacherStatTopRow}>
                <View style={[styles.teacherStatIconWrap, { backgroundColor: '#DEF7EC' }]}>
                  <MaterialCommunityIcons name="calendar-text-outline" size={16} color="#059669" />
                </View>
                <View style={[styles.teacherStatBadge, { backgroundColor: '#D1FAE5' }]}>
                  <Text style={[styles.teacherStatBadgeText, { color: '#047857' }]}>Aktif</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={[styles.teacherStatValue, { color: '#064E3B' }]}>
                {events.length}
              </Text>
              <Text numberOfLines={1} style={[styles.teacherStatLabel, { color: '#047857' }]}>
                Total Agenda
              </Text>
            </TouchableOpacity>

            {/* Card 2: Filter Periode */}
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => {
                const ranges = ['today', 'week', 'month', 'semester', 'year'];
                const curIdx = ranges.indexOf(calendarRange);
                const nextRange = ranges[(curIdx + 1) % ranges.length];
                setCalendarRange(nextRange);
              }}
              style={[styles.teacherStatCard, styles.teacherStatCardSky]}
            >
              <View style={styles.teacherStatTopRow}>
                <View style={[styles.teacherStatIconWrap, { backgroundColor: '#E0F2FE' }]}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#0284C7" />
                </View>
                <View style={[styles.teacherStatBadge, { backgroundColor: '#E0F2FE' }]}>
                  <Text style={[styles.teacherStatBadgeText, { color: '#0284C7' }]}>Periode</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={[styles.teacherStatValue, { color: '#0C4A6E', fontSize: 13 }]}>
                {calendarRange === 'today'
                  ? 'Hari Ini'
                  : calendarRange === 'week'
                  ? '1 Minggu'
                  : calendarRange === 'month'
                  ? '1 Bulan'
                  : calendarRange === 'semester'
                  ? 'Semester'
                  : 'Tahun Ajaran'}
              </Text>
              <Text numberOfLines={1} style={[styles.teacherStatLabel, { color: '#0369A1' }]}>
                Filter Periode
              </Text>
            </TouchableOpacity>

            {/* Card 3: Agenda Harian */}
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={handleTodayDate}
              style={[styles.teacherStatCard, styles.teacherStatCardAmber]}
            >
              <View style={styles.teacherStatTopRow}>
                <View style={[styles.teacherStatIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialCommunityIcons name="calendar-check-outline" size={16} color="#D97706" />
                </View>
                <View style={[styles.teacherStatBadge, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.teacherStatBadgeText, { color: '#B45309' }]}>Hari Ini</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={[styles.teacherStatValue, { color: '#78350F' }]}>
                {todayEvents.length}
              </Text>
              <Text numberOfLines={1} style={[styles.teacherStatLabel, { color: '#B45309' }]}>
                Agenda Harian
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : children.length > 0 ? (
        <Animated.View style={[styles.containerBlock, styles.studentContainerBlock, { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] }]}>
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
        <Animated.View style={[styles.containerBlock, styles.studentContainerBlock, { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] }]}>
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
        <Animated.View style={[styles.containerBlock, styles.studentContainerBlock, { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] }]}>
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
                    <Text style={styles.studentAttrLabel}>Unit</Text>
                    <Text numberOfLines={1} style={styles.studentAttrValue}>{userUnit}</Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <Text style={styles.studentAttrLabel}>Status</Text>
                    <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>{(user as any)?.status || 'Aktif'}</Text>
                  </View>
                </View>
              </LinearGradient>
            );
          })()}
        </Animated.View>
      ) : null}

      {/* Error State Banner */}
      {error ? (
        <View style={styles.errorBannerBox}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#E11D48" />
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={() => void loadCalendar()} style={styles.errorRetryBtn}>
            <Text style={styles.errorRetryText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 2. SECTION: Rentang Cepat (5 Colorful Square Cards) */}
      <View style={styles.quickRangeSectionNew}>
        <Text style={styles.quickRangeTitleNew}>Rentang Cepat:</Text>
        <View style={styles.quickRangeGridRow}>
          {QUICK_RANGE_CARDS.map((card) => {
            const isActive = calendarRange === card.key;
            return (
              <TouchableOpacity
                key={card.key}
                activeOpacity={0.8}
                onPress={() => setCalendarRange(card.key)}
                style={[
                  styles.quickRangeCardNew,
                  {
                    backgroundColor: isActive ? card.activeBg : card.inactiveBg,
                    borderColor: isActive ? card.activeBg : card.inactiveBorder,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={card.icon as any}
                  size={20}
                  color={isActive ? card.activeColor : card.inactiveColor}
                />
                <Text
                  numberOfLines={2}
                  style={[
                    styles.quickRangeCardTextNew,
                    { color: isActive ? card.activeColor : card.inactiveColor },
                  ]}
                >
                  {card.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 3. KALENDER BULANAN (CARD DIPERBESAR & FULL WIDTH) */}
      <View style={styles.calendarFullCard}>
        {/* Header Month < Month Year > */}
        <View style={styles.calendarFullHeader}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePrevMonth}
            style={styles.monthNavBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color="#0F172A" />
          </TouchableOpacity>

          <View style={styles.monthTitleWrap}>
            <Text numberOfLines={1} style={styles.monthTitleMonth}>
              {MONTH_NAMES[viewMonth] || 'Bulan'} {viewYear}
            </Text>
            <Text style={styles.monthTitleSub}>
              Pilih tanggal untuk melihat rincian agenda
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNextMonth}
            style={styles.monthNavBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons name="chevron-right" size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Days of Week Header */}
        <View style={styles.dayNamesRow}>
          {DAY_NAMES.map((dn, idx) => (
            <Text
              key={dn}
              style={[
                styles.dayNameCell,
                idx === 0 && styles.dayNameCellSun,
              ]}
            >
              {dn}
            </Text>
          ))}
        </View>

        {/* Days Grid Matrix (7 Columns) */}
        <View style={styles.daysMatrixGrid}>
          {monthGridDays.map((cell, cIdx) => {
            return (
              <TouchableOpacity
                key={`${cell.fullDate}_${cIdx}`}
                activeOpacity={0.75}
                onPress={() => {
                  setCalendarDate(cell.fullDate);
                  const parts = cell.fullDate.split('-');
                  if (parts.length === 3) {
                    setViewYear(parseInt(parts[0], 10));
                    setViewMonth(parseInt(parts[1], 10) - 1);
                  }
                }}
                style={styles.dayCellTouch}
              >
                <View
                  style={[
                    styles.dayCellCircle,
                    cell.isSelected && styles.dayCellSelectedCircle,
                    cell.isToday && !cell.isSelected && styles.dayCellTodayCircle,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayCellText,
                      !cell.isCurrentMonth && styles.dayCellTextMuted,
                      cell.isToday && !cell.isSelected && styles.dayCellTextToday,
                      cell.isSelected && styles.dayCellTextSelected,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
                {cell.hasEvent && (
                  <View
                    style={[
                      styles.dayEventIndicatorDot,
                      cell.isSelected && styles.dayEventIndicatorDotSelected,
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Dynamic Range Summary Banner from Backend (if week, month, semester, year) */}
      {calendarRange !== 'today' && calendarData?.range_info?.formatted_range && (
        <View style={styles.rangeInfoBanner}>
          <MaterialCommunityIcons name="calendar-range" size={15} color="#18A165" />
          <Text numberOfLines={1} style={styles.rangeInfoText}>
            {calendarData.range_info.label || calendarData.range_info.formatted_range}
          </Text>
          <View style={styles.rangeCountBadge}>
            <Text style={styles.rangeCountText}>
              {calendarData.range_info.total_days} Hari
            </Text>
          </View>
        </View>
      )}

      {/* 4. AGENDA HARI INI / AGENDA TANGGAL (PINDAH KE BAWAH KALENDER - FULL WIDTH) */}
      <View style={styles.agendaFullCard}>
        <View style={styles.agendaFullHeader}>
          <View style={styles.agendaFullHeaderLeft}>
            <View style={styles.agendaFullIconBox}>
              <MaterialCommunityIcons name="calendar-clock" size={20} color="#15803D" />
            </View>
            <View style={styles.agendaFullHeaderTextCol}>
              <Text style={styles.agendaFullTitle}>
                {isSelectedDateToday ? 'Agenda Hari Ini' : 'Agenda Tanggal Terpilih'}
              </Text>
              <Text numberOfLines={1} style={styles.agendaFullDate}>
                {formattedPanelDate}
              </Text>
            </View>
          </View>

          {panelEvents.length > 0 && (
            <View style={styles.agendaCountBadge}>
              <Text style={styles.agendaCountBadgeText}>
                {panelEvents.length} Agenda
              </Text>
            </View>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="small" color="#18A165" style={{ marginVertical: 24 }} />
        ) : panelEvents.length > 0 ? (
          <View style={styles.agendaFullListWrap}>
            {panelEvents.map((evt: any, idx: number) => {
              const dotColors = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B'];
              const itemColor = evt.color || dotColors[idx % dotColors.length];
              return (
                <TouchableOpacity
                  key={String(evt.id || idx)}
                  activeOpacity={0.82}
                  onPress={() => setSelectedEvent(evt)}
                  style={[styles.agendaItemCard, { borderLeftColor: itemColor }]}
                >
                  <View style={styles.agendaItemTopRow}>
                    <View style={styles.agendaItemCategoryWrap}>
                      <View style={[styles.agendaItemCategoryDot, { backgroundColor: itemColor }]} />
                      <Text style={[styles.agendaItemCategoryText, { color: itemColor }]}>
                        {evt.category || 'Kegiatan Akademik'}
                      </Text>
                    </View>
                    <View style={styles.agendaItemTimeWrap}>
                      <MaterialCommunityIcons name="clock-outline" size={13} color="#64748B" />
                      <Text numberOfLines={1} style={styles.agendaItemTimeText}>
                        {evt.time_display || (evt.time_start && evt.time_end ? `${evt.time_start} - ${evt.time_end}` : 'Waktu KBM')}
                      </Text>
                    </View>
                  </View>

                  <Text numberOfLines={2} style={styles.agendaItemTitle}>
                    {evt.title}
                  </Text>

                  {evt.description ? (
                    <Text numberOfLines={2} style={styles.agendaItemDesc}>
                      {evt.description}
                    </Text>
                  ) : null}

                  <View style={styles.agendaItemFooter}>
                    <View style={styles.agendaItemLocationRow}>
                      <MaterialCommunityIcons name="map-marker-outline" size={14} color="#64748B" />
                      <Text numberOfLines={1} style={styles.agendaItemLocationText}>
                        {evt.location || evt.room || evt.venue || evt.unit || calendarData?.unit?.name || activeChild?.unit_name || 'Kampus Sekolah'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={16} color="#94A3B8" />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.agendaEmptyBox}>
            <View style={styles.agendaEmptyIconWrap}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={28} color="#059669" />
            </View>
            <Text style={styles.agendaEmptyTitle}>
              {isSelectedDateToday ? 'Tidak Ada Agenda Hari Ini' : 'Tidak Ada Agenda Kegiatan'}
            </Text>
            <Text style={styles.agendaEmptyText}>
              {isSelectedDateToday
                ? 'Tidak ada agenda kegiatan akademik pada hari ini.'
                : 'Tidak ada jadwal kegiatan akademik pada tanggal yang dipilih.'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowAllAgendaModal(true)}
          style={styles.seeAllAgendaBtn}
        >
          <Text style={styles.seeAllAgendaBtnText}>Lihat Semua Agenda Kalender →</Text>
        </TouchableOpacity>
      </View>

      {/* Dynamic Range Summary Banner from Backend (if week, month, semester, year) */}
      {calendarRange !== 'today' && calendarData?.range_info?.formatted_range && (
        <View style={styles.rangeInfoBanner}>
          <MaterialCommunityIcons name="calendar-range" size={15} color="#18A165" />
          <Text numberOfLines={1} style={styles.rangeInfoText}>
            {calendarData.range_info.label || calendarData.range_info.formatted_range}
          </Text>
          <View style={styles.rangeCountBadge}>
            <Text style={styles.rangeCountText}>
              {calendarData.range_info.total_days} Hari
            </Text>
          </View>
        </View>
      )}

      {/* If Range is not 'today' and has events, show full list */}
      {calendarRange !== 'today' && events.length > 0 && (
        <View style={styles.eventsSection}>
          <View style={styles.eventsSectionHeader}>
            <Text style={styles.eventsSectionTitle}>
              Daftar Agenda ({events.length})
            </Text>
            <View style={styles.unitTag}>
              <MaterialCommunityIcons name="shield-check" size={12} color="#18A165" />
              <Text numberOfLines={1} style={styles.unitTagText}>
                {calendarData?.unit?.name || (isTeacherMode ? teacherUnit : (activeChild?.kelas?.unit_pendidikan?.name || activeChild?.education_unit?.name || activeChild?.unit_name || 'Unit Sekolah'))}
              </Text>
            </View>
          </View>

          {events.map((evt: any, idx: number) => {
            const borderStripeColor = evt.color || '#2563EB';
            return (
              <TouchableOpacity
                key={String(evt.id || idx)}
                activeOpacity={0.85}
                onPress={() => setSelectedEvent(evt)}
                style={[styles.eventCard, { borderLeftColor: borderStripeColor }]}
              >
                <View style={styles.eventCardHeader}>
                  <View style={styles.eventTimeBox}>
                    <MaterialCommunityIcons name="clock-outline" size={13} color="#475569" />
                    <Text style={styles.eventTimeText}>{evt.time_display || (evt.time_start && evt.time_end ? `${evt.time_start} - ${evt.time_end}` : 'Waktu KBM')}</Text>
                  </View>

                  <View
                    style={[
                      styles.eventCategoryPill,
                      { backgroundColor: (evt.color || '#2563EB') + '15' },
                    ]}
                  >
                    <View
                      style={[
                        styles.eventCategoryDot,
                        { backgroundColor: evt.color || '#2563EB' },
                      ]}
                    />
                    <Text style={[styles.eventCategoryText, { color: evt.color || '#2563EB' }]}>
                      {evt.category || 'Kegiatan'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.eventTitle}>{evt.title}</Text>

                <View style={styles.eventFooterRow}>
                  <View style={styles.eventLocationWrapper}>
                    <MaterialCommunityIcons name="map-marker-outline" size={13} color="#64748B" />
                    <Text numberOfLines={1} style={styles.eventLocationText}>
                      {evt.location || evt.room || evt.venue || evt.unit || calendarData?.unit?.name || activeChild?.unit_name || 'Kampus Sekolah'}
                    </Text>
                  </View>
                  <Text style={styles.eventDateBadge}>
                    {evt.date ? new Date(evt.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'Hari ini'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* KEGIATAN MENDATANG ROW (BOTTOM CARDS) */}
      {upcomingEvents.length > 0 && (
        <View style={styles.upcomingSection}>
          <View style={styles.upcomingHeaderRow}>
            <Text style={styles.upcomingHeaderTitle}>KEGIATAN MENDATANG</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setCalendarRange('semester')}
            >
              <Text style={styles.upcomingSeeAllText}>Lihat semester →</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upcomingScroll}>
            {upcomingEvents.map((upEvt: any, uIdx: number) => {
              const cardBorder = upEvt.color || '#18A165';
              return (
                <TouchableOpacity
                  key={String(upEvt.id || uIdx)}
                  activeOpacity={0.85}
                  onPress={() => setSelectedEvent(upEvt)}
                  style={[styles.upcomingCard, { borderTopColor: cardBorder }]}
                >
                  <View style={[styles.upcomingIconWrap, { backgroundColor: cardBorder + '18' }]}>
                    <MaterialCommunityIcons
                      name={
                        upEvt.category?.includes('Ujian')
                          ? 'school'
                          : upEvt.category?.includes('Libur')
                          ? 'beach'
                          : upEvt.category?.includes('Rapor')
                          ? 'certificate'
                          : 'account-group'
                      }
                      size={18}
                      color={cardBorder}
                    />
                  </View>
                  <Text numberOfLines={2} style={styles.upcomingCardTitle}>
                    {upEvt.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.upcomingCardSub}>
                    {upEvt.location || upEvt.room || upEvt.venue || upEvt.unit || calendarData?.unit?.name || (isTeacherMode ? teacherUnit : (activeChild?.unit_name || 'Kampus Sekolah'))}
                  </Text>
                  <Text style={styles.upcomingCardDate}>
                    {upEvt.date ? new Date(upEvt.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Mendatang'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 7. MODAL DETAIL KEGIATAN AKADEMIK */}
      <Modal
        visible={Boolean(selectedEvent)}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedEvent(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <View
                style={[
                  styles.eventCategoryPill,
                  { backgroundColor: (selectedEvent?.color || '#18A165') + '20' },
                ]}
              >
                <View
                  style={[
                    styles.eventCategoryDot,
                    { backgroundColor: selectedEvent?.color || '#18A165' },
                  ]}
                />
                <Text style={[styles.eventCategoryText, { color: selectedEvent?.color || '#18A165' }]}>
                  {selectedEvent?.category || 'Kegiatan'}
                </Text>
              </View>

              <TouchableOpacity onPress={() => setSelectedEvent(null)} style={styles.modalCloseIcon}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.detailTitle}>{selectedEvent?.title}</Text>

            <View style={styles.detailInfoBlock}>
              <View style={styles.detailInfoRow}>
                <MaterialCommunityIcons name="calendar-clock" size={16} color="#18A165" />
                <Text style={styles.detailInfoText}>
                  {selectedEvent?.date ? new Date(selectedEvent.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Hari Ini'}
                  {selectedEvent?.time_display ? ` · ${selectedEvent.time_display}` : ''}
                </Text>
              </View>

              <View style={styles.detailInfoRow}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color="#18A165" />
                <Text style={styles.detailInfoText}>
                  {selectedEvent?.location || selectedEvent?.room || selectedEvent?.venue || selectedEvent?.unit || calendarData?.unit?.name || activeChild?.unit_name || 'Kampus Sekolah'}
                </Text>
              </View>

              {selectedEvent?.teacher && (
                <View style={styles.detailInfoRow}>
                  <MaterialCommunityIcons name="account-tie" size={16} color="#18A165" />
                  <Text style={styles.detailInfoText}>
                    Pendidik: {selectedEvent.teacher}
                  </Text>
                </View>
              )}
            </View>

            {selectedEvent?.notes ? (
              <View style={styles.detailNotesBox}>
                <Text style={styles.detailNotesLabel}>Keterangan / Materi:</Text>
                <Text style={styles.detailNotesContent}>
                  {selectedEvent.notes}
                </Text>
              </View>
            ) : null}

            <View style={styles.rsvpRow}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#10B981" />
              <Text style={styles.rsvpText}>
                {calendarData?.unit?.name ? `Jadwal terdaftar resmi dalam kalender ${calendarData.unit.name}` : 'Jadwal terdaftar resmi dalam kalender akademik sekolah'}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedEvent(null)}
              style={styles.modalCloseBtn}
            >
              <Text style={styles.modalCloseBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 8. MODAL SEMUA AGENDA */}
      <Modal
        visible={showAllAgendaModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowAllAgendaModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.allAgendaCard}>
            <View style={styles.allAgendaHeader}>
              <View style={styles.allAgendaHeaderTitleWrap}>
                <MaterialCommunityIcons name="calendar-multiselect" size={20} color="#18A165" />
                <Text style={styles.allAgendaTitle}>Daftar Semua Agenda</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAllAgendaModal(false)} style={styles.modalCloseIcon}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {events.length > 0 ? (
                events.map((evt: any, idx: number) => (
                  <TouchableOpacity
                    key={String(evt.id || idx)}
                    activeOpacity={0.8}
                    onPress={() => {
                      setShowAllAgendaModal(false);
                      setSelectedEvent(evt);
                    }}
                    style={[styles.allAgendaItem, { borderLeftColor: evt.color || '#18A165' }]}
                  >
                    <View style={styles.allAgendaItemTop}>
                      <Text style={styles.allAgendaItemTime}>{evt.time_display || 'Waktu KBM'}</Text>
                      <Text style={styles.allAgendaItemDate}>
                        {evt.date ? new Date(evt.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'Hari ini'}
                      </Text>
                    </View>
                    <Text style={styles.allAgendaItemTitle}>{evt.title}</Text>
                    <Text style={styles.allAgendaItemLocation}>{evt.location || evt.room || evt.venue || evt.unit || calendarData?.unit?.name || activeChild?.unit_name || 'Kampus Sekolah'}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={36} color="#CBD5E1" />
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>Tidak ada agenda terdaftar</Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowAllAgendaModal(false)}
              style={styles.modalCloseBtn}
            >
              <Text style={styles.modalCloseBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  // Struktur scroll + hero statis disamakan plek dengan Tugas/Jadwal/Materi/Nilai
  mainScrollContent: {
    flexGrow: 1,
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
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
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
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
  childrenSection: {
    marginBottom: 14,
  },
  childrenLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#18A165',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  childrenScroll: {
    gap: 10,
    paddingRight: 10,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  childChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  childAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childAvatarActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  childNameText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  childUnitText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  childTextActive: {
    color: '#FFFFFF',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#18A165',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  unitPill: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  unitPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 6,
    gap: 8,
    marginBottom: 0,
  },
  todayBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  todayBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  navArrows: {
    flexDirection: 'row',
    gap: 2,
  },
  arrowBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  viewDateTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  modeBtnTextActive: {
    color: '#18A165',
    fontWeight: '900',
  },
  quickRangeSection: {
    marginBottom: 14,
  },
  quickRangeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
  },
  quickRangeScroll: {
    gap: 8,
    paddingRight: 10,
  },
  quickRangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickRangeChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  quickRangeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  quickRangeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  rangeInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF8F2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(24, 161, 101, 0.3)',
    marginBottom: 12,
    gap: 8,
  },
  rangeInfoText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#18A165',
  },
  rangeCountBadge: {
    backgroundColor: '#18A165',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  rangeCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  weekDatesSection: {
    marginBottom: 16,
  },
  weekDatesScroll: {
    gap: 8,
    paddingRight: 10,
    paddingBottom: 6,
  },
  weekDayCard: {
    width: 50,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    position: 'relative',
  },
  weekDayCardHighlighted: {
    backgroundColor: '#EBF8F2',
    borderColor: '#18A165',
    shadowColor: '#18A165',
    shadowOpacity: 0.2,
    elevation: 3,
  },
  weekDayCardSelected: {
    backgroundColor: '#18A165',
    borderColor: '#0D6B42',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.3,
    elevation: 4,
  },
  weekDayName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  weekDayNameHighlighted: {
    color: '#18A165',
    fontWeight: '900',
  },
  weekDayNameSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  weekDayNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  weekDayHighlightedBadge: {
    backgroundColor: '#18A165',
  },
  weekDayTodayBadge: {
    backgroundColor: '#18A165',
  },
  weekDaySelectedBadge: {
    backgroundColor: '#FFFFFF',
  },
  weekDayNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  weekDayNumberTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  weekDayNumberTextSelected: {
    color: '#18A165',
    fontWeight: '900',
  },
  todayTinyBadge: {
    position: 'absolute',
    bottom: -6,
    backgroundColor: '#18A165',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  todayTinyBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  highlightedTinyDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#18A165',
    marginTop: 4,
  },
  eventCountDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  eventCountDotText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  eventsSection: {
    marginBottom: 18,
  },
  eventsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eventsSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  unitTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 160,
  },
  unitTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#18A165',
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4.5,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  eventCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  eventTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  eventCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 5,
  },
  eventCategoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eventCategoryText: {
    fontSize: 10,
    fontWeight: '800',
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  eventFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventLocationWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
    marginRight: 8,
  },
  eventLocationText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  eventDateBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18A165',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  upcomingSection: {
    marginTop: 8,
    marginBottom: 20,
  },
  upcomingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  upcomingHeaderTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.6,
  },
  upcomingSeeAllText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },
  upcomingScroll: {
    gap: 12,
    paddingRight: 12,
  },
  upcomingCard: {
    width: 170,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopWidth: 3.5,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  upcomingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  upcomingCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    minHeight: 32,
  },
  upcomingCardSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  upcomingCardDate: {
    fontSize: 10,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 5,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalCloseIcon: {
    padding: 4,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 14,
  },
  detailInfoBlock: {
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  detailInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailInfoText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  detailNotesBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  detailNotesLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 4,
  },
  detailNotesContent: {
    fontSize: 12,
    color: '#1E293B',
    lineHeight: 18,
  },
  rsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  rsvpText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18A165',
  },
  modalCloseBtn: {
    backgroundColor: '#18A165',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },

  // 3. Kalender Bulanan (Card Diperbesar & Full Width)
  calendarFullCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: 16,
  },
  calendarFullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  monthTitleMonth: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  monthTitleSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  dayNamesRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dayNameCell: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  dayNameCellSun: {
    color: '#EF4444',
  },
  daysMatrixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  dayCellTouch: {
    width: '14.28%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayCellCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelectedCircle: {
    backgroundColor: '#18A165',
    shadowColor: '#18A165',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  dayCellTodayCircle: {
    borderWidth: 1.5,
    borderColor: '#18A165',
    backgroundColor: '#ECFDF5',
  },
  dayCellText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  dayCellTextMuted: {
    color: '#CBD5E1',
    fontWeight: '500',
  },
  dayCellTextToday: {
    color: '#18A165',
    fontWeight: '900',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  dayEventIndicatorDot: {
    position: 'absolute',
    bottom: 2,
    width: 4.5,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: '#18A165',
  },
  dayEventIndicatorDotSelected: {
    backgroundColor: '#FFFFFF',
  },

  // 4. Panel Agenda Hari Ini (Full Width di Bawah Kalender)
  agendaFullCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: 16,
  },
  agendaFullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  agendaFullHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  agendaFullIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  agendaFullHeaderTextCol: {
    flex: 1,
  },
  agendaFullTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  agendaFullDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
    marginTop: 1,
  },
  agendaCountBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  agendaCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  agendaFullListWrap: {
    gap: 10,
    marginBottom: 10,
  },
  agendaItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
  },
  agendaItemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  agendaItemCategoryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  agendaItemCategoryDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  agendaItemCategoryText: {
    fontSize: 11,
    fontWeight: '800',
  },
  agendaItemTimeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  agendaItemTimeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  agendaItemTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 4,
  },
  agendaItemDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 8,
  },
  agendaItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  agendaItemLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 6,
  },
  agendaItemLocationText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  errorBannerBox: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#9F1239',
  },
  errorRetryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E11D48',
  },
  errorRetryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  agendaEmptyBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaEmptyIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  agendaEmptyTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  agendaEmptyText: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
    paddingHorizontal: 16,
  },
  seeAllAgendaBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
  },
  seeAllAgendaBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#18A165',
  },

  // Teacher KPI Stats Cards (Total Agenda, Filter Periode, Agenda Harian)
  teacherStatsWrapper: {
    marginBottom: 14,
  },
  teacherStatsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  teacherStatCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 9,
    borderWidth: 1.2,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  teacherStatCardEmerald: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  teacherStatCardSky: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  teacherStatCardAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  teacherStatTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  teacherStatIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherStatBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  teacherStatBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  teacherStatValue: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  teacherStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // Rentang Cepat 5 Cards
  quickRangeSectionNew: {
    marginBottom: 14,
  },
  quickRangeTitleNew: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  quickRangeGridRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  quickRangeCardNew: {
    flex: 1,
    minHeight: 64,
    borderRadius: 13,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 2,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  quickRangeCardTextNew: {
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 11,
  },

  // All Agenda Modal
  allAgendaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 5,
    maxHeight: '85%',
  },
  allAgendaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  allAgendaHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allAgendaTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  allAgendaItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
  },
  allAgendaItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  allAgendaItemTime: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  allAgendaItemDate: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },
  allAgendaItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  allAgendaItemLocation: {
    fontSize: 11,
    color: '#64748B',
  },
});
