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
import { TeacherHeroCard } from '../components/TeacherHeroCard';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { EmptyStateCard } from '../components/EmptyStateCard';

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

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const studentScrollRef = useRef<ScrollView>(null);

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

  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 50 + 12;
    const index = Math.round(offsetX / cardWidth);
    if (index >= 0 && index < children.length) {
      const targetChild = children[index];
      if (targetChild && String(targetChild.id) !== selectedChildId) {
        setSelectedChildId(String(targetChild.id));
      }
    }
  };

  const selectChildWithScroll = (childId: string, index: number) => {
    setSelectedChildId(childId);
    studentScrollRef.current?.scrollTo({
      x: index * (SCREEN_WIDTH - 50 + 12),
      animated: true,
    });
  };

  // Siswa aktif untuk sticky header & hero (anak terpilih -> info siswa -> profil -> user)
  const headerStudent = useMemo(() => {
    if (children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[0];
    }
    if (studentInfo) return studentInfo;
    return (user as any)?.student || user || null;
  }, [children, selectedChildId, studentInfo, user]);

  // Nama depan + fallback tahun ajaran untuk subtitle hero statis
  const heroFirstName = useMemo(
    () => resolveStudentDisplay(headerStudent, user).firstName,
    [headerStudent, user]
  );
  const heroSubtitleFallback = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `Tahun Ajaran ${y}/${y + 1}` : `Tahun Ajaran ${y - 1}/${y}`;
  }, []);

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

  // 1. Load Children if parent (Isolasi data 1 anak terpilih jika ada child_id)
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
      mobileApiService.getPortalChildren()
        .then((res) => {
          const arr = unwrapApiData<Child[]>(res) || [];
          if (isMounted) {
            const filteredArr = targetChildId
              ? arr.filter((c) => String(c.id) === String(targetChildId))
              : arr;
            setChildren(filteredArr.length > 0 ? filteredArr : arr);
            if (targetChildId) {
              setSelectedChildId(String(targetChildId));
            } else if (!selectedChildId && arr.length > 0) {
              setSelectedChildId(useActiveChildStore.getState().activeChildId || String(arr[0].id));
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, route?.params?.child_id]);

  // 2. Load summary from backend
  const loadSummary = useCallback(async () => {
    if (isTeacherOnly) {
      return;
    }
    try {
      const res = await mobileApiService.getPortalSchoolInformationSummary({
        child_id: selectedChildId,
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
  }, [isTeacherOnly, selectedChildId]);

  // 3. Load items from database API
  const loadItems = useCallback(async (targetPage = 1) => {
    const cacheKey = offlineCache.buildKey('school_info', user?.id, selectedChildId);
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
          child_id: selectedChildId,
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
  }, [isTeacherOnly, selectedChildId, selectedTab, searchQuery, showBookmarkedOnly, user?.id]);

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
    if (Array.isArray(summary?.important) && summary.important.length > 0) {
      return summary.important.map(normalizeInfoItem);
    }
    return items.filter((i) => i.priority === 'mendesak' || i.priority === 'penting').slice(0, 3);
  }, [summary?.important, items]);
  const unreadCount = summary?.unread_count ?? 0;
  const bookmarkedCount = summary?.bookmarked_count ?? 0;

  const categoryCounts = useMemo(() => {
    const rawAll = totalItems || items.length;
    const pengumuman = items.filter((i) => {
      const c = String(i.category || i.type || '').toLowerCase();
      return c.includes('announcement') || c.includes('pengumuman') || c.includes('ppdb') || c.includes('umum');
    }).length;
    const berita = items.filter((i) => {
      const c = String(i.category || i.type || '').toLowerCase();
      return c.includes('news') || c.includes('berita') || c.includes('prestasi');
    }).length;
    const agenda = items.filter((i) => {
      const c = String(i.category || i.type || '').toLowerCase();
      return c.includes('event') || c.includes('agenda') || c.includes('kegiatan') || c.includes('kalender');
    }).length;
    return {
      all: counts.all ?? rawAll,
      announcement: counts.announcement ?? (pengumuman || 0),
      news: counts.news ?? (berita || 0),
      event: counts.event ?? (agenda || 0),
      circular: counts.circular ?? 0,
      calendar: counts.calendar ?? 0,
      gallery: counts.gallery ?? 0,
    };
  }, [items, totalItems, counts]);

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
      {/* 0. STICKY HEADER BERSAMA */}
      {isTeacherOnly ? (
        <TeacherStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Informasi Sekolah"
          subtitle="Agenda & Pengumuman Sekolah"
          navigation={navigation}
          route={route}
          user={user}
          chips={[
            { label: 'Semua', active: selectedTab === 'all', onPress: () => setSelectedTab('all') },
            { label: 'Pengumuman', active: selectedTab === 'announcement', onPress: () => setSelectedTab('announcement') },
            { label: 'Agenda', active: selectedTab === 'event', onPress: () => setSelectedTab('event') },
            { label: 'Berita', active: selectedTab === 'news', onPress: () => setSelectedTab('news') },
          ]}
        />
      ) : (
        <StudentStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Informasi Sekolah"
          navigation={navigation}
          route={route}
          student={headerStudent}
          user={user}
          childrenList={children}
          selectedChildId={selectedChildId}
          onSelectChild={(cid, idx) => {
            selectChildWithScroll(cid, idx);
            useActiveChildStore.getState().setActiveChildId(cid);
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
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: Math.max(bottomInset + 72, 94) }]}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} progressViewOffset={topInset + 10} />
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
                  Informasi Sekolah
                </Text>
                <Text numberOfLines={1} style={styles.heroModuleSubtitle}>
                  {isTeacherOnly
                    ? 'Agenda, Berita & Pengumuman'
                    : (isParent && heroFirstName
                        ? `Ananda ${heroFirstName}`
                        : (heroFirstName || heroSubtitleFallback))}
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
            {/* 1. RINGKASAN KPI INFORMASI & BERITA (WARNA GRADASI MODERN) */}
            <View style={styles.kpiCardsGrid}>
              {/* Card 1: Total Informasi */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedTab('all')}
                style={[styles.kpiCard, styles.kpiCardEmerald, selectedTab === 'all' && styles.kpiCardActive]}
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
                style={[styles.kpiCard, styles.kpiCardSky, selectedTab === 'announcement' && styles.kpiCardActive]}
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
                style={[styles.kpiCard, styles.kpiCardPurple, selectedTab === 'news' && styles.kpiCardActive]}
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
                style={[styles.kpiCard, styles.kpiCardAmber, selectedTab === 'event' && styles.kpiCardActive]}
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
                  <Text style={styles.itemTotalBadgeText}>{items.length} Data</Text>
                </View>
              </View>

              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color="#18A165" size="large" />
                  <Text style={styles.loadingText}>Memuat data informasi & berita sekolah...</Text>
                </View>
              ) : items.length > 0 ? (
                items.map((item, idx) => {
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
                              style={styles.bookmarkIconBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityRole="button"
                              accessibilityLabel={item.is_bookmarked ? 'Hapus Simpan' : 'Simpan'}
                            >
                              <MaterialCommunityIcons
                                name={item.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
                                size={19}
                                color={item.is_bookmarked ? '#F59E0B' : '#94A3B8'}
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
                              <MaterialCommunityIcons name="account-outline" size={13} color="#94A3B8" />
                              <Text numberOfLines={1} style={styles.cardMetaText}>
                                {item.publisher}
                              </Text>
                            </View>
                            <View style={styles.cardMetaDot} />
                            <View style={styles.cardMetaItem}>
                              <MaterialCommunityIcons name="calendar-outline" size={13} color="#94A3B8" />
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
  },
  modernCardTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 19,
    marginBottom: 5,
  },
  modernCardSummary: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
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
    fontSize: 10,
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
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 20,
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
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
    marginBottom: 14,
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
