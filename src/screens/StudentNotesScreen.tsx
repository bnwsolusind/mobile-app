import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import {
  isParentRole,
  isTeacherRole,
  isStaffRole,
  isTuRole,
  isPrincipalRole,
  isSuperAdminRole,
} from '../utils/roles';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useAuthStore } from '../stores/authStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { resolveSelectedChildId } from '../utils/selectedChild';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { TeacherStickyHeader } from '../components/TeacherStickyHeader';
import { TeacherHeroCard } from '../components/TeacherHeroCard';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { EmptyStateCard } from '../components/EmptyStateCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;
const studentCardWidth = SCREEN_WIDTH - (STUDENT_PEEK_WIDTH * 2) - STUDENT_CARD_GAP;
const studentSnapInterval = studentCardWidth + STUDENT_CARD_GAP;
const studentTrackPad = STUDENT_PEEK_WIDTH;
const centerLoopOffset = studentSnapInterval;

const CATEGORIES = ['Semua', 'Akademik', 'Perilaku', 'Kedisiplinan', 'Prestasi', 'Konseling', 'Tahfizh', 'Ibadah', 'Kesehatan'];

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

export default function StudentNotesScreen({ route }: any) {
  const navigation = useNavigation<any>();
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    if (typeof useSafeAreaInsets === 'function') {
      insets = useSafeAreaInsets() || insets;
    }
  } catch {
    // fallback safe insets
  }
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);

  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);
  const isTeacher = isTeacherRole(user?.roles || []);
  const activeChildId = useActiveChildStore((state) => state.activeChildId);
  const isParentWithChild = isParent && Boolean(activeChildId);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);
  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);

  const isStaff = isStaffRole(user?.roles || []) || isTuRole(user?.roles || []) || isPrincipalRole(user?.roles || []) || isSuperAdminRole(user?.roles || []);
  const isTeacherOnly = isTeacher || isStaff;

  const studentScrollRef = useRef<ScrollView>(null);
  const handledParamIdRef = useRef<string | null>(null);

  const [children, setChildren] = useState<any[]>(() => {
    const fromStore = useActiveChildStore.getState().children;
    return Array.isArray(fromStore) && fromStore.length > 0 ? fromStore : [];
  });
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(() => {
    const fromRoute = route?.params?.child_id || route?.params?.student_id;
    if (fromRoute) return String(fromRoute);
    const fromStore = useActiveChildStore.getState().activeChildId;
    return fromStore ? String(fromStore) : undefined;
  });
  const [activeChildIndex, setActiveChildIndex] = useState<number>(() => {
    const fromStore = useActiveChildStore.getState().children;
    const targetId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
    if (Array.isArray(fromStore) && fromStore.length > 0 && targetId) {
      const idx = fromStore.findIndex((c) => String(c.id || c.student_id) === String(targetId));
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });

  useEffect(() => {
    if (selectedChildId && children.length > 0) {
      const idx = children.findIndex((c) => String(c.id || c.student_id) === String(selectedChildId));
      if (idx >= 0 && idx !== activeChildIndex) {
        setActiveChildIndex(idx);
      }
    }
  }, [selectedChildId, children]);

  const [notes, setNotes] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ current_page: 1, last_page: 1 });
  const [category, setCategory] = useState('Semua');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [signing, setSigning] = useState(false);

  // Modals identitas santri
  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);

  // ── Sticky Header Scroll Listener & Animasi (identik TahfizhScreen) ──
  const { scrollY, handleMainScroll } = useStickyScroll();

  const bodyCardOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [45, 105],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
    [scrollY]
  );

  const bodyCardTranslateY = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [45, 105],
        outputRange: [0, -16],
        extrapolate: 'clamp',
      }),
    [scrollY]
  );

  // ── Multi-child Looping Carousel State ──
  const studentLoopCount = children.length;
  const safeCenter = studentLoopCount > 0 ? ((activeChildIndex % studentLoopCount) + studentLoopCount) % studentLoopCount : 0;

  const loopWindow = useMemo(() => {
    const n = studentLoopCount;
    if (n <= 1) return { list: children, realIdx: [0] };
    const cur = ((activeChildIndex % n) + n) % n;
    const prev = (cur - 1 + n) % n;
    const next = (cur + 1) % n;
    return {
      list: [children[prev], children[cur], children[next]],
      realIdx: [prev, cur, next],
    };
  }, [children, activeChildIndex, studentLoopCount]);

  const recenterLoop = useCallback(() => {
    if (studentLoopCount > 1) {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
    }
  }, [studentLoopCount]);

  // Posisikan ScrollView ke tengah setiap kali jumlah anak berubah
  useEffect(() => {
    if (studentLoopCount <= 1) return;
    requestAnimationFrame(() => {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
    });
  }, [studentLoopCount]);

  // Siswa aktif untuk sticky header
  const activeChild = useMemo(() => {
    if (children.length === 0) return null;
    if (selectedChildId) {
      const found = children.find((c) => String(c.id || c.student_id) === String(selectedChildId));
      if (found) return found;
    }
    return children[safeCenter] || children[0] || null;
  }, [children, selectedChildId, safeCenter]);

  const headerStudent = useMemo(() => {
    return activeChild || (user as any)?.student || user || null;
  }, [activeChild, user]);

  const heroFirstName = useMemo(
    () => resolveStudentDisplay(headerStudent, user).firstName,
    [headerStudent, user]
  );

  // ── Load Catatan Buku Penghubung ──
  const loadNotes = useCallback(async (childId?: string, page = 1, append = false) => {
    if (isTeacherOnly) {
      if (!append) setLoading(true);
      try {
        const response = await mobileApiService.getTeacherStudentNotes({
          page,
          per_page: 15,
          category: category === 'Semua' ? undefined : category,
          search: search.trim() || undefined,
        });
        const rawData = response?.data ?? response;
        const rows = Array.isArray(rawData?.data)
          ? rawData.data
          : Array.isArray(rawData)
          ? rawData
          : Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response)
          ? response
          : [];

        setNotes((current) => (append ? [...current, ...rows] : rows));
        setMeta(rawData?.data && rawData?.current_page ? rawData : (response?.data || {}));
      } catch (err: any) {
        console.warn('Failed to load teacher student notes:', err);
      } finally {
        if (!append) setLoading(false);
      }
      return;
    }

    const targetId = childId || selectedChildId;
    if (!targetId) return;
    if (!append) setLoading(true);
    try {
      const response = await mobileApiService.getPortalStudentNotes(targetId, page);
      const rawData = response?.data ?? response;
      const rows = Array.isArray(rawData?.data)
        ? rawData.data
        : Array.isArray(rawData)
        ? rawData
        : Array.isArray(response?.data?.data)
        ? response.data.data
        : Array.isArray(response)
        ? response
        : [];

      setNotes((current) => (append ? [...current, ...rows] : rows));
      setMeta(rawData?.data && rawData?.current_page ? rawData : (response?.data || {}));
    } catch (err: any) {
      console.warn('Failed to load student notes:', err);
    } finally {
      if (!append) setLoading(false);
    }
  }, [category, isTeacherOnly, search, selectedChildId]);

  const syncLoopChildId = useCallback((newIdx: number) => {
    if (!children || children.length === 0) return;
    const n = children.length;
    const norm = ((newIdx % n) + n) % n;
    const targetChild = children[norm];
    if (targetChild) {
      const childId = String(targetChild.id || targetChild.student_id);
      setSelectedChildId(childId);
      useActiveChildStore.getState().setActiveChildId(childId);
      setNotes([]);
      setReplyFor(null);
      void loadNotes(childId, 1, false);
    }
  }, [children, loadNotes]);

  const goToLoopChild = useCallback((targetRealIndex: number) => {
    if (studentLoopCount <= 1) {
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
  }, [studentLoopCount, safeCenter, children.length, syncLoopChildId, recenterLoop]);

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

  // ── Inisialisasi Data Anak & Catatan ──
  const loadChildren = useCallback(async () => {
    const targetParamId = route?.params?.child_id || route?.params?.student_id;
    const storeActiveId = useActiveChildStore.getState().activeChildId;

    try {
      const response = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<any[]>(response);
      const safeList = Array.isArray(list) ? list : [];

      if (safeList.length > 0) {
        // Pertahankan seluruh saudara agar kartu bisa di-swipe kiri/kanan
        setChildren(safeList);
        useActiveChildStore.getState().setChildren(safeList);

        const resolvedId = resolveSelectedChildId(
          targetParamId,
          storeActiveId || globalActiveChildId,
          safeList
        ) || String(safeList[0].id || safeList[0].student_id);

        if (resolvedId) {
          setSelectedChildId(String(resolvedId));
          useActiveChildStore.getState().setActiveChildId(String(resolvedId));
          const idx = safeList.findIndex((c) => String(c.id || c.student_id) === String(resolvedId));
          if (idx >= 0) {
            setActiveChildIndex(idx);
          }
          return String(resolvedId);
        }
      } else if (children.length > 0) {
        return selectedChildId || String(children[0].id || children[0].student_id);
      }
    } catch {
      if (children.length > 0) {
        return selectedChildId || String(children[0].id || children[0].student_id);
      }
    }
    return undefined;
  }, [route?.params?.child_id, route?.params?.student_id, globalActiveChildId, children, selectedChildId]);

  const load = useCallback(async () => {
    if (isTeacherOnly) {
      setLoading(true);
      setError('');
      try {
        await loadNotes(undefined, 1, false);
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, 'Catatan buku penghubung belum berhasil dimuat.'));
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError('');
    try {
      const childId = await loadChildren();
      const targetId = childId || selectedChildId;
      if (targetId) {
        await loadNotes(targetId, 1, false);
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Catatan buku penghubung belum berhasil dimuat.'));
    } finally {
      setLoading(false);
    }
  }, [isTeacherOnly, loadChildren, loadNotes, selectedChildId]);

  useEffect(() => {
    void load();
  }, [category]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      if (isTeacherOnly) {
        await loadNotes(undefined, 1, false);
      } else if (selectedChildId) {
        await loadNotes(selectedChildId, 1, false);
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Catatan buku penghubung belum berhasil dimuat.'));
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    const current = Number(meta?.current_page || 1);
    const last = Number(meta?.last_page || 1);
    if (loadingMore || current >= last) return;
    if (!isTeacherOnly && !selectedChildId) return;
    setLoadingMore(true);
    try {
      await loadNotes(isTeacherOnly ? undefined : selectedChildId, current + 1, true);
    } finally {
      setLoadingMore(false);
    }
  };

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

  const openScheduleForStudent = useCallback((student: any) => {
    const cid = String(student?.id || student?.student_id || selectedChildId || '');
    if (cid) {
      navigation?.navigate('Jadwal', { child_id: cid, student_id: cid });
    } else {
      navigation?.navigate('Jadwal');
    }
  }, [navigation, selectedChildId]);

  const signNote = async (note: any) => {
    if (!selectedChildId) return;
    setSigning(true);
    try {
      await mobileApiService.signPortalStudentNote(String(note.id), selectedChildId, reply);
      setReply('');
      setReplyFor(null);
      await loadNotes(selectedChildId, 1, false);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Tanda Tangan Tersimpan',
        message: 'Catatan dan persetujuan orang tua berhasil disimpan ke server sekolah.',
      });
    } catch (requestError) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan',
        message: getApiErrorMessage(requestError, 'Catatan belum berhasil ditandatangani.'),
      });
    } finally {
      setSigning(false);
    }
  };

  const filtered = useMemo(() => {
    return notes.filter((note) => {
      const matchesCategory =
        category === 'Semua' || String(note.category || '').toLowerCase() === category.toLowerCase();
      const keyword = search.trim().toLowerCase();
      const teacher = note.teacher?.full_name || note.teacher?.nama_lengkap || note.teacher?.name || '';
      return (
        matchesCategory &&
        (!keyword ||
          [note.title, note.content, teacher].some((value) =>
            String(value || '').toLowerCase().includes(keyword)
          ))
      );
    });
  }, [notes, category, search]);

  return (
    <View style={styles.rootContainer}>
      {/* ── 0. STICKY HEADER BERSAMA ── */}
      {isTeacherOnly ? (
        <TeacherStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Buku Penghubung"
          subtitle="Catatan Santri & Respon Ortu"
          navigation={navigation}
          route={route}
          user={user}
          chips={CATEGORIES.slice(0, 5).map((cat) => ({
            label: cat,
            active: category === cat,
            onPress: () => setCategory(cat),
          }))}
        />
      ) : (
        <StudentStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Buku Penghubung"
          navigation={navigation}
          route={route}
          student={headerStudent}
          user={user}
          childrenList={children}
          selectedChildId={selectedChildId}
          onSelectChild={(cid, idx) => goToLoopChild(idx)}
          middleAction={{
            label: 'Jadwal',
            icon: 'calendar-clock',
            onPress: () => openScheduleForStudent(headerStudent),
          }}
          onOpenIdCard={(s) => setSelectedIdCardStudent(s)}
          onOpenQr={(s) => setSelectedQrStudent(s)}
          onOpenWeeklyReport={(s) => setSelectedWeeklyStudent(s)}
          onOpenMenu={(s) => setSelectedMenuStudent(s)}
        />
      )}

      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[
            styles.mainScrollContent,
            { paddingBottom: Math.max(bottomInset + 72, 94) },
          ]}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              colors={['#18A165']}
              progressViewOffset={topInset + 10}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* ── 1. STATIC TOPBAR (identik TahfizhScreen) ── */}
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
                  Buku Penghubung
                </Text>
                <Text numberOfLines={1} style={styles.heroModuleSubtitle}>
                  {isTeacherOnly ? 'Catatan Evaluasi & Komunikasi Wali' : (heroFirstName ? `Ananda ${heroFirstName}` : 'Komunikasi Guru & Orang Tua')}
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

          {/* ── 2. BADAN KONTEN HALAMAN ── */}
          <View style={styles.bodyContentWrapper}>
            {/* ── 2A. CARD SISWA / GURU HERO ── */}
            {isTeacherOnly ? (
              <TeacherHeroCard
                user={user}
                title="Buku Penghubung Santri"
                subtitle="Pantau catatan pembinaan, evaluasi perilaku/tahfizh, dan umpan balik wali santri"
                stats={[
                  { label: 'Total Catatan', value: notes.length, icon: 'notebook-outline' },
                  { label: 'Kategori Aktif', value: category, icon: 'tag-outline' },
                  { label: 'Pencarian', value: search ? 'Filter' : 'Semua', icon: 'magnify' },
                ]}
              />
            ) : children.length > 0 ? (
              <Animated.View
                style={[
                  styles.containerBlock,
                  styles.studentContainerBlock,
                  { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] },
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
                      onPressCard={() => setSelectedIdCardStudent(children[0])}
                      onPressQr={() => setSelectedQrStudent(children[0])}
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
                        if (studentLoopCount <= 1) return;
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
                        recenterLoop();
                      }}
                      onScrollEndDrag={(e) => {
                        if (studentLoopCount <= 1) return;
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
                            onPressCard={() => setSelectedIdCardStudent(child)}
                            onPressQr={() => setSelectedQrStudent(child)}
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
                            accessibilityLabel={`Pilih Siswa ke-${dotIdx + 1}`}
                            accessibilityRole="button"
                          />
                        );
                      })}
                    </View>
                  </>
                )}
              </Animated.View>
            ) : headerStudent ? (
              <Animated.View
                style={[
                  styles.containerBlock,
                  styles.studentContainerBlock,
                  { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] },
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
                    child={headerStudent}
                    isSelected={true}
                    isSingleChild={true}
                    showActionButtons={true}
                    cardLabel="Kartu Siswa"
                    calendarLabel="Jadwal"
                    portalLabel="Menu"
                    onPressCard={() => setSelectedIdCardStudent(headerStudent)}
                    onPressQr={() => setSelectedQrStudent(headerStudent)}
                    onPressWeeklyReport={() => setSelectedWeeklyStudent(headerStudent)}
                    onPressNotifications={() => navigation?.navigate('Notifikasi')}
                    onPressCalendar={() => openScheduleForStudent(headerStudent)}
                    onPressPortal={() => setSelectedMenuStudent(headerStudent)}
                  />
                </View>
              </Animated.View>
            ) : null}

            {/* ── 2B. TOOLBAR FILTER & PENCARIAN BUKU PENGHUBUNG ── */}
            <View style={styles.containerBlock}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="notebook-edit-outline" size={19} color="#18A165" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Buku Penghubung</Text>
                  <Text style={styles.sectionSub}>
                    Komunikasi perkembangan anak antara guru, wali kelas, dan orang tua.
                  </Text>
                </View>
              </View>

              <View style={styles.searchBox}>
                <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Cari catatan atau nama guru..."
                  placeholderTextColor="#94A3B8"
                  style={styles.searchInput}
                />
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}
              >
                {CATEGORIES.map((item) => (
                  <TouchableOpacity
                    key={item}
                    onPress={() => setCategory(item)}
                    style={[styles.filter, category === item && styles.filterActive]}
                  >
                    <Text style={[styles.filterText, category === item && styles.filterTextActive]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* ── 2C. DAFTAR CATATAN GURU ── */}
            {error ? (
              <View style={styles.errorBox}>
                <View style={styles.errorContent}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#BE123C" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.retryBtn}
                  onPress={() => {
                    if (isTeacherOnly) {
                      void loadNotes(undefined, 1, false);
                    } else if (selectedChildId) {
                      void loadNotes(selectedChildId, 1, false);
                    }
                  }}
                >
                  <MaterialCommunityIcons name="refresh" size={12} color="#059669" />
                  <Text style={styles.retryBtnText}>Coba Lagi</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {loading ? (
              <ActivityIndicator color="#18A165" style={{ marginVertical: 36 }} />
            ) : filtered.length === 0 ? (
              <EmptyStateCard
                icon="notebook-outline"
                title="Belum Ada Catatan"
                description="Belum ada catatan buku penghubung untuk kategori yang dipilih."
              />
            ) : (
              filtered.map((note) => {
                const status = note.signature_status || 'unsigned';
                const signed = status === 'signed';
                const teacherName =
                  note.teacher?.full_name ||
                  note.teacher?.nama_lengkap ||
                  note.teacher?.name ||
                  'Guru Pengampu';

                return (
                  <View key={String(note.id)} style={styles.noteCard}>
                    <View style={styles.noteHead}>
                      <View style={styles.teacherIcon}>
                        <MaterialCommunityIcons
                          name="account-tie-outline"
                          size={21}
                          color="#047857"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.teacherName}>{teacherName}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          {note.student ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                              <MaterialCommunityIcons name="account-school-outline" size={11} color="#059669" />
                              <Text numberOfLines={1} style={{ fontSize: 10, color: '#047857', fontWeight: '700', marginLeft: 3 }}>
                                {note.student?.full_name || note.student?.name}
                              </Text>
                            </View>
                          ) : null}
                          <Text style={styles.noteDate}>
                            {formatDate(note.date || note.created_at)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryText}>{note.category || 'Akademik'}</Text>
                      </View>
                    </View>

                    <Text style={styles.noteTitle}>{note.title || 'Catatan Guru'}</Text>
                    <Text style={styles.noteContent}>{note.content || '-'}</Text>

                    {note.follow_up ? (
                      <View style={styles.followUp}>
                        <Text style={styles.followUpLabel}>Tindak lanjut orang tua:</Text>
                        <Text style={styles.followUpText}>{note.follow_up}</Text>
                      </View>
                    ) : null}

                    <View style={styles.noteFooter}>
                      <View
                        style={[
                          styles.statusBadge,
                          signed
                            ? styles.signed
                            : status === 'signed_updated'
                            ? styles.stale
                            : styles.unsigned,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={
                            signed
                              ? 'check-decagram'
                              : status === 'signed_updated'
                              ? 'alert-decagram'
                              : 'draw-pen'
                          }
                          size={15}
                          color={
                            signed
                              ? '#047857'
                              : status === 'signed_updated'
                              ? '#B45309'
                              : '#475569'
                          }
                        />
                        <Text style={styles.statusText}>
                          {signed
                            ? 'Sudah ditandatangani'
                            : status === 'signed_updated'
                            ? 'Perlu tanda tangan ulang'
                            : 'Belum ditandatangani'}
                        </Text>
                      </View>

                      {/* Tombol Tanda Tangan: Khusus Akun Orang Tua */}
                      {isParent && !signed && (
                        <TouchableOpacity
                          onPress={() => {
                            setReplyFor(String(note.id));
                            setReply(note.follow_up || '');
                          }}
                          style={styles.signButton}
                        >
                          <Text style={styles.signButtonText}>Tanggapi & Tanda Tangan</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Form Tanggapan & Tanda Tangan */}
                    {replyFor === String(note.id) && (
                      <View style={styles.replyBox}>
                        <TextInput
                          value={reply}
                          onChangeText={setReply}
                          multiline
                          maxLength={5000}
                          placeholder="Tulis tindak lanjut atau tanggapan orang tua..."
                          placeholderTextColor="#94A3B8"
                          style={styles.replyInput}
                        />
                        <View style={styles.replyActions}>
                          <TouchableOpacity
                            disabled={signing}
                            onPress={() => {
                              setReplyFor(null);
                              setReply('');
                            }}
                            style={styles.cancelButton}
                          >
                            <Text style={styles.cancelText}>Batal</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            disabled={signing}
                            onPress={() => void signNote(note)}
                            style={styles.confirmButton}
                          >
                            {signing ? (
                              <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                              <Text style={styles.confirmText}>Setujui & Tanda Tangan</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {Number(meta?.current_page || 1) < Number(meta?.last_page || 1) && (
              <TouchableOpacity
                disabled={loadingMore}
                onPress={() => void loadMore()}
                style={styles.moreButton}
              >
                {loadingMore ? (
                  <ActivityIndicator color="#047857" />
                ) : (
                  <Text style={styles.moreText}>Muat catatan berikutnya</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </Animated.ScrollView>
      </View>

      {/* ── 3. MODALS IDENTITAS SANTRI (KTS, QR, Menu Cepat, Rapor Mingguan) ── */}
      <StudentIdCardModal
        visible={!!selectedIdCardStudent}
        student={selectedIdCardStudent}
        onClose={() => setSelectedIdCardStudent(null)}
      />
      <StudentQrModal
        visible={!!selectedQrStudent}
        student={selectedQrStudent}
        onClose={() => setSelectedQrStudent(null)}
      />
      <StudentMenuModal
        visible={!!selectedMenuStudent}
        student={selectedMenuStudent}
        navigation={navigation}
        onClose={() => setSelectedMenuStudent(null)}
      />
      <StudentWeeklyReportModal
        visible={!!selectedWeeklyStudent}
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
  },
  mainScrollContent: {
    paddingBottom: 94,
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // ── Static Top Bar (identik TahfizhScreen) ──
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

  // ── Container & Student Block ──
  containerBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDEBE4',
    padding: 14,
    marginBottom: 14,
  },
  studentContainerBlock: {
    marginBottom: 10,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
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
  studentCardsTrack: {
    gap: STUDENT_CARD_GAP,
    paddingBottom: 4,
    zIndex: 1,
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

  // ── Toolbar Header & Filters ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  sectionSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 13,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 12,
    marginLeft: 7,
  },
  filters: {
    gap: 7,
    paddingTop: 11,
  },
  filter: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  filterActive: {
    backgroundColor: '#0E5C44',
  },
  filterText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
  },
  filterTextActive: {
    color: '#FFF',
  },

  // ── States & Cards ──
  errorBox: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  errorText: {
    color: '#BE123C',
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  empty: {
    alignItems: 'center',
    borderRadius: 20,
    padding: 34,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDEBE4',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#334155',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  noteCard: {
    borderRadius: 20,
    padding: 15,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDEBE4',
    marginBottom: 14,
    shadowColor: '#0D6B42',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  noteHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingBottom: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  teacherIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherName: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  noteDate: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
  },
  categoryText: {
    color: '#047857',
    fontSize: 9.5,
    fontWeight: '900',
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 13,
  },
  noteContent: {
    fontSize: 12,
    lineHeight: 19,
    color: '#475569',
    marginTop: 7,
  },
  followUp: {
    backgroundColor: '#F8FAFC',
    borderRadius: 11,
    padding: 10,
    marginTop: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  followUpLabel: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#047857',
    textTransform: 'uppercase',
  },
  followUpText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#334155',
    marginTop: 4,
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 14,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexShrink: 1,
  },
  signed: {
    backgroundColor: '#D1FAE5',
  },
  stale: {
    backgroundColor: '#FEF3C7',
  },
  unsigned: {
    backgroundColor: '#F1F5F9',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
  },
  signButton: {
    backgroundColor: '#0E5C44',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  signButtonText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '900',
  },
  replyBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  replyInput: {
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 11,
    fontSize: 11,
    color: '#0F172A',
    textAlignVertical: 'top',
    backgroundColor: '#F8FAFC',
  },
  replyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 9,
  },
  cancelButton: {
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: '#F1F5F9',
  },
  cancelText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
  },
  confirmButton: {
    minWidth: 144,
    alignItems: 'center',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: '#18A165',
  },
  confirmText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
  },
  moreButton: {
    alignItems: 'center',
    borderRadius: 13,
    padding: 13,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 16,
  },
  moreText: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '900',
  },
});
