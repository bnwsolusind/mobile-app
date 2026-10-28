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
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
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
import {
  PORTAL_BODY_PALETTE,
  portalBodyStyles,
} from '../components/PortalBodyStyles';
import { resolveSelectedChildId } from '../utils/selectedChild';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Child = Record<string, any>;
type ParentDashboard = Record<string, any>;

interface GridMenuItem {
  key: string;
  label: string;
  icon: string;
  iconColor: string;
  cardBg: string;
  borderColor: string;
  route?: string;
  action?: 'permission' | 'service' | 'help';
}

const GRID_MENU_ITEMS: GridMenuItem[] = [
  // Menu Khusus & Eksklusif Kebutuhan Orang Tua (Menu pembelajaran santri diakses via Menu Siswa)
  {
    key: 'tagihan',
    label: 'Tagihan SPP',
    icon: 'cash-multiple',
    iconColor: '#059669',
    cardBg: '#ECFDF5',
    borderColor: '#A7F3D0',
    route: 'Tagihan',
  },
  {
    key: 'buku-hubung',
    label: 'Buku Hubung',
    icon: 'book-open-page-variant',
    iconColor: '#8B5CF6',
    cardBg: '#F5F3FF',
    borderColor: '#DDD6FE',
    route: 'Komentar',
  },
  {
    key: 'chat-guru',
    label: 'Chat Guru',
    icon: 'chat-processing-outline',
    iconColor: '#2563EB',
    cardBg: '#EFF6FF',
    borderColor: '#BFDBFE',
    route: 'Chat',
  },
  {
    key: 'perizinan-anak',
    label: 'Perizinan Anak',
    icon: 'file-document-edit',
    iconColor: '#EF4444',
    cardBg: '#FEF2F2',
    borderColor: '#FEE2E2',
    action: 'permission',
  },
  {
    key: 'layanan-sekolah',
    label: 'Layanan\nSekolah',
    icon: 'headset',
    iconColor: '#0D9488',
    cardBg: '#F0FDFA',
    borderColor: '#CCFBF1',
    action: 'service',
  },
  {
    key: 'bantuan',
    label: 'Bantuan',
    icon: 'help-circle',
    iconColor: '#F43F5E',
    cardBg: '#FFF1F2',
    borderColor: '#FFE4E6',
    action: 'help',
  },
];


export default function ParentPortalScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 104;
  const user = useAuthStore((state) => state.user);
  const mobileConfig = useMobileConfigStore((state) => state.config);
  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const routeTab = route?.params?.tab;
  const [children, setChildren] = useState<Child[]>([]);
  // Resolver tunggal: route -> pilihan halaman utama -> anak pertama
  const targetChildId = resolveSelectedChildId(
    route?.params?.child_id || route?.params?.student_id,
    globalActiveChildId,
    children
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(targetChildId ? String(targetChildId) : undefined);
  const selectedIdRef = useRef<string | undefined>(targetChildId ? String(targetChildId) : undefined);
  const [dashboard, setDashboard] = useState<ParentDashboard>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [submittingPermission, setSubmittingPermission] = useState(false);
  const [subTab, setSubTab] = useState<'evaluasi' | 'mutabaah' | 'setoran' | 'target' | 'ortu'>(
    routeTab && ['evaluasi', 'mutabaah', 'setoran', 'target', 'ortu'].includes(routeTab) ? routeTab : 'evaluasi'
  );
  const [mutabaahPeriod, setMutabaahPeriod] = useState<'harian' | 'mingguan' | 'bulanan' | 'semester'>('harian');

  // Sync route params tab jika berpindah tab dari luar
  useEffect(() => {
    if (routeTab && ['evaluasi', 'mutabaah', 'setoran', 'target', 'ortu'].includes(routeTab)) {
      setSubTab(routeTab);
    }
  }, [routeTab]);

  const isUserDraggingRef = useRef<boolean>(false);
  const isSyncingDataRef = useRef<boolean>(false);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollTimerRef = useRef<any>(null);

  const studentCardWidth = useMemo(() => {
    return SCREEN_WIDTH - 50;
  }, []);
  const studentSnapInterval = useMemo(() => {
    return SCREEN_WIDTH - 50 + 12;
  }, []);

  const scrollToActiveChild = useCallback((idx: number, animated = false): void => {
    if (children.length <= 1) return;
    const clamped = Math.max(0, Math.min(children.length - 1, idx));
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 450);
    heroScrollRef.current?.scrollTo({ x: clamped * studentSnapInterval, animated });
  }, [children.length, studentSnapInterval]);

  const lastHandledGlobalChildIdRef = useRef<string | null>(null);

  // Sync route params child_id / global store jika berpindah anak dari luar
  useEffect(() => {
    const nextChildId = targetChildId || globalActiveChildId;
    if (!nextChildId) return;
    const nextStr = String(nextChildId);
    if (nextStr === lastHandledGlobalChildIdRef.current) return;
    lastHandledGlobalChildIdRef.current = nextStr;

    if (nextStr !== selectedIdRef.current) {
      selectedIdRef.current = nextStr;
      setSelectedId(nextStr);
      if (children.length > 0) {
        const foundIdx = children.findIndex((c) => String(c.id || c.student_id) === nextStr);
        if (foundIdx >= 0) {
          scrollToActiveChild(foundIdx, true);
        }
      }
    }
  }, [targetChildId, globalActiveChildId, children, scrollToActiveChild]);

  // Data tab Setoran / Target / Izin per anak terpilih
  const [tabLoading, setTabLoading] = useState(false);
  const [setoranLogs, setSetoranLogs] = useState<any[]>([]);
  const [setoranTarget, setSetoranTarget] = useState<any>(null);
  const [permissionRows, setPermissionRows] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedId) return;
    if (subTab === 'setoran' || subTab === 'target') {
      setTabLoading(true);
      mobileApiService
        .getPortalTahfizh({ child_id: selectedId, student_id: selectedId, per_page: 20 })
        .then((res: any) => {
          const raw = unwrapApiData<any>(res);
          const list = Array.isArray(raw?.data)
            ? raw.data
            : Array.isArray(raw)
              ? raw
              : Array.isArray(raw?.items)
                ? raw.items
                : [];
          setSetoranLogs(list);
          setSetoranTarget(
            res?.target || res?.tahfizh_target || raw?.target || raw?.tahfizh_target || null
          );
        })
        .catch(() => {})
        .finally(() => setTabLoading(false));
    } else if (subTab === 'ortu') {
      setTabLoading(true);
      mobileApiService
        .getPortalPermissions(selectedId)
        .then((res: any) => {
          const raw = unwrapApiData<any>(res);
          const list = Array.isArray(raw?.data)
            ? raw.data
            : Array.isArray(raw)
              ? raw
              : [];
          setPermissionRows(list);
        })
        .catch(() => {})
        .finally(() => setTabLoading(false));
    }
  }, [subTab, selectedId]);

  const load = useCallback(async () => {
    setError('');
    const isSingleChild = route?.params?.single_child_only === true;
    const childCacheKey = offlineCache.buildKey('parent_portal_children', user?.id);

    // 1. Baca cache anak dulu
    const cachedChildren = await offlineCache.get<Child[]>(childCacheKey);
    let activeId: string | null | undefined = targetChildId || selectedIdRef.current || useActiveChildStore.getState().activeChildId;
    if (cachedChildren && cachedChildren.length > 0) {
      isSyncingDataRef.current = true;
      const displayCached = isSingleChild && targetChildId
        ? cachedChildren.filter((c) => String(c.id || c.student_id) === String(targetChildId))
        : cachedChildren;
      const safeCached = displayCached.length > 0 ? displayCached : cachedChildren;
      setChildren(safeCached);
      useActiveChildStore.getState().setChildren(cachedChildren);
      activeId = targetChildId || selectedIdRef.current || useActiveChildStore.getState().activeChildId || String(safeCached[0]?.id);
      if (activeId) {
        const idStr = String(activeId);
        if (selectedIdRef.current !== idStr) {
          selectedIdRef.current = idStr;
          setSelectedId(idStr);
          useActiveChildStore.getState().setActiveChildId(idStr);
        }
        const dashKey = offlineCache.buildKey('parent_portal_dashboard', user?.id, idStr);
        const cachedDash = await offlineCache.get<ParentDashboard>(dashKey);
        if (cachedDash) {
          setDashboard(cachedDash);
          setLoading(false);
        }
        const foundIdx = safeCached.findIndex((c) => String(c.id || c.student_id) === idStr);
        if (foundIdx >= 0) {
          requestAnimationFrame(() => {
            scrollToActiveChild(foundIdx, false);
            setTimeout(() => { isSyncingDataRef.current = false; }, 250);
          });
        } else {
          setTimeout(() => { isSyncingDataRef.current = false; }, 250);
        }
      } else {
        setTimeout(() => { isSyncingDataRef.current = false; }, 250);
      }
    }

    try {
      const childResponse = await mobileApiService.getPortalChildren();
      const available = (unwrapApiData<Child[]>(childResponse) || []);
      if (available.length > 0) {
        isSyncingDataRef.current = true;
        const displayAvailable = isSingleChild && targetChildId
          ? available.filter((c) => String(c.id || c.student_id) === String(targetChildId))
          : available;
        const safeAvailable = displayAvailable.length > 0 ? displayAvailable : available;
        setChildren(safeAvailable);
        useActiveChildStore.getState().setChildren(available);
        void offlineCache.set(childCacheKey, available);
      }
      activeId = targetChildId || selectedIdRef.current || useActiveChildStore.getState().activeChildId || (available[0]?.id ? String(available[0].id) : undefined);
      if (activeId) {
        const idStr = String(activeId);
        if (selectedIdRef.current !== idStr) {
          selectedIdRef.current = idStr;
          setSelectedId(idStr);
          useActiveChildStore.getState().setActiveChildId(idStr);
        }
        const dashKey = offlineCache.buildKey('parent_portal_dashboard', user?.id, idStr);
        const dashboardResponse = await mobileApiService.getPortalDashboard(idStr);
        const dashData = unwrapApiData<ParentDashboard>(dashboardResponse) || {};
        setDashboard(dashData);
        void offlineCache.set(dashKey, dashData);
        const foundIdx = available.findIndex((c) => String(c.id || c.student_id) === idStr);
        if (foundIdx >= 0) {
          requestAnimationFrame(() => {
            scrollToActiveChild(foundIdx, false);
            setTimeout(() => { isSyncingDataRef.current = false; }, 250);
          });
        } else {
          setTimeout(() => { isSyncingDataRef.current = false; }, 250);
        }
      } else {
        setDashboard({});
        setTimeout(() => { isSyncingDataRef.current = false; }, 250);
      }
    } catch (requestError) {
      isSyncingDataRef.current = false;
      if (!cachedChildren) {
        setError(getApiErrorMessage(requestError, 'Data portal orang tua belum berhasil dimuat.'));
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id, targetChildId, route?.params?.single_child_only, scrollToActiveChild]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectChild = async (id: string) => {
    const idStr = String(id);
    lastHandledGlobalChildIdRef.current = idStr;
    selectedIdRef.current = idStr;
    setSelectedId(idStr);
    useActiveChildStore.getState().setActiveChildId(idStr);
    setError('');
    const dashKey = offlineCache.buildKey('parent_portal_dashboard', user?.id, id);
    const cachedDash = await offlineCache.get<ParentDashboard>(dashKey);
    if (cachedDash) {
      setDashboard(cachedDash);
    } else {
      setLoading(true);
    }

    try {
      const res = await mobileApiService.getPortalDashboard(id);
      const dashData = unwrapApiData<ParentDashboard>(res) || {};
      setDashboard(dashData);
      void offlineCache.set(dashKey, dashData);
    } catch (requestError) {
      if (!cachedDash) {
        setError(getApiErrorMessage(requestError, 'Dashboard anak belum berhasil dimuat.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const submitPermission = async () => {
    if (!selectedId || !reason.trim()) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Data Belum Lengkap',
        message: 'Mohon pilih anak dan tuliskan alasan pengajuan perizinan secara lengkap.',
      });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setSubmittingPermission(true);
    try {
      await mobileApiService.submitPortalPermission({ child_id: selectedId, type: 'Izin', start_date: today, end_date: today, reason: reason.trim() });
      setReason('');
      setIsPermissionModalOpen(false);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Pengajuan Terkirim',
        message: 'Pengajuan izin berhasil dikirim dan sudah menunggu verifikasi sekolah.',
      });
    } catch (requestError) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Pengajuan Gagal',
        message: getApiErrorMessage(requestError, 'Pengajuan belum berhasil dikirim.'),
      });
    } finally {
      setSubmittingPermission(false);
    }
  };

  const handleGridMenuPress = (item: GridMenuItem) => {
    if (item.action === 'permission') {
      setIsPermissionModalOpen(true);
      return;
    }
    if (item.action === 'service') {
      const activeChild = children.find((c) => String(c.id || c.student_id) === String(selectedId)) || children[0];
      const rawPhone =
        (activeChild as any)?.education_unit?.phone ||
        (activeChild as any)?.unit?.phone ||
        (activeChild as any)?.metadata?.phone ||
        mobileConfig?.branding?.contact?.phone ||
        '08116661141';
      const cleanPhone = String(rawPhone).replace(/\D/g, '').replace(/^0/, '62');
      const unitName =
        (activeChild as any)?.education_unit?.name ||
        (activeChild as any)?.unit?.name ||
        mobileConfig?.branding?.school_name ||
        'Sekolah Terpadu';
      const childName = activeChild?.name || (activeChild as any)?.full_name || 'Santri';
      const message = encodeURIComponent(
        `Assalamu'alaikum Warahmatullahi Wabarakatuh, Layanan CS & Tata Usaha ${unitName}.\nSaya wali dari ananda ${childName}, ingin berkonsultasi mengenai administrasi dan layanan sekolah.`
      );
      const waUrl = `whatsapp://send?phone=${cleanPhone}&text=${message}`;
      const webWaUrl = `https://wa.me/${cleanPhone}?text=${message}`;

      void (async () => {
        try {
          const canOpen = await Linking.canOpenURL(waUrl);
          if (canOpen) {
            await Linking.openURL(waUrl);
          } else {
            await Linking.openURL(webWaUrl);
          }
        } catch {
          setFeedbackModal({
            visible: true,
            type: 'info',
            title: 'Layanan Tata Usaha & CS',
            message: `Silakan hubungi WhatsApp resmi ${unitName} di nomor +${cleanPhone}.`,
          });
        }
      })();
      return;
    }
    if (item.action === 'help') {
      navigation?.navigate('Bantuan');
      return;
    }
    if (item.route) {
      navigation?.navigate(item.route, {
        child_id: selectedId,
        student_id: selectedId,
      });
    }
  };

  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);
  const heroScrollRef = useRef<ScrollView>(null);

  // ── Sticky header bersama (StudentStickyHeader, sama dengan halaman lain) ──
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
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

  // Judul dinamis sesuai subTab / modul yang sedang dibuka (e.g. Setoran Tahfizh)
  const screenTitle = useMemo(() => {
    switch (subTab) {
      case 'setoran':
        return 'Setoran Tahfizh';
      case 'mutabaah':
        return "Mutaba'ah Yaumiyyah";
      case 'target':
        return 'Target Hafalan';
      case 'ortu':
        return 'Perizinan Santri';
      case 'evaluasi':
      default:
        return 'Portal Orang Tua';
    }
  }, [subTab]);

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

  const student = dashboard?.student || children.find((child) => String(child.id || child.student_id) === selectedId);

  // Nama depan + fallback tahun ajaran untuk subtitle hero statis
  const heroFirstName = useMemo(
    () => resolveStudentDisplay(student, user).firstName,
    [student, user]
  );
  const heroSubtitleFallback = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `Tahun Ajaran ${y}/${y + 1}` : `Tahun Ajaran ${y - 1}/${y}`;
  }, []);

  const goToLoopChild = useCallback((targetIndex: number, isDirectTap = false): void => {
    if (children.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(children.length - 1, targetIndex));
    const targetChild = children[clampedIndex];
    if (targetChild) {
      const targetId = String(targetChild.id || targetChild.student_id);
      lastHandledGlobalChildIdRef.current = targetId;
      scrollToActiveChild(clampedIndex, true);
      void selectChild(targetId);
    }
  }, [children, selectChild, scrollToActiveChild]);

  const handleStudentScrollEnd = (e: any) => {
    isUserDraggingRef.current = false;
    if (isSyncingDataRef.current || isProgrammaticScrollRef.current) return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / studentSnapInterval);
    if (index >= 0 && index < children.length) {
      const targetChild = children[index];
      if (targetChild && String(targetChild.id || targetChild.student_id) !== String(selectedId)) {
        void selectChild(String(targetChild.id || targetChild.student_id));
      }
    }
  };
  const rawAttRate = dashboard?.kpi?.attendance_summary?.rate ?? dashboard?.kpi?.attendance_rate ?? dashboard?.kpi?.attendance_rate_formatted;
  const attRate = rawAttRate != null ? (typeof rawAttRate === 'number' ? `${rawAttRate}%` : String(rawAttRate)) : '—';
  const attPresentDays = (dashboard as any)?.kpi?.attendance_summary?.present_days;
  const attTotalDays = (dashboard as any)?.kpi?.attendance_summary?.total_days;
  const attDetailLabel = (attPresentDays != null && attTotalDays != null && attTotalDays > 0)
    ? `${attPresentDays}/${attTotalDays} Hari`
    : 'Presensi';
  const tahfizhText = dashboard?.latest_tahfizh?.surah_name 
    ? `${dashboard.latest_tahfizh.surah_name}` 
    : (dashboard?.tahfizh?.juz ? `Juz ${dashboard.tahfizh.juz}` : 'Tahfizh Aktif');
  const avgGrade = dashboard?.grades?.average ?? (dashboard?.kpi?.average_grade ?? '—');
  const billStatus = dashboard?.parent_summary?.tagihan?.status_label 
    ?? (dashboard?.bills?.unpaid_count === 0 || !dashboard?.bills?.unpaid_count ? 'Lunas' : 'Belum Lunas');
  const billColor = billStatus === 'Lunas' ? '#059669' : '#DC2626';

  return (
    <View style={styles.rootContainer}>
      {/* 0. STICKY HEADER BERSAMA (top bar + card siswa, sama dengan halaman lain) */}
      <StudentStickyHeader
        scrollY={scrollY}
        topInset={topInset}
        title={screenTitle}
        navigation={navigation}
        route={route}
        student={student}
        user={user}
        childrenList={children}
        selectedChildId={selectedId}
        onSelectChild={(cid) => {
          const idx = children.findIndex((c: any) => String(c.id || c.student_id) === String(cid));
          if (idx >= 0) {
            heroScrollRef.current?.scrollTo({ x: idx * (SCREEN_WIDTH - 50 + 12), animated: true });
          }
          void selectChild(cid);
        }}
        middleAction={{
          label: 'Jadwal',
          icon: 'calendar-clock',
          onPress: () => openScheduleForStudent(student),
        }}
        onOpenIdCard={(s) => openIdCard(s)}
        onOpenQr={(s) => openQrCard(s)}
        onOpenWeeklyReport={(s) => setSelectedWeeklyStudent(s)}
        onOpenMenu={(s) => setSelectedMenuStudent(s)}
      />

      {/* 2. MAIN SCROLLABLE CONTENT */}
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F4FAF7', '#EAF7F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: bottomPadding }]}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} colors={['#0E5C44']} progressViewOffset={topInset + 10} />}
        >
          {/* Top Bar Statis (ketika belum di-scroll) — sama style dengan halaman lain */}
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
                  {screenTitle}
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

        {/* Badan Halaman Konten (section portal mengatur padding sendiri) */}
        {error ? (
          <View style={styles.error}>
            <View style={styles.errorContent}>
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.8} style={styles.retryBtn} onPress={() => void load()}>
              <MaterialCommunityIcons name="refresh" size={13} color="#059669" />
              <Text style={styles.retry}>Muat ulang</Text>
            </TouchableOpacity>
          </View>
        ) : null}

      {/* DATA ANANDA (kartu siswa standar, sama dengan halaman lain) */}
      {children.length > 0 ? (
        <Animated.View
          style={[
            styles.studentSectionOuter,
            {
              opacity: bodyCardOpacity,
              transform: [{ translateY: bodyCardTranslateY }],
            },
          ]}
        >
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
                ref={heroScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={studentSnapInterval}
                decelerationRate="fast"
                onScrollBeginDrag={() => {
                  isUserDraggingRef.current = true;
                }}
                onMomentumScrollEnd={handleStudentScrollEnd}
                onScrollEndDrag={handleStudentScrollEnd}
                style={styles.heroCardScrollContainer}
                contentContainerStyle={styles.heroCardScroll}
              >
                {children.map((child, idx) => (
                  <StudentHeroCard
                    key={String(child.id || idx)}
                    child={child}
                    isSelected={String(child.id || child.student_id) === selectedId}
                    isSingleChild={false}
                    showActionButtons={true}
                    cardWidth={studentCardWidth}
                    cardLabel="Kartu Siswa"
                    calendarLabel="Jadwal"
                    portalLabel="Menu"
                    onSelect={() => goToLoopChild(idx, true)}
                    onPressCard={() => openIdCard(child)}
                    onPressQr={() => openQrCard(child)}
                    onPressWeeklyReport={() => setSelectedWeeklyStudent(child)}
                    onPressNotifications={() => navigation?.navigate('Notifikasi')}
                    onPressCalendar={() => openScheduleForStudent(child)}
                    onPressPortal={() => setSelectedMenuStudent(child)}
                  />
                ))}
              </ScrollView>

              {/* DOT INDIKATOR SCROLL SISWA */}
              <View style={styles.paginationDotsRow}>
                {children.map((c, i) => {
                  const isDotActive = String(c.id || c.student_id) === selectedId;
                  return (
                    <TouchableOpacity
                      key={String(c.id || i)}
                      onPress={() => {
                        heroScrollRef.current?.scrollTo({ x: i * (SCREEN_WIDTH - 50 + 12), animated: true });
                        void selectChild(String(c.id || c.student_id));
                      }}
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
      ) : student ? (
        <Animated.View
          style={[
            styles.studentSectionOuter,
            {
              opacity: bodyCardOpacity,
              transform: [{ translateY: bodyCardTranslateY }],
            },
          ]}
        >
          <View style={portalBodyStyles.sectionHeaderBetween}>
            <View style={portalBodyStyles.sectionHeaderLeft}>
              <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
              <Text style={portalBodyStyles.sectionTitleBold}>Data Ananda</Text>
            </View>
          </View>

          <View style={styles.singleHeroCardContainer}>
            <StudentHeroCard
              child={student}
              isSelected={true}
              isSingleChild={true}
              showActionButtons={true}
              cardLabel="Kartu Siswa"
              calendarLabel="Jadwal"
              portalLabel="Menu"
              onPressCard={() => openIdCard(student)}
              onPressQr={() => openQrCard(student)}
              onPressWeeklyReport={() => setSelectedWeeklyStudent(student)}
              onPressNotifications={() => navigation?.navigate('Notifikasi')}
              onPressCalendar={() => openScheduleForStudent(student)}
              onPressPortal={() => setSelectedMenuStudent(student)}
            />
          </View>
        </Animated.View>
      ) : null}

      {/* SUB-TAB PORTAL (Evaluasi / Mutabaah / Setoran / Target / Izin) */}
      <View style={portalBodyStyles.filterSectionBlock}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={portalBodyStyles.filterPillsScroll}
        >
          {[
            { key: 'evaluasi', label: 'Evaluasi' },
            { key: 'mutabaah', label: 'Mutabaah' },
            { key: 'setoran', label: 'Setoran' },
            { key: 'target', label: 'Target' },
            { key: 'ortu', label: 'Izin' },
          ].map((tab) => {
            const isActive = subTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.8}
                onPress={() => setSubTab(tab.key as any)}
                style={[
                  portalBodyStyles.filterCapsuleBtn,
                  isActive && portalBodyStyles.filterCapsuleBtnActive,
                ]}
              >
                <Text
                  style={[
                    portalBodyStyles.filterCapsuleText,
                    isActive && portalBodyStyles.filterCapsuleTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {subTab === 'evaluasi' && (
      <>
      {/* 4 KPI QUICK STATS ROW */}
      {student && (
        <View style={styles.kpiRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.kpiMiniCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
            onPress={() => navigation?.navigate('Absensi', { child_id: selectedId })}
          >
            <MaterialCommunityIcons name="calendar-check" size={20} color="#16A34A" />
            <Text style={styles.kpiMiniValue}>{attRate}</Text>
            <Text style={styles.kpiMiniLabel}>{attDetailLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.kpiMiniCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
            onPress={() => navigation?.navigate('Tahfizh', { child_id: selectedId })}
          >
            <MaterialCommunityIcons name="book-open-variant" size={20} color="#D97706" />
            <Text numberOfLines={1} style={styles.kpiMiniValue}>{tahfizhText}</Text>
            <Text style={styles.kpiMiniLabel}>Tahfizh</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.kpiMiniCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
            onPress={() => navigation?.navigate('Nilai', { child_id: selectedId })}
          >
            <MaterialCommunityIcons name="chart-bell-curve" size={20} color="#2563EB" />
            <Text style={styles.kpiMiniValue}>{avgGrade}</Text>
            <Text style={styles.kpiMiniLabel}>Rata Nilai</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.kpiMiniCard, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}
            onPress={() => navigation?.navigate('Tagihan', { child_id: selectedId })}
          >
            <MaterialCommunityIcons name="cash-check" size={20} color={billColor} />
            <Text style={[styles.kpiMiniValue, { color: billColor }]}>{billStatus}</Text>
            <Text style={styles.kpiMiniLabel}>SPP & Tagihan</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SECTION TITLE: MENU KEBUTUHAN ORANG TUA */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeadingText}>Menu Kebutuhan Orang Tua</Text>
        <Text style={styles.sectionHeadingSub}>Layanan Eksklusif Wali</Text>
      </View>

      {loading && !student ? (
        <ActivityIndicator color="#0E5C44" style={styles.loader} />
      ) : (
        <View style={styles.gridContainer}>
          {GRID_MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.8}
              style={[
                styles.gridCard,
                { backgroundColor: item.cardBg, borderColor: item.borderColor },
              ]}
              onPress={() => handleGridMenuPress(item)}
            >
              <View style={styles.gridIconWrap}>
                <MaterialCommunityIcons name={item.icon as never} size={26} color={item.iconColor} />
              </View>
              <Text numberOfLines={2} style={styles.gridLabel}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      </>
      )}

      {subTab === 'mutabaah' && (() => {
        const monitoring = dashboard?.mutabaah_monitoring;
        const periods = monitoring?.periods || {};
        const activePeriod = periods[mutabaahPeriod] || periods.harian || monitoring;
        const scoreVal = activePeriod?.score != null ? Math.round(Number(activePeriod.score)) : 0;
        const isHarian = mutabaahPeriod === 'harian';
        const activeSemesterLabel = periods?.semester?.semester_name || periods?.semester?.badge || 'Semester Aktif';

        // 4 pillars
        const fardhuItems = activePeriod?.shalat_fardhu || [];
        const sunnahItems = activePeriod?.shalat_sunnah || [];
        const tilawahItems = activePeriod?.tilawah_dzikir || [];
        const adabItems = activePeriod?.adab_karakter || [];

        // category stats for non-harian
        const catStats = activePeriod?.category_stats || {};
        const tahfizhLogs = activePeriod?.tahfizh_logs || [];

        return (
          <View style={styles.tabSection}>
            {/* Header: Title & Info */}
            <View style={portalBodyStyles.sectionHeaderBetween}>
              <View style={portalBodyStyles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={20} color={PORTAL_BODY_PALETTE.listHeaderIcon} style={{ marginRight: 8 }} />
                <Text style={portalBodyStyles.sectionTitleBold}>Pemantauan Terpadu Mutaba’ah</Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>
                {activePeriod?.badge || 'Aktif'}
              </Text>
            </View>

            {/* 4 Capsule Filter Buttons (Harian, Mingguan, Bulanan, Semester) */}
            <View style={styles.periodFilterRow}>
              {[
                { id: 'harian', label: 'Harian', desc: 'Catatan Terakhir', icon: 'calendar-today' },
                { id: 'mingguan', label: 'Mingguan', desc: '7 Hari', icon: 'calendar-week' },
                { id: 'bulanan', label: 'Bulanan', desc: '30 Hari', icon: 'calendar-month' },
                { id: 'semester', label: 'Semester', desc: activeSemesterLabel, icon: 'school-outline' },
              ].map((p) => {
                const isSelected = mutabaahPeriod === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.8}
                    onPress={() => setMutabaahPeriod(p.id as any)}
                    style={[
                      styles.periodFilterBtn,
                      isSelected && styles.periodFilterBtnActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={p.icon as any}
                      size={13}
                      color={isSelected ? '#FFFFFF' : '#64748B'}
                      style={{ marginRight: 3 }}
                    />
                    <Text
                      style={[
                        styles.periodFilterBtnText,
                        isSelected && styles.periodFilterBtnTextActive,
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Hero Card Skor & Periode */}
            <LinearGradient
              colors={['#ECFDF5', '#F0FDFA', '#FFFFFF']}
              style={styles.mutabaahHeroCard}
            >
              <View style={styles.mutabaahHeroTop}>
                <View style={styles.mutabaahHeroScoreCircle}>
                  <Text style={styles.mutabaahHeroScoreVal}>{scoreVal}%</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.mutabaahHeroTitle}>
                    {isHarian
                      ? 'Kepatuhan Ibadah Harian'
                      : mutabaahPeriod === 'mingguan'
                      ? 'Rata-rata Kepatuhan Mingguan'
                      : mutabaahPeriod === 'bulanan'
                      ? 'Rata-rata Kepatuhan Bulanan'
                      : 'Indeks Kumulatif Semester'}
                  </Text>
                  <Text style={styles.mutabaahHeroSub}>
                    {isHarian
                      ? (activePeriod?.date_display || activePeriod?.sub_label || 'Hari Ini')
                      : `${activePeriod?.date_range || activePeriod?.sub_label || '-'} · ${activePeriod?.days_active || 0} Hari Aktif`}
                  </Text>
                </View>
                <View style={styles.mutabaahHeroBadge}>
                  <Text style={styles.mutabaahHeroBadgeText}>
                    {scoreVal >= 90 ? 'Istiqamah' : scoreVal >= 75 ? 'Tertib' : 'Evaluasi'}
                  </Text>
                </View>
              </View>

              {/* Tombol Buka Mutabaah Lengkap */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.mutabaahOpenBtn}
                onPress={() => navigation?.navigate('Mutabaah', {
                  child_id: selectedId ? String(selectedId) : undefined,
                  initial_period: mutabaahPeriod === 'harian' ? 'daily' : mutabaahPeriod === 'mingguan' ? 'weekly' : mutabaahPeriod === 'bulanan' ? 'monthly' : 'semester',
                })}
              >
                <MaterialCommunityIcons name="book-open-page-variant" size={15} color="#059669" style={{ marginRight: 6 }} />
                <Text style={styles.mutabaahOpenBtnText}>Buka Buku Mutaba'ah Lengkap</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color="#059669" />
              </TouchableOpacity>
            </LinearGradient>

            {/* Tren Kepatuhan Harian Khusus Mingguan */}
            {mutabaahPeriod === 'mingguan' && Array.isArray(activePeriod?.daily_trend) && activePeriod.daily_trend.length > 0 && (
              <View style={styles.trendCard}>
                <View style={styles.trendHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="trending-up" size={16} color="#059669" />
                    <Text style={styles.trendTitle}>Tren Kepatuhan Harian (Pekan Ini)</Text>
                  </View>
                  <Text style={styles.trendAvg}>Rata-rata: {scoreVal}%</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendList}>
                  {activePeriod.daily_trend.map((d: any, idx: number) => (
                    <View key={idx} style={styles.trendItem}>
                      <Text style={styles.trendDayText}>{d.day || d.date}</Text>
                      <Text style={styles.trendScoreText}>{d.score ? `${Math.round(d.score)}%` : '-'}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 4 Kartu Rekap Kategori Kumulatif untuk Non-Harian */}
            {!isHarian && (
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
            )}

            {/* Rincian Komprehensif 4 Pilar Amalan */}
            <View style={styles.breakdownContainer}>
              <View style={styles.breakdownHeaderRow}>
                <MaterialCommunityIcons name="star-four-points-outline" size={16} color="#059669" />
                <Text style={styles.breakdownHeaderTitle}>
                  Rincian Kegiatan ({activePeriod?.label || mutabaahPeriod})
                </Text>
                <Text style={styles.breakdownHeaderSub}>29 Agenda Amalan</Text>
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
                        {!isHarian && it.good_count != null && (
                          <Text style={styles.pillarItemSub}>
                            {it.good_count}/{it.total_days} Hari ({it.rate}%)
                          </Text>
                        )}
                      </View>
                      <View style={[styles.pillarItemBadge, { backgroundColor: '#ECFDF5' }]}>
                        <Text style={[styles.pillarItemBadgeText, { color: '#065F46' }]}>
                          {isHarian ? (it.status_value === 'good' ? 'Terlaksana' : 'Cukup') : (it.status_label || 'Istiqamah')}
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
                        {!isHarian && it.good_count != null && (
                          <Text style={styles.pillarItemSub}>
                            {it.good_count}/{it.total_days} Hari ({it.rate}%)
                          </Text>
                        )}
                      </View>
                      <View style={[styles.pillarItemBadge, { backgroundColor: '#F3E8FF' }]}>
                        <Text style={[styles.pillarItemBadgeText, { color: '#5B21B6' }]}>
                          {isHarian ? (it.status_value === 'good' ? 'Rutin' : 'Cukup') : (it.status_label || 'Rutin')}
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
                        {!isHarian && it.good_count != null && (
                          <Text style={styles.pillarItemSub}>
                            {it.good_count}/{it.total_days} Hari ({it.rate}%)
                          </Text>
                        )}
                      </View>
                      <View style={[styles.pillarItemBadge, { backgroundColor: '#E0F2FE' }]}>
                        <Text style={[styles.pillarItemBadgeText, { color: '#0369A1' }]}>
                          {isHarian ? (it.status_value === 'good' ? 'Aktif' : 'Cukup') : (it.status_label || 'Aktif')}
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
                        {!isHarian && it.good_count != null && (
                          <Text style={styles.pillarItemSub}>
                            {it.good_count}/{it.total_days} Hari ({it.rate}%)
                          </Text>
                        )}
                      </View>
                      <View style={[styles.pillarItemBadge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[styles.pillarItemBadgeText, { color: '#92400E' }]}>
                          {isHarian ? (it.status_value === 'good' ? 'Baik' : 'Evaluasi') : (it.status_label || 'Baik')}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Riwayat Setoran Tahfizh pada Periode Ini (Khusus Mingguan, Bulanan, Semester) */}
            {!isHarian && tahfizhLogs.length > 0 && (
              <View style={styles.tahfizhLogsCard}>
                <View style={styles.tahfizhLogsHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="book-check-outline" size={17} color="#0D9488" />
                    <Text style={styles.tahfizhLogsTitle}>
                      Riwayat Setoran Tahfizh ({activePeriod?.label || mutabaahPeriod})
                    </Text>
                  </View>
                  <Text style={styles.tahfizhLogsCount}>{tahfizhLogs.length} Setoran</Text>
                </View>
                {tahfizhLogs.map((log: any) => (
                  <View key={log.id} style={styles.tahfizhLogRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.tahfizhLogSurah}>{log.surah}</Text>
                        <View style={styles.tahfizhLogAyahBadge}>
                          <Text style={styles.tahfizhLogAyahText}>{log.ayah_range}</Text>
                        </View>
                      </View>
                      <Text numberOfLines={2} style={styles.tahfizhLogNotes}>{log.notes}</Text>
                      <Text style={styles.tahfizhLogMeta}>
                        Penguji: {log.teacher_name} · {log.date}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={styles.tahfizhLogScoreBadge}>
                        <Text style={styles.tahfizhLogScoreText}>Nilai {log.score}</Text>
                      </View>
                      <Text style={styles.tahfizhLogQuality}>{log.quality}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })()}

      {subTab === 'setoran' && (
        <View style={styles.tabSection}>
          <View style={portalBodyStyles.sectionHeaderBetween}>
            <View style={portalBodyStyles.sectionHeaderLeft}>
              <MaterialCommunityIcons name="book-check-outline" size={20} color={PORTAL_BODY_PALETTE.listHeaderIcon} style={{ marginRight: 8 }} />
              <Text style={portalBodyStyles.sectionTitleBold}>
                Setoran Tahfizh ({setoranLogs.length})
              </Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              const sid = selectedId || targetChildId;
              if (sid) {
                const sidStr = String(sid);
                navigation.navigate('Tahfizh', { child_id: sidStr, student_id: sidStr, tab: 'history' });
              } else {
                navigation.navigate('Tahfizh', { tab: 'history' });
              }
            }}
            style={styles.openTahfizhBanner}
          >
            <MaterialCommunityIcons name="book-open-page-variant" size={22} color="#059669" />
            <View style={{ flex: 1 }}>
              <Text style={styles.openTahfizhTitle}>Buka Modul Tahfizh Lengkap</Text>
              <Text style={styles.openTahfizhSub}>Akses mushaf digital, rekaman suara ustadz, dan formulir setoran di modul Tahfizh</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#059669" />
          </TouchableOpacity>
          {tabLoading ? (
            <View style={portalBodyStyles.loadingBox}>
              <ActivityIndicator size="large" color={PORTAL_BODY_PALETTE.loadingIndicator} />
              <Text style={portalBodyStyles.loadingText}>Memuat setoran...</Text>
            </View>
          ) : setoranLogs.length === 0 ? (
            <View style={portalBodyStyles.emptyCard}>
              <MaterialCommunityIcons name="book-open-page-variant" size={46} color={PORTAL_BODY_PALETTE.emptyIcon} />
              <Text style={portalBodyStyles.emptyTitle}>Belum Ada Setoran</Text>
              <Text style={portalBodyStyles.emptySubtitle}>Riwayat setoran tahfizh ananda akan tampil di sini.</Text>
            </View>
          ) : (
            setoranLogs.map((item: any, idx: number) => {
              const title = item.hafalan_surah_name || item.tilawah_text || item.murajaah_text || 'Setoran Tahfizh';
              const ayatStart = item.hafalan_ayah_start ?? item.ayat_start ?? item.hafalan_ayat_start;
              const ayatEnd = item.hafalan_ayah_end ?? item.ayat_end ?? item.hafalan_ayat_end;
              const dateStr = item.record_date || item.created_at;
              const statusStr = String(item.status || item.nilai || item.predikat || 'Tercatat');
              return (
                <View key={String(item.id || idx)} style={styles.tabCard}>
                  <View style={styles.tabRowTop}>
                    <Text numberOfLines={1} style={styles.tabRowTitle}>{title}</Text>
                    <View style={styles.tabStatusBadge}>
                      <Text style={styles.tabStatusBadgeText}>{statusStr}</Text>
                    </View>
                  </View>
                  <Text style={styles.tabRowMeta}>
                    {ayatStart && ayatEnd ? `Ayat ${ayatStart}–${ayatEnd}` : 'Setoran'} · {dateStr ? new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                  </Text>
                  {(item.teacher?.full_name || item.teacher?.name) && (
                    <Text style={styles.tabRowMeta}>Pembimbing: {item.teacher.full_name || item.teacher.name}</Text>
                  )}
                </View>
              );
            })
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.tabPrimaryBtn}
            onPress={() => navigation?.navigate('Tahfizh', selectedId ? { child_id: String(selectedId) } : undefined)}
          >
            <MaterialCommunityIcons name="book-open-page-variant" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.tabPrimaryBtnText}>Buka Tahfizh Lengkap</Text>
          </TouchableOpacity>
        </View>
      )}

      {subTab === 'target' && (
        <View style={styles.tabSection}>
          <View style={portalBodyStyles.sectionHeaderBetween}>
            <View style={portalBodyStyles.sectionHeaderLeft}>
              <MaterialCommunityIcons name="trophy-outline" size={20} color={PORTAL_BODY_PALETTE.listHeaderIcon} style={{ marginRight: 8 }} />
              <Text style={portalBodyStyles.sectionTitleBold}>Target Hafalan</Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              const sid = selectedId || targetChildId;
              if (sid) {
                const sidStr = String(sid);
                navigation.navigate('Tahfizh', { child_id: sidStr, student_id: sidStr, tab: 'target' });
              } else {
                navigation.navigate('Tahfizh', { tab: 'target' });
              }
            }}
            style={styles.openTahfizhBanner}
          >
            <MaterialCommunityIcons name="target" size={22} color="#059669" />
            <View style={{ flex: 1 }}>
              <Text style={styles.openTahfizhTitle}>Lihat Target & Kurikulum Lengkap</Text>
              <Text style={styles.openTahfizhSub}>Buka roadmap kurikulum hafalan dan status ketercapaian di Modul Tahfizh</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#059669" />
          </TouchableOpacity>
          {tabLoading ? (
            <View style={portalBodyStyles.loadingBox}>
              <ActivityIndicator size="large" color={PORTAL_BODY_PALETTE.loadingIndicator} />
              <Text style={portalBodyStyles.loadingText}>Memuat target...</Text>
            </View>
          ) : !setoranTarget ? (
            <View style={portalBodyStyles.emptyCard}>
              <MaterialCommunityIcons name="trophy-outline" size={46} color={PORTAL_BODY_PALETTE.emptyIcon} />
              <Text style={portalBodyStyles.emptyTitle}>Belum Ada Target</Text>
              <Text style={portalBodyStyles.emptySubtitle}>Target hafalan ananda akan tampil di sini.</Text>
            </View>
          ) : (
            <View style={styles.tabCard}>
              <View style={styles.tabInfoRow}>
                <Text style={styles.tabInfoLabel}>Juz target</Text>
                <Text style={styles.tabInfoValue}>
                  {setoranTarget.juz_target || setoranTarget.juz || setoranTarget.target_juz || '-'}
                </Text>
              </View>
              <View style={styles.tabInfoRow}>
                <Text style={styles.tabInfoLabel}>Ayat target</Text>
                <Text style={styles.tabInfoValue}>
                  {setoranTarget.ayat_target || setoranTarget.total_ayat || setoranTarget.target_ayat || '-'}
                </Text>
              </View>
              <View style={styles.tabInfoRow}>
                <Text style={styles.tabInfoLabel}>Progres</Text>
                <Text style={styles.tabInfoValue}>
                  {setoranTarget.progress || setoranTarget.progress_percent || setoranTarget.persen || '-'}
                </Text>
              </View>
              <View style={styles.tabInfoRow}>
                <Text style={styles.tabInfoLabel}>Periode</Text>
                <Text style={styles.tabInfoValue}>
                  {setoranTarget.periode || setoranTarget.period || setoranTarget.semester || '-'}
                </Text>
              </View>
              {(setoranTarget.catatan || setoranTarget.keterangan || setoranTarget.notes) && (
                <Text style={styles.tabRowMeta}>
                  {setoranTarget.catatan || setoranTarget.keterangan || setoranTarget.notes}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {subTab === 'ortu' && (
        <View style={styles.tabSection}>
          <View style={portalBodyStyles.sectionHeaderBetween}>
            <View style={portalBodyStyles.sectionHeaderLeft}>
              <MaterialCommunityIcons name="hand-heart-outline" size={20} color={PORTAL_BODY_PALETTE.listHeaderIcon} style={{ marginRight: 8 }} />
              <Text style={portalBodyStyles.sectionTitleBold}>
                Izin & Sakit ({permissionRows.length})
              </Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.tabPrimaryBtn}
            onPress={() => setIsPermissionModalOpen(true)}
          >
            <MaterialCommunityIcons name="plus-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.tabPrimaryBtnText}>Ajukan Izin / Sakit</Text>
          </TouchableOpacity>
          {tabLoading ? (
            <View style={portalBodyStyles.loadingBox}>
              <ActivityIndicator size="large" color={PORTAL_BODY_PALETTE.loadingIndicator} />
              <Text style={portalBodyStyles.loadingText}>Memuat riwayat izin...</Text>
            </View>
          ) : permissionRows.length === 0 ? (
            <View style={portalBodyStyles.emptyCard}>
              <MaterialCommunityIcons name="email-open-outline" size={46} color={PORTAL_BODY_PALETTE.emptyIcon} />
              <Text style={portalBodyStyles.emptyTitle}>Belum Ada Pengajuan</Text>
              <Text style={portalBodyStyles.emptySubtitle}>Riwayat izin dan sakit ananda akan tampil di sini.</Text>
            </View>
          ) : (
            permissionRows.map((item: any, idx: number) => {
              const statusStr = String(item.status || 'pending');
              return (
                <View key={String(item.id || idx)} style={styles.tabCard}>
                  <View style={styles.tabRowTop}>
                    <Text numberOfLines={1} style={styles.tabRowTitle}>
                      {item.type || item.jenis || 'Izin'}
                    </Text>
                    <View style={styles.tabStatusBadge}>
                      <Text style={styles.tabStatusBadgeText}>{statusStr}</Text>
                    </View>
                  </View>
                  <Text style={styles.tabRowMeta}>
                    {item.start_date || item.tanggal || '-'}
                    {item.end_date && item.end_date !== item.start_date ? ` s/d ${item.end_date}` : ''}
                  </Text>
                  {(item.reason || item.alasan || item.keterangan) && (
                    <Text style={styles.tabRowMeta}>
                      Alasan: {item.reason || item.alasan || item.keterangan}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}

        </Animated.ScrollView>
      </View>

      {/* ============================================================ */}
      {/* MODAL PENGAJUAN IZIN SANTRI                                  */}
      {/* ============================================================ */}
      <Modal
        visible={isPermissionModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPermissionModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleWrap}>
                <View style={styles.modalIconCircle}>
                  <MaterialCommunityIcons name="file-document-edit-outline" size={22} color="#E11D48" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Pengajuan Izin Santri</Text>
                  <Text style={styles.modalSubtitle}>
                    {student?.full_name || student?.name || 'Ananda'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsPermissionModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInputLabel}>Alasan / Keterangan Izin</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              placeholder="Tuliskan alasan pengajuan izin (sakit / keperluan mendesak keluarga)..."
              placeholderTextColor="#94A3B8"
              style={styles.modalTextInput}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsPermissionModalOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, submittingPermission && { opacity: 0.7 }]}
                onPress={() => void submitPermission()}
                disabled={submittingPermission}
                activeOpacity={0.85}
              >
                {submittingPermission ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
                    <Text style={styles.modalSubmitText}>Kirim Izin</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
  screen: { flex: 1, backgroundColor: 'transparent' },
  // Struktur scroll + hero statis disamakan plek dengan halaman lain
  mainScrollContent: {
    flexGrow: 1,
  },
  // Pembungkus section Data Ananda (section portal lain mengatur padding sendiri)
  studentSectionOuter: {
    paddingHorizontal: 16,
    paddingTop: 14,
    marginBottom: 2,
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
  heroCardScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
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
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
  },
  kpiMiniCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.2,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiMiniValue: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 4,
    textAlign: 'center',
  },
  kpiMiniLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  sectionHeaderRow: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionHeadingText: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionHeadingSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  // Sub-tab Setoran / Target / Mutabaah / Izin (per anak terpilih)
  tabSection: {
    marginBottom: 16,
  },
  tabCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E8F5EE',
    padding: 14,
    marginBottom: 10,
    shadowColor: '#064E3B',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tabRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tabRowTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  tabStatusBadge: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  tabStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  tabRowMeta: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 17,
  },
  tabInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tabInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabInfoValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  tabPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 4,
    marginBottom: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tabPrimaryBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  error: {
    margin: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
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
  errorText: { color: '#B91C1C', fontSize: 12, fontWeight: '500', flex: 1 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retry: { color: '#059669', fontWeight: '800', fontSize: 11 },
  children: { padding: 16, gap: 10 },
  child: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  childActive: { backgroundColor: '#1E8E5A', borderColor: '#1E8E5A' },
  childName: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  childMeta: { color: '#64748B', fontSize: 11, marginTop: 2 },
  white: { color: '#FFFFFF' },
  loader: { margin: 40 },
  body: { paddingHorizontal: 16 },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  monitoringSection: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  monitoringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  monitoringIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monitoringTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E293B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  monitoringSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  mutabaahQuickBox: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 12,
  },
  openTahfizhBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  openTahfizhTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  openTahfizhSub: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 2,
    lineHeight: 15,
  },
  mutabaahQuickHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mutabaahQuickIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutabaahQuickTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  mutabaahQuickDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  mutabaahActionBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#18A165',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  mutabaahActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  mutabaahActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  detailBox: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailBoxLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  detailBoxTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  detailBoxMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  pillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentBanner: { backgroundColor: '#D1FAE5', padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  studentLabel: { color: '#047857', fontSize: 10, fontWeight: '800' },
  studentName: { color: '#065F46', fontSize: 18, fontWeight: '900', marginTop: 3 },
  studentMeta: { color: '#047857', fontSize: 11, marginTop: 3 },
  attendance: { marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 15, padding: 15 },
  attendanceLabel: { color: '#64748B', fontSize: 11 },
  attendanceValue: { color: '#0E5C44', fontSize: 19, fontWeight: '900', marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  kpi: { width: '48%', padding: 14, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  kpiLabel: { color: '#64748B', fontSize: 11 },
  kpiValue: { color: '#0E5C44', fontSize: 20, fontWeight: '900', marginTop: 4 },
  sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '800', marginTop: 18, marginBottom: 9 },
  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  listRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  listTitle: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  listMeta: { color: '#64748B', fontSize: 11, marginTop: 3 },
  gradeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  grade: { color: '#0E5C44', fontSize: 18, fontWeight: '900' },
  empty: { color: '#94A3B8', fontSize: 12 },
  input: { minHeight: 80, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: 12, textAlignVertical: 'top', color: '#0F172A' },
  button: { marginTop: 10, backgroundColor: '#0E5C44', borderRadius: 12, padding: 13, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 22,
    rowGap: 10,
  },
  gridCard: {
    width: '31%',
    minHeight: 88,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  gridIconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  gridLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 13.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  modalTextInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 12,
    textAlignVertical: 'top',
    color: '#0F172A',
    fontSize: 13,
    backgroundColor: '#F8FAFC',
    marginBottom: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 12.5,
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#0E5C44',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
  // Pemantauan Terpadu Mutaba'ah & Tahfizh (4 Periode)
  periodFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  periodFilterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  periodFilterBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  periodFilterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  periodFilterBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  mutabaahHeroCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#064E3B',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  mutabaahHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mutabaahHeroScoreCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  mutabaahHeroScoreVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  mutabaahHeroTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  mutabaahHeroSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  mutabaahHeroBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  mutabaahHeroBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  mutabaahOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  mutabaahOpenBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    flex: 1,
    textAlign: 'center',
  },
  trendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trendTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  trendAvg: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  trendList: {
    gap: 8,
  },
  trendItem: {
    width: 68,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  trendDayText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  trendScoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
    marginTop: 2,
  },
  kpiCategoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
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
    textTransform: 'uppercase',
  },
  kpiCategoryTag: {
    fontSize: 9,
    fontWeight: '800',
  },
  kpiCategoryRate: {
    fontSize: 18,
    fontWeight: '900',
  },
  kpiCategoryCount: {
    fontSize: 10,
    fontWeight: '600',
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
  breakdownContainer: {
    marginBottom: 12,
    gap: 10,
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
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  breakdownHeaderSub: {
    fontSize: 10,
    fontWeight: '700',
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
  },
  pillarTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  pillarCount: {
    fontSize: 10,
    fontWeight: '800',
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
    color: '#1E293B',
  },
  pillarItemSub: {
    fontSize: 9.5,
    color: '#64748B',
    marginLeft: 12,
    marginTop: 1,
  },
  pillarItemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillarItemBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  tahfizhLogsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    padding: 12,
    marginBottom: 12,
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
    color: '#115E59',
  },
  tahfizhLogsCount: {
    fontSize: 10,
    fontWeight: '800',
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
    color: '#0F766E',
  },
  tahfizhLogNotes: {
    fontSize: 10.5,
    color: '#475569',
    marginTop: 2,
  },
  tahfizhLogMeta: {
    fontSize: 9.5,
    color: '#94A3B8',
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
    color: '#FFFFFF',
  },
  tahfizhLogQuality: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0D9488',
    marginTop: 2,
  },

  // Student Carousel & Quick Switcher Styles
  studentCarouselHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
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
    paddingHorizontal: 2,
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

