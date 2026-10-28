import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
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
import { isParentRole, isTeacherRole, isStaffRole } from '../utils/roles';
import {
  getProfileImageUrl,
  getStudentAvatarSource,
} from '../utils/profile';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
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

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type Child = Record<string, any>;
type InfoItem = Record<string, any>;

export const normalizeInfoItem = (item: any): InfoItem => {
  const meta = item?.data_tambahan || {};
  const rawCat = item?.category || meta.kategori || item?.type || 'Pengumuman';
  const rawType = item?.type || meta.tipe || 'announcement';
  const rawPriority = String(item?.priority || meta.prioritas || 'umum').toLowerCase();
  const rawDate = item?.published_at || item?.mulai_tampil || item?.created_at;
  const rawUnit = item?.education_unit || meta.unit_name || meta.unit || 'Seluruh Yayasan';
  const rawImage = item?.cover || item?.image_url || item?.gambar_url || meta.gambar_url || meta.cover || null;
  const rawContent = item?.content || item?.isi_pengumuman || item?.isi || item?.summary || '';
  const rawSummary = item?.summary || meta.ringkasan || (typeof rawContent === 'string' ? rawContent.replace(/<[^>]+>/g, '').slice(0, 160) : '');

  return {
    ...item,
    id: String(item?.id ?? item?.slug ?? item?.title ?? item?.judul ?? 'info-item'),
    title: item?.title || item?.judul_pengumuman || item?.judul || 'Informasi Sekolah',
    summary: rawSummary,
    content: rawContent,
    category: rawCat,
    type: rawType,
    priority: rawPriority,
    education_unit: rawUnit,
    publisher: item?.publisher || meta.penerbit || 'Pengelola Sekolah',
    published_at: rawDate,
    image_url: rawImage,
    attachments: item?.attachments || meta.lampiran || [],
    is_read: Boolean(item?.is_read),
    is_bookmarked: Boolean(item?.is_bookmarked),
  };
};

export const getCategoryTheme = (categoryOrType: string) => {
  const c = String(categoryOrType || '').toLowerCase();
  if (c.includes('berita') || c === 'news') {
    return {
      label: 'Berita',
      color: '#7C3AED',
      badgeBg: '#F5F3FF',
      badgeBorder: '#DDD6FE',
      cardBorder: '#DDD6FE',
      stripeBg: '#7C3AED',
      icon: 'newspaper',
      iconBg: '#EDE9FE',
    };
  }
  if (c.includes('agenda') || c === 'event') {
    return {
      label: 'Agenda',
      color: '#2563EB',
      badgeBg: '#EFF6FF',
      badgeBorder: '#BFDBFE',
      cardBorder: '#BFDBFE',
      stripeBg: '#2563EB',
      icon: 'calendar-star',
      iconBg: '#DBEAFE',
    };
  }
  if (c.includes('edaran') || c === 'circular') {
    return {
      label: 'Surat Edaran',
      color: '#EA580C',
      badgeBg: '#FFF7ED',
      badgeBorder: '#FED7AA',
      cardBorder: '#FED7AA',
      stripeBg: '#EA580C',
      icon: 'email-newsletter',
      iconBg: '#FFEDD5',
    };
  }
  if (c.includes('prestasi') || c === 'achievement') {
    return {
      label: 'Prestasi',
      color: '#D97706',
      badgeBg: '#FEF3C7',
      badgeBorder: '#FDE68A',
      cardBorder: '#FDE68A',
      stripeBg: '#D97706',
      icon: 'trophy',
      iconBg: '#FEF3C7',
    };
  }
  if (c.includes('akademik')) {
    return {
      label: 'Akademik',
      color: '#0284C7',
      badgeBg: '#F0F9FF',
      badgeBorder: '#BAE6FD',
      cardBorder: '#BAE6FD',
      stripeBg: '#0284C7',
      icon: 'school',
      iconBg: '#E0F2FE',
    };
  }
  if (c.includes('ppdb')) {
    return {
      label: 'PPDB',
      color: '#059669',
      badgeBg: '#ECFDF5',
      badgeBorder: '#A7F3D0',
      cardBorder: '#A7F3D0',
      stripeBg: '#059669',
      icon: 'account-plus-outline',
      iconBg: '#D1FAE5',
    };
  }
  if (c.includes('kalender') || c === 'calendar') {
    return {
      label: 'Kalender',
      color: '#0D9488',
      badgeBg: '#F0FDFA',
      badgeBorder: '#99F6E4',
      cardBorder: '#99F6E4',
      stripeBg: '#0D9488',
      icon: 'calendar-month-outline',
      iconBg: '#CCFBF1',
    };
  }
  if (c.includes('galeri') || c === 'gallery') {
    return {
      label: 'Galeri',
      color: '#E11D48',
      badgeBg: '#FFF1F2',
      badgeBorder: '#FECDD3',
      cardBorder: '#FECDD3',
      stripeBg: '#E11D48',
      icon: 'image-multiple-outline',
      iconBg: '#FFE4E6',
    };
  }
  return {
    label: 'Pengumuman',
    color: '#18A165',
    badgeBg: '#EBF8F2',
    badgeBorder: '#A7F3D0',
    cardBorder: '#D1FAE5',
    stripeBg: '#18A165',
    icon: 'bullhorn',
    iconBg: '#DEF7EC',
  };
};

export const getPriorityTheme = (priority: string) => {
  const p = String(priority || '').toLowerCase();
  if (p === 'mendesak') {
    return {
      label: 'Mendesak',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FCA5A5',
      icon: 'alert-decagram',
    };
  }
  if (p === 'penting') {
    return {
      label: 'Penting',
      color: '#D97706',
      bg: '#FEF3C7',
      border: '#FCD34D',
      icon: 'star',
    };
  }
  return {
    label: 'Umum',
    color: '#059669',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    icon: 'information-outline',
  };
};

export default function SchoolInformationScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const modalBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 20) + 16;
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const userRoles = useMemo(() => (roles?.length ? roles : user?.roles || []), [roles, user?.roles]);
  const isParent = isParentRole(userRoles);
  const isTeacher = isTeacherRole(userRoles) || isStaffRole(userRoles);
  const isTeacherOnly = Boolean(
    isTeacher && (!isParent || route?.params?.from_teacher_portal || !route?.params?.from_child_portal)
  );

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

  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const globalChildren = useActiveChildStore((state) => state.children);

  const [children, setChildren] = useState<Child[]>(() => {
    return globalChildren && globalChildren.length > 0 ? globalChildren : [];
  });
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(
    route?.params?.child_id ||
      route?.params?.student_id ||
      globalActiveChildId ||
      useActiveChildStore.getState().activeChildId ||
      (globalChildren && globalChildren[0]?.id ? String(globalChildren[0].id) : undefined)
  );
  const [studentInfo, setStudentInfo] = useState<any>(null);

  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

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

  // Sinkronisasi selectedChildId saat globalActiveChildId berubah dari luar
  useEffect(() => {
    if (globalActiveChildId && String(globalActiveChildId) !== String(selectedChildId)) {
      setSelectedChildId(String(globalActiveChildId));
    }
  }, [globalActiveChildId, selectedChildId]);

  // Sinkronisasi children dari global store jika tersedia
  useEffect(() => {
    if (globalChildren && globalChildren.length > 0 && children.length === 0) {
      setChildren(globalChildren);
    }
  }, [globalChildren, children.length]);

  // Siswa aktif untuk sticky header & hero (anak terpilih -> info siswa -> profil -> user)
  const headerStudent = useMemo(() => {
    const activeId = selectedChildId || globalActiveChildId || useActiveChildStore.getState().activeChildId;
    if (children && children.length > 0) {
      if (activeId) {
        const found = children.find(
          (c) => String(c.id || c.student_id) === String(activeId)
        );
        if (found) return found;
      }
      return children[0];
    }
    if (studentInfo) return studentInfo;
    return (user as any)?.student || user || null;
  }, [children, selectedChildId, globalActiveChildId, studentInfo, user]);

  // States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [items, setItems] = useState<InfoItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<InfoItem | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [showChildSelectorModal, setShowChildSelectorModal] = useState<boolean>(false);

  // 1. Load Children if parent (memuat semua anak, default ke activeChildId atau targetChildId)
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId =
        route?.params?.child_id ||
        route?.params?.student_id ||
        globalActiveChildId ||
        useActiveChildStore.getState().activeChildId;

      mobileApiService.getPortalChildren()
        .then((res) => {
          const arr = unwrapApiData<Child[]>(res) || [];
          if (isMounted && arr.length > 0) {
            setChildren(arr);
            if (targetChildId) {
              const matched = arr.find((c) => String(c.id || c.student_id) === String(targetChildId));
              if (matched) {
                const sid = String(matched.id || matched.student_id);
                setSelectedChildId(sid);
                useActiveChildStore.getState().setActiveChildId(sid);
              }
            } else if (!selectedChildId && arr.length > 0) {
              const defaultId = String(arr[0].id || arr[0].student_id);
              setSelectedChildId(defaultId);
              useActiveChildStore.getState().setActiveChildId(defaultId);
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, route?.params?.child_id, route?.params?.student_id, globalActiveChildId]);

  // Resolusi Identitas Siswa & Unit Terpilih
  const studentFullName = useMemo(() => {
    return (
      headerStudent?.nama_lengkap ||
      headerStudent?.full_name ||
      headerStudent?.name ||
      'Ananda Siswa'
    );
  }, [headerStudent]);

  const studentUnit = useMemo(() => {
    return (
      headerStudent?.educationUnit?.name ||
      headerStudent?.education_unit?.name ||
      headerStudent?.unit_name ||
      headerStudent?.education_unit_name ||
      headerStudent?.kelas?.unitPendidikan?.name ||
      headerStudent?.unit ||
      ''
    );
  }, [headerStudent]);

  const studentClass = useMemo(() => {
    return (
      headerStudent?.kelas?.nama_kelas ||
      headerStudent?.kelas?.name ||
      headerStudent?.class?.name ||
      headerStudent?.class_name ||
      headerStudent?.kelas ||
      ''
    );
  }, [headerStudent]);

  const studentAvatarSource = useMemo(() => {
    return getStudentAvatarSource(headerStudent);
  }, [headerStudent]);

  // Resolusi Dinamis Status Kehadiran Siswa Hari Ini (Single Source of Truth)
  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(headerStudent);
  }, [headerStudent]);

  // Informasi Unit Pendidikan Siswa Terpilih (100% Dinamis dari Database)
  const unitInfo = useMemo(() => {
    // 1. Prioritaskan unit dari siswa yang aktif dipilih (headerStudent)
    const studentEdu =
      headerStudent?.educationUnit ||
      headerStudent?.education_unit ||
      headerStudent?.kelas?.unitPendidikan ||
      null;

    // 2. Cocokkan apakah summary.unit sesuai dengan unit siswa aktif
    const isSummaryUnitMatch = Boolean(
      summary?.unit &&
      (String(summary.unit.id) === String(studentEdu?.id) ||
        !studentEdu ||
        (studentUnit && String(summary.unit.name || '').toLowerCase().trim() === String(studentUnit).toLowerCase().trim()))
    );

    const edu = studentEdu || (isSummaryUnitMatch ? summary?.unit : null);
    const meta = edu?.metadata || (isSummaryUnitMatch ? summary?.unit?.metadata : {}) || {};
    const unitName =
      edu?.name ||
      headerStudent?.unit_name ||
      headerStudent?.education_unit_name ||
      studentUnit ||
      (isSummaryUnitMatch ? summary?.unit?.name : '') ||
      '';
    const unitLevel = edu?.level || headerStudent?.jenjang || '';
    const akreditasi = meta?.accreditation || meta?.akreditasi || null;
    const npsn = meta?.npsn || edu?.code || null;
    const kepalaSekolah = meta?.principal_name || meta?.kepala_sekolah || null;
    const jamMasuk = edu?.jam_masuk ? String(edu.jam_masuk).slice(0, 5) : null;
    const jamPulang = edu?.jam_pulang ? String(edu.jam_pulang).slice(0, 5) : null;
    const alamat = meta?.address || meta?.alamat || null;
    const telepon = meta?.phone || meta?.telepon || null;
    const email = meta?.email || null;
    const city = meta?.city || null;

    return {
      name: unitName,
      level: unitLevel,
      akreditasi,
      npsn,
      kepalaSekolah,
      jamMasuk,
      jamPulang,
      alamat,
      telepon,
      email,
      city,
    };
  }, [summary?.unit, headerStudent, studentUnit]);

  // Helper filter ketat: hanya izinkan informasi yang khusus ditujukan untuk unit sekolah siswa (bukan 'all'/'semua unit'/'yayasan')
  const isStrictUnitMatch = useCallback((item: any, unit: string) => {
    if (!unit) return false;
    const u = String(item?.education_unit || item?.unit_name || item?.target_unit_name || item?.data_tambahan?.unit_name || '').toLowerCase().trim();
    // Tolak bila tidak ada unit atau berlabel semua unit / seluruh yayasan
    if (!u || u.includes('semua') || u.includes('seluruh') || u === 'all' || u.includes('yayasan')) {
      return false;
    }
    const s = String(unit).toLowerCase().trim();
    return u.includes(s) || s.includes(u);
  }, []);

  // Filter ketat (Hanya Unit Siswa Saja): Menyembunyikan informasi berlabel "all / semua unit"
  const displayItems = useMemo(() => {
    return items.filter((item) => isStrictUnitMatch(item, studentUnit));
  }, [items, studentUnit, isStrictUnitMatch]);

  // 2. Load summary from backend
  const loadSummary = useCallback(async () => {
    if (isTeacherOnly) {
      return;
    }
    try {
      const activeId = selectedChildId || globalActiveChildId || useActiveChildStore.getState().activeChildId;
      const res = await mobileApiService.getPortalSchoolInformationSummary({
        child_id: activeId ? String(activeId) : undefined,
        strict_unit: true,
      });
      const data = unwrapApiData<any>(res) || {};
      if (Array.isArray(data?.important)) {
        data.important = data.important.map(normalizeInfoItem);
      }
      setSummary(data);
      if (res?.student || data?.student) {
        setStudentInfo(res?.student || data?.student);
      }
    } catch {
      // safe fallback if offline
    }
  }, [isTeacherOnly, selectedChildId, globalActiveChildId]);

  // 3. Load items from database API
  const loadItems = useCallback(async (targetPage = 1) => {
    const activeId = selectedChildId || globalActiveChildId || useActiveChildStore.getState().activeChildId;
    const cacheKey = offlineCache.buildKey('school_info', user?.id, activeId);
    // 1. Baca cache dulu saat halaman pertama tanpa filter
    if (targetPage === 1 && !searchQuery.trim() && selectedTab === 'all' && !showBookmarkedOnly) {
      const cached = await offlineCache.get<{ items: InfoItem[]; total: number }>(cacheKey);
      if (cached?.items && cached.items.length > 0) {
        setItems(cached.items);
        setTotalItems(cached.total || cached.items.length);
      }
    }
    // 2. Fetch dari backend
    try {
      let list: InfoItem[] = [];
      let total = 0;

      if (isTeacherOnly) {
        const res = await mobileApiService.getTeacherAnnouncements({
          type: selectedTab === 'all' ? undefined : selectedTab,
          search: searchQuery.trim() || undefined,
          per_page: 15,
          page: targetPage,
        });
        const data = unwrapApiData<any>(res) || res?.data || res || [];
        list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        total = data?.total || list.length;
      } else {
        const params: Record<string, any> = {
          child_id: activeId ? String(activeId) : undefined,
          strict_unit: true,
          type: selectedTab === 'all' ? undefined : selectedTab,
          search: searchQuery.trim() || undefined,
          bookmarked: showBookmarkedOnly ? true : undefined,
          per_page: 15,
          page: targetPage,
        };

        const res = await mobileApiService.getPortalSchoolInformation(params);
        const data = unwrapApiData<any>(res) || {};
        list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        total = data?.total || list.length;
        if (res?.student || data?.student) {
          setStudentInfo(res?.student || data?.student);
        }
      }

      const normalizedList = list.map(normalizeInfoItem);
      setItems(normalizedList);
      setTotalItems(total || normalizedList.length);
      setPage(targetPage);
      // 3. Simpan ke cache saat halaman pertama tanpa filter
      if (targetPage === 1 && !searchQuery.trim() && selectedTab === 'all' && !showBookmarkedOnly && normalizedList.length > 0) {
        void offlineCache.set(cacheKey, { items: normalizedList, total: total || normalizedList.length });
      }
    } catch {
      // Offline: data cache sudah tampil dari step 1
    }
  }, [isTeacherOnly, selectedChildId, globalActiveChildId, selectedTab, searchQuery, showBookmarkedOnly, user?.id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadSummary(), loadItems(1)]);
    setLoading(false);
  }, [loadSummary, loadItems]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadSummary(), loadItems(1)]);
    setRefreshing(false);
  };

  // Actions
  const handleMarkAllRead = async () => {
    try {
      await mobileApiService.markAllSchoolInformationRead(selectedChildId);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Berhasil Menandai',
        message: 'Seluruh informasi telah ditandai sebagai dibaca.',
      });
      void loadAll();
    } catch {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menandai',
        message: 'Terjadi kendala saat menandai seluruh informasi telah dibaca.',
      });
    }
  };

  const handleToggleBookmark = async (item: InfoItem) => {
    const nextAction = item.is_bookmarked ? 'unbookmark' : 'bookmark';
    try {
      await mobileApiService.updateSchoolInformationState(item.id, nextAction, selectedChildId);
      // Update local item
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_bookmarked: !item.is_bookmarked } : i))
      );
      if (selectedItem?.id === item.id) {
        setSelectedItem((prev) => (prev ? { ...prev, is_bookmarked: !item.is_bookmarked } : null));
      }
      void loadSummary();
    } catch {
      // offline silent
    }
  };

  const handleOpenDetail = (item: InfoItem) => {
    setSelectedItem(item);
    if (!item.is_read) {
      void mobileApiService.updateSchoolInformationState(item.id, 'read', selectedChildId);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_read: true } : i))
      );
      void loadSummary();
    }
  };

  const handleResetFilter = () => {
    setSearchQuery('');
    setSelectedTab('all');
    setShowBookmarkedOnly(false);
  };

  const counts = summary?.counts || {};
  const importantItems: InfoItem[] = useMemo(() => {
    const raw = Array.isArray(summary?.important) && summary.important.length > 0
      ? summary.important.map(normalizeInfoItem)
      : items.filter((i) => i.priority === 'mendesak' || i.priority === 'penting');

    return raw.filter((item: InfoItem) => isStrictUnitMatch(item, studentUnit)).slice(0, 3);
  }, [summary?.important, items, studentUnit, isStrictUnitMatch]);
  const unreadCount = summary?.unread_count ?? 0;
  const bookmarkedCount = summary?.bookmarked_count ?? 0;

  const categoryCounts = useMemo(() => {
    const pengumuman = displayItems.filter((i) => {
      const c = String(i.category || i.type || '').toLowerCase();
      return c.includes('announcement') || c.includes('pengumuman') || c.includes('ppdb') || c.includes('umum');
    }).length;
    const berita = displayItems.filter((i) => {
      const c = String(i.category || i.type || '').toLowerCase();
      return c.includes('news') || c.includes('berita') || c.includes('prestasi');
    }).length;
    const agenda = displayItems.filter((i) => {
      const c = String(i.category || i.type || '').toLowerCase();
      return c.includes('event') || c.includes('agenda') || c.includes('kegiatan') || c.includes('kalender');
    }).length;
    const edaran = displayItems.filter((i) => {
      const c = String(i.category || i.type || '').toLowerCase();
      return c.includes('circular') || c.includes('edaran');
    }).length;
    const kalender = displayItems.filter((i) => {
      const c = String(i.category || i.type || '').toLowerCase();
      return c.includes('calendar') || c.includes('kalender');
    }).length;
    const galeri = displayItems.filter((i) => {
      const c = String(i.category || i.type || '').toLowerCase();
      return c.includes('gallery') || c.includes('galeri');
    }).length;

    return {
      all: displayItems.length,
      announcement: pengumuman,
      news: berita,
      event: agenda,
      circular: edaran,
      calendar: kalender,
      gallery: galeri,
    };
  }, [displayItems]);

  const categoryTabs = useMemo(() => [
    { key: 'all', label: 'Semua', count: categoryCounts.all, icon: 'bullhorn-outline', color: '#059669', activeGradient: ['#059669', '#10B981'] },
    { key: 'announcement', label: 'Pengumuman', count: categoryCounts.announcement, icon: 'bullhorn', color: '#0284C7', activeGradient: ['#0284C7', '#38BDF8'] },
    { key: 'news', label: 'Berita', count: categoryCounts.news, icon: 'newspaper', color: '#7C3AED', activeGradient: ['#7C3AED', '#A855F7'] },
    { key: 'event', label: 'Agenda', count: categoryCounts.event, icon: 'calendar-star', color: '#D97706', activeGradient: ['#D97706', '#FBBF24'] },
    { key: 'circular', label: 'Surat Edaran', count: categoryCounts.circular, icon: 'email-newsletter', color: '#EA580C', activeGradient: ['#EA580C', '#FB923C'] },
    { key: 'calendar', label: 'Kalender', count: categoryCounts.calendar, icon: 'calendar-month-outline', color: '#0D9488', activeGradient: ['#0D9488', '#2DD4BF'] },
    { key: 'gallery', label: 'Galeri', count: categoryCounts.gallery, icon: 'image-multiple-outline', color: '#E11D48', activeGradient: ['#E11D48', '#FB7185'] },
  ], [categoryCounts]);

  return (
    <View style={styles.rootContainer}>
      {/* ── Background Foliage Atas (IDENTIK DENGAN BERANDA & KALENDER AKADEMIK) ── */}
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

      {/* ── Clean Top Header (Fixed Luar ScrollView, IDENTIK DENGAN KALENDER AKADEMIK) ── */}
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
          Informasi Sekolah
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
            { paddingBottom: Math.max(bottomInset + 72, 94) },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#059669', '#10B981']}
              tintColor="#059669"
            />
          }
        >
          <View style={styles.cleanScrollInner}>
            <View style={styles.bodyContentWrapper}>
              {/* ── 0. OPEN PROFILE ROW (IDENTIK DENGAN BERANDA & KALENDER AKADEMIK) ── */}
              {!isTeacherOnly ? (
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
              ) : (
                <View style={styles.studentProfileRow}>
                  <View style={styles.studentAvatarRing}>
                    <Image
                      source={getStudentAvatarSource(user)}
                      style={styles.studentAvatarImg}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={styles.studentProfileInfoCol}>
                    <Text numberOfLines={1} style={styles.studentProfileName}>
                      {String((user as any)?.nama_lengkap || (user as any)?.full_name || (user as any)?.name || 'Dewan Guru')}
                    </Text>
                    <View style={styles.studentMetaRow}>
                      <MaterialCommunityIcons name="school" size={12} color="#047857" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.studentProfileUnitText}>
                        {String(
                          (user as any)?.employee?.unit_name ||
                            (user as any)?.employee?.educationUnit?.name ||
                            (user as any)?.unit_name ||
                            (user as any)?.unit ||
                            'Tenaga Pendidik & Kependidikan'
                        )}
                      </Text>
                    </View>
                    <View style={styles.studentActionBadgeRow}>
                      <View style={[styles.studentStatusBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                        <MaterialCommunityIcons name="shield-check" size={12} color="#059669" style={{ marginRight: 4 }} />
                        <Text style={[styles.studentStatusBadgeText, { color: '#059669' }]}>
                          {String(
                            (user as any)?.employee?.jabatan ||
                              (user as any)?.employee?.position ||
                              'Pendidik & Tenaga Kependidikan'
                          )}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* ── CARD INFORMASI SEKOLAH (COMPACT & SOFT MINT, BUKAN SOLID GELAP) ── */}
              {unitInfo.name ? (
                <View style={styles.compactUnitCard}>
                  <View style={styles.compactUnitCardHeader}>
                    <View style={styles.compactUnitIconBox}>
                      <MaterialCommunityIcons name="office-building-marker-outline" size={20} color="#047857" />
                    </View>
                    <View style={styles.compactUnitTitleCol}>
                      <Text numberOfLines={1} style={styles.compactUnitName}>
                        {unitInfo.name}
                      </Text>
                      <View style={styles.compactUnitBadgesRow}>
                        {unitInfo.akreditasi ? (
                          <View style={styles.compactUnitBadgeAmber}>
                            <MaterialCommunityIcons name="certificate-outline" size={11} color="#D97706" />
                            <Text style={styles.compactUnitBadgeAmberText}>
                              Akreditasi {unitInfo.akreditasi}
                            </Text>
                          </View>
                        ) : null}
                        {unitInfo.npsn ? (
                          <View style={styles.compactUnitBadgeMint}>
                            <MaterialCommunityIcons name="identifier" size={11} color="#059669" />
                            <Text style={styles.compactUnitBadgeMintText}>
                              NPSN {unitInfo.npsn}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {/* Info Detail Dinamis (Hanya tampil jika ada data nyata dari DB) */}
                  {(unitInfo.kepalaSekolah || (unitInfo.jamMasuk && unitInfo.jamPulang) || unitInfo.telepon || unitInfo.alamat) ? (
                    <View style={styles.compactUnitMetaList}>
                      {unitInfo.kepalaSekolah ? (
                        <View style={styles.compactUnitMetaItem}>
                          <MaterialCommunityIcons name="account-tie-outline" size={13} color="#059669" />
                          <Text numberOfLines={1} style={styles.compactUnitMetaText}>
                            Kepala Sekolah: <Text style={styles.compactUnitMetaHighlight}>{unitInfo.kepalaSekolah}</Text>
                          </Text>
                        </View>
                      ) : null}
                      {unitInfo.jamMasuk && unitInfo.jamPulang ? (
                        <View style={styles.compactUnitMetaItem}>
                          <MaterialCommunityIcons name="clock-outline" size={13} color="#059669" />
                          <Text numberOfLines={1} style={styles.compactUnitMetaText}>
                            KBM: <Text style={styles.compactUnitMetaHighlight}>{unitInfo.jamMasuk} - {unitInfo.jamPulang} WIB</Text>
                          </Text>
                        </View>
                      ) : null}
                      {unitInfo.telepon ? (
                        <View style={styles.compactUnitMetaItem}>
                          <MaterialCommunityIcons name="phone-outline" size={13} color="#059669" />
                          <Text numberOfLines={1} style={styles.compactUnitMetaText}>
                            Kontak: <Text style={styles.compactUnitMetaHighlight}>{unitInfo.telepon}</Text>
                          </Text>
                        </View>
                      ) : null}
                      {unitInfo.alamat ? (
                        <View style={styles.compactUnitMetaItem}>
                          <MaterialCommunityIcons name="map-marker-outline" size={13} color="#059669" />
                          <Text numberOfLines={1} style={styles.compactUnitMetaText}>
                            {unitInfo.alamat}{unitInfo.city ? `, ${unitInfo.city}` : ''}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

            {/* 1. RINGKASAN KPI INFORMASI & BERITA (WARNA GRADASI MODERN) */}
            <View style={styles.kpiCardsGrid}>
              {/* Card 1: Total Informasi */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedTab('all')}
                style={[styles.kpiCard, styles.kpiCardEmerald, selectedTab === 'all' && styles.kpiCardActiveEmerald]}
              >
                <View style={styles.kpiTopRow}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#DEF7EC' }]}>
                    <MaterialCommunityIcons name="bullhorn" size={17} color="#059669" />
                  </View>
                  <View style={[styles.kpiBadge, { backgroundColor: '#DEF7EC' }]}>
                    <Text style={[styles.kpiBadgeText, { color: '#047857' }]}>Semua</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={[styles.kpiValue, { color: '#064E3B' }]}>
                  {categoryCounts.all}
                </Text>
                <Text numberOfLines={1} style={[styles.kpiLabel, { color: '#047857' }]}>
                  Total Info & Warta
                </Text>
              </TouchableOpacity>

              {/* Card 2: Pengumuman Resmi */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedTab('announcement')}
                style={[styles.kpiCard, styles.kpiCardSky, selectedTab === 'announcement' && styles.kpiCardActiveSky]}
              >
                <View style={styles.kpiTopRow}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#E0F2FE' }]}>
                    <MaterialCommunityIcons name="newspaper-variant-outline" size={17} color="#0284C7" />
                  </View>
                  <View style={[styles.kpiBadge, { backgroundColor: '#E0F2FE' }]}>
                    <Text style={[styles.kpiBadgeText, { color: '#0369A1' }]}>Resmi</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={[styles.kpiValue, { color: '#0C4A6E' }]}>
                  {categoryCounts.announcement}
                </Text>
                <Text numberOfLines={1} style={[styles.kpiLabel, { color: '#0284C7' }]}>
                  Pengumuman
                </Text>
              </TouchableOpacity>

              {/* Card 3: Berita Sekolah */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedTab('news')}
                style={[styles.kpiCard, styles.kpiCardPurple, selectedTab === 'news' && styles.kpiCardActivePurple]}
              >
                <View style={styles.kpiTopRow}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#EDE9FE' }]}>
                    <MaterialCommunityIcons name="newspaper" size={17} color="#7C3AED" />
                  </View>
                  <View style={[styles.kpiBadge, { backgroundColor: '#EDE9FE' }]}>
                    <Text style={[styles.kpiBadgeText, { color: '#6D28D9' }]}>Publikasi</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={[styles.kpiValue, { color: '#4C1D95' }]}>
                  {categoryCounts.news}
                </Text>
                <Text numberOfLines={1} style={[styles.kpiLabel, { color: '#6D28D9' }]}>
                  Berita Sekolah
                </Text>
              </TouchableOpacity>

              {/* Card 4: Agenda Terpadu */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedTab('event')}
                style={[styles.kpiCard, styles.kpiCardAmber, selectedTab === 'event' && styles.kpiCardActiveAmber]}
              >
                <View style={styles.kpiTopRow}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#FEF3C7' }]}>
                    <MaterialCommunityIcons name="calendar-star" size={17} color="#D97706" />
                  </View>
                  <View style={[styles.kpiBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.kpiBadgeText, { color: '#B45309' }]}>Kegiatan</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={[styles.kpiValue, { color: '#78350F' }]}>
                  {categoryCounts.event}
                </Text>
                <Text numberOfLines={1} style={[styles.kpiLabel, { color: '#B45309' }]}>
                  Agenda Terpadu
                </Text>
              </TouchableOpacity>
            </View>

            {/* 2. CATEGORY TABS HORIZONTAL SCROLL (WARNA WARNI & DINAMIS) */}
            <View style={styles.tabsSection}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
                {categoryTabs.map((tab) => {
                  const isActive = selectedTab === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      activeOpacity={0.78}
                      onPress={() => setSelectedTab(tab.key)}
                      style={[
                        styles.categoryTab,
                        isActive
                          ? { backgroundColor: tab.color, borderColor: tab.color }
                          : { borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={tab.icon as any}
                        size={15}
                        color={isActive ? '#FFFFFF' : tab.color}
                      />
                      <Text
                        style={[
                          styles.categoryTabText,
                          isActive ? { color: '#FFFFFF', fontWeight: '900' } : { color: '#334155' },
                        ]}
                      >
                        {tab.label}
                      </Text>
                      <View
                        style={[
                          styles.tabCountPill,
                          isActive
                            ? { backgroundColor: 'rgba(255, 255, 255, 0.28)' }
                            : { backgroundColor: '#F1F5F9' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabCountText,
                            isActive ? { color: '#FFFFFF' } : { color: '#64748B' },
                          ]}
                        >
                          {tab.count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* 3. PENCARIAN & QUICK FILTER ACTION ROW */}
            <View style={styles.searchSection}>
              <View style={styles.searchBox}>
                <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Cari judul berita, topik, atau isi pengumuman..."
                  placeholderTextColor="#94A3B8"
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {searchQuery.length > 0 ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Action Chips Row */}
              <View style={styles.quickFilterBar}>
                {/* Chip Bookmark */}
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                  style={[
                    styles.quickFilterChip,
                    showBookmarkedOnly
                      ? { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }
                      : { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={showBookmarkedOnly ? 'bookmark' : 'bookmark-outline'}
                    size={15}
                    color={showBookmarkedOnly ? '#D97706' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.quickFilterChipText,
                      showBookmarkedOnly ? { color: '#B45309', fontWeight: '900' } : { color: '#475569' },
                    ]}
                  >
                    Tersimpan {bookmarkedCount > 0 ? `(${bookmarkedCount})` : ''}
                  </Text>
                </TouchableOpacity>

                {/* Tombol Tandai Semua Dibaca */}
                {unreadCount > 0 && !isTeacherOnly && (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={handleMarkAllRead}
                    style={[styles.quickFilterChip, { backgroundColor: '#EBF8F2', borderColor: '#A7F3D0' }]}
                  >
                    <MaterialCommunityIcons name="check-all" size={15} color="#18A165" />
                    <Text style={[styles.quickFilterChipText, { color: '#065F46' }]}>
                      Tandai Dibaca ({unreadCount})
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Tombol Reset Filter */}
                {(searchQuery.trim().length > 0 || selectedTab !== 'all' || showBookmarkedOnly) && (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={handleResetFilter}
                    style={[styles.quickFilterChip, { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' }]}
                  >
                    <MaterialCommunityIcons name="filter-remove-outline" size={15} color="#64748B" />
                    <Text style={[styles.quickFilterChipText, { color: '#64748B' }]}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* 4. INFORMASI PRIORITAS & MENDESAK (HIGHLIGHT CARD) */}
            {selectedTab === 'all' && !searchQuery.trim() && !showBookmarkedOnly && importantItems.length > 0 && (
              <View style={styles.importantSection}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderTitleWrap}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={17} color="#D97706" />
                    <Text style={styles.sectionTitle}>Penting & Mendesak</Text>
                  </View>
                  <View style={styles.importantCountBadge}>
                    <Text style={styles.importantCountBadgeText}>{importantItems.length} Pengumuman</Text>
                  </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.importantScroll}>
                  {importantItems.map((item, idx) => {
                    const theme = getCategoryTheme(item.category || item.type);
                    const priorityTheme = getPriorityTheme(item.priority);
                    return (
                      <TouchableOpacity
                        key={item.id || idx}
                        activeOpacity={0.88}
                        onPress={() => handleOpenDetail(item)}
                        style={styles.importantCard}
                      >
                        <View style={styles.importantCardHeader}>
                          <View style={[styles.priorityBadge, { backgroundColor: priorityTheme.bg, borderColor: priorityTheme.border }]}>
                            <MaterialCommunityIcons name={priorityTheme.icon as any} size={11} color={priorityTheme.color} />
                            <Text style={[styles.priorityBadgeText, { color: priorityTheme.color }]}>
                              {priorityTheme.label}
                            </Text>
                          </View>

                          <TouchableOpacity
                            onPress={() => handleToggleBookmark(item)}
                            style={styles.cardBookmarkBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialCommunityIcons
                              name={item.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
                              size={18}
                              color={item.is_bookmarked ? '#F59E0B' : '#94A3B8'}
                            />
                          </TouchableOpacity>
                        </View>

                        <Text numberOfLines={2} style={styles.importantTitle}>
                          {item.title}
                        </Text>
                        <Text numberOfLines={2} style={styles.importantSummary}>
                          {item.summary}
                        </Text>

                        <View style={styles.importantFooter}>
                          <MaterialCommunityIcons name="school-outline" size={12} color="#059669" />
                          <Text numberOfLines={1} style={styles.importantFooterText}>
                            {item.education_unit || 'Seluruh Yayasan'}
                          </Text>
                          <MaterialCommunityIcons name="chevron-right" size={16} color="#D97706" />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* 5. FEED BERITA & INFORMASI DENGAN STYLING WARNA-WARNI KAYA */}
            <View style={styles.listSection}>
              <View style={styles.feedHeaderRow}>
                <View style={styles.feedHeaderTitleWrap}>
                  <MaterialCommunityIcons name="format-list-bulleted" size={17} color="#18A165" />
                  <Text style={styles.sectionTitle}>
                    {selectedTab === 'all'
                      ? 'Daftar Informasi & Berita'
                      : `Daftar ${categoryTabs.find((t) => t.key === selectedTab)?.label || 'Informasi'}`}
                  </Text>
                </View>
                <View style={styles.itemTotalBadge}>
                  <Text style={styles.itemTotalBadgeText}>{displayItems.length} Data</Text>
                </View>
              </View>

              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color="#18A165" size="large" />
                  <Text style={styles.loadingText}>Memuat data informasi & berita sekolah...</Text>
                </View>
              ) : displayItems.length > 0 ? (
                displayItems.map((item, idx) => {
                  const theme = getCategoryTheme(item.category || item.type);
                  const priorityTheme = getPriorityTheme(item.priority);
                  const isImportant = item.priority === 'penting' || item.priority === 'mendesak';
                  const dateStr = item.published_at
                    ? new Date(item.published_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'Terbaru';

                  return (
                    <TouchableOpacity
                      key={item.id || idx}
                      activeOpacity={0.88}
                      onPress={() => handleOpenDetail(item)}
                      style={[
                        styles.modernItemCard,
                        { borderLeftColor: theme.stripeBg },
                        !item.is_read && styles.modernItemCardUnread,
                      ]}
                    >
                      {/* Optional Cover/Image Preview Banner */}
                      {item.image_url ? (
                        <View style={styles.cardCoverWrap}>
                          <Image
                            source={{ uri: item.image_url }}
                            style={styles.cardCoverImage}
                            resizeMode="cover"
                          />
                          <LinearGradient
                            colors={['transparent', 'rgba(15, 23, 42, 0.65)']}
                            style={StyleSheet.absoluteFill}
                          />
                          <View style={styles.coverCategoryBadgeWrap}>
                            <View style={[styles.coverCategoryBadge, { backgroundColor: theme.color }]}>
                              <MaterialCommunityIcons name={theme.icon as any} size={12} color="#FFFFFF" />
                              <Text style={styles.coverCategoryBadgeText}>{theme.label}</Text>
                            </View>
                          </View>
                        </View>
                      ) : null}

                      <View style={styles.cardBodyPadding}>
                        {/* Top Badges Row */}
                        <View style={styles.cardTopBadgeRow}>
                          <View style={styles.cardBadgesGroup}>
                            {!item.image_url && (
                              <View
                                style={[
                                  styles.categoryBadgePill,
                                  { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
                                ]}
                              >
                                <MaterialCommunityIcons name={theme.icon as any} size={12} color={theme.color} />
                                <Text style={[styles.categoryBadgeText, { color: theme.color }]}>
                                  {theme.label}
                                </Text>
                              </View>
                            )}

                            {isImportant && (
                              <View
                                style={[
                                  styles.priorityBadgePill,
                                  { backgroundColor: priorityTheme.bg, borderColor: priorityTheme.border },
                                ]}
                              >
                                <MaterialCommunityIcons name={priorityTheme.icon as any} size={11} color={priorityTheme.color} />
                                <Text style={[styles.priorityBadgeText, { color: priorityTheme.color }]}>
                                  {priorityTheme.label}
                                </Text>
                              </View>
                            )}

                            {item.education_unit && (
                              <View style={styles.unitBadgePill}>
                                <MaterialCommunityIcons name="school-outline" size={11} color="#64748B" />
                                <Text numberOfLines={1} style={styles.unitBadgeText}>
                                  {item.education_unit}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.cardActionsRight}>
                            {!item.is_read && (
                              <View style={styles.newBadgePill}>
                                <View style={styles.newBadgeDot} />
                                <Text style={styles.newBadgeText}>Baru</Text>
                              </View>
                            )}

                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => handleToggleBookmark(item)}
                              style={[
                                styles.bookmarkIconBtn,
                                item.is_bookmarked && styles.bookmarkIconBtnActive,
                              ]}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityRole="button"
                              accessibilityLabel={item.is_bookmarked ? 'Hapus Simpan' : 'Simpan'}
                            >
                              <MaterialCommunityIcons
                                name={item.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
                                size={19}
                                color={item.is_bookmarked ? '#D97706' : '#94A3B8'}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Title */}
                        <Text numberOfLines={2} style={styles.modernCardTitle}>
                          {item.title}
                        </Text>

                        {/* Summary Excerpt */}
                        {item.summary ? (
                          <Text numberOfLines={2} style={styles.modernCardSummary}>
                            {item.summary}
                          </Text>
                        ) : null}

                        {/* Card Footer Metadata */}
                        <View style={styles.modernCardFooter}>
                          <View style={styles.cardMetaLeft}>
                            <View style={styles.cardMetaItem}>
                              <MaterialCommunityIcons name="account-outline" size={13} color="#64748B" />
                              <Text numberOfLines={1} style={styles.cardMetaText}>
                                {item.publisher}
                              </Text>
                            </View>
                            <View style={styles.cardMetaDot} />
                            <View style={styles.cardMetaItem}>
                              <MaterialCommunityIcons name="calendar-outline" size={13} color="#64748B" />
                              <Text style={styles.cardMetaText}>{dateStr}</Text>
                            </View>
                            {item.attachments && item.attachments.length > 0 && (
                              <>
                                <View style={styles.cardMetaDot} />
                                <View style={styles.cardMetaItem}>
                                  <MaterialCommunityIcons name="paperclip" size={13} color="#059669" />
                                  <Text style={[styles.cardMetaText, { color: '#059669', fontWeight: '800' }]}>
                                    {item.attachments.length} Berkas
                                  </Text>
                                </View>
                              </>
                            )}
                          </View>

                          <View style={styles.readMorePill}>
                            <Text style={[styles.readMoreText, { color: theme.color }]}>Detail</Text>
                            <MaterialCommunityIcons name="chevron-right" size={15} color={theme.color} />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <EmptyStateCard
                  icon="bullhorn-outline"
                  title="Belum Ada Informasi"
                  description="Tidak ditemukan berita atau pengumuman untuk filter kategori ini."
                />
              )}
            </View>
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

      {/* 7. FULL DETAIL MODAL */}
      <Modal
        visible={Boolean(selectedItem)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedItem(null)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedItem(null)} />
          <View style={[styles.modalContent, { paddingBottom: Math.max(modalBottomInset, 20) }]}>
            {selectedItem && (() => {
              const modalTheme = getCategoryTheme(selectedItem.category || selectedItem.type);
              const modalPriorityTheme = getPriorityTheme(selectedItem.priority);
              const isImportant = selectedItem.priority === 'penting' || selectedItem.priority === 'mendesak';
              const coverUrl = selectedItem.image_url || selectedItem.cover;

              return (
                <>
                  <View style={styles.modalHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        <View
                          style={[
                            styles.categoryBadgePill,
                            { backgroundColor: modalTheme.badgeBg, borderColor: modalTheme.badgeBorder },
                          ]}
                        >
                          <MaterialCommunityIcons name={modalTheme.icon as any} size={12} color={modalTheme.color} />
                          <Text style={[styles.categoryBadgeText, { color: modalTheme.color }]}>
                            {modalTheme.label}
                          </Text>
                        </View>

                        {isImportant && (
                          <View
                            style={[
                              styles.priorityBadgePill,
                              { backgroundColor: modalPriorityTheme.bg, borderColor: modalPriorityTheme.border },
                            ]}
                          >
                            <MaterialCommunityIcons name={modalPriorityTheme.icon as any} size={11} color={modalPriorityTheme.color} />
                            <Text style={[styles.priorityBadgeText, { color: modalPriorityTheme.color }]}>
                              {modalPriorityTheme.label}
                            </Text>
                          </View>
                        )}

                        {selectedItem.education_unit && (
                          <View style={styles.unitBadgePill}>
                            <MaterialCommunityIcons name="school-outline" size={11} color="#64748B" />
                            <Text numberOfLines={1} style={styles.unitBadgeText}>
                              {selectedItem.education_unit}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.modalTitle}>{selectedItem.title}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleToggleBookmark(selectedItem)}
                        style={styles.modalBookmarkBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons
                          name={selectedItem.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
                          size={22}
                          color={selectedItem.is_bookmarked ? '#F59E0B' : '#94A3B8'}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setSelectedItem(null)}
                        style={styles.modalCloseIconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                    {coverUrl && (
                      <View style={styles.modalCoverWrap}>
                        <Image
                          source={{ uri: coverUrl }}
                          style={styles.modalCoverImage}
                          resizeMode="cover"
                        />
                      </View>
                    )}

                    <View style={styles.modalMetaRow}>
                      <View style={styles.modalMetaItem}>
                        <MaterialCommunityIcons name="account-outline" size={14} color="#64748B" />
                        <Text style={styles.modalMetaPublisher}>{selectedItem.publisher || 'Pengelola Sekolah'}</Text>
                      </View>
                      <View style={styles.cardMetaDot} />
                      <View style={styles.modalMetaItem}>
                        <MaterialCommunityIcons name="calendar-clock-outline" size={14} color="#64748B" />
                        <Text style={styles.modalMetaDate}>
                          {selectedItem.published_at ? new Date(selectedItem.published_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Terbaru'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.modalFullContent}>
                      {selectedItem.content || selectedItem.summary || 'Tidak ada detail teks.'}
                    </Text>

                    {Array.isArray(selectedItem.attachments) && selectedItem.attachments.length > 0 && (
                      <View style={styles.attachmentBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <MaterialCommunityIcons name="paperclip" size={16} color="#059669" />
                          <Text style={styles.attachmentBoxTitle}>
                            Lampiran Dokumen ({selectedItem.attachments.length}):
                          </Text>
                        </View>
                        {selectedItem.attachments.map((att: any, idx: number) => (
                          <View key={idx} style={styles.attachmentItem}>
                            <MaterialCommunityIcons name="file-document-outline" size={16} color="#059669" />
                            <Text numberOfLines={1} style={styles.attachmentItemText}>
                              {att.nama || att.name || 'Dokumen Pendukung'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </ScrollView>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setSelectedItem(null)}
                    style={[styles.modalCloseBtn, { backgroundColor: modalTheme.color }]}
                  >
                    <Text style={styles.modalCloseBtnText}>Tutup Informasi</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Modal Pilih Siswa (Pilihan Ananda) ── */}
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
                  c.educationUnit?.name ||
                  c.education_unit?.name ||
                  c.unit_name ||
                  c.education_unit_name ||
                  c.kelas?.unitPendidikan?.name ||
                  '';
                const cClass =
                  c.kelas?.nama_kelas ||
                  c.kelas?.name ||
                  c.class?.name ||
                  c.class_name ||
                  '';

                return (
                  <TouchableOpacity
                    key={cId || idx}
                    activeOpacity={0.8}
                    onPress={() => {
                      setShowChildSelectorModal(false);
                      setSelectedChildId(cId);
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
                          isSelected && { color: '#004D32', fontWeight: '800' },
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

      {/* Modal Kartu Siswa (KTS) */}
      {selectedIdCardStudent && (
        <StudentIdCardModal
          visible={Boolean(selectedIdCardStudent)}
          student={selectedIdCardStudent}
          onClose={() => setSelectedIdCardStudent(null)}
        />
      )}

      {/* Modal QR Siswa */}
      {selectedQrStudent && (
        <StudentQrModal
          visible={Boolean(selectedQrStudent)}
          student={selectedQrStudent}
          onClose={() => setSelectedQrStudent(null)}
        />
      )}

      {/* Modal Menu Siswa */}
      {selectedMenuStudent && (
        <StudentMenuModal
          visible={Boolean(selectedMenuStudent)}
          student={selectedMenuStudent}
          navigation={navigation}
          onClose={() => setSelectedMenuStudent(null)}
        />
      )}

      {/* Modal Laporan Mingguan */}
      {selectedWeeklyStudent && (
        <StudentWeeklyReportModal
          visible={Boolean(selectedWeeklyStudent)}
          student={selectedWeeklyStudent}
          onClose={() => setSelectedWeeklyStudent(null)}
        />
      )}

      {/* Universal Feedback Modal */}
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
  screen: { flex: 1, backgroundColor: 'transparent' },
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
    marginBottom: 14,
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
    color: '#004D32',
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
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  studentStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  // Card Informasi Unit Sekolah Compact (Soft Mint & Bersih)
  compactUnitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  compactUnitCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactUnitIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  compactUnitTitleCol: {
    flex: 1,
  },
  compactUnitName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  compactUnitBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  compactUnitBadgeAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  compactUnitBadgeAmberText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },
  compactUnitBadgeMint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  compactUnitBadgeMintText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  compactUnitMetaList: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0FDF4',
    gap: 4,
  },
  compactUnitMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactUnitMetaText: {
    fontSize: 11,
    color: '#4B5563',
    flex: 1,
  },
  compactUnitMetaHighlight: {
    color: '#065F46',
    fontWeight: '700',
  },
  // Modal Pilih Ananda
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
  // 1. KPI Cards Grid & Styles
  kpiCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  kpiCardEmerald: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  kpiCardSky: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  kpiCardPurple: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  kpiCardAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  kpiCardActive: {
    borderWidth: 2,
    borderColor: '#059669',
  },
  kpiCardActiveEmerald: {
    borderWidth: 2,
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.16,
  },
  kpiCardActiveSky: {
    borderWidth: 2,
    borderColor: '#0284C7',
    shadowColor: '#0284C7',
    shadowOpacity: 0.16,
  },
  kpiCardActivePurple: {
    borderWidth: 2,
    borderColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.16,
  },
  kpiCardActiveAmber: {
    borderWidth: 2,
    borderColor: '#D97706',
    shadowColor: '#D97706',
    shadowOpacity: 0.16,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  kpiBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 1,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
  },

  // 2. Tabs Section
  tabsSection: {
    marginBottom: 12,
  },
  tabsScroll: {
    gap: 8,
    paddingRight: 10,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  categoryTabActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  categoryTabText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  tabCountPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: '900',
  },

  // 3. Search & Quick Filters
  searchSection: {
    marginBottom: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 7 : 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    marginLeft: 8,
    padding: 0,
    fontWeight: '600',
  },
  quickFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  quickFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  quickFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // 4. Important / Urgent Section
  importantSection: {
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
  importantCountBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  importantCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  importantScroll: {
    gap: 12,
    paddingRight: 10,
  },
  importantCard: {
    width: SCREEN_WIDTH * 0.76,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    shadowColor: '#D97706',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  importantCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  priorityBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardBookmarkBtn: {
    padding: 2,
  },
  importantTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 6,
  },
  importantSummary: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 10,
  },
  importantFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 'auto',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  importantFooterText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    flex: 1,
  },

  // 5. Feed List Section & Modern Cards
  listSection: {
    gap: 12,
  },
  feedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  feedHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemTotalBadge: {
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  itemTotalBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  modernItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: 'hidden',
  },
  modernItemCardUnread: {
    backgroundColor: '#FCFDFE',
    borderColor: '#CBD5E1',
  },
  cardCoverWrap: {
    width: '100%',
    height: 130,
    position: 'relative',
    overflow: 'hidden',
  },
  cardCoverImage: {
    width: '100%',
    height: '100%',
  },
  coverCategoryBadgeWrap: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  coverCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  coverCategoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardBodyPadding: {
    padding: 14,
  },
  cardTopBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardBadgesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  categoryBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  priorityBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  unitBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: 140,
  },
  unitBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },
  cardActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  newBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  newBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#DC2626',
  },
  bookmarkIconBtn: {
    padding: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bookmarkIconBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  modernCardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
    letterSpacing: -0.2,
    marginBottom: 5,
  },
  modernCardSummary: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 10,
  },
  modernCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardMetaText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  cardMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 2,
  },
  readMorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 6,
  },
  readMoreText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // 6. Detail Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  modalBookmarkBtn: {
    padding: 4,
  },
  modalCloseIconBtn: {
    padding: 4,
  },
  modalBody: {
    maxHeight: Dimensions.get('window').height * 0.55,
    marginBottom: 12,
  },
  modalCoverWrap: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  modalCoverImage: {
    width: '100%',
    height: '100%',
  },
  modalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  modalMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalMetaPublisher: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modalMetaDate: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  modalFullContent: {
    fontSize: 13.5,
    color: '#334155',
    lineHeight: 22,
    marginBottom: 16,
  },
  attachmentBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
    marginBottom: 10,
  },
  attachmentBoxTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
  },
  attachmentItemText: {
    fontSize: 11.5,
    color: '#059669',
    fontWeight: '700',
  },
  modalCloseBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  modalCloseBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
