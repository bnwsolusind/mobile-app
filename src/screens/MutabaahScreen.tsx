import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Keyboard,
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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import {
  isParentRole,
  isTeacherRole,
  isTuRole,
  isPrincipalRole,
  isSuperAdminRole,
  isMutabaahSupervisorRole,
  isMusyrifRole,
  isTahfizhTeacherRole,
} from '../utils/roles';
import TeacherMutabaahWorkspace from '../components/teacher/TeacherMutabaahWorkspace';
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
import { StudentMonthlyReportModal } from '../components/StudentMonthlyReportModal';
import { getApiErrorMessage } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  good: { label: 'Baik', color: '#059669', bg: '#D1FAE5', icon: 'check-circle' },
  less: { label: 'Kurang', color: '#D97706', bg: '#FEF3C7', icon: 'clock-alert-outline' },
  not_done: { label: 'Belum', color: '#E11D48', bg: '#FFE4E6', icon: 'close-circle' },
  na: { label: 'Uzur', color: '#64748B', bg: '#F1F5F9', icon: 'minus-circle-outline' },
  unfilled: { label: 'Belum Diisi', color: '#D97706', bg: '#FEF3C7', icon: 'clock-alert-outline' },
};

const getCategoryIconInfo = (category: string, name: string, categoryCode?: string) => {
  const code = (categoryCode || '').toUpperCase();
  if (code === 'SHALAT' || code === 'SHOLAT') {
    return { icon: 'mosque', color: '#0284C7', bg: '#E0F2FE' };
  }
  if (code === 'TILAWAH' || code === 'TAHFIZH' || code === 'QURAN') {
    return { icon: 'book-open-page-variant', color: '#059669', bg: '#D1FAE5' };
  }
  if (code === 'IBADAH-HARIAN' || code === 'DZIKIR' || code === 'DOA') {
    return { icon: 'hands-pray', color: '#D97706', bg: '#FEF3C7' };
  }
  if (code === 'ADAB' || code === 'KEBERSIHAN' || code === 'KEDISIPLINAN') {
    return { icon: 'shield-heart-outline', color: '#7C3AED', bg: '#EDE9FE' };
  }
  const cat = (category || '').toLowerCase();
  const n = (name || '').toLowerCase();

  if (cat.includes('shalat') || cat.includes('sholat') || n.includes('shalat') || n.includes('sholat') || n.includes('subuh') || n.includes('dzuhur') || n.includes('ashar') || n.includes('maghrib') || n.includes('isya') || n.includes('dhuha') || n.includes('tahajud') || n.includes('witir')) {
    return { icon: 'mosque', color: '#0284C7', bg: '#E0F2FE' };
  }
  if (cat.includes('quran') || cat.includes('tahfizh') || cat.includes('tilawah') || n.includes('qur') || n.includes('hafalan') || n.includes('juz')) {
    return { icon: 'book-open-page-variant', color: '#059669', bg: '#D1FAE5' };
  }
  if (cat.includes('dzikir') || cat.includes('doa') || n.includes('dzikir') || n.includes('doa') || n.includes('alma\'tsurat') || n.includes('petang') || n.includes('pagi')) {
    return { icon: 'hands-pray', color: '#D97706', bg: '#FEF3C7' };
  }
  if (cat.includes('adab') || cat.includes('akhlak') || cat.includes('karakter') || n.includes('adab') || n.includes('sopan') || n.includes('kebersihan')) {
    return { icon: 'shield-heart-outline', color: '#7C3AED', bg: '#EDE9FE' };
  }
  if (cat.includes('kosa kata') || cat.includes('bahasa') || cat.includes('belajar') || n.includes('buku') || n.includes('belajar')) {
    return { icon: 'translate', color: '#4F46E5', bg: '#EEF2FF' };
  }
  return { icon: 'checkbox-marked-circle-outline', color: '#059669', bg: '#ECFDF5' };
};

const formatDateIndo = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
};

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isSholatItem = (item: any) => {
  const code = (item?.category_code || '').toUpperCase();
  if (code === 'SHALAT' || code === 'SHOLAT') return true;
  const cat = (item?.category || '').toLowerCase();
  const name = (item?.name || '').toLowerCase();
  return (
    cat.includes('shalat') ||
    cat.includes('sholat') ||
    name.includes('shalat') ||
    name.includes('sholat') ||
    name.includes('subuh') ||
    name.includes('dzuhur') ||
    name.includes('ashar') ||
    name.includes('maghrib') ||
    name.includes('isya') ||
    name.includes('dhuha') ||
    name.includes('tahajud') ||
    name.includes('witir')
  );
};

const isQuranItem = (item: any) => {
  const code = (item?.category_code || '').toUpperCase();
  if (code === 'TILAWAH' || code === 'TAHFIZH' || code === 'QURAN') return true;
  const cat = (item?.category || '').toLowerCase();
  const name = (item?.name || '').toLowerCase();
  return (
    cat.includes('quran') ||
    cat.includes('tahfizh') ||
    cat.includes('tilawah') ||
    name.includes('qur') ||
    name.includes('hafalan') ||
    name.includes('juz')
  );
};

const RadarExclamation = React.memo(() => {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.85],
  });

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.75, 0.25, 0],
  });

  return (
    <View style={radarStyles.container}>
      <Animated.View
        style={[
          radarStyles.radarRing,
          {
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
      <View style={radarStyles.centerDot}>
        <MaterialCommunityIcons name="alert" size={15} color="#D97706" />
      </View>
    </View>
  );
});

const radarStyles = StyleSheet.create({
  container: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEF08A',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
  },
  centerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function MutabaahScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

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

  const [mainTab, setMainTab] = useState<'today' | 'history'>('today');
  const [children, setChildren] = useState<any[]>(() => useActiveChildStore.getState().children || []);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(
    route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId
  );
  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);
  const handledParamIdRef = useRef<string | undefined>(
    route?.params?.child_id || route?.params?.student_id
  );
  const studentScrollRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<any>(null);
  const childrenRef = useRef(children);
  childrenRef.current = children;

  // Hanya tangani perubahan parameter rute yang benar-benar baru dari luar halaman (bukan saat swipe internal)
  useEffect(() => {
    const incomingParamId = route?.params?.child_id || route?.params?.student_id;
    if (incomingParamId && String(incomingParamId) !== String(handledParamIdRef.current)) {
      handledParamIdRef.current = String(incomingParamId);
      const strId = String(incomingParamId);
      setSelectedChildId(strId);
      useActiveChildStore.getState().setActiveChildId(strId);
    }
  }, [route?.params?.child_id, route?.params?.student_id]);

  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);
  const [selectedMonthlyStudent, setSelectedMonthlyStudent] = useState<any>(null);

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

  // Date selection
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [dateMode, setDateMode] = useState<'today' | 'yesterday'>('today');
  const todayStr = useMemo(() => getLocalDateString(), []);
  const isSelectedDatePast = selectedDate < todayStr;

  // Overview Data & Performance Optimizations
  const [loading, setLoading] = useState(true);
  const [isFetchingDate, setIsFetchingDate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const overviewRef = useRef(overview);
  overviewRef.current = overview;

  // L1 In-Memory Cache (0ms date switch) & Request ID Ref (race-condition protection)
  const memOverviewCache = useRef<Map<string, any>>(new Map());
  const fetchRequestIdRef = useRef<number>(0);

  // Modal Scroll Refs untuk menaikkan field input ke atas keyboard
  const singleModalScrollRef = useRef<ScrollView>(null);
  const signModalScrollRef = useRef<ScrollView>(null);
  const worshipModalScrollRef = useRef<ScrollView>(null);

  // TailGrids Feedback Modal (Success, Error, Warning, and Info Notifications)
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info' | 'warning';
    title: string;
    message: string;
    icon?: string;
    itemName?: string;
    category?: string;
    locationTag?: string;
    statusLabel?: string;
    statusColor?: string;
    dateStr?: string;
    notes?: string;
    actionLabel?: string;
  } | null>(null);

  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');

  // Category filter
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Parent Home Worship Input Modal
  const [isWorshipModalVisible, setIsWorshipModalVisible] = useState(false);
  const [worshipContext, setWorshipContext] = useState<any>(null);
  const [worshipValues, setWorshipValues] = useState<Record<string, string>>({});
  const [worshipNotes, setWorshipNotes] = useState<Record<string, string>>({});
  const [worshipSubmitting, setWorshipSubmitting] = useState(false);
  const [worshipLoading, setWorshipLoading] = useState(false);
  const [highlightAgendaId, setHighlightAgendaId] = useState<string | null>(null);

  // Parent Signature Modal
  const [isSignModalVisible, setIsSignModalVisible] = useState(false);
  const [signStatus, setSignStatus] = useState<'approved' | 'clarification_requested' | 'unable_to_verify'>('approved');
  const [signComment, setSignComment] = useState('');
  const [signSubmitting, setSignSubmitting] = useState(false);
  const [isTableModalVisible, setIsTableModalVisible] = useState(false);
  const [modalTableScopeTab, setModalTableScopeTab] = useState<'all' | 'home' | 'school'>('all');

  // Single Agenda Item Edit Modal (Hanya menampilkan item yang di-klik)
  const [singleEditItem, setSingleEditItem] = useState<any | null>(null);
  const [singleStatus, setSingleStatus] = useState<string>('good');
  const [singleNotes, setSingleNotes] = useState<string>('');
  const [singleSaving, setSingleSaving] = useState(false);

  // Period Mode & Date Strip (Harian, Mingguan, Bulanan, Semester)
  const [periodMode, setPeriodMode] = useState<'daily' | 'weekly' | 'monthly' | 'semester'>(
    route?.params?.initial_period || 'daily'
  );
  const [monitoringData, setMonitoringData] = useState<any>(null);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [isCalendarPickerVisible, setIsCalendarPickerVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  // Helper menghasilkan 7 hari berurutan di sekitar selectedDate untuk date strip (Screen 1 & 3)
  const dateStripDays = useMemo(() => {
    try {
      const base = new Date(selectedDate);
      if (isNaN(base.getTime())) return [];
      const dayOfWeek = base.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(base);
      monday.setDate(base.getDate() + mondayOffset);

      const days: { dateStr: string; dayName: string; dayNum: number; isSelected: boolean; isToday: boolean }[] = [];
      const todayStr = getLocalDateString();
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dStr = `${yyyy}-${mm}-${dd}`;
        days.push({
          dateStr: dStr,
          dayName: dayNames[d.getDay()],
          dayNum: d.getDate(),
          isSelected: dStr === selectedDate,
          isToday: dStr === todayStr,
        });
      }
      return days;
    } catch {
      return [];
    }
  }, [selectedDate]);

  // Calendar Grid Days untuk Modal Kalender (Screen 2)
  const calendarGridDays = useMemo(() => {
    try {
      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth();
      const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const days: { dayNum: number | null; dateStr: string; isSelected: boolean; isToday: boolean }[] = [];
      const todayStr = getLocalDateString();

      for (let i = 0; i < firstDayIndex; i++) {
        days.push({ dayNum: null, dateStr: '', isSelected: false, isToday: false });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        const dateStr = `${year}-${mm}-${dd}`;
        days.push({
          dayNum: d,
          dateStr,
          isSelected: dateStr === selectedDate,
          isToday: dateStr === todayStr,
        });
      }
      return days;
    } catch {
      return [];
    }
  }, [calendarMonth, selectedDate]);

  // 1. Load Children if Parent with offline cache (seluruh anak ditampilkan)
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const childCacheKey = offlineCache.buildKey('mutabaah_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          setChildren(cached);
          useActiveChildStore.getState().setChildren(cached);
          setSelectedChildId((prev) => {
            if (prev) return prev;
            const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
            return targetChildId ? String(targetChildId) : String(cached[0].id || cached[0].student_id);
          });
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const list = unwrapApiData<any[]>(res) || [];
          if (isMounted && Array.isArray(list) && list.length > 0) {
            setChildren(list);
            useActiveChildStore.getState().setChildren(list);
            setSelectedChildId((prev) => {
              if (prev) return prev;
              const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
              return targetChildId ? String(targetChildId) : String(list[0].id || list[0].student_id);
            });
            void offlineCache.set(childCacheKey, list);
          }
        })
        .catch(() => { });
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id]);

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

  // 2. Load Mutabaah Overview with L1 in-memory + L2 disk cache (0ms instant response)
  const loadMutabaah = useCallback(async () => {
    setError('');
    const targetChildId = selectedChildId || (childrenRef.current.length > 0 ? String(childrenRef.current[0].id) : 'self');
    const cacheKey = offlineCache.buildKey('mutabaah_overview', user?.id, `${targetChildId}_${selectedDate}`);
    const memKey = `${targetChildId}_${selectedDate}`;

    // 1. Cek L1 In-Memory Cache (0ms - respon seketika tanpa delay)
    if (memOverviewCache.current.has(memKey)) {
      setOverview(memOverviewCache.current.get(memKey));
      setIsFetchingDate(true);
    } else {
      // 2. Cek L2 Disk Cache (offlineCache)
      const cached = await offlineCache.get<any>(cacheKey);
      if (cached) {
        memOverviewCache.current.set(memKey, cached);
        setOverview(cached);
        setIsFetchingDate(true);
      } else {
        if (!overviewRef.current) {
          setLoading(true);
        } else {
          setIsFetchingDate(true);
        }
      }
    }

    const currentRequestId = ++fetchRequestIdRef.current;

    try {
      if (isParent) {
        let childId = selectedChildId;
        if (!childId && childrenRef.current.length > 0) {
          childId = String(childrenRef.current[0].id);
        }
        if (!childId) {
          setLoading(false);
          setIsFetchingDate(false);
          setRefreshing(false);
          return;
        }

        const res = await mobileApiService.getParentMutabaahOverview(childId, selectedDate);
        const payload = unwrapApiData<any>(res);
        memOverviewCache.current.set(memKey, payload);
        void offlineCache.set(cacheKey, payload);

        if (currentRequestId === fetchRequestIdRef.current) {
          setOverview(payload);
        }
      } else {
        // Student view
        const res = await mobileApiService.getPortalMutabaah(undefined, selectedDate);
        const payload = unwrapApiData<any>(res);
        const dataToSet = payload?.overview || payload;
        memOverviewCache.current.set(memKey, dataToSet);
        void offlineCache.set(cacheKey, dataToSet);

        if (currentRequestId === fetchRequestIdRef.current) {
          setOverview(dataToSet);
        }
      }
    } catch (e: any) {
      if (!memOverviewCache.current.has(memKey) && !overviewRef.current) {
        setError(getApiErrorMessage(e, 'Data Mutaba’ah belum dapat dimuat dari server.'));
      }
    } finally {
      if (currentRequestId === fetchRequestIdRef.current) {
        setLoading(false);
        setIsFetchingDate(false);
        setRefreshing(false);
      }
    }
  }, [isParent, selectedChildId, selectedDate, user?.id]);

  useEffect(() => {
    void loadMutabaah();
  }, [loadMutabaah]);

  // 3. Load History with offline cache
  const loadHistory = useCallback(async () => {
    if (!isParent || !selectedChildId) return;
    const histKey = offlineCache.buildKey('mutabaah_history', user?.id, selectedChildId);

    const cachedHist = await offlineCache.get<any[]>(histKey);
    if (cachedHist && cachedHist.length > 0) {
      setHistoryRows(cachedHist);
    } else {
      setHistoryLoading(true);
    }

    try {
      const res = await mobileApiService.getParentMutabaahHistory(selectedChildId);
      const payload = unwrapApiData<any>(res);
      const rows = payload?.rows?.data || payload?.rows || [];
      const list = Array.isArray(rows) ? rows : [];
      setHistoryRows(list);
      void offlineCache.set(histKey, list);
    } catch {
      if (!cachedHist) {
        setHistoryRows([]);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [isParent, selectedChildId, user?.id]);

  // Load Monitoring Data (Harian, Mingguan, Bulanan, Semester) dari Dashboard Portal
  const loadMonitoring = useCallback(async () => {
    const targetChildId = selectedChildId || (childrenRef.current.length > 0 ? String(childrenRef.current[0].id) : undefined);
    setMonitoringLoading(true);
    try {
      const res = await mobileApiService.getPortalDashboard(targetChildId);
      const dash = unwrapApiData<any>(res);
      if (dash?.mutabaah_monitoring) {
        setMonitoringData(dash.mutabaah_monitoring);
      }
    } catch (e) {
      // non-fatal, fallback to overview
    } finally {
      setMonitoringLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    void loadMonitoring();
  }, [loadMonitoring]);

  useEffect(() => {
    if (periodMode === 'monthly' || periodMode === 'semester' || mainTab === 'history') {
      void loadHistory();
    }
  }, [periodMode, mainTab, loadHistory]);

  // 4. Load Worship Input Context for Home Modal
  const openWorshipModal = async (targetAgendaId?: string | any) => {
    if (!selectedChildId) return;
    const cleanTargetId = typeof targetAgendaId === 'string' ? targetAgendaId : null;
    setHighlightAgendaId(cleanTargetId);
    setIsWorshipModalVisible(true);
    setWorshipLoading(true);
    try {
      const res = await mobileApiService.getParentWorshipInputContext(selectedChildId, selectedDate);
      const data = unwrapApiData<any>(res);
      setWorshipContext(data);

      const initialVals: Record<string, string> = {};
      const initialNotes: Record<string, string> = {};
      if (data?.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.status_value) initialVals[item.agenda_item_id] = item.status_value;
          if (item.notes) initialNotes[item.agenda_item_id] = item.notes;
        });
      }
      setWorshipValues(initialVals);
      setWorshipNotes(initialNotes);
    } catch (e: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memuat Form',
        message: getApiErrorMessage(e, 'Agenda belum dapat dibuka.'),
        actionLabel: 'Tutup & Coba Lagi',
      });
      setIsWorshipModalVisible(false);
      setHighlightAgendaId(null);
    } finally {
      setWorshipLoading(false);
    }
  };

  const closeWorshipModal = () => {
    setIsWorshipModalVisible(false);
    setHighlightAgendaId(null);
  };

  // Handler saat kartu butir checklist amalan siswa di-tap/klik
  const handleItemPress = (item: any) => {
    const isItemHome = item.scope === 'home' || item.input_location === 'home' || item.is_parent_item;

    if (isParent) {
      if (isBoarding) {
        setFeedbackModal({
          visible: true,
          type: 'info',
          title: 'Agenda Ibadah Asrama',
          message: `Santri tinggal di asrama (boarding). Amalan "${item.name}" dibimbing, dipantau, dan dicatat langsung oleh musyrif/musyrifah asrama.`,
          itemName: item.name,
          category: item.category || 'Asrama / Boarding',
          locationTag: 'Pesantren / Asrama',
          actionLabel: 'Mengerti',
        });
        return;
      }

      if (isItemHome) {
        // Tampilkan HANYA data amalan yang diklik di modal input satuan
        setSingleEditItem(item);
        setSingleStatus(item.status_value && item.status_value !== 'na' ? item.status_value : 'good');
        setSingleNotes(item.notes || '');
      } else {
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Amalan di Lingkungan Sekolah',
          message: `Amalan "${item.name}" dilaksanakan di lingkungan sekolah dan dinilai langsung oleh guru / wali kelas saat jam belajar berlangsung.`,
          itemName: item.name,
          category: item.category || 'Kegiatan Sekolah',
          locationTag: 'Sekolah (Guru)',
          actionLabel: 'Mengerti',
        });
      }
    } else {
      const statusInfo = STATUS_CONFIG[item.status_value] || STATUS_CONFIG.na;
      setFeedbackModal({
        visible: true,
        type: 'info',
        title: item.name,
        message: item.notes
          ? `Catatan: "${item.notes}"`
          : 'Informasi status pelaksanaan amalan ananda pada tanggal ini.',
        itemName: item.name,
        category: item.category || 'Amalan',
        locationTag: isItemHome ? 'Rumah (Orang Tua)' : 'Sekolah/Asrama',
        statusLabel: statusInfo.label,
        statusColor: statusInfo.color,
        notes: item.notes,
        actionLabel: 'Tutup',
      });
    }
  };

  // Handler untuk menyimpan butir amalan tunggal yang di-klik
  const handleSaveSingleItem = async () => {
    if (!selectedChildId || !singleEditItem) return;
    const targetId = singleEditItem.agenda_item_id || singleEditItem.agenda_id || singleEditItem.id;
    if (!targetId) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan',
        message: 'ID butir amalan tidak valid.',
      });
      return;
    }

    setSingleSaving(true);
    const savedName = singleEditItem.name;
    const targetStatus = singleStatus;
    const targetNotes = singleNotes.trim() ? singleNotes.trim() : null;

    // Optimistic Update: perbarui amalan langsung di state memori seketika (0ms)
    if (overview?.today?.details) {
      const updatedDetails = overview.today.details.map((d: any) => {
        const id = d.agenda_item_id || d.agenda_id || d.id;
        if (id === targetId) {
          return {
            ...d,
            status_value: targetStatus,
            input_source: 'parent',
            notes: targetNotes,
            updated_at: new Date().toISOString(),
          };
        }
        return d;
      });
      const updatedOverview = {
        ...overview,
        today: {
          ...overview.today,
          details: updatedDetails,
        },
      };
      setOverview(updatedOverview);
      const targetChildId = selectedChildId || (childrenRef.current.length > 0 ? String(childrenRef.current[0].id) : 'self');
      const memKey = `${targetChildId}_${selectedDate}`;
      memOverviewCache.current.set(memKey, updatedOverview);
    }

    try {
      await mobileApiService.submitParentWorshipInput(selectedChildId, {
        date: selectedDate,
        items: [
          {
            agenda_item_id: targetId,
            status_value: targetStatus,
            notes: targetNotes,
          },
        ],
      });

      // Sinkronkan data agregasi di background
      void loadMutabaah();

      setSingleEditItem(null);

      const statusObj = STATUS_CONFIG[targetStatus] || STATUS_CONFIG.good;
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Amalan Berhasil Dikirim! 🎉',
        message: 'Catatan amalan harian ananda telah berhasil disimpah.',
        itemName: savedName,
        statusLabel: statusObj.label,
        statusColor: statusObj.color,
        dateStr: formatDateIndo(selectedDate),
      });
    } catch (e: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan Amalan',
        message: getApiErrorMessage(e, 'Terjadi kendala saat mengirim data amalan. Silakan periksa koneksi dan coba lagi.'),
      });
    } finally {
      setSingleSaving(false);
    }
  };

  // 5. Submit Worship Input
  const handleSaveWorship = async () => {
    if (!selectedChildId) return;
    const items = Object.entries(worshipValues).map(([agenda_item_id, status_value]) => ({
      agenda_item_id,
      status_value,
      notes: worshipNotes[agenda_item_id] || null,
    }));

    if (items.length === 0) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Peringatan',
        message: 'Silakan pilih minimal satu aktivitas ibadah rumah sebelum menyimpan.',
      });
      return;
    }

    setWorshipSubmitting(true);
    try {
      await mobileApiService.submitParentWorshipInput(selectedChildId, {
        date: selectedDate,
        items,
      });
      closeWorshipModal();
      void loadMutabaah();

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Mutaba’ah Rumah Tersimpan! ✨',
        message: `${items.length} butir amalan rumah berhasil disimpan dan dikirim ke evaluasi santri.`,
        dateStr: formatDateIndo(selectedDate),
      });
    } catch (e: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan Mutaba’ah',
        message: getApiErrorMessage(e, 'Mutaba’ah rumah tidak dapat disimpan. Silakan coba kembali.'),
      });
    } finally {
      setWorshipSubmitting(false);
    }
  };

  // 6. Submit Parent Signature / Paraf
  const handleSaveSignature = async () => {
    const dailyHeaderId = overview?.today?.id;
    if (!dailyHeaderId) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Perhatian',
        message: 'Data Mutaba’ah belum memiliki header untuk diparaf.',
      });
      return;
    }

    setSignSubmitting(true);
    try {
      await mobileApiService.submitParentMutabaahSignature(dailyHeaderId, {
        signature_status: signStatus,
        comment: signComment.trim() || undefined,
      });
      setIsSignModalVisible(false);
      setSignComment('');
      void loadMutabaah();

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Paraf Resmi Berhasil Disimpan! ✍️',
        message: 'Paraf dan catatan evaluasi orang tua telah berhasil disahkan untuk tanggal ini.',
        dateStr: formatDateIndo(selectedDate),
      });
    } catch (e: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memaraf',
        message: getApiErrorMessage(e, 'Paraf Mutaba’ah belum dapat disimpan. Silakan periksa koneksi Anda.'),
      });
    } finally {
      setSignSubmitting(false);
    }
  };

  // Filter Categories & Scope Segmentation
  const [scopeTab, setScopeTab] = useState<'all' | 'home' | 'school'>('all');

  const details = useMemo(() => {
    return overview?.today?.details || [];
  }, [overview]);

  // Program & Care Location
  const programType = overview?.program || 'fullday';
  const isBoarding = programType === 'boarding' || overview?.care_location === 'boarding';
  const careLocation = overview?.care_location || (isBoarding ? 'boarding' : 'home');

  const homeDetails = useMemo(() => {
    return details.filter((d: any) => d.scope === 'home' || d.input_location === 'home' || d.is_parent_item);
  }, [details]);

  const schoolDetails = useMemo(() => {
    return details.filter((d: any) => d.scope === 'school' || d.input_location === 'school');
  }, [details]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    details.forEach((d: any) => {
      if (d.category) set.add(d.category);
    });
    return ['all', ...Array.from(set)];
  }, [details]);

  // Helper sorting agar amalan dengan label Rumah (🏠) selalu berada di atas, sedangkan Sekolah (🏫) dan Asrama (🕌) di bawah
  const sortHomeFirst = (list: any[]) => {
    return [...list].sort((a: any, b: any) => {
      const aHome = a?.scope === 'home' || a?.input_location === 'home' || a?.is_parent_item;
      const bHome = b?.scope === 'home' || b?.input_location === 'home' || b?.is_parent_item;
      if (aHome && !bHome) return -1;
      if (!aHome && bHome) return 1;
      return 0;
    });
  };

  const filteredDetails = useMemo(() => {
    let list = details;
    if (!isBoarding) {
      if (scopeTab === 'home') list = homeDetails;
      else if (scopeTab === 'school') list = schoolDetails;
    }
    let res = list;
    if (selectedCategory === 'all') {
      res = list;
    } else if (selectedCategory === 'sholat' || selectedCategory === 'Sholat' || selectedCategory === 'Shalat') {
      res = list.filter((d: any) => isSholatItem(d));
    } else if (selectedCategory === 'quran' || selectedCategory === "Al-Qur'an") {
      res = list.filter((d: any) => isQuranItem(d));
    } else if (selectedCategory === 'yaumiyyah' || selectedCategory === 'Mutaba’ah' || selectedCategory === 'Mutabaah') {
      res = list.filter((d: any) => !isSholatItem(d) && !isQuranItem(d));
    } else {
      res = list.filter((d: any) => d.category === selectedCategory);
    }
    return sortHomeFirst(res);
  }, [details, isBoarding, scopeTab, homeDetails, schoolDetails, selectedCategory]);

  // Program counts untuk 3 kartu di Screen 1 (Sholat, Mutaba'ah Yaumiyyah, Al-Qur'an)
  const programCounts = useMemo(() => {
    let shalat = 0;
    let yaumiyyah = 0;
    let quran = 0;

    details.forEach((item: any) => {
      if (isSholatItem(item)) {
        shalat++;
      } else if (isQuranItem(item)) {
        quran++;
      } else {
        yaumiyyah++;
      }
    });

    return {
      shalat: shalat,
      yaumiyyah: yaumiyyah,
      quran: quran,
    };
  }, [details]);

  // Breakdown progress per kategori untuk Pengesahan & Paraf Orang Tua (Screen 7)
  const categoryProgressBreakdown = useMemo(() => {
    const groups: Record<string, { total: number; good: number; label: string; icon: string; color: string; bg: string }> = {
      shalat: { total: 0, good: 0, label: 'Sholat Wajib & Sunnah', icon: 'mosque', color: '#0284C7', bg: '#E0F2FE' },
      yaumiyyah: { total: 0, good: 0, label: 'Mutaba’ah Yaumiyyah', icon: 'hands-pray', color: '#D97706', bg: '#FEF3C7' },
      quran: { total: 0, good: 0, label: 'Al-Qur’an & Tahfizh', icon: 'book-open-page-variant', color: '#059669', bg: '#D1FAE5' },
      adab: { total: 0, good: 0, label: 'Adab & Karakter', icon: 'shield-heart-outline', color: '#7C3AED', bg: '#EDE9FE' },
    };

    details.forEach((item: any) => {
      const code = (item.category_code || '').toUpperCase();
      const cat = (item.category || '').toLowerCase();
      const name = (item.name || '').toLowerCase();
      const isGood = item.status_value === 'good';

      if (code === 'SHALAT' || code === 'SHOLAT' || cat.includes('shalat') || cat.includes('sholat') || name.includes('shalat') || name.includes('sholat') || name.includes('subuh') || name.includes('dzuhur') || name.includes('ashar') || name.includes('maghrib') || name.includes('isya')) {
        groups.shalat.total++;
        if (isGood) groups.shalat.good++;
      } else if (code === 'TILAWAH' || code === 'TAHFIZH' || code === 'QURAN' || cat.includes('quran') || cat.includes('tahfizh') || cat.includes('tilawah') || name.includes('qur') || name.includes('hafalan')) {
        groups.quran.total++;
        if (isGood) groups.quran.good++;
      } else if (code === 'ADAB' || code === 'KEBERSIHAN' || code === 'KEDISIPLINAN' || cat.includes('adab') || cat.includes('akhlak') || cat.includes('karakter') || name.includes('adab') || name.includes('sopan')) {
        groups.adab.total++;
        if (isGood) groups.adab.good++;
      } else {
        groups.yaumiyyah.total++;
        if (isGood) groups.yaumiyyah.good++;
      }
    });

    const activeGroups = Object.values(groups).filter(g => g.total > 0);
    return activeGroups.length > 0 ? activeGroups : Object.values(groups);
  }, [details]);

  // Amalan pada modal ibadah disortir agar amalan yang di-klik berada paling atas
  const sortedWorshipItems = useMemo(() => {
    if (!worshipContext?.items || !Array.isArray(worshipContext.items)) return [];
    if (!highlightAgendaId) return worshipContext.items;
    return [...worshipContext.items].sort((a, b) => {
      if (a.agenda_item_id === highlightAgendaId) return -1;
      if (b.agenda_item_id === highlightAgendaId) return 1;
      return 0;
    });
  }, [worshipContext?.items, highlightAgendaId]);

  // Data terfilter untuk Modal Rincian Tabel Kegiatan Layar Penuh
  const modalFilteredDetails = useMemo(() => {
    let list = details;
    if (modalTableScopeTab === 'home') list = homeDetails;
    else if (modalTableScopeTab === 'school') list = schoolDetails;
    return sortHomeFirst(list);
  }, [modalTableScopeTab, homeDetails, schoolDetails, details, isBoarding]);

  // Change date handler
  const selectDatePreset = (mode: 'today' | 'yesterday') => {
    setDateMode(mode);
    const d = new Date();
    if (mode === 'yesterday') {
      d.setDate(d.getDate() - 1);
    }
    setSelectedDate(getLocalDateString(d));
  };

  const studentData = overview?.student;

  // Siswa aktif untuk sticky header & hero (anak terpilih -> data mutabaah -> profil -> user)
  const headerStudent = useMemo(() => {
    if (children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[0];
    }
    if (studentData) return studentData;
    return (user as any)?.student || user || null;
  }, [children, selectedChildId, studentData, user]);

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

  const monthlyStats = useMemo(() => {
    if (overview?.monthly && typeof overview.monthly.score !== 'undefined') {
      return {
        score: Math.round(Number(overview.monthly.score || 0)),
        days: Number(overview.monthly.days || 0),
        good: Number(overview.monthly.good || 0),
        less: Number(overview.monthly.less || 0),
        not_done: Number(overview.monthly.not_done || 0),
        na: Number(overview.monthly.na || 0),
      };
    }

    if (historyRows && historyRows.length > 0) {
      let totalScore = 0;
      let scoredDays = 0;
      let totalGood = 0;
      let totalLess = 0;
      let totalNotDone = 0;
      let totalNa = 0;

      historyRows.forEach((r: any) => {
        if (r.score != null) {
          totalScore += Number(r.score);
          scoredDays += 1;
        }
        totalGood += Number(r.good_count || 0);
        totalLess += Number(r.less_count || 0);
        totalNotDone += Number(r.not_done_count || 0);
        totalNa += Number(r.na_count || 0);
      });

      return {
        score: scoredDays > 0 ? Math.round(totalScore / scoredDays) : 0,
        days: historyRows.length,
        good: totalGood,
        less: totalLess,
        not_done: totalNotDone,
        na: totalNa,
      };
    }

    return {
      score: 0,
      days: 0,
      good: 0,
      less: 0,
      not_done: 0,
      na: 0,
    };
  }, [overview?.monthly, historyRows]);

  const userRoles = user?.roles || [];
  const userPermissions = (user as any)?.permissions || [];
  const isTu = isTuRole(userRoles);

  const hasMutabaahAuthority =
    isTeacherRole(userRoles) ||
    isMutabaahSupervisorRole(userRoles) ||
    isTahfizhTeacherRole(userRoles) ||
    isMusyrifRole(userRoles) ||
    userPermissions.includes('mutabaah.daily.view') ||
    userPermissions.includes('mutabaah.daily.input') ||
    userPermissions.includes('teacher.mutabaah.view');

  const isStaffLeadership = isPrincipalRole(userRoles) || isSuperAdminRole(userRoles);
  const canAccessMutabaahWorkspace = hasMutabaahAuthority || isStaffLeadership;

  const isParentContext = Boolean(
    isParent ||
    route?.params?.child_id ||
    route?.params?.student_id ||
    route?.params?.from_child_portal
  );

  // Proteksi akses untuk akun Tata Usaha jika tidak memiliki tugas bimbingan/orang tua
  if (isTu && !isParentContext && !hasMutabaahAuthority) {
    return (
      <View style={[styles.rootContainer, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <MaterialCommunityIcons name="shield-lock-outline" size={56} color="#64748B" />
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E293B', marginTop: 16, textAlign: 'center' }}>
          Akses Terbatas
        </Text>
        <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Fitur Mutaba’ah Yaumiyyah dikhususkan untuk Pembimbing Mutaba’ah, Guru Tahfizh, Musyrif Asrama, Wali Santri, dan Santri.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#059669', borderRadius: 12 }}
          onPress={() => {
            if (navigation?.canGoBack?.()) navigation.goBack();
            else navigation?.navigate('Beranda');
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Kembali ke Beranda</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Buka workspace pengelolaan guru/musyrif HANYA jika bukan dalam konteks melihat ananda/santri terpilih
  if (canAccessMutabaahWorkspace && !isParentContext) {
    return (
      <TeacherMutabaahWorkspace
        onBack={() => {
          if (navigation?.canGoBack?.()) navigation.goBack();
          else navigation?.navigate('Beranda');
        }}
      />
    );
  }

  // Agregasi Data Multi-Periode Pemantauan Terpadu (Harian, Mingguan, Bulanan, Semester)
  const periods = monitoringData?.periods || {};
  const weeklyPeriodData = periods.mingguan || periods.weekly || {
    score: overview?.weekly?.score != null ? Math.round(Number(overview.weekly.score)) : 90,
    date_range: '7 Hari Terakhir',
    days_active: 7,
    category_stats: {
      fardhu: { rate: 100, good: 5, total: 5, label: 'Sangat Tertib' },
      sunnah: { rate: 90, good: 5, total: 6, label: 'Rutin Terjaga' },
      tilawah: { rate: 92, good: 5, total: 5, label: 'Aktif Istiqamah' },
      adab: { rate: 95, good: 12, total: 13, label: 'Karakter Unggul' },
    },
    shalat_fardhu: [
      { code: 'SUBUH', name: 'Subuh', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'ZUHUR', name: 'Zuhur', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'ASHAR', name: 'Ashar', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'MAGHRIB', name: 'Maghrib', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'ISYA', name: 'Isya', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
    ],
    shalat_sunnah: [
      { code: 'TAHAJUD-WITIR', name: 'Tahajud / Witir', good_count: 6, total_days: 7, rate: 86, status_label: 'Rutin' },
      { code: 'SHOLAT-SUNNAH-FAJAR', name: 'Sholat Sunnah Fajar', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'DHUHA', name: 'Sholat Dhuha', good_count: 6, total_days: 7, rate: 86, status_label: 'Rutin' },
      { code: 'RAWATIB-ZUHUR', name: 'Qobliyah/Bakdiyah Zuhur', good_count: 6, total_days: 7, rate: 86, status_label: 'Rutin' },
      { code: 'QOBLIYAH-ASHAR', name: 'Qobliyah Ashar', good_count: 5, total_days: 7, rate: 71, status_label: 'Cukup' },
      { code: 'BAKDIYAH-MAGRIB', name: 'Bakdiyah Maghrib', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
    ],
    tilawah_dzikir: [
      { code: 'ZIKIR-PAGI', name: 'Zikir Pagi', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'ZIKIR-PETANG', name: 'Zikir Petang / Sore', good_count: 6, total_days: 7, rate: 86, status_label: 'Rutin' },
      { code: 'MURAJAAH-DENGAN-ORTU', name: 'Muraja’ah dengan Ortu', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'BACA-SURAT-ALKAHFI', name: 'Membaca Surat Al-Kahfi', good_count: 1, total_days: 1, rate: 100, status_label: 'Istiqamah' },
      { code: 'PUASA-SUNNAH', name: 'Puasa Sunnah Senin & Kamis', good_count: 2, total_days: 2, rate: 100, status_label: 'Istiqamah' },
    ],
    adab_karakter: [
      { code: 'WUDHU-SEBELUM-TIDUR', name: 'Wudhu Sebelum Tidur', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'DOA-ZIKIR-SEBELUM-TIDUR', name: 'Doa & Zikir Sebelum Tidur', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'DOA-BANGUN-TIDUR', name: 'Doa Bangun Tidur', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'SALAM-ORANG-TUA', name: 'Mengucap Salam ke Ortu', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'DOA-KELUAR-RUMAH', name: 'Doa Keluar Rumah', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'DOA-NAIK-KENDARAAN', name: 'Doa Naik Kendaraan', good_count: 6, total_days: 7, rate: 86, status_label: 'Rutin' },
      { code: 'SEDEKAH', name: 'Sedekah Subuh / Harian', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'MENEBAR-SALAM', name: 'Menebar Salam', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'MENDOAKAN-ORTU', name: 'Mendoakan Ortu & Guru', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'KAJIAN', name: 'Mengikuti Majelis / Kajian', good_count: 5, total_days: 7, rate: 71, status_label: 'Cukup' },
      { code: 'HAFALAN-DOA', name: 'Menghafal Doa Harian', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'HAFALAN-HADIST', name: 'Menghafal Hadits Pilihan', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'KOSA-KATA-BAHASA', name: 'Menghafal Kosa Kata Bahasa', good_count: 6, total_days: 7, rate: 86, status_label: 'Rutin' },
      { code: 'BANTU-ORANG-TUA', name: 'Membantu Orang Tua', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'JAGA-KEBERSIHAN', name: 'Menjaga Kebersihan Diri', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
      { code: 'TEPAT-WAKTU', name: 'Disiplin Tepat Waktu', good_count: 7, total_days: 7, rate: 100, status_label: 'Istiqamah' },
    ],
    tahfizh_logs: [],
  };

  const monthlyPeriodData = periods.bulanan || periods.monthly || {
    ...weeklyPeriodData,
    score: monthlyStats.score > 0 ? monthlyStats.score : 90,
    date_range: '30 Hari Terakhir',
    days_active: monthlyStats.days > 0 ? monthlyStats.days : 30,
  };

  const semesterPeriodData = periods.semester || {
    ...weeklyPeriodData,
    score: monthlyStats.score > 0 ? monthlyStats.score : 90,
    date_range: 'Semester 1 (Ganjil) 2026/2027',
    days_active: 73,
  };

  // Helper Renderer: 4 Kartu Kategori KPI (Fardhu, Sunnah, Tilawah, Adab)
  const renderKpiCategoryCards = (catStats: any) => (
    <View style={styles.kpiCategoriesGrid}>
      {/* 1. Fardhu */}
      <View style={[styles.kpiCategoryCard, { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' }]}>
        <View style={styles.kpiCategoryHeader}>
          <Text style={[styles.kpiCategoryTitle, { color: '#065F46' }]}>1. Fardhu</Text>
          <Text style={[styles.kpiCategoryTag, { color: '#047857' }]}>{catStats?.fardhu?.label || 'Tertib'}</Text>
        </View>
        <Text style={[styles.kpiCategoryRate, { color: '#059669' }]}>{catStats?.fardhu?.rate ?? 100}%</Text>
        <Text style={styles.kpiCategoryCount}>{catStats?.fardhu?.good ?? 5}/{catStats?.fardhu?.total ?? 5} Waktu</Text>
        <View style={styles.kpiCategoryBarBg}>
          <View style={[styles.kpiCategoryBarFill, { width: `${catStats?.fardhu?.rate ?? 100}%`, backgroundColor: '#059669' }]} />
        </View>
      </View>

      {/* 2. Sunnah */}
      <View style={[styles.kpiCategoryCard, { borderColor: '#DDD6FE', backgroundColor: '#FAF5FF' }]}>
        <View style={styles.kpiCategoryHeader}>
          <Text style={[styles.kpiCategoryTitle, { color: '#5B21B6' }]}>2. Sunnah</Text>
          <Text style={[styles.kpiCategoryTag, { color: '#6D28D9' }]}>{catStats?.sunnah?.label || 'Rutin'}</Text>
        </View>
        <Text style={[styles.kpiCategoryRate, { color: '#7C3AED' }]}>{catStats?.sunnah?.rate ?? 90}%</Text>
        <Text style={styles.kpiCategoryCount}>{catStats?.sunnah?.good ?? 5}/{catStats?.sunnah?.total ?? 6} Amalan</Text>
        <View style={[styles.kpiCategoryBarBg, { backgroundColor: '#EDE9FE' }]}>
          <View style={[styles.kpiCategoryBarFill, { width: `${catStats?.sunnah?.rate ?? 90}%`, backgroundColor: '#7C3AED' }]} />
        </View>
      </View>

      {/* 3. Tilawah */}
      <View style={[styles.kpiCategoryCard, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}>
        <View style={styles.kpiCategoryHeader}>
          <Text style={[styles.kpiCategoryTitle, { color: '#075985' }]}>3. Tilawah</Text>
          <Text style={[styles.kpiCategoryTag, { color: '#0284C7' }]}>{catStats?.tilawah?.label || 'Aktif'}</Text>
        </View>
        <Text style={[styles.kpiCategoryRate, { color: '#0284C7' }]}>{catStats?.tilawah?.rate ?? 92}%</Text>
        <Text style={styles.kpiCategoryCount}>{catStats?.tilawah?.good ?? 5}/{catStats?.tilawah?.total ?? 5} Kegiatan</Text>
        <View style={[styles.kpiCategoryBarBg, { backgroundColor: '#E0F2FE' }]}>
          <View style={[styles.kpiCategoryBarFill, { width: `${catStats?.tilawah?.rate ?? 92}%`, backgroundColor: '#0284C7' }]} />
        </View>
      </View>

      {/* 4. Adab */}
      <View style={[styles.kpiCategoryCard, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
        <View style={styles.kpiCategoryHeader}>
          <Text style={[styles.kpiCategoryTitle, { color: '#92400E' }]}>4. Adab</Text>
          <Text style={[styles.kpiCategoryTag, { color: '#D97706' }]}>{catStats?.adab?.label || 'Baik'}</Text>
        </View>
        <Text style={[styles.kpiCategoryRate, { color: '#D97706' }]}>{catStats?.adab?.rate ?? 95}%</Text>
        <Text style={styles.kpiCategoryCount}>{catStats?.adab?.good ?? 12}/{catStats?.adab?.total ?? 13} Adab</Text>
        <View style={[styles.kpiCategoryBarBg, { backgroundColor: '#FEF3C7' }]}>
          <View style={[styles.kpiCategoryBarFill, { width: `${catStats?.adab?.rate ?? 95}%`, backgroundColor: '#D97706' }]} />
        </View>
      </View>
    </View>
  );

  // Helper Renderer: 4 Pilar Rincian Amalan (29 Agenda)
  const renderPillarsBreakdown = (periodData: any, periodTitle: string) => {
    const fardhuItems = periodData?.shalat_fardhu || [];
    const sunnahItems = periodData?.shalat_sunnah || [];
    const tilawahItems = periodData?.tilawah_dzikir || [];
    const adabItems = periodData?.adab_karakter || [];

    return (
      <View style={styles.breakdownContainer}>
        <View style={styles.breakdownHeaderRow}>
          <MaterialCommunityIcons name="star-four-points-outline" size={16} color="#059669" />
          <Text style={styles.breakdownHeaderTitle}>
            Rincian Amalan ({periodTitle})
          </Text>
          <Text style={styles.breakdownHeaderSub}>29 Agenda Kegiatan</Text>
        </View>

        {/* 1. Shalat 5 Waktu */}
        <View style={[styles.pillarCard, { borderColor: '#A7F3D0' }]}>
          <View style={styles.pillarHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.pillarNum, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[styles.pillarNumText, { color: '#059669' }]}>1</Text>
              </View>
              <Text style={styles.pillarTitle}>Shalat 5 Waktu (Fardhu)</Text>
            </View>
            <Text style={styles.pillarCount}>{fardhuItems.length || 5} Waktu</Text>
          </View>
          <View style={styles.pillarGrid}>
            {fardhuItems.map((it: any, idx: number) => (
              <View key={it.code || idx} style={styles.pillarItem}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.pillarItemDot, { backgroundColor: '#10B981' }]} />
                    <Text numberOfLines={1} style={styles.pillarItemName}>{it.name}</Text>
                  </View>
                  {it.good_count != null && (
                    <Text style={styles.pillarItemSub}>
                      {it.good_count}/{it.total_days} Hari ({it.rate}%)
                    </Text>
                  )}
                </View>
                <View style={[styles.pillarItemBadge, { backgroundColor: '#ECFDF5' }]}>
                  <Text style={[styles.pillarItemBadgeText, { color: '#065F46' }]}>
                    {it.status_label || 'Istiqamah'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 2. Shalat Sunnah & Qiyamul Lail */}
        <View style={[styles.pillarCard, { borderColor: '#DDD6FE' }]}>
          <View style={styles.pillarHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.pillarNum, { backgroundColor: '#F3E8FF' }]}>
                <Text style={[styles.pillarNumText, { color: '#7C3AED' }]}>2</Text>
              </View>
              <Text style={styles.pillarTitle}>Shalat Sunnah & Qiyamul Lail</Text>
            </View>
            <Text style={[styles.pillarCount, { color: '#7C3AED' }]}>{sunnahItems.length || 6} Amalan</Text>
          </View>
          <View style={styles.pillarGrid}>
            {sunnahItems.map((it: any, idx: number) => (
              <View key={it.code || idx} style={styles.pillarItem}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.pillarItemDot, { backgroundColor: '#8B5CF6' }]} />
                    <Text numberOfLines={1} style={styles.pillarItemName}>{it.name}</Text>
                  </View>
                  {it.good_count != null && (
                    <Text style={styles.pillarItemSub}>
                      {it.good_count}/{it.total_days} Hari ({it.rate}%)
                    </Text>
                  )}
                </View>
                <View style={[styles.pillarItemBadge, { backgroundColor: '#F3E8FF' }]}>
                  <Text style={[styles.pillarItemBadgeText, { color: '#5B21B6' }]}>
                    {it.status_label || 'Rutin'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 3. Tilawah, Zikir & Penguatan */}
        <View style={[styles.pillarCard, { borderColor: '#BAE6FD' }]}>
          <View style={styles.pillarHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.pillarNum, { backgroundColor: '#E0F2FE' }]}>
                <Text style={[styles.pillarNumText, { color: '#0284C7' }]}>3</Text>
              </View>
              <Text style={styles.pillarTitle}>Tilawah, Zikir & Penguatan</Text>
            </View>
            <Text style={[styles.pillarCount, { color: '#0284C7' }]}>{tilawahItems.length || 5} Kegiatan</Text>
          </View>
          <View style={styles.pillarGrid}>
            {tilawahItems.map((it: any, idx: number) => (
              <View key={it.code || idx} style={styles.pillarItem}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.pillarItemDot, { backgroundColor: '#0284C7' }]} />
                    <Text numberOfLines={1} style={styles.pillarItemName}>{it.name}</Text>
                  </View>
                  {it.good_count != null && (
                    <Text style={styles.pillarItemSub}>
                      {it.good_count}/{it.total_days} Hari ({it.rate}%)
                    </Text>
                  )}
                </View>
                <View style={[styles.pillarItemBadge, { backgroundColor: '#E0F2FE' }]}>
                  <Text style={[styles.pillarItemBadgeText, { color: '#0369A1' }]}>
                    {it.status_label || 'Aktif'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 4. Adab & Karakter Terpuji */}
        <View style={[styles.pillarCard, { borderColor: '#FDE68A' }]}>
          <View style={styles.pillarHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.pillarNum, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.pillarNumText, { color: '#D97706' }]}>4</Text>
              </View>
              <Text style={styles.pillarTitle}>Adab & Karakter Terpuji</Text>
            </View>
            <Text style={[styles.pillarCount, { color: '#D97706' }]}>{adabItems.length || 13} Pembiasaan</Text>
          </View>
          <View style={styles.pillarGrid}>
            {adabItems.map((it: any, idx: number) => (
              <View key={it.code || idx} style={styles.pillarItem}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.pillarItemDot, { backgroundColor: '#D97706' }]} />
                    <Text numberOfLines={1} style={styles.pillarItemName}>{it.name}</Text>
                  </View>
                  {it.good_count != null && (
                    <Text style={styles.pillarItemSub}>
                      {it.good_count}/{it.total_days} Hari ({it.rate}%)
                    </Text>
                  )}
                </View>
                <View style={[styles.pillarItemBadge, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.pillarItemBadgeText, { color: '#92400E' }]}>
                    {it.status_label || 'Baik'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  // Helper Renderer: Riwayat Setoran Tahfizh
  const renderTahfizhLogs = (tahfizhLogs: any[], periodTitle: string) => {
    if (!Array.isArray(tahfizhLogs) || tahfizhLogs.length === 0) return null;

    return (
      <View style={styles.tahfizhLogsCard}>
        <View style={styles.tahfizhLogsHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="book-check-outline" size={17} color="#0D9488" />
            <Text style={styles.tahfizhLogsTitle}>
              Riwayat Setoran Tahfizh ({periodTitle})
            </Text>
          </View>
          <Text style={styles.tahfizhLogsCount}>{tahfizhLogs.length} Setoran</Text>
        </View>
        {tahfizhLogs.map((log: any, idx: number) => (
          <View key={log.id || idx} style={styles.tahfizhLogRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.tahfizhLogSurah}>{log.surah}</Text>
                <View style={styles.tahfizhLogAyahBadge}>
                  <Text style={styles.tahfizhLogAyahText}>{log.ayah_range}</Text>
                </View>
              </View>
              <Text style={styles.tahfizhLogNotes}>{log.notes}</Text>
              <Text style={styles.tahfizhLogMeta}>
                {log.date} · Oleh {log.teacher_name}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={styles.tahfizhLogScoreBadge}>
                <Text style={styles.tahfizhLogScoreText}>{log.score || 90}</Text>
              </View>
              <Text style={styles.tahfizhLogQuality}>{log.quality || 'Mumtaz'}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.rootContainer}>
      {/* 0. STICKY HEADER BERSAMA (top bar + card siswa, sama dengan Tugas/Jadwal/Materi/Nilai) */}
      <StudentStickyHeader
        scrollY={scrollY}
        topInset={topInset}
        title="Mutaba’ah Yaumiyyah"
        navigation={navigation}
        route={route}
        student={headerStudent}
        user={user}
        childrenList={children}
        selectedChildId={selectedChildId}
        onSelectChild={(_cid, idx) => {
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
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F4FBF8', '#ECFDF5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.ScrollView
          ref={mainScrollRef}
          style={styles.screen}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: Math.max(bottomInset + 72, 94) }]}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadMutabaah();
                void loadMonitoring();
              }}
              colors={['#18A165']}
              progressViewOffset={topInset + 10}
            />
          }
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
                  Mutaba’ah Yaumiyyah
                </Text>
                <Text numberOfLines={1} style={styles.heroModuleSubtitle}>
                  {heroFirstName ? `Ananda ${heroFirstName}` : heroSubtitleFallback}
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
            {/* ============================================================ */}
            {/* SECTION 1: DATA SISWA & UNIT PENDIDIKAN (HERO CARD STANDAR) */}
            {/* ============================================================ */}
            {children.length > 0 ? (
              <View style={[styles.containerBlock, styles.studentContainerBlock]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderTitleWrap}>
                    <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                    <Text style={styles.sectionTitle}>Data Ananda</Text>
                  </View>
                  {children.length > 1 && (
                    <View style={styles.studentCardCountBadge}>
                      <Text style={styles.studentCardCountBadgeText}>
                        {Math.max(1, children.findIndex((c) => String(c.id) === selectedChildId) + 1)} dari {children.length} Ananda
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
              </View>
            ) : studentData ? (
              <View style={[styles.containerBlock, styles.studentContainerBlock]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderTitleWrap}>
                    <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                    <Text style={styles.sectionTitle}>Data Ananda</Text>
                  </View>
                </View>

                <View style={styles.singleHeroCardContainer}>
                  <StudentHeroCard
                    child={studentData}
                    isSelected={true}
                    isSingleChild={true}
                    showActionButtons={true}
                    cardLabel="Kartu Siswa"
                    calendarLabel="Jadwal"
                    portalLabel="Menu"
                    onPressCard={() => openIdCard(studentData)}
                    onPressQr={() => openQrCard(studentData)}
                    onPressWeeklyReport={() => setSelectedWeeklyStudent(studentData)}
                    onPressNotifications={() => navigation?.navigate('Notifikasi')}
                    onPressCalendar={() => openScheduleForStudent(studentData)}
                    onPressPortal={() => setSelectedMenuStudent(studentData)}
                  />
                </View>
              </View>
            ) : null}

            {/* ============================================================ */}
            {/* SECTION 2: PILIH PERIODE & KALENDER STRIP (SCREEN 1 & 2) */}
            {/* ============================================================ */}
            <View style={styles.containerBlock}>
              <View style={styles.periodCardWrapper}>
                <View style={styles.cardInternalHeader}>
                  <View style={styles.cardInternalHeaderTitleWrap}>
                    <MaterialCommunityIcons name="calendar-clock-outline" size={17} color="#18A165" />
                    <Text style={styles.cardInternalTitle}>Pilih Periode</Text>
                  </View>
                </View>
                {/* 4 Capsule Tabs: Harian, Mingguan, Bulanan, Semester */}
                <View style={styles.periodTabsCapsule}>
                  <TouchableOpacity
                    style={[styles.periodTabBtn, periodMode === 'daily' && styles.periodTabBtnActive]}
                    onPress={() => {
                      setPeriodMode('daily');
                      setMainTab('today');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.periodTabText, periodMode === 'daily' && styles.periodTabTextActive]}>
                      Harian
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.periodTabBtn, periodMode === 'weekly' && styles.periodTabBtnActive]}
                    onPress={() => {
                      setPeriodMode('weekly');
                      setMainTab('today');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.periodTabText, periodMode === 'weekly' && styles.periodTabTextActive]}>
                      Mingguan
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.periodTabBtn, periodMode === 'monthly' && styles.periodTabBtnActive]}
                    onPress={() => {
                      setPeriodMode('monthly');
                      setMainTab('history');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.periodTabText, periodMode === 'monthly' && styles.periodTabTextActive]}>
                      Bulanan
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.periodTabBtn, periodMode === 'semester' && styles.periodTabBtnActive]}
                    onPress={() => {
                      setPeriodMode('semester');
                      setMainTab('history');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.periodTabText, periodMode === 'semester' && styles.periodTabTextActive]}>
                      Semester
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Horizontal Date Strip (Sen 22, Sel 23, Rab 24...) + Tombol Kalender */}
                {periodMode === 'daily' && (
                  <View style={styles.dateStripContainer}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.dateStripScrollContent}
                    >
                      {dateStripDays.map((d) => (
                        <TouchableOpacity
                          key={d.dateStr}
                          style={[styles.dateStripItem, d.isSelected && styles.dateStripItemActive]}
                          onPress={() => setSelectedDate(d.dateStr)}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.dateStripDayName, d.isSelected && styles.dateStripDayNameActive]}>
                            {d.dayName}
                          </Text>
                          <View style={[styles.dateStripCircle, d.isSelected && styles.dateStripCircleActive]}>
                            <Text style={[styles.dateStripDayNum, d.isSelected && styles.dateStripDayNumActive]}>
                              {d.dayNum}
                            </Text>
                          </View>
                          {d.isToday && !d.isSelected && <View style={styles.dateTodayDot} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <TouchableOpacity
                      style={styles.dateStripCalendarBtn}
                      onPress={() => setIsCalendarPickerVisible(true)}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#059669" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Status sinkronisasi tanggal di background */}
                {isFetchingDate && (
                  <View style={styles.fetchingDatePill}>
                    <ActivityIndicator size="small" color="#059669" style={{ transform: [{ scale: 0.75 }] }} />
                    <Text style={styles.fetchingDatePillText}>Menyelaraskan data tanggal ini...</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Loading Indicator - Hanya tampil full jika benar-benar belum ada data sama sekali */}
            {loading && !overview ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#18A165" />
                <Text style={styles.loadingText}>Memuat lembar Mutaba’ah...</Text>
              </View>
            ) : error && !overview ? (
              <View style={styles.errorCard}>
                <View style={styles.errorIconBox}>
                  <MaterialCommunityIcons name="cloud-alert" size={34} color="#E11D48" />
                </View>
                <View style={styles.errorPillBadge}>
                  <Text style={styles.errorPillBadgeText}>Gagal Menghubungkan</Text>
                </View>
                <Text style={styles.errorTitle}>Gagal Memuat Data</Text>
                <Text style={styles.errorDesc}>{error}</Text>
                <TouchableOpacity style={styles.errorRetryBtn} onPress={loadMutabaah} activeOpacity={0.85}>
                  <LinearGradient
                    colors={['#BE123C', '#E11D48']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.errorRetryGradient}
                  >
                    <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" />
                    <Text style={styles.errorRetryText}>Muat Ulang Data</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : periodMode === 'semester' ? (
              /* ============================================================ */
              /* MODE SEMESTER (INDEKS KUMULATIF SEMESTER) */
              /* ============================================================ */
              <View style={styles.containerBlock}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="school-outline" size={18} color="#059669" />
                  <Text style={styles.sectionTitle}>Evaluasi Terpadu Kumulatif (Semester)</Text>
                </View>

                {/* Kartu Rangkuman Capaian Semester */}
                <View style={[styles.weeklySummaryCard, { marginBottom: 16 }]}>
                  <View style={styles.weeklyScoreRow}>
                    <View style={styles.weeklyScoreBadge}>
                      <Text style={styles.weeklyScoreVal}>
                        {semesterPeriodData?.score != null
                          ? `${Math.round(Number(semesterPeriodData.score))}%`
                          : '90%'}
                      </Text>
                      <Text style={styles.weeklyScoreLabel}>Indeks Skor</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={styles.weeklyStatusTitle}>
                        {Number(semesterPeriodData?.score || 90) >= 85
                          ? 'Predikat Istiqamah Unggul'
                          : Number(semesterPeriodData?.score || 90) >= 70
                          ? 'Pencapaian Tertib Baik'
                          : 'Perlu Pendampingan'}
                      </Text>
                      <Text style={styles.weeklyStatusDesc}>
                        {semesterPeriodData?.date_range || 'Semester 1 (Ganjil) 2026/2027'} · {semesterPeriodData?.days_active || 73} Hari Aktif Pembiasaan Ibadah & Adab Karakter.
                      </Text>
                    </View>
                  </View>

                  {/* Tombol Preview Laporan Semester Lengkap */}
                  <TouchableOpacity
                    style={[styles.weeklyFullReportBtn, { marginTop: 14 }]}
                    onPress={() => {
                      const targetStudent = headerStudent || studentData || (user as any)?.student || user;
                      setSelectedMonthlyStudent(targetStudent);
                    }}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#047857', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.weeklyFullReportGrad}
                    >
                      <MaterialCommunityIcons name="file-chart-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.weeklyFullReportText}>Preview Rekap Rapor Mutaba'ah Semester</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>

                {/* 4 Kartu KPI Kategori Semester */}
                {renderKpiCategoryCards(semesterPeriodData?.category_stats)}

                {/* Rincian Komprehensif 4 Pilar Amalan (29 Agenda) */}
                {renderPillarsBreakdown(semesterPeriodData, 'Semester 1')}

                {/* Riwayat Setoran Tahfizh Semester Ini */}
                {renderTahfizhLogs(semesterPeriodData?.tahfizh_logs, 'Semester 1')}
              </View>
            ) : periodMode === 'monthly' ? (
              /* ============================================================ */
              /* MODE RIWAYAT MUTABAAH BULANAN (SCREEN 1 & 8) */
              /* ============================================================ */
              <View style={styles.containerBlock}>
                {/* 1. KARTU RANGKUMAN CAPAIAN BULANAN */}
                <View style={[styles.weeklySummaryCard, { marginBottom: 16 }]}>
                  <View style={styles.weeklyScoreRow}>
                    <View style={styles.weeklyScoreBadge}>
                      <Text style={styles.weeklyScoreVal}>
                        {monthlyPeriodData?.score != null
                          ? `${Math.round(Number(monthlyPeriodData.score))}%`
                          : monthlyStats.score > 0
                          ? `${monthlyStats.score}%`
                          : overview?.today?.score != null
                          ? `${Math.round(Number(overview.today.score))}%`
                          : '90%'}
                      </Text>
                      <Text style={styles.weeklyScoreLabel}>Rata-rata Skor</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={styles.weeklyStatusTitle}>
                        {Number(monthlyPeriodData?.score || monthlyStats.score || 90) >= 85
                          ? 'Pencapaian Sangat Baik'
                          : Number(monthlyPeriodData?.score || monthlyStats.score || 90) >= 70
                          ? 'Pencapaian Baik'
                          : 'Perlu Pendampingan'}
                      </Text>
                      <Text style={styles.weeklyStatusDesc}>
                        {monthlyPeriodData?.date_range || '30 Hari Terakhir'} · {monthlyPeriodData?.days_active || monthlyStats.days || 30} Hari Aktif Pembiasaan Ibadah & Karakter Ananda.
                      </Text>
                    </View>
                  </View>

                  {/* 4 Akumulasi Mini Pills: Baik, Kurang, Belum, Uzur */}
                  <View style={[styles.historyStatsRow, { marginTop: 14, marginBottom: 4 }]}>
                    <View style={[styles.historyStatPill, { backgroundColor: '#D1FAE5', flex: 1, paddingVertical: 6 }]}>
                      <Text style={[styles.historyStatText, { color: '#059669', textAlign: 'center', fontSize: 12, fontWeight: '700' }]}>
                        {monthlyStats.good} Baik
                      </Text>
                    </View>
                    <View style={[styles.historyStatPill, { backgroundColor: '#FEF3C7', flex: 1, paddingVertical: 6 }]}>
                      <Text style={[styles.historyStatText, { color: '#D97706', textAlign: 'center', fontSize: 12, fontWeight: '700' }]}>
                        {monthlyStats.less} Kurang
                      </Text>
                    </View>
                    <View style={[styles.historyStatPill, { backgroundColor: '#FFE4E6', flex: 1, paddingVertical: 6 }]}>
                      <Text style={[styles.historyStatText, { color: '#E11D48', textAlign: 'center', fontSize: 12, fontWeight: '700' }]}>
                        {monthlyStats.not_done} Belum
                      </Text>
                    </View>
                    <View style={[styles.historyStatPill, { backgroundColor: '#F1F5F9', flex: 1, paddingVertical: 6 }]}>
                      <Text style={[styles.historyStatText, { color: '#64748B', textAlign: 'center', fontSize: 12, fontWeight: '700' }]}>
                        {monthlyStats.na} Uzur
                      </Text>
                    </View>
                  </View>

                  {/* Tombol Preview Laporan Bulanan Lengkap */}
                  <TouchableOpacity
                    style={[styles.weeklyFullReportBtn, { marginTop: 12 }]}
                    onPress={() => {
                      const targetStudent = headerStudent || studentData || (user as any)?.student || user;
                      setSelectedMonthlyStudent(targetStudent);
                    }}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#047857', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.weeklyFullReportGrad}
                    >
                      <MaterialCommunityIcons name="file-chart-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.weeklyFullReportText}>Preview Laporan Bulanan Lengkap</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>

                {/* 4 Kartu KPI Kategori Bulanan */}
                {renderKpiCategoryCards(monthlyPeriodData?.category_stats)}

                {/* Rincian Komprehensif 4 Pilar Amalan (29 Agenda) */}
                {renderPillarsBreakdown(monthlyPeriodData, 'Bulan Ini')}

                {/* Riwayat Setoran Tahfizh 30 Hari Terakhir */}
                {renderTahfizhLogs(monthlyPeriodData?.tahfizh_logs, 'Bulan Ini')}

                {/* 2. DAFTAR RIWAYAT 30 HARI */}
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="format-list-bulleted" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Riwayat Evaluasi (30 Hari Terakhir)</Text>
                </View>

                {historyLoading ? (
                  <ActivityIndicator color="#18A165" style={{ marginVertical: 32 }} />
                ) : historyRows.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconBox}>
                      <MaterialCommunityIcons name="calendar-clock-outline" size={38} color="#0D6B42" />
                    </View>
                    <View style={styles.emptyPillBadge}>
                      <Text style={styles.emptyPillBadgeText}>Riwayat 30 Hari</Text>
                    </View>
                    <Text style={styles.emptyTitle}>Belum Ada Riwayat Evaluasi</Text>
                    <Text style={styles.emptyDesc}>
                      Riwayat checklist dan hasil evaluasi harian ananda akan tercatat dan tersusun rapi di sini setelah kegiatan dievaluasi.
                    </Text>
                  </View>
                ) : (
                  historyRows.map((row: any) => {
                    const score = row.score != null ? Math.round(Number(row.score)) : null;
                    const isSigned = row.signed_at != null;
                    return (
                      <View key={row.id} style={styles.historyCard}>
                        <View style={styles.historyTop}>
                          <View>
                            <Text style={styles.historyDate}>{formatDateIndo(row.activity_date)}</Text>
                            <Text style={styles.historySub}>
                              Status: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{row.status || 'Draft'}</Text>
                            </Text>
                          </View>
                          <View style={styles.historyScoreBox}>
                            <Text style={styles.historyScoreVal}>{score != null ? `${score}%` : '-'}</Text>
                            <Text style={styles.historyScoreLabel}>Skor</Text>
                          </View>
                        </View>

                        <View style={styles.historyStatsRow}>
                          <View style={[styles.historyStatPill, { backgroundColor: '#D1FAE5' }]}>
                            <Text style={[styles.historyStatText, { color: '#059669' }]}>
                              {row.good_count || 0} Baik
                            </Text>
                          </View>
                          <View style={[styles.historyStatPill, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={[styles.historyStatText, { color: '#D97706' }]}>
                              {row.less_count || 0} Kurang
                            </Text>
                          </View>
                          <View style={[styles.historyStatPill, { backgroundColor: '#FFE4E6' }]}>
                            <Text style={[styles.historyStatText, { color: '#E11D48' }]}>
                              {row.not_done_count || 0} Belum
                            </Text>
                          </View>
                          <View style={[styles.historyStatPill, { backgroundColor: '#F1F5F9' }]}>
                            <Text style={[styles.historyStatText, { color: '#64748B' }]}>
                              {row.na_count || 0} Uzur
                            </Text>
                          </View>
                        </View>

                        <View style={styles.historyFooter}>
                          <View style={styles.historySignStatus}>
                            <MaterialCommunityIcons
                              name={isSigned ? 'draw' : 'draw-pen'}
                              size={16}
                              color={isSigned ? '#059669' : '#94A3B8'}
                            />
                            <Text style={[styles.historySignText, isSigned && { color: '#059669', fontWeight: '800' }]}>
                              {isSigned
                                ? `Diparaf (${row.signature_status === 'approved' ? 'Setuju' : 'Klarifikasi'})`
                                : 'Belum diparaf'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.historyDetailBtn}
                            onPress={() => {
                              const cleanDate = typeof row.activity_date === 'string'
                                ? row.activity_date.split('T')[0].split(' ')[0]
                                : getLocalDateString();
                              setSelectedDate(cleanDate);
                              setPeriodMode('daily');
                              setMainTab('today');
                              setIsTableModalVisible(true);
                              mainScrollRef.current?.scrollTo?.({ y: 0, animated: false });
                            }}
                          >
                            <Text style={styles.historyDetailBtnText}>Buka Lembar</Text>
                            <MaterialCommunityIcons name="chevron-right" size={16} color="#18A165" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            ) : periodMode === 'weekly' ? (
              /* ============================================================ */
              /* MODE MINGGUAN (SCREEN 5 & 6) */
              /* ============================================================ */
              <View style={styles.containerBlock}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="calendar-week" size={18} color="#059669" />
                  <Text style={styles.sectionTitle}>Evaluasi Mingguan (Pekan Ini)</Text>
                </View>

                <View style={styles.weeklySummaryCard}>
                  <View style={styles.weeklyScoreRow}>
                    <View style={styles.weeklyScoreBadge}>
                      <Text style={styles.weeklyScoreVal}>
                        {weeklyPeriodData?.score != null
                          ? `${Math.round(Number(weeklyPeriodData.score))}%`
                          : overview?.weekly?.score != null
                          ? `${Math.round(Number(overview.weekly.score))}%`
                          : '90%'}
                      </Text>
                      <Text style={styles.weeklyScoreLabel}>Rata-rata Skor</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={styles.weeklyStatusTitle}>Pencapaian Sangat Baik</Text>
                      <Text style={styles.weeklyStatusDesc}>
                        Ananda konsisten menjalankan amalan wajib dan pembiasaan harian sepanjang pekan ini.
                      </Text>
                    </View>
                  </View>

                  {/* 7 Hari Mingguan */}
                  <View style={styles.weeklyDaysTrack}>
                    {dateStripDays.map((d) => (
                      <TouchableOpacity
                        key={d.dateStr}
                        style={[styles.weeklyDayCol, d.isSelected && styles.weeklyDayColActive]}
                        onPress={() => {
                          setSelectedDate(d.dateStr);
                          setPeriodMode('daily');
                          setMainTab('today');
                          setIsTableModalVisible(true);
                          mainScrollRef.current?.scrollTo?.({ y: 0, animated: false });
                        }}
                        activeOpacity={0.75}
                      >
                        <View style={styles.weeklyDayBarTrack}>
                          <View
                            style={[
                              styles.weeklyDayBarFill,
                              { height: d.isSelected ? '85%' : '75%' },
                              d.isToday && { backgroundColor: '#059669' },
                            ]}
                          />
                        </View>
                        <Text style={[styles.weeklyDayText, d.isSelected && styles.weeklyDayTextActive]}>
                          {d.dayName}
                        </Text>
                        <Text style={[styles.weeklyDayNumText, d.isSelected && styles.weeklyDayNumTextActive]}>
                          {d.dayNum}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <TouchableOpacity
                      style={[styles.weeklyFullReportBtn, { flex: 1, marginTop: 0 }]}
                      onPress={() => {
                        setPeriodMode('daily');
                        setMainTab('today');
                        setIsTableModalVisible(true);
                        mainScrollRef.current?.scrollTo?.({ y: 0, animated: false });
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.weeklyOpenDailyInner}>
                        <MaterialCommunityIcons name="table-large" size={17} color="#059669" />
                        <Text style={styles.weeklyOpenDailyText}>Buka Lembar</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.weeklyFullReportBtn, { flex: 1.4, marginTop: 0 }]}
                      onPress={() => {
                        const targetStudent = headerStudent || studentData || (user as any)?.student || user;
                        setSelectedWeeklyStudent(targetStudent);
                      }}
                      activeOpacity={0.85}
                    >
                      <LinearGradient
                        colors={['#047857', '#059669']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.weeklyFullReportGrad}
                      >
                        <MaterialCommunityIcons name="file-chart-outline" size={17} color="#FFFFFF" />
                        <Text style={styles.weeklyFullReportText}>Laporan Pekanan</Text>
                        <MaterialCommunityIcons name="chevron-right" size={17} color="#FFFFFF" />
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 4 Kartu KPI Kategori Mingguan */}
                {renderKpiCategoryCards(weeklyPeriodData?.category_stats)}

                {/* Rincian Komprehensif 4 Pilar Amalan (29 Agenda) */}
                {renderPillarsBreakdown(weeklyPeriodData, 'Pekan Ini')}

                {/* Riwayat Setoran Tahfizh Pekan Ini */}
                {renderTahfizhLogs(weeklyPeriodData?.tahfizh_logs, 'Pekan Ini')}
              </View>
            ) : (
              /* ============================================================ */
              /* MODE HARI INI */
              /* ============================================================ */
              <>
                {/* SECTION 3: RINGKASAN HARI INI (SCREEN 1) */}
                <View style={styles.containerBlock}>
                  <View style={styles.ringkasanMainCard}>
                    <View style={styles.cardInternalHeader}>
                      <View style={styles.cardInternalHeaderTitleWrap}>
                        <MaterialCommunityIcons name="chart-donut" size={17} color="#059669" />
                        <Text style={styles.cardInternalTitle}>Ringkasan Hari Ini</Text>
                      </View>
                    </View>

                    <View style={styles.ringkasanTopRow}>
                      {/* Donut Progress Gauge (24/29 Amalan) */}
                      <View style={styles.donutGaugeBox}>
                        <View style={styles.donutOuterRing}>
                          <View style={styles.donutInnerHole}>
                            <Text style={styles.donutValueText}>
                              {overview?.today?.good_count ?? details.filter((d: any) => d.status_value === 'good').length}/{details.length || 29}
                            </Text>
                            <Text style={styles.donutLabelText}>Amalan</Text>
                          </View>
                        </View>
                      </View>

                      {/* Kolom Kanan: Persentase Terlaksana & 3 Mini Pills */}
                      <View style={styles.ringkasanRightCol}>
                        <View style={styles.terlaksanaBadge}>
                          <MaterialCommunityIcons name="check-decagram" size={16} color="#059669" />
                          <Text style={styles.terlaksanaBadgeText}>
                            {overview?.today?.score != null
                              ? `${Math.round(Number(overview.today.score))}% Terlaksana`
                              : `${Math.round(((overview?.today?.good_count ?? 0) / (details.length || 1)) * 100)}% Terlaksana`}
                          </Text>
                        </View>

                        <View style={styles.ringkasanPillsRow}>
                          <View style={[styles.ringkasanMiniPill, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={[styles.ringkasanMiniPillVal, { color: '#D97706' }]}>
                              {overview?.today?.less_count ?? details.filter((d: any) => d.status_value === 'less').length}
                            </Text>
                            <Text style={[styles.ringkasanMiniPillLbl, { color: '#D97706' }]}>Kurang</Text>
                          </View>

                          <View style={[styles.ringkasanMiniPill, { backgroundColor: '#FFE4E6' }]}>
                            <Text style={[styles.ringkasanMiniPillVal, { color: '#E11D48' }]}>
                              {overview?.today?.not_done_count ?? details.filter((d: any) => d.status_value === 'not_done').length}
                            </Text>
                            <Text style={[styles.ringkasanMiniPillLbl, { color: '#E11D48' }]}>Belum</Text>
                          </View>

                          <View style={[styles.ringkasanMiniPill, { backgroundColor: '#F1F5F9' }]}>
                            <Text style={[styles.ringkasanMiniPillVal, { color: '#64748B' }]}>
                              {overview?.today?.na_count ?? details.filter((d: any) => d.status_value === 'na').length}
                            </Text>
                            <Text style={[styles.ringkasanMiniPillLbl, { color: '#64748B' }]}>Uzur</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Motivational Islamic Quote */}
                    <View style={styles.quoteBox}>
                      <Text style={styles.quoteText}>
                        "Konsistensi dalam amalan kecil akan melahirkan perubahan besar."
                      </Text>
                    </View>
                  </View>
                </View>

                {/* SECTION 4: PROGRAM MUTABA'AH (SCREEN 1 - FILTER OPSI 2) */}
                <View style={styles.containerBlock}>
                  <View style={styles.programSectionCard}>
                    <View style={styles.cardInternalHeader}>
                      <View style={styles.cardInternalHeaderTitleWrap}>
                        <MaterialCommunityIcons name="view-grid-plus-outline" size={17} color="#059669" />
                        <Text style={styles.cardInternalTitle}>Program Mutaba’ah</Text>
                      </View>
                      {selectedCategory !== 'all' && (
                        <TouchableOpacity
                          onPress={() => setSelectedCategory('all')}
                          style={styles.resetFilterChip}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons name="refresh" size={12} color="#059669" />
                          <Text style={styles.resetFilterText}>Lihat Semua</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.programsRow}>
                      <TouchableOpacity
                        style={[
                          styles.programCard,
                          { backgroundColor: '#F0F9FF', borderColor: selectedCategory === 'sholat' ? '#0284C7' : '#BAE6FD' },
                          selectedCategory === 'sholat' && styles.programCardActive,
                        ]}
                        onPress={() => setSelectedCategory(selectedCategory === 'sholat' ? 'all' : 'sholat')}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.programIconWrap, { backgroundColor: '#E0F2FE' }]}>
                          <MaterialCommunityIcons name="mosque" size={20} color="#0284C7" />
                        </View>
                        <Text style={styles.programCardName}>Sholat</Text>
                        <Text style={styles.programCardCount}>{programCounts.shalat} kegiatan</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.programCard,
                          { backgroundColor: '#FFFBEB', borderColor: selectedCategory === 'yaumiyyah' ? '#D97706' : '#FDE68A' },
                          selectedCategory === 'yaumiyyah' && styles.programCardActive,
                        ]}
                        onPress={() => setSelectedCategory(selectedCategory === 'yaumiyyah' ? 'all' : 'yaumiyyah')}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.programIconWrap, { backgroundColor: '#FEF3C7' }]}>
                          <MaterialCommunityIcons name="hands-pray" size={20} color="#D97706" />
                        </View>
                        <Text style={styles.programCardName}>Mutaba’ah</Text>
                        <Text style={styles.programCardCount}>{programCounts.yaumiyyah} kegiatan</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.programCard,
                          { backgroundColor: '#ECFDF5', borderColor: selectedCategory === 'quran' ? '#059669' : '#A7F3D0' },
                          selectedCategory === 'quran' && styles.programCardActive,
                        ]}
                        onPress={() => setSelectedCategory(selectedCategory === 'quran' ? 'all' : 'quran')}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.programIconWrap, { backgroundColor: '#D1FAE5' }]}>
                          <MaterialCommunityIcons name="book-open-page-variant" size={20} color="#059669" />
                        </View>
                        <Text style={styles.programCardName}>Al-Qur’an</Text>
                        <Text style={styles.programCardCount}>{programCounts.quran} kegiatan</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* SECTION 5: CATATAN PEMBIMBING (JIKA ADA) */}
                {overview?.today?.notes && (
                  <View style={styles.containerBlock}>
                    <View style={styles.notesSectionCard}>
                      <View style={styles.cardInternalHeader}>
                        <View style={styles.cardInternalHeaderTitleWrap}>
                          <MaterialCommunityIcons name="comment-text-outline" size={17} color="#D97706" />
                          <Text style={styles.cardInternalTitle}>Catatan Pembimbing / Musyrif</Text>
                        </View>
                      </View>
                      <View style={styles.notesBox}>
                        <Text style={styles.notesText}>{overview.today.notes}</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* DAFTAR AMALAN SISWA */}
                <View style={{ marginBottom: 14 }}>
                  <View style={styles.agendaSectionHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialCommunityIcons name="format-list-checks" size={17} color="#059669" />
                      <Text style={styles.agendaSectionTitle}>Daftar Amalan Siswa</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={styles.openSheetBadgeBtn}
                        onPress={() => setIsTableModalVisible(true)}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons name="table-large" size={13} color="#059669" />
                        <Text style={styles.openSheetBadgeBtnText}>Buka Lembar</Text>
                      </TouchableOpacity>
                      <View style={styles.agendaCountBadge}>
                        <Text style={styles.agendaCountBadgeText}>
                          {filteredDetails.length} Amalan
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* PANDUAN & JEMBATAN TAHFIZH JIKA KATEGORI AL-QUR'AN DIPILIH */}
                  {selectedCategory === 'quran' && (
                    <View style={styles.quranBridgeCard}>
                      <LinearGradient
                        colors={['#ECFDF5', '#F0FDF4']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.quranBridgeGradient}
                      >
                        <View style={styles.quranBridgeIconBox}>
                          <MaterialCommunityIcons name="book-open-page-variant" size={24} color="#059669" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.quranBridgeTitle}>Amalan Tilawah & Muroja'ah Harian</Text>
                          <Text style={styles.quranBridgeDesc}>
                            Cukup tandai amalan Al-Qur'an di sini sebagai rutinitas ibadah yaumiyyah. Untuk mencatat rincian setoran surat & ayat, target hafalan, atau rekaman audio, gunakan Modul Tahfizh.
                          </Text>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => {
                              const sid = selectedChildId || (children.length > 0 ? (children[0].id || children[0].student_id) : undefined);
                              if (sid) {
                                const sidStr = String(sid);
                                navigation?.navigate('Tahfizh', { child_id: sidStr, student_id: sidStr });
                              } else {
                                navigation?.navigate('Tahfizh');
                              }
                            }}
                            style={styles.quranBridgeBtn}
                          >
                            <Text style={styles.quranBridgeBtnText}>Buka Modul Tahfizh Lengkap</Text>
                            <MaterialCommunityIcons name="arrow-right" size={15} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      </LinearGradient>
                    </View>
                  )}

                  {/* Daftar Butir Agenda */}
                  {filteredDetails.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <View style={styles.emptyIconBox}>
                        <MaterialCommunityIcons name="book-open-page-variant-outline" size={38} color="#0D6B42" />
                      </View>
                      <View style={styles.emptyPillBadge}>
                        <Text style={styles.emptyPillBadgeText}>
                          {scopeTab === 'home' ? 'Amalan Mandiri di Rumah' : 'Agenda Mutaba’ah Aktif'}
                        </Text>
                      </View>
                      <Text style={styles.emptyTitle}>Belum Ada Hasil Mutaba’ah</Text>
                      <Text style={styles.emptyDesc}>
                        {scopeTab === 'home'
                          ? 'Belum ada catatan amalan ibadah rumah untuk tanggal ini. Orang tua dapat mengisi dan mencatat aktivitas ananda secara berkala.'
                          : 'Hasil checklist akan tampil setelah pembimbing / guru melakukan penetapan agenda aktif atau finalisasi pada tanggal ini.'}
                      </Text>
                      {isParent && !isBoarding && (
                        <TouchableOpacity style={styles.emptyActionBtn} onPress={openWorshipModal} activeOpacity={0.88}>
                          <LinearGradient
                            colors={['#0D6B42', '#18A165']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.emptyActionGradient}
                          >
                            <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#FFFFFF" />
                            <Text style={styles.emptyActionBtnText}>Input Amalan Rumah Sekarang</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    filteredDetails.map((item: any, index: number) => {
                      const catIconInfo = getCategoryIconInfo(item.category, item.name, item.category_code);
                      const isItemHome = item.scope === 'home' || item.input_location === 'home' || item.is_parent_item;
                      const canParentEditThis = isItemHome && isParent && !isBoarding;
                      // Amalan rumah dianggap sudah diisi hanya jika input_source === 'parent' atau berstatus eksplisit
                      const isParentFilled = item.input_source === 'parent';
                      // Amalan sekolah / asrama dianggap sudah diisi jika diisi guru/musyrif dan berstatus eksplisit (bukan auto-init placeholder 'system')
                      const isStaffFilled = !isItemHome && Boolean(item.input_source && item.input_source !== 'system' && item.status_value);

                      const hasValue = isItemHome
                        ? (isParentFilled && Boolean(item.status_value))
                        : isStaffFilled;

                      const isGood = hasValue && item.status_value === 'good';
                      const isLess = hasValue && item.status_value === 'less';
                      const isNotDone = hasValue && item.status_value === 'not_done';
                      const isNa = hasValue && item.status_value === 'na';
                      return (
                        <TouchableOpacity
                          key={item.id || item.agenda_item_id || `agenda-${index}`}
                          style={[
                            styles.agendaItemCard,
                            canParentEditThis && styles.agendaItemCardClickable,
                          ]}
                          onPress={() => handleItemPress(item)}
                          activeOpacity={0.75}
                        >
                          <View style={styles.agendaCardRow}>
                            {/* Nomor Urut */}
                            <View style={[styles.agendaNumBox, isGood && styles.agendaNumBoxActive]}>
                              <Text style={[styles.agendaNumText, isGood && styles.agendaNumTextActive]}>
                                {index + 1}
                              </Text>
                            </View>

                            {/* Squircle Pastel Icon Box */}
                            <View style={[styles.agendaSquircleIcon, { backgroundColor: catIconInfo.bg }]}>
                              <MaterialCommunityIcons
                                name={catIconInfo.icon as any}
                                size={18}
                                color={catIconInfo.color}
                              />
                            </View>

                            {/* Informasi Nama & Kategori (Rapi, label sekolah/asrama/rumah di bawah kategori) */}
                            <View style={styles.agendaCardCenter}>
                              <Text style={styles.agendaTitleText} numberOfLines={2}>
                                {item.name}
                              </Text>
                              <View style={styles.agendaMetaColumn}>
                                <Text style={styles.agendaCatText}>{item.category || 'Amalan'}</Text>
                                <View
                                  style={[
                                    styles.scopePill,
                                    styles.scopePillAligned,
                                    isItemHome
                                      ? styles.scopePillHome
                                      : (isBoarding || item.scope === 'boarding')
                                        ? styles.scopePillBoarding
                                        : styles.scopePillSchool,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.scopePillText,
                                      isItemHome
                                        ? styles.scopePillTextHome
                                        : (isBoarding || item.scope === 'boarding')
                                          ? styles.scopePillTextBoarding
                                          : styles.scopePillTextSchool,
                                    ]}
                                  >
                                    {isItemHome
                                      ? '🏠 Rumah'
                                      : (isBoarding || item.scope === 'boarding')
                                        ? '🕌 Asrama'
                                        : '🏫 Sekolah'}
                                  </Text>
                                </View>
                              </View>
                              {item.notes ? (
                                <Text style={styles.agendaNotesText} numberOfLines={1}>
                                  Catatan: {item.notes}
                                </Text>
                              ) : null}
                            </View>

                            {/* Status Indicator (Checklist Hijau Besar / Kurang Jam / Silang Merah / Minus / Lingkaran Bergaris Sekolah/Asrama / Radar Tanda Seru) */}
                            <View style={styles.agendaCardRight}>
                              {isGood ? (
                                <View style={styles.statusCheckWrap}>
                                  <MaterialCommunityIcons
                                    name="check-circle"
                                    size={26}
                                    color="#059669"
                                  />
                                </View>
                              ) : isLess ? (
                                <View style={styles.statusLessWrap}>
                                  <MaterialCommunityIcons
                                    name="clock-alert-outline"
                                    size={24}
                                    color="#D97706"
                                  />
                                </View>
                              ) : isNotDone ? (
                                <View style={styles.statusCrossWrap}>
                                  <MaterialCommunityIcons
                                    name="close-circle"
                                    size={24}
                                    color="#E11D48"
                                  />
                                </View>
                              ) : isNa ? (
                                <View style={styles.statusNaWrap}>
                                  <MaterialCommunityIcons
                                    name="minus-circle-outline"
                                    size={22}
                                    color="#64748B"
                                  />
                                </View>
                              ) : !isItemHome ? (
                                <View style={styles.statusSchoolUnfilledWrap}>
                                  <MaterialCommunityIcons
                                    name="minus-circle-outline"
                                    size={24}
                                    color="#94A3B8"
                                  />
                                </View>
                              ) : isSelectedDatePast ? (
                                <View style={styles.statusCrossWrap}>
                                  <MaterialCommunityIcons
                                    name="close-circle"
                                    size={24}
                                    color="#E11D48"
                                  />
                                </View>
                              ) : (
                                <RadarExclamation />
                              )}
                              {canParentEditThis && (
                                <MaterialCommunityIcons
                                  name="chevron-right"
                                  size={17}
                                  color="#059669"
                                  style={{ marginLeft: 2 }}
                                />
                              )}
                            </View>
                          </View>

                          {/* Status Verifikasi Pembimbing & Sumber Input */}
                          <View style={styles.agendaItemFooter}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4 }}>
                              <MaterialCommunityIcons
                                name={
                                  isParentFilled
                                    ? (item.verification_status === 'verified' ? 'shield-check' : 'check-circle-outline')
                                    : (isItemHome
                                        ? 'clock-alert-outline'
                                        : (hasValue
                                            ? (item.verification_status === 'verified' ? 'shield-check' : (isBoarding ? 'mosque' : 'check-circle-outline'))
                                            : 'minus-circle-outline'))
                                }
                                size={13}
                                color={
                                  isParentFilled
                                    ? '#059669'
                                    : (isItemHome
                                        ? '#D97706'
                                        : (hasValue ? (item.verification_status === 'verified' ? '#059669' : (isBoarding ? '#0D9488' : '#0284C7')) : '#94A3B8'))
                                }
                              />
                              <Text
                                style={[
                                  styles.agendaItemFooterText,
                                  {
                                    color: isParentFilled
                                      ? '#059669'
                                      : (isItemHome
                                          ? '#D97706'
                                          : (hasValue ? (item.verification_status === 'verified' ? '#059669' : (isBoarding ? '#0D9488' : '#0284C7')) : '#94A3B8')),
                                  },
                                ]}
                              >
                                {isParentFilled
                                  ? (item.verification_status === 'verified' ? 'Diisi Orang Tua · Terverifikasi' : 'Diisi Orang Tua · Siap Diparaf')
                                  : (isItemHome
                                      ? 'Menunggu Input Orang Tua'
                                      : (isBoarding || item.scope === 'boarding'
                                          ? (hasValue ? 'Dicatat oleh Musyrif Asrama' : 'Belum diisi di asrama')
                                          : (hasValue
                                              ? (item.verification_status === 'verified' ? 'Diisi Guru · Terverifikasi' : 'Diisi Guru di Sekolah')
                                              : 'Belum diisi di sekolah')))}
                              </Text>
                            </View>
                            {canParentEditThis && (
                              <Text style={styles.agendaTapHintText}>
                                {hasValue ? 'Tap untuk ubah ➔' : 'Tap untuk isi ➔'}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                {/* SECTION: PARAF & PENGESAHAN ORANG TUA (DI PALING BAWAH CARD-CARD AGENDA - SCREEN 7) */}
                {isParent && overview?.today && (
                  <View style={[styles.containerBlock, { marginTop: 8, marginBottom: 24 }]}>
                    <View style={styles.evaluasiSectionCard}>
                      <View style={styles.cardInternalHeader}>
                        <View style={styles.cardInternalHeaderTitleWrap}>
                          <MaterialCommunityIcons name="draw" size={17} color="#059669" />
                          <Text style={styles.cardInternalTitle}>Evaluasi & Paraf Orang Tua</Text>
                        </View>
                      </View>

                      {/* Progress per Kategori (Screen 7) */}
                      <View style={styles.categoryProgressInner}>
                        <View style={styles.categoryProgressHeader}>
                          <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={15} color="#059669" />
                          <Text style={styles.categoryProgressTitle}>Progress per Kategori Hari Ini</Text>
                        </View>
                        <View style={{ gap: 10, marginTop: 8 }}>
                          {categoryProgressBreakdown.map((grp) => {
                            const pct = grp.total > 0 ? Math.round((grp.good / grp.total) * 100) : 0;
                            return (
                              <View key={grp.label} style={styles.categoryProgRow}>
                                <View style={styles.categoryProgTop}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View style={[styles.categoryProgIconWrap, { backgroundColor: grp.bg }]}>
                                      <MaterialCommunityIcons name={grp.icon as any} size={14} color={grp.color} />
                                    </View>
                                    <Text style={styles.categoryProgName}>{grp.label}</Text>
                                  </View>
                                  <Text style={styles.categoryProgRatio}>
                                    {grp.good}/{grp.total} ({pct}%)
                                  </Text>
                                </View>
                                <View style={styles.categoryProgTrack}>
                                  <View style={[styles.categoryProgFill, { width: `${pct}%`, backgroundColor: grp.color }]} />
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>

                      {/* Signature Card Box */}
                      <View style={[styles.signatureCardBox, { marginTop: 12 }]}>
                        {overview.today.signature ? (
                          <View style={styles.signedRow}>
                            <MaterialCommunityIcons
                              name={overview.today.signature.signature_status === 'approved' ? 'check-decagram' : 'alert-circle'}
                              size={24}
                              color={overview.today.signature.signature_status === 'approved' ? '#059669' : '#D97706'}
                            />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                              <Text style={styles.signedStatusTitle}>
                                {overview.today.signature.signature_status === 'approved'
                                  ? 'Telah Diparaf (Setuju & Terverifikasi)'
                                  : 'Klarifikasi Diajukan'}
                              </Text>
                              <Text style={styles.signedMetaText}>
                                {overview.today.signature.signed_at
                                  ? new Date(overview.today.signature.signed_at).toLocaleString('id-ID')
                                  : 'Waktu tercatat'}
                              </Text>
                              {overview.today.signature.comment && (
                                <Text style={styles.signedNotesText}>
                                  "{overview.today.signature.comment}"
                                </Text>
                              )}
                            </View>
                            <TouchableOpacity
                              style={styles.reSignButton}
                              onPress={() => setIsTableModalVisible(true)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.reSignButtonText}>Lihat Rekap / Ubah</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.unsignedContainer}>
                            <Text style={styles.unsignedDesc}>
                              Periksa seluruh rekapan agenda amalan hari ini sebelum memberikan paraf pengesahan atau mengajukan klarifikasi kepada sekolah.
                            </Text>
                            <TouchableOpacity
                              style={styles.signButton}
                              onPress={() => setIsTableModalVisible(true)}
                              activeOpacity={0.88}
                            >
                              <LinearGradient
                                colors={['#047857', '#059669']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.signButtonGradient}
                              >
                                <MaterialCommunityIcons name="table-headers-eye" size={19} color="#FFFFFF" />
                                <Text style={styles.signButtonText}>Lihat Rekapan & Beri Paraf</Text>
                                <MaterialCommunityIcons name="chevron-right" size={18} color="#FFFFFF" />
                              </LinearGradient>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}
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
      <StudentMonthlyReportModal
        visible={Boolean(selectedMonthlyStudent)}
        student={selectedMonthlyStudent}
        monthlyStats={monthlyStats}
        historyRows={historyRows}
        onClose={() => setSelectedMonthlyStudent(null)}
      />

      {/* ============================================================ */}
      {/* MODAL PICKER KALENDER (SCREEN 2) */}
      {/* ============================================================ */}
      <Modal
        visible={isCalendarPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsCalendarPickerVisible(false)}
      >
        <View style={styles.calendarModalOverlay}>
          <View style={styles.calendarModalContent}>
            <View style={styles.calendarModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.calendarHeaderIconBox}>
                  <MaterialCommunityIcons name="calendar-month" size={20} color="#059669" />
                </View>
                <View>
                  <Text style={styles.calendarModalTitle}>Pilih Tanggal Mutaba’ah</Text>
                  <Text style={styles.calendarModalSub}>
                    {formatDateIndo(selectedDate)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsCalendarPickerVisible(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <View style={styles.calendarQuickPresets}>
              <TouchableOpacity
                style={[styles.calendarPresetBtn, selectedDate === getLocalDateString() && styles.calendarPresetBtnActive]}
                onPress={() => {
                  setSelectedDate(getLocalDateString());
                  setIsCalendarPickerVisible(false);
                }}
              >
                <Text style={[styles.calendarPresetText, selectedDate === getLocalDateString() && styles.calendarPresetTextActive]}>
                  Hari Ini
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.calendarPresetBtn}
                onPress={() => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  setSelectedDate(getLocalDateString(yesterday));
                  setIsCalendarPickerVisible(false);
                }}
              >
                <Text style={styles.calendarPresetText}>Kemarin</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.calendarPresetBtn}
                onPress={() => {
                  const twoDaysAgo = new Date();
                  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
                  setSelectedDate(getLocalDateString(twoDaysAgo));
                  setIsCalendarPickerVisible(false);
                }}
              >
                <Text style={styles.calendarPresetText}>2 Hari Lalu</Text>
              </TouchableOpacity>
            </View>

            {/* Month Nav */}
            <View style={styles.calendarMonthNav}>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => {
                  const prevMonth = new Date(calendarMonth);
                  prevMonth.setMonth(prevMonth.getMonth() - 1);
                  setCalendarMonth(prevMonth);
                }}
              >
                <MaterialCommunityIcons name="chevron-left" size={22} color="#334155" />
              </TouchableOpacity>
              <Text style={styles.calendarMonthTitle}>
                {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(calendarMonth)}
              </Text>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => {
                  const nextMonth = new Date(calendarMonth);
                  nextMonth.setMonth(nextMonth.getMonth() + 1);
                  setCalendarMonth(nextMonth);
                }}
              >
                <MaterialCommunityIcons name="chevron-right" size={22} color="#334155" />
              </TouchableOpacity>
            </View>

            {/* Day Header */}
            <View style={styles.calendarDayHeaderRow}>
              {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d) => (
                <Text key={d} style={styles.calendarDayHeaderCol}>{d}</Text>
              ))}
            </View>

            {/* Day Grid */}
            <View style={styles.calendarGrid}>
              {calendarGridDays.map((item, idx) => {
                if (!item.dayNum) {
                  return <View key={`empty-${idx}`} style={styles.calendarGridCell} />;
                }
                return (
                  <TouchableOpacity
                    key={item.dateStr}
                    style={[
                      styles.calendarGridCell,
                      item.isSelected && styles.calendarGridCellActive,
                      item.isToday && !item.isSelected && styles.calendarGridCellToday,
                    ]}
                    onPress={() => {
                      setSelectedDate(item.dateStr);
                      setIsCalendarPickerVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.calendarGridDayText,
                        item.isSelected && styles.calendarGridDayTextActive,
                        item.isToday && !item.isSelected && styles.calendarGridDayTextToday,
                      ]}
                    >
                      {item.dayNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.calendarCloseDoneBtn}
              onPress={() => setIsCalendarPickerVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.calendarCloseDoneText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL INPUT SATUAN AMALAN SISWA (HANYA DATA YANG DI-KLIK) */}
      {/* ============================================================ */}
      <Modal
        visible={Boolean(singleEditItem)}
        animationType="slide"
        transparent
        onRequestClose={() => !singleSaving && setSingleEditItem(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { maxHeight: '92%', paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={20} color="#059669" />
                  <Text style={styles.modalTitle}>Input Amalan Siswa</Text>
                </View>
                <Text style={styles.modalSubtitle}>
                  {formatDateIndo(selectedDate)} · {activeStudentName}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => !singleSaving && setSingleEditItem(null)}
                disabled={singleSaving}
              >
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {singleEditItem && (
              <ScrollView
                ref={singleModalScrollRef}
                style={styles.modalBody}
                contentContainerStyle={{ paddingBottom: 36 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Kartu Detail Amalan yang Diklik */}
                <View style={styles.singleItemHeaderCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={styles.singleItemIconBox}>
                      <MaterialCommunityIcons
                        name={
                          (STATUS_CONFIG[singleStatus]?.icon as any) || 'check-circle-outline'
                        }
                        size={22}
                        color={STATUS_CONFIG[singleStatus]?.color || '#059669'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.singleItemTitle}>{singleEditItem.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Text style={styles.singleItemCategory}>{singleEditItem.category || 'Amalan'}</Text>
                        <View style={[styles.scopePill, styles.scopePillHome]}>
                          <Text style={[styles.scopePillText, styles.scopePillTextHome]}>🏠 Pembiasaan di Rumah</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Pemilih Status Pelaksanaan */}
                <Text style={styles.singleFieldLabel}>Status Pelaksanaan Hari Ini:</Text>
                <View style={styles.singleStatusGrid}>
                  {[
                    { key: 'good', label: 'Terlaksana', sub: 'Dilakukan dengan baik', color: '#059669', bg: '#D1FAE5', icon: 'check-circle' },
                    { key: 'less', label: 'Kurang', sub: 'Terlaksana sebagian / telat', color: '#D97706', bg: '#FEF3C7', icon: 'clock-alert-outline' },
                    { key: 'not_done', label: 'Belum', sub: 'Tidak dilaksanakan', color: '#E11D48', bg: '#FFE4E6', icon: 'close-circle' },
                    { key: 'na', label: 'Uzur / NA', sub: 'Sakit, safar, halangan syar’i', color: '#64748B', bg: '#F1F5F9', icon: 'minus-circle-outline' },
                  ].map((opt) => {
                    const isSelected = singleStatus === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.singleStatusCard,
                          isSelected && {
                            borderColor: opt.color,
                            backgroundColor: opt.bg,
                            borderWidth: 2,
                          },
                        ]}
                        onPress={() => setSingleStatus(opt.key)}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons
                          name={opt.icon as any}
                          size={20}
                          color={isSelected ? opt.color : '#94A3B8'}
                        />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text
                            style={[
                              styles.singleStatusTitle,
                              isSelected && { color: opt.color, fontWeight: '800' },
                            ]}
                          >
                            {opt.label}
                          </Text>
                          <Text style={styles.singleStatusSub} numberOfLines={1}>{opt.sub}</Text>
                        </View>
                        {isSelected && (
                          <MaterialCommunityIcons name="check-bold" size={16} color={opt.color} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {isQuranItem(singleEditItem) && (
                  <View style={styles.singleQuranTipBox}>
                    <MaterialCommunityIcons name="information-outline" size={16} color="#059669" />
                    <Text style={styles.singleQuranTipText}>
                      Pengisian di sini mencatat pembiasaan tilawah harian. Untuk setoran hafalan baru per ayat atau rekaman audio, gunakan <Text style={{ fontWeight: '800' }}>Modul Tahfizh</Text>.
                    </Text>
                  </View>
                )}

                {/* Catatan / Keterangan Tambahan Orang Tua */}
                <Text style={[styles.singleFieldLabel, { marginTop: 14 }]}>
                  Catatan Tambahan Orang Tua (Opsional):
                </Text>
                <TextInput
                  style={styles.singleNotesInput}
                  placeholder="Tuliskan keterangan detail (misal: sholat berjamaah di masjid, hafalan lancar, dsb)..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  value={singleNotes}
                  onChangeText={setSingleNotes}
                  onFocus={() => {
                    setTimeout(() => {
                      singleModalScrollRef.current?.scrollToEnd({ animated: true });
                    }, 150);
                  }}
                />

                {/* Info Verifikasi Pembimbing */}
                <View style={styles.singleInfoNotice}>
                  <MaterialCommunityIcons name="shield-check-outline" size={17} color="#059669" />
                  <Text style={styles.singleInfoNoticeText}>
                    Data amalan ini akan langsung masuk ke rekapan mutaba’ah ananda dan siap diverifikasi oleh ustadz/pembimbing.
                  </Text>
                </View>

                {/* Tombol Simpan & Batal */}
                <View style={styles.singleActionRow}>
                  <TouchableOpacity
                    style={styles.singleCancelBtn}
                    onPress={() => setSingleEditItem(null)}
                    disabled={singleSaving}
                  >
                    <Text style={styles.singleCancelText}>Batal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.singleSaveBtn}
                    onPress={handleSaveSingleItem}
                    disabled={singleSaving}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={['#047857', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.singleSaveGradient}
                    >
                      {singleSaving ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="content-save-check-outline" size={18} color="#FFFFFF" />
                          <Text style={styles.singleSaveText}>Simpan Amalan</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL INPUT IBADAH RUMAH (BOTTOM SHEET) */}
      {/* ============================================================ */}
      <Modal
        visible={isWorshipModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeWorshipModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Input Ibadah di Rumah</Text>
                <Text style={styles.modalSubtitle}>
                  {formatDateIndo(selectedDate)} · {worshipContext?.student?.name || 'Ananda'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={closeWorshipModal}
              >
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {worshipLoading ? (
              <ActivityIndicator color="#18A165" style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView
                ref={worshipModalScrollRef}
                style={styles.modalBody}
                contentContainerStyle={{ paddingBottom: 36 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {worshipContext?.can_edit === false ? (
                  <View style={styles.warningBox}>
                    <MaterialCommunityIcons name="lock-outline" size={20} color="#D97706" />
                    <Text style={styles.warningText}>
                      Data pada tanggal ini telah difinalisasi oleh pembimbing dan tidak dapat diubah lagi.
                    </Text>
                  </View>
                ) : null}

                {(!worshipContext?.items || worshipContext.items.length === 0) ? (
                  <View style={styles.emptyCard}>
                    <MaterialCommunityIcons name="clipboard-check-outline" size={38} color="#94A3B8" />
                    <Text style={styles.emptyTitle}>Tidak Ada Tugas Rumah</Text>
                    <Text style={styles.emptyDesc}>
                      Tidak ada agenda ibadah rumah yang ditugaskan kepada orang tua pada tanggal ini.
                    </Text>
                  </View>
                ) : (
                  sortedWorshipItems.map((item: any) => {
                    const currentVal = worshipValues[item.agenda_item_id];
                    const isHighlighted = highlightAgendaId === item.agenda_item_id;
                    return (
                      <View
                        key={item.agenda_item_id}
                        style={[
                          styles.formItemCard,
                          isHighlighted && styles.formItemCardHighlighted,
                        ]}
                      >
                        {isHighlighted && (
                          <View style={styles.highlightBadge}>
                            <MaterialCommunityIcons name="star-check" size={15} color="#065F46" />
                            <Text style={styles.highlightBadgeText}>Amalan Dipilih dari Checklist</Text>
                          </View>
                        )}
                        <Text style={[styles.formItemTitle, isHighlighted && styles.formItemTitleHighlighted]}>
                          {item.name}
                        </Text>
                        <Text style={styles.formItemSub}>
                          Lokasi: {item.location || 'rumah'} {item.requires_verification ? '· Perlu verifikasi pembimbing' : ''}
                        </Text>

                        {/* Pilihan Baik, Kurang, Belum, Uzur */}
                        <View style={styles.formOptionsRow}>
                          {[
                            { key: 'good', label: 'Terlaksana', color: '#059669', bg: '#D1FAE5' },
                            { key: 'less', label: 'Kurang', color: '#D97706', bg: '#FEF3C7' },
                            { key: 'not_done', label: 'Belum', color: '#E11D48', bg: '#FFE4E6' },
                            { key: 'na', label: 'Uzur / NA', color: '#64748B', bg: '#F1F5F9' },
                          ].map((opt) => {
                            const isSelected = currentVal === opt.key;
                            return (
                              <TouchableOpacity
                                key={opt.key}
                                onPress={() =>
                                  setWorshipValues((prev) => ({
                                    ...prev,
                                    [item.agenda_item_id]: opt.key,
                                  }))
                                }
                                style={[
                                  styles.formOptBtn,
                                  isSelected && { backgroundColor: opt.color, borderColor: opt.color },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.formOptBtnText,
                                    isSelected && { color: '#FFFFFF', fontWeight: '800' },
                                  ]}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* Catatan Tambahan */}
                        <TextInput
                          style={styles.formNotesInput}
                          placeholder="Catatan tambahan (opsional)..."
                          placeholderTextColor="#94A3B8"
                          value={worshipNotes[item.agenda_item_id] || ''}
                          onChangeText={(text) =>
                            setWorshipNotes((prev) => ({
                              ...prev,
                              [item.agenda_item_id]: text,
                            }))
                          }
                          onFocus={() => {
                            setTimeout(() => {
                              worshipModalScrollRef.current?.scrollToEnd({ animated: true });
                            }, 150);
                          }}
                        />
                      </View>
                    );
                  })
                )}

                {worshipContext?.items?.length > 0 && worshipContext?.can_edit !== false && (
                  <TouchableOpacity
                    style={styles.modalSaveBtn}
                    onPress={handleSaveWorship}
                    disabled={worshipSubmitting}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={['#0D6B42', '#18A165']}
                      style={styles.modalSaveGradient}
                    >
                      {worshipSubmitting ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="content-save-outline" size={20} color="#FFFFFF" />
                          <Text style={styles.modalSaveText}>Simpan Mutaba’ah Rumah</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL PARAF & PENGESAHAN ORANG TUA */}
      {/* ============================================================ */}
      <Modal
        visible={isSignModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsSignModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { maxHeight: '92%', paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Paraf & Tanda Tangan Orang Tua</Text>
                <Text style={styles.modalSubtitle}>
                  Konfirmasi pengawasan ibadah ananda untuk tanggal {formatDateIndo(selectedDate)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsSignModalVisible(false)}
              >
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={signModalScrollRef}
              style={styles.modalBody}
              contentContainerStyle={{ paddingBottom: 36 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.signPrompt}>Pilih status konfirmasi paraf:</Text>
              <View style={styles.signChoiceCol}>
                {[
                  {
                    key: 'approved',
                    label: 'Paraf Setuju & Terverifikasi',
                    desc: 'Saya telah memeriksa dan menyetujui seluruh laporan amalan ananda.',
                    color: '#059669',
                    icon: 'check-decagram-outline',
                  },
                  {
                    key: 'clarification_requested',
                    label: 'Minta Klarifikasi Pembimbing',
                    desc: 'Ada butir aktivitas yang ingin saya tanyakan atau diskusikan dengan ustadz/pembimbing.',
                    color: '#D97706',
                    icon: 'comment-question-outline',
                  },
                  {
                    key: 'unable_to_verify',
                    label: 'Belum Dapat Memverifikasi',
                    desc: 'Santri sedang berada di luar jangkauan pengawasan wali murid pada tanggal ini.',
                    color: '#64748B',
                    icon: 'eye-off-outline',
                  },
                ].map((choice) => {
                  const isSelected = signStatus === choice.key;
                  return (
                    <TouchableOpacity
                      key={choice.key}
                      onPress={() => setSignStatus(choice.key as any)}
                      style={[
                        styles.signChoiceCard,
                        isSelected && { borderColor: choice.color, backgroundColor: `${choice.color}10` },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={choice.icon as any}
                        size={24}
                        color={isSelected ? choice.color : '#94A3B8'}
                      />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.signChoiceTitle, isSelected && { color: choice.color, fontWeight: '800' }]}>
                          {choice.label}
                        </Text>
                        <Text style={styles.signChoiceDesc}>{choice.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Pratinjau Ringkas Tabel Kegiatan yang Diparaf */}
              <View style={styles.modalTablePreviewBox}>
                <View style={styles.modalTablePreviewHeader}>
                  <MaterialCommunityIcons name="clipboard-list-outline" size={17} color="#059669" />
                  <Text style={styles.modalTablePreviewTitle}>
                    Ringkasan {details.length} Data Kegiatan yang Diparaf
                  </Text>
                </View>
                <View style={styles.modalTablePreviewContent}>
                  {details.slice(0, 6).map((item: any, idx: number) => {
                    const statusInfo = STATUS_CONFIG[item.status_value] || STATUS_CONFIG.unfilled;
                    const isItemHome = item.scope === 'home' || item.input_location === 'home' || item.is_parent_item;
                    return (
                      <View key={item.id || item.agenda_item_id || idx} style={styles.modalTableRow}>
                        <Text style={styles.modalTableCellNum}>{idx + 1}.</Text>
                        <Text style={styles.modalTableCellName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.modalTableCellLoc}>
                          {isItemHome ? 'Rumah' : isBoarding ? 'Asrama' : 'Sekolah'}
                        </Text>
                        <View style={[styles.modalTableStatusBadge, { backgroundColor: statusInfo.bg }]}>
                          <Text style={[styles.modalTableStatusText, { color: statusInfo.color }]}>
                            {statusInfo.label}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  {details.length > 6 && (
                    <Text style={styles.modalTableMoreText}>
                      +{details.length - 6} kegiatan lainnya tercatat lengkap
                    </Text>
                  )}
                </View>
              </View>

              <Text style={[styles.signPrompt, { marginTop: 16 }]}>Catatan atau Pesan untuk Sekolah (Opsional):</Text>
              <TextInput
                style={styles.signCommentInput}
                placeholder="Tuliskan catatan, klarifikasi, atau evaluasi pembinaan ananda..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={signComment}
                onChangeText={setSignComment}
                onFocus={() => {
                  setTimeout(() => {
                    signModalScrollRef.current?.scrollToEnd({ animated: true });
                  }, 150);
                }}
              />

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveSignature}
                disabled={signSubmitting}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#0D6B42', '#18A165']}
                  style={styles.modalSaveGradient}
                >
                  {signSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="draw" size={20} color="#FFFFFF" />
                      <Text style={styles.modalSaveText}>Kirim Paraf Resmi</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL RINCIAN TABEL KEGIATAN SISWA (UKURAN BESAR & LEGA) */}
      {/* ============================================================ */}
      <Modal
        visible={isTableModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsTableModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '92%', paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="table-large" size={22} color="#059669" />
                  <Text style={styles.modalTitle}>Tabel Kegiatan & Amalan</Text>
                </View>
                <Text style={styles.modalSubtitle}>
                  {formatDateIndo(selectedDate)} · {activeStudentName} ({details.length} Butir)
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsTableModalVisible(false)}
              >
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Scope Tabs di dalam Modal */}
            {!isBoarding && (
              <View style={[styles.scopeTabsContainer, { marginHorizontal: 16, marginTop: 4, marginBottom: 8 }]}>
                <TouchableOpacity
                  style={[styles.scopeTabBtn, modalTableScopeTab === 'all' && styles.scopeTabBtnActive]}
                  onPress={() => setModalTableScopeTab('all')}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name="layers-outline"
                    size={17}
                    color={modalTableScopeTab === 'all' ? '#FFFFFF' : '#64748B'}
                  />
                  <Text style={[styles.scopeTabBtnText, modalTableScopeTab === 'all' && styles.scopeTabBtnTextActive]}>
                    Semua ({details.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.scopeTabBtn, modalTableScopeTab === 'home' && styles.scopeTabBtnActive]}
                  onPress={() => setModalTableScopeTab('home')}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name="home-heart"
                    size={17}
                    color={modalTableScopeTab === 'home' ? '#FFFFFF' : '#64748B'}
                  />
                  <Text style={[styles.scopeTabBtnText, modalTableScopeTab === 'home' && styles.scopeTabBtnTextActive]}>
                    Rumah ({homeDetails.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.scopeTabBtn, modalTableScopeTab === 'school' && styles.scopeTabBtnActive]}
                  onPress={() => setModalTableScopeTab('school')}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name="school-outline"
                    size={17}
                    color={modalTableScopeTab === 'school' ? '#FFFFFF' : '#64748B'}
                  />
                  <Text style={[styles.scopeTabBtnText, modalTableScopeTab === 'school' && styles.scopeTabBtnTextActive]}>
                    Sekolah ({schoolDetails.length})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView style={[styles.modalBody, { paddingHorizontal: 16 }]} showsVerticalScrollIndicator={false}>
              {/* Summary Counter Bar Besar di Modal */}
              <View style={[styles.rekapSummaryBar, { paddingVertical: 10, marginVertical: 6 }]}>
                <View style={styles.rekapSummaryItem}>
                  <Text style={[styles.rekapSummaryVal, { fontSize: 16 }]}>{details.length}</Text>
                  <Text style={[styles.rekapSummaryLbl, { fontSize: 11 }]}>Total</Text>
                </View>
                <View style={styles.rekapSummaryDivider} />
                <View style={styles.rekapSummaryItem}>
                  <Text style={[styles.rekapSummaryVal, { fontSize: 16, color: '#059669' }]}>
                    {overview?.today?.good_count ?? details.filter((d: any) => d.status_value === 'good').length}
                  </Text>
                  <Text style={[styles.rekapSummaryLbl, { fontSize: 11, color: '#059669' }]}>Terlaksana</Text>
                </View>
                <View style={styles.rekapSummaryDivider} />
                <View style={styles.rekapSummaryItem}>
                  <Text style={[styles.rekapSummaryVal, { fontSize: 16, color: '#D97706' }]}>
                    {overview?.today?.less_count ?? details.filter((d: any) => d.status_value === 'less').length}
                  </Text>
                  <Text style={[styles.rekapSummaryLbl, { fontSize: 11, color: '#D97706' }]}>Kurang</Text>
                </View>
                <View style={styles.rekapSummaryDivider} />
                <View style={styles.rekapSummaryItem}>
                  <Text style={[styles.rekapSummaryVal, { fontSize: 16, color: '#E11D48' }]}>
                    {overview?.today?.not_done_count ?? details.filter((d: any) => d.status_value === 'not_done').length}
                  </Text>
                  <Text style={[styles.rekapSummaryLbl, { fontSize: 11, color: '#E11D48' }]}>Belum</Text>
                </View>
                <View style={styles.rekapSummaryDivider} />
                <View style={styles.rekapSummaryItem}>
                  <Text style={[styles.rekapSummaryVal, { fontSize: 16, color: '#64748B' }]}>
                    {overview?.today?.na_count ?? details.filter((d: any) => d.status_value === 'na').length}
                  </Text>
                  <Text style={[styles.rekapSummaryLbl, { fontSize: 11, color: '#64748B' }]}>Uzur</Text>
                </View>
              </View>

              {/* Daftar Butir dengan Ukuran Teks Besar & Lega */}
              {isFetchingDate && modalFilteredDetails.length === 0 ? (
                <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="large" color="#059669" />
                  <Text style={{ marginTop: 12, color: '#64748B', fontSize: 13, fontWeight: '600' }}>
                    Memuat lembar Mutaba’ah...
                  </Text>
                </View>
              ) : modalFilteredDetails.length === 0 ? (
                <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="book-open-page-variant-outline" size={42} color="#94A3B8" />
                  <Text style={{ marginTop: 10, color: '#475569', fontSize: 14, fontWeight: '700' }}>
                    Belum Ada Data Amalan
                  </Text>
                  <Text style={{ marginTop: 4, color: '#94A3B8', fontSize: 12, textAlign: 'center', paddingHorizontal: 24 }}>
                    Catatan amalan pada tanggal ini belum diisi atau belum tersedia.
                  </Text>
                </View>
              ) : (
                modalFilteredDetails.map((item: any, idx: number) => {
                  const isItemHome = item.scope === 'home' || item.input_location === 'home' || item.is_parent_item;
                  const canParentEditThis = isItemHome && isParent && !isBoarding;
                  const isStaffFilled = !isItemHome && Boolean(item.input_source && item.input_source !== 'system' && item.status_value);
                  const hasValue = isItemHome
                    ? Boolean(item.status_value && item.input_source === 'parent')
                    : isStaffFilled;
                  const statusInfo = (hasValue && STATUS_CONFIG[item.status_value])
                    ? STATUS_CONFIG[item.status_value]
                    : (!isItemHome
                        ? { label: 'Belum Diisi', color: '#64748B', bg: '#F1F5F9', icon: 'minus-circle-outline' }
                        : STATUS_CONFIG.unfilled);
                  return (
                    <TouchableOpacity
                      key={item.id || item.agenda_item_id || idx}
                      style={styles.modalBigCardRow}
                      activeOpacity={canParentEditThis ? 0.75 : 1}
                      onPress={() => {
                        if (canParentEditThis) {
                          setIsTableModalVisible(false);
                          setSingleEditItem(item);
                          setSingleStatus(item.status_value && item.status_value !== 'na' ? item.status_value : 'good');
                          setSingleNotes(item.notes || '');
                        }
                      }}
                    >
                      <View style={styles.modalBigCardTop}>
                        <View style={styles.modalBigCardNumBox}>
                          <Text style={styles.modalBigCardNumText}>{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.modalBigCardTitle}>{item.name}</Text>
                          <View style={{ alignItems: 'flex-start', gap: 3, marginTop: 4 }}>
                            <Text style={styles.modalBigCardCategory}>{item.category || 'Amalan'}</Text>
                            <View
                              style={[
                                styles.scopePill,
                                styles.scopePillAligned,
                                isItemHome
                                  ? styles.scopePillHome
                                  : (isBoarding || item.scope === 'boarding')
                                    ? styles.scopePillBoarding
                                    : styles.scopePillSchool,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.scopePillText,
                                  isItemHome
                                    ? styles.scopePillTextHome
                                    : (isBoarding || item.scope === 'boarding')
                                      ? styles.scopePillTextBoarding
                                      : styles.scopePillTextSchool,
                                ]}
                              >
                                {isItemHome
                                  ? '🏠 Di Rumah'
                                  : (isBoarding || item.scope === 'boarding')
                                    ? '🕌 Di Asrama'
                                    : '🏫 Di Sekolah'}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View style={[styles.rekapCellBadgeStatus, { backgroundColor: statusInfo.bg, minWidth: 86, paddingVertical: 5 }]}>
                          <Text style={[styles.rekapCellBadgeStatusText, { color: statusInfo.color, fontSize: 11 }]}>
                            {statusInfo.label}
                          </Text>
                        </View>
                      </View>

                      {item.notes ? (
                        <View style={styles.modalBigCardNotesBox}>
                          <MaterialCommunityIcons name="comment-text-outline" size={14} color="#64748B" />
                          <Text style={styles.modalBigCardNotesText}>Catatan: {item.notes}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalBottomActions}>
              <TouchableOpacity
                style={styles.modalCloseFooterBtn}
                onPress={() => setIsTableModalVisible(false)}
              >
                <Text style={styles.modalCloseFooterText}>Tutup</Text>
              </TouchableOpacity>
              {isParent && (
                <TouchableOpacity
                  style={styles.modalSignProceedBtn}
                  onPress={() => {
                    setIsTableModalVisible(false);
                    setIsSignModalVisible(true);
                  }}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={['#047857', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalSignProceedGradient}
                  >
                    <MaterialCommunityIcons name="draw" size={18} color="#FFFFFF" />
                    <Text style={styles.modalSignProceedText}>
                      {overview?.today?.signature ? 'Ubah / Perbarui Paraf' : 'Beri Paraf Sekarang'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* TAILGRIDS FEEDBACK MODAL (SUCCESS, ERROR, WARNING & INFO) */}
      {/* ============================================================ */}
      <Modal
        visible={Boolean(feedbackModal?.visible)}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackModal(null)}
      >
        <View style={styles.feedbackOverlay}>
          <View
            style={[
              styles.feedbackCard,
              feedbackModal?.type === 'error' && styles.feedbackCardError,
              feedbackModal?.type === 'warning' && styles.feedbackCardWarning,
              feedbackModal?.type === 'info' && styles.feedbackCardInfo,
              feedbackModal?.type === 'success' && styles.feedbackCardSuccess,
            ]}
          >
            {/* Top Glow & Accent Line */}
            <View
              style={[
                styles.feedbackAccentLine,
                feedbackModal?.type === 'error' && styles.feedbackAccentLineError,
                feedbackModal?.type === 'warning' && styles.feedbackAccentLineWarning,
                feedbackModal?.type === 'info' && styles.feedbackAccentLineInfo,
                feedbackModal?.type === 'success' && styles.feedbackAccentLineSuccess,
              ]}
            />

            {/* Squircle Icon Badge */}
            <View
              style={[
                styles.feedbackIconBadge,
                feedbackModal?.type === 'error' && styles.feedbackIconBadgeError,
                feedbackModal?.type === 'warning' && styles.feedbackIconBadgeWarning,
                feedbackModal?.type === 'info' && styles.feedbackIconBadgeInfo,
                feedbackModal?.type === 'success' && styles.feedbackIconBadgeSuccess,
              ]}
            >
              <MaterialCommunityIcons
                name={
                  (feedbackModal?.icon as any) ||
                  (feedbackModal?.type === 'error'
                    ? 'alert-circle-outline'
                    : feedbackModal?.type === 'warning'
                      ? 'alert-rhombus-outline'
                      : feedbackModal?.type === 'info'
                        ? 'information-outline'
                        : 'check-decagram')
                }
                size={38}
                color={
                  feedbackModal?.type === 'error'
                    ? '#E11D48'
                    : feedbackModal?.type === 'warning'
                      ? '#D97706'
                      : feedbackModal?.type === 'info'
                        ? '#0284C7'
                        : '#059669'
                }
              />
            </View>

            {/* Pill Type Tag */}
            <View
              style={[
                styles.feedbackTypePill,
                feedbackModal?.type === 'error' && styles.feedbackTypePillError,
                feedbackModal?.type === 'warning' && styles.feedbackTypePillWarning,
                feedbackModal?.type === 'info' && styles.feedbackTypePillInfo,
                feedbackModal?.type === 'success' && styles.feedbackTypePillSuccess,
              ]}
            >
              <Text
                style={[
                  styles.feedbackTypePillText,
                  feedbackModal?.type === 'error' && styles.feedbackTypePillTextError,
                  feedbackModal?.type === 'warning' && styles.feedbackTypePillTextWarning,
                  feedbackModal?.type === 'info' && styles.feedbackTypePillTextInfo,
                  feedbackModal?.type === 'success' && styles.feedbackTypePillTextSuccess,
                ]}
              >
                {feedbackModal?.type === 'error'
                  ? 'Pemberitahuan Kendala'
                  : feedbackModal?.type === 'warning'
                    ? 'Perhatian Khusus'
                    : feedbackModal?.type === 'info'
                      ? 'Informasi Amalan'
                      : 'Berhasil Disimpan'}
              </Text>
            </View>

            {/* Title & Message */}
            <Text style={styles.feedbackTitle}>{feedbackModal?.title}</Text>
            <Text style={styles.feedbackMessage}>{feedbackModal?.message}</Text>

            {/* Item Details Summary (jika butir amalan / kontekstual) */}
            {feedbackModal?.itemName ? (
              <View style={styles.feedbackItemSummary}>
                <View style={styles.feedbackItemRow}>
                  <MaterialCommunityIcons
                    name="book-check-outline"
                    size={18}
                    color={
                      feedbackModal?.type === 'error'
                        ? '#E11D48'
                        : feedbackModal?.type === 'warning'
                          ? '#D97706'
                          : feedbackModal?.type === 'info'
                            ? '#0284C7'
                            : '#059669'
                    }
                  />
                  <Text style={styles.feedbackItemName} numberOfLines={1}>
                    {feedbackModal.itemName}
                  </Text>
                </View>
                <View style={styles.feedbackItemMetaRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {feedbackModal.statusLabel && (
                      <View
                        style={[
                          styles.feedbackStatusBadge,
                          {
                            backgroundColor: feedbackModal.statusColor
                              ? `${feedbackModal.statusColor}18`
                              : '#D1FAE5',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.feedbackStatusBadgeText,
                            {
                              color: feedbackModal.statusColor || '#059669',
                            },
                          ]}
                        >
                          {feedbackModal.statusLabel}
                        </Text>
                      </View>
                    )}
                    {feedbackModal.category && (
                      <View style={styles.feedbackCategoryBadge}>
                        <Text style={styles.feedbackCategoryBadgeText}>{feedbackModal.category}</Text>
                      </View>
                    )}
                    {feedbackModal.locationTag && (
                      <View style={styles.feedbackLocationBadge}>
                        <MaterialCommunityIcons name="map-marker-outline" size={11} color="#64748B" />
                        <Text style={styles.feedbackLocationBadgeText}>{feedbackModal.locationTag}</Text>
                      </View>
                    )}
                  </View>
                  {feedbackModal.dateStr && (
                    <Text style={styles.feedbackDateText}>
                      📅 {feedbackModal.dateStr}
                    </Text>
                  )}
                </View>
                {feedbackModal.notes ? (
                  <View style={styles.feedbackNotesQuote}>
                    <MaterialCommunityIcons name="comment-text-outline" size={13} color="#64748B" />
                    <Text style={styles.feedbackNotesQuoteText} numberOfLines={2}>
                      "{feedbackModal.notes}"
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : feedbackModal?.dateStr ? (
              <View style={styles.feedbackDateChip}>
                <MaterialCommunityIcons name="calendar-check" size={15} color="#059669" />
                <Text style={styles.feedbackDateChipText}>{feedbackModal.dateStr}</Text>
              </View>
            ) : null}

            {/* Action Button */}
            <TouchableOpacity
              style={styles.feedbackActionBtn}
              onPress={() => setFeedbackModal(null)}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={
                  feedbackModal?.type === 'error'
                    ? ['#BE123C', '#E11D48']
                    : feedbackModal?.type === 'warning'
                      ? ['#B45309', '#D97706']
                      : feedbackModal?.type === 'info'
                        ? ['#0369A1', '#0284C7']
                        : ['#047857', '#059669']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.feedbackActionGradient}
              >
                <MaterialCommunityIcons
                  name={
                    feedbackModal?.type === 'error'
                      ? 'close-circle-outline'
                      : feedbackModal?.type === 'warning'
                        ? 'alert-outline'
                        : feedbackModal?.type === 'info'
                          ? 'information'
                          : 'check'
                  }
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.feedbackActionText}>
                  {feedbackModal?.actionLabel ||
                    (feedbackModal?.type === 'error'
                      ? 'Tutup & Periksa Kembali'
                      : feedbackModal?.type === 'warning'
                        ? 'Mengerti'
                        : feedbackModal?.type === 'info'
                          ? 'Tutup'
                          : 'Alhamdulillah, Selesai')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
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
    marginBottom: 8, // Jarak rapat, proporsional, dan rapi ke kontainer/ringkasan berikutnya
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
  itemCountText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
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
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
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
    marginTop: 2,
    fontFamily: 'Nunito_600SemiBold',
  },
  studentNisText: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 2,
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
    marginTop: 4,
  },
  studentUnitBadgeInactive: {
    backgroundColor: '#E7F7EF',
    borderColor: '#A7F3D0',
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
    backgroundColor: '#F1F5F9',
    elevation: 1,
  },
  selectedActionBtnText: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#059669',
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

  /* ============================================================ */
  /* KONTROL TANGGAL & TAB TOGGLE */
  /* ============================================================ */
  dateControlCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 12,
  },
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    gap: 6,
  },
  tabToggleBtnActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabToggleText: {
    fontSize: 12,
    fontFamily: 'Nunito_700Bold',
    fontWeight: '700',
    color: '#64748B',
  },
  tabToggleTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  datePresetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  dateChip: {
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateChipActive: {
    backgroundColor: '#047857',
    borderColor: '#047857',
  },
  dateChipText: {
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
    fontWeight: '700',
    color: '#64748B',
  },
  dateChipTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
  },
  dateDisplayBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  dateDisplayText: {
    fontSize: 11.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#047857',
  },

  /* ============================================================ */
  /* CAPAIAN & EVALUASI CARD */
  /* ============================================================ */
  evaluationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  evalTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  evalBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  programPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  programPillText: {
    fontSize: 10.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    gap: 4,
  },
  locationPillText: {
    fontSize: 10.5,
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '600',
  },
  kpiMainGrid: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 12,
  },
  scoreHeroBox: {
    width: 96,
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  scoreHeroVal: {
    fontSize: 26,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    color: '#047857',
  },
  scoreHeroLabel: {
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },
  kpiCountersWrap: {
    flex: 1,
  },
  kpiCounterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiCounterItem: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  kpiCounterVal: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
  },
  kpiCounterLabel: {
    fontSize: 9.5,
    fontFamily: 'Nunito_700Bold',
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },
  averagesRow: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 12,
  },
  averageCol: {
    flex: 1,
  },
  averageMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  averageLabel: {
    fontSize: 10.5,
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '600',
    color: '#64748B',
  },
  averageVal: {
    fontSize: 11.5,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    color: '#0F172A',
  },
  barTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 4,
  },

  /* ============================================================ */
  /* INPUT RUMAH CALLOUT */
  /* ============================================================ */
  homeActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 12,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  homeActionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  homeActionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  homeActionTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#0F172A',
  },
  homeActionDesc: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14.5,
    fontFamily: 'Nunito_600SemiBold',
  },
  homeActionBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  homeActionBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 5,
  },
  homeActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },

  /* ============================================================ */
  /* NOTES BOX */
  /* ============================================================ */
  notesBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  notesText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
    fontFamily: 'Nunito_600SemiBold',
  },

  /* ============================================================ */
  /* PARAF ORANG TUA BOX */
  /* ============================================================ */
  signatureCardBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  signedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  signedStatusTitle: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#065F46',
  },
  signedMetaText: {
    fontSize: 10,
    color: '#059669',
    marginTop: 1,
    fontFamily: 'Nunito_600SemiBold',
  },
  signedNotesText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#334155',
    marginTop: 3,
    fontFamily: 'Nunito_600SemiBold',
  },
  reSignButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  reSignButtonText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#475569',
  },
  unsignedContainer: {
    gap: 12,
  },
  unsignedDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    fontFamily: 'Nunito_600SemiBold',
  },
  signButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  signButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  signButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },

  /* ============================================================ */
  /* DAFTAR CHECKLIST & KATEGORI */
  /* ============================================================ */
  categoryChipsScroll: {
    gap: 8,
    paddingBottom: 10,
  },
  categoryChipItem: {
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipItemActive: {
    backgroundColor: '#047857',
    borderColor: '#047857',
  },
  categoryChipItemText: {
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
    fontWeight: '700',
    color: '#64748B',
  },
  categoryChipItemTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
  },
  agendaItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  agendaItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agendaStatusIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agendaCatText: {
    fontSize: 9.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  agendaLocText: {
    fontSize: 9.5,
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '600',
  },
  agendaTitleText: {
    fontSize: 13.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  agendaNotesText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontFamily: 'Nunito_600SemiBold',
  },
  agendaBadgePill: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 10,
    marginLeft: 8,
  },
  agendaBadgePillText: {
    fontSize: 10.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  agendaItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    gap: 4,
  },
  agendaItemFooterText: {
    fontSize: 10,
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
  },
  agendaItemCardClickable: {
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  agendaTapActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 3,
  },
  agendaTapActionText: {
    fontSize: 10.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '800',
    color: '#065F46',
  },
  agendaTapHintText: {
    fontSize: 10.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#059669',
  },

  /* ============================================================ */
  /* EMPTY & ERROR STATES */
  /* ============================================================ */
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginVertical: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  emptyIconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyPillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginBottom: 6,
  },
  emptyPillBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  emptyTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
    maxWidth: '92%',
  },
  emptyActionBtn: {
    marginTop: 14,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  emptyActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  emptyActionBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  errorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    marginVertical: 8,
    shadowColor: '#E11D48',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  errorIconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  errorPillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#FFE4E6',
    marginBottom: 6,
  },
  errorPillBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#BE123C',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
    textAlign: 'center',
  },
  errorDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: '92%',
  },
  errorRetryBtn: {
    marginTop: 14,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#E11D48',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  errorRetryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 8,
  },
  errorRetryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },

  /* ============================================================ */
  /* RIWAYAT CARDS */
  /* ============================================================ */
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyDate: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  historySub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  historyScoreBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  historyScoreVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  historyScoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0D6B42',
  },
  historyStatsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  historyStatPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyStatText: {
    fontSize: 10,
    fontWeight: '700',
  },
  historyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  historySignStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  historySignText: {
    fontSize: 11,
    color: '#64748B',
  },
  historyDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  historyDetailBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },

  /* ============================================================ */
  /* MODAL STYLES */
  /* ============================================================ */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubtitle: {
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
  modalBody: {
    padding: 16,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 8,
    marginBottom: 14,
  },
  warningText: {
    flex: 1,
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
  formItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  formItemCardHighlighted: {
    borderColor: '#059669',
    borderWidth: 2,
    backgroundColor: '#F0FDF4',
    shadowColor: '#059669',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  highlightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 8,
    gap: 5,
  },
  highlightBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  formItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  formItemTitleHighlighted: {
    color: '#065F46',
    fontWeight: '900',
  },
  formItemSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 10,
  },
  formOptionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  formOptBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formOptBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  formNotesInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    color: '#0F172A',
    marginTop: 10,
  },
  modalSaveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#0D6B42',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  modalSaveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  signPrompt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8,
  },
  signChoiceCol: {
    gap: 8,
  },
  signChoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  signChoiceTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  signChoiceDesc: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14,
  },
  signCommentInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 12,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 70,
    marginBottom: 16,
  },
  boardingBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    shadowColor: '#0D9488',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  boardingBannerIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardingBannerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F766E',
  },
  boardingBannerDesc: {
    fontSize: 11,
    color: '#134E4A',
    lineHeight: 16,
    marginTop: 3,
  },
  scopeTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginVertical: 12,
    gap: 4,
  },
  scopeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    gap: 5,
  },
  scopeTabBtnActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  scopeTabBtnText: {
    fontSize: 12,
    fontFamily: 'Nunito_700Bold',
    fontWeight: '700',
    color: '#64748B',
  },
  scopeTabBtnTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  scopeTabCountPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  scopeTabCountPillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  scopeTabCountText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
  },
  scopeTabCountTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  scopePill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginLeft: 6,
  },
  scopePillHome: {
    backgroundColor: '#FEF3C7',
  },
  scopePillSchool: {
    backgroundColor: '#ECFDF5',
  },
  scopePillBoarding: {
    backgroundColor: '#F0FDFA',
  },
  scopePillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  scopePillTextHome: {
    color: '#B45309',
  },
  scopePillTextSchool: {
    color: '#059669',
  },
  scopePillTextBoarding: {
    color: '#0D9488',
  },

  /* ============================================================ */
  /* TABEL REKAPITULASI KEGIATAN SEBELUM DIPARAF */
  /* ============================================================ */
  rekapTableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rekapTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rekapTableTitle: {
    fontSize: 14.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#0F172A',
  },
  openTableModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    gap: 4,
  },
  openTableModalBtnText: {
    fontSize: 11.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#065F46',
  },
  rekapTableSubCount: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  rekapSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rekapSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  rekapSummaryVal: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '800',
    color: '#0F172A',
  },
  rekapSummaryLbl: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: '#64748B',
    marginTop: 1,
  },
  rekapSummaryDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#CBD5E1',
  },
  rekapTableGridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  rekapColHeader: {
    fontSize: 11.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  rekapTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  rekapCellNum: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  rekapCellTitle: {
    fontSize: 13.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 18,
  },
  rekapCellCat: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: '#059669',
    marginTop: 2,
  },
  rekapCellNotes: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 2,
  },
  rekapCellBadgeLoc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rekapCellBadgeLocText: {
    fontSize: 10.5,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    textAlign: 'center',
  },
  rekapCellBadgeStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 74,
    alignItems: 'center',
  },
  rekapCellBadgeStatusText: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  rekapTableEmpty: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  rekapTableEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  rekapTableActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  rekapTableExpandBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  rekapTableExpandBtnText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#047857',
  },
  rekapTableModalLaunchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6,
  },
  rekapTableModalLaunchText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#047857',
  },

  /* MODAL BIG CARD & FULL VIEW TABLE */
  modalBigCardRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  modalBigCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalBigCardNumBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBigCardNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  modalBigCardTitle: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#0F172A',
  },
  modalBigCardCategory: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: '#059669',
    textTransform: 'uppercase',
  },
  modalBigCardNotesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  modalBigCardNotesText: {
    fontSize: 11.5,
    color: '#475569',
    fontStyle: 'italic',
  },
  modalBottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCloseFooterBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  modalCloseFooterText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#64748B',
  },
  modalSignProceedBtn: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalSignProceedGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  modalSignProceedText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* MODAL PREVIEW TABLE (DALAM PARAF CONFIRMATION) */
  modalTablePreviewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 14,
    marginBottom: 6,
  },
  modalTablePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTablePreviewTitle: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#0F172A',
  },
  modalTablePreviewContent: {
    gap: 4,
  },
  modalTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  modalTableCellNum: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    width: 20,
  },
  modalTableCellName: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E293B',
    paddingRight: 6,
  },
  modalTableCellLoc: {
    fontSize: 10,
    color: '#64748B',
    width: 50,
  },
  modalTableStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    minWidth: 55,
    alignItems: 'center',
  },
  modalTableStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  modalTableMoreText: {
    fontSize: 10.5,
    fontStyle: 'italic',
    color: '#059669',
    textAlign: 'center',
    marginTop: 4,
  },

  /* ============================================================ */
  /* MODAL INPUT SATUAN AMALAN SISWA (SINGLE ITEM MODAL) */
  /* ============================================================ */
  singleItemHeaderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  singleItemIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  singleItemTitle: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#0F172A',
  },
  singleItemCategory: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: '#059669',
    textTransform: 'uppercase',
  },
  singleFieldLabel: {
    fontSize: 12.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  singleStatusGrid: {
    gap: 8,
    marginBottom: 6,
  },
  singleStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  singleStatusTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#1E293B',
  },
  singleStatusSub: {
    fontSize: 10.5,
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
    marginTop: 1,
  },
  singleNotesInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    fontSize: 13,
    color: '#1E293B',
    minHeight: 76,
    textAlignVertical: 'top',
  },
  singleInfoNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 12,
    marginBottom: 16,
  },
  singleInfoNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#065F46',
    lineHeight: 16,
    fontFamily: 'Nunito_600SemiBold',
  },
  singleActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  singleCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  singleCancelText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#64748B',
  },
  singleSaveBtn: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  singleSaveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  singleSaveText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // --- Section 2: Period & Date Strip Styles ---
  cardInternalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardInternalHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  cardInternalTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '800',
    color: '#0F172A',
  },
  periodCardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  periodTabsCapsule: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  periodTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  periodTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  periodTabText: {
    fontSize: 12.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '600',
    color: '#64748B',
  },
  periodTabTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  dateStripContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  dateStripScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 4,
  },
  dateStripItem: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 12,
    minWidth: 42,
  },
  dateStripItemActive: {
    backgroundColor: '#ECFDF5',
  },
  dateStripDayName: {
    fontSize: 10.5,
    fontFamily: 'Nunito_600SemiBold',
    color: '#64748B',
    marginBottom: 4,
  },
  dateStripDayNameActive: {
    color: '#059669',
    fontWeight: '700',
  },
  dateStripCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  dateStripCircleActive: {
    backgroundColor: '#059669',
  },
  dateStripDayNum: {
    fontSize: 12.5,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    color: '#334155',
  },
  dateStripDayNumActive: {
    color: '#FFFFFF',
  },
  dateTodayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#059669',
    marginTop: 3,
  },
  dateStripCalendarBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Section 3: Ringkasan Hari Ini ---
  ringkasanMainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  ringkasanTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  donutGaugeBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutOuterRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 7,
    borderColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
  },
  donutInnerHole: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutValueText: {
    fontSize: 14.5,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '800',
    color: '#065F46',
  },
  donutLabelText: {
    fontSize: 9.5,
    fontFamily: 'Nunito_600SemiBold',
    color: '#059669',
    fontWeight: '700',
  },
  ringkasanRightCol: {
    flex: 1,
    gap: 8,
  },
  terlaksanaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignSelf: 'flex-start',
  },
  terlaksanaBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#047857',
  },
  ringkasanPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  ringkasanMiniPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  ringkasanMiniPillVal: {
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '800',
  },
  ringkasanMiniPillLbl: {
    fontSize: 9.5,
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '700',
    marginTop: 1,
  },
  quoteBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 3.5,
    borderLeftColor: '#059669',
    marginTop: 14,
  },
  quoteText: {
    fontSize: 11.5,
    fontFamily: 'Nunito_600SemiBold',
    fontStyle: 'italic',
    color: '#475569',
    lineHeight: 16,
  },

  // --- Section 4: Program Mutaba'ah ---
  programSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  programCardActive: {
    borderWidth: 2,
    shadowColor: '#059669',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  resetFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  resetFilterText: {
    fontSize: 10.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#059669',
  },
  notesSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  programsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  programCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  programIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  programCardName: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  programCardCount: {
    fontSize: 10,
    fontFamily: 'Nunito_600SemiBold',
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },

  // --- Section 7: KPI Mini Counters & Checklist Items ---
  kpiMiniGrid: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  kpiMiniCard: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  kpiMiniCount: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '800',
  },
  kpiMiniLabel: {
    fontSize: 9.5,
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '700',
    marginTop: 1,
  },
  agendaSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 10,
    marginTop: 2,
  },
  quranBridgeCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  quranBridgeGradient: {
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  quranBridgeIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#DEF7EC',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quranBridgeTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '800',
    color: '#064E3B',
  },
  quranBridgeDesc: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: '#047857',
    lineHeight: 16,
    marginTop: 3,
    marginBottom: 10,
  },
  quranBridgeBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  quranBridgeBtnText: {
    fontSize: 11.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  singleQuranTipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    marginBottom: 6,
  },
  singleQuranTipText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: '#065F46',
    lineHeight: 15,
  },
  agendaSectionTitle: {
    fontSize: 13.5,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '800',
    color: '#0F172A',
  },
  agendaCountBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  agendaCountBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#059669',
  },
  openSheetBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  openSheetBadgeBtnText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#059669',
  },
  agendaCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agendaNumBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  agendaNumBoxActive: {
    backgroundColor: '#ECFDF5',
  },
  agendaNumText: {
    fontSize: 11,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    color: '#64748B',
  },
  agendaNumTextActive: {
    color: '#059669',
  },
  agendaSquircleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  agendaCardCenter: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    marginRight: 8,
  },
  agendaMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
  },
  agendaMetaColumn: {
    marginTop: 3,
    alignItems: 'flex-start',
    gap: 3,
  },
  scopePillAligned: {
    marginLeft: 0,
    alignSelf: 'flex-start',
  },
  agendaMetaDot: {
    fontSize: 10,
    color: '#94A3B8',
  },
  agendaCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    minWidth: 32,
    gap: 4,
  },
  statusCheckWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLessWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCrossWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusNaWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSchoolUnfilledWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Section Paraf: Progress per Kategori & Pengesahan ---
  evaluasiSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  categoryProgressInner: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  categoryProgressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  categoryProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  categoryProgressTitle: {
    fontSize: 12.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#0F172A',
  },
  categoryProgRow: {
    gap: 4,
  },
  categoryProgTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryProgIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryProgName: {
    fontSize: 12,
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '600',
    color: '#334155',
  },
  categoryProgRatio: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#059669',
  },
  categoryProgTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  categoryProgFill: {
    height: '100%',
    borderRadius: 3,
  },

  // --- Weekly Summary View ---
  weeklySummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  weeklyScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weeklyScoreBadge: {
    backgroundColor: '#ECFDF5',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyScoreVal: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '800',
    color: '#059669',
  },
  weeklyScoreLabel: {
    fontSize: 9.5,
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '700',
    color: '#047857',
    marginTop: 2,
  },
  weeklyStatusTitle: {
    fontSize: 14.5,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    color: '#0F172A',
  },
  weeklyStatusDesc: {
    fontSize: 11.5,
    fontFamily: 'Nunito_600SemiBold',
    color: '#64748B',
    lineHeight: 16,
    marginTop: 3,
  },
  weeklyDaysTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 14,
  },
  weeklyDayCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 10,
  },
  weeklyDayColActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  weeklyDayBarTrack: {
    width: 8,
    height: 48,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginBottom: 6,
  },
  weeklyDayBarFill: {
    width: '100%',
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  weeklyDayText: {
    fontSize: 10,
    fontFamily: 'Nunito_600SemiBold',
    color: '#64748B',
  },
  weeklyDayTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  weeklyDayNumText: {
    fontSize: 11,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    color: '#334155',
    marginTop: 1,
  },
  weeklyDayNumTextActive: {
    color: '#059669',
  },
  weeklyFullReportBtn: {
    marginTop: 14,
    borderRadius: 14,
    overflow: 'hidden',
  },
  weeklyFullReportGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  weeklyFullReportText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  weeklyOpenDailyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 14,
    gap: 6,
  },
  weeklyOpenDailyText: {
    fontSize: 12.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#059669',
  },

  // --- Calendar Picker Modal (Screen 2) ---
  calendarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  calendarModalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  calendarModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  calendarHeaderIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarModalTitle: {
    fontSize: 14.5,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    color: '#0F172A',
  },
  calendarModalSub: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: '#64748B',
    marginTop: 1,
  },
  calendarQuickPresets: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  calendarPresetBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  calendarPresetBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  calendarPresetText: {
    fontSize: 11.5,
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '600',
    color: '#475569',
  },
  calendarPresetTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  calendarMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  calendarNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitle: {
    fontSize: 13.5,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    color: '#0F172A',
  },
  calendarDayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarDayHeaderCol: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '600',
    color: '#64748B',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarGridCell: {
    width: `${100 / 7}%`,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    borderRadius: 18,
  },
  calendarGridCellActive: {
    backgroundColor: '#059669',
  },
  calendarGridCellToday: {
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  calendarGridDayText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '600',
    color: '#334155',
  },
  calendarGridDayTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  calendarGridDayTextToday: {
    color: '#059669',
    fontWeight: '700',
  },
  calendarCloseDoneBtn: {
    marginTop: 14,
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  calendarCloseDoneText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '600',
    color: '#475569',
  },

  /* ============================================================ */
  /* PERFORMANCE & FEEDBACK MODAL STYLES (TAILGRIDS HARMONIZED) */
  /* ============================================================ */
  fetchingDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    marginHorizontal: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  fetchingDatePillText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '600',
    color: '#065F46',
  },
  feedbackOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  feedbackCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  feedbackCardSuccess: {
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  feedbackCardError: {
    borderWidth: 1.5,
    borderColor: '#FECDD3',
  },
  feedbackCardWarning: {
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  feedbackCardInfo: {
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
  },
  feedbackAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  feedbackAccentLineSuccess: {
    backgroundColor: '#059669',
  },
  feedbackAccentLineError: {
    backgroundColor: '#E11D48',
  },
  feedbackAccentLineWarning: {
    backgroundColor: '#D97706',
  },
  feedbackAccentLineInfo: {
    backgroundColor: '#0284C7',
  },
  feedbackIconBadge: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 2,
  },
  feedbackIconBadgeSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  feedbackIconBadgeError: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  feedbackIconBadgeWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  feedbackIconBadgeInfo: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  feedbackTypePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  feedbackTypePillSuccess: {
    backgroundColor: '#D1FAE5',
  },
  feedbackTypePillError: {
    backgroundColor: '#FFE4E6',
  },
  feedbackTypePillWarning: {
    backgroundColor: '#FEF3C7',
  },
  feedbackTypePillInfo: {
    backgroundColor: '#E0F2FE',
  },
  feedbackTypePillText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  feedbackTypePillTextSuccess: {
    color: '#065F46',
  },
  feedbackTypePillTextError: {
    color: '#9F1239',
  },
  feedbackTypePillTextWarning: {
    color: '#92400E',
  },
  feedbackTypePillTextInfo: {
    color: '#075985',
  },
  feedbackTitle: {
    fontSize: 17,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  feedbackMessage: {
    fontSize: 12.5,
    fontFamily: 'Nunito_600SemiBold',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  feedbackItemSummary: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 16,
  },
  feedbackItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedbackItemName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#1E293B',
  },
  feedbackItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  feedbackStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  feedbackStatusBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  feedbackCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  feedbackCategoryBadgeText: {
    fontSize: 10.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#475569',
  },
  feedbackLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  feedbackLocationBadgeText: {
    fontSize: 10,
    fontFamily: 'Nunito_600SemiBold',
    color: '#64748B',
  },
  feedbackNotesQuote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  feedbackNotesQuoteText: {
    flex: 1,
    fontSize: 11.5,
    fontStyle: 'italic',
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
    lineHeight: 16,
  },
  feedbackDateText: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
  },
  feedbackDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 16,
  },
  feedbackDateChipText: {
    fontSize: 11.5,
    color: '#334155',
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '600',
  },
  feedbackActionBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  feedbackActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  feedbackActionText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
  },

  // KPI Categories Grid & Cards (Fardhu, Sunnah, Tilawah, Adab)
  kpiCategoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  kpiCategoryCard: {
    width: (SCREEN_WIDTH - 32 - 8) / 2,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 10,
  },
  kpiCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiCategoryTitle: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    textTransform: 'uppercase',
  },
  kpiCategoryTag: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
  },
  kpiCategoryRate: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Poppins_900Black',
  },
  kpiCategoryCount: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    color: '#64748B',
    marginTop: 1,
    marginBottom: 6,
  },
  kpiCategoryBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  kpiCategoryBarFill: {
    height: 4,
    borderRadius: 2,
  },

  // 4 Pillars Breakdown (29 Agenda Items)
  breakdownContainer: {
    marginBottom: 16,
    gap: 12,
  },
  breakdownHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  breakdownHeaderTitle: {
    flex: 1,
    marginLeft: 6,
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  breakdownHeaderSub: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    color: '#64748B',
  },
  pillarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pillarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
    marginBottom: 8,
  },
  pillarNum: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarNumText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
  },
  pillarTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#0F172A',
  },
  pillarCount: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#059669',
  },
  pillarGrid: {
    gap: 6,
  },
  pillarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  pillarItemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillarItemName: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    color: '#1E293B',
  },
  pillarItemSub: {
    fontSize: 9.5,
    color: '#64748B',
    fontFamily: 'Poppins_500Medium',
    marginLeft: 12,
    marginTop: 1,
  },
  pillarItemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillarItemBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
  },

  // Tahfizh Logs Card
  tahfizhLogsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    padding: 12,
    marginBottom: 16,
  },
  tahfizhLogsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#CCFBF1',
    paddingBottom: 8,
    marginBottom: 8,
  },
  tahfizhLogsTitle: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#115E59',
  },
  tahfizhLogsCount: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#0D9488',
  },
  tahfizhLogRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0FDFA',
  },
  tahfizhLogSurah: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#0F172A',
  },
  tahfizhLogAyahBadge: {
    backgroundColor: '#CCFBF1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tahfizhLogAyahText: {
    fontSize: 9.5,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#0F766E',
  },
  tahfizhLogNotes: {
    fontSize: 10.5,
    color: '#475569',
    fontFamily: 'Poppins_500Medium',
    marginTop: 2,
  },
  tahfizhLogMeta: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontFamily: 'Poppins_500Medium',
    marginTop: 2,
  },
  tahfizhLogScoreBadge: {
    backgroundColor: '#059669',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tahfizhLogScoreText: {
    fontSize: 9.5,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  tahfizhLogQuality: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    color: '#0D9488',
    marginTop: 2,
  },
});
