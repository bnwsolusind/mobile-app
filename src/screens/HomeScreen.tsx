import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  Platform,
  StatusBar,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Card, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { SafeRemoteImage } from '../components/SafeRemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  isFoundationRole,
  isParentRole,
  isPrincipalRole,
  isStudentRole,
  isSuperAdminRole,
  isTeacherRole,
  roleLabel,
} from '../utils/roles';
import { getProfileImageUrl } from '../utils/profile';

const CARD_THEMES: Record<string, { primary: string; dark: string; secondary: string; soft: string; accent: string }> = {
  green: { primary: '#004D32', dark: '#003822', secondary: '#0E5C44', soft: '#ecfdf5', accent: '#E5A93C' },
  blue: { primary: '#1D4ED8', dark: '#1e40af', secondary: '#3B82F6', soft: '#eff6ff', accent: '#93C5FD' },
  purple: { primary: '#6D28D9', dark: '#5b21b6', secondary: '#8B5CF6', soft: '#f5f3ff', accent: '#C4B5FD' },
  orange: { primary: '#EA580C', dark: '#c2410c', secondary: '#F97316', soft: '#fff7ed', accent: '#FDBA74' },
  teal: { primary: '#0F766E', dark: '#115e59', secondary: '#14B8A6', soft: '#f0fdfa', accent: '#99F6E4' },
  navy: { primary: '#172554', dark: '#0f172a', secondary: '#1E3A8A', soft: '#eff6ff', accent: '#60A5FA' },
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.75, 290);
const NEWS_CARD_WIDTH = CARD_WIDTH + 30;
const ITEM_SPACING = 12;

function isValidHex(color: string | undefined): boolean {
  if (!color || typeof color !== 'string') return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color.trim());
}

type DashboardData = Record<string, any>;

const valueAt = (object: DashboardData, path: string): any => {
  const value = path.split('.').reduce<any>((current, key) => current?.[key], object);
  if (value && typeof value === 'object' && 'total' in value) return value.total;
  return value;
};

const firstValue = (data: DashboardData, paths: string[], fallback: string | number = '-') => {
  for (const path of paths) {
    const value = valueAt(data, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};

const listAt = (data: DashboardData, paths: string[]): any[] => {
  for (const path of paths) {
    const value = valueAt(data, path);
    if (Array.isArray(value)) return value;
  }
  return [];
};

const titleOf = (item: any): string =>
  item?.judul_pengumuman || item?.judul || item?.title || item?.subject?.name || item?.subject?.nama_mapel || 'Informasi Sekolah';

const subtitleOf = (item: any): string =>
  item?.data_tambahan?.ringkasan || item?.isi_pengumuman || item?.isi || item?.summary || item?.kelas?.nama_kelas || item?.class?.name || item?.time_start || '';

const NEWS_FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=400&q=80',
  'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=400&q=80',
  'https://images.unsplash.com/photo-1584697964190-7bb8514101e4?w=400&q=80',
  'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=400&q=80',
];

const getNewsThumbnail = (item: any, index: number) => {
  const uri = item?.image_url || item?.thumbnail || item?.cover_image || item?.foto || item?.file_path;
  if (uri && typeof uri === 'string' && uri.startsWith('http')) {
    return { uri };
  }
  return { uri: NEWS_FALLBACK_IMAGES[index % NEWS_FALLBACK_IMAGES.length] };
};

export default function HomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 16);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 18 : 10);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const mobileConfig = useMobileConfigStore((state) => state.config);
  const theme = mobileConfig.theme || {};

  const [dashboard, setDashboard] = useState<DashboardData>({});
  const [fetchedAnnouncements, setFetchedAnnouncements] = useState<any[]>([]);
  const [parentChildren, setParentChildren] = useState<any[]>([]);
  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);
  const studentScrollRef = useRef<ScrollView>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);
  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [cardSetting, setCardSetting] = useState<any>(null);
  const [mutabaahSubTab, setMutabaahSubTab] = useState<'mutabaah' | 'setoran' | 'target' | 'ortu'>('mutabaah');

  useEffect(() => {
    if (!selectedIdCardStudent) return;
    const unitId = selectedIdCardStudent.unit_id || selectedIdCardStudent.education_unit_id || selectedIdCardStudent.education_unit?.id;
    mobileApiService.getStudentCardSetting(unitId)
      .then((res: any) => {
        if (res?.data) {
          setCardSetting(res.data);
        }
      })
      .catch(() => {
        // Safe fallback
      });
  }, [selectedIdCardStudent]);
  const [idCardSide, setIdCardSide] = useState<'front' | 'back'>('front');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedNews, setSelectedNews] = useState<any>(null);
  const newsGradientStart = isValidHex(mobileConfig.theme?.news_gradient_start)
    ? (mobileConfig.theme.news_gradient_start as string)
    : '#FFFFFF';
  const newsGradientEnd = isValidHex(mobileConfig.theme?.news_gradient_end)
    ? (mobileConfig.theme.news_gradient_end as string)
    : '#E8F5E9';
  const [showAllNews, setShowAllNews] = useState<boolean>(false);
  const [imageError, setImageError] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [activeMenuPage, setActiveMenuPage] = useState(0);
  const [showAllMenusModal, setShowAllMenusModal] = useState(false);



  const setUser = useAuthStore((state) => state.setUser);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [dashRes, profRes, infoRes, notifRes, childrenRes] = await Promise.allSettled([
        mobileApiService.getRoleDashboard(roles),
        mobileApiService.getProfile(),
        mobileApiService.getSchoolInformation({ per_page: 10 }),
        mobileApiService.getNotifications(),
        mobileApiService.getPortalChildren(),
      ]);

      if (dashRes.status === 'fulfilled') {
        setDashboard(unwrapApiData<DashboardData>(dashRes.value) || {});
      }
      if (profRes.status === 'fulfilled') {
        const profile = profRes.value?.data?.data ?? profRes.value?.data ?? profRes.value;
        if (profile) setUser(profile);
      }
      if (infoRes.status === 'fulfilled') {
        const infoList = unwrapCollection<any>(infoRes.value);
        if (Array.isArray(infoList) && infoList.length > 0) {
          setFetchedAnnouncements(infoList);
        }
      }
      if (notifRes.status === 'fulfilled') {
        const notifData = unwrapCollection<any>(notifRes.value);
        if (Array.isArray(notifData)) {
          const unread = notifData.filter((n: any) => !n.read_at && !n.is_read).length;
          setUnreadNotificationCount(unread > 0 ? unread : 0);
        }
      }
      if (childrenRes.status === 'fulfilled') {
        const chList = unwrapApiData<any[]>(childrenRes.value) || [];
        if (Array.isArray(chList)) {
          setParentChildren(chList);
        }
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Dashboard belum berhasil dimuat.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [roles, setUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const foundation = isFoundationRole(roles);
  const superAdmin = isSuperAdminRole(roles);
  const principal = isPrincipalRole(roles);
  const teacher = isTeacherRole(roles);
  const parent = isParentRole(roles);
  const student = isStudentRole(roles);

  const announcements = useMemo(() => {
    const list = fetchedAnnouncements.length > 0
      ? fetchedAnnouncements
      : listAt(dashboard, [
          'tables.announcements',
          'recent_information',
          'agenda_yayasan',
          'announcements',
          'pengumuman_sekolah',
        ]);
    
    // Fallback Islamic announcements if database hasn't seeded any yet
    if (!list || list.length === 0) {
      return [
        {
          id: 1,
          judul_pengumuman: 'Libur Hari Raya Idul Adha',
          isi_pengumuman: 'Sekolah libur pada tanggal 17 Juni 2024 dalam rangka Hari Raya Idul Adha 1445 H. Kegiatan belajar mengajar akan dimulai kembali pada 19 Juni 2024.',
          created_at: '2024-05-12',
        },
        {
          id: 2,
          judul_pengumuman: 'Lomba Tahfiz',
          isi_pengumuman: 'Pendaftaran lomba tahfizh Al-Quran antar unit sekolah dibuka mulai 1 Juni 2024.',
          created_at: '2024-05-10',
        },
        {
          id: 3,
          judul_pengumuman: 'Pembayaran SPP',
          isi_pengumuman: 'Pembayaran SPP bulan Juni paling lambat tanggal 10 Juni 2024.',
          created_at: '2024-05-08',
        },
      ];
    }
    return list;
  }, [fetchedAnnouncements, dashboard]);

  const name = user?.name || user?.fullName || 'Pengguna';
  const profileImageUrl = getProfileImageUrl(user, dashboard);

  useEffect(() => {
    setImageError(false);
  }, [profileImageUrl]);

  const studentClass = dashboard?.student?.kelas?.nama_kelas || user?.kelas || 'Kelas 5A';
  const subGreeting = student
    ? `${studentClass} · Siswa`
    : parent
    ? `Orang Tua dari ${user?.student_name || 'Siswa'}`
    : teacher
    ? 'Guru Pengajar'
    : principal
    ? 'Kepala Sekolah'
    : foundation || superAdmin
    ? 'Divisi Pendidikan'
    : 'Tata Usaha';

  // 4-Column Dynamic Menus Mapped Per Role (Mockup #4)
  const roleMenus = useMemo(() => {
    if (principal) {
      return [
        ['Dashboard', 'view-dashboard-outline', '#059669', '#E6F4EA', 'Data'],
        ['Absensi', 'calendar-check-outline', '#0D9488', '#E6FFFA', 'Absensi'],
        ['Tahfiz', 'book-open-page-variant', '#10B981', '#ECFDF5', 'Lainnya'],
        ['Mutabaah', 'check-decagram-outline', '#047857', '#DEF7EC', 'Lainnya'],
        ['Akademik', 'school-outline', '#3B82F6', '#EFF6FF', 'Data'],
        ['Laporan', 'file-chart-outline', '#F59E0B', '#FEF3C7', 'Data'],
        ['Prestasi', 'trophy-outline', '#D97706', '#FFFBEB', 'Data'],
        ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
      ];
    }
    if (foundation || superAdmin) {
      return [
        ['Kalender', 'calendar-month-outline', '#0891B2', '#CFFAFE', 'Kalender'],
        ['Monev', 'chart-box-outline', '#4F46E5', '#EEF2FF', 'Data'],
        ['Tahfiz', 'book-open-page-variant', '#10B981', '#ECFDF5', 'Lainnya'],
        ['Mutabaah', 'check-decagram-outline', '#059669', '#E6F4EA', 'Lainnya'],
        ['Akademik', 'school-outline', '#2563EB', '#EFF6FF', 'Data'],
        ['Rapor', 'certificate-outline', '#0891B2', '#ECFEFF', 'Data'],
        ['Laporan', 'file-chart-outline', '#F59E0B', '#FEF3C7', 'Data'],
        ['Monitoring', 'monitor-dashboard', '#7C3AED', '#F5F3FF', 'Data'],
        ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
      ];
    }
    if (teacher) {
      return [
        ['Kalender', 'calendar-month-outline', '#0891B2', '#CFFAFE', 'Kalender'],
        ['Absensi', 'calendar-check-outline', '#059669', '#E6F4EA', 'Guru'],
        ['Tahfiz', 'book-open-page-variant', '#10B981', '#ECFDF5', 'Guru'],
        ['Mutabaah', 'check-decagram-outline', '#0D9488', '#E6FFFA', 'Guru'],
        ['Tugas', 'clipboard-text-outline', '#7C3AED', '#F5F3FF', 'Tugas'],
        ['Nilai', 'star-outline', '#F59E0B', '#FEF3C7', 'Guru'],
        ['Informasi', 'bullhorn-outline', '#4F46E5', '#E0E7FF', 'Informasi'],
        ['Jadwal', 'calendar-clock-outline', '#EA580C', '#FFF7ED', 'Jadwal'],
        ['Materi', 'book-open-page-variant-outline', '#2563EB', '#EFF6FF', 'Materi'],
        ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
      ];
    }
    if (parent) {
      return [
        ['Kalender', 'calendar-month-outline', '#0891B2', '#CFFAFE', 'Kalender'],
        ['Informasi', 'bullhorn-outline', '#4F46E5', '#E0E7FF', 'Informasi'],
        ['Jadwal', 'calendar-clock-outline', '#7C3AED', '#EDE9FE', 'Jadwal'],
        ['Materi', 'book-open-page-variant-outline', '#9333EA', '#F3E8FF', 'Materi'],
        ['Tugas', 'clipboard-text-outline', '#C026D3', '#FAE8FF', 'Tugas'],
        ['Tahfizh', 'book-check-outline', '#059669', '#D1FAE5', 'Orang Tua', 'tahfizh'],
        ['Nilai', 'star-outline', '#0D9488', '#CCFBF1', 'Orang Tua', 'grades'],
        ['Komentar', 'comment-text-outline', '#0891B2', '#CFFAFE', 'Orang Tua', 'student-notes'],
        ['Mutabaah', 'handshake-outline', '#D97706', '#FEF3C7', 'Orang Tua', 'mutabaah'],
        ['Absensi', 'calendar-check-outline', '#EA580C', '#FFEDD5', 'Orang Tua', 'attendance'],
        ['Kisi-kisi', 'file-document-outline', '#CA8A04', '#FEF9C3', 'Orang Tua', 'kisi'],
        ['Ujian CBT', 'file-check-outline', '#65A30D', '#ECFCCB', 'Orang Tua', 'ujian'],
        ['Hasil Rapor', 'certificate-outline', '#E11D48', '#FFE4E6', 'Orang Tua', 'hasil'],
      ];
    }
    if (student) {
      return [
        ['Kalender', 'calendar-month-outline', '#0891B2', '#CFFAFE', 'Kalender'],
        ['Absensi', 'calendar-check-outline', '#059669', '#E6F4EA', 'Siswa'],
        ['Informasi', 'bullhorn-outline', '#4F46E5', '#E0E7FF', 'Informasi'],
        ['Tahfiz', 'book-open-page-variant', '#10B981', '#ECFDF5', 'Siswa'],
        ['Mutabaah', 'check-decagram-outline', '#0D9488', '#E6FFFA', 'Siswa'],
        ['Tugas', 'clipboard-text-outline', '#7C3AED', '#F5F3FF', 'Tugas'],
        ['Nilai', 'star-outline', '#F59E0B', '#FEF3C7', 'Siswa'],
        ['Jadwal', 'calendar-clock-outline', '#EA580C', '#FFF7ED', 'Jadwal'],
        ['Materi', 'book-open-page-variant-outline', '#2563EB', '#EFF6FF', 'Materi'],
      ];
    }
    // Default Tata Usaha / Staff
    return [
      ['Data Siswa', 'account-group-outline', '#059669', '#E6F4EA', 'Data'],
      ['Absensi', 'calendar-check-outline', '#0D9488', '#E6FFFA', 'Absensi'],
      ['Keuangan', 'cash-multiple', '#F59E0B', '#FEF3C7', 'Data'],
      ['Surat', 'email-newsletter', '#047857', '#DEF7EC', 'Data'],
      ['Inventaris', 'archive-outline', '#2563EB', '#EFF6FF', 'Data'],
      ['Laporan', 'file-chart-outline', '#EA580C', '#FFF7ED', 'Data'],
      ['Arsip', 'folder-file-outline', '#7C3AED', '#F5F3FF', 'Data'],
      ['Pengaturan', 'cog-outline', '#64748B', '#F1F5F9', 'Lainnya'],
    ];
  }, [principal, foundation, superAdmin, teacher, parent, student]);

  const menuPages = useMemo(() => {
    const pages: any[][] = [];
    for (let i = 0; i < roleMenus.length; i += 8) {
      pages.push(roleMenus.slice(i, i + 8));
    }
    return pages;
  }, [roleMenus]);

  const handleCarouselScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (NEWS_CARD_WIDTH + ITEM_SPACING));
    if (index !== activeSlideIndex && index >= 0 && index < announcements.length) {
      setActiveSlideIndex(index);
    }
  };

  return (
    <View style={styles.safeArea}>
      {/* Top Header Bar (Green Gradient #18A165 matching reference image) */}
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={['#0D6B42', '#18A165', '#2BD988']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerBar, { paddingTop: topInset + 8 }]}
        >
          {/* Soft Organic Decorative Blobs / Waves (Like user screenshot) */}
          <View style={styles.headerDecorWave} />
          <View style={styles.headerDecorCircle} />

          <View style={styles.userProfileSection}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Profil')}
              style={styles.avatarWrapper}
            >
              {profileImageUrl && !imageError ? (
                <Image
                  source={{ uri: String(profileImageUrl) }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.greetingTextColumn}>
              <Text style={styles.greetingSub}>Assalamu'alaikum,</Text>
              <Text numberOfLines={1} style={styles.greetingName}>{name} 👋</Text>
              <Text numberOfLines={1} style={styles.greetingRole}>{subGreeting}</Text>
            </View>
          </View>

          {/* Notification Button with Badge Counter (White button with Green Icon) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Notifikasi')}
            style={styles.bellButton}
            accessibilityLabel="Notifikasi"
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color="#18A165" />
            {unreadNotificationCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Main Content Sheet with Curved Top & Gradient Body */}
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            colors={['#084835']}
          />
        }
        showsVerticalScrollIndicator={false}
      >

        {/* SECTION: Kartu Data Siswa (Bergeser / Horizontal Swiper Tanpa Tab) */}
        {parentChildren.length > 0 && (
          <View style={styles.studentCardContainer}>
            <View style={styles.studentCardHeaderRow}>
              <View style={styles.studentCardHeaderTitleWrap}>
                <Text style={styles.studentCardHeaderTitle}>Data Ananda</Text>
              </View>
              {parentChildren.length > 1 && (
                <View style={styles.studentCardCountBadge}>
                  <Text style={styles.studentCardCountBadgeText}>
                    {activeChildIndex + 1} dari {parentChildren.length} Ananda
                  </Text>
                </View>
              )}
            </View>

            {/* Horizontal Scrollable Track of Student Cards */}
            <ScrollView
              ref={studentScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.studentCardsTrack}
              decelerationRate="fast"
              snapToInterval={CARD_WIDTH + 40}
              onScroll={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const idx = Math.round(offsetX / (CARD_WIDTH + 40));
                if (idx !== activeChildIndex && idx >= 0 && idx < parentChildren.length) {
                  setActiveChildIndex(idx);
                }
              }}
              scrollEventThrottle={16}
            >
              {parentChildren.map((student: any, sIdx: number) => {
                const sName = student.full_name || student.nama_lengkap || student.name || 'Siswa';
                const sNis = student.nis || '-';
                const sNisn = student.nisn || student.metadata?.nisn || '-';
                const sUnit = student.education_unit?.name || student.unit_name || 'Unit Pendidikan';
                const sKelas = student.kelas?.nama_kelas || student.kelas?.name || student.class_name || 'Kelas Belum Ditentukan';
                const sJenjang = student.kelas?.jenjang || student.education_unit?.level || 'Terpadu';

                return (
                  <LinearGradient
                    key={String(student.id || sIdx)}
                    colors={['#0A5232', '#138A56', '#98E8BF']}
                    locations={[0, 0.6, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.studentMainCard,
                      { width: CARD_WIDTH + 30 },
                    ]}
                  >
                    {/* Decorative Blob Like Header */}
                    <View style={styles.cardDecorCircle} />

                    {/* Card Top Row: Avatar + Info + QR Icon */}
                    <View style={styles.studentCardTopRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedIdCardStudent(student)}
                        style={styles.studentAvatarBox}
                      >
                        {getProfileImageUrl(student) ? (
                          <Image
                            source={{ uri: getProfileImageUrl(student)! }}
                            style={styles.studentAvatarImg}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={styles.studentAvatarInitial}>
                            {sName.charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </TouchableOpacity>

                      <View style={styles.studentInfoCol}>
                        <View style={styles.studentNameBadgeRow}>
                          <Text numberOfLines={1} style={styles.studentFullName}>
                            {sName}
                          </Text>
                        </View>

                        <Text style={styles.studentNisText}>
                          NIS: {sNis} {sNisn !== '-' ? '· NISN: ' + sNisn : ''}
                        </Text>

                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {sUnit}
                          </Text>
                        </View>
                      </View>

                      {/* Icon Button QR Code Siswa (White button with green icon like bell on header) */}
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => setSelectedQrStudent(student)}
                        style={styles.studentQrBtn}
                        accessibilityLabel="Tampilkan QR Code Siswa"
                      >
                        <MaterialCommunityIcons name="qrcode-scan" size={18} color="#18A165" />
                        <Text style={styles.studentQrBtnText}>QR</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Card Middle: Key Student Attributes (Glassmorphism Box) */}
                    <View style={styles.studentAttributesGrid}>
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Kelas</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{sKelas}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Jenjang</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{sJenjang}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Presensi</Text>
                        <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Hadir</Text>
                      </View>
                    </View>

                    {/* Card Bottom: Quick Actions (Kartu Siswa, Kalender, Portal) */}
                    <View style={styles.studentCardActionsRow}>
                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => {
                          setIdCardSide('front');
                          setSelectedIdCardStudent(student);
                        }}
                        style={styles.studentActionBtnCard}
                      >
                        <MaterialCommunityIcons name="card-account-details-outline" size={15} color="#084835" style={{ marginRight: 4 }} />
                        <Text style={styles.studentActionBtnCardText}>Kartu Siswa</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => navigation.navigate('Kalender', { child_id: student.id })}
                        style={styles.studentActionBtnSecondary}
                      >
                        <MaterialCommunityIcons name="calendar-month-outline" size={15} color="#064E3B" style={{ marginRight: 4 }} />
                        <Text style={styles.studentActionBtnSecondaryText}>Kalender</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('Orang Tua')}
                        style={styles.studentActionBtnPrimary}
                      >
                        <Text style={styles.studentActionBtnPrimaryText}>Portal</Text>
                        <MaterialCommunityIcons name="arrow-right" size={14} color="#FFFFFF" style={{ marginLeft: 2 }} />
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>
                );
              })}
            </ScrollView>

            {/* Pagination Dots for Multiple Children */}
            {parentChildren.length > 1 && (
              <View style={styles.studentDotsRow}>
                {parentChildren.map((_, dotIdx) => (
                  <TouchableOpacity
                    key={dotIdx}
                    activeOpacity={0.7}
                    onPress={() => {
                      setActiveChildIndex(dotIdx);
                      studentScrollRef.current?.scrollTo({
                        x: dotIdx * (CARD_WIDTH + 40),
                        animated: true,
                      });
                    }}
                    style={[
                      styles.studentDot,
                      activeChildIndex === dotIdx ? styles.studentDotActive : styles.studentDotInactive,
                    ]}
                  />
                ))}
              </View>
            )}


          </View>
        )}

        {/* SECTION: Menu Utama (Maksimal 8 Ikon per Halaman, Geser Samping & Modal Lihat Semua) */}
        <View style={styles.menuSection}>
          <View style={styles.menuHeaderRow}>
            <Text style={styles.menuHeaderTitle}>Menu Utama</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setShowAllMenusModal(true)}
            >
              <Text style={[styles.seeAllText, { color: '#18A165' }]}>Lihat Semua</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const offsetX = e.nativeEvent.contentOffset.x;
              const page = Math.round(offsetX / (SCREEN_WIDTH - 40));
              if (page !== activeMenuPage && page >= 0 && page < menuPages.length) {
                setActiveMenuPage(page);
              }
            }}
            scrollEventThrottle={16}
          >
            {menuPages.map((pageItems, pIdx) => (
              <View key={pIdx} style={[styles.menuGridPage, { width: SCREEN_WIDTH - 40 }]}>
                {pageItems.map(([label, icon, color, bgPastel, route], idx) => {
                  const itemGlobalIdx = pIdx * 8 + idx;
                  const tabKey = (roleMenus[itemGlobalIdx] as any)?.[5];
                  return (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.75}
                      style={styles.menuItem}
                      onPress={() => {
                        if (tabKey) {
                          navigation.navigate(String(route), { tab: String(tabKey) });
                        } else {
                          navigation.navigate(String(route));
                        }
                      }}
                    >
                      <View style={[styles.iconSquircle, { backgroundColor: bgPastel }]}>
                        <MaterialCommunityIcons
                          name={String(icon) as never}
                          size={24}
                          color={String(color)}
                        />
                      </View>
                      <Text numberOfLines={1} style={styles.menuLabel}>
                        {String(label)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          {/* Dots Indicator untuk Halaman Menu Utama */}
          {menuPages.length > 1 && (
            <View style={styles.menuDotsRow}>
              {menuPages.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.menuDot,
                    activeMenuPage === i ? styles.menuDotActive : styles.menuDotInactive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        {/* SECTION: Berita & Informasi (Tanpa Gradasi & Tanpa Garis Container) */}
        <View style={styles.carouselContainerWrapper}>
          <View style={styles.carouselCleanBox}>
            <View style={styles.carouselHeaderRow}>
              <View style={styles.carouselTitleWrapper}>
                <Text style={styles.carouselHeaderTitle}>Berita & Informasi</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Informasi')}
              >
                <Text style={styles.seeAllText}>Lihat Semua</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselTrack}
              decelerationRate="fast"
              snapToInterval={NEWS_CARD_WIDTH + ITEM_SPACING}
              onScroll={handleCarouselScroll}
              scrollEventThrottle={16}
            >
              {announcements.map((item: any, index: number) => (
                <TouchableOpacity
                  key={String(item.id || index)}
                  activeOpacity={0.88}
                  onPress={() => setSelectedNews(item)}
                >
                  <LinearGradient
                    colors={['#158052', '#22A871', '#B8EBCE']}
                    locations={[0, 0.55, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.newsCard,
                      { width: NEWS_CARD_WIDTH },
                    ]}
                  >
                    {/* Decorative Organic Circle */}
                    <View style={styles.cardDecorCircle} />

                    {/* Top Row: Thumbnail Image + Content Column */}
                    <View style={styles.newsTopRow}>
                      <Image
                        source={getNewsThumbnail(item, index)}
                        style={styles.newsThumbnail}
                        resizeMode="cover"
                      />
                      <View style={styles.newsContentCol}>
                        <View style={styles.newsCardHeader}>
                          <Text numberOfLines={2} style={styles.newsCardTitle}>
                            {titleOf(item)}
                          </Text>
                          <View style={styles.newsChevronBox}>
                            <MaterialCommunityIcons name="chevron-right" size={14} color="#FFFFFF" />
                          </View>
                        </View>
                        <Text numberOfLines={2} style={styles.newsCardSnippet}>
                          {subtitleOf(item)}
                        </Text>
                      </View>
                    </View>

                    {/* Footer Row: Date Badge + Action */}
                    <View style={styles.newsCardFooter}>
                      <View style={styles.newsDateBadge}>
                        <MaterialCommunityIcons name="calendar-clock-outline" size={12} color="#DEF7EC" style={{ marginRight: 4 }} />
                        <Text style={styles.newsCardDate}>
                          {item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Terbaru'}
                        </Text>
                      </View>
                      <Text style={styles.newsReadMore}>Lihat Detail →</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Carousel Pagination Dots Indicator */}
            {announcements.length > 1 && (
              <View style={styles.dotsRow}>
                {announcements.slice(0, 6).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      activeSlideIndex === i ? styles.dotActive : styles.dotInactive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Loading Indicator */}
        {loading && !refreshing && (
          <View style={styles.inlineLoader}>
            <ActivityIndicator size="small" color="#084835" />
          </View>
        )}

        {/* Error Card */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        </ScrollView>
      </View>

      {/* MODAL QR CODE SISWA */}
      <Modal
        visible={Boolean(selectedQrStudent)}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedQrStudent(null)}
      >
        <View style={styles.qrModalBackdrop}>
          <View style={styles.qrModalCard}>
            <View style={styles.qrModalHeader}>
              <View style={styles.qrModalHeaderIcon}>
                <MaterialCommunityIcons name="qrcode" size={22} color="#084835" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.qrModalTitle}>QR Code Siswa</Text>
                <Text numberOfLines={1} style={styles.qrModalSub}>
                  {selectedQrStudent?.full_name || selectedQrStudent?.nama_lengkap || 'Siswa'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedQrStudent(null)}
                style={styles.qrModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.qrCodeContainer}>
              <Image
                source={{
                  uri: `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
                    selectedQrStudent?.nis || selectedQrStudent?.id || 'STUDENT'
                  )}`,
                }}
                style={styles.qrImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.qrStudentInfoBox}>
              <Text style={styles.qrStudentName}>
                {selectedQrStudent?.full_name || selectedQrStudent?.nama_lengkap || 'Siswa'}
              </Text>
              <Text style={styles.qrStudentNis}>
                NIS: {selectedQrStudent?.nis || '-'} · Kelas: {selectedQrStudent?.kelas?.nama_kelas || selectedQrStudent?.kelas?.name || '-'}
              </Text>
              <Text style={styles.qrStudentUnit}>
                {selectedQrStudent?.education_unit?.name || 'Yayasan Dar El-Iman'}
              </Text>
            </View>

            <Text style={styles.qrHelpText}>
              Arahkan kode QR ini ke mesin pemindai gerbang atau scanner guru untuk presensi otomatis dan verifikasi santri.
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedQrStudent(null)}
              style={styles.qrCloseActionBtn}
            >
              <Text style={styles.qrCloseActionBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL KARTU PELAJAR / SISWA (SEPERTI WEB-DASHBOARD) */}
      <Modal
        visible={Boolean(selectedIdCardStudent)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedIdCardStudent(null)}
      >
        <View style={styles.idCardModalBackdrop}>
          <View style={styles.idCardModalCard}>
            <View style={styles.idCardModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="card-account-details" size={22} color="#084835" />
                <Text style={styles.idCardModalTitle}>Kartu Tanda Siswa (KTS)</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedIdCardStudent(null)}
                style={styles.qrModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Sisi Depan / Belakang Switcher */}
            <View style={styles.idCardTabRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIdCardSide('front')}
                style={[styles.idCardTabBtn, idCardSide === 'front' && styles.idCardTabBtnActive]}
              >
                <Text style={[styles.idCardTabBtnText, idCardSide === 'front' && styles.idCardTabBtnTextActive]}>
                  Tampak Depan
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIdCardSide('back')}
                style={[styles.idCardTabBtn, idCardSide === 'back' && styles.idCardTabBtnActive]}
              >
                <Text style={[styles.idCardTabBtnText, idCardSide === 'back' && styles.idCardTabBtnTextActive]}>
                  Tampak Belakang
                </Text>
              </TouchableOpacity>
            </View>

            {/* CARD PREVIEW AREA (100% Identical to Web Dashboard StudentCardHorizontal) */}
            {(() => {
              const activeCardTheme = CARD_THEMES[cardSetting?.template_color || 'green'] || CARD_THEMES.green;
              const showCardPhoto = cardSetting?.show_photo ?? true;
              const showCardLogo = cardSetting?.show_logo ?? true;
              const showCardQr = cardSetting?.show_qrcode ?? true;
              const showCardNis = cardSetting?.show_nis ?? true;
              const showCardNisn = cardSetting?.show_nisn ?? true;
              const showCardClass = cardSetting?.show_class ?? true;
              const showCardRombel = cardSetting?.show_rombel ?? true;
              const showCardUnit = cardSetting?.show_unit ?? true;
              const showCardAcademicYear = cardSetting?.show_academic_year ?? false;
              const showCardMotto = cardSetting?.show_motto ?? true;

              const sName = selectedIdCardStudent?.full_name || selectedIdCardStudent?.nama_lengkap || selectedIdCardStudent?.name || 'AHMAD ZAKY';
              const sInitial = sName.charAt(0).toUpperCase();
              const sNis = selectedIdCardStudent?.nis || '-';
              const sNisn = selectedIdCardStudent?.nisn || selectedIdCardStudent?.metadata?.nisn || '-';
              const cardBloodType = selectedIdCardStudent?.golongan_darah || selectedIdCardStudent?.metadata?.golongan_darah || selectedIdCardStudent?.blood_type || '-';
              const cardClassName = selectedIdCardStudent?.kelas?.nama_kelas || selectedIdCardStudent?.kelas?.name || selectedIdCardStudent?.class_name || 'Kelas 6A';
              const cardRombelName = selectedIdCardStudent?.kelas?.rombel || selectedIdCardStudent?.rombel || selectedIdCardStudent?.metadata?.rombel || '';
              const cardClassDisplay = showCardRombel && cardRombelName ? `${cardClassName} (${cardRombelName})` : cardClassName;

              let formattedBirthDate = '-';
              const rawDate = selectedIdCardStudent?.birth_date || selectedIdCardStudent?.tanggal_lahir;
              if (rawDate) {
                try {
                  formattedBirthDate = new Date(rawDate).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  });
                } catch {
                  formattedBirthDate = String(rawDate);
                }
              }

              const qrValue = `STUDENT_CARD:${sNis}:${sName}`;
              const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrValue)}`;
              const studentPhotoUrl = getProfileImageUrl(selectedIdCardStudent);

              return (
                <View style={styles.idCardPreviewBox}>
                  {idCardSide === 'front' ? (
                    // TAMPAK DEPAN (Persis StudentCardHorizontal Web Dashboard)
                    <View style={styles.webCardFrame}>
                      {/* 1. TOP HEADER */}
                      <View style={styles.webCardHeaderRow}>
                        {/* Curved Wave Header Left */}
                        <View style={[styles.webCardWaveLeft, { backgroundColor: activeCardTheme.primary, borderColor: activeCardTheme.accent }]}>
                          {showCardLogo && (
                            <View style={[styles.webCardLogoCircle, { borderColor: activeCardTheme.accent }]}>
                              <Image
                                source={require('../../assets/logo.png')}
                                style={styles.webCardLogoImg}
                                resizeMode="contain"
                              />
                            </View>
                          )}
                          <View style={styles.webCardBrandCol}>
                            <Text style={styles.webCardYayasanLabel}>YAYASAN</Text>
                            <Text numberOfLines={1} style={styles.webCardBrandName}>DAR EL-IMAN</Text>
                            <Text style={styles.webCardSchoolSub}>Islamic School</Text>
                          </View>
                        </View>

                        {/* Header Right: Badge & Motto */}
                        <View style={styles.webCardHeaderRight}>
                          <View style={[styles.webCardPillBadge, { backgroundColor: activeCardTheme.primary }]}>
                            <Text style={styles.webCardPillText}>KARTU PELAJAR</Text>
                          </View>
                          {showCardMotto && (
                            <View style={styles.webCardMottoBox}>
                              <Text style={[styles.webCardMottoText, { color: activeCardTheme.primary }]}>
                                Berilmu, Berakhlak, Beramal
                              </Text>
                              <MaterialCommunityIcons name="star-four-points" size={10} color={activeCardTheme.accent} style={{ alignSelf: 'flex-end', marginTop: 1 }} />
                            </View>
                          )}
                        </View>
                      </View>

                      {/* 2. THREE-COLUMN BODY (Photo | Details | QR) */}
                      <View style={styles.webCardBody}>
                        {/* Left Column: Photo Frame + Unit Pill */}
                        {showCardPhoto && (
                          <View style={styles.webCardPhotoCol}>
                            <View style={styles.webCardPhotoFrame}>
                              {studentPhotoUrl ? (
                                <Image
                                  source={{ uri: studentPhotoUrl }}
                                  style={styles.webCardPhotoImg}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View style={[styles.webCardPhotoFallback, { backgroundColor: activeCardTheme.primary }]}>
                                  <Text style={styles.webCardPhotoFallbackText}>{sInitial}</Text>
                                </View>
                              )}
                            </View>
                            {showCardUnit && (
                              <View style={[styles.webCardUnitPill, { backgroundColor: activeCardTheme.primary, borderColor: activeCardTheme.accent }]}>
                                <Text numberOfLines={1} style={styles.webCardUnitPillText}>
                                  {selectedIdCardStudent?.education_unit?.name || '-'}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}

                        {/* Center Column: Student Name + Details Table */}
                        <View style={styles.webCardDetailsCol}>
                          <Text numberOfLines={1} style={[styles.webCardStudentName, { color: activeCardTheme.primary }]}>
                            {sName}
                          </Text>

                          {/* Golden Ornament Line */}
                          <View style={styles.webCardOrnamentRow}>
                            <View style={[styles.webCardOrnamentLine, { backgroundColor: activeCardTheme.accent }]} />
                            <MaterialCommunityIcons name="star-four-points" size={10} color={activeCardTheme.accent} />
                            <View style={[styles.webCardOrnamentLine, { backgroundColor: activeCardTheme.accent }]} />
                          </View>

                          {/* Details Table */}
                          <View style={styles.webCardTable}>
                            {showCardNis && (
                              <View style={styles.webTableRow}>
                                <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                  <MaterialCommunityIcons name="card-account-details-outline" size={11} color={activeCardTheme.primary} />
                                </View>
                                <Text style={styles.webTableLabel}>NIS</Text>
                                <Text style={styles.webTableColon}>:</Text>
                                <Text numberOfLines={1} style={styles.webTableVal}>{sNis}</Text>
                              </View>
                            )}

                            {showCardNisn && (
                              <View style={styles.webTableRow}>
                                <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                  <MaterialCommunityIcons name="shield-check-outline" size={11} color={activeCardTheme.primary} />
                                </View>
                                <Text style={styles.webTableLabel}>NISN</Text>
                                <Text style={styles.webTableColon}>:</Text>
                                <Text numberOfLines={1} style={styles.webTableVal}>{sNisn}</Text>
                              </View>
                            )}

                            {showCardClass && (
                              <View style={styles.webTableRow}>
                                <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                  <MaterialCommunityIcons name="account-outline" size={11} color={activeCardTheme.primary} />
                                </View>
                                <Text style={styles.webTableLabel}>Kelas</Text>
                                <Text style={styles.webTableColon}>:</Text>
                                <Text numberOfLines={1} style={styles.webTableVal}>{cardClassDisplay}</Text>
                              </View>
                            )}

                            <View style={styles.webTableRow}>
                              <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                <MaterialCommunityIcons name="calendar-month-outline" size={11} color={activeCardTheme.primary} />
                              </View>
                              <Text style={styles.webTableLabel}>Tanggal Lahir</Text>
                              <Text style={styles.webTableColon}>:</Text>
                              <Text numberOfLines={1} style={styles.webTableVal}>{formattedBirthDate}</Text>
                            </View>

                            <View style={styles.webTableRow}>
                              <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                <MaterialCommunityIcons name="water-outline" size={11} color={activeCardTheme.primary} />
                              </View>
                              <Text style={styles.webTableLabel}>Gol. Darah</Text>
                              <Text style={styles.webTableColon}>:</Text>
                              <Text numberOfLines={1} style={styles.webTableVal}>{cardBloodType}</Text>
                            </View>

                            {showCardAcademicYear && (
                              <View style={styles.webTableRow}>
                                <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                                  <MaterialCommunityIcons name="school-outline" size={11} color={activeCardTheme.primary} />
                                </View>
                                <Text style={styles.webTableLabel}>Thn Ajaran</Text>
                                <Text style={styles.webTableColon}>:</Text>
                                <Text numberOfLines={1} style={styles.webTableVal}>
                                  {selectedIdCardStudent?.academic_year?.name || '2025/2026'}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Right Column: QR Code Box */}
                        {showCardQr && (
                          <View style={styles.webCardQrCol}>
                            <View style={styles.webCardQrBox}>
                              <Image
                                source={{ uri: qrImageUrl }}
                                style={styles.webCardQrImg}
                                resizeMode="contain"
                              />
                            </View>
                          </View>
                        )}
                      </View>

                      {/* 3. BOTTOM FOOTER */}
                      <View style={[styles.webCardFooter, { backgroundColor: activeCardTheme.primary, borderTopColor: activeCardTheme.accent }]}>
                        <View style={styles.webCardFooterLeft}>
                          <MaterialCommunityIcons name="book-open-outline" size={16} color={activeCardTheme.accent} />
                          <View style={{ marginLeft: 6 }}>
                            <Text style={styles.webCardMottoHeader}>Sekolah Unggulan</Text>
                            <Text style={styles.webCardMottoSub}>Berbasis Al-Qur'an</Text>
                          </View>
                        </View>

                        <View style={styles.webCardFooterDivider} />

                        <View style={styles.webCardFooterRight}>
                          <MaterialCommunityIcons name="web" size={14} color={activeCardTheme.accent} />
                          <Text style={styles.webCardWebText}>www.dareliman.sch.id</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    // TAMPAK BELAKANG (Persis StudentCardBackHorizontal Web Dashboard)
                    <View style={styles.webCardFrame}>
                      {/* Top Header Wave */}
                      <View style={styles.webCardHeaderRow}>
                        <View style={[styles.webCardWaveLeft, { backgroundColor: activeCardTheme.primary, borderColor: activeCardTheme.accent, width: '68%' }]}>
                          {showCardLogo && (
                            <View style={[styles.webCardLogoCircle, { borderColor: activeCardTheme.accent }]}>
                              <Image
                                source={require('../../assets/logo.png')}
                                style={styles.webCardLogoImg}
                                resizeMode="contain"
                              />
                            </View>
                          )}
                          <View style={styles.webCardBrandCol}>
                            <Text style={styles.webCardYayasanLabel}>YAYASAN</Text>
                            <Text numberOfLines={1} style={styles.webCardBrandName}>DAR EL-IMAN</Text>
                            <Text style={styles.webCardSchoolSub}>Sistem Terpadu SIMSIT</Text>
                          </View>
                        </View>

                        <View style={styles.webCardHeaderRight}>
                          <View style={[styles.webCardPillBadge, { backgroundColor: activeCardTheme.dark }]}>
                            <Text style={styles.webCardPillText}>TATA TERTIB</Text>
                          </View>
                        </View>
                      </View>

                      {/* Rules Content */}
                      <View style={styles.webCardBackContent}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.webCardBackHeading, { color: activeCardTheme.primary }]}>
                            TATA TERTIB SISWA
                          </Text>
                          <View style={[styles.webCardBackDivider, { backgroundColor: activeCardTheme.accent }]} />
                          <View style={styles.webCardBackList}>
                            <Text style={styles.webCardBackItem}>
                              <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>1. </Text>
                              Kartu ini adalah kartu identitas resmi siswa Yayasan Dar el-Iman.
                            </Text>
                            <Text style={styles.webCardBackItem}>
                              <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>2. </Text>
                              Wajib dibawa & dikenakan selama jam KBM sekolah.
                            </Text>
                            <Text style={styles.webCardBackItem}>
                              <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>3. </Text>
                              Apabila menemukan kartu ini, harap mengembalikan ke piket sekolah.
                            </Text>
                            <Text style={styles.webCardBackItem}>
                              <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>4. </Text>
                              QR Code digunakan untuk absensi gerbang & verifikasi SIMSIT.
                            </Text>
                          </View>
                        </View>

                        {/* Back Mini QR */}
                        <View style={styles.webCardBackQrCol}>
                          <View style={styles.webCardBackQrBox}>
                            <Image
                              source={{ uri: qrImageUrl }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="contain"
                            />
                          </View>
                          <Text style={styles.webCardBackQrSub}>Scan Verifikasi</Text>
                        </View>
                      </View>

                      {/* Back Footer */}
                      <View style={[styles.webCardFooter, { backgroundColor: activeCardTheme.primary, borderTopColor: activeCardTheme.accent }]}>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={styles.webCardFooterAddress}>
                            Jl. Gajah Mada No. 28 Padang, Sumatera Barat
                          </Text>
                        </View>
                        <Text style={styles.webCardFooterPhone}>
                          Telp: (0751) 123456 · dareliman.or.id
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })()}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSelectedIdCardStudent(null)}
              style={styles.qrCloseActionBtn}
            >
              <Text style={styles.qrCloseActionBtnText}>Tutup Kartu Siswa</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL LIHAT SEMUA BERITA & INFORMASI */}
      <Modal
        visible={showAllNews}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowAllNews(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowAllNews(false)}
              style={styles.modalBackButton}
              accessibilityLabel="Kembali"
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
            </TouchableOpacity>
            <Text numberOfLines={1} style={styles.modalTopTitle}>
              Berita & Informasi Sekolah
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.allNewsListContainer}>
            <View style={styles.allNewsHeaderBox}>
              <Text style={styles.allNewsHeaderTitle}>Warta & Agenda Terpadu</Text>
              <Text style={styles.allNewsHeaderSub}>
                Pembaruan informasi resmi, agenda akademik, dan pengumuman sekolah.
              </Text>
            </View>

            {announcements.map((item: any, idx: number) => (
              <TouchableOpacity
                key={String(item.id || idx)}
                activeOpacity={0.82}
                onPress={() => {
                  setSelectedNews(item);
                }}
                style={styles.allNewsCard}
              >
                <View style={styles.allNewsCardTopRow}>
                  <View style={styles.newsTagBadge}>
                    <MaterialCommunityIcons name="bullhorn" size={11} color="#084835" style={{ marginRight: 4 }} />
                    <Text style={styles.newsTagText}>Warta Sekolah</Text>
                  </View>
                  <Text style={styles.allNewsDate}>
                    {item.created_at
                      ? new Date(item.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Terbaru'}
                  </Text>
                </View>

                <Text style={styles.allNewsTitle}>{titleOf(item)}</Text>
                <Text numberOfLines={3} style={styles.allNewsSnippet}>
                  {subtitleOf(item)}
                </Text>

                <View style={styles.allNewsReadMoreRow}>
                  <Text style={styles.allNewsReadMoreText}>Baca Selengkapnya</Text>
                  <MaterialCommunityIcons name="arrow-right" size={15} color="#084835" />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* DETAIL BERITA MODAL (MOCKUP #5) */}
      <Modal
        visible={Boolean(selectedNews)}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedNews(null)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setSelectedNews(null)}
              style={styles.modalBackButton}
              accessibilityLabel="Kembali"
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
            </TouchableOpacity>
            <Text numberOfLines={1} style={styles.modalTopTitle}>
              {titleOf(selectedNews || {})}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalMainTitle}>{titleOf(selectedNews || {})}</Text>
            <Text style={styles.modalDateText}>
              {selectedNews?.created_at
                ? new Date(selectedNews.created_at).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : 'Informasi Sekolah'}
            </Text>

            <Text style={styles.modalBodyText}>
              {selectedNews?.isi_pengumuman ||
                selectedNews?.isi ||
                subtitleOf(selectedNews || {}) ||
                'Kegiatan belajar mengajar dan operasional sekolah mengikuti agenda terpadu yang telah ditetapkan.'}
            </Text>

            {/* Bottom Islamic School / Mosque Illustration Container */}
            <View style={styles.modalIllustrationFrame}>
              <LinearGradient
                colors={['#08382A', '#0B4D3A']}
                style={styles.illustrationGradient}
              >
                <MaterialCommunityIcons name="mosque" size={88} color="#D4AF37" />
                <Text style={styles.illustrationCaption}>
                  {mobileConfig.branding?.school_name || 'Yayasan Dar el-Iman'}
                </Text>
              </LinearGradient>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL SEMUA MENU */}
      <Modal
        visible={showAllMenusModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAllMenusModal(false)}
      >
        <View style={[styles.qrModalBackdrop, { justifyContent: 'flex-end', padding: 0 }]}>
          <View style={styles.allMenusModalContent}>
            <View style={styles.allMenusModalHeader}>
              <View>
                <Text style={styles.allMenusModalTitle}>Semua Menu</Text>
                <Text style={styles.allMenusModalSub}>Pilih layanan & modul sistem</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAllMenusModal(false)}
                style={styles.allMenusModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.allMenusGridScroll}>
              <View style={styles.allMenusGrid}>
                {roleMenus.map(([label, icon, color, bgPastel, route], idx) => (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.75}
                    style={styles.allMenusItem}
                    onPress={() => {
                      setShowAllMenusModal(false);
                      navigation.navigate(String(route));
                    }}
                  >
                    <View style={[styles.iconSquircle, { backgroundColor: bgPastel }]}>
                      <MaterialCommunityIcons name={String(icon) as any} size={24} color={String(color)} />
                    </View>
                    <Text numberOfLines={1} style={styles.menuLabel}>
                      {String(label)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D6B42',
  },
  headerWrapper: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
    zIndex: 20,
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    paddingTop: 10,
    paddingBottom: 94,
  },
  headerDecorWave: {
    position: 'absolute',
    top: -30,
    right: -25,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 0,
  },
  headerDecorCircle: {
    position: 'absolute',
    top: 25,
    right: 70,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    zIndex: 0,
  },
  userProfileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
    zIndex: 1,
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#084835',
    fontSize: 19,
    fontWeight: '900',
  },
  greetingTextColumn: {
    marginLeft: 12,
    flex: 1,
  },
  greetingSub: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.88)',
    fontWeight: '600',
  },
  greetingName: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 1,
    letterSpacing: 0.2,
  },
  greetingRole: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.82)',
    fontWeight: '600',
    marginTop: 1,
  },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 1,
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '900',
  },
  carouselHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  carouselTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  carouselHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  allNewsListContainer: {
    padding: 18,
    paddingBottom: 36,
  },
  allNewsHeaderBox: {
    marginBottom: 16,
  },
  allNewsHeaderTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#084835',
  },
  allNewsHeaderSub: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  allNewsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  allNewsCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  newsTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  newsTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#084835',
  },
  allNewsDate: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  allNewsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  allNewsSnippet: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 12,
  },
  allNewsReadMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  allNewsReadMoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#084835',
  },
  carouselContainerWrapper: {
    width: '100%',
    marginTop: 8,
    marginBottom: 6,
  },
  carouselCleanBox: {
    width: '100%',
    paddingVertical: 4,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  carouselIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAllBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 2,
  },
  carouselSection: {
    marginTop: 16,
  },
  carouselTrack: {
    paddingHorizontal: 16,
    gap: 12,
  },
  newsCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    overflow: 'hidden',
    padding: 14,
    shadowColor: '#158052',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    justifyContent: 'space-between',
    minHeight: 138,
    position: 'relative',
  },
  newsTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  newsThumbnail: {
    width: 68,
    height: 68,
    borderRadius: 14,
    marginRight: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    backgroundColor: '#158052',
  },
  newsContentCol: {
    flex: 1,
  },
  newsCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  newsCardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 6,
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  newsChevronBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  newsCardSnippet: {
    fontSize: 11.5,
    color: '#EAFBF3',
    lineHeight: 16,
    marginTop: 4,
  },
  newsCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    zIndex: 1,
  },
  newsDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  newsCardDate: {
    fontSize: 10.5,
    color: '#DEF7EC',
    fontWeight: '700',
  },
  newsReadMore: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    height: 5,
    borderRadius: 2.5,
  },
  dotActive: {
    width: 16,
    backgroundColor: '#084835',
  },
  dotInactive: {
    width: 5,
    backgroundColor: '#CBD5E1',
  },
  menuSection: {
    marginTop: 6,
    paddingHorizontal: 20,
  },
  menuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  menuHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#084835',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  menuItem: {
    width: (SCREEN_WIDTH - 40 - 24) / 4,
    alignItems: 'center',
  },
  iconSquircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  menuLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    marginTop: 6,
    textAlign: 'center',
  },
  inlineLoader: {
    marginTop: 20,
    alignItems: 'center',
  },
  errorContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 12,
    color: '#B91C1C',
    textAlign: 'center',
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTopTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    maxWidth: SCREEN_WIDTH * 0.7,
  },
  modalContent: {
    padding: 24,
    paddingBottom: 40,
  },
  modalMainTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 28,
  },
  modalDateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 6,
    marginBottom: 20,
  },
  modalBodyText: {
    fontSize: 14,
    lineHeight: 24,
    color: '#334155',
  },
  modalIllustrationFrame: {
    marginTop: 32,
    borderRadius: 16,
    overflow: 'hidden',
    height: 180,
  },
  illustrationGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationCaption: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
    letterSpacing: 1,
  },
  // Student Card Styles (Horizontal Swipeable & No Top Tab)
  studentCardContainer: {
    marginTop: 2,
    marginBottom: 8,
  },
  studentCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  studentCardHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studentCardHeaderIconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentCardHeaderTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#084835',
    letterSpacing: 0.2,
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
  childSelectorChipsTrack: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  childChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  childChipBtnActive: {
    backgroundColor: '#084835',
    borderColor: '#084835',
  },
  childChipAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 6,
  },
  childChipAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  childChipAvatarText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  childChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  childChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  studentCardsTrack: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  studentMainCard: {
    overflow: 'hidden',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    position: 'relative',
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
  studentCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  studentAvatarBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    marginRight: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  studentAvatarInitial: {
    fontSize: 19,
    fontWeight: '900',
    color: '#084835',
  },
  studentInfoCol: {
    flex: 1,
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
  studentUnitText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentQrBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 6,
  },
  studentQrBtnText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#18A165',
    marginTop: 1,
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
  studentAttrBox: {
    flex: 1,
    alignItems: 'center',
  },
  studentAttrLabel: {
    fontSize: 9,
    color: '#A7F3D0',
    fontWeight: '700',
    marginBottom: 2,
  },
  studentAttrValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  studentAttrDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  studentCardActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    zIndex: 1,
  },
  studentActionBtnCard: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  studentActionBtnCardText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
  },
  studentActionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  studentActionBtnSecondaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
  },
  studentActionBtnPrimary: {
    flex: 0.8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#064E3B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  studentActionBtnPrimaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  studentDot: {
    height: 5,
    borderRadius: 2.5,
  },
  studentDotActive: {
    width: 16,
    backgroundColor: '#084835',
  },
  studentDotInactive: {
    width: 5,
    backgroundColor: '#CBD5E1',
  },
  monitoringStatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 16,
  },
  monitoringStatCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  monitoringStatIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  monitoringStatLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  monitoringStatValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  integratedMonitoringSection: {
    marginTop: 14,
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  integratedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  integratedIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  integratedTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E293B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  integratedSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  integratedTabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  integratedTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  integratedTabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  mutabaahGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mutabaahBox: {
    width: (SCREEN_WIDTH - 76) / 2,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  mutabaahBoxLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  mutabaahBoxValue: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  subTabDetailCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subTabDetailBadgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  subTabDetailTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  subTabDetailMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  statusPillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // QR Modal Styles
  qrModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  qrModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  qrModalHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  qrModalSub: {
    fontSize: 12,
    color: '#64748B',
  },
  qrModalCloseBtn: {
    padding: 6,
  },
  qrCodeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#DEF7EC',
    marginBottom: 14,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  qrStudentInfoBox: {
    alignItems: 'center',
    marginBottom: 12,
  },
  qrStudentName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  qrStudentNis: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  qrStudentUnit: {
    fontSize: 11,
    color: '#084835',
    fontWeight: '800',
    marginTop: 2,
  },
  qrHelpText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 16,
  },
  qrCloseActionBtn: {
    backgroundColor: '#084835',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  qrCloseActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ID Card Modal Styles
  idCardModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    padding: 18,
  },
  idCardModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 7,
  },
  idCardModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  idCardModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  idCardTabRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  idCardTabBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  idCardTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  idCardTabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  idCardTabBtnTextActive: {
    color: '#084835',
    fontWeight: '900',
  },
  idCardPreviewBox: {
    marginBottom: 16,
    alignItems: 'center',
  },
  idCardPhysical: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#084835',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  idCardTopBar: {
    backgroundColor: '#004D32',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  idCardLogoCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idCardOrgTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  idCardUnitTitle: {
    fontSize: 8,
    fontWeight: '700',
    color: '#A7F3D0',
  },
  idCardGoldStripe: {
    backgroundColor: '#E5A93C',
    paddingVertical: 3,
    alignItems: 'center',
  },
  idCardGoldStripeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#003822',
    letterSpacing: 0.8,
  },
  idCardBodyRow: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  idCardPhotoFrame: {
    width: 70,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#DEF7EC',
    borderWidth: 1.5,
    borderColor: '#004D32',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  idCardPhotoInitial: {
    fontSize: 32,
    fontWeight: '900',
    color: '#004D32',
  },
  idCardDetailsTable: {
    flex: 1,
    gap: 4,
  },
  idCardDetailItem: {
    flexDirection: 'row',
  },
  idCardDetailLabel: {
    width: 65,
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  idCardDetailVal: {
    flex: 1,
    fontSize: 10,
    color: '#1E293B',
    fontWeight: '700',
  },
  idCardDetailValBold: {
    flex: 1,
    fontSize: 11,
    color: '#004D32',
    fontWeight: '900',
  },
  idCardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  idCardMiniQr: {
    width: 48,
    height: 48,
  },
  idCardSignBox: {
    alignItems: 'flex-end',
  },
  idCardSignCity: {
    fontSize: 8,
    color: '#64748B',
  },
  idCardStampBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  idCardStampText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#059669',
  },
  idCardSignTitle: {
    fontSize: 8,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  idCardBackHeader: {
    backgroundColor: '#004D32',
    paddingVertical: 8,
    alignItems: 'center',
  },
  idCardBackHeading: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  idCardBackContent: {
    padding: 14,
    gap: 6,
  },
  idCardRuleItem: {
    fontSize: 9,
    color: '#334155',
    lineHeight: 14,
  },
  idCardBackFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    padding: 10,
    alignItems: 'center',
  },
  idCardBackAddress: {
    fontSize: 8,
    color: '#64748B',
    textAlign: 'center',
  },
  idCardBackWeb: {
    fontSize: 8,
    fontWeight: '800',
    color: '#004D32',
    marginTop: 2,
  },
  menuGridPage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    rowGap: 14,
    columnGap: 8,
  },
  menuDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  menuDot: {
    height: 4,
    borderRadius: 2,
  },
  menuDotActive: {
    width: 16,
    backgroundColor: '#18A165',
  },
  menuDotInactive: {
    width: 5,
    backgroundColor: '#CBD5E1',
  },
  allMenusModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: '85%',
    width: '100%',
  },
  allMenusModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  allMenusModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  allMenusModalSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  allMenusModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  allMenusGridScroll: {
    paddingVertical: 18,
    paddingBottom: 36,
  },
  allMenusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    rowGap: 18,
    columnGap: 8,
  },
  allMenusItem: {
    width: (SCREEN_WIDTH - 40 - 24) / 4,
    alignItems: 'center',
  },
  studentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  idCardPhotoImg: {
    width: '100%',
    height: '100%',
  },
  // Web Dashboard Exact Replica Styles
  webCardFrame: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  webCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    height: 58,
    backgroundColor: '#FFFFFF',
  },
  webCardWaveLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '68%',
    height: 56,
    borderBottomRightRadius: 34,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    paddingLeft: 10,
    paddingRight: 14,
  },
  webCardLogoCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 8,
    padding: 2,
  },
  webCardLogoImg: {
    width: '100%',
    height: '100%',
  },
  webCardBrandCol: {
    flex: 1,
  },
  webCardYayasanLabel: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#D1FAE5',
  },
  webCardBrandName: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  webCardSchoolSub: {
    fontSize: 7.5,
    fontWeight: '600',
    color: '#A7F3D0',
  },
  webCardHeaderRight: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  webCardPillBadge: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3.5,
  },
  webCardPillText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  webCardMottoBox: {
    alignItems: 'flex-end',
    marginTop: 3,
  },
  webCardMottoText: {
    fontSize: 7.5,
    fontStyle: 'italic',
    fontWeight: '800',
  },
  webCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  webCardPhotoCol: {
    alignItems: 'center',
    width: 82,
    marginRight: 6,
  },
  webCardPhotoFrame: {
    width: 80,
    height: 94,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 2.5,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardPhotoImg: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
  },
  webCardPhotoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardPhotoFallbackText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  webCardUnitPill: {
    width: 80,
    height: 17,
    borderRadius: 8.5,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  webCardUnitPillText: {
    fontSize: 6.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  webCardDetailsCol: {
    flex: 1,
    paddingHorizontal: 4,
  },
  webCardStudentName: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  webCardOrnamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginVertical: 3.5,
    width: '95%',
  },
  webCardOrnamentLine: {
    flex: 1,
    height: 1.2,
  },
  webCardTable: {
    gap: 3,
  },
  webTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webTableIconBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  webTableLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#334155',
    width: 68,
  },
  webTableColon: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#64748B',
    width: 8,
  },
  webTableVal: {
    flex: 1,
    fontSize: 9,
    fontWeight: '800',
    color: '#0F172A',
  },
  webCardQrCol: {
    alignItems: 'center',
    width: 82,
    marginLeft: 4,
  },
  webCardQrBox: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardQrImg: {
    width: '100%',
    height: '100%',
  },
  webCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderTopWidth: 2.5,
  },
  webCardFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webCardMottoHeader: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  webCardMottoSub: {
    fontSize: 6.8,
    fontWeight: '600',
    color: '#D1FAE5',
  },
  webCardFooterDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  webCardFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  webCardWebText: {
    fontSize: 7.8,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  webCardBackContent: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  webCardBackHeading: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  webCardBackDivider: {
    height: 1.5,
    width: '100%',
    marginBottom: 6,
  },
  webCardBackList: {
    gap: 4,
  },
  webCardBackItem: {
    fontSize: 7.5,
    color: '#334155',
    lineHeight: 11,
  },
  webCardBackQrCol: {
    alignItems: 'center',
    width: 70,
  },
  webCardBackQrBox: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardBackQrSub: {
    fontSize: 6.5,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },
  webCardFooterAddress: {
    fontSize: 7.5,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  webCardFooterPhone: {
    fontSize: 7.5,
    color: '#D1FAE5',
    fontWeight: '700',
  },
});
