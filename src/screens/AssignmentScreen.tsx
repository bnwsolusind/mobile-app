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
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isTeacherRole, isTuRole, isPrincipalRole, isSuperAdminRole } from '../utils/roles';
import TeacherAssignmentWorkspace from '../components/teacher/TeacherAssignmentWorkspace';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
  getStudentAvatarSource,
  isGirlStudent,
} from '../utils/profile';
import { getDynamicAcademicInfo } from '../utils/academicYear';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, useStickyScroll } from '../components/StudentStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import InAppEmbedModal from '../components/InAppEmbedModal';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;

type Child = Record<string, any>;
type AssignmentItem = Record<string, any>;

const formatDeadline = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}.${minutes}`;
};

const getAssignmentStatus = (item: any): { key: string; label: string; color: string; bg: string; icon: any } => {
  const sub = Array.isArray(item.pengumpulan_tugas) && item.pengumpulan_tugas.length > 0
    ? item.pengumpulan_tugas[0]
    : Array.isArray(item.pengumpulanTugas) && item.pengumpulanTugas.length > 0
    ? item.pengumpulanTugas[0]
    : item.submission;

  const isGraded = sub && (sub.status === 'dinilai' || sub.status === 'graded' || (sub.nilai_guru !== null && sub.nilai_guru !== undefined));
  const isSubmitted = sub && (sub.status === 'dikumpulkan' || sub.status === 'submitted' || sub.status === 'revisi');
  const isLate = (sub && sub.status === 'terlambat') || (!sub && item.deadline && new Date(item.deadline) < new Date());

  if (isGraded) {
    return { key: 'graded', label: 'Dinilai', color: '#059669', bg: '#ECFDF5', icon: 'check-circle' };
  }
  if (isLate) {
    return { key: 'late', label: 'Terlambat', color: '#DC2626', bg: '#FEF2F2', icon: 'alert-circle' };
  }
  if (isSubmitted) {
    return { key: 'submitted', label: 'Sudah Dikumpulkan', color: '#2563EB', bg: '#EFF6FF', icon: 'clock-check-outline' };
  }
  return { key: 'pending', label: 'Belum Dikumpulkan', color: '#D97706', bg: '#FFFBEB', icon: 'clock-outline' };
};

const getSubjectTheme = (subjectName: string = ''): { bgIcon: string; iconColor: string; icon: any; badgeBg: string; badgeBorder: string; badgeText: string; titleColor: string } => {
  const norm = (subjectName || '').toLowerCase();
  if (norm.includes('agama') || norm.includes('islam') || norm.includes('pai') || norm.includes('fiqih') || norm.includes('tahfiz') || norm.includes('quran') || norm.includes('hadits') || norm.includes('akidah')) {
    return {
      bgIcon: '#DEF7EC',
      iconColor: '#059669',
      icon: 'book-open-page-variant-outline',
      badgeBg: '#ECFDF5',
      badgeBorder: '#A7F3D0',
      badgeText: '#059669',
      titleColor: '#059669',
    };
  }
  if (norm.includes('ipa') || norm.includes('alam') || norm.includes('fisika') || norm.includes('biologi') || norm.includes('kimia') || norm.includes('sains')) {
    return {
      bgIcon: '#FCE7F3',
      iconColor: '#DB2777',
      icon: 'flask-outline',
      badgeBg: '#FDF2F8',
      badgeBorder: '#FBCFE8',
      badgeText: '#DB2777',
      titleColor: '#DB2777',
    };
  }
  if (norm.includes('matematika') || norm.includes('math') || norm.includes('hitung') || norm.includes('aljabar')) {
    return {
      bgIcon: '#DBEAFE',
      iconColor: '#2563EB',
      icon: 'calculator-variant-outline',
      badgeBg: '#EFF6FF',
      badgeBorder: '#BFDBFE',
      badgeText: '#2563EB',
      titleColor: '#2563EB',
    };
  }
  if (norm.includes('inggris') || norm.includes('arab') || norm.includes('asing')) {
    return {
      bgIcon: '#F3E8FF',
      iconColor: '#7C3AED',
      icon: 'translate',
      badgeBg: '#FAF5FF',
      badgeBorder: '#E9D5FF',
      badgeText: '#7C3AED',
      titleColor: '#7C3AED',
    };
  }
  if (norm.includes('bahasa') || norm.includes('indonesia') || norm.includes('literasi')) {
    return {
      bgIcon: '#FEE2E2',
      iconColor: '#E11D48',
      icon: 'book-open-variant',
      badgeBg: '#FFF1F2',
      badgeBorder: '#FECDD3',
      badgeText: '#E11D48',
      titleColor: '#E11D48',
    };
  }
  if (norm.includes('ips') || norm.includes('sosial') || norm.includes('sejarah') || norm.includes('geografi') || norm.includes('ekonomi')) {
    return {
      bgIcon: '#FEF3C7',
      iconColor: '#D97706',
      icon: 'earth',
      badgeBg: '#FFFBEB',
      badgeBorder: '#FDE68A',
      badgeText: '#D97706',
      titleColor: '#D97706',
    };
  }
  if (norm.includes('seni') || norm.includes('budaya') || norm.includes('sbk') || norm.includes('prakarya')) {
    return {
      bgIcon: '#FFE4E6',
      iconColor: '#E11D48',
      icon: 'palette-outline',
      badgeBg: '#FFF1F2',
      badgeBorder: '#FECDD3',
      badgeText: '#E11D48',
      titleColor: '#E11D48',
    };
  }
  if (norm.includes('komputer') || norm.includes('informatika') || norm.includes('tik')) {
    return {
      bgIcon: '#E0F2FE',
      iconColor: '#0284C7',
      icon: 'monitor',
      badgeBg: '#F0F9FF',
      badgeBorder: '#BAE6FD',
      badgeText: '#0284C7',
      titleColor: '#0284C7',
    };
  }
  return {
    bgIcon: '#DEF7EC',
    iconColor: '#059669',
    icon: 'book-open-page-variant-outline',
    badgeBg: '#ECFDF5',
    badgeBorder: '#A7F3D0',
    badgeText: '#059669',
    titleColor: '#059669',
  };
};

const cleanTaskTitle = (raw: string = ''): string => {
  return raw.replace(/\s*\((?:100%\s*)?(?:Database\s*Real|Real\s*DB|DB\s*Real|Real\s*Database)\)/gi, '').trim();
};

const STATUS_FILTER_THEMES: Record<
  string,
  {
    activeBg: string;
    activeBorder: string;
    activeText: string;
    activeIcon: string;
    badgeBg: string;
    badgeText: string;
    icon: string;
  }
> = {
  all: {
    activeBg: '#ECFDF5',
    activeBorder: '#10B981',
    activeText: '#065F46',
    activeIcon: '#059669',
    badgeBg: '#059669',
    badgeText: '#FFFFFF',
    icon: 'format-list-bulleted',
  },
  pending: {
    activeBg: '#FFFBEB',
    activeBorder: '#F59E0B',
    activeText: '#92400E',
    activeIcon: '#D97706',
    badgeBg: '#D97706',
    badgeText: '#FFFFFF',
    icon: 'clock-alert-outline',
  },
  submitted: {
    activeBg: '#EFF6FF',
    activeBorder: '#3B82F6',
    activeText: '#1E40AF',
    activeIcon: '#2563EB',
    badgeBg: '#2563EB',
    badgeText: '#FFFFFF',
    icon: 'file-check-outline',
  },
  late: {
    activeBg: '#FFF1F2',
    activeBorder: '#F43F5E',
    activeText: '#9F1239',
    activeIcon: '#E11D48',
    badgeBg: '#E11D48',
    badgeText: '#FFFFFF',
    icon: 'alert-circle-outline',
  },
  graded: {
    activeBg: '#F5F3FF',
    activeBorder: '#8B5CF6',
    activeText: '#5B21B6',
    activeIcon: '#7C3AED',
    badgeBg: '#7C3AED',
    badgeText: '#FFFFFF',
    icon: 'star-circle-outline',
  },
};

const getWeekDays = (baseDate: Date) => {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const days = [];
  const names = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Ahad'];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    days.push({
      dayName: names[i],
      dayNum: cur.getDate(),
      dateObj: cur,
      iso: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
    });
  }
  return days;
};

export default function AssignmentScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);
  const isTeacher = isTeacherRole(user?.roles || []);
  const isStaff = isTuRole(user?.roles || []) || isPrincipalRole(user?.roles || []) || isSuperAdminRole(user?.roles || []);
  const activeChildId = useActiveChildStore((state) => state.activeChildId);
  const isParentWithChild = isParent && Boolean(activeChildId);

  const [children, setChildren] = useState<Child[]>(() => useActiveChildStore.getState().children || []);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(
    route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId
  );
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [lastPage, setLastPage] = useState<number>(1);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);
  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);
  const studentScrollRef = useRef<ScrollView>(null);

  // Sinkronkan selectedChildId dengan parameter rute atau store anak aktif global
  const handledParamIdRef = useRef<string | undefined>(
    route?.params?.child_id || route?.params?.student_id
  );
  useEffect(() => {
    const incomingParamId = route?.params?.child_id || route?.params?.student_id;
    if (incomingParamId) {
      const strId = String(incomingParamId);
      if (strId !== selectedChildId) {
        setSelectedChildId(strId);
      }
      if (strId !== activeChildId) {
        useActiveChildStore.getState().setActiveChildId(strId);
      }
      handledParamIdRef.current = strId;
    } else if (activeChildId && activeChildId !== selectedChildId) {
      setSelectedChildId(String(activeChildId));
    }
  }, [route?.params?.child_id, route?.params?.student_id, activeChildId, selectedChildId]);

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

  // Real-time tracking titik dot carousel saat gesture drag/swipe berlangsung
  const [visualDotIndex, setVisualDotIndex] = useState<number | null>(null);
  const currentActiveDotIndex = visualDotIndex !== null ? visualDotIndex : activeChildIndex;

  const scrollToActiveChild = useCallback((idx: number, animated = false): void => {
    if (children.length <= 1) return;
    const clamped = Math.max(0, Math.min(children.length - 1, idx));
    studentScrollRef.current?.scrollTo({ x: clamped * studentSnapInterval, animated });
  }, [children.length, studentSnapInterval]);

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
  }, [children.length, studentSnapInterval, activeChildIndex, scrollToActiveChild]);

  // ── Sticky header bersama (StudentStickyHeader, sama dengan Jadwal/Materi) ──
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  // 60 FPS Native Scroll Animation (dipasang langsung sebagai onScroll,
  // jangan pernah dipanggil sebagai fungsi)
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

  const handleBack = () => {
    const currentActiveChildId = selectedChildId || useActiveChildStore.getState().activeChildId || route?.params?.child_id || route?.params?.student_id;
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation, {
      ...route?.params,
      child_id: currentActiveChildId,
      student_id: currentActiveChildId,
    });
    if (handled) return;
    if (currentActiveChildId) {
      navigation?.navigate('Beranda', {
        reopen_child_portal_id: String(currentActiveChildId),
        reopen_timestamp: Date.now(),
      });
      return;
    }
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation?.navigate('Beranda');
    }
  };

  // States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [backendKpi, setBackendKpi] = useState<any>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);

  // Siswa aktif untuk sticky header (anak terpilih -> profil -> user).
  // Turunan tampilan (nama/avatar/NIS/kelas/unit) dihitung di dalam
  // StudentStickyHeader agar tidak ada fallback hardcode di sini.
  const activeStudent: any = useMemo(() => {
    if (children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[activeChildIndex] || children[0];
    }
    if (studentInfo) return studentInfo;
    return (user as any)?.student || user || null;
  }, [children, selectedChildId, activeChildIndex, studentInfo, user]);

  // Rumus nama depan disamakan persis halaman Jadwal (dipakai hero bodi)
  const activeChildName = (activeStudent?.name || activeStudent?.full_name || '').split(' ')[0];

  const activeStudentName =
    activeStudent?.full_name ||
    activeStudent?.name ||
    activeStudent?.nama_lengkap ||
    '';

  const activeStudentClass =
    activeStudent?.kelas?.nama_kelas ||
    activeStudent?.kelas?.name ||
    activeStudent?.class_name ||
    studentInfo?.kelas?.nama_kelas ||
    studentInfo?.class_name ||
    '';

  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [selectedQrStudent, setSelectedQrStudent] = useState<any>(null);

  // Tombol Kartu Siswa -> modal KTS; tombol QR -> modal QR khusus
  const openIdCard = (student: any) => {
    setSelectedIdCardStudent(student);
  };
  const openQrCard = (student: any) => {
    setSelectedQrStudent(student);
  };
  const [selectedMenuStudent, setSelectedMenuStudent] = useState<any>(null);
  const [selectedWeeklyStudent, setSelectedWeeklyStudent] = useState<any>(null);

  // Aksi tombol Jadwal pada sticky header & body card — disamakan dengan
  // halaman Jadwal (di halaman Tugas: pindah ke layar Jadwal).
  const openScheduleForStudent = useCallback((student: any) => {
    const sid = student?.id || student?.student_id;
    if (sid) {
      const idStr = String(sid);
      navigation?.navigate('Jadwal', { child_id: idStr, student_id: idStr });
    } else {
      navigation?.navigate('Jadwal');
    }
  }, [navigation]);
  const [mainTab, setMainTab] = useState<'daftar' | 'kalender' | 'nilai'>('daftar');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'submitted' | 'late' | 'graded'>('all');
  const defaultAcademicYear = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }, []);
  const [selectedSemester, setSelectedSemester] = useState<string>(() => {
    const now = new Date();
    const isSem1 = now.getMonth() >= 6;
    const year = now.getFullYear();
    const ay = isSem1 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
    return isSem1 ? `Semester 1 (${ay})` : `Semester 2 (${ay})`;
  });

  // Deteksi Dinamis Fullday vs Boarding (100% data riil dari backend tanpa hardcode)
  const isBoarding = useMemo(() => {
    const rawProgramType = String(
      activeStudent?.program_type ||
      activeStudent?.education_unit?.program_type ||
      activeStudent?.unit?.program_type ||
      ''
    ).toLowerCase();

    const rawLevel = String(
      activeStudent?.level ||
      activeStudent?.education_unit?.level ||
      activeStudent?.unit?.level ||
      activeStudent?.kelas?.jenjang ||
      activeStudent?.kelas?.unitPendidikan?.level ||
      ''
    ).toUpperCase();

    const unitStr = String(
      activeStudent?.unit?.name ||
      activeStudent?.education_unit?.name ||
      activeStudent?.unit_name ||
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
  }, [activeStudent]);

  const programTypeLabel = isBoarding
    ? 'Boarding School (Pesantren 24 Jam)'
    : 'Fullday School (07:15 - 16:00 WIB)';

  const programOperatingHours = useMemo(() => {
    if (activeStudent?.jam_kegiatan) return activeStudent.jam_kegiatan;
    if (activeStudent?.education_unit?.jam_kegiatan) return activeStudent.education_unit.jam_kegiatan;
    if (activeStudent?.kelas?.unitPendidikan?.jam_kegiatan) return activeStudent.kelas.unitPendidikan.jam_kegiatan;
    return isBoarding ? '24 Jam (Pengasuhan Asrama & Halaqah)' : '07:15 - 16:00 WIB';
  }, [activeStudent, isBoarding]);

  const [showChildSelectorModal, setShowChildSelectorModal] = useState<boolean>(false);

  const studentFullName = activeStudent
    ? String(activeStudent.name || activeStudent.nama_lengkap || activeStudent.full_name || (user as any)?.name || 'Ananda').trim()
    : String((user as any)?.name || 'Ananda');

  const studentUnit = activeStudent
    ? String(
        activeStudent.unit?.name ||
        activeStudent.unit_name ||
        activeStudent.education_unit?.name ||
        ''
      ).trim()
    : '';

  const studentClass = activeStudent
    ? String(
        activeStudent.class?.name ||
        activeStudent.kelas?.name ||
        activeStudent.class_name ||
        (activeStudent.grade ? `Kelas ${activeStudent.grade}` : '')
      ).trim()
    : '';

  const studentSubtitleParts = [studentUnit, studentClass].filter(Boolean);
  const studentSubtitle = studentSubtitleParts.join('  ·  ');
  const studentPhotoUrl = getProfileImageUrl(activeStudent);
  const isGirl = isGirlStudent(activeStudent);
  const defaultAvatar = isGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;
  const studentAvatarSource = studentPhotoUrl ? { uri: studentPhotoUrl } : defaultAvatar;

  // Resolusi Dinamis Status Kehadiran Siswa Hari Ini — Single Source of Truth selaras dengan HomeScreen
  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(activeStudent);
  }, [activeStudent]);

  const [sortOrder, setSortOrder] = useState<'latest' | 'deadline'>('latest');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);
  const [submissionText, setSubmissionText] = useState<string>('');
  const [submissionUrlLink, setSubmissionUrlLink] = useState<string>('');
  const [submissionTahfizhMode, setSubmissionTahfizhMode] = useState<'langsung' | 'audio' | 'video'>('langsung');
  const [submissionGroupMembers, setSubmissionGroupMembers] = useState<string>('');
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [pickedAttachment, setPickedAttachment] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // In-App Embed Modal State (Pratinjau link/file tanpa meninggalkan mobile-app)
  const [embedModalVisible, setEmbedModalVisible] = useState<boolean>(false);
  const [embedTargetUrl, setEmbedTargetUrl] = useState<string | null>(null);
  const [embedTargetTitle, setEmbedTargetTitle] = useState<string>('Pratinjau Berkas & Tautan');

  const handleOpenEmbedUrl = (url?: string | null, title?: string) => {
    if (!url) return;
    setEmbedTargetUrl(url);
    setEmbedTargetTitle(title || 'Pratinjau Berkas & Tautan');
    setEmbedModalVisible(true);
  };

  // View mode switcher (Batas Waktu | Jeda | Jadwal) - Layar 1 & 12
  const [activeViewMode, setActiveViewMode] = useState<'batas_waktu' | 'jeda' | 'jadwal'>('batas_waktu');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());

  // Filter Sheet Modal (Layar 2)
  const [filterModalVisible, setFilterModalVisible] = useState<boolean>(false);
  const [modalFilterStatus, setModalFilterStatus] = useState<string>('all');
  const [modalFilterSubject, setModalFilterSubject] = useState<string>('all');
  const [modalFilterType, setModalFilterType] = useState<string>('all');

  // Detail Tugas Modal (Layar 3, 8, 9)
  const [selectedDetailAssignment, setSelectedDetailAssignment] = useState<AssignmentItem | null>(null);
  const [criteriaExpanded, setCriteriaExpanded] = useState<boolean>(false);

  // Pengumpulan Tugas (Layar 4)
  const [integrityChecked, setIntegrityChecked] = useState<boolean>(true);

  // Konfirmasi Pengumpulan Modal (Layar 5)
  const [confirmModalVisible, setConfirmModalVisible] = useState<boolean>(false);

  // Berhasil Dikumpulkan Modal (Layar 6)
  const [successModalVisible, setSuccessModalVisible] = useState<boolean>(false);
  const [lastSubmittedAssignment, setLastSubmittedAssignment] = useState<AssignmentItem | null>(null);

  // Detail Kelompok Modal (Layar 10)
  const [groupModalVisible, setGroupModalVisible] = useState<boolean>(false);

  // Diskusi Tugas Modal (Layar 11)
  const [discussionModalVisible, setDiscussionModalVisible] = useState<boolean>(false);
  const [discussionInput, setDiscussionInput] = useState<string>('');
  const [discussionMessages, setDiscussionMessages] = useState<Array<{ id: string; sender: string; role: 'guru' | 'siswa'; text: string; time: string }>>([]);

  // 1. Fetch children if parent with offline cache (Pertahankan seluruh anak tanpa menimpa anak yang dipilih)
  const loadChildren = useCallback(async () => {
    if (isTeacher || isStaff) return;
    if (!isParent) return;
    const childCacheKey = offlineCache.buildKey('assignments_children', user?.id);

    // Cek store dulu jika sudah ada
    const storeChildren = useActiveChildStore.getState().children;
    if (storeChildren && storeChildren.length > 0) {
      setChildren(storeChildren);
      setSelectedChildId((prev) => {
        const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
        if (targetChildId) return String(targetChildId);
        return prev || String(storeChildren[0].id || storeChildren[0].student_id);
      });
    }

    const cached = await offlineCache.get<Child[]>(childCacheKey);
    if (cached && cached.length > 0) {
      setChildren(cached);
      useActiveChildStore.getState().setChildren(cached);
      setSelectedChildId((prev) => {
        const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
        if (targetChildId) return String(targetChildId);
        return prev || String(cached[0].id || cached[0].student_id);
      });
    }

    try {
      const res = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<Child[]>(res) || [];
      if (list.length > 0) {
        setChildren(list);
        useActiveChildStore.getState().setChildren(list);
        setSelectedChildId((prev) => {
          const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
          if (targetChildId) return String(targetChildId);
          return prev || String(list[0].id || list[0].student_id);
        });
        void offlineCache.set(childCacheKey, list);
      }
    } catch {
      // safe fallback
    }
  }, [isParent, isStaff, isTeacher, route?.params?.child_id, route?.params?.student_id, user?.id]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // 2. Fetch assignments list & summary
  const loadAssignments = useCallback(async () => {
    if (isTeacher || isStaff) return;
    if (isParent && !selectedChildId) return;
    try {
      setLoading(true);
      setCurrentPage(1);
      const cacheKey = offlineCache.buildKey('assignments', user?.id, selectedChildId);
      const cached = await offlineCache.get<{ list: AssignmentItem[]; summary?: any; lastPage?: number }>(cacheKey);
      if (cached) {
        setAssignments(cached.list || []);
        if (cached.summary) setBackendKpi(cached.summary);
        if (cached.lastPage) setLastPage(cached.lastPage);
        setLoading(false);
      } else {
        setAssignments([]);
        setBackendKpi(null);
        setLoading(true);
      }

      const res = await mobileApiService.getPortalAssignments({
        child_id: selectedChildId,
        semester: selectedSemester,
        per_page: 30,
        page: 1,
      });

      const paginator = res?.data;
      const raw = paginator?.data || paginator || res;
      const list = Array.isArray(raw) ? raw : raw?.items || [];
      setAssignments(list);

      const curPage = Number(paginator?.current_page || 1);
      const totalPages = Number(paginator?.last_page || 1);
      setCurrentPage(curPage);
      setLastPage(totalPages);

      const kpiData = res?.kpi || res?.summary || res?.data?.kpi || res?.data?.summary || null;
      if (kpiData) setBackendKpi(kpiData);

      void offlineCache.set(cacheKey, { list, summary: kpiData, lastPage: totalPages });
    } catch {
      // safe fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isParent, isStaff, isTeacher, selectedChildId, selectedSemester, user?.id]);

  const loadMoreAssignments = useCallback(async () => {
    if (loading || loadingMore || isTeacher || isStaff) return;
    if (currentPage >= lastPage) return;
    try {
      setLoadingMore(true);
      const nextPage = currentPage + 1;
      const res = await mobileApiService.getPortalAssignments({
        child_id: selectedChildId,
        semester: selectedSemester,
        per_page: 30,
        page: nextPage,
      });

      const paginator = res?.data;
      const raw = paginator?.data || paginator || res;
      const nextList = Array.isArray(raw) ? raw : raw?.items || [];
      if (nextList.length > 0) {
        setAssignments((prev) => {
          const existingIds = new Set(prev.map((p) => String(p.id)));
          const filteredNew = nextList.filter((item: any) => !existingIds.has(String(item.id)));
          const combined = [...prev, ...filteredNew];
          const cacheKey = offlineCache.buildKey('assignments', user?.id, selectedChildId);
          void offlineCache.set(cacheKey, {
            list: combined,
            summary: backendKpi,
            lastPage: Number(paginator?.last_page || lastPage),
          });
          return combined;
        });
        setCurrentPage(Number(paginator?.current_page || nextPage));
        if (paginator?.last_page) {
          setLastPage(Number(paginator.last_page));
        }
      }
    } catch {
      // safe fallback
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, isTeacher, isStaff, currentPage, lastPage, selectedChildId, selectedSemester, user?.id, backendKpi]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadChildren(), loadAssignments()]);
  };


  // KPI Calculation from database response
  const kpi = useMemo(() => {
    let total_tugas = assignments.length;
    let tugas_aktif = 0;
    let belum_dikumpulkan = 0;
    let terlambat = 0;
    let sudah_dinilai = 0;
    let sudah_dikumpulkan = 0;

    assignments.forEach((item) => {
      const status = getAssignmentStatus(item).key;
      if (status === 'graded') {
        sudah_dinilai++;
      } else if (status === 'late') {
        terlambat++;
      } else if (status === 'submitted') {
        sudah_dikumpulkan++;
      } else {
        belum_dikumpulkan++;
        tugas_aktif++;
      }
    });

    return {
      total_tugas: backendKpi?.total_tugas ?? total_tugas,
      tugas_aktif: backendKpi?.tugas_aktif ?? tugas_aktif,
      belum_dikumpulkan: backendKpi?.belum_dikumpulkan ?? belum_dikumpulkan,
      terlambat: backendKpi?.terlambat ?? terlambat,
      sudah_dinilai: backendKpi?.sudah_dinilai ?? sudah_dinilai,
      sudah_dikumpulkan: backendKpi?.sudah_dikumpulkan ?? sudah_dikumpulkan,
    };
  }, [backendKpi, assignments]);

  // Dynamic Tab Counts for Filter Tabs (Zero Hardcode)
  const tabCounts = useMemo(() => {
    let pending = 0;
    let submitted = 0;
    let late = 0;
    let graded = 0;

    assignments.forEach((item) => {
      const statusKey = getAssignmentStatus(item).key;
      if (statusKey === 'graded') {
        graded++;
      } else if (statusKey === 'late') {
        late++;
      } else if (statusKey === 'submitted') {
        submitted++;
      } else {
        pending++;
      }
    });

    return {
      all: backendKpi?.total_tugas ?? assignments.length,
      pending: backendKpi?.belum_dikumpulkan ?? pending,
      submitted: backendKpi?.sudah_dikumpulkan ?? submitted,
      late: backendKpi?.terlambat ?? late,
      graded: backendKpi?.sudah_dinilai ?? graded,
    };
  }, [backendKpi, assignments]);

  // Available subjects for filter modal
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((item) => {
      const s = item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran;
      if (s) set.add(s);
    });
    return Array.from(set);
  }, [assignments]);

  const calendarWeekDays = useMemo(() => {
    return getWeekDays(selectedCalendarDate);
  }, [selectedCalendarDate]);

  const calendarDayAssignments = useMemo(() => {
    const selIso = `${selectedCalendarDate.getFullYear()}-${String(selectedCalendarDate.getMonth() + 1).padStart(2, '0')}-${String(selectedCalendarDate.getDate()).padStart(2, '0')}`;
    return assignments.filter((item) => {
      const deadStr = item.deadline || item.tanggal || item.created_at || '';
      return deadStr.startsWith(selIso);
    });
  }, [assignments, selectedCalendarDate]);

  const gradedAssignments = useMemo(() => {
    return assignments.filter((item) => {
      const statusObj = getAssignmentStatus(item);
      return statusObj.key === 'graded' || statusObj.key === 'submitted';
    });
  }, [assignments]);

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    let result = assignments.filter((item) => {
      const statusObj = getAssignmentStatus(item);

      // Status pill tab
      if (activeTab !== 'all' && statusObj.key !== activeTab) {
        return false;
      }

      // Modal Filter: Status
      if (modalFilterStatus !== 'all' && statusObj.key !== modalFilterStatus) {
        return false;
      }

      // Modal Filter: Subject
      if (modalFilterSubject !== 'all') {
        const subName = item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || '';
        if (subName.toLowerCase() !== modalFilterSubject.toLowerCase()) {
          return false;
        }
      }

      // Modal Filter: Type
      if (modalFilterType !== 'all') {
        const isQuiz = item.jenis_tugas === 'quiz' || item.jenis_soal === 'quiz';
        const isGroup = item.jenis_tugas === 'kelompok';
        if (modalFilterType === 'quiz' && !isQuiz) return false;
        if (modalFilterType === 'kelompok' && !isGroup) return false;
        if (modalFilterType === 'individu' && (isQuiz || isGroup)) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const title = (item.judul_tugas || item.judul || '').toLowerCase();
        const subject = (item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || '').toLowerCase();
        const teacher = (item.teacher?.name || item.guru?.nama_lengkap || '').toLowerCase();
        return title.includes(query) || subject.includes(query) || teacher.includes(query);
      }
      return true;
    });

    if (sortOrder === 'latest') {
      result = [...result].sort((a, b) => new Date(b.created_at || b.deadline || 0).getTime() - new Date(a.created_at || a.deadline || 0).getTime());
    } else {
      result = [...result].sort((a, b) => new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime());
    }

    return result;
  }, [assignments, activeTab, modalFilterStatus, modalFilterSubject, modalFilterType, searchQuery, sortOrder]);

  // Cek apakah ananda yang dipilih bersekolah di unit SD
  const activeChild = useMemo(() => {
    return children.find((c) => String(c.id) === selectedChildId) || children[0] || null;
  }, [children, selectedChildId]);

  const isChildSD = useMemo(() => {
    if (!activeChild) return false;
    const unitName = (
      activeChild.education_unit?.name ||
      activeChild.unit_pendidikan?.nama ||
      activeChild.kelas?.unit_pendidikan?.nama ||
      activeChild.kelas?.unitPendidikan?.name ||
      activeChild.unit_name ||
      ''
    ).toLowerCase();
    const jenjang = (
      activeChild.kelas?.jenjang ||
      activeChild.education_unit?.level ||
      activeChild.jenjang ||
      ''
    ).toLowerCase();

    return (
      jenjang.includes('sd') ||
      jenjang.includes('mi') ||
      unitName.includes('sd') ||
      unitName.includes('mi') ||
      unitName.includes('sekolah dasar') ||
      unitName.includes('ibtidaiyah')
    );
  }, [activeChild]);

  // Siswa dan Orang Tua pendamping dapat mengerjakan/mengumpulkan tugas & kuis untuk seluruh jenjang (SD, SMP, SMA)
  const canSubmit = true;

  const parsedQuestions = useMemo(() => {
    if (!selectedAssignment || (selectedAssignment.jenis_tugas !== 'quiz' && selectedAssignment.jenis_tugas !== 'kuis')) return [];
    try {
      const raw = selectedAssignment.soal_json || (selectedAssignment.metadata as any)?.butir_soal || selectedAssignment.deskripsi || '';
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string' && raw.trim().startsWith('[')) {
        return JSON.parse(raw);
      }
    } catch {}
    return [];
  }, [selectedAssignment]);

  useEffect(() => {
    if (route?.params?.target_assignment_id && assignments.length > 0) {
      const found = assignments.find((a) => String(a.id) === String(route.params.target_assignment_id));
      if (found) {
        setSelectedAssignment(found);
      }
    }
  }, [route?.params?.target_assignment_id, assignments]);

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setPickedAttachment({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
        });
      }
    } catch {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memilih Dokumen',
        message: 'Tidak dapat memilih dokumen berkas tugas.',
      });
    }
  };

  const handlePickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setPickedAttachment({
          uri: asset.uri,
          name: asset.fileName || `jawaban_${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        });
      }
    } catch {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memilih Foto',
        message: 'Tidak dapat memilih foto berkas dari galeri.',
      });
    }
  };

  const handlePressSubmit = () => {
    if (!selectedAssignment?.id) return;
    const isQuiz = selectedAssignment?.jenis_tugas === 'quiz' || selectedAssignment?.jenis_tugas === 'kuis';
    const isTahfizh = selectedAssignment?.jenis_tugas === 'tahfizh';
    const finalAnswersText = isQuiz && Object.keys(quizAnswers).length > 0
      ? JSON.stringify(quizAnswers)
      : submissionText.trim();

    const hasValidSubmission = Boolean(
      finalAnswersText ||
      pickedAttachment ||
      submissionUrlLink.trim() ||
      (isTahfizh && submissionTahfizhMode === 'langsung')
    );

    if (!hasValidSubmission) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Jawaban Belum Lengkap',
        message: isQuiz
          ? 'Mohon pilih jawaban kuis terlebih dahulu sebelum mengumpulkan.'
          : isTahfizh
          ? 'Mohon pilih metode setoran atau masukkan rekaman/tautan audio/video.'
          : 'Mohon tuliskan teks jawaban, unggah berkas, atau masukkan tautan link tugas Anda.',
      });
      return;
    }
    if (!integrityChecked) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Integritas Akademik',
        message: 'Mohon centang pernyataan kejujuran dan integritas pengerjaan tugas terlebih dahulu.',
      });
      return;
    }
    setConfirmModalVisible(true);
  };

  const handleConfirmSubmitAssignment = async () => {
    if (!selectedAssignment?.id) return;
    const isQuiz = selectedAssignment?.jenis_tugas === 'quiz' || selectedAssignment?.jenis_tugas === 'kuis';
    const finalAnswersText = isQuiz && Object.keys(quizAnswers).length > 0
      ? JSON.stringify(quizAnswers)
      : submissionText.trim();

    try {
      setSubmitting(true);
      await mobileApiService.submitPortalAssignment(
        selectedAssignment.id,
        finalAnswersText,
        isParent ? selectedChildId : undefined,
        pickedAttachment,
        submissionUrlLink.trim() || undefined,
        {
          tahfizh_mode: selectedAssignment?.jenis_tugas === 'tahfizh' ? submissionTahfizhMode : undefined,
          group_members: submissionGroupMembers.trim() || undefined,
          jenis_tugas: selectedAssignment?.jenis_tugas,
          device: Platform.OS,
          submitted_at: new Date().toISOString(),
        }
      );
      setConfirmModalVisible(false);
      setLastSubmittedAssignment(selectedAssignment);
      setSelectedAssignment(null);
      setSubmissionText('');
      setSubmissionUrlLink('');
      setSubmissionGroupMembers('');
      setSubmissionTahfizhMode('langsung');
      setQuizAnswers({});
      setPickedAttachment(null);
      setSuccessModalVisible(true);
      void loadAssignments();
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Mengumpulkan Tugas',
        message: err?.message || 'Pengumpulan tugas/kuis belum berhasil disimpan ke server sekolah.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderAssignmentCard = (item: any, idx: number, isEvalView = false) => {
    const sub = Array.isArray(item.pengumpulan_tugas) && item.pengumpulan_tugas.length > 0
      ? item.pengumpulan_tugas[0]
      : Array.isArray(item.pengumpulanTugas) && item.pengumpulanTugas.length > 0
      ? item.pengumpulanTugas[0]
      : item.submission;

    const statusObj = getAssignmentStatus(item);
    const subjectName = item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || '';
    const subjectTheme = getSubjectTheme(subjectName);
    const teacherName = item.teacher?.name || item.teacher?.nama_lengkap || item.guru?.nama_lengkap || item.guru?.nama || item.teacher_name || '';
    const taskTitle = cleanTaskTitle(item.judul_tugas || item.judul || item.title || 'Penugasan');
    const taskDesc = item.deskripsi || item.instruksi || '';
    const deadlineFormatted = formatDeadline(item.deadline);
    const isGraded = statusObj.key === 'graded' || (sub && sub.nilai_guru !== null && sub.nilai_guru !== undefined);
    const attachmentCount = item.attachments_count ?? (Array.isArray(item.attachments) ? item.attachments.length : (Array.isArray(item.files) ? item.files.length : (item.file_url || item.lampiran ? 1 : 0)));
    const isGroup = item.jenis_tugas === 'kelompok';

    return (
      <View
        key={String(item.id || idx)}
        style={[
          styles.assignmentCardModern,
          {
            borderColor: isEvalView ? '#BFDBFE' : `${subjectTheme.iconColor}35`,
            borderLeftWidth: 4.5,
            borderLeftColor: isEvalView ? '#2563EB' : subjectTheme.iconColor,
            shadowColor: isEvalView ? '#1E3A8A' : subjectTheme.iconColor,
          },
        ]}
      >
        <LinearGradient
          colors={[subjectTheme.badgeBg, '#FFFFFF', '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.65 }}
          style={styles.assignmentCardGradient}
        >
          {/* Header Baris: Badges Mapel, Jenis Tugas, Status Pill, Judul, dan Deskripsi */}
          <View style={styles.cardHeaderFlexModern}>
            <View style={styles.cardBadgesHeaderRow}>
              <View style={styles.cardBadgesLeftGroup}>
                {subjectName ? (
                  <View
                    style={[
                      styles.subjectPillBadgeModern,
                      { backgroundColor: '#FFFFFF', borderColor: subjectTheme.badgeBorder },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={subjectTheme.icon as any}
                      size={12}
                      color={subjectTheme.badgeText}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.subjectPillTextModern, { color: subjectTheme.badgeText }]}>
                      {subjectName}
                    </Text>
                  </View>
                ) : null}

                {(item.jenis_tugas === 'quiz' || item.jenis_soal === 'quiz') && (
                  <View style={[styles.statusPillBadge, { backgroundColor: '#F3E8FF', borderColor: '#D8B4FE', borderWidth: 1 }]}>
                    <MaterialCommunityIcons name="lightning-bolt" size={11} color="#7C3AED" style={{ marginRight: 3 }} />
                    <Text style={[styles.statusPillText, { color: '#7C3AED', fontWeight: '800' }]}>Kuis CBT</Text>
                  </View>
                )}

                {isGroup && (
                  <View style={[styles.statusPillBadge, { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD', borderWidth: 1 }]}>
                    <MaterialCommunityIcons name="account-group-outline" size={11} color="#0284C7" style={{ marginRight: 3 }} />
                    <Text style={[styles.statusPillText, { color: '#0284C7', fontWeight: '800' }]}>Kelompok</Text>
                  </View>
                )}
              </View>

              <View style={[styles.statusPillBadge, { backgroundColor: statusObj.bg, borderColor: `${statusObj.color}30`, borderWidth: 1, flexShrink: 0 }]}>
                <MaterialCommunityIcons
                  name={statusObj.icon}
                  size={11}
                  color={statusObj.color}
                  style={{ marginRight: 3 }}
                />
                <Text style={[styles.statusPillText, { color: statusObj.color, fontWeight: '700' }]}>
                  {statusObj.label}
                </Text>
              </View>
            </View>

            <Text style={styles.cardTaskTitleModern} numberOfLines={2}>
              {taskTitle}
            </Text>

            {taskDesc ? (
              <Text style={styles.cardTaskDescModern} numberOfLines={2}>
                {taskDesc}
              </Text>
            ) : null}
          </View>

          {/* Metadata Box */}
          <View style={styles.metadataContainerBox}>
            <View style={styles.metaRowTop}>
              <View style={styles.metaItemFlex}>
                <View style={[styles.metaIconBadge, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialCommunityIcons name="calendar-clock" size={13} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.metaLabelText}>Batas Waktu</Text>
                  <Text numberOfLines={1} style={[styles.metaValueText, { color: '#92400E' }]}>{deadlineFormatted}</Text>
                </View>
              </View>

              {attachmentCount > 0 ? (
                <View style={[styles.metaItemFlex, { flex: 0.85, justifyContent: 'flex-end' }]}>
                  <View style={[styles.metaIconBadge, { backgroundColor: '#E0F2FE' }]}>
                    <MaterialCommunityIcons name="paperclip" size={13} color="#0284C7" />
                  </View>
                  <View>
                    <Text style={styles.metaLabelText}>Lampiran</Text>
                    <Text numberOfLines={1} style={[styles.metaValueText, { color: '#0369A1' }]}>{attachmentCount} Berkas</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {teacherName ? (
              <View style={styles.metaRowBottom}>
                <View style={[styles.metaIconBadge, { backgroundColor: subjectTheme.badgeBg }]}>
                  <MaterialCommunityIcons name="account-tie-outline" size={13} color={subjectTheme.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.metaLabelText}>Guru Pengajar</Text>
                  <Text numberOfLines={1} style={styles.metaValueText}>{teacherName}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Link Materi Terkait */}
          {(() => {
            const mats = Array.isArray(item.materials) && item.materials.length > 0
              ? item.materials
              : (item.materi ? [item.materi] : []);
            if (mats.length === 0) return null;
            return mats.map((mat: any, mIdx: number) => (
              <TouchableOpacity
                key={mat.id || mIdx}
                activeOpacity={mat?.link || mat?.file ? 0.75 : 1}
                onPress={() => {
                  const targetUrl = mat?.link || mat?.file;
                  if (targetUrl) {
                    handleOpenEmbedUrl(targetUrl, `Materi: ${mat.judul}`);
                  }
                }}
                style={[styles.cardAttachmentLinkRow, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', marginBottom: 5 }]}
              >
                <MaterialCommunityIcons name="book-open-page-variant-outline" size={15} color="#059669" />
                <Text numberOfLines={1} style={[styles.cardAttachmentLinkText, { color: '#065F46', flex: 1 }]}>
                  Materi: {mat.judul}
                </Text>
                {mat?.link || mat?.file ? (
                  <MaterialCommunityIcons name="eye-outline" size={14} color="#059669" />
                ) : null}
              </TouchableOpacity>
            ));
          })()}

          {/* Link Berkas Soal Guru */}
          {item.file_lampiran_url ? (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => handleOpenEmbedUrl(item.file_lampiran_url, 'Lembar Berkas Soal Guru')}
              style={[styles.cardAttachmentLinkRow, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', marginBottom: 5 }]}
            >
              <MaterialCommunityIcons name="file-pdf-box" size={16} color="#2563EB" />
              <Text numberOfLines={1} style={[styles.cardAttachmentLinkText, { color: '#1D4ED8' }]}>Buka Lembar Berkas Soal Guru</Text>
              <MaterialCommunityIcons name="eye-outline" size={16} color="#2563EB" />
            </TouchableOpacity>
          ) : null}

          {/* Footer: Graded frame vs Pending reminder & buttons */}
          {isGraded ? (
            <View style={styles.gradedCardFrameModern}>
              <View style={styles.gradedTopRow}>
                <View style={styles.scorePillBadge}>
                  <MaterialCommunityIcons name="star" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.scorePillLabel}>Nilai</Text>
                  <Text style={styles.scorePillValue}>{sub?.nilai_guru ?? sub?.nilai ?? '-'}</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedDetailAssignment(item)}
                  style={styles.gradedDetailBtn}
                >
                  <Text style={styles.gradedDetailBtnText}>Lihat Detail</Text>
                  <MaterialCommunityIcons name="chevron-right" size={14} color="#059669" />
                </TouchableOpacity>
              </View>

              {sub?.catatan_guru || sub?.catatan ? (
                <View style={styles.teacherNoteBoxModern}>
                  <MaterialCommunityIcons name="message-text" size={14} color="#059669" style={{ marginTop: 2, marginRight: 6 }} />
                  <Text style={styles.teacherNoteTextModern}>
                    <Text style={{ fontWeight: '800', color: '#065F46' }}>Catatan Guru: </Text>
                    {sub?.catatan_guru || sub?.catatan}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.pendingActionContainer}>
              <View style={styles.pendingAlertBanner}>
                <MaterialCommunityIcons
                  name={canSubmit ? 'clock-alert-outline' : 'shield-account'}
                  size={15}
                  color="#D97706"
                  style={{ marginRight: 6 }}
                />
                <Text numberOfLines={1} style={styles.pendingAlertTextFull}>
                  {item.jenis_tugas === 'quiz'
                    ? 'Kuis CBT berbatas waktu.'
                    : isGroup
                    ? 'Tugas kerja kelompok.'
                    : 'Selesaikan sebelum batas waktu berakhir.'}
                </Text>
              </View>

              <View style={styles.pendingButtonsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedDetailAssignment(item)}
                  style={styles.detailOutlineBtn}
                >
                  <MaterialCommunityIcons name="text-box-search-outline" size={14} color="#059669" style={{ marginRight: 3 }} />
                  <Text style={styles.detailOutlineBtnText}>Detail</Text>
                </TouchableOpacity>

                {isGroup && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setGroupModalVisible(true)}
                    style={styles.groupOutlineBtn}
                  >
                    <MaterialCommunityIcons name="account-group" size={13} color="#0284C7" style={{ marginRight: 3 }} />
                    <Text style={styles.groupOutlineBtnText}>Kelompok</Text>
                  </TouchableOpacity>
                )}

                <View style={{ flex: 1 }} />

                {canSubmit && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedAssignment(item);
                      setSubmissionText(sub?.jawaban_teks || '');
                      setPickedAttachment(null);
                      try {
                        if (item.jenis_tugas === 'quiz' && sub?.jawaban_teks && sub.jawaban_teks.trim().startsWith('{')) {
                          setQuizAnswers(JSON.parse(sub.jawaban_teks));
                        } else {
                          setQuizAnswers({});
                        }
                      } catch {
                        setQuizAnswers({});
                      }
                    }}
                    style={[
                      styles.kumpulkanBtnModern,
                      item.jenis_tugas === 'quiz' && { backgroundColor: '#7C3AED', shadowColor: '#7C3AED' },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.jenis_tugas === 'quiz' ? 'lightning-bolt' : 'tray-arrow-up'}
                      size={15}
                      color="#FFFFFF"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.kumpulkanBtnTextModern}>
                      {item.jenis_tugas === 'quiz'
                        ? (statusObj.key === 'submitted' ? 'Kirim Ulang' : '⚡ Kuis CBT')
                        : (statusObj.key === 'submitted' ? 'Kirim Ulang' : 'Kumpulkan Tugas')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </LinearGradient>
      </View>
    );
  };

  if (isTeacher || isStaff) {
    return (
      <TeacherAssignmentWorkspace
        initialTab={route?.params?.tab === 'submissions' ? 'submissions' : 'assignments'}
        onBack={() => {
          if (navigation?.canGoBack?.()) navigation.goBack();
          else navigation?.navigate('Beranda');
        }}
      />
    );
  }

  return (
    <View style={styles.rootContainer}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK JADWAL PELAJARAN, JERNIH & CRISP) ── */}
      <View style={[styles.topFoliageWrapper, { height: 380 }]} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
          locations={[0.5, 0.82, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK JADWAL PELAJARAN (TOMBOL KARTU PUTIH MINT GREEN SHADOW) ── */}
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
          Tugas Siswa
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setFilterModalVisible(true)}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Filter Tugas"
        >
          <MaterialCommunityIcons name="filter-variant" size={20} color="#004D32" />
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
              activeOpacity={children.length > 1 ? 0.75 : 1}
              onPress={children.length > 1 ? () => setShowChildSelectorModal(true) : undefined}
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
                activeOpacity={children.length > 1 ? 0.75 : 1}
                onPress={children.length > 1 ? () => setShowChildSelectorModal(true) : undefined}
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
                {children.length > 1 && (
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

          {/* 1.2. BANNER TAHUN AJARAN AKTIF & EVALUASI BELAJAR (FULLDAY / BOARDING) */}
          <View style={styles.academicYearBanner}>
            <LinearGradient
              colors={isBoarding ? ['#EEF2FF', '#F5F3FF', '#F8FAFC'] : ['#ECFDF5', '#F0FDF4', '#F8FAFC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.academicYearGradient}
            >
              {/* Top Accent Strip */}
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
                    Tahun Ajaran {defaultAcademicYear} · {selectedSemester.split(' ')[0] || 'Semester 1'}
                  </Text>
                </View>

                <View style={styles.activePillBadge}>
                  <View style={styles.activeGreenDot} />
                  <Text style={styles.activePillText}>Aktif</Text>
                </View>
              </View>

              {/* Title & Subtitle Operasional */}
              <Text style={styles.operationalScheduleTitle}>
                Penugasan & Evaluasi Belajar Ananda {activeStudentName || 'Santri'}
              </Text>
              <Text style={styles.operationalScheduleSub} numberOfLines={1}>
                {activeStudent?.education_unit?.name || activeStudent?.unit?.name || 'Unit Pendidikan Terpadu'}
                {activeStudentClass ? ` · ${activeStudentClass}` : ''}
              </Text>

              {/* Row 2: Lencana Program Sekolah (Fullday vs Boarding) + Ganti Semester Button */}
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

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedSemester((prev) =>
                      prev.startsWith('Semester 1')
                        ? `Semester 2 (${defaultAcademicYear})`
                        : `Semester 1 (${defaultAcademicYear})`
                    );
                  }}
                  style={styles.semesterToggleBtn}
                >
                  <MaterialCommunityIcons name="swap-horizontal" size={13} color="#059669" />
                  <Text style={styles.semesterToggleText}>
                    {selectedSemester.startsWith('Semester 1') ? 'Pindah Sem 2' : 'Pindah Sem 1'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Row 3: Meta Info Chips */}
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

                {activeStudentClass ? (
                  <View style={styles.operationalMetaItem}>
                    <View style={[styles.metaIconSquircle, isBoarding && { backgroundColor: '#E0E7FF' }]}>
                      <MaterialCommunityIcons
                        name="door-open"
                        size={12.5}
                        color={isBoarding ? '#4F46E5' : '#059669'}
                      />
                    </View>
                    <Text style={[styles.operationalMetaText, isBoarding && { color: '#3730A3' }]}>
                      {activeStudentClass}
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
                    {isBoarding ? 'LMS & Halaqah Asrama' : 'Kurikulum Terpadu LMS'}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* 1.3. CARD REKAP PENUGASAN (BERISI 4 KARTU METRIK OPERASIONAL) */}
          <View style={styles.kpiMasterCard}>
            <View style={styles.kpiMasterHeader}>
              <View style={styles.kpiMasterHeaderLeft}>
                <View style={styles.kpiMasterIconSquircle}>
                  <MaterialCommunityIcons name="clipboard-text-clock" size={17} color="#047857" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kpiMasterTitle}>Rekap Penugasan Siswa</Text>
                  <Text style={styles.kpiMasterSubtitle}>Progres tugas, kepatuhan tenggat & evaluasi</Text>
                </View>
              </View>
              <View style={styles.kpiMasterTotalBadge}>
                <Text style={styles.kpiMasterTotalBadgeText}>{kpi.total_tugas} Tugas</Text>
              </View>
            </View>

            <View style={styles.kpiMasterBody}>
              <View style={styles.kpiRow}>
                {/* CARD 1: Total Tugas (EMERALD) */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setMainTab('daftar');
                    setActiveTab('all');
                  }}
                  style={[styles.kpiCard, styles.kpiCardEmerald, activeTab === 'all' && styles.kpiCardActiveRingEmerald]}
                >
                  <LinearGradient
                    colors={['#ECFDF5', '#F0FDF4']}
                    style={styles.kpiCardGradient}
                  >
                    <View style={styles.kpiTop}>
                      <Text numberOfLines={1} style={[styles.kpiLabel, { color: '#047857' }]}>Total Tugas</Text>
                      <View style={[styles.kpiIconBadge, { backgroundColor: '#D1FAE5' }]}>
                        <MaterialCommunityIcons name="clipboard-check-outline" size={15} color="#059669" />
                      </View>
                    </View>
                    <Text numberOfLines={1} style={[styles.kpiValue, { color: '#065F46' }]}>
                      {kpi.total_tugas} Tugas
                    </Text>
                    <Text numberOfLines={1} style={[styles.kpiSub, { color: '#047857' }]}>
                      Tugas Semester Ini
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* CARD 2: Belum Selesai (AMBER) */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setMainTab('daftar');
                    setActiveTab('pending');
                  }}
                  style={[styles.kpiCard, styles.kpiCardAmber, activeTab === 'pending' && styles.kpiCardActiveRingAmber]}
                >
                  <LinearGradient
                    colors={['#FFFBEB', '#FEF9C3']}
                    style={styles.kpiCardGradient}
                  >
                    <View style={styles.kpiTop}>
                      <Text numberOfLines={1} style={[styles.kpiLabel, { color: '#D97706' }]}>Belum Selesai</Text>
                      <View style={[styles.kpiIconBadge, { backgroundColor: '#FEF3C7' }]}>
                        <MaterialCommunityIcons name="clock-alert-outline" size={15} color="#D97706" />
                      </View>
                    </View>
                    <Text numberOfLines={1} style={[styles.kpiValue, { color: '#92400E' }]}>
                      {kpi.belum_dikumpulkan} Tugas
                    </Text>
                    <Text numberOfLines={1} style={[styles.kpiSub, { color: '#B45309' }]}>
                      Perlu Dikerjakan
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              <View style={[styles.kpiRow, { marginTop: 8 }]}>
                {/* CARD 3: Terlambat (ROSE) */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setMainTab('daftar');
                    setActiveTab('late');
                  }}
                  style={[styles.kpiCard, styles.kpiCardRose, activeTab === 'late' && styles.kpiCardActiveRingRose]}
                >
                  <LinearGradient
                    colors={['#FFF1F2', '#FFE4E6']}
                    style={styles.kpiCardGradient}
                  >
                    <View style={styles.kpiTop}>
                      <Text numberOfLines={1} style={[styles.kpiLabel, { color: '#E11D48' }]}>Terlambat</Text>
                      <View style={[styles.kpiIconBadge, { backgroundColor: '#FFE4E6' }]}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={15} color="#E11D48" />
                      </View>
                    </View>
                    <Text numberOfLines={1} style={[styles.kpiValue, { color: '#9F1239' }]}>
                      {kpi.terlambat} Tugas
                    </Text>
                    <Text numberOfLines={1} style={[styles.kpiSub, { color: '#BE123C' }]}>
                      Lewat Batas Waktu
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* CARD 4: Sudah Dinilai (PURPLE) */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setMainTab('nilai');
                    setActiveTab('graded');
                  }}
                  style={[styles.kpiCard, styles.kpiCardPurple, (mainTab === 'nilai' || activeTab === 'graded') && styles.kpiCardActiveRingPurple]}
                >
                  <LinearGradient
                    colors={['#FAF5FF', '#F3E8FF']}
                    style={styles.kpiCardGradient}
                  >
                    <View style={styles.kpiTop}>
                      <Text numberOfLines={1} style={[styles.kpiLabel, { color: '#7C3AED' }]}>Sudah Dinilai</Text>
                      <View style={[styles.kpiIconBadge, { backgroundColor: '#EDE9FE' }]}>
                        <MaterialCommunityIcons name="star-circle-outline" size={15} color="#7C3AED" />
                      </View>
                    </View>
                    <Text numberOfLines={1} style={[styles.kpiValue, { color: '#5B21B6' }]}>
                      {kpi.sudah_dinilai} Tugas
                    </Text>
                    <Text numberOfLines={1} style={[styles.kpiSub, { color: '#6D28D9' }]}>
                      Hasil Evaluasi Guru
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* 1.4. TAB SWITCHER: DAFTAR TUGAS VS KALENDER TUGAS VS EVALUASI & NILAI */}
          <View style={styles.tabSwitcherContainer}>
            {/* TAB 1: DAFTAR TUGAS */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setMainTab('daftar');
                setActiveViewMode('batas_waktu');
              }}
              style={styles.tabSwitcherBtnItem}
            >
              {mainTab === 'daftar' ? (
                <LinearGradient
                  colors={['#064E3B', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillActiveDaftar]}
                >
                  <MaterialCommunityIcons name="clipboard-text-outline" size={15} color="#FFFFFF" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextActive}>
                    Daftar Tugas
                  </Text>
                </LinearGradient>
              ) : (
                <View style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillInactive]}>
                  <MaterialCommunityIcons name="clipboard-text-outline" size={15} color="#047857" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextInactive}>
                    Daftar Tugas
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* TAB 2: KALENDER TUGAS */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setMainTab('kalender');
                setActiveViewMode('jadwal');
              }}
              style={styles.tabSwitcherBtnItem}
            >
              {mainTab === 'kalender' ? (
                <LinearGradient
                  colors={['#0F766E', '#0D9488']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillActiveKalender]}
                >
                  <MaterialCommunityIcons name="calendar-month-outline" size={15} color="#FFFFFF" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextActive}>
                    Kalender Tugas
                  </Text>
                </LinearGradient>
              ) : (
                <View style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillInactive]}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={15} color="#0D9488" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextInactive}>
                    Kalender Tugas
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* TAB 3: EVALUASI & NILAI */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setMainTab('nilai');
                setActiveTab('graded');
              }}
              style={styles.tabSwitcherBtnItem}
            >
              {mainTab === 'nilai' ? (
                <LinearGradient
                  colors={['#1E3A8A', '#2563EB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillActiveNilai]}
                >
                  <MaterialCommunityIcons name="star-circle-outline" size={15} color="#FFFFFF" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextActive}>
                    Evaluasi & Nilai
                  </Text>
                </LinearGradient>
              ) : (
                <View style={[styles.tabSwitcherPillBase, styles.tabSwitcherPillInactive]}>
                  <MaterialCommunityIcons name="star-circle-outline" size={15} color="#2563EB" />
                  <Text numberOfLines={1} style={styles.tabSwitcherTextInactive}>
                    Evaluasi & Nilai
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* TAB 1: DAFTAR TUGAS */}
          {mainTab === 'daftar' && (
            <View style={styles.tabContentContainer}>
              {/* Summary Bar */}
              <LinearGradient
                colors={['#065F46', '#047857', '#0D9488']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.taskSummaryBar}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.15)']}
                    style={styles.taskSummaryIconSquircle}
                  >
                    <MaterialCommunityIcons name="clipboard-text-outline" size={18} color="#FFFFFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskSummaryTitle}>
                      Daftar Tugas Siswa
                    </Text>
                    <Text style={styles.taskSummarySubtitle} numberOfLines={1}>
                      {activeStudentName ? `Materi & penugasan untuk ${activeStudentName}` : 'Daftar materi & evaluasi terpadu'}
                    </Text>
                  </View>
                </View>

                <View style={styles.taskCountBadgePill}>
                  <Text style={styles.taskCountBadgeText}>
                    {filteredAssignments.length === (backendKpi?.total_tugas ?? assignments.length)
                      ? `${filteredAssignments.length} Tugas`
                      : `${filteredAssignments.length} dari ${backendKpi?.total_tugas ?? assignments.length}`}
                  </Text>
                </View>
              </LinearGradient>

              {/* ── CARD FILTER & PENCARIAN ── */}
              <View style={styles.filterCardContainer}>
                {/* Header Banner Card Filter */}
                <View style={styles.filterCardHeaderBanner}>
                  <View style={styles.filterCardHeaderLeft}>
                    <View style={styles.filterCardIconSquircle}>
                      <MaterialCommunityIcons name="filter-variant" size={16} color="#047857" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.filterCardTitle}>Filter & Pencarian Tugas</Text>
                      <Text style={styles.filterCardSubtitle}>Cari tugas, urutkan tenggat, atau filter status</Text>
                    </View>
                  </View>
                  {(activeTab !== 'all' || modalFilterStatus !== 'all' || modalFilterSubject !== 'all' || modalFilterType !== 'all' || searchQuery.trim().length > 0) && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setActiveTab('all');
                        setModalFilterStatus('all');
                        setModalFilterSubject('all');
                        setModalFilterType('all');
                        setSearchQuery('');
                      }}
                      style={styles.filterCardResetBtn}
                    >
                      <MaterialCommunityIcons name="refresh" size={12} color="#E11D48" />
                      <Text style={styles.filterCardResetText}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Body Card Filter: Toolbar Pencarian & Horizontal Filter Pills */}
                <View style={styles.filterCardBody}>
                  {/* Toolbar Pencarian, Sortir, dan Filter Modal */}
                  <View style={styles.searchToolbarContainer}>
                    <View style={styles.searchBar}>
                      <MaterialCommunityIcons
                        name="magnify"
                        size={20}
                        color={searchQuery.length > 0 ? '#059669' : '#94A3B8'}
                        style={{ marginRight: 8 }}
                      />
                      <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Cari tugas, guru, atau mapel..."
                        placeholderTextColor="#94A3B8"
                        style={styles.searchInput}
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setSearchQuery('')}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Tombol Sortir Cepat */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setSortOrder((prev) => (prev === 'latest' ? 'deadline' : 'latest'))}
                      style={styles.sortPillButton}
                    >
                      <MaterialCommunityIcons name="swap-vertical" size={16} color="#475569" style={{ marginRight: 3 }} />
                      <Text style={styles.sortPillText}>{sortOrder === 'latest' ? 'Terbaru' : 'Tenggat'}</Text>
                    </TouchableOpacity>

                    {/* Tombol Filter Modal */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setFilterModalVisible(true)}
                      style={[
                        styles.filterActionButtonModern,
                        (modalFilterStatus !== 'all' || modalFilterSubject !== 'all' || modalFilterType !== 'all') &&
                          styles.filterActionButtonActiveModern,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="filter-variant"
                        size={18}
                        color={
                          modalFilterStatus !== 'all' || modalFilterSubject !== 'all' || modalFilterType !== 'all'
                            ? '#059669'
                            : '#334155'
                        }
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.filterActionButtonTextModern,
                          (modalFilterStatus !== 'all' || modalFilterSubject !== 'all' || modalFilterType !== 'all') &&
                            styles.filterActionButtonTextActiveModern,
                        ]}
                      >
                        Filter
                      </Text>
                      {(modalFilterStatus !== 'all' || modalFilterSubject !== 'all' || modalFilterType !== 'all') && (
                        <View style={styles.filterDotBadgeActiveModern} />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Status Pills Segmented (Horizontal Scrollable) */}
                  <View style={styles.filterPillsScrollWrap}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.filterPillsScrollContent}
                    >
                      {[
                        { key: 'all', label: 'Semua', count: tabCounts.all },
                        { key: 'pending', label: 'Belum Dikerjakan', count: tabCounts.pending },
                        { key: 'submitted', label: 'Sudah Dikumpulkan', count: tabCounts.submitted },
                        { key: 'late', label: 'Terlambat', count: tabCounts.late },
                        { key: 'graded', label: 'Sudah Dinilai', count: tabCounts.graded },
                      ].map((tabItem) => {
                        const isActive = activeTab === tabItem.key;
                        return (
                          <TouchableOpacity
                            key={tabItem.key}
                            activeOpacity={0.8}
                            onPress={() => setActiveTab(tabItem.key as any)}
                            style={styles.filterPillBtnItem}
                          >
                            {isActive ? (
                              <LinearGradient
                                colors={['#047857', '#059669']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.filterPillActiveGradient}
                              >
                                <Text style={styles.filterPillTextActive}>{tabItem.label}</Text>
                                <View style={styles.filterPillBadgeActive}>
                                  <Text style={styles.filterPillBadgeTextActive}>{tabItem.count}</Text>
                                </View>
                              </LinearGradient>
                            ) : (
                              <View style={styles.filterPillInactive}>
                                <Text style={styles.filterPillTextInactive}>{tabItem.label}</Text>
                                <View style={styles.filterPillBadgeInactive}>
                                  <Text style={styles.filterPillBadgeTextInactive}>{tabItem.count}</Text>
                                </View>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </View>

              {/* Assignment Card List */}
              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color="#18A165" size="large" />
                  <Text style={styles.loadingText}>Memuat tugas dari sistem...</Text>
                </View>
              ) : filteredAssignments.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialCommunityIcons name="clipboard-check-outline" size={46} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>Tidak Ada Tugas</Text>
                  <Text style={styles.emptySubtitle}>
                    {activeTab === 'all'
                      ? 'Belum ada tugas yang diterbitkan untuk kelas dan siswa ini.'
                      : `Tidak ada tugas dengan status "${activeTab}".`}
                  </Text>
                </View>
              ) : (
                <View style={styles.assignmentCardsContainer}>
                  {filteredAssignments.map((item, idx) => renderAssignmentCard(item, idx))}

                  {/* Load More Button & Notice */}
                  {loadingMore ? (
                    <View style={styles.loadMoreContainer}>
                      <ActivityIndicator size="small" color="#059669" />
                      <Text style={styles.loadMoreText}>Memuat tugas berikutnya...</Text>
                    </View>
                  ) : currentPage < lastPage ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => void loadMoreAssignments()}
                      style={styles.loadMoreButton}
                    >
                      <MaterialCommunityIcons name="arrow-down-circle-outline" size={16} color="#059669" />
                      <Text style={styles.loadMoreButtonText}>
                        Muat Lebih Banyak ({assignments.length} dari {backendKpi?.total_tugas ?? (lastPage * 30)})
                      </Text>
                    </TouchableOpacity>
                  ) : assignments.length > 0 ? (
                    <View style={styles.allLoadedNotice}>
                      <MaterialCommunityIcons name="check-circle-outline" size={15} color="#059669" />
                      <Text style={styles.allLoadedNoticeText}>
                        Semua {assignments.length} tugas telah ditampilkan
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          )}

          {/* TAB 2: KALENDER TUGAS */}
          {mainTab === 'kalender' && (
            <View style={styles.tabContentContainer}>
              {/* Summary Bar */}
              <LinearGradient
                colors={['#0F766E', '#0D9488', '#14B8A6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.calendarSummaryBar}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={styles.calendarSummaryIconSquircle}>
                    <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' }}>
                      Kalender Tugas Mingguan
                    </Text>
                    <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#CCFBF1', marginTop: 1 }}>
                      Jadwal tenggat tugas terencana per hari
                    </Text>
                  </View>
                </View>
                <View style={styles.calendarSummaryBadgePill}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#0F766E' }}>
                    {selectedCalendarDate.toLocaleString('id-ID', { month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              </LinearGradient>

              {/* Kalender Strip Card */}
              <View style={styles.calendarStripCard}>
                <View style={styles.calendarDayHeaderBanner}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.assignmentListHeaderIconSquircle}>
                      <MaterialCommunityIcons name="calendar-clock-outline" size={16} color="#0D9488" />
                    </View>
                    <Text style={styles.sectionTitleBold}>
                      Pilih Hari Tugas ({calendarDayAssignments.length})
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0D9488' }}>
                    {calendarWeekDays.find((d) => d.dateObj.getDate() === selectedCalendarDate.getDate())?.dayName || 'Hari Ini'}, {selectedCalendarDate.getDate()} {selectedCalendarDate.toLocaleString('id-ID', { month: 'short' })}
                  </Text>
                </View>

                {/* Week Strip Row (7 Hari: Senin s/d Ahad) */}
                <View style={[styles.weekStripRow, { marginTop: 10, paddingHorizontal: 10 }]}>
                  {calendarWeekDays.map((wd) => {
                    const isSelected =
                      wd.dateObj.getDate() === selectedCalendarDate.getDate() &&
                      wd.dateObj.getMonth() === selectedCalendarDate.getMonth();
                    return (
                      <TouchableOpacity
                        key={wd.iso}
                        activeOpacity={0.8}
                        onPress={() => setSelectedCalendarDate(wd.dateObj)}
                        style={[styles.weekDayCard, isSelected && styles.weekDayCardSelected]}
                      >
                        <Text style={[styles.weekDayName, isSelected && styles.weekDayNameSelected]}>
                          {wd.dayName}
                        </Text>
                        <Text style={[styles.weekDayNum, isSelected && styles.weekDayNumSelected]}>
                          {wd.dayNum}
                        </Text>
                        {isSelected && <View style={styles.weekDayActiveDot} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Tasks for the selected date */}
              {calendarDayAssignments.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialCommunityIcons name="calendar-check-outline" size={40} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>Tidak Ada Tugas pada Tanggal Ini</Text>
                  <Text style={styles.emptySubtitle}>Nikmati waktu belajar mandiri atau selesaikan tugas pekanan lainnya.</Text>
                </View>
              ) : (
                <View style={styles.assignmentCardsContainer}>
                  {calendarDayAssignments.map((item, idx) => renderAssignmentCard(item, idx))}
                </View>
              )}
            </View>
          )}

          {/* TAB 3: EVALUASI & NILAI */}
          {mainTab === 'nilai' && (
            <View style={styles.tabContentContainer}>
              {/* Summary Bar Evaluasi */}
              <LinearGradient
                colors={['#1E3A8A', '#1D4ED8', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.evalSummaryBar}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={styles.evalSummaryIconSquircle}>
                    <MaterialCommunityIcons name="star-circle-outline" size={18} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' }}>
                      Evaluasi & Hasil Nilai Siswa
                    </Text>
                    <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#BFDBFE', marginTop: 1 }}>
                      Penilaian, ulasan guru, dan capaian kompetensi
                    </Text>
                  </View>
                </View>
                <View style={styles.evalSummaryBadgePill}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#1E40AF' }}>
                    {gradedAssignments.length} Tugas
                  </Text>
                </View>
              </LinearGradient>

              {/* Graded Assignments List */}
              {gradedAssignments.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialCommunityIcons name="star-outline" size={46} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>Belum Ada Tugas Dinilai</Text>
                  <Text style={styles.emptySubtitle}>
                    Tugas yang sudah dikumpulkan dan dievaluasi oleh guru pengampu akan tampil di sini.
                  </Text>
                </View>
              ) : (
                <View style={styles.assignmentCardsContainer}>
                  {gradedAssignments.map((item, idx) => renderAssignmentCard(item, idx, true))}
                </View>
              )}
            </View>
          )}

          {/* 1.5. BOTTOM NOTICE BANNER */}
          <View style={styles.bottomNoticeBanner}>
            <MaterialCommunityIcons name="shield-check" size={18} color="#18A165" />
            <Text style={styles.bottomNoticeText}>
              Harap periksa tenggat waktu penugasan dan kumpulkan tepat waktu.
            </Text>
          </View>
        </View>
      </ScrollView>

        {/* ======================================================== */}
        {/* MODAL 1: FILTER & PENCARIAN (Layar 2)                   */}
        {/* ======================================================== */}
        <Modal
          visible={filterModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setFilterModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderModern}>
                <View style={styles.modalHeaderTitleRow}>
                  <LinearGradient
                    colors={['#059669', '#047857']}
                    style={styles.modalHeaderIconBadge}
                  >
                    <MaterialCommunityIcons name="filter-variant" size={18} color="#FFFFFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Filter Tugas Siswa</Text>
                    <Text style={styles.modalSubtitle}>Sesuaikan kriteria tampilan penugasan</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.modalCloseBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                {/* Status Pengerjaan */}
                <Text style={styles.filterSectionHeading}>Status Pengerjaan:</Text>
                <View style={styles.filterPillsWrap}>
                  {[
                    { key: 'all', label: 'Semua Status' },
                    { key: 'pending', label: 'Belum Dikerjakan' },
                    { key: 'late', label: 'Terlambat' },
                    { key: 'submitted', label: 'Sudah Dikumpulkan' },
                    { key: 'graded', label: 'Sudah Dinilai' },
                  ].map((st) => {
                    const isSel = modalFilterStatus === st.key;
                    const stTheme = STATUS_FILTER_THEMES[st.key] || STATUS_FILTER_THEMES.all;
                    return (
                      <TouchableOpacity
                        key={st.key}
                        activeOpacity={0.8}
                        onPress={() => setModalFilterStatus(st.key)}
                        style={[
                          styles.modalFilterPill,
                          isSel && {
                            backgroundColor: stTheme.activeBg,
                            borderColor: stTheme.activeBorder,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={(isSel ? 'check-circle' : stTheme.icon) as any}
                          size={14}
                          color={isSel ? stTheme.activeIcon : '#64748B'}
                          style={{ marginRight: 5 }}
                        />
                        <Text
                          style={[
                            styles.modalFilterPillText,
                            isSel && { color: stTheme.activeText, fontWeight: '800' },
                          ]}
                        >
                          {st.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Mata Pelajaran */}
                <Text style={[styles.filterSectionHeading, { marginTop: 16 }]}>Mata Pelajaran:</Text>
                <View style={styles.filterPillsWrap}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setModalFilterSubject('all')}
                    style={[
                      styles.modalFilterPill,
                      modalFilterSubject === 'all' && {
                        backgroundColor: '#ECFDF5',
                        borderColor: '#10B981',
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={modalFilterSubject === 'all' ? 'check-circle' : 'book-outline'}
                      size={14}
                      color={modalFilterSubject === 'all' ? '#059669' : '#64748B'}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.modalFilterPillText,
                        modalFilterSubject === 'all' && { color: '#065F46', fontWeight: '800' },
                      ]}
                    >
                      Semua Mapel
                    </Text>
                  </TouchableOpacity>
                  {availableSubjects.map((subName) => {
                    const isSel = modalFilterSubject.toLowerCase() === subName.toLowerCase();
                    const subTheme = getSubjectTheme(subName);
                    return (
                      <TouchableOpacity
                        key={subName}
                        activeOpacity={0.8}
                        onPress={() => setModalFilterSubject(subName)}
                        style={[
                          styles.modalFilterPill,
                          isSel && {
                            backgroundColor: subTheme.badgeBg,
                            borderColor: subTheme.iconColor,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={(isSel ? 'check-circle' : subTheme.icon) as any}
                          size={14}
                          color={isSel ? subTheme.iconColor : '#64748B'}
                          style={{ marginRight: 5 }}
                        />
                        <Text
                          style={[
                            styles.modalFilterPillText,
                            isSel && { color: subTheme.titleColor, fontWeight: '800' },
                          ]}
                        >
                          {subName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Jenis Penugasan */}
                <Text style={[styles.filterSectionHeading, { marginTop: 16 }]}>Jenis Penugasan:</Text>
                <View style={styles.filterPillsWrap}>
                  {[
                    { key: 'all', label: 'Semua Jenis', icon: 'format-list-checks' },
                    { key: 'individu', label: 'Tugas Individu', icon: 'account-outline' },
                    { key: 'kelompok', label: 'Tugas Kelompok', icon: 'account-group-outline' },
                    { key: 'quiz', label: 'Kuis CBT', icon: 'laptop' },
                  ].map((tp) => {
                    const isSel = modalFilterType === tp.key;
                    return (
                      <TouchableOpacity
                        key={tp.key}
                        activeOpacity={0.8}
                        onPress={() => setModalFilterType(tp.key)}
                        style={[
                          styles.modalFilterPill,
                          isSel && {
                            backgroundColor: '#ECFDF5',
                            borderColor: '#10B981',
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={(isSel ? 'check-circle' : tp.icon) as any}
                          size={14}
                          color={isSel ? '#059669' : '#64748B'}
                          style={{ marginRight: 5 }}
                        />
                        <Text
                          style={[
                            styles.modalFilterPillText,
                            isSel && { color: '#065F46', fontWeight: '800' },
                          ]}
                        >
                          {tp.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.modalFooterModern}>
                <TouchableOpacity
                  onPress={() => {
                    setModalFilterStatus('all');
                    setModalFilterSubject('all');
                    setModalFilterType('all');
                  }}
                  style={styles.modalResetBtnModern}
                >
                  <MaterialCommunityIcons name="refresh" size={15} color="#475569" style={{ marginRight: 4 }} />
                  <Text style={styles.modalResetBtnText}>Reset</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setFilterModalVisible(false)}
                  style={styles.modalApplyBtnContainer}
                >
                  <LinearGradient
                    colors={['#059669', '#047857']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalApplyBtnGradient}
                  >
                    <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.modalApplyBtnText}>Terapkan Filter</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 2: DETAIL TUGAS (Layar 3, 8, 9)                    */}
        {/* ======================================================== */}
        <Modal
          visible={!!selectedDetailAssignment}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedDetailAssignment(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '92%' }]}>
              {(() => {
                if (!selectedDetailAssignment) return null;
                const statusObj = getAssignmentStatus(selectedDetailAssignment);
                const sub = Array.isArray(selectedDetailAssignment.pengumpulan_tugas) && selectedDetailAssignment.pengumpulan_tugas.length > 0
                  ? selectedDetailAssignment.pengumpulan_tugas[0]
                  : Array.isArray(selectedDetailAssignment.pengumpulanTugas) && selectedDetailAssignment.pengumpulanTugas.length > 0
                  ? selectedDetailAssignment.pengumpulanTugas[0]
                  : selectedDetailAssignment.submission;
                const isGraded = statusObj.key === 'graded' || (sub && sub.nilai_guru !== null && sub.nilai_guru !== undefined);
                const isLate = statusObj.key === 'late';
                const isGroup = selectedDetailAssignment.jenis_tugas === 'kelompok';
                const subjectName = selectedDetailAssignment.subject?.name || selectedDetailAssignment.subject?.nama_mapel || selectedDetailAssignment.mata_pelajaran || '';
                const subjectTheme = getSubjectTheme(subjectName);
                const teacherName = selectedDetailAssignment.teacher?.name || selectedDetailAssignment.teacher?.nama_lengkap || selectedDetailAssignment.guru?.nama_lengkap || selectedDetailAssignment.guru?.nama || '';
                const taskTitle = cleanTaskTitle(selectedDetailAssignment.judul_tugas || selectedDetailAssignment.judul || selectedDetailAssignment.title || 'Penugasan');

                return (
                  <>
                    <View style={styles.modalHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalTitle}>Detail Tugas</Text>
                        <Text numberOfLines={1} style={styles.modalSubtitle}>
                          {subjectName ? `${subjectName} • ` : ''}Tahun Ajaran {getDynamicAcademicInfo(selectedDetailAssignment)}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setSelectedDetailAssignment(null)} style={styles.modalCloseBtn}>
                        <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                      </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.modalBody}>
                      {/* Layar 9: Banner Peringatan Keterlambatan jika Terlambat */}
                      {isLate && (
                        <View style={styles.lateWarningBanner}>
                          <MaterialCommunityIcons name="alert-circle" size={22} color="#DC2626" />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.lateWarningTitle}>Tugas Ini Sudah Terlambat!</Text>
                            <Text style={styles.lateWarningDesc}>
                              Batas waktu telah berakhir. Segera kumpulkan tugas agar tidak mengurangi poin penilaian ananda.
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Layar 8: Pencapaian Nilai jika Sudah Dinilai */}
                      {isGraded && (
                        <View style={styles.gradedHeroBanner}>
                          <LinearGradient
                            colors={['#064E3B', '#047857']}
                            style={styles.gradedHeroGradient}
                          >
                            <View style={styles.gradedScoreCircle}>
                              <Text style={styles.gradedScoreVal}>{sub?.nilai_guru ?? sub?.nilai ?? 92}</Text>
                              <Text style={styles.gradedScoreMax}>/100</Text>
                            </View>
                            <View style={{ flex: 1, marginLeft: 14 }}>
                              <View style={styles.gradeLetterBadge}>
                                <Text style={styles.gradeLetterText}>Grade {sub?.nilai_huruf || 'A'}</Text>
                              </View>
                              <Text style={styles.gradedHeroTitle}>Tugas Sudah Dinilai</Text>
                              <Text style={styles.gradedHeroSub}>Diperiksa oleh {teacherName || 'Guru Pembimbing'}</Text>
                            </View>
                          </LinearGradient>

                          {(sub?.catatan_guru || sub?.catatan) && (
                            <View style={styles.feedbackCardBox}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 5 }}>
                                <MaterialCommunityIcons name="comment-text-outline" size={15} color="#059669" />
                                <Text style={styles.feedbackCardLabel}>Catatan & Evaluasi Guru:</Text>
                              </View>
                              <Text style={styles.feedbackCardContent}>
                                {sub?.catatan_guru || sub?.catatan}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Header Badge & Title */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: isLate || isGraded ? 12 : 0 }}>
                        <View style={[styles.subjectPillBadge, { backgroundColor: subjectTheme.badgeBg, borderColor: subjectTheme.badgeBorder }]}>
                          <Text style={[styles.subjectPillText, { color: subjectTheme.badgeText }]}>{subjectName || 'Umum'}</Text>
                        </View>
                        <View style={[styles.statusPillBadge, { backgroundColor: statusObj.bg }]}>
                          <Text style={[styles.statusPillText, { color: statusObj.color }]}>{statusObj.label}</Text>
                        </View>
                        {isGroup && (
                          <View style={[styles.statusPillBadge, { backgroundColor: '#E0F2FE' }]}>
                            <Text style={[styles.statusPillText, { color: '#0284C7' }]}>Kelompok</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.detailFullTitle}>{taskTitle}</Text>

                      {/* Info Guru & Tenggat */}
                      <View style={styles.detailMetaCard}>
                        <View style={styles.detailMetaRow}>
                          <MaterialCommunityIcons name="account-tie-outline" size={16} color="#059669" />
                          <Text style={styles.detailMetaLabel}>Guru Pembimbing:</Text>
                          <Text style={styles.detailMetaVal}>{teacherName || '-'}</Text>
                        </View>
                        <View style={styles.detailMetaDivider} />
                        <View style={styles.detailMetaRow}>
                          <MaterialCommunityIcons name="calendar-clock" size={16} color="#059669" />
                          <Text style={styles.detailMetaLabel}>Batas Waktu:</Text>
                          <Text style={[styles.detailMetaVal, isLate && { color: '#DC2626' }]}>
                            {formatDeadline(selectedDetailAssignment.deadline)}
                          </Text>
                        </View>
                      </View>

                      {/* Deskripsi & Instruksi */}
                      <Text style={[styles.inputLabel, { marginTop: 14 }]}>Petunjuk & Instruksi Soal:</Text>
                      <View style={styles.detailDescBox}>
                        <Text style={styles.detailDescText}>
                          {selectedDetailAssignment.deskripsi || selectedDetailAssignment.instruksi || 'Silakan kerjakan penugasan ini sesuai materi yang telah dipelajari di kelas.'}
                        </Text>
                      </View>

                      {/* Lampiran / Materi */}
                      {selectedDetailAssignment.file_lampiran_url && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handleOpenEmbedUrl(selectedDetailAssignment.file_lampiran_url, 'Berkas Lampiran Soal Guru')}
                          style={[styles.teacherFileAttachmentBtn, { marginTop: 12 }]}
                        >
                          <MaterialCommunityIcons name="file-eye-outline" size={18} color="#0E5C44" />
                          <Text style={styles.teacherFileAttachmentText}>Buka & Pratinjau Berkas Lampiran Soal</Text>
                        </TouchableOpacity>
                      )}

                      {/* Layar 3: Kriteria Penilaian / Rubrik (Collapsible) */}
                      <View style={styles.rubricContainer}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setCriteriaExpanded((prev) => !prev)}
                          style={styles.rubricHeaderRow}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <MaterialCommunityIcons name="clipboard-check-outline" size={17} color="#059669" />
                            <Text style={styles.rubricTitle}>
                              Kriteria & Bobot Penilaian
                              {Array.isArray(selectedDetailAssignment?.rubrics || selectedDetailAssignment?.kriteria_penilaian) && (selectedDetailAssignment?.rubrics || selectedDetailAssignment?.kriteria_penilaian).length > 0
                                ? ` (${(selectedDetailAssignment?.rubrics || selectedDetailAssignment?.kriteria_penilaian).length} Kriteria)`
                                : ''}
                            </Text>
                          </View>
                          <MaterialCommunityIcons
                            name={criteriaExpanded ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color="#64748B"
                          />
                        </TouchableOpacity>

                        {criteriaExpanded && (
                          <View style={styles.rubricBody}>
                            {(() => {
                              const rawRubrics = selectedDetailAssignment?.rubrics || selectedDetailAssignment?.kriteria_penilaian;
                              const rubricsList = Array.isArray(rawRubrics) ? rawRubrics : [];

                              if (rubricsList.length === 0) {
                                return (
                                  <View style={{ paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 13, color: '#64748B', fontStyle: 'italic' }}>
                                      Rubrik belum tersedia
                                    </Text>
                                  </View>
                                );
                              }

                              return rubricsList.map((cr: any, cIdx: number) => {
                                const label = cr.label || cr.name || cr.kriteria || cr.nama || `Kriteria ${cIdx + 1}`;
                                const weightVal = cr.weight !== undefined ? cr.weight : (cr.bobot !== undefined ? cr.bobot : null);
                                const weightText = weightVal !== null ? (typeof weightVal === 'number' ? `${weightVal}%` : `${weightVal}`) : '';
                                return (
                                  <View key={cIdx} style={styles.rubricItemRow}>
                                    <Text style={styles.rubricItemLabel}>• {label}</Text>
                                    {weightText ? (
                                      <View style={styles.rubricWeightBadge}>
                                        <Text style={styles.rubricWeightText}>{weightText}</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                );
                              });
                            })()}
                          </View>
                        )}
                      </View>
                    </ScrollView>

                    <View style={styles.modalFooter}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setDiscussionModalVisible(true)}
                        style={styles.discussionTriggerBtn}
                      >
                        <MaterialCommunityIcons name="chat-processing-outline" size={16} color="#059669" />
                        <Text style={styles.discussionTriggerBtnText}>Diskusi</Text>
                      </TouchableOpacity>

                      {isGroup && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setGroupModalVisible(true)}
                          style={styles.groupTriggerBtn}
                        >
                          <MaterialCommunityIcons name="account-group" size={16} color="#0284C7" />
                          <Text style={styles.groupTriggerBtnText}>Kelompok</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          const target = selectedDetailAssignment;
                          setSelectedDetailAssignment(null);
                          setSelectedAssignment(target);
                          setSubmissionText(sub?.jawaban_teks || '');
                          setPickedAttachment(null);
                        }}
                        style={styles.modalSubmitBtn}
                      >
                        <MaterialCommunityIcons name="tray-arrow-up" size={16} color="#FFFFFF" />
                        <Text style={styles.modalSubmitBtnText}>
                          {isGraded ? 'Kirim Ulang' : statusObj.key === 'submitted' ? 'Kirim Ulang' : 'Kumpulkan'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 3: PENGUMPULAN TUGAS (Layar 4)                    */}
        {/* ======================================================== */}
        <Modal
          visible={!!selectedAssignment}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedAssignment(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '92%' }]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Kumpulkan Tugas</Text>
                  <Text numberOfLines={1} style={styles.modalSubtitle}>
                    {cleanTaskTitle(selectedAssignment?.judul_tugas || selectedAssignment?.judul || '')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedAssignment(null)} style={styles.modalCloseBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                {/* 1. Banner Jenis Tugas Dinamis */}
                {(() => {
                  const jenis = selectedAssignment?.jenis_tugas || 'tugas';
                  const jenisConfig: Record<string, { label: string; icon: any; color: string; bg: string; border: string; desc: string }> = {
                    tahfizh: { label: 'Setoran Tahfizh Al-Qur\'an', icon: 'book-open-variant', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', desc: 'Setoran langsung di kelas, rekaman audio, atau video hafalan.' },
                    quiz: { label: 'Kuis Online CBT', icon: 'lightning-bolt', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', desc: 'Pilih jawaban butir kuis di bawah ini untuk penilaian otomatis/manual.' },
                    kuis: { label: 'Kuis Online CBT', icon: 'lightning-bolt', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', desc: 'Pilih jawaban butir kuis di bawah ini untuk penilaian otomatis/manual.' },
                    esai: { label: 'Tugas Esai', icon: 'text-box-outline', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD', desc: 'Tuliskan esai mendalam sesuai topik instruksi guru.' },
                    tertulis: { label: 'Tugas Tertulis', icon: 'lead-pencil', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', desc: 'Ketikkan teks jawaban atau unggah foto lembar tugas.' },
                    dokumen: { label: 'Unggah Dokumen', icon: 'file-pdf-box', color: '#DC2626', bg: '#FEF2F2', border: '#FECDD3', desc: 'Lampirkan berkas PDF/DOCX atau sematkan link Google Drive/Docs.' },
                    praktik: { label: 'Tugas Praktik', icon: 'video-outline', color: '#E11D48', bg: '#FFF1F2', border: '#FECDD3', desc: 'Unggah foto/video demonstrasi atau sematkan tautan YouTube/Drive.' },
                    literasi: { label: 'Literasi & Resensi', icon: 'book-outline', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4', desc: 'Ringkasan bacaan atau ulasan literasi yang ditugaskan.' },
                    proyek: { label: 'Proyek Kelompok', icon: 'account-group', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE', desc: 'Tugas kolaborasi kelompok, laporan dokumen atau presentasi Canva/Slide.' },
                  };
                  const cfg = jenisConfig[jenis] || { label: 'Penugasan Standar', icon: 'clipboard-text-outline', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', desc: 'Kumpulkan jawaban atau berkas tugas sesuai instruksi guru.' };

                  return (
                    <View style={{ backgroundColor: cfg.bg, borderColor: cfg.border, borderWidth: 1.5, borderRadius: 14, padding: 12, marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <MaterialCommunityIcons name={cfg.icon} size={16} color={cfg.color} />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: cfg.color }}>{cfg.label}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#475569', lineHeight: 16 }}>{cfg.desc}</Text>
                    </View>
                  );
                })()}

                {/* 2. DYNAMIC SECTION: Tahfizh Mode Selector & Target */}
                {selectedAssignment?.jenis_tugas === 'tahfizh' && (
                  <View style={{ backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#86EFAC', borderRadius: 14, padding: 12, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <MaterialCommunityIcons name="book-open-page-variant" size={18} color="#059669" />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#065F46' }}>Target Setoran & Metode Pilihan:</Text>
                    </View>

                    {Boolean(selectedAssignment?.metadata?.surah || selectedAssignment?.metadata?.target_surah) && (
                      <View style={{ backgroundColor: '#FFFFFF', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0', marginBottom: 10 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#065F46' }}>
                          Surah: {selectedAssignment?.metadata?.surah || selectedAssignment?.metadata?.target_surah}
                          {selectedAssignment?.metadata?.ayat_awal ? ` (Ayat ${selectedAssignment?.metadata?.ayat_awal} - ${selectedAssignment?.metadata?.ayat_akhir || 'selesai'})` : ''}
                        </Text>
                      </View>
                    )}

                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857', marginBottom: 6 }}>
                      Pilih Cara Menyetorkan:
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[
                        { key: 'langsung', label: 'Setoran Langsung', icon: 'account-voice' },
                        { key: 'audio', label: 'Rekaman Suara', icon: 'microphone' },
                        { key: 'video', label: 'Video / Tautan', icon: 'video' },
                      ].map((m) => {
                        const isSelected = submissionTahfizhMode === m.key;
                        return (
                          <TouchableOpacity
                            key={m.key}
                            activeOpacity={0.8}
                            onPress={() => setSubmissionTahfizhMode(m.key as any)}
                            style={{
                              flex: 1,
                              paddingVertical: 8,
                              paddingHorizontal: 4,
                              borderRadius: 10,
                              borderWidth: 1.5,
                              borderColor: isSelected ? '#059669' : '#CBD5E1',
                              backgroundColor: isSelected ? '#DCFCE7' : '#FFFFFF',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <MaterialCommunityIcons
                              name={m.icon as any}
                              size={15}
                              color={isSelected ? '#059669' : '#64748B'}
                              style={{ marginBottom: 2 }}
                            />
                            <Text
                              numberOfLines={1}
                              style={{
                                fontSize: 10,
                                fontWeight: isSelected ? '800' : '600',
                                color: isSelected ? '#047857' : '#475569',
                              }}
                            >
                              {m.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {submissionTahfizhMode === 'langsung' && (
                      <Text style={{ fontSize: 10, color: '#047857', fontStyle: 'italic', marginTop: 8 }}>
                        * Setoran hafalan dilakukan secara tatap muka di depan Guru/Ustadz di kelas. Guru akan menilai kelancaran, tajwid, dan fasahah secara langsung.
                      </Text>
                    )}
                  </View>
                )}

                {/* 3. DYNAMIC SECTION: Proyek Kelompok (Nama Anggota) */}
                {selectedAssignment?.jenis_tugas === 'proyek' && (
                  <View style={{ backgroundColor: '#EEF2FF', borderWidth: 1.5, borderColor: '#C7D2FE', borderRadius: 14, padding: 12, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <MaterialCommunityIcons name="account-group" size={16} color="#4F46E5" />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#3730A3' }}>Nama Anggota Kelompok:</Text>
                    </View>
                    <TextInput
                      value={submissionGroupMembers}
                      onChangeText={setSubmissionGroupMembers}
                      placeholder="Contoh: Ahmad Fauzi (Ketua), Budi Santoso, Fitri..."
                      placeholderTextColor="#94A3B8"
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#C7D2FE',
                        borderRadius: 10,
                        padding: 10,
                        fontSize: 12,
                        color: '#1E293B',
                      }}
                    />
                  </View>
                )}

                {/* 4. Dropzone Upload Berkas / Foto */}
                <Text style={styles.inputLabel}>Unggah Berkas / Dokumen / Foto:</Text>
                <View style={styles.dropzoneBox}>
                  <View style={styles.dropzoneIconCircle}>
                    <MaterialCommunityIcons name="cloud-upload-outline" size={28} color="#059669" />
                  </View>
                  <Text style={styles.dropzoneTitle}>Pilih Berkas atau Foto Tugas</Text>
                  <Text style={styles.dropzoneSub}>Format PDF, PNG, JPG, DOCX (Maks. 10 MB)</Text>

                  <View style={styles.pickerBtnRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={handlePickDocument}
                      style={styles.pickerActionBtn}
                    >
                      <MaterialCommunityIcons name="file-pdf-box" size={16} color="#0E5C44" />
                      <Text style={styles.pickerActionBtnText}>Dokumen (PDF)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={handlePickImage}
                      style={styles.pickerActionBtn}
                    >
                      <MaterialCommunityIcons name="camera-outline" size={16} color="#0E5C44" />
                      <Text style={styles.pickerActionBtnText}>Foto / Galeri</Text>
                    </TouchableOpacity>
                  </View>

                  {pickedAttachment && (
                    <View style={styles.selectedAttachmentChip}>
                      <MaterialCommunityIcons name="paperclip" size={16} color="#18A165" />
                      <Text numberOfLines={1} style={styles.selectedAttachmentName}>
                        {pickedAttachment.name}
                      </Text>
                      <TouchableOpacity onPress={() => setPickedAttachment(null)} style={styles.removeAttachmentBtn}>
                        <MaterialCommunityIcons name="close-circle" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* 5. INPUT TAUTAN FILE, VIDEO, ATAU DOKUMEN (DENGAN EMBED VIEWER IN-APP) */}
                <View style={{ marginTop: 12, marginBottom: 14 }}>
                  <Text style={styles.inputLabel}>Tautan File / Video / Dokumen (Opsional):</Text>
                  <View style={{ backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14, padding: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, marginBottom: 8 }}>
                      <MaterialCommunityIcons name="link-variant" size={18} color="#059669" style={{ marginRight: 8 }} />
                      <TextInput
                        value={submissionUrlLink}
                        onChangeText={setSubmissionUrlLink}
                        placeholder="Tempel tautan (Google Drive, YouTube, Docs, Canva...)"
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{ flex: 1, height: 40, fontSize: 12, color: '#1E293B' }}
                      />
                      {submissionUrlLink.trim().length > 0 && (
                        <TouchableOpacity onPress={() => setSubmissionUrlLink('')} style={{ padding: 4 }}>
                          <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {submissionUrlLink.trim().length > 0 && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleOpenEmbedUrl(submissionUrlLink.trim(), 'Pratinjau Tautan Tugas Anda')}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#ECFDF5',
                          borderWidth: 1.5,
                          borderColor: '#6EE7B7',
                          borderRadius: 10,
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          gap: 6,
                        }}
                      >
                        <MaterialCommunityIcons name="eye-outline" size={16} color="#059669" />
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#047857' }}>
                          Uji Pratinjau Tautan (In-App Embed)
                        </Text>
                      </TouchableOpacity>
                    )}
                    <Text style={{ fontSize: 10, color: '#64748B', marginTop: 6, fontStyle: 'italic' }}>
                      * Tautan akan ditampilkan di dalam aplikasi tanpa membuka browser luar.
                    </Text>
                  </View>
                </View>

                {/* Lembar Soal CBT jika kuis */}
                {parsedQuestions.length > 0 ? (
                  <View style={{ marginTop: 14, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={[styles.inputLabel, { color: '#7C3AED', fontWeight: '800' }]}>
                        Lembar Soal Kuis CBT ({parsedQuestions.length} Butir):
                      </Text>
                      <View style={{ backgroundColor: '#F5F3FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#DDD6FE' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>
                          Terjawab: {Object.keys(quizAnswers).length} / {parsedQuestions.length}
                        </Text>
                      </View>
                    </View>

                    {parsedQuestions.map((q: any, qIdx: number) => {
                      const selectedOpt = String(quizAnswers[qIdx] || '').toUpperCase();
                      const isTf = q.tipe === 'tf' || q.tipe === 'benar_salah';
                      const isEssay = q.tipe === 'esai' || q.tipe === 'essay';
                      const isMatching = q.tipe === 'menjodohkan';

                      return (
                        <View
                          key={qIdx}
                          style={{
                            backgroundColor: '#FAFAF9',
                            borderWidth: 1,
                            borderColor: '#E7E5E4',
                            borderRadius: 14,
                            padding: 12,
                            marginBottom: 12,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A' }}>
                                Soal No. {qIdx + 1}
                              </Text>
                              <View style={{
                                backgroundColor: isMatching ? '#FEF3C7' : isEssay ? '#E0F2FE' : isTf ? '#F3E8FF' : '#ECFDF5',
                                paddingHorizontal: 6,
                                paddingVertical: 1.5,
                                borderRadius: 5,
                              }}>
                                <Text style={{
                                  fontSize: 10,
                                  fontWeight: '800',
                                  color: isMatching ? '#D97706' : isEssay ? '#0284C7' : isTf ? '#7C3AED' : '#059669',
                                }}>
                                  {isMatching ? 'Menjodohkan' : isEssay ? 'Esai' : isTf ? 'Benar / Salah' : 'Pilihan Ganda'}
                                </Text>
                              </View>
                            </View>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#059669', backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                              {q.poin || (isEssay ? 25 : isMatching ? 25 : 25)} Poin
                            </Text>
                          </View>

                          <Text style={{ fontSize: 13, color: '#1E293B', fontWeight: '600', marginBottom: 10, lineHeight: 18 }}>
                            {q.pertanyaan || q.soal}
                          </Text>

                          {/* 1. Benar / Salah */}
                          {isTf && (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {['BENAR', 'SALAH'].map((val) => {
                                const isSel = selectedOpt.toUpperCase() === val;
                                return (
                                  <TouchableOpacity
                                    key={val}
                                    activeOpacity={0.8}
                                    onPress={() => setQuizAnswers((prev) => ({ ...prev, [qIdx]: val }))}
                                    style={{
                                      flex: 1,
                                      paddingVertical: 9,
                                      borderRadius: 10,
                                      borderWidth: 2,
                                      borderColor: isSel ? '#7C3AED' : '#E2E8F0',
                                      backgroundColor: isSel ? '#F5F3FF' : '#FFFFFF',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Text style={{ fontSize: 12, fontWeight: '800', color: isSel ? '#7C3AED' : '#475569' }}>
                                      {val}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}

                          {/* 2. Esai / Uraian */}
                          {isEssay && (
                            <View>
                              <TextInput
                                value={quizAnswers[qIdx] || ''}
                                onChangeText={(text) => setQuizAnswers((prev) => ({ ...prev, [qIdx]: text }))}
                                multiline
                                numberOfLines={3}
                                placeholder="Ketikkan uraian jawaban Anda di sini..."
                                placeholderTextColor="#94A3B8"
                                style={{
                                  borderWidth: 1.5,
                                  borderColor: (quizAnswers[qIdx] || '').trim() ? '#0284C7' : '#CBD5E1',
                                  backgroundColor: '#FFFFFF',
                                  borderRadius: 10,
                                  padding: 10,
                                  fontSize: 12,
                                  color: '#1E293B',
                                  minHeight: 70,
                                  textAlignVertical: 'top',
                                }}
                              />
                            </View>
                          )}

                          {/* 3. Menjodohkan */}
                          {isMatching && (() => {
                            const pairs: Array<{ kiri: string; kanan: string }> = q.matchingPairs || (
                              Array.isArray(q.pasangan) ? q.pasangan : []
                            );
                            const leftItems = pairs.map((p) => p.kiri);
                            const rightOptions = pairs.map((p) => p.kanan);
                            let userSelections: Record<string, string> = {};
                            try {
                              if (quizAnswers[qIdx]) {
                                userSelections = typeof quizAnswers[qIdx] === 'object' ? quizAnswers[qIdx] : JSON.parse(quizAnswers[qIdx]);
                              }
                            } catch {}

                            return (
                              <View style={{ gap: 8 }}>
                                {leftItems.map((leftVal, lIdx) => {
                                  const curRight = userSelections[leftVal] || '';
                                  return (
                                    <View key={lIdx} style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: curRight ? '#FDE68A' : '#E2E8F0', borderRadius: 10, padding: 8 }}>
                                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E293B', marginBottom: 4 }}>
                                        {lIdx + 1}. {leftVal}
                                      </Text>
                                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                        {rightOptions.map((opt, oIdx) => {
                                          const isChosen = curRight === opt;
                                          return (
                                            <TouchableOpacity
                                              key={oIdx}
                                              activeOpacity={0.8}
                                              onPress={() => {
                                                const next = { ...userSelections, [leftVal]: isChosen ? '' : opt };
                                                setQuizAnswers((prev) => ({ ...prev, [qIdx]: JSON.stringify(next) }));
                                              }}
                                              style={{
                                                paddingHorizontal: 8,
                                                paddingVertical: 4,
                                                borderRadius: 6,
                                                borderWidth: 1.2,
                                                borderColor: isChosen ? '#D97706' : '#E2E8F0',
                                                backgroundColor: isChosen ? '#FEF3C7' : '#F8FAFC',
                                              }}
                                            >
                                              <Text style={{ fontSize: 10.5, fontWeight: isChosen ? '800' : '600', color: isChosen ? '#B45309' : '#64748B' }}>
                                                {isChosen ? '✓ ' : ''}{opt}
                                              </Text>
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </View>
                                    </View>
                                  );
                                })}
                              </View>
                            );
                          })()}

                          {/* 4. Pilihan Ganda (Default) */}
                          {!isTf && !isEssay && !isMatching && (
                            ['a', 'b', 'c', 'd', 'e'].map((letter) => {
                              const optText = q[`opsi_${letter}`];
                              if (!optText) return null;
                              const upper = letter.toUpperCase();
                              const isSel = selectedOpt.toUpperCase() === upper;

                              return (
                                <TouchableOpacity
                                  key={letter}
                                  activeOpacity={0.8}
                                  onPress={() => setQuizAnswers((prev) => ({ ...prev, [qIdx]: upper }))}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    padding: 8,
                                    borderRadius: 10,
                                    borderWidth: 1.5,
                                    borderColor: isSel ? '#7C3AED' : '#E2E8F0',
                                    backgroundColor: isSel ? '#F5F3FF' : '#FFFFFF',
                                    marginBottom: 6,
                                  }}
                                >
                                  <View
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: 7,
                                      backgroundColor: isSel ? '#7C3AED' : '#F1F5F9',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      marginRight: 8,
                                    }}
                                  >
                                    <Text style={{ fontSize: 11, fontWeight: '800', color: isSel ? '#FFFFFF' : '#64748B' }}>
                                      {upper}
                                    </Text>
                                  </View>
                                  <Text style={{ fontSize: 12, color: isSel ? '#5B21B6' : '#334155', fontWeight: isSel ? '700' : '500', flex: 1 }}>
                                    {optText}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 4 }}>
                      <Text style={styles.inputLabel}>
                        {selectedAssignment?.jenis_tugas === 'esai' ? 'Lembar Esai Siswa:' : 'Catatan / Jawaban Teks Siswa:'}
                      </Text>
                      {selectedAssignment?.jenis_tugas === 'esai' && (
                        <View style={{ backgroundColor: '#F0F9FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#BAE6FD' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#0284C7' }}>
                            {submissionText.trim().split(/\s+/).filter(Boolean).length} Kata
                          </Text>
                        </View>
                      )}
                    </View>
                    <TextInput
                      value={submissionText}
                      onChangeText={setSubmissionText}
                      multiline
                      numberOfLines={selectedAssignment?.jenis_tugas === 'esai' ? 8 : 4}
                      placeholder={selectedAssignment?.jenis_tugas === 'esai' ? 'Tuliskan esai lengkap Anda di sini...' : 'Tuliskan jawaban atau keterangan pengerjaan tugas Anda di sini...'}
                      placeholderTextColor="#94A3B8"
                      style={[styles.modalTextInput, selectedAssignment?.jenis_tugas === 'esai' && { minHeight: 140, textAlignVertical: 'top' }]}
                    />
                  </>
                )}

                {/* Checkbox Integritas Akademik */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setIntegrityChecked((prev) => !prev)}
                  style={styles.integrityCheckboxRow}
                >
                  <MaterialCommunityIcons
                    name={integrityChecked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={22}
                    color={integrityChecked ? '#059669' : '#94A3B8'}
                  />
                  <Text style={styles.integrityCheckboxText}>
                    Saya menyatakan bahwa tugas ini dikerjakan secara mandiri dan dengan penuh kejujuran akademik.
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  onPress={() => setSelectedAssignment(null)}
                  style={styles.modalCancelBtn}
                  disabled={submitting}
                >
                  <Text style={styles.modalCancelBtnText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePressSubmit}
                  style={styles.modalSubmitBtn}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                      <Text style={styles.modalSubmitBtnText}>Kirim Tugas</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 4: KONFIRMASI PENGUMPULAN (Layar 5)                */}
        {/* ======================================================== */}
        <Modal
          visible={confirmModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmModalVisible(false)}
        >
          <View style={[styles.modalOverlay, { justifyContent: 'center', paddingHorizontal: 20 }]}>
            <View style={styles.dialogCard}>
              <View style={styles.dialogIconCircle}>
                <MaterialCommunityIcons name="help-circle-outline" size={32} color="#059669" />
              </View>

              <Text style={styles.dialogTitle}>Konfirmasi Pengumpulan</Text>
              <Text style={styles.dialogSubtitle}>
                Apakah Anda yakin ingin mengumpulkan tugas ini sekarang?
              </Text>

              <View style={styles.dialogSummaryBox}>
                <Text numberOfLines={1} style={styles.dialogTaskName}>
                  {cleanTaskTitle(selectedAssignment?.judul_tugas || selectedAssignment?.judul || '')}
                </Text>
                <Text style={styles.dialogFileStatus}>
                  Berkas: {pickedAttachment ? pickedAttachment.name : submissionText ? 'Jawaban Teks Terisi' : 'Kuis CBT'}
                </Text>
              </View>

              <View style={styles.dialogNoticeBox}>
                <MaterialCommunityIcons name="information" size={15} color="#059669" />
                <Text style={styles.dialogNoticeText}>
                  Jawaban yang dikumpulkan akan langsung tercatat dan dapat diperiksa oleh guru.
                </Text>
              </View>

              <View style={styles.dialogButtonsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setConfirmModalVisible(false)}
                  style={styles.dialogCancelBtn}
                  disabled={submitting}
                >
                  <Text style={styles.dialogCancelBtnText}>Periksa Lagi</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleConfirmSubmitAssignment}
                  style={styles.dialogConfirmBtn}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.dialogConfirmBtnText}>Ya, Kumpulkan</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 5: BERHASIL DIKUMPULKAN (Layar 6)                  */}
        {/* ======================================================== */}
        <Modal
          visible={successModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSuccessModalVisible(false)}
        >
          <View style={[styles.modalOverlay, { justifyContent: 'center', paddingHorizontal: 20 }]}>
            <View style={styles.dialogCard}>
              <View style={[styles.dialogIconCircle, { backgroundColor: '#DEF7EC', borderColor: '#31C48D' }]}>
                <MaterialCommunityIcons name="check-decagram" size={38} color="#059669" />
              </View>

              <Text style={styles.dialogTitle}>Alhamdulillah! Berhasil</Text>
              <Text style={styles.dialogSubtitle}>
                Tugas ananda telah berhasil dikumpulkan dan tercatat di sistem akademik.
              </Text>

              {lastSubmittedAssignment && (
                <View style={styles.dialogSummaryBox}>
                  <Text numberOfLines={1} style={styles.dialogTaskName}>
                    {cleanTaskTitle(lastSubmittedAssignment?.judul_tugas || lastSubmittedAssignment?.judul || '')}
                  </Text>
                  <Text style={styles.dialogFileStatus}>
                    Waktu: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                  </Text>
                </View>
              )}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setSuccessModalVisible(false);
                  setLastSubmittedAssignment(null);
                }}
                style={[styles.dialogConfirmBtn, { width: '100%', marginTop: 8 }]}
              >
                <Text style={styles.dialogConfirmBtnText}>Tutup & Kembali</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 6: DETAIL KELOMPOK (Layar 10)                     */}
        {/* ======================================================== */}
        <Modal
          visible={groupModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setGroupModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Informasi Penugasan Kelompok</Text>
                  <Text style={styles.modalSubtitle}>Kolaborasi tim dan pembagian tugas</Text>
                </View>
                <TouchableOpacity onPress={() => setGroupModalVisible(false)} style={styles.modalCloseBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.groupBadgeHeaderBox}>
                  <MaterialCommunityIcons name="account-group" size={24} color="#0284C7" />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.groupHeaderName}>
                      {selectedDetailAssignment?.nama_kelompok || selectedDetailAssignment?.group_name || 'Penugasan Kelompok'}
                    </Text>
                    <Text style={styles.groupHeaderSub}>
                      {selectedDetailAssignment?.peran_user || (activeChildName ? `Ananda: ${activeChildName}` : 'Kolaborasi Tim')}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.inputLabel, { marginTop: 16 }]}>
                  Anggota Kelompok
                  {Array.isArray(selectedDetailAssignment?.anggota_kelompok || selectedDetailAssignment?.group_members || selectedDetailAssignment?.members) && (selectedDetailAssignment?.anggota_kelompok || selectedDetailAssignment?.group_members || selectedDetailAssignment?.members).length > 0
                    ? ` (${(selectedDetailAssignment?.anggota_kelompok || selectedDetailAssignment?.group_members || selectedDetailAssignment?.members).length} Santri):`
                    : ':'}
                </Text>

                {(() => {
                  const rawMembers = selectedDetailAssignment?.anggota_kelompok || selectedDetailAssignment?.group_members || selectedDetailAssignment?.members;
                  const membersList = Array.isArray(rawMembers) ? rawMembers : [];

                  if (membersList.length === 0) {
                    return (
                      <View style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialCommunityIcons name="account-search-outline" size={32} color="#94A3B8" />
                        <Text style={{ marginTop: 8, fontSize: 13, color: '#64748B', fontWeight: '500' }}>
                          Daftar anggota kelompok belum tersedia
                        </Text>
                      </View>
                    );
                  }

                  return membersList.map((member: any, mIdx: number) => {
                    const memberName = typeof member === 'string' ? member : (member?.name || member?.nama_lengkap || member?.nama || `Anggota ${mIdx + 1}`);
                    const memberNis = typeof member === 'object' ? (member?.nis || member?.nisn || '') : '';
                    const memberRole = typeof member === 'object' ? (member?.role || member?.peran || (member?.is_leader || member?.isLeader ? 'Ketua Kelompok' : 'Anggota')) : 'Anggota';
                    const isLeader = typeof member === 'object' ? Boolean(member?.is_leader || member?.isLeader || memberRole?.toLowerCase?.().includes('ketua')) : false;

                    return (
                      <View key={mIdx} style={styles.groupMemberRow}>
                        <View style={styles.groupMemberAvatar}>
                          <Text style={styles.groupMemberAvatarText}>{memberName.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.groupMemberName}>{memberName}</Text>
                          {memberNis ? <Text style={styles.groupMemberNis}>NIS: {memberNis}</Text> : null}
                        </View>
                        <View
                          style={[
                            styles.groupMemberRoleBadge,
                            isLeader && { backgroundColor: '#DEF7EC', borderColor: '#31C48D' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.groupMemberRoleText,
                              isLeader && { color: '#047857' },
                            ]}
                          >
                            {memberRole}
                          </Text>
                        </View>
                      </View>
                    );
                  });
                })()}

                <Text style={[styles.inputLabel, { marginTop: 16 }]}>Petunjuk Kerja Kelompok:</Text>
                <View style={styles.groupInstructionsBox}>
                  <Text style={styles.groupInstructionsText}>
                    Diskusikan pembagian materi secara proporsional. Pengumpulan tugas cukup diwakilkan oleh salah satu anggota atau ketua kelompok dengan menyertakan nama seluruh anggota di lembar jawaban.
                  </Text>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  onPress={() => setGroupModalVisible(false)}
                  style={[styles.modalSubmitBtn, { width: '100%', justifyContent: 'center' }]}
                >
                  <Text style={styles.modalSubmitBtnText}>Tutup</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 7: DISKUSI TUGAS (Layar 11)                        */}
        {/* ======================================================== */}
        <Modal
          visible={discussionModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setDiscussionModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '90%' }]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Ruang Diskusi Tugas</Text>
                  <Text style={styles.modalSubtitle}>Tanya jawab seputar materi penugasan</Text>
                </View>
                <TouchableOpacity onPress={() => setDiscussionModalVisible(false)} style={styles.modalCloseBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={[styles.modalBody, { maxHeight: 380 }]}>
                {discussionMessages.length === 0 ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 36, paddingHorizontal: 16 }}>
                    <MaterialCommunityIcons name="forum-outline" size={44} color="#CBD5E1" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B', marginTop: 10 }}>Belum Ada Diskusi</Text>
                    <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                      Tuliskan pertanyaan atau tanggapan pertama seputar tugas ini pada kolom di bawah.
                    </Text>
                  </View>
                ) : (
                  discussionMessages.map((msg) => {
                    const isSiswa = msg.role === 'siswa';
                    return (
                      <View
                        key={msg.id}
                        style={[
                          styles.chatMessageRow,
                          isSiswa ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' },
                        ]}
                      >
                        <View
                          style={[
                            styles.chatBubble,
                            isSiswa ? styles.chatBubbleSiswa : styles.chatBubbleGuru,
                          ]}
                        >
                          <Text style={[styles.chatSenderName, isSiswa && { color: '#047857' }]}>
                            {msg.sender}
                          </Text>
                          <Text style={styles.chatMessageText}>{msg.text}</Text>
                          <Text style={styles.chatMessageTime}>{msg.time}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.chatInputBarRow}>
                <TextInput
                  value={discussionInput}
                  onChangeText={setDiscussionInput}
                  placeholder="Tulis pertanyaan seputar tugas ini..."
                  placeholderTextColor="#94A3B8"
                  style={styles.chatInputField}
                />
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    if (!discussionInput.trim()) return;
                    setDiscussionMessages((prev) => [
                      ...prev,
                      {
                        id: `msg-${Date.now()}`,
                        sender: activeChildName ? `Ananda ${activeChildName}` : 'Siswa',
                        role: 'siswa',
                        text: discussionInput.trim(),
                        time: 'Baru saja',
                      },
                    ]);
                    setDiscussionInput('');
                  }}
                  style={styles.chatSendBtn}
                >
                  <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
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

        {feedbackModal && (
          <AppFeedbackModal
            visible={feedbackModal.visible}
            type={feedbackModal.type || 'info'}
            title={feedbackModal.title}
            message={feedbackModal.message}
            onClose={() => setFeedbackModal(null)}
          />
        )}

        {/* IN-APP EMBED VIEWER MODAL (TIDAK KELUAR DARI APLIKASI) */}
        <InAppEmbedModal
          visible={embedModalVisible}
          url={embedTargetUrl}
          title={embedTargetTitle}
          onClose={() => setEmbedModalVisible(false)}
        />

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
                {children.map((c, idx) => {
                  const cId = String(c.id || c.student_id);
                  const isSelected = cId === String(selectedChildId);
                  const cName = c.name || c.nama_lengkap || 'Ananda';
                  const cUnit = c.unit?.name || c.unit_name || c.education_unit?.name || '';
                  const cClass = c.class?.name || c.kelas?.name || c.class_name || '';
                  const cAvatar = getProfileImageUrl(c);
                  const isGirlChild = isGirlStudent(c);

                  return (
                    <TouchableOpacity
                      key={cId || idx}
                      activeOpacity={0.8}
                      onPress={() => {
                        setShowChildSelectorModal(false);
                        setSelectedChildId(cId);
                        useActiveChildStore.getState().setActiveChildId(cId);
                        setActiveChildIndex(idx);
                      }}
                      style={[
                        styles.childModalItem,
                        isSelected && styles.childModalItemActive,
                      ]}
                    >
                      <Image
                        source={cAvatar ? { uri: cAvatar } : isGirlChild ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR}
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
  rootContainer: {
    flex: 1,
    backgroundColor: '#ECFDF5',
  },
  // CLEAN SCREEN STYLES (EXACT 1:1 MATCH WITH SCHEDULE SCREEN)
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
  content: { padding: 16, paddingTop: Platform.OS === 'android' ? 16 : 12 },

  containerBlock: {
    marginBottom: 18,
  },
  studentContainerBlock: {
    marginBottom: 10,
  },

  // ── BANNER TAHUN AJARAN AKTIF & EVALUASI BELAJAR (FULLDAY / BOARDING) ──
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  semesterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8.5,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  semesterToggleText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155',
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

  // ── KPI MASTER CARD (1 CARD WADAH REKAP METRIK) ──
  kpiMasterCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  kpiMasterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1.2,
    borderBottomColor: '#D1FAE5',
  },
  kpiMasterHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  kpiMasterIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiMasterTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  kpiMasterSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#047857',
    marginTop: 1,
  },
  kpiMasterTotalBadge: {
    backgroundColor: '#047857',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  kpiMasterTotalBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  kpiMasterBody: {
    padding: 10,
    backgroundColor: '#FFFFFF',
  },
  kpiContainerBlock: {
    marginHorizontal: 16,
    marginBottom: 12,
  },

  // ── CARD FILTER & PENCARIAN ──
  filterCardContainer: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  filterCardHeaderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1.2,
    borderBottomColor: '#D1FAE5',
  },
  filterCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  filterCardIconSquircle: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#004D32',
  },
  filterCardSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#047857',
    marginTop: 1,
  },
  filterCardResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  filterCardResetText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#E11D48',
  },
  filterCardBody: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
  },
  calendarStripCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#5EEAD4',
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#0D9488',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    paddingBottom: 10,
  },

  // ── TAB SWITCHER (3 TABS) ──
  tabSwitcherContainer: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#F1F5F9',
    padding: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  tabSwitcherPillActiveDaftar: {
    backgroundColor: '#047857',
    shadowColor: '#047857',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabSwitcherPillActiveKalender: {
    backgroundColor: '#0D9488',
    shadowColor: '#0D9488',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabSwitcherPillActiveNilai: {
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

  // ── TAB CONTENT CONTAINERS & SUMMARY BARS ──
  tabContentContainer: {
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 8,
  },
  taskSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  taskSummaryIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskSummaryTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  taskSummarySubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CCFBF1',
    marginTop: 1,
  },
  taskCountBadgePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  taskCountBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#047857',
  },

  // ── SEARCH TOOLBAR & FILTER PILLS ──
  searchToolbarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  filterPillsScrollWrap: {
    marginBottom: 10,
  },
  filterPillsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  filterPillBtnItem: {
    borderRadius: 11,
    overflow: 'hidden',
  },
  filterPillActiveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 11,
    gap: 6,
  },
  filterPillInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  filterPillTextActive: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  filterPillTextInactive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  filterPillBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 5.5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  filterPillBadgeInactive: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5.5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  filterPillBadgeTextActive: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  filterPillBadgeTextInactive: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
  },

  // ── ASSIGNMENT CARDS CONTAINER ──
  assignmentCardsContainer: {
    gap: 10,
    marginTop: 4,
  },

  // ── KALENDER & EVALUASI SUMMARY BARS ──
  calendarSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#5EEAD4',
    shadowColor: '#0D9488',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  calendarSummaryIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarSummaryBadgePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  calendarDayHeaderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 10,
  },

  evalSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    shadowColor: '#2563EB',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  evalSummaryIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  evalSummaryBadgePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },

  // ── BOTTOM NOTICE BANNER ──
  bottomNoticeBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  bottomNoticeText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '600',
    color: '#065F46',
    lineHeight: 15,
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
    gap: 7,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
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
  childChipsTrack: {
    marginBottom: 12,
  },
  childChipsContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  childChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  childChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
    shadowOpacity: 0.2,
    elevation: 3,
  },
  childChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  childChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
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
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    shadowColor: '#064E3B',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeSingle: {
    width: '100%',
    minHeight: 148,
    justifyContent: 'space-between',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    shadowColor: '#064E3B',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeInactive: {
    opacity: 0.88,
  },
  cardDecorCircle: {
    position: 'absolute',
    top: -28,
    right: -28,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    zIndex: 0,
  },
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  avatarBorderWrapHero: {
    width: 64,
    height: 64,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
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
    fontSize: 14.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  studentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
    marginTop: 1,
  },
  childNameHero: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 7,
    alignSelf: 'flex-start',
    marginTop: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
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
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 4,
    marginLeft: 8,
    minWidth: 48,
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
    backgroundColor: 'rgba(4, 47, 30, 0.32)',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 6,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    zIndex: 1,
  },
  studentAttributesGridInactive: {
    backgroundColor: 'rgba(4, 47, 30, 0.32)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
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
    color: '#6EE7B7',
    fontWeight: '700',
  },
  studentAttrValue: {
    fontSize: 11.5,
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
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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

  // Section Header Between
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  sectionIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  sectionIconBadgeModern: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitleBold: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  sectionSubtitleMuted: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  semesterDropdownPillModern: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 5,
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  semesterDropdownTextModern: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },

  // ── Child Switcher Modern (Single Card Mode) ──
  childSwitcherContainer: {
    marginBottom: 10,
  },
  childSwitcherScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  childSwitcherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
  },
  childSwitcherPillActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
    elevation: 2,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  childSwitcherText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  childSwitcherTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  childSwitcherDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    marginLeft: 2,
  },

  // ── Ringkasan Penugasan Header & Semester Bar Dipindah ke Bawah ──
  summaryHeaderContainer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1.2,
    borderBottomColor: '#D1FAE5',
  },
  summaryBodyContainer: {
    padding: 12,
    gap: 10,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summarySubtitleText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 16,
  },
  semesterRowWrapper: {
    marginTop: 2,
  },
  semesterBarContainerModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  semesterBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  semesterIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  semesterBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  semesterBarValue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#064E3B',
    marginTop: 1,
  },
  semesterBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  semesterBarChangeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },

  // ── TailGrids Emerald Containers (Harmonized SIMSIT Design System) ──
  emeraldSummaryContainer: {
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
    marginBottom: 16,
  },
  emeraldDatatableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.09,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    overflow: 'hidden',
    marginBottom: 24,
  },
  emeraldDatatableHeader: {
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1.2,
    borderBottomColor: '#D1FAE5',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emeraldDatatableHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emeraldDatatableIconSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emeraldDatatableTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  emeraldDatatableSubtitle: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '500',
    marginTop: 1,
  },
  emeraldDatatableCountBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexShrink: 0,
    alignSelf: 'center',
  },
  emeraldDatatableCountText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  datatableTabWrapper: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
  },
  datatableSearchWrapper: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  datatableChipsWrapper: {
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  datatableContentWrapper: {
    padding: 12,
    backgroundColor: '#F9FBF9',
  },
  assignmentCardsScrollContainer: {
    maxHeight: 520,
  },
  assignmentCardsScrollContent: {
    paddingBottom: 8,
  },
  loadMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  loadMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginVertical: 10,
    gap: 6,
  },
  loadMoreButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  allLoadedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  allLoadedNoticeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  assignmentListHeaderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  assignmentListHeaderIconSquircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  assignmentListCountPill: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  assignmentListCountPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },

  // ── 4 KPI Cards Modern Selaras TU (Emerald, Amber, Rose, Purple) ──
  kpiContainer: {
    marginBottom: 4,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  kpiCardGradient: {
    padding: 10,
    borderRadius: 15,
  },
  kpiCardEmerald: {
    borderColor: '#A7F3D0',
  },
  kpiCardAmber: {
    borderColor: '#FDE68A',
  },
  kpiCardRose: {
    borderColor: '#FECDD3',
  },
  kpiCardPurple: {
    borderColor: '#E9D5FF',
  },
  kpiCardActiveRing: {
    borderWidth: 2,
    borderColor: '#059669',
  },
  kpiCardActiveRingEmerald: {
    borderWidth: 2,
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  kpiCardActiveRingAmber: {
    borderWidth: 2,
    borderColor: '#D97706',
    shadowColor: '#D97706',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  kpiCardActiveRingRose: {
    borderWidth: 2,
    borderColor: '#E11D48',
    shadowColor: '#E11D48',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  kpiCardActiveRingPurple: {
    borderWidth: 2,
    borderColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  kpiIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  kpiValue: {
    fontSize: 16.5,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginVertical: 2,
  },
  kpiSub: {
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 1,
  },

  // ── Body Tab Bar Switcher Persis TU ──
  bodyTabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  bodyTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  bodyTabButtonActive: {
    backgroundColor: '#059669',
    elevation: 2,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  bodyTabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  bodyTabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // ── Filter Section Persis TU ──
  filterSection: {
    paddingHorizontal: 0,
    paddingTop: 2,
    paddingBottom: 4,
    backgroundColor: 'transparent',
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 0,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  filterChipsScrollView: {
    flexDirection: 'row',
  },
  filterChipsScrollContent: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  filterChipReset: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFE4E6',
    borderWidth: 1,
    borderColor: '#FDA4AF',
  },
  filterChipResetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E11D48',
  },

  // ── Card Header Modern Selaras TU ──
  cardHeaderFlexModern: {
    padding: 14,
    paddingBottom: 6,
  },
  cardBadgesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  cardBadgesLeftGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginRight: 6,
  },
  cardBadgesRowModern: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  subjectPillBadgeModern: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 1,
  },
  subjectPillTextModern: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardTaskTitleModern: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 4,
  },
  cardTaskDescModern: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 4,
  },

  // 2x2 Master KPI Grid (Lega, Bergradasi & Interaktif)
  kpiGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  kpiGridCardTouchable: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.07,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  kpiGridCardTouchableActiveEmerald: {
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  kpiGridCardTouchableActiveAmber: {
    shadowColor: '#D97706',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  kpiGridCardTouchableActiveRose: {
    shadowColor: '#E11D48',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  kpiGridCardTouchableActiveViolet: {
    shadowColor: '#7C3AED',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  kpiGridCardGradient: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderRadius: 18,
    minHeight: 82,
    justifyContent: 'space-between',
  },
  kpiCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiBadgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  kpiCardValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  kpiCardNumber: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  kpiCardUnit: {
    fontSize: 10,
    fontWeight: '700',
  },
  kpiCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  kpiCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    letterSpacing: 0.1,
  },
  kpiActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Filter Tabs & Search — Modern Vibrant
  filterSectionBlock: {
    marginBottom: 16,
    gap: 10,
  },
  filterPillsScroll: {
    gap: 8,
    paddingVertical: 3,
  },
  filterCapsuleBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1.5,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  filterCapsuleBtnInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  filterCapsuleTextModern: {
    fontSize: 11.5,
    marginRight: 6,
  },
  filterCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  searchAndFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBarContainerModern: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchBarContainerFocused: {
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },
  searchInputField: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  filterActionButtonModern: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    gap: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filterActionButtonActiveModern: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.15,
  },
  filterActionButtonTextModern: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  filterActionButtonTextActiveModern: {
    color: '#059669',
    fontWeight: '800',
  },
  filterDotBadgeActiveModern: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#059669',
    marginLeft: 2,
  },
  sortPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    gap: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sortPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
  },

  // Loading & Empty States — Premium
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    paddingVertical: 38,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
    marginTop: 12,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '500',
  },

  // Premium Assignment Card
  assignmentCardModern: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 0,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    overflow: 'hidden',
  },
  assignmentCardGradient: {
    padding: 0,
    borderRadius: 19,
  },
  cardHeaderFlex: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    paddingBottom: 8,
  },
  subjectIconBoxLarge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardInfoCol: {
    flex: 1,
  },
  cardBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 6,
  },
  subjectPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 1,
  },
  subjectPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardTaskTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 21,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  cardTaskDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 2,
  },

  // Metadata Box — Structured & Spacious Layout
  metadataContainerBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 10,
    gap: 6,
  },
  metaRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  metaItemFlex: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaColumnItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  metaLabelText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  metaValueText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  metaVerticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 8,
  },

  // Graded Card Frame — Premium
  gradedCardFrameModern: {
    backgroundColor: '#F0FDF4',
    borderTopWidth: 1,
    borderColor: '#BBF7D0',
    padding: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  gradedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scorePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  scorePillLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#A7F3D0',
  },
  scorePillValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  gradedCheckText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  teacherNoteBoxModern: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
  },
  teacherNoteTextModern: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 17,
    flex: 1,
  },

  // Pending Action Container — Full Width Banner & Ergonomic Buttons
  pendingActionContainer: {
    backgroundColor: '#FFFBEB',
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  pendingAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingAlertTextFull: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '700',
    flex: 1,
  },
  pendingButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kumpulkanBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 4,
    shadowColor: '#059669',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  kumpulkanBtnTextModern: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Modal — Premium Design
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#059669',
    marginTop: 3,
    fontWeight: '600',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
  },
  modalBody: {
    padding: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  modalTextInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    padding: 14,
    fontSize: 13,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 120,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1.5,
    borderTopColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
  },
  modalCancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  modalSubmitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardAttachmentLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    gap: 8,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardAttachmentLinkText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  teacherQuestionCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  teacherQuestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  teacherQuestionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: -0.2,
  },
  teacherQuestionContent: {
    fontSize: 12.5,
    color: '#1E293B',
    lineHeight: 19,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  teacherFileAttachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    marginBottom: 14,
    gap: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  teacherFileAttachmentText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  pickerBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  pickerActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#F0FDF4',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#34D399',
    paddingVertical: 13,
    borderRadius: 16,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pickerActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  selectedAttachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 6,
    gap: 8,
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  selectedAttachmentName: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  removeAttachmentBtn: {
    padding: 2,
  },

  /* ── 3-Tab View Mode Switcher (Batas Waktu | Jeda | Jadwal) ── */
  viewModeTabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  viewModeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  viewModeTabBtnActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  viewModeTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  viewModeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterDotBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
  },

  /* ── Screen 12: Calendar Mode Styles ── */
  calendarMonthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarMonthTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarMonthPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  calendarMonthPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  weekStripRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  weekDayCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    position: 'relative',
  },
  weekDayCardSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  weekDayName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  weekDayNameSelected: {
    color: '#DEF7EC',
    fontWeight: '700',
  },
  weekDayNum: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  weekDayNumSelected: {
    color: '#FFFFFF',
  },
  weekDayActiveDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  calendarTaskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  calendarTaskTimeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 6,
  },
  calendarTaskTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  calendarTaskBody: {
    padding: 14,
  },
  calendarSubjectPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  calendarSubjectPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  calendarTaskTitleText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 19,
    marginBottom: 12,
  },
  calendarTaskFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  calendarTaskDetailBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  calendarTaskDetailBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  calendarTaskSubmitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  calendarTaskSubmitBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── Action Buttons Cluster & Links ── */
  gradedDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    gap: 2,
  },
  gradedDetailBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  actionButtonsCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    gap: 4,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  detailOutlineBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  groupOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
    gap: 4,
    shadowColor: '#0284C7',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  groupOutlineBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
  },

  /* ── Modal 1: Filter Sheet ── */
  modalHeaderModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  modalHeaderIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  filterSectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  filterPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  modalFilterPillActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  modalFilterPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  modalFilterPillTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  modalFooterModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 10,
  },
  modalResetBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  modalResetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  modalResetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  modalApplyBtnContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  modalApplyBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  modalApplyBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#059669',
  },
  modalApplyBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── Modal 2: Detail Tugas ── */
  lateWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  lateWarningTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 2,
  },
  lateWarningDesc: {
    fontSize: 11,
    color: '#B91C1C',
    lineHeight: 15,
  },
  gradedHeroBanner: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    marginBottom: 12,
  },
  gradedHeroGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  gradedScoreCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradedScoreVal: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  gradedScoreMax: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A7F3D0',
    marginTop: -4,
  },
  gradeLetterBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 4,
  },
  gradeLetterText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#92400E',
  },
  gradedHeroTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gradedHeroSub: {
    fontSize: 11,
    color: '#DEF7EC',
    marginTop: 2,
  },
  feedbackCardBox: {
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#D1FAE5',
  },
  feedbackCardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  feedbackCardContent: {
    fontSize: 11.5,
    color: '#1E293B',
    lineHeight: 17,
  },
  detailFullTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
    lineHeight: 22,
    marginBottom: 10,
  },
  detailMetaCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 8,
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailMetaLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  detailMetaVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'right',
  },
  detailMetaDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  detailDescBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  detailDescText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 19,
  },
  rubricContainer: {
    marginTop: 14,
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    overflow: 'hidden',
  },
  rubricHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  rubricTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  rubricBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  rubricItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rubricItemLabel: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  rubricWeightBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  rubricWeightText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  discussionTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    gap: 5,
  },
  discussionTriggerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  groupTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
    gap: 5,
  },
  groupTriggerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
  },

  /* ── Modal 3: Dropzone & Integrity ── */
  dropzoneBox: {
    alignItems: 'center',
    padding: 18,
    backgroundColor: '#F0FDF4',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#6EE7B7',
    borderRadius: 18,
    marginTop: 4,
  },
  dropzoneIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dropzoneTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  dropzoneSub: {
    fontSize: 11,
    color: '#059669',
    marginTop: 2,
    marginBottom: 12,
  },
  integrityCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  integrityCheckboxText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    flex: 1,
    fontWeight: '600',
  },

  /* ── Modals 4 & 5: Dialog Confirmation & Success ── */
  dialogCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  dialogIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  dialogSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  dialogSummaryBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 14,
  },
  dialogTaskName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  dialogFileStatus: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  dialogNoticeBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 6,
  },
  dialogNoticeText: {
    fontSize: 10.5,
    color: '#065F46',
    flex: 1,
    fontWeight: '600',
  },
  dialogButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 18,
  },
  dialogCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  dialogCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  dialogConfirmBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#059669',
  },
  dialogConfirmBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── Modal 6: Group Details ── */
  groupBadgeHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    padding: 14,
  },
  groupHeaderName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0369A1',
  },
  groupHeaderSub: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '600',
    marginTop: 2,
  },
  groupMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 8,
  },
  groupMemberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  groupMemberAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284C7',
  },
  groupMemberName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  groupMemberNis: {
    fontSize: 10.5,
    color: '#64748B',
  },
  groupMemberRoleBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  groupMemberRoleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  groupInstructionsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  groupInstructionsText: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 17,
  },

  /* ── Modal 7: Discussion Chat ── */
  chatMessageRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  chatBubble: {
    maxWidth: '82%',
    borderRadius: 16,
    padding: 12,
  },
  chatBubbleSiswa: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderBottomRightRadius: 2,
  },
  chatBubbleGuru: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 2,
  },
  chatSenderName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 3,
  },
  chatMessageText: {
    fontSize: 12.5,
    color: '#0F172A',
    lineHeight: 18,
  },
  chatMessageTime: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  chatInputBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
    gap: 8,
  },
  chatInputField: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#0F172A',
  },
  chatSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Sticky header ala halaman Jadwal (self-contained) ── */
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
});
