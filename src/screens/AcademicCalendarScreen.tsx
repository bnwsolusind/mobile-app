import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { getApiErrorMessage } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isTeacherRole, isStaffRole, isTuRole } from '../utils/roles';
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
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

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
  const isTu = isTuRole(userRoles);
  const isParent = isParentRole(userRoles);
  const isTeacher = isTeacherRole(userRoles) || isStaffRole(userRoles) || isTu;
  const isTeacherMode = Boolean(
    (isTeacher || isTu) && (!isParent || route?.params?.from_teacher_portal || !route?.params?.from_child_portal)
  );

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
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
  const [showChildSelectorModal, setShowChildSelectorModal] = useState<boolean>(false);

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

  const studentTrackPad = useMemo(() => {
    return (SCREEN_WIDTH - studentCardWidth) / 2;
  }, [studentCardWidth]);

  const [visualDotIndex, setVisualDotIndex] = useState<number | null>(null);
  const currentActiveDotIndex = visualDotIndex !== null ? visualDotIndex : activeChildIndex;

  const scrollToActiveChild = useCallback((idx: number, animated = false): void => {
    if (children.length <= 1) return;
    const clamped = Math.max(0, Math.min(children.length - 1, idx));
    studentScrollRef.current?.scrollTo({ x: clamped * studentSnapInterval, animated });
  }, [children.length]);

  const syncLoopChildId = useCallback((realIdx: number): void => {
    const selChild = children[realIdx];
    const sid = selChild?.id || selChild?.student_id;
    if (sid) {
      const strSid = String(sid);
      setSelectedChildId(strSid);
      useActiveChildStore.getState().setActiveChildId(strSid);
    }
  }, [children]);

  const goToLoopChild = useCallback((targetIndex: number): void => {
    if (children.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(children.length - 1, targetIndex));
    setActiveChildIndex(clampedIndex);
    syncLoopChildId(clampedIndex);
    scrollToActiveChild(clampedIndex, true);
  }, [children.length, syncLoopChildId, scrollToActiveChild]);

  const [calendarData, setCalendarData] = useState<any>(null);

  const teacherUnit = useMemo(() => {
    return (
      calendarData?.unit?.name ||
      (user as any)?.unit_name ||
      (user?.metadata as any)?.unit ||
      (user?.metadata as any)?.unit_name ||
      (user as any)?.education_unit?.name ||
      (user as any)?.unit?.name ||
      'Unit Sekolah'
    );
  }, [calendarData, user]);

  // Siswa aktif untuk data kalender & profil (anak terpilih -> info siswa -> profil -> user)
  const headerStudent = useMemo(() => {
    if (isTeacherMode || isTu) return null;
    if (children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[activeChildIndex] || children[0];
    }
    if (studentInfo) return studentInfo;
    return (user as any)?.student || user || null;
  }, [isTeacherMode, isTu, children, selectedChildId, activeChildIndex, studentInfo, user]);

  const studentFullName = useMemo(() => {
    return (
      calendarData?.child?.name ||
      headerStudent?.nama_lengkap ||
      headerStudent?.name ||
      headerStudent?.full_name ||
      'Ananda'
    );
  }, [calendarData, headerStudent]);

  const studentUnit = useMemo(() => {
    return (
      calendarData?.unit?.name ||
      (typeof headerStudent?.unit?.name === 'string' && headerStudent.unit.name) ||
      (typeof headerStudent?.unit_name === 'string' && headerStudent.unit_name) ||
      (typeof headerStudent?.education_unit?.name === 'string' && headerStudent.education_unit.name) ||
      (typeof headerStudent?.education_unit_name === 'string' && headerStudent.education_unit_name) ||
      (typeof headerStudent?.unit === 'string' && headerStudent.unit) ||
      ''
    );
  }, [calendarData, headerStudent]);

  const studentClass = useMemo(() => {
    return (
      calendarData?.child?.class ||
      (typeof headerStudent?.kelas?.nama_kelas === 'string' && headerStudent.kelas.nama_kelas) ||
      (typeof headerStudent?.kelas?.name === 'string' && headerStudent.kelas.name) ||
      (typeof headerStudent?.class?.name === 'string' && headerStudent.class.name) ||
      (typeof headerStudent?.class_name === 'string' && headerStudent.class_name) ||
      (typeof headerStudent?.kelas === 'string' && headerStudent.kelas) ||
      ''
    );
  }, [calendarData, headerStudent]);

  const studentAvatarSource = useMemo(() => {
    return getStudentAvatarSource(headerStudent);
  }, [headerStudent]);

  const academicYearName = useMemo(() => {
    return calendarData?.academic_year?.name || '';
  }, [calendarData]);

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
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showAllAgendaModal, setShowAllAgendaModal] = useState<boolean>(false);

  // CRUD State for Academic Calendar (TU & Teachers)
  const [eventModalVisible, setEventModalVisible] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [savingEvent, setSavingEvent] = useState<boolean>(false);
  const [deletingEvent, setDeletingEvent] = useState<boolean>(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<any>(null);

  const CALENDAR_CATEGORIES = useMemo(() => [
    { id: 'kegiatan', label: 'Kegiatan Sekolah', color: '#0284C7', badgeColor: 'sky' },
    { id: 'libur_sekolah', label: 'Libur Sekolah & Nasional', color: '#E11D48', badgeColor: 'rose' },
    { id: 'ujian', label: 'Ujian & Asesmen', color: '#7C3AED', badgeColor: 'purple' },
    { id: 'mulai_kbm', label: 'Kegiatan Akademik & KBM', color: '#059669', badgeColor: 'emerald' },
    { id: 'terima_rapor', label: 'Penerimaan Rapor & Wisuda', color: '#D97706', badgeColor: 'amber' },
    { id: 'ekskul', label: 'Ekstrakurikuler', color: '#EA580C', badgeColor: 'orange' },
  ], []);

  const [eventForm, setEventForm] = useState({
    judul_pengumuman: '',
    isi_pengumuman: '',
    kategori: 'kegiatan',
    mulai_tampil: new Date().toISOString().slice(0, 10),
    selesai_tampil: new Date().toISOString().slice(0, 10),
    jam_mulai: '',
    jam_selesai: '',
    lokasi: '',
    prioritas: 1,
    color: 'emerald',
    target_unit: 'all',
    target_unit_name: 'Semua Unit Terpadu',
  });

  const handleOpenAddEvent = useCallback(() => {
    setEditingEvent(null);
    const todayStr = calendarDate || new Date().toISOString().slice(0, 10);
    const userUnitId = user?.scope?.unit_id || (user as any)?.unit_id || (user?.metadata as any)?.unit_id || 'all';
    const userUnitName = teacherUnit && teacherUnit !== 'Unit Sekolah' ? teacherUnit : 'Semua Unit Terpadu';
    setEventForm({
      judul_pengumuman: '',
      isi_pengumuman: '',
      kategori: 'kegiatan',
      mulai_tampil: todayStr,
      selesai_tampil: todayStr,
      jam_mulai: '',
      jam_selesai: '',
      lokasi: teacherUnit && teacherUnit !== 'Unit Sekolah' ? teacherUnit : 'Kampus Sekolah',
      prioritas: 1,
      color: 'emerald',
      target_unit: String(userUnitId),
      target_unit_name: userUnitName,
    });
    setEventModalVisible(true);
  }, [calendarDate, teacherUnit, user]);

  const handleOpenEditEvent = useCallback((evt: any) => {
    setEditingEvent(evt);
    setSelectedEvent(null);
    const raw = evt?.raw || {};
    const meta = raw?.data_tambahan || {};
    setEventForm({
      judul_pengumuman: evt?.title || raw?.judul_pengumuman || '',
      isi_pengumuman: evt?.description || evt?.notes || raw?.isi_pengumuman || '',
      kategori: evt?.kategori || meta?.kategori || 'kegiatan',
      mulai_tampil: String(evt?.start_date || evt?.date || raw?.mulai_tampil || '').slice(0, 10),
      selesai_tampil: String(evt?.end_date || raw?.selesai_tampil || evt?.start_date || evt?.date || '').slice(0, 10),
      jam_mulai: evt?.time_start || meta?.jam_mulai || '',
      jam_selesai: evt?.time_end || meta?.jam_selesai || '',
      lokasi: evt?.location || meta?.lokasi || 'Kampus Sekolah',
      prioritas: evt?.prioritas || raw?.prioritas || 1,
      color: meta?.color || evt?.color_name || 'emerald',
      target_unit: meta?.target_unit || 'all',
      target_unit_name: meta?.target_unit_name || 'Semua Unit Terpadu',
    });
    setEventModalVisible(true);
  }, []);

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
              const fallbackId = globalActiveChildId || String(arr[0]?.id || arr[0]?.student_id);
              setSelectedChildId(fallbackId);
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
        scrollToActiveChild(idx, true);
      }
    }
  }, [selectedChildId, children, activeChildIndex, scrollToActiveChild]);

  // Posisikan scroll ke kartu yang aktif saat awal load atau lebar card berubah
  useEffect(() => {
    if (children.length <= 1) return;
    requestAnimationFrame(() => {
      scrollToActiveChild(activeChildIndex, false);
    });
  }, [children.length, activeChildIndex, scrollToActiveChild]);

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

      if (isTeacherMode || isTu) {
        const res = await mobileApiService.getTeacherAcademicCalendar({
          range: calendarRange,
          date: calendarDate,
        });
        const rawList = unwrapApiData<any>(res) || [];
        const rawItems = Array.isArray(rawList?.data) ? rawList.data : (Array.isArray(rawList) ? rawList : []);
        const mappedEvents = rawItems.map((item: any) => ({
          id: String(item.id),
          title: item.title || item.judul_pengumuman || 'Agenda Sekolah',
          description: item.description || item.isi_pengumuman || '',
          notes: item.notes || item.description || item.isi_pengumuman || '',
          date: String(item.date || item.start_date || item.mulai_tampil || '').slice(0, 10),
          start_date: item.start_date || item.mulai_tampil,
          end_date: item.end_date || item.selesai_tampil || item.akhir_tampil,
          time_display: item.time_display || (item.time_start ? `${item.time_start} - ${item.time_end || ''}` : 'Sepanjang Hari'),
          time_start: item.time_start,
          time_end: item.time_end,
          location: item.location || 'Kampus Sekolah',
          type: item.type || item.kategori || 'akademik',
          category: item.category || 'Kegiatan Sekolah',
          kategori: item.kategori || 'kegiatan',
          color: item.color || '#0284C7',
          color_name: item.color_name || 'sky',
          prioritas: item.prioritas || 1,
          raw: item,
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
  }, [calendarRange, calendarDate, selectedChildId, user?.id, isTeacherMode, isTu]);

  const handleSaveEvent = useCallback(async () => {
    if (!eventForm.judul_pengumuman.trim()) {
      return;
    }
    setSavingEvent(true);
    try {
      if (editingEvent?.id) {
        await mobileApiService.updateTeacherAcademicCalendar(String(editingEvent.id), eventForm);
      } else {
        await mobileApiService.createTeacherAcademicCalendar(eventForm);
      }
      setEventModalVisible(false);
      setEditingEvent(null);
      void loadCalendar();
    } catch (err: any) {
      // Failed to save
    } finally {
      setSavingEvent(false);
    }
  }, [eventForm, editingEvent, loadCalendar]);

  const handleDeleteEvent = useCallback(async (evtId: string) => {
    if (!evtId) return;
    setDeletingEvent(true);
    try {
      await mobileApiService.deleteTeacherAcademicCalendar(String(evtId));
      setDeleteConfirmModal(null);
      setSelectedEvent(null);
      void loadCalendar();
    } catch (err: any) {
      // Failed to delete
    } finally {
      setDeletingEvent(false);
    }
  }, [loadCalendar]);

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
      return children[activeChildIndex] || children[0];
    }
    return headerStudent;
  }, [children, selectedChildId, activeChildIndex, headerStudent]);
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

  // Resolusi Dinamis Status Kehadiran Siswa Hari Ini (Single Source of Truth via studentAttendanceHelper)
  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(headerStudent);
  }, [headerStudent]);

  // Label Bahasa Indonesia Resmi untuk Rentang Waktu
  const rangeIndonesianLabel = useMemo(() => {
    switch (calendarRange) {
      case 'today': return 'Hari Ini';
      case 'week': return 'Pekan Ini';
      case 'month': return 'Bulan Ini';
      case 'semester': return 'Semester';
      case 'year': return 'Tahun Ajaran';
      default: return 'Bulan Ini';
    }
  }, [calendarRange]);

  // Sanitasi teks lokasi agar tidak kepanjangan
  const sanitizeLocation = useCallback((loc: string | undefined | null) => {
    if (!loc) return 'Kampus Sekolah';
    const clean = String(loc).trim();
    if (clean.length > 26) {
      return clean.slice(0, 24) + '...';
    }
    return clean;
  }, []);

  // Filter states untuk Daftar Agenda (filter tanggal/bulan)
  const [agendaFilterMonth, setAgendaFilterMonth] = useState<string>('');
  const [agendaFilterDate, setAgendaFilterDate] = useState<string>('');

  // Events yang sudah difilter untuk daftar agenda
  const filteredEvents = useMemo(() => {
    let list = events;
    if (agendaFilterMonth) {
      list = list.filter((e: any) => {
        const d = e.date || e.start_date || '';
        return d.slice(0, 7) === agendaFilterMonth; // 'YYYY-MM'
      });
    }
    if (agendaFilterDate) {
      list = list.filter((e: any) => isEventOnDate(e, agendaFilterDate));
    }
    return list;
  }, [events, agendaFilterMonth, agendaFilterDate, isEventOnDate]);

  // Hitung jumlah hari tanpa angka desimal untuk semua opsi rentang
  const totalDaysDisplay = useMemo(() => {
    if (calendarData?.range_info?.total_days != null) {
      const d = Math.round(Number(calendarData.range_info.total_days));
      if (!isNaN(d) && d > 0) return `${d} Hari`;
    }
    switch (calendarRange) {
      case 'today': return '1 Hari';
      case 'week': return '7 Hari';
      case 'month': return '30 Hari';
      case 'semester': return '180 Hari';
      case 'year': return '365 Hari';
      default: return '30 Hari';
    }
  }, [calendarData?.range_info?.total_days, calendarRange]);

  // Daftar bulan unik yang tersedia dari events (untuk picker bulan di Daftar Agenda)
  const availableMonths = useMemo(() => {
    const seen = new Set<string>();
    const result: { key: string; label: string }[] = [{ key: '', label: 'Semua Bulan' }];
    events.forEach((e: any) => {
      const d = e.date || e.start_date || '';
      const ym = d.slice(0, 7);
      if (ym && !seen.has(ym)) {
        seen.add(ym);
        const parts = ym.split('-');
        const mIdx = parseInt(parts[1], 10) - 1;
        result.push({ key: ym, label: `${MONTH_NAMES[mIdx] || ym} ${parts[0]}` });
      }
    });
    return result;
  }, [events]);

  // Daftar tanggal unik yang memiliki agenda (untuk filter tanggal di Daftar Agenda)
  const availableDates = useMemo(() => {
    const map = new Map<string, number>();
    events.forEach((e: any) => {
      const d = e.date || e.start_date || '';
      if (d) {
        if (!agendaFilterMonth || d.startsWith(agendaFilterMonth)) {
          map.set(d, (map.get(d) || 0) + 1);
        }
      }
    });
    const sorted = Array.from(map.keys()).sort();
    return sorted.map((dStr) => {
      const p = dStr.split('-');
      const dayNum = parseInt(p[2] || '1', 10);
      const mIdx = parseInt(p[1] || '1', 10) - 1;
      return {
        key: dStr,
        label: `${dayNum} ${MONTH_NAMES[mIdx]?.slice(0, 3) || ''}`,
        count: map.get(dStr) || 1,
      };
    });
  }, [events, agendaFilterMonth]);


  return (
    <View style={styles.rootContainer}>
      {/* ── Background Foliage Atas ── */}
      <View style={[styles.topFoliageWrapper, { height: Math.max(topInset + 300, 380) }]}>
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(236,253,245,0.20)', 'rgba(236,253,245,0.75)', '#ECFDF5']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── Clean Top Header (Fixed Luar ScrollView) ── */}
      <View style={[styles.cleanTopHeader, { paddingTop: topInset + 6 }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleBack}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color="#065F46" />
        </TouchableOpacity>

        <Text numberOfLines={1} style={styles.cleanHeaderTitle}>
          Kalender Akademik
        </Text>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation?.navigate('Notifikasi')}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#065F46" />
          {unreadNotificationCount > 0 && <View style={styles.cleanBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── Main Scroll Sheet Container ── */}
      <View style={styles.sheetContainer}>
        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[
            styles.cleanMainScrollContent,
            { paddingBottom: isTeacherMode ? Math.max(bottomInset + 130, 150) : Math.max(bottomInset + 72, 94) },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadCalendar}
              colors={['#059669', '#10B981']}
              tintColor="#059669"
            />
          }
        >
          <View style={styles.cleanScrollInner}>
            <View style={styles.bodyContentWrapper}>
              {/* ── 1. OPEN PROFILE ROW (IDENTIK BANK SOAL, CBT & KISI-KISI) ── */}
              {!isTeacherMode ? (
                <View style={styles.studentProfileRow}>
                  {/* 60x60 Avatar with Mint Ring */}
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

                    {/* Baris 2: Unit Pendidikan Dinamis */}
                    {studentUnit ? (
                      <View style={styles.studentMetaRow}>
                        <MaterialCommunityIcons name="school-outline" size={12} color="#047857" style={{ marginRight: 4 }} />
                        <Text numberOfLines={1} style={styles.studentProfileUnitText}>
                          {studentUnit}
                        </Text>
                      </View>
                    ) : null}

                    {/* Baris 3: Kelas Siswa Dinamis */}
                    {studentClass ? (
                      <View style={styles.studentMetaRow}>
                        <MaterialCommunityIcons name="door-open" size={12} color="#065F46" style={{ marginRight: 4 }} />
                        <Text numberOfLines={1} style={styles.studentProfileClassText}>
                          {studentClass}
                        </Text>
                      </View>
                    ) : null}

                    {/* Baris Aksi Terpadu */}
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
              ) : null}

              {/* ── 2. HERO KPI GROUP CARD (IDENTIK GOLD STANDARD) ── */}
              <View style={[styles.calendarGroupCard, { marginTop: 6 }]}>
                <LinearGradient
                  colors={['#059669', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.calendarGroupHeaderGradient}
                >
                  <View style={styles.calendarGroupHeaderLeft}>
                    <View style={styles.calendarGroupHeaderIconBoxWhite}>
                      <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#047857" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.calendarGroupTitleWhite}>
                        Kalender Akademik Unit
                      </Text>
                      <Text numberOfLines={1} style={styles.calendarGroupSubWhite}>
                        {studentUnit || (isTeacherMode ? teacherUnit : 'Seluruh Agenda Unit')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.calendarGroupBadge}>
                    <MaterialCommunityIcons name="school" size={12} color="#047857" style={{ marginRight: 3 }} />
                    <Text style={styles.calendarGroupBadgeText}>
                      {academicYearName ? `TA ${academicYearName}` : 'Tahun Ajaran Aktif'}
                    </Text>
                  </View>
                </LinearGradient>

                {/* 3 Kolom KPI Modern (Simetris & Presisi) */}
                <View style={styles.kpiRowModern}>
                  {/* KPI 1: Total Agenda */}
                  <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={() => setCalendarRange(calendarRange === 'today' ? 'month' : 'today')}
                    style={[styles.kpiCardModern, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kpiLabelModern}>Total Agenda</Text>
                      <Text numberOfLines={1} style={[styles.kpiValueModern, { color: '#064E3B' }]}>
                        {events.length}
                      </Text>
                      <Text style={styles.kpiSubModern}>Agenda Terdaftar</Text>
                    </View>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#DEF7EC' }]}>
                      <MaterialCommunityIcons name="calendar-text-outline" size={18} color="#059669" />
                    </View>
                  </TouchableOpacity>

                  {/* KPI 2: Hari Ini */}
                  <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={handleTodayDate}
                    style={[styles.kpiCardModern, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kpiLabelModern}>Hari Ini</Text>
                      <Text numberOfLines={1} style={[styles.kpiValueModern, { color: '#78350F' }]}>
                        {todayEvents.length}
                      </Text>
                      <Text style={styles.kpiSubModern}>Agenda Aktif</Text>
                    </View>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#FEF3C7' }]}>
                      <MaterialCommunityIcons name="calendar-check-outline" size={18} color="#D97706" />
                    </View>
                  </TouchableOpacity>

                  {/* KPI 3: Rentang Waktu */}
                  <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={() => {
                      const ranges = ['today', 'week', 'month', 'semester', 'year'];
                      const curIdx = ranges.indexOf(calendarRange);
                      const nextRange = ranges[(curIdx + 1) % ranges.length];
                      setCalendarRange(nextRange);
                    }}
                    style={[styles.kpiCardModern, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kpiLabelModern}>Rentang</Text>
                      <Text numberOfLines={1} style={[styles.kpiValueModern, { color: '#0C4A6E', fontSize: 13.5 }]}>
                        {totalDaysDisplay}
                      </Text>
                      <Text numberOfLines={1} style={styles.kpiSubModern}>
                        {rangeIndonesianLabel}
                      </Text>
                    </View>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#E0F2FE' }]}>
                      <MaterialCommunityIcons name="calendar-range" size={18} color="#0284C7" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

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

      {/* 2. SECTION: Pilihan Rentang Waktu (Pill Bar Modern) */}
      <View style={styles.quickRangeSectionNew}>
        <View style={styles.quickRangeHeaderRow}>
          <MaterialCommunityIcons name="clock-time-four-outline" size={14} color="#059669" />
          <Text style={styles.quickRangeTitleNew}>Pilihan Periode Kalender</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRangeScrollRow}
        >
          {QUICK_RANGE_CARDS.map((card) => {
            const isActive = calendarRange === card.key;
            return (
              <TouchableOpacity
                key={card.key}
                activeOpacity={0.8}
                onPress={() => setCalendarRange(card.key)}
                style={[
                  styles.quickRangePillNew,
                  {
                    backgroundColor: isActive ? card.activeBg : card.inactiveBg,
                    borderColor: isActive ? card.activeBg : card.inactiveBorder,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={card.icon as any}
                  size={15}
                  color={isActive ? card.activeColor : card.inactiveColor}
                />
                <Text
                  style={[
                    styles.quickRangePillTextNew,
                    { color: isActive ? card.activeColor : card.inactiveColor },
                  ]}
                >
                  {card.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
                        {sanitizeLocation(evt.location || evt.room || evt.venue || evt.unit || calendarData?.unit?.name || studentUnit || (isTeacherMode ? teacherUnit : 'Kampus Sekolah'))}
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

      {/* 5. DAFTAR AGENDA DENGAN FILTER TANGGAL & BULAN */}
      {calendarRange !== 'today' && events.length > 0 && (
        <View style={styles.eventsSection}>
          <View style={styles.eventsSectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventsSectionTitle}>
                Daftar Agenda ({filteredEvents.length}{filteredEvents.length !== events.length ? ` dari ${events.length}` : ''})
              </Text>
              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                {agendaFilterMonth || agendaFilterDate ? 'Filter aktif' : 'Semua agenda periode aktif'}
              </Text>
            </View>
            <View style={styles.unitTag}>
              <MaterialCommunityIcons name="shield-check" size={12} color="#18A165" />
              <Text numberOfLines={1} style={styles.unitTagText}>
                {calendarData?.unit?.name || studentUnit || (isTeacherMode ? teacherUnit : 'Unit Sekolah')}
              </Text>
            </View>
          </View>

          {/* Filter Bar: Pilihan Bulan */}
          {availableMonths.length > 1 && (
            <View style={{ marginTop: 4, marginBottom: 2 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 2, paddingVertical: 6, gap: 6 }}
              >
                {availableMonths.map((m) => {
                  const isActive = agendaFilterMonth === m.key;
                  return (
                    <TouchableOpacity
                      key={m.key || 'all'}
                      activeOpacity={0.8}
                      onPress={() => {
                        setAgendaFilterMonth(m.key);
                        // Jika pindah bulan, reset filter tanggal jika tanggal tidak ada di bulan tersebut
                        if (agendaFilterDate && m.key && !agendaFilterDate.startsWith(m.key)) {
                          setAgendaFilterDate('');
                        }
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 16,
                        backgroundColor: isActive ? '#059669' : '#F1F5F9',
                        borderWidth: 1,
                        borderColor: isActive ? '#047857' : '#E2E8F0',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: isActive ? '700' : '600',
                          color: isActive ? '#FFFFFF' : '#475569',
                        }}
                      >
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Filter Bar: Pilihan Tanggal Spesifik */}
          {availableDates.length > 1 && (
            <View style={{ marginTop: 2, marginBottom: 4 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 2, paddingVertical: 4, gap: 6 }}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setAgendaFilterDate('')}
                  style={{
                    paddingHorizontal: 11,
                    paddingVertical: 5,
                    borderRadius: 14,
                    backgroundColor: !agendaFilterDate ? '#059669' : '#F8FAFC',
                    borderWidth: 1,
                    borderColor: !agendaFilterDate ? '#047857' : '#E2E8F0',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: !agendaFilterDate ? '700' : '600',
                      color: !agendaFilterDate ? '#FFFFFF' : '#475569',
                    }}
                  >
                    Semua Tanggal
                  </Text>
                </TouchableOpacity>
                {availableDates.map((item) => {
                  const isDateActive = agendaFilterDate === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      activeOpacity={0.8}
                      onPress={() => setAgendaFilterDate(isDateActive ? '' : item.key)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 14,
                        backgroundColor: isDateActive ? '#059669' : '#F8FAFC',
                        borderWidth: 1,
                        borderColor: isDateActive ? '#047857' : '#E2E8F0',
                        gap: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: isDateActive ? '700' : '600',
                          color: isDateActive ? '#FFFFFF' : '#334155',
                        }}
                      >
                        {item.label}
                      </Text>
                      <View
                        style={{
                          backgroundColor: isDateActive ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9.5,
                            fontWeight: '800',
                            color: isDateActive ? '#FFFFFF' : '#475569',
                          }}
                        >
                          {item.count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Reset Filter Button jika sedang difilter */}
          {(agendaFilterMonth || agendaFilterDate) && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setAgendaFilterMonth('');
                setAgendaFilterDate('');
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                backgroundColor: '#F1F5F9',
                borderWidth: 1,
                borderColor: '#CBD5E1',
                paddingHorizontal: 11,
                paddingVertical: 5,
                borderRadius: 14,
                marginBottom: 8,
                marginTop: 4,
                gap: 5,
              }}
            >
              <MaterialCommunityIcons name="close-circle-outline" size={13} color="#64748B" />
              <Text style={{ fontSize: 11.5, color: '#475569', fontWeight: '600' }}>
                Reset Filter
              </Text>
            </TouchableOpacity>
          )}

          {filteredEvents.length > 0 ? (
            filteredEvents.map((evt: any, idx: number) => {
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
                        {sanitizeLocation(evt.location || evt.room || evt.venue || evt.unit || calendarData?.unit?.name || studentUnit || (isTeacherMode ? teacherUnit : 'Kampus Sekolah'))}
                      </Text>
                    </View>
                    <Text style={styles.eventDateBadge}>
                      {evt.date ? new Date(evt.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'Hari ini'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <MaterialCommunityIcons name="filter-remove-outline" size={32} color="#94A3B8" />
              <Text style={{ fontSize: 12.5, color: '#64748B', marginTop: 6, fontWeight: '600' }}>
                Tidak ada agenda pada filter ini
              </Text>
            </View>
          )}
        </View>
      )}

      {/* 6. KEGIATAN MENDATANG (VERTICAL LIST) */}
      {upcomingEvents.length > 0 && (
        <View style={styles.upcomingSection}>
          <View style={styles.upcomingHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="calendar-arrow-right" size={16} color="#059669" />
              <Text style={styles.upcomingHeaderTitle}>Kegiatan Mendatang</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setCalendarRange('semester')}
            >
              <Text style={styles.upcomingSeeAllText}>Lihat semester →</Text>
            </TouchableOpacity>
          </View>

          <View style={{ gap: 10, marginTop: 10 }}>
            {upcomingEvents.map((upEvt: any, uIdx: number) => {
              const cardBorder = upEvt.color || '#10B981';
              return (
                <TouchableOpacity
                  key={String(upEvt.id || uIdx)}
                  activeOpacity={0.85}
                  onPress={() => setSelectedEvent(upEvt)}
                  style={[styles.upcomingListRow, { borderLeftColor: cardBorder }]}
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
                      size={20}
                      color={cardBorder}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text numberOfLines={1} style={styles.upcomingCardTitle}>
                      {upEvt.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.upcomingCardSub}>
                      {sanitizeLocation(upEvt.location || upEvt.room || upEvt.venue || upEvt.unit || calendarData?.unit?.name || studentUnit || (isTeacherMode ? teacherUnit : 'Kampus Sekolah'))}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <MaterialCommunityIcons name="calendar-outline" size={12} color="#059669" />
                      <Text style={[styles.upcomingCardDate, { marginTop: 0 }]}>
                        {upEvt.date ? new Date(upEvt.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Mendatang'}
                      </Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                </TouchableOpacity>
              );
            })}
          </View>
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
                  {selectedEvent?.location || selectedEvent?.room || selectedEvent?.venue || selectedEvent?.unit || calendarData?.unit?.name || studentUnit || (isTeacherMode ? teacherUnit : 'Kampus Sekolah')}
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

            {isTeacherMode && (
              <View style={styles.detailActionBtnRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleOpenEditEvent(selectedEvent)}
                  style={styles.editAgendaBtn}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={16} color="#047857" />
                  <Text style={styles.editAgendaBtnText}>Ubah Agenda</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    const evtToDelete = selectedEvent;
                    setSelectedEvent(null);
                    setDeleteConfirmModal(evtToDelete);
                  }}
                  style={styles.deleteAgendaBtn}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color="#E11D48" />
                  <Text style={styles.deleteAgendaBtnText}>Hapus</Text>
                </TouchableOpacity>
              </View>
            )}

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
                    <Text style={styles.allAgendaItemLocation}>{evt.location || evt.room || evt.venue || evt.unit || calendarData?.unit?.name || studentUnit || (isTeacherMode ? teacherUnit : 'Kampus Sekolah')}</Text>
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
          </View>
        </Animated.ScrollView>
      </View>

      {/* ── MODAL PILIH ANANDA (BOTTOM SHEET) ── */}
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
                      setActiveChildIndex(idx);
                      useActiveChildStore.getState().setActiveChildId(cId);
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
                      <MaterialCommunityIcons name="check-circle" size={20} color="#004D32" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

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

      {/* ── FLOATING ACTION BUTTON (TAMBAH AGENDA - TATA USAHA & GURU) ── */}
      {isTeacherMode && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleOpenAddEvent}
          style={[styles.teacherFab, { bottom: Math.max(bottomInset + 76, 96) }]}
        >
          <LinearGradient
            colors={['#059669', '#047857']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.teacherFabGradient}
          >
            <MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" />
            <Text style={styles.teacherFabText}>Tambah Agenda</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* ── MODAL FORM TAMBAH / UBAH AGENDA KALENDER (CRUD) ── */}
      <Modal
        visible={eventModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!savingEvent) {
            setEventModalVisible(false);
            setEditingEvent(null);
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.crudModalBackdrop}
        >
          <View style={styles.crudModalSheet}>
            {/* Modal Header */}
            <View style={styles.crudModalHeader}>
              <View style={styles.crudModalHeaderLeft}>
                <View style={styles.crudModalHeaderIcon}>
                  <MaterialCommunityIcons
                    name={editingEvent ? 'calendar-edit' : 'calendar-plus'}
                    size={22}
                    color="#047857"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.crudModalTitle}>
                    {editingEvent ? 'Ubah Agenda Kalender' : 'Tambah Agenda Kalender'}
                  </Text>
                  <Text style={styles.crudModalSubtitle}>
                    {editingEvent ? 'Perbarui jadwal operasional & kegiatan sekolah' : 'Buat jadwal kegiatan resmi kalender akademik'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!savingEvent) {
                    setEventModalVisible(false);
                    setEditingEvent(null);
                  }
                }}
                disabled={savingEvent}
                style={styles.modalCloseIcon}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Form Body */}
            <ScrollView
              style={{ maxHeight: 420 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Judul Kegiatan */}
              <View style={styles.crudFormGroup}>
                <Text style={styles.crudFormLabel}>Judul Agenda <Text style={{ color: '#E11D48' }}>*</Text></Text>
                <TextInput
                  value={eventForm.judul_pengumuman}
                  onChangeText={(val) => setEventForm((prev) => ({ ...prev, judul_pengumuman: val }))}
                  placeholder="Contoh: Rapat Awal Semester / Ujian PTS"
                  placeholderTextColor="#94A3B8"
                  style={styles.crudTextInput}
                />
              </View>

              {/* Kategori Agenda Chips */}
              <View style={styles.crudFormGroup}>
                <Text style={styles.crudFormLabel}>Kategori Agenda</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.crudChipScroll}>
                  {CALENDAR_CATEGORIES.map((cat) => {
                    const isSelected = eventForm.kategori === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        activeOpacity={0.8}
                        onPress={() => setEventForm((prev) => ({ ...prev, kategori: cat.id, color: cat.badgeColor }))}
                        style={[
                          styles.crudCatChip,
                          isSelected && { backgroundColor: `${cat.color}20`, borderColor: cat.color },
                        ]}
                      >
                        <View style={[styles.crudCatChipDot, { backgroundColor: cat.color }]} />
                        <Text
                          style={[
                            styles.crudCatChipText,
                            isSelected && { color: cat.color, fontWeight: '800' },
                          ]}
                        >
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Rentang Tanggal (Mulai & Selesai) */}
              <View style={styles.crudRowTwoCols}>
                <View style={[styles.crudFormGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.crudFormLabel}>Tanggal Mulai</Text>
                  <TextInput
                    value={eventForm.mulai_tampil}
                    onChangeText={(val) => setEventForm((prev) => ({ ...prev, mulai_tampil: val }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    style={styles.crudTextInput}
                  />
                </View>
                <View style={[styles.crudFormGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.crudFormLabel}>Tanggal Selesai</Text>
                  <TextInput
                    value={eventForm.selesai_tampil}
                    onChangeText={(val) => setEventForm((prev) => ({ ...prev, selesai_tampil: val }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    style={styles.crudTextInput}
                  />
                </View>
              </View>

              {/* Rentang Waktu (Jam Mulai & Selesai) */}
              <View style={styles.crudRowTwoCols}>
                <View style={[styles.crudFormGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.crudFormLabel}>Jam Mulai (Opsional)</Text>
                  <TextInput
                    value={eventForm.jam_mulai}
                    onChangeText={(val) => setEventForm((prev) => ({ ...prev, jam_mulai: val }))}
                    placeholder="Contoh: 07:30"
                    placeholderTextColor="#94A3B8"
                    style={styles.crudTextInput}
                  />
                </View>
                <View style={[styles.crudFormGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.crudFormLabel}>Jam Selesai (Opsional)</Text>
                  <TextInput
                    value={eventForm.jam_selesai}
                    onChangeText={(val) => setEventForm((prev) => ({ ...prev, jam_selesai: val }))}
                    placeholder="Contoh: 12:00"
                    placeholderTextColor="#94A3B8"
                    style={styles.crudTextInput}
                  />
                </View>
              </View>

              {/* Lokasi */}
              <View style={styles.crudFormGroup}>
                <Text style={styles.crudFormLabel}>Lokasi / Ruangan</Text>
                <TextInput
                  value={eventForm.lokasi}
                  onChangeText={(val) => setEventForm((prev) => ({ ...prev, lokasi: val }))}
                  placeholder="Contoh: Aula Utama / Kampus Sekolah"
                  placeholderTextColor="#94A3B8"
                  style={styles.crudTextInput}
                />
              </View>

              {/* Tingkat Prioritas */}
              <View style={styles.crudFormGroup}>
                <Text style={styles.crudFormLabel}>Tingkat Prioritas</Text>
                <View style={styles.crudPriorityRow}>
                  {[
                    { level: 1, label: 'Standar', color: '#059669' },
                    { level: 2, label: 'Penting', color: '#D97706' },
                    { level: 3, label: 'Mendesak', color: '#E11D48' },
                  ].map((p) => {
                    const isSelected = eventForm.prioritas === p.level;
                    return (
                      <TouchableOpacity
                        key={p.level}
                        activeOpacity={0.8}
                        onPress={() => setEventForm((prev) => ({ ...prev, prioritas: p.level }))}
                        style={[
                          styles.crudPriorityChip,
                          isSelected && { backgroundColor: `${p.color}15`, borderColor: p.color },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                          size={14}
                          color={isSelected ? p.color : '#94A3B8'}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={[
                            styles.crudPriorityChipText,
                            isSelected && { color: p.color, fontWeight: '800' },
                          ]}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Keterangan / Deskripsi */}
              <View style={styles.crudFormGroup}>
                <Text style={styles.crudFormLabel}>Keterangan / Catatan Tambahan</Text>
                <TextInput
                  value={eventForm.isi_pengumuman}
                  onChangeText={(val) => setEventForm((prev) => ({ ...prev, isi_pengumuman: val }))}
                  placeholder="Tuliskan detail agenda atau instruksi tambahan kegiatan..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  style={[styles.crudTextInput, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                />
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.crudModalFooter}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (!savingEvent) {
                    setEventModalVisible(false);
                    setEditingEvent(null);
                  }
                }}
                disabled={savingEvent}
                style={styles.crudCancelBtn}
              >
                <Text style={styles.crudCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSaveEvent}
                disabled={savingEvent || !eventForm.judul_pengumuman.trim()}
                style={[
                  styles.crudSaveBtn,
                  (!eventForm.judul_pengumuman.trim() || savingEvent) && { opacity: 0.6 },
                ]}
              >
                <LinearGradient
                  colors={['#059669', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.crudSaveBtnGradient}
                >
                  {savingEvent ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
                  ) : (
                    <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.crudSaveBtnText}>
                    {savingEvent ? 'Menyimpan...' : editingEvent ? 'Simpan Perubahan' : 'Tambah Agenda'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL KONFIRMASI HAPUS AGENDA ── */}
      <Modal
        visible={Boolean(deleteConfirmModal)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingEvent) setDeleteConfirmModal(null);
        }}
      >
        <View style={styles.crudModalBackdrop}>
          <View style={styles.crudDeleteCard}>
            <View style={styles.crudDeleteIconCircle}>
              <MaterialCommunityIcons name="trash-can-outline" size={32} color="#E11D48" />
            </View>

            <Text style={styles.crudDeleteTitle}>Hapus Agenda Kalender?</Text>
            <Text style={styles.crudDeleteDescription}>
              Apakah Anda yakin ingin menghapus kegiatan{' '}
              <Text style={{ fontWeight: '800', color: '#0F172A' }}>
                "{deleteConfirmModal?.title || 'Agenda'}"
              </Text>
              ? Tindakan ini akan menghapus agenda dari kalender akademik sekolah.
            </Text>

            <View style={styles.crudDeleteFooter}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setDeleteConfirmModal(null)}
                disabled={deletingEvent}
                style={styles.crudDeleteCancelBtn}
              >
                <Text style={styles.crudDeleteCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleDeleteEvent(deleteConfirmModal?.id)}
                disabled={deletingEvent}
                style={styles.crudDeleteConfirmBtn}
              >
                {deletingEvent ? (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
                ) : (
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.crudDeleteConfirmBtnText}>
                  {deletingEvent ? 'Menghapus...' : 'Ya, Hapus'}
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
    backgroundColor: '#ECFDF5',
  },
  topFoliageWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 0,
  },
  topFoliageBgImage: {
    width: '100%',
    height: '100%',
  },
  cleanTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  cleanHeaderIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  cleanHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  cleanBellDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  cleanMainScrollContent: {
    flexGrow: 1,
    paddingTop: 8,
  },
  cleanScrollInner: {
    width: '100%',
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  studentProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  studentAvatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: '#10B981',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
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
  },
  studentProfileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: -0.3,
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  studentProfileUnitText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  studentProfileClassText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#047857',
  },
  studentActionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
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
  studentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  studentStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  calendarGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  calendarGroupHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  calendarGroupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  calendarGroupHeaderIconBoxWhite: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  calendarGroupTitleWhite: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  calendarGroupSubWhite: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 1,
  },
  calendarGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  calendarGroupBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  kpiRowModern: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  kpiCardModern: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 9,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabelModern: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  kpiValueModern: {
    fontSize: 16,
    fontWeight: '800',
    marginVertical: 1,
  },
  kpiSubModern: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '600',
  },
  kpiProgressBannerWrapper: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  kpiProgressBanner: {
    borderRadius: 12,
    padding: 10,
  },
  kpiProgressBannerEmerald: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  kpiProgressBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiProgressBannerTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#047857',
  },
  kpiProgressBannerSub: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '600',
  },
  childModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  childModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#004D32',
  },
  childModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  childModalItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#004D32',
  },
  childModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  childModalItemName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#004D32',
  },
  childModalItemSub: {
    fontSize: 11.5,
    color: '#047857',
    marginTop: 2,
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
  upcomingListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
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
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  upcomingCardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  upcomingCardDate: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
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
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: 14,
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
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: 14,
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

  // Rentang Cepat Modern Pill Bar
  quickRangeSectionNew: {
    marginBottom: 14,
  },
  quickRangeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  quickRangeTitleNew: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  quickRangeScrollRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  quickRangePillNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.2,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  quickRangePillTextNew: {
    fontSize: 12,
    fontWeight: '700',
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

  // Action Buttons inside Detail Modal (Tata Usaha & Guru)
  detailActionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    marginBottom: 6,
  },
  editAgendaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 6,
  },
  editAgendaBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },
  deleteAgendaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    gap: 6,
  },
  deleteAgendaBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E11D48',
  },

  // Floating Action Button
  teacherFab: {
    position: 'absolute',
    right: 20,
    zIndex: 99,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  teacherFabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 28,
    gap: 6,
  },
  teacherFabText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // CRUD Modal & Sheet
  crudModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    padding: 16,
  },
  crudModalSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  crudModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  crudModalHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 8,
  },
  crudModalHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  crudModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  crudModalSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },

  // CRUD Form Inputs
  crudFormGroup: {
    marginBottom: 14,
  },
  crudFormLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  crudTextInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  crudChipScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  crudCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  crudCatChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  crudCatChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  crudRowTwoCols: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crudPriorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  crudPriorityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  crudPriorityChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  // CRUD Modal Footer
  crudModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
  },
  crudCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crudCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  crudSaveBtn: {
    flex: 2,
    borderRadius: 14,
    overflow: 'hidden',
  },
  crudSaveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  crudSaveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Delete Confirmation Modal
  crudDeleteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  crudDeleteIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  crudDeleteTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  crudDeleteDescription: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  crudDeleteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  crudDeleteCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crudDeleteCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  crudDeleteConfirmBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#E11D48',
  },
  crudDeleteConfirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
