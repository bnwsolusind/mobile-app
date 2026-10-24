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
import {
  isParentRole,
  isTeacherRole,
  isTuRole,
  isPrincipalRole,
  isSuperAdminRole,
  isTahfizhTeacherRole,
  isMusyrifRole,
} from '../utils/roles';
import TeacherTahfizhWorkspace from '../components/teacher/TeacherTahfizhWorkspace';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { resolveSelectedChildId } from '../utils/selectedChild';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { EmptyStateCard } from '../components/EmptyStateCard';
import {
  getDynamicAcademicYear,
  getDynamicAcademicSemester,
  getDynamicAcademicInfo,
} from '../utils/academicYear';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;
const studentCardWidth = SCREEN_WIDTH - (STUDENT_PEEK_WIDTH * 2) - STUDENT_CARD_GAP;
const studentSnapInterval = studentCardWidth + STUDENT_CARD_GAP;
const studentTrackPad = STUDENT_PEEK_WIDTH;
const centerLoopOffset = studentSnapInterval;

const formatDate = (val?: string) => {
  if (!val) return '-';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const month = months[d.getMonth()] || '';
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return String(val);
  }
};

const formatShortDate = (val?: string) => {
  if (!val) return '-';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const month = months[d.getMonth()] || '';
    return `${day} ${month}`;
  } catch {
    return String(val);
  }
};

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_LABELS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// Helper untuk mengidentifikasi jenis setoran
const getLogJenis = (l: any): 'ziyadah' | 'murajaah' | 'tilawah' | 'unknown' => {
  if (!l) return 'unknown';

  const jenisRaw = (l.category || l.type || l.jenis_setoran || l.jenis || l.kategori || '').toLowerCase();
  if (jenisRaw === 'murajaah' || jenisRaw === "muroja'ah" || jenisRaw === 'pengulangan') return 'murajaah';
  if (jenisRaw === 'tilawah' || jenisRaw === 'tilawah_mandiri') return 'tilawah';
  if (jenisRaw === 'ziyadah' || jenisRaw === 'hafalan_baru' || jenisRaw === 'hafalan baru') return 'ziyadah';

  const isSubmittedByParent = Boolean(
    l.metadata?.submitted_by_parent ||
    l.metadata?.type === 'murajaah' ||
    l.murajaah_status === 'pending_home' ||
    l.murajaah_status === 'submitted_by_parent'
  );
  const hasMurajaahText = Boolean(l.murajaah_text || Number(l.murajaah_lembar) > 0);
  const hasZiyadah = Boolean(l.hafalan_surah_name && (l.hafalan_ayah_start !== null || l.ayat_start !== null));

  if (isSubmittedByParent || (hasMurajaahText && !hasZiyadah)) return 'murajaah';

  const surah = l.hafalan_surah_name || l.nama_surah || l.surah;
  const isSpecialSurahName = !surah || surah === 'Tilawah' || surah === 'Murajaah';
  const hasAyatRange = (
    (l.hafalan_ayah_start !== null && l.hafalan_ayah_start !== undefined) ||
    (l.ayat_start !== null && l.ayat_start !== undefined)
  );

  if ((l.tilawah_text || Number(l.tilawah_baris) > 0) && !hasAyatRange) return 'tilawah';
  if (hasAyatRange && !isSpecialSurahName) return 'ziyadah';

  return 'unknown';
};

// TEMA WARNA BAKU SESUAI STANDAR SEMANTIK:
// - HIJAU ZAMRUD: Untuk setoran Lancar / Mumtaz / Mutqin (default hafalan baru)
// - BIRU: Untuk jenis setoran Tilawah (bacaan Qur'an tartil)
// - MERAH: HANYA jika ada Pengulangan / Perlu Diulang / Remedial (Dilarang untuk yang lancar)
const THEME_SURAH_LANCAR = {
  headerBg: '#ECFDF5', // Emerald Muda
  cardBorder: '#A7F3D0',
  accent: '#059669',
  badgeBg: '#059669',
  badgeText: '#FFFFFF',
  titleColor: '#065F46',
  subTextColor: '#047857',
  pillBg: '#D1FAE5',
  pillText: '#065F46',
  pillBorder: '#6EE7B7',
  iconColor: '#059669',
};

const THEME_SURAH_TILAWAH = {
  headerBg: '#EFF6FF', // Sky/Blue Muda
  cardBorder: '#BFDBFE',
  accent: '#2563EB',
  badgeBg: '#2563EB',
  badgeText: '#FFFFFF',
  titleColor: '#1E40AF',
  subTextColor: '#1D4ED8',
  pillBg: '#DBEAFE',
  pillText: '#1E40AF',
  pillBorder: '#93C5FD',
  iconColor: '#2563EB',
};

const THEME_SURAH_PENGULANGAN = {
  headerBg: '#FFF1F2', // Rose/Red Peringatan
  cardBorder: '#FECDD3',
  accent: '#E11D48',
  badgeBg: '#E11D48',
  badgeText: '#FFFFFF',
  titleColor: '#881337',
  subTextColor: '#BE123C',
  pillBg: '#FFE4E6',
  pillText: '#9F1239',
  pillBorder: '#FDA4AF',
  iconColor: '#E11D48',
};

// Helper penentuan tema kartu kelompok surat:
// Merah untuk Murajaah / Pengulangan, Biru untuk Tilawah, Hijau untuk Ziyadah Lancar
const getSurahTheme = (group: any, currentTab?: string) => {
  if (!group) return THEME_SURAH_LANCAR;
  const logs = Array.isArray(group.logs) ? group.logs : [];

  // 1. Prioritas Murajaah: bertema MERAH (Rose)
  const isMurajaahGroup =
    currentTab === 'murajaah' ||
    group.surahKey.includes('murajaah') ||
    (group.surahName && group.surahName.toLowerCase().includes('murajaah')) ||
    (logs.length > 0 && logs.every((l: any) => getLogJenis(l) === 'murajaah'));

  const hasPengulangan = logs.some((l: any) => isSetoranNeedsMurajaah(l));

  if (isMurajaahGroup || hasPengulangan) return THEME_SURAH_PENGULANGAN;

  // 2. Tilawah: bertema BIRU
  const isTilawah =
    currentTab === 'tilawah' ||
    group.surahKey === 'tilawah' ||
    (group.surahName && group.surahName.toLowerCase().includes('tilawah')) ||
    (logs.length > 0 && logs.every((l: any) => getLogJenis(l) === 'tilawah'));
  if (isTilawah) return THEME_SURAH_TILAWAH;

  // 3. Ziyadah Lancar: bertema HIJAU
  return THEME_SURAH_LANCAR;
};

// Helper untuk mengecek apakah setoran berstatus lancar / mutqin / terverifikasi
const isExplicitlyLancar = (log: any): boolean => {
  if (!log) return false;
  const rawStatus = (log.status || '').toLowerCase();
  const rawNilai = (log.nilai || log.predikat || '').toLowerCase();
  return (
    rawNilai.includes('lancar') ||
    rawNilai.includes('mumtaz') ||
    rawNilai.includes('mutqin') ||
    rawNilai.includes('jayyid') ||
    rawNilai.includes('baik') ||
    rawNilai.includes('terverifikasi') ||
    rawStatus === 'approved' ||
    rawStatus === 'verified' ||
    rawStatus === 'passed'
  );
};

// Helper untuk mengecek apakah setoran membutuhkan pengulangan (murajaah ulang)
const isSetoranNeedsMurajaah = (log: any): boolean => {
  if (!log) return false;
  const rawStatus = (log.status || '').toLowerCase();
  const rawNilai = (log.nilai || log.predikat || '').toLowerCase();
  const rawCatatan = (log.notes_teacher || log.catatan || '').toLowerCase();

  // Jika eksplisit memerlukan pengulangan / perlu ulang / kurang / murojaah
  const hasUlangKeyword =
    rawNilai.includes('ulang') ||
    rawNilai.includes('murojaah') ||
    rawNilai.includes('murajaah') ||
    rawNilai.includes('kurang') ||
    rawNilai.includes('remedial') ||
    rawStatus.includes('ulang') ||
    rawStatus.includes('murojaah') ||
    rawCatatan.includes('perlu diulang') ||
    rawCatatan.includes('harus diulang') ||
    rawCatatan.includes('ulangi lagi') ||
    rawCatatan.includes('perlu murajaah') ||
    rawCatatan.includes('kurang lancar');

  if (hasUlangKeyword) return true;

  // Jika telah lancar, mumtaz, mutqin, terverifikasi -> tidak perlu tombol murajaah
  if (isExplicitlyLancar(log)) return false;

  return false;
};
const JUZ_STARTS: [number, number][] = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148],
  [5, 83], [6, 111], [7, 88], [8, 41], [9, 93], [11, 6],
  [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1],
  [25, 21], [27, 56], [29, 46], [33, 31], [36, 28], [39, 32],
  [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

// Helper canonical untuk menentukan nomor Juz secara presisi dari nomor Surah dan Ayat
const getQuranJuz = (surahNumber: any, ayahNumber: any = 1): number => {
  const s = Number(surahNumber);
  const a = Number(ayahNumber || 1);
  if (!s || s < 1) return 1;
  if (s >= 78) return 30;

  for (let j = JUZ_STARTS.length - 1; j >= 0; j--) {
    const [startSurah, startAyah] = JUZ_STARTS[j];
    if (s > startSurah || (s === startSurah && a >= startAyah)) {
      return j + 1;
    }
  }
  return 1;
};

// Helper untuk mengekstrak surah dan rentang ayat yang spesifik dari riwayat/catatan log
const parseLogSurahAndVerses = (log: any, allSurahs: any[] = []) => {
  if (!log) {
    return {
      surahNum: null,
      surahName: null,
      aStart: 1,
      aEnd: 7,
      matchedSurah: null,
    };
  }

  let surahNum: number | null = log.hafalan_surah_number || log.metadata?.surah_number || null;
  let surahName: string | null = log.hafalan_surah_name || log.metadata?.surah_name || null;
  let aStart: number | null =
    log.hafalan_ayah_start !== undefined && log.hafalan_ayah_start !== null ? Number(log.hafalan_ayah_start) :
    log.ayat_start !== undefined && log.ayat_start !== null ? Number(log.ayat_start) :
    log.ayat_mulai !== undefined && log.ayat_mulai !== null ? Number(log.ayat_mulai) :
    log.metadata?.ayat_start !== undefined && log.metadata?.ayat_start !== null ? Number(log.metadata.ayat_start) :
    null;

  let aEnd: number | null =
    log.hafalan_ayah_end !== undefined && log.hafalan_ayah_end !== null ? Number(log.hafalan_ayah_end) :
    log.ayat_end !== undefined && log.ayat_end !== null ? Number(log.ayat_end) :
    log.ayat_selesai !== undefined && log.ayat_selesai !== null ? Number(log.ayat_selesai) :
    log.metadata?.ayat_end !== undefined && log.metadata?.ayat_end !== null ? Number(log.metadata.ayat_end) :
    null;

  const rawTexts: string[] = [
    log.murajaah_text,
    log.tilawah_text,
    log.surah,
    log.nama_surah,
    log.catatan,
  ].filter(Boolean);

  for (const raw of rawTexts) {
    if (typeof raw !== 'string') continue;
    // Format 1: "Surah Al-Mulk (Ayat 1 - 15)" or "Al-Baqarah (10-25)" or "An-Naba: 1 - 20" or "Al-Mulk 1-15"
    const matchVerses = raw.match(
      /(?:surah\s+)?([a-zA-Z\s'\-]+?)\s*(?:\(ayat\s*|\s*ayat\s*|\s*:\s*|\(\s*)(\d+)\s*(?:[-–—]|s\/d|\s*to\s*)\s*(\d+)/i
    );
    if (matchVerses) {
      const extractedName = matchVerses[1].trim();
      if (!['tilawah mandiri', 'murajaah mandiri', 'setoran tahfizh'].includes(extractedName.toLowerCase())) {
        if (!surahName) surahName = extractedName;
      }
      if (aStart === null || isNaN(aStart)) aStart = parseInt(matchVerses[2], 10);
      if (aEnd === null || isNaN(aEnd)) aEnd = parseInt(matchVerses[3], 10);
      break;
    }
  }

  // If still no surahName, look for plain surah name
  if (!surahName) {
    for (const raw of rawTexts) {
      if (typeof raw !== 'string') continue;
      const clean = raw.replace(/^(surah|qs\.?)\s+/i, '').trim();
      if (clean && !['tilawah mandiri', 'murajaah mandiri', 'setoran tahfizh'].includes(clean.toLowerCase())) {
        const noParens = clean.replace(/\(.*?\)/g, '').trim();
        if (noParens.length >= 2) {
          surahName = noParens;
          break;
        }
      }
    }
  }

  // Match against allSurahs if provided
  let matchedSurah: any = null;
  if (allSurahs && allSurahs.length > 0) {
    if (surahNum) {
      matchedSurah = allSurahs.find((s) => Number(s.nomor) === Number(surahNum));
    }
    if (!matchedSurah && surahName) {
      const cleanSearch = surahName.toLowerCase().replace(/^(surah|qs\.?)\s+/i, '').replace(/[^a-z0-9]/g, '');
      matchedSurah = allSurahs.find((s) => {
        const sClean = (s.nama_latin || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return sClean === cleanSearch || (cleanSearch.length >= 3 && (sClean.includes(cleanSearch) || cleanSearch.includes(sClean)));
      });
    }
  }

  if (matchedSurah) {
    surahNum = Number(matchedSurah.nomor);
    surahName = matchedSurah.nama_latin;
  }

  const finalStart = (aStart !== null && !isNaN(aStart) && aStart > 0) ? aStart : 1;
  const fallbackEnd = matchedSurah?.jumlah_ayat
    ? Math.min(finalStart + 9, matchedSurah.jumlah_ayat)
    : finalStart + 9;
  const finalEnd = (aEnd !== null && !isNaN(aEnd) && aEnd >= finalStart)
    ? aEnd
    : fallbackEnd;

  return {
    surahNum: surahNum ? Number(surahNum) : null,
    surahName: surahName || (matchedSurah?.nama_latin ?? null),
    aStart: finalStart,
    aEnd: finalEnd,
    matchedSurah,
  };
};

export default function TahfizhScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const modalBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 20) + 16;
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

  const [children, setChildren] = useState<any[]>(() => {
    const storeChildren = useActiveChildStore.getState().children;
    return Array.isArray(storeChildren) && storeChildren.length > 0 ? storeChildren : [];
  });
  const storeChildren = useActiveChildStore((s) => s.children);
  useEffect(() => {
    if (Array.isArray(storeChildren) && storeChildren.length > 0 && children.length === 0) {
      setChildren(storeChildren);
    }
  }, [storeChildren, children.length]);
  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(
    route?.params?.child_id || route?.params?.student_id || globalActiveChildId
  );
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const studentScrollRef = useRef<ScrollView>(null);

  // ── Sticky header bersama (StudentStickyHeader, sama dengan Tugas/Jadwal/Materi/Nilai) ──
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const { scrollY, handleMainScroll } = useStickyScroll();
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  // Animasi fade + slide-up card siswa di body (identik dengan ScheduleScreen)
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

  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);
  const handledParamIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (!incomingId) return;
    const incomingStr = String(incomingId);
    if (handledParamIdRef.current === incomingStr) return;
    handledParamIdRef.current = incomingStr;

    setSelectedChildId(incomingStr);
    useActiveChildStore.getState().setActiveChildId(incomingStr);
    if (children.length > 0) {
      const idx = children.findIndex((c) => String(c.id || c.student_id) === incomingStr);
      if (idx >= 0) {
        setActiveChildIndex(idx);
      }
    }
  }, [route?.params?.child_id, route?.params?.student_id, children]);

  // Sinkronisasi selectedChildId & activeChildIndex saat globalActiveChildId berubah
  useEffect(() => {
    if (globalActiveChildId && children.length > 0) {
      const targetStr = String(globalActiveChildId);
      setSelectedChildId((prev) => (prev !== targetStr ? targetStr : prev));
      const idx = children.findIndex((c) => String(c.id || c.student_id) === targetStr);
      if (idx >= 0 && idx !== activeChildIndex) {
        setActiveChildIndex(idx);
      }
    }
  }, [globalActiveChildId, children, activeChildIndex]);

  const syncLoopChildId = useCallback((newIdx: number) => {
    if (!children || children.length === 0) return;
    const n = children.length;
    const norm = ((newIdx % n) + n) % n;
    const targetChild = children[norm];
    if (targetChild) {
      const targetId = String(targetChild.id || targetChild.student_id);
      setSelectedChildId(targetId);
      useActiveChildStore.getState().setActiveChildId(targetId);
    }
  }, [children]);

  const recenterLoop = useCallback(() => {
    if (studentLoopCount > 1) {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
    }
  }, [studentLoopCount]);

  const goToLoopChild = useCallback((targetRealIdx: number) => {
    if (studentLoopCount <= 1) {
      setActiveChildIndex(0);
      syncLoopChildId(0);
      return;
    }
    const n = studentLoopCount;
    const cur = safeCenter;
    const target = ((targetRealIdx % n) + n) % n;
    if (target === cur) {
      recenterLoop();
      return;
    }
    setActiveChildIndex(target);
    syncLoopChildId(target);
    const forwardStep = (target - cur + n) % n;
    const backwardStep = (cur - target + n) % n;
    if (forwardStep <= backwardStep) {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset * 2, animated: true });
    } else {
      studentScrollRef.current?.scrollTo({ x: 0, animated: true });
    }
    setTimeout(() => {
      recenterLoop();
    }, 280);
  }, [studentLoopCount, safeCenter, syncLoopChildId, recenterLoop]);

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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [kpiData, setKpiData] = useState<any>(null);
  const [targetData, setTargetData] = useState<any>(null);
  const [tahfizhAchievement, setTahfizhAchievement] = useState<any>(null);
  const [pendingHomeMurajaah, setPendingHomeMurajaah] = useState<any>(null);
  const [isMurajaahLockedByTeacher, setIsMurajaahLockedByTeacher] = useState(false);
  const [currentTeacherNote, setCurrentTeacherNote] = useState<string>('');
  const [currentTeacherName, setCurrentTeacherName] = useState<string>('');

  // Filter & Search states
  const routeTab = route?.params?.tab;
  const [mainTab, setMainTab] = useState<'history' | 'target'>(
    routeTab === 'target' ? 'target' : 'history'
  );

  useEffect(() => {
    if (route?.params?.tab === 'target') {
      setMainTab('target');
    } else if (route?.params?.tab === 'history' || route?.params?.tab === 'setoran') {
      setMainTab('history');
    }
  }, [route?.params?.tab]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'ziyadah' | 'murajaah' | 'tilawah'>('all');
  const [selectedLogDetail, setSelectedLogDetail] = useState<any>(null);
  const [detailAyahs, setDetailAyahs] = useState<any[]>([]);
  const [isDetailAyahsLoading, setIsDetailAyahsLoading] = useState<boolean>(false);
  const [detailAyahsError, setDetailAyahsError] = useState<string>('');
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    onConfirm?: () => void;
  } | null>(null);

  // Tampilan Pengelompokan: Grup per Surat vs Urut Waktu
  const [isGroupedBySurah, setIsGroupedBySurah] = useState<boolean>(true);
  const [collapsedSurahs, setCollapsedSurahs] = useState<Record<string, boolean>>({});

  const toggleSurahCollapse = (surahKey: string) => {
    setCollapsedSurahs((prev) => ({
      ...prev,
      [surahKey]: !prev[surahKey],
    }));
  };

  // Filter Tingkat Kelas Ananda (Perjalanan dari Kelas 1 s/d Kelas Berjalan Saat Ini)
  const [gradeJourney, setGradeJourney] = useState<any[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<number | 'all' | null>(null);
  const [currentGradeNum, setCurrentGradeNum] = useState<number | null>(null);
  const currentGradeLabel = currentGradeNum !== null ? `Kelas ${currentGradeNum}` : 'Kelas belum tersedia';

  // Filter Periode Waktu di Kelas Aktif (Harian, Mingguan, Bulanan, Semester, Rentang Tanggal)
  const [timePeriodFilter, setTimePeriodFilter] = useState<'all' | 'today' | 'week' | 'month' | 'semester' | 'year' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string | null>(null);
  const [customEndDate, setCustomEndDate] = useState<string | null>(null);
  const [isDateRangeModalVisible, setIsDateRangeModalVisible] = useState(false);
  const [tempRangeStart, setTempRangeStart] = useState<string | null>(null);
  const [tempRangeEnd, setTempRangeEnd] = useState<string | null>(null);
  const [calendarViewingDate, setCalendarViewingDate] = useState(() => new Date());
  const [activeTabScrollIndex, setActiveTabScrollIndex] = useState(0);
  const [activeFilterScrollIndex, setActiveFilterScrollIndex] = useState(0);
  const tabCardScrollRef = useRef<ScrollView>(null);
  const filterScrollRef = useRef<ScrollView>(null);
  const tabCardOffsetsRef = useRef<number[]>([]);
  const filterOffsetsRef = useRef<number[]>([]);

  // States for Tab 2: Target Kurikulum (Juz filter, Sort order, & Detail Modal)
  const [curriculumJuzFilter, setCurriculumJuzFilter] = useState<string>('all');
  const [curriculumSortOrder, setCurriculumSortOrder] = useState<'mushaf' | 'reverse'>('mushaf');
  const [selectedCurriculumSurah, setSelectedCurriculumSurah] = useState<any | null>(null);

  // States for Parent Murajaah Input & Quran Mushaf Modal
  const [isInputModalVisible, setIsInputModalVisible] = useState(false);
  const [quranSurahs, setQuranSurahs] = useState<any[]>([]);
  const [isSurahListLoading, setIsSurahListLoading] = useState(false);
  const [selectedSurah, setSelectedSurah] = useState<any>(null);
  const [surahAyatList, setSurahAyatList] = useState<any[]>([]);
  const [isAyatLoading, setIsAyatLoading] = useState(false);
  const [showMushafViewer, setShowMushafViewer] = useState(false);
  const [isSelectingDifferentSurah, setIsSelectingDifferentSurah] = useState(false);
  const [surahSearchText, setSurahSearchText] = useState('');

  // Form Fields for Murajaah
  const [inputDate, setInputDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [inputTime, setInputTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [inputAyatStart, setInputAyatStart] = useState('1');
  const [inputAyatEnd, setInputAyatEnd] = useState('10');
  const [inputLembar, setInputLembar] = useState('1.0');
  const [inputNotes, setInputNotes] = useState('');
  const [isSubmittingMurajaah, setIsSubmittingMurajaah] = useState(false);

  // Load Quran Surahs for picker with offline cache
  const loadQuranSurahs = useCallback(async () => {
    if (quranSurahs.length > 0) return;
    const cacheKey = 'quran_surahs_list';
    const cached = await offlineCache.get<any[]>(cacheKey);
    if (cached && cached.length > 0) {
      setQuranSurahs(cached);
    }
    try {
      setIsSurahListLoading(true);
      const res = await mobileApiService.getQuranSurahs();
      const list = unwrapApiData<any[]>(res) || [];
      if (Array.isArray(list) && list.length > 0) {
        setQuranSurahs(list);
        void offlineCache.set(cacheKey, list);
      }
    } catch {
      // Fallback
    } finally {
      setIsSurahListLoading(false);
    }
  }, [quranSurahs.length]);

  // Muat daftar surah secara otomatis saat layar aktif
  useEffect(() => {
    void loadQuranSurahs();
  }, [loadQuranSurahs]);

  // Load Quran Surah Verses (Ayat) when surah changes
  const loadSurahVerses = useCallback(async (surahNumber: number) => {
    try {
      setIsAyatLoading(true);
      const res = await mobileApiService.getQuranSurahDetail(surahNumber);
      const ayat = res?.ayat || res?.data?.ayat || [];
      setSurahAyatList(Array.isArray(ayat) ? ayat : []);
    } catch {
      setSurahAyatList([]);
    } finally {
      setIsAyatLoading(false);
    }
  }, []);

  // Filter ayat dari database: HANYA MENAMPILKAN AYAT YANG DIULANG SAJA
  const repeatedVerses = useMemo(() => {
    if (!surahAyatList || surahAyatList.length === 0) return [];
    const start = parseInt(inputAyatStart, 10);
    const end = parseInt(inputAyatEnd, 10);
    const s = !isNaN(start) && start > 0 ? start : 1;
    const e = !isNaN(end) && end >= s ? end : 999;
    return surahAyatList.filter((ay: any) => {
      const no = Number(ay.nomor_ayat || ay.nomor || ay.ayat);
      return no >= s && no <= e;
    });
  }, [surahAyatList, inputAyatStart, inputAyatEnd]);

  // Ambil rincian ayat dinamis dari database/API Al-Qur'an untuk Modal Detail Setoran (hanya jika butuh pengulangan murajaah)
  useEffect(() => {
    if (!selectedLogDetail || !isSetoranNeedsMurajaah(selectedLogDetail)) {
      setDetailAyahs([]);
      setIsDetailAyahsLoading(false);
      setDetailAyahsError('');
      return;
    }

    let isMounted = true;
    const fetchVersesForDetail = async () => {
      try {
        setIsDetailAyahsLoading(true);
        setDetailAyahsError('');

        // Pastikan daftar surah Al-Qur'an tersedia secara dinamis
        let availableSurahs = quranSurahs;
        if (!availableSurahs || availableSurahs.length === 0) {
          try {
            const surahsRes = await mobileApiService.getQuranSurahs();
            const unwrapped = unwrapApiData<any[]>(surahsRes) || [];
            if (Array.isArray(unwrapped) && unwrapped.length > 0) {
              availableSurahs = unwrapped;
              if (isMounted) {
                setQuranSurahs(unwrapped);
              }
            }
          } catch {
            // fallback gracefully
          }
        }

        const parsed = parseLogSurahAndVerses(selectedLogDetail, availableSurahs);
        let targetSurahNum = parsed.surahNum || selectedLogDetail.hafalan_surah_number || null;

        // Jika nomor surah belum ada, cari berdasarkan nama surah dari availableSurahs
        if (!targetSurahNum) {
          const rawName = (
            selectedLogDetail.hafalan_surah_name ||
            selectedLogDetail.surah ||
            selectedLogDetail.nama_surah ||
            parsed.surahName ||
            ''
          )
            .toLowerCase()
            .replace(/^(surah|qs\.?)\s+/i, '')
            .replace(/[^a-z0-9]/g, '');

          if (rawName && availableSurahs && availableSurahs.length > 0) {
            const matched = availableSurahs.find((s: any) => {
              const sLatin = (s.nama_latin || s.nama || '').toLowerCase().replace(/^(surah|qs\.?)\s+/i, '').replace(/[^a-z0-9]/g, '');
              return sLatin === rawName || (rawName.length >= 3 && (sLatin.includes(rawName) || rawName.includes(sLatin)));
            });
            if (matched) {
              targetSurahNum = Number(matched.nomor);
            }
          }
        }

        if (!targetSurahNum) {
          if (isMounted) {
            setDetailAyahs([]);
            setIsDetailAyahsLoading(false);
          }
          return;
        }

        const res = await mobileApiService.getQuranSurahDetail(targetSurahNum);
        const rawList = res?.ayat || res?.data?.ayat || [];
        const list = Array.isArray(rawList) ? rawList : [];

        const start = Number(
          selectedLogDetail.hafalan_ayah_start ||
          parsed.aStart ||
          selectedLogDetail.ayat_start ||
          selectedLogDetail.ayat_mulai ||
          1
        );
        const end = Number(
          selectedLogDetail.hafalan_ayah_end ||
          parsed.aEnd ||
          selectedLogDetail.ayat_end ||
          selectedLogDetail.ayat_selesai ||
          (start > 0 ? start : 1)
        );

        const inRange = list.filter((ay: any) => {
          const no = Number(ay.nomorAyat || ay.nomor_ayat || ay.nomor || ay.ayat);
          return no >= start && no <= end;
        });

        if (isMounted) {
          setDetailAyahs(inRange.length > 0 ? inRange : list.slice(0, 5));
        }
      } catch {
        if (isMounted) {
          setDetailAyahsError("Teks bacaan ayat Al-Qur'an belum berhasil dimuat.");
        }
      } finally {
        if (isMounted) {
          setIsDetailAyahsLoading(false);
        }
      }
    };

    void fetchVersesForDetail();

    return () => {
      isMounted = false;
    };
  }, [selectedLogDetail, quranSurahs]);

  const openInputMurajaahModal = (prefillLog?: any, isLocked: boolean = true) => {
    setIsMurajaahLockedByTeacher(true);
    const now = new Date();
    setInputDate(prefillLog?.record_date || prefillLog?.date || now.toISOString().split('T')[0]);

    const prefillTime = prefillLog?.metadata?.murajaah_time ||
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setInputTime(prefillTime);
    setInputNotes(prefillLog?.notes_parent || '');
    setInputLembar(String(prefillLog?.murajaah_lembar || '1.0'));

    const teacherNote = prefillLog?.notes_teacher ||
      prefillLog?.catatan ||
      prefillLog?.notes ||
      prefillLog?.teacher_notes ||
      prefillLog?.catatan_ustadz ||
      prefillLog?.metadata?.teacher_note ||
      '';
    const teacherName = prefillLog?.teacher_name ||
      prefillLog?.teacher?.name ||
      prefillLog?.employee?.nama_lengkap ||
      prefillLog?.signature_teacher ||
      'Guru Pembimbing Tahfizh';
    setCurrentTeacherNote(teacherNote);
    setCurrentTeacherName(teacherName);

    if (prefillLog) {
      // Ekstraksi surah dan ayat yang spesifik dari card yang diklik
      const parsed = parseLogSurahAndVerses(prefillLog, quranSurahs);
      setInputAyatStart(String(parsed.aStart && !isNaN(parsed.aStart) ? parsed.aStart : '1'));
      setInputAyatEnd(String(parsed.aEnd && !isNaN(parsed.aEnd) ? parsed.aEnd : '10'));

      if (parsed.matchedSurah) {
        setSelectedSurah(parsed.matchedSurah);
        setIsSelectingDifferentSurah(false);
        void loadSurahVerses(parsed.matchedSurah.nomor);
        setShowMushafViewer(true);
      } else if (parsed.surahNum && parsed.surahNum >= 1 && parsed.surahNum <= 114) {
        const fallbackSurah = quranSurahs.find((s) => Number(s.nomor) === Number(parsed.surahNum));
        setSelectedSurah({
          nomor: Number(parsed.surahNum),
          nama_latin: parsed.surahName || fallbackSurah?.nama_latin || `Surah ${parsed.surahNum}`,
          nama: fallbackSurah?.nama || '',
          jumlah_ayat: fallbackSurah?.jumlah_ayat || 0,
          arti: fallbackSurah?.arti || '',
          tempat_turun: fallbackSurah?.tempat_turun || '',
        });
        setIsSelectingDifferentSurah(false);
        void loadSurahVerses(Number(parsed.surahNum));
        setShowMushafViewer(true);
      } else {
        // Record sumber tidak memiliki nomor surah kanonis yang valid (1–114)
        setSelectedSurah(null);
        setIsSelectingDifferentSurah(true);
        setShowMushafViewer(false);
      }
    } else {
      setIsSelectingDifferentSurah(true);
      setShowMushafViewer(false);
      setSelectedSurah(null);
      setInputAyatStart('1');
      setInputAyatEnd('10');
    }

    setIsInputModalVisible(true);

    // Ambil daftar surah lengkap secara asinkron bila belum ada
    if (quranSurahs.length === 0) {
      setIsSurahListLoading(true);
      mobileApiService.getQuranSurahs()
        .then((res) => {
          const list = unwrapApiData<any[]>(res) || [];
          if (Array.isArray(list) && list.length > 0) {
            setQuranSurahs(list);
            if (prefillLog) {
              const reParsed = parseLogSurahAndVerses(prefillLog, list);
              if (reParsed.matchedSurah) {
                setSelectedSurah(reParsed.matchedSurah);
                void loadSurahVerses(reParsed.matchedSurah.nomor);
                setShowMushafViewer(true);
              } else if (reParsed.surahNum && reParsed.surahNum >= 1 && reParsed.surahNum <= 114) {
                const found = list.find((s) => Number(s.nomor) === Number(reParsed.surahNum));
                if (found) {
                  setSelectedSurah(found);
                  void loadSurahVerses(found.nomor);
                  setShowMushafViewer(true);
                }
              }
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          setIsSurahListLoading(false);
        });
    }
  };

  const handleSelectSurah = (s: any) => {
    setSelectedSurah(s);
    setInputAyatStart('1');
    setInputAyatEnd(String(Math.min(10, s.jumlah_ayat || 10)));
    setIsSelectingDifferentSurah(false);
    void loadSurahVerses(s.nomor);
  };

  const toggleMushafViewer = () => {
    if (!selectedSurah) return;
    const nextState = !showMushafViewer;
    setShowMushafViewer(nextState);
    if (nextState) {
      void loadSurahVerses(selectedSurah.nomor);
    }
  };

  const handleSubmitMurajaah = async () => {
    const surahNum = Number(selectedSurah?.nomor);
    if (!selectedSurah || isNaN(surahNum) || surahNum < 1 || surahNum > 114) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Pilih Surah',
        message: 'Silakan pilih surah Al-Qur\'an (1–114) yang dimurajaahkan terlebih dahulu.',
      });
      return;
    }
    const aStart = parseInt(inputAyatStart, 10);
    const aEnd = parseInt(inputAyatEnd, 10);

    if (isNaN(aStart) || aStart < 1) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Ayat Tidak Valid',
        message: 'Nomor ayat awal minimal 1.',
      });
      return;
    }
    if (isNaN(aEnd) || aEnd < aStart) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Ayat Tidak Valid',
        message: 'Nomor ayat akhir harus lebih besar atau sama dengan ayat mulai.',
      });
      return;
    }
    if (selectedSurah.jumlah_ayat && aEnd > selectedSurah.jumlah_ayat) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Melebihi Jumlah Ayat',
        message: `Surah ${selectedSurah.nama_latin || selectedSurah.nama || surahNum} hanya memiliki ${selectedSurah.jumlah_ayat} ayat.`,
      });
      return;
    }

    const currentStudentId = selectedChildId || (studentInfo?.id ? String(studentInfo.id) : undefined);
    if (!currentStudentId) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Pilih Siswa',
        message: 'Silakan pilih ananda/siswa terlebih dahulu.',
      });
      return;
    }

    try {
      setIsSubmittingMurajaah(true);
      const payload = {
        student_id: currentStudentId,
        surah_number: selectedSurah.nomor,
        ayat_start: aStart,
        ayat_end: aEnd,
        record_date: inputDate,
        record_time: inputTime,
        murajaah_lembar: parseFloat(inputLembar) || 1.0,
        notes_parent: inputNotes.trim() || undefined,
      };

      const res = await mobileApiService.submitPortalMurajaah(payload);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Alhamdulillah! 🌟',
        message: res?.message || 'Laporan setoran murajaah mandiri di rumah telah berhasil disimpan dan diteruskan ke Guru/Ustadz Tahfizh untuk verifikasi.',
        onConfirm: () => {
          setIsInputModalVisible(false);
          void loadTahfizhData();
        },
      });
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || 'Gagal menyimpan setoran murajaah. Silakan periksa koneksi internet Anda.';
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Mengirim',
        message: errorMsg,
      });
    } finally {
      setIsSubmittingMurajaah(false);
    }
  };


  // 1. Fetch children if parent role with offline cache
  const loadChildren = useCallback(async () => {
    if (!isParent) return;
    const targetChildId = route?.params?.child_id;
    const storeActiveId = useActiveChildStore.getState().activeChildId;
    const childCacheKey = offlineCache.buildKey('tahfizh_children', user?.id);
    const cached = await offlineCache.get<any[]>(childCacheKey);
    if (cached && cached.length > 0) {
      setChildren(cached);
      setSelectedChildId((prev: any) => prev || resolveSelectedChildId(targetChildId, storeActiveId, cached) || String(cached[0].id || cached[0].student_id));
    }

    try {
      const res = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<any[]>(res) || [];
      if (Array.isArray(list) && list.length > 0) {
        setChildren(list);
        setSelectedChildId((prev: any) => prev || resolveSelectedChildId(targetChildId, storeActiveId, list) || String(list[0].id || list[0].student_id));
        void offlineCache.set(childCacheKey, list);
      }
    } catch {
      // Keep cached children if available
    }
  }, [isParent, user?.id, route?.params?.child_id]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // 2. Fetch tahfizh data from backend database with offline cache
  const loadTahfizhData = useCallback(async () => {
    const cacheKey = offlineCache.buildKey('tahfizh', user?.id, selectedChildId || 'self');

    // 1. Baca cache dulu agar data tampil langsung tanpa menunggu jaringan
    const cached = await offlineCache.get<any>(cacheKey);
    if (cached) {
      if (cached.items) setLogs(cached.items);
      if (cached.kpi) setKpiData(cached.kpi);
      if (cached.target) setTargetData(cached.target);
      if (cached.pendingHomeMurajaah) setPendingHomeMurajaah(cached.pendingHomeMurajaah);
      if (cached.student) setStudentInfo(cached.student);
      if (cached.achievement) setTahfizhAchievement(cached.achievement);
      if (cached.gradeJourney) setGradeJourney(cached.gradeJourney);
      if (cached.currentGradeNum !== null && cached.currentGradeNum !== undefined) {
        setCurrentGradeNum(cached.currentGradeNum);
        setSelectedGrade(cached.currentGradeNum);
      }
    }

    try {
      const params: Record<string, any> = {
        child_id: selectedChildId,
        per_page: 50,
      };

      const [res, achievementRes] = await Promise.all([
        mobileApiService.getPortalTahfizh(params),
        selectedChildId
          ? mobileApiService.getPortalTahfizhAchievement(selectedChildId).catch(() => null)
          : Promise.resolve(null),
      ]);
      const data = unwrapApiData<any>(res) || {};

      let achievement = unwrapApiData<any>(achievementRes) || achievementRes?.data || null;
      if (!achievement) {
        const studentId = res?.student?.id || data?.student?.id;
        if (studentId) {
          const lateRes = await mobileApiService.getPortalTahfizhAchievement(String(studentId)).catch(() => null);
          achievement = unwrapApiData<any>(lateRes) || lateRes?.data || null;
        }
      }
      setTahfizhAchievement(achievement);

      const items = Array.isArray(data?.data?.data)
        ? data.data.data
        : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
        ? data
        : Array.isArray(res?.data)
        ? res.data
        : [];

      setLogs(items);

      const freshKpi = res?.kpi || data?.kpi || null;
      const freshTarget = res?.target || res?.tahfizh_target || data?.target || data?.tahfizh_target || null;
      const freshPending = res?.pending_home_murajaah || data?.pending_home_murajaah || null;
      const freshStudent = res?.student || data?.student || null;

      setKpiData(freshKpi);
      setTargetData(freshTarget);
      setPendingHomeMurajaah(freshPending);
      setStudentInfo(freshStudent);

      let gjList: any[] = [];
      let cGrade: number | null = null;
      if (res?.grade_journey?.grades || data?.grade_journey?.grades) {
        const gj = res?.grade_journey || data?.grade_journey;
        gjList = gj.grades || [];
        setGradeJourney(gjList);
        if (gj.current_grade !== null && gj.current_grade !== undefined) {
          cGrade = Number(gj.current_grade);
          setCurrentGradeNum(cGrade);
          setSelectedGrade(cGrade);
        }
      }

      // Simpan ke offline cache
      void offlineCache.set(cacheKey, {
        items,
        kpi: freshKpi,
        target: freshTarget,
        pendingHomeMurajaah: freshPending,
        student: freshStudent,
        achievement,
        gradeJourney: gjList,
        currentGradeNum: cGrade,
      });
    } catch {
      // Jika offline dan tidak ada cache sama sekali, kosongkan
      if (!cached) {
        setLogs([]);
        setKpiData(null);
        setTargetData(null);
        setPendingHomeMurajaah(null);
        setStudentInfo(null);
        setTahfizhAchievement(null);
        setGradeJourney([]);
        setCurrentGradeNum(null);
        setSelectedGrade(null);
      }
    }
  }, [selectedChildId, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTahfizhData();
    setRefreshing(false);
  };

  useEffect(() => {
    setLoading(true);
    loadTahfizhData().finally(() => setLoading(false));
  }, [loadTahfizhData]);

  // Metrics calculation: Prioritaskan validated_unique_ayah & achievement_percentage identik dengan web-dashboard
  const totalAyat = useMemo(() => {
    if (tahfizhAchievement?.validated_unique_ayah !== undefined && tahfizhAchievement?.validated_unique_ayah !== null) {
      return Number(tahfizhAchievement.validated_unique_ayah);
    }
    if (kpiData?.total_ayat !== undefined && kpiData?.total_ayat !== null) {
      return Number(kpiData.total_ayat);
    }
    return logs.reduce((acc, curr) => {
      if (curr.jumlah_ayat !== undefined && curr.jumlah_ayat !== null && Number(curr.jumlah_ayat) > 0) {
        return acc + Number(curr.jumlah_ayat);
      }
      const start = Number(curr.hafalan_ayah_start ?? curr.ayat_start ?? curr.ayat_mulai);
      const end = Number(curr.hafalan_ayah_end ?? curr.ayat_end ?? curr.ayat_selesai);
      if (start > 0 && end >= start) {
        return acc + (end - start + 1);
      }
      return acc + (Number(curr.hafalan_baris) || 0);
    }, 0);
  }, [tahfizhAchievement, kpiData, logs]);

  const targetAyat = Number(tahfizhAchievement?.target_ayah || targetData?.target_ayat || kpiData?.target_ayat || 0);
  const targetSemester =
    tahfizhAchievement?.target_name ||
    tahfizhAchievement?.target_juz ||
    targetData?.surah_target ||
    targetData?.target_juz ||
    kpiData?.target_surah ||
    (targetAyat > 0 ? `${targetAyat} Ayat` : totalAyat > 0 ? 'Kurikulum' : '-');
  const targetSurah = targetSemester;

  const thisMonthCount = useMemo(() => {
    if (kpiData?.this_month_count !== undefined && kpiData?.this_month_count !== null) {
      return Number(kpiData.this_month_count);
    }
    const now = new Date();
    const currentLogs = logs.filter((l) => {
      const raw = l.record_date || l.date || l.tanggal || l.created_at;
      if (!raw) return false;
      const d = new Date(raw);
      return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    if (currentLogs.length > 0) return currentLogs.length;

    // Fallback: hitung frekuensi bulan aktif terakhir bila awal bulan kalender
    const latestRaw = logs[0]?.record_date || logs[0]?.date || logs[0]?.tanggal;
    if (latestRaw) {
      const d = new Date(latestRaw);
      if (!isNaN(d.getTime())) {
        const lm = d.getMonth();
        const ly = d.getFullYear();
        return logs.filter((l) => {
          const dt = new Date(l.record_date || l.date || l.tanggal);
          return dt.getMonth() === lm && dt.getFullYear() === ly;
        }).length;
      }
    }
    return 0;
  }, [kpiData, logs]);

  const activeChild = useMemo(() => {
    if (Array.isArray(children) && children.length > 0) {
      return children.find((c) => String(c.id || c.student_id) === String(selectedChildId)) || children[0];
    }
    return null;
  }, [children, selectedChildId]);

  // Siswa aktif untuk sticky header & hero (anak terpilih -> info siswa -> profil -> user)
  const headerStudent = useMemo(() => {
    return activeChild || studentInfo || (user as any)?.student || user || null;
  }, [activeChild, studentInfo, user]);

  const activeStudentName =
    headerStudent?.full_name ||
    headerStudent?.name ||
    headerStudent?.nama_lengkap ||
    '';

  // Nama depan + fallback tahun ajaran untuk subtitle hero statis
  const heroFirstName = useMemo(
    () => resolveStudentDisplay(headerStudent, user).firstName,
    [headerStudent, user]
  );
  const academicYear = useMemo(
    () => getDynamicAcademicYear(headerStudent || studentInfo),
    [headerStudent, studentInfo]
  );
  const academicSemester = useMemo(
    () => getDynamicAcademicSemester(headerStudent || studentInfo),
    [headerStudent, studentInfo]
  );

  const heroSubtitleFallback = useMemo(() => {
    return `Tahun Ajaran ${academicYear}`;
  }, [academicYear]);

  const targetPeriodLabel = useMemo(() => {
    if (targetData?.target_type) return `Target ${targetData.target_type}`;
    if (tahfizhAchievement?.target_name) return 'Target Kurikulum';
    return academicYear ? `Target ${academicYear}` : 'Target Kurikulum';
  }, [targetData, tahfizhAchievement, academicYear]);

  const studentUnitName = useMemo(() => {
    if (activeChild) {
      const childUnit =
        activeChild.kelas?.unit_pendidikan?.name ||
        activeChild.kelas?.unitPendidikan?.name ||
        activeChild.education_unit?.name ||
        activeChild.unit_name ||
        activeChild.unit;
      if (childUnit) return childUnit;
    }

    if (studentInfo) {
      const infoUnit =
        studentInfo.kelas?.unit_pendidikan?.name ||
        studentInfo.kelas?.unitPendidikan?.name ||
        studentInfo.education_unit?.name ||
        studentInfo.unit_name ||
        studentInfo.unit;
      if (infoUnit) return infoUnit;
    }

    const userUnit =
      (user as any)?.unit_name ||
      (user as any)?.education_unit?.name ||
      (user as any)?.kelas?.unit_pendidikan?.name;

    return userUnit || '';
  }, [activeChild, studentInfo, user]);

  // Latest memorization log
  const latestLog = useMemo(() => {
    return (
      logs.find((l) => (l.hafalan_surah_name || l.surah || l.nama_surah) && (l.hafalan_ayah_start || l.ayat_start || l.ayat_mulai)) ||
      logs.find((l) => l.hafalan_surah_name || l.surah || l.nama_surah || l.tilawah_text) ||
      logs[0] ||
      null
    );
  }, [logs]);

  const latestSurah = latestLog?.hafalan_surah_name || latestLog?.surah || latestLog?.nama_surah || (latestLog?.tilawah_text ? latestLog.tilawah_text : '');
  const latestAyatStart = latestLog?.hafalan_ayah_start ?? latestLog?.ayat_start ?? latestLog?.ayat_mulai;
  const latestAyatEnd = latestLog?.hafalan_ayah_end ?? latestLog?.ayat_end ?? latestLog?.ayat_selesai;
  const latestDate = latestLog?.record_date || latestLog?.date || latestLog?.tanggal || latestLog?.created_at;
  const latestTeacher = latestLog?.teacher?.full_name || latestLog?.teacher?.nama_lengkap || latestLog?.teacher?.name || latestLog?.pengampu || latestLog?.signature_teacher || '-';
  const latestNote = latestLog?.notes_teacher || latestLog?.catatan || latestLog?.notes_parent;

  // Target Kurikulum Tahfizh (berdasarkan target kurikulum & riwayat setoran anak dari API)
  const targetCurriculumList = useMemo(() => {
    // Siapkan daftar surah master terurut resmi (1..114) dari quranSurahs
    const sortedQuranSurahs = Array.isArray(quranSurahs) && quranSurahs.length > 0
      ? [...quranSurahs].sort((a, b) => Number(a.nomor) - Number(b.nomor))
      : [];

    if (sortedQuranSurahs.length === 0) {
      return [];
    }

    // Kumpulkan nomor surah dari riwayat setoran anak
    const logsSurahNumbers = new Set<number>();
    logs.forEach((l) => {
      const p = parseLogSurahAndVerses(l, sortedQuranSurahs);
      if (p.surahNum) logsSurahNumbers.add(Number(p.surahNum));
    });

    // Tentukan candidate surahs sesuai filter Juz atau target kurikulum
    let candidateSurahs: any[] = [];

    if (curriculumJuzFilter === 'all_quran') {
      candidateSurahs = sortedQuranSurahs;
    } else if (curriculumJuzFilter !== 'all') {
      const targetJuzNum = parseInt(curriculumJuzFilter, 10);
      candidateSurahs = sortedQuranSurahs.filter((s) => {
        const sNum = Number(s.nomor);
        const totalA = Number(s.jumlah_ayat || s.ayat || 1);
        const jStart = getQuranJuz(sNum, 1);
        const jEnd = getQuranJuz(sNum, totalA);
        return targetJuzNum >= jStart && targetJuzNum <= jEnd;
      });
    } else {
      // Default: 'all' (Target Kurikulum Berjalan Siswa dari API / Database)
      const targetStr = String(
        targetData?.surah_target ||
        targetData?.target_juz ||
        kpiData?.target_surah ||
        tahfizhAchievement?.target_name ||
        tahfizhAchievement?.target_juz ||
        ''
      ).toLowerCase();

      // Ekstraksi nomor Juz dari target database (misal "Juz 30 (564 Ayat)", "Juz 29 - 30", atau "Juz 30")
      const targetJuzSet = new Set<number>();
      const juzMatches = targetStr.match(/juz\s*(\d+)(?:\s*-\s*(\d+))?/i);
      if (juzMatches) {
        const j1 = parseInt(juzMatches[1], 10);
        const j2 = juzMatches[2] ? parseInt(juzMatches[2], 10) : j1;
        for (let j = Math.min(j1, j2); j <= Math.max(j1, j2); j++) {
          if (j >= 1 && j <= 30) targetJuzSet.add(j);
        }
      }

      // Ambil Juz dari riwayat setoran anak
      logs.forEach((l) => {
        const p = parseLogSurahAndVerses(l, sortedQuranSurahs);
        if (p.surahNum) {
          const j = getQuranJuz(Number(p.surahNum), p.aStart || 1);
          if (j >= 1 && j <= 30) targetJuzSet.add(j);
        }
      });

      // Jika belum ada target spesifik di database dan belum ada setoran, default target Juz 30
      if (targetJuzSet.size === 0 && logsSurahNumbers.size === 0) {
        targetJuzSet.add(30);
      }

      candidateSurahs = sortedQuranSurahs.filter((s) => {
        const sNum = Number(s.nomor);
        const totalA = Number(s.jumlah_ayat || s.ayat || 1);
        const jStart = getQuranJuz(sNum, 1);
        const jEnd = getQuranJuz(sNum, totalA);

        // 1. Selalu sertakan jika ada riwayat setoran anak untuk surah ini
        if (logsSurahNumbers.has(sNum)) return true;

        // 2. Selalu sertakan jika surah ini masuk ke dalam target Juz aktif database
        if (targetJuzSet.has(jStart) || targetJuzSet.has(jEnd)) return true;

        // 3. Sertakan jika nama surah cocok dengan teks target khusus
        if (targetStr && (s.nama_latin?.toLowerCase().includes(targetStr) || targetStr.includes(s.nama_latin?.toLowerCase() || ''))) {
          return true;
        }

        return false;
      });
    }

    // Mapping & Grouping log untuk setiap surah yang sama
    const items = candidateSurahs.map((s) => {
      const sNum = Number(s.nomor);
      const sNama = s.nama_latin || s.nama || `Surah ${sNum}`;
      const totalAyat = Number(s.jumlah_ayat || s.ayat || 0);

      // Cari dan kelompokkan seluruh log setoran yang cocok dengan surah ini
      const matchedLogs = logs.filter((l) => {
        const p = parseLogSurahAndVerses(l, sortedQuranSurahs);
        if (p.surahNum && Number(p.surahNum) === sNum) return true;
        const cleanL = (p.surahName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanS = sNama.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanL && cleanS && (cleanL.includes(cleanS) || cleanS.includes(cleanL));
      });

      // Hitung ayat-ayat unik yang telah tuntas disetorkan
      const uniqueAyatSet = new Set<number>();
      matchedLogs.forEach((l) => {
        const p = parseLogSurahAndVerses(l, sortedQuranSurahs);
        const start = p.aStart || 1;
        const end = p.aEnd || start;
        for (let a = Math.min(start, end); a <= Math.max(start, end); a++) {
          if (a >= 1 && (totalAyat <= 0 || a <= totalAyat)) {
            uniqueAyatSet.add(a);
          }
        }
      });

      const uniqueAyatCount = uniqueAyatSet.size;
      const progressPercent = totalAyat > 0 ? Math.min(100, Math.round((uniqueAyatCount / totalAyat) * 100)) : (uniqueAyatCount > 0 ? 100 : 0);

      const isCompletedFromBackend = tahfizhAchievement?.completed_surahs?.some(
        (cs: any) => Number(cs.number || cs.nomor) === sNum
      );

      const isDone = Boolean(
        isCompletedFromBackend ||
        (totalAyat > 0 && uniqueAyatCount >= totalAyat) ||
        (matchedLogs.length > 0 && matchedLogs.some((l) => isExplicitlyLancar(l)) && uniqueAyatCount > 0)
      );

      const juzStart = getQuranJuz(sNum, 1);
      const juzEnd = totalAyat > 0 ? getQuranJuz(sNum, totalAyat) : juzStart;
      const juzLabel = juzStart === juzEnd ? `Juz ${juzStart}` : `Juz ${juzStart} – ${juzEnd}`;

      const hasPengulangan = matchedLogs.some((l) => isSetoranNeedsMurajaah(l));
      const hasMurajaahType = matchedLogs.some((l) => getLogJenis(l) === 'murajaah');
      const isNeedsMurajaah = Boolean((hasPengulangan || hasMurajaahType) && !isDone);

      let statusLabel = 'Target Berikutnya';
      if (isDone) {
        statusLabel = 'Tuntas';
      } else if (isNeedsMurajaah) {
        statusLabel = 'Perlu Murajaah';
      } else if (uniqueAyatCount > 0) {
        statusLabel = `Progres (${uniqueAyatCount}/${totalAyat || uniqueAyatCount} Ayat)`;
      }

      return {
        nomor: sNum,
        nama: sNama,
        nama_arab: s.nama || '',
        arti: s.arti || '',
        tempat_turun: s.tempat_turun || '',
        deskripsi: s.deskripsi || '',
        ayat: totalAyat,
        juz: juzStart,
        juzEnd,
        juzLabel,
        isDone,
        isNeedsMurajaah,
        statusLabel,
        matchedLogs,
        setoranCount: matchedLogs.length,
        uniqueAyatCount,
        progressPercent,
      };
    });

    // Urutkan presisi sesuai urutan Juz dan Nomor Surah
    items.sort((a, b) => {
      if (curriculumSortOrder === 'reverse') {
        if (b.juz !== a.juz) return b.juz - a.juz;
        return b.nomor - a.nomor;
      }
      if (a.juz !== b.juz) return a.juz - b.juz;
      return a.nomor - b.nomor;
    });

    return items;
  }, [logs, quranSurahs, targetData, kpiData, curriculumJuzFilter, curriculumSortOrder, tahfizhAchievement]);

  // Opsi filter Juz yang relevan dengan kurikulum dan data setoran anak secara dinamis
  const curriculumJuzOptions = useMemo(() => {
    const list: { key: string; label: string }[] = [
      { key: 'all', label: 'Target Ananda' },
    ];

    const availableJuz = new Set<number>();

    // 1. Ekstraksi nomor Juz dari target kurikulum aktif database (targetData / tahfizhAchievement)
    const targetStr = String(
      targetData?.surah_target ||
      targetData?.target_juz ||
      kpiData?.target_surah ||
      tahfizhAchievement?.target_name ||
      tahfizhAchievement?.target_juz ||
      ''
    ).toLowerCase();

    const juzMatches = targetStr.match(/juz\s*(\d+)(?:\s*-\s*(\d+))?/i);
    if (juzMatches) {
      const j1 = parseInt(juzMatches[1], 10);
      const j2 = juzMatches[2] ? parseInt(juzMatches[2], 10) : j1;
      for (let j = Math.min(j1, j2); j <= Math.max(j1, j2); j++) {
        if (j >= 1 && j <= 30) availableJuz.add(j);
      }
    }

    // 2. Ambil seluruh Juz yang tercatat di riwayat setoran ananda
    logs.forEach((l) => {
      const p = parseLogSurahAndVerses(l, quranSurahs);
      if (p.surahNum) {
        const j = getQuranJuz(Number(p.surahNum), p.aStart || 1);
        if (j >= 1 && j <= 30) availableJuz.add(j);
      }
    });

    // Jika belum ada data setoran dan belum ada target, baseline ke Juz 30
    if (availableJuz.size === 0) {
      availableJuz.add(30);
    }

    // Urutkan nomor Juz (Juz yang relevan)
    const sortedJuz = Array.from(availableJuz).sort((a, b) => b - a);
    sortedJuz.forEach((j) => {
      list.push({ key: String(j), label: `Juz ${j}` });
    });

    list.push({ key: 'all_quran', label: 'Semua 30 Juz' });
    return list;
  }, [targetData, kpiData, tahfizhAchievement, logs, quranSurahs]);

  // Persentase progress hafalan (identik dengan achievement_percentage di web-dashboard)
  const targetProgress = useMemo(() => {
    if (tahfizhAchievement?.achievement_percentage !== undefined && tahfizhAchievement?.achievement_percentage !== null) {
      return Math.round(Number(tahfizhAchievement.achievement_percentage));
    }
    const resolvedTarget = targetAyat > 0 ? targetAyat : targetCurriculumList.reduce((acc, curr) => acc + (curr.ayat || 0), 0);
    return resolvedTarget > 0 ? Math.min(100, Math.round((totalAyat / resolvedTarget) * 100)) : 0;
  }, [tahfizhAchievement, targetAyat, totalAyat, targetCurriculumList]);

  const targetProgressExact = useMemo(() => {
    if (tahfizhAchievement?.achievement_percentage !== undefined && tahfizhAchievement?.achievement_percentage !== null) {
      return Number(tahfizhAchievement.achievement_percentage).toFixed(2);
    }
    const resolvedTarget = targetAyat > 0 ? targetAyat : targetCurriculumList.reduce((acc, curr) => acc + (curr.ayat || 0), 0);
    return resolvedTarget > 0 ? ((totalAyat / resolvedTarget) * 100).toFixed(2) : '0.00';
  }, [tahfizhAchievement, targetAyat, totalAyat, targetCurriculumList]);

  const isZiyadahLog = (l: any) => getLogJenis(l) === 'ziyadah';
  const isMurajaahLog = (l: any) => {
    const j = getLogJenis(l);
    return j === 'murajaah';
  };
  const isTilawahLog = (l: any) => {
    const j = getLogJenis(l);
    return j === 'tilawah';
  };

  // Tab Counts for 4 Card Tabs
  const tabCounts = useMemo(() => {
    if (kpiData?.tab_counts) {
      return {
        all: Number(kpiData.tab_counts.all ?? logs.length),
        ziyadah: Number(kpiData.tab_counts.ziyadah ?? 0),
        murajaah: Number(kpiData.tab_counts.murajaah ?? 0),
        tilawah: Number(kpiData.tab_counts.tilawah ?? 0),
      };
    }

    let ziyadah = 0;
    let murajaah = 0;
    let tilawah = 0;

    logs.forEach((l) => {
      if (isZiyadahLog(l)) {
        ziyadah++;
      }
      if (isMurajaahLog(l)) {
        murajaah++;
      }
      if (isTilawahLog(l)) {
        tilawah++;
      }
    });

    return {
      all: logs.length,
      ziyadah,
      murajaah,
      tilawah,
    };
  }, [kpiData, logs]);

  const tabCardItems = useMemo(
    () => [
      {
        key: 'all' as const,
        label: 'Semua',
        sub: 'Semua Setoran',
        count: tabCounts.all,
        icon: 'format-list-bulleted',
      },
      {
        key: 'ziyadah' as const,
        label: 'Hafalan Baru',
        sub: 'Ziyadah',
        count: tabCounts.ziyadah,
        icon: 'book-plus-outline',
      },
      {
        key: 'murajaah' as const,
        label: 'Murajaah',
        sub: 'Pengulangan',
        count: tabCounts.murajaah,
        icon: 'book-sync-outline',
      },
      {
        key: 'tilawah' as const,
        label: 'Tilawah',
        sub: 'Bacaan Qur\'an',
        count: tabCounts.tilawah,
        icon: 'book-open-variant',
      },
    ],
    [tabCounts]
  );

  const timeFilterItems = useMemo(
    () => {
      let customLabel = 'Rentang Tanggal';
      if (customStartDate && customEndDate) {
        if (customStartDate === customEndDate) {
          customLabel = formatShortDate(customStartDate);
        } else {
          customLabel = `${formatShortDate(customStartDate)} – ${formatShortDate(customEndDate)}`;
        }
      } else if (customStartDate) {
        customLabel = `Dari ${formatShortDate(customStartDate)}`;
      }

      return [
        { key: 'all' as const, label: `Semua ${currentGradeLabel}`, icon: 'calendar-blank' },
        { key: 'today' as const, label: 'Harian (Hari Ini)', icon: 'calendar-today' },
        { key: 'week' as const, label: 'Mingguan (Pekan Ini)', icon: 'calendar-week' },
        { key: 'month' as const, label: 'Bulanan (Bulan Ini)', icon: 'calendar-month' },
        { key: 'semester' as const, label: 'Semester Berjalan', icon: 'calendar-range' },
        { key: 'custom' as const, label: customLabel, icon: 'calendar-filter' },
      ];
    },
    [currentGradeLabel, customStartDate, customEndDate]
  );

  const closestScrollIndex = (offsetX: number, offsets: number[]) => {
    if (offsets.length === 0) return 0;
    return offsets.reduce(
      (closest, itemOffset, index) =>
        Math.abs(itemOffset - offsetX) < Math.abs(offsets[closest] - offsetX) ? index : closest,
      0
    );
  };

  // Helper filter periode waktu: Harian, Pekan, Bulan, Semester, Tahunan, Custom Rentang
  const matchesTimePeriod = (
    dateVal: string | undefined,
    period: 'all' | 'today' | 'week' | 'month' | 'semester' | 'year' | 'custom'
  ) => {
    if (period === 'all' || !dateVal) return true;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return true;
    const now = new Date();

    if (period === 'custom') {
      if (!customStartDate && !customEndDate) return true;
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      const itemDateStr = `${yr}-${mo}-${da}`;

      if (customStartDate && customEndDate) {
        const s = customStartDate <= customEndDate ? customStartDate : customEndDate;
        const e = customStartDate <= customEndDate ? customEndDate : customStartDate;
        return itemDateStr >= s && itemDateStr <= e;
      }
      if (customStartDate) return itemDateStr >= customStartDate;
      if (customEndDate) return itemDateStr <= customEndDate;
      return true;
    }

    if (period === 'today') {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }

    if (period === 'week') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      return d >= sevenDaysAgo && d <= now;
    }

    if (period === 'month') {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      );
    }

    if (period === 'semester') {
      const isCurrentSemesterGanjil = now.getMonth() >= 6;
      const isItemSemesterGanjil = d.getMonth() >= 6;
      return d.getFullYear() === now.getFullYear() && isCurrentSemesterGanjil === isItemSemesterGanjil;
    }

    if (period === 'year') {
      return d.getFullYear() === now.getFullYear();
    }

    return true;
  };

  // Handlers and Helpers for Date Range Filter
  const openDateRangeModal = () => {
    const today = new Date();
    const yr = today.getFullYear();
    const mo = String(today.getMonth() + 1).padStart(2, '0');
    const da = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yr}-${mo}-${da}`;

    setTempRangeStart(customStartDate || todayStr);
    setTempRangeEnd(customEndDate || todayStr);

    if (customStartDate) {
      const parts = customStartDate.split('-');
      if (parts.length === 3) {
        setCalendarViewingDate(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1));
      }
    } else {
      setCalendarViewingDate(new Date());
    }
    setIsDateRangeModalVisible(true);
  };

  const handleSelectDateRange = (dateStr: string) => {
    if (!tempRangeStart || (tempRangeStart && tempRangeEnd)) {
      setTempRangeStart(dateStr);
      setTempRangeEnd(null);
    } else if (tempRangeStart && !tempRangeEnd) {
      if (dateStr < tempRangeStart) {
        setTempRangeEnd(tempRangeStart);
        setTempRangeStart(dateStr);
      } else {
        setTempRangeEnd(dateStr);
      }
    }
  };

  const handleApplyPresetRange = (preset: '7days' | '14days' | '30days' | 'thisMonth' | 'lastMonth') => {
    const now = new Date();
    const formatYMD = (d: Date) => {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${da}`;
    };

    let start: string;
    let end: string = formatYMD(now);

    if (preset === '7days') {
      const d = new Date();
      d.setDate(now.getDate() - 6);
      start = formatYMD(d);
    } else if (preset === '14days') {
      const d = new Date();
      d.setDate(now.getDate() - 13);
      start = formatYMD(d);
    } else if (preset === '30days') {
      const d = new Date();
      d.setDate(now.getDate() - 29);
      start = formatYMD(d);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      start = formatYMD(firstDay);
      end = formatYMD(now);
    } else if (preset === 'lastMonth') {
      const firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0);
      start = formatYMD(firstDayPrev);
      end = formatYMD(lastDayPrev);
    } else {
      return;
    }

    setTempRangeStart(start);
    setTempRangeEnd(end);
    const [sY, sM] = start.split('-');
    setCalendarViewingDate(new Date(parseInt(sY, 10), parseInt(sM, 10) - 1, 1));
  };

  const handleApplyCustomRange = () => {
    if (!tempRangeStart && !tempRangeEnd) {
      setIsDateRangeModalVisible(false);
      return;
    }
    const start = tempRangeStart || tempRangeEnd!;
    const end = tempRangeEnd || tempRangeStart!;
    const finalStart = start <= end ? start : end;
    const finalEnd = start <= end ? end : start;

    setCustomStartDate(finalStart);
    setCustomEndDate(finalEnd);
    setTimePeriodFilter('custom');
    setIsDateRangeModalVisible(false);
  };

  const handlePrevMonth = () => {
    setCalendarViewingDate((prev) => {
      const y = prev.getFullYear();
      const m = prev.getMonth();
      return new Date(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1);
    });
  };

  const handleNextMonth = () => {
    setCalendarViewingDate((prev) => {
      const y = prev.getFullYear();
      const m = prev.getMonth();
      return new Date(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1);
    });
  };

  const handleResetCalendarToToday = () => {
    setCalendarViewingDate(new Date());
  };

  const calendarGridData = useMemo(() => {
    const year = calendarViewingDate.getFullYear();
    const month = calendarViewingDate.getMonth();

    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const cells: Array<{
      day: number;
      fullDate: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isStart: boolean;
      isEnd: boolean;
      isInRange: boolean;
    }> = [];

    // Prev month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonthIdx = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const fullDate = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isStart = tempRangeStart === fullDate;
      const isEnd = tempRangeEnd === fullDate;
      const isInRange = Boolean(tempRangeStart && tempRangeEnd && fullDate > tempRangeStart && fullDate < tempRangeEnd);
      cells.push({
        day: d,
        fullDate,
        isCurrentMonth: false,
        isToday: fullDate === todayStr,
        isStart,
        isEnd,
        isInRange,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const fullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isStart = tempRangeStart === fullDate;
      const isEnd = tempRangeEnd === fullDate;
      const isInRange = Boolean(tempRangeStart && tempRangeEnd && fullDate > tempRangeStart && fullDate < tempRangeEnd);
      cells.push({
        day: d,
        fullDate,
        isCurrentMonth: true,
        isToday: fullDate === todayStr,
        isStart,
        isEnd,
        isInRange,
      });
    }

    // Next month padding
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let n = 1; n <= remaining; n++) {
      const nextMonthIdx = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const fullDate = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      const isStart = tempRangeStart === fullDate;
      const isEnd = tempRangeEnd === fullDate;
      const isInRange = Boolean(tempRangeStart && tempRangeEnd && fullDate > tempRangeStart && fullDate < tempRangeEnd);
      cells.push({
        day: n,
        fullDate,
        isCurrentMonth: false,
        isToday: fullDate === todayStr,
        isStart,
        isEnd,
        isInRange,
      });
    }

    return cells;
  }, [calendarViewingDate, tempRangeStart, tempRangeEnd]);

  const tempRangeDurationDays = useMemo(() => {
    if (!tempRangeStart) return 0;
    if (!tempRangeEnd) return 1;
    const t1 = new Date(tempRangeStart).getTime();
    const t2 = new Date(tempRangeEnd).getTime();
    const diff = Math.abs(t2 - t1);
    return Math.round(diff / (1000 * 60 * 60 * 24)) + 1;
  }, [tempRangeStart, tempRangeEnd]);



  // Perjalanan tingkat kelas ananda dari kelas 1 sampai kelas berjalan saat ini
  const effectiveGradeJourney = useMemo(() => {
    return Array.isArray(gradeJourney) ? gradeJourney : [];
  }, [gradeJourney]);

  const selectedGradeSummary = useMemo(() => {
    return effectiveGradeJourney.find((g) => g.grade === selectedGrade);
  }, [effectiveGradeJourney, selectedGrade]);

  const isCurrentGradeActive = (selectedGrade === currentGradeNum || selectedGrade === 'all');

  // Filtered Logs - diurutkan dari yang pertama dihafal (ascending by date)
  const filteredLogs = useMemo(() => {
    let list = [...logs];

    // Filter Kategori Tab
    if (activeTab === 'ziyadah') {
      list = list.filter(isZiyadahLog);
    } else if (activeTab === 'murajaah') {
      list = list.filter(isMurajaahLog);
    } else if (activeTab === 'tilawah') {
      list = list.filter(isTilawahLog);
    }
    // Tab 'all': tampilkan semua jenis (ziyadah + murajaah + tilawah)

    // Filter Periode Waktu di Kelas Aktif
    if (timePeriodFilter !== 'all') {
      list = list.filter((l) => {
        const itemDate = l.record_date || l.date || l.tanggal || l.created_at;
        return matchesTimePeriod(itemDate, timePeriodFilter);
      });
    }

    // Filter Pencarian Teks
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((l) => {
        const surah = (l.hafalan_surah_name || l.surah || l.nama_surah || l.tilawah_text || l.murajaah_text || '').toLowerCase();
        const note = (l.notes_teacher || l.catatan || l.notes_parent || '').toLowerCase();
        const teacher = (l.teacher?.full_name || l.teacher?.nama_lengkap || l.teacher?.name || l.pengampu || '').toLowerCase();
        const unitCls = `${l.unit_name || ''} ${l.class_name || ''}`.toLowerCase();
        return surah.includes(q) || note.includes(q) || teacher.includes(q) || unitCls.includes(q);
      });
    }

    // Urutkan dari yang pertama dihafal (ascending by date)
    list.sort((a, b) => {
      const dA = new Date(a.record_date || a.date || a.tanggal || a.created_at || 0).getTime();
      const dB = new Date(b.record_date || b.date || b.tanggal || b.created_at || 0).getTime();
      return dA - dB;
    });

    return list;
  }, [logs, activeTab, timePeriodFilter, customStartDate, customEndDate, searchQuery]);

  // Group filteredLogs by Surah Name (untuk tampilan kelompok per surat Al-Qur'an)
  const groupedLogsBySurah = useMemo(() => {
    const map = new Map<string, {
      surahKey: string;
      surahName: string;
      surahNumber: number | null;
      juzNumber: number | null;
      logs: any[];
      minAyat: number | null;
      maxAyat: number | null;
      totalAyatCount: number;
      latestDate: string | null;
    }>();

    filteredLogs.forEach((item: any) => {
      const parsed = parseLogSurahAndVerses(item, quranSurahs);
      const isItemMuraj = isMurajaahLog(item);
      const isItemTilaw = isTilawahLog(item);
      const rawName = (
        parsed.surahName ||
        item.hafalan_surah_name ||
        (isItemMuraj ? (item.murajaah_required_surah_name || item.murajaah_text || item.surah || 'Murajaah Mandiri') : null) ||
        (isItemTilaw ? (item.tilawah_text || item.surah || 'Tilawah Mandiri') : null) ||
        item.surah ||
        item.nama_surah ||
        (item.murajaah_text ? 'Murajaah Mandiri' : (item.tilawah_text ? 'Tilawah' : 'Lainnya'))
      ).trim();
      const cleanName = rawName.replace(/^surah\s+/i, '');
      const key = cleanName.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          surahKey: key,
          surahName: cleanName,
          surahNumber: parsed.surahNum || item.hafalan_surah_number || null,
          juzNumber: (() => {
            const sNum = parsed.surahNum || item.hafalan_surah_number;
            const aStart = parsed.aStart || item.hafalan_ayah_start;
            if (sNum) {
              return getQuranJuz(sNum, aStart || 1);
            }
            if (item.calculated_juz) return Number(item.calculated_juz);
            if (item.juz) return Number(item.juz);
            const txt = `${item.murajaah_text || ''} ${item.tilawah_text || ''} ${item.surah || ''}`;
            const m = txt.match(/\bjuz\s*([0-9]{1,2})\b/i);
            return m ? Number(m[1]) : null;
          })(),
          logs: [],
          minAyat: null,
          maxAyat: null,
          totalAyatCount: 0,
          latestDate: null,
        });
      }

      const entry = map.get(key)!;
      entry.logs.push(item);
      if (!entry.juzNumber) {
        const sNum = parsed.surahNum || item.hafalan_surah_number;
        const aStart = parsed.aStart || item.hafalan_ayah_start;
        if (sNum) {
          entry.juzNumber = getQuranJuz(sNum, aStart || 1);
        } else if (item.calculated_juz || item.juz) {
          entry.juzNumber = Number(item.calculated_juz || item.juz);
        }
      }

      if (parsed.aStart !== null && !isNaN(parsed.aStart)) {
        entry.minAyat = entry.minAyat === null ? parsed.aStart : Math.min(entry.minAyat, parsed.aStart);
      }
      if (parsed.aEnd !== null && !isNaN(parsed.aEnd)) {
        entry.maxAyat = entry.maxAyat === null ? parsed.aEnd : Math.max(entry.maxAyat, parsed.aEnd);
      }
      const itemD = item.record_date || item.date || item.tanggal || item.created_at;
      if (itemD) entry.latestDate = itemD;
    });

    return Array.from(map.values()).map((g) => {
      const ayatSpan = (g.minAyat !== null && g.maxAyat !== null && g.maxAyat >= g.minAyat)
        ? (g.maxAyat - g.minAyat + 1)
        : g.logs.reduce((acc, curr) => {
            const start = Number(curr.hafalan_ayah_start ?? curr.ayat_start ?? curr.ayat_mulai);
            const end = Number(curr.hafalan_ayah_end ?? curr.ayat_end ?? curr.ayat_selesai);
            if (start > 0 && end >= start) return acc + (end - start + 1);
            return acc + (Number(curr.jumlah_ayat) || 0);
          }, 0);

      return {
        ...g,
        totalAyatCount: ayatSpan,
      };
    });
  }, [filteredLogs, quranSurahs]);

  const userRoles = user?.roles || [];
  const userPermissions = (user as any)?.permissions || [];
  const hasTahfizhAuth =
    isTahfizhTeacherRole(userRoles) ||
    isMusyrifRole(userRoles) ||
    userPermissions.includes('teacher.tahfizh.view') ||
    userPermissions.includes('tahfizh.view') ||
    userPermissions.includes('tahfizh.monitoring_target');

  const isManagement = isTuRole(userRoles) || isPrincipalRole(userRoles) || isSuperAdminRole(userRoles);
  const canAccessTahfizhWorkspace = hasTahfizhAuth || isManagement;

  const isParentContext = Boolean(
    isParent ||
    route?.params?.child_id ||
    route?.params?.student_id ||
    route?.params?.from_child_portal
  );

  if (canAccessTahfizhWorkspace && !isParentContext) {
    return (
      <TeacherTahfizhWorkspace
        onBack={() => {
          if (navigation?.canGoBack?.()) navigation.goBack();
          else navigation?.navigate('Beranda');
        }}
        initialTab={route?.params?.tab}
      />
    );
  }

  return (
    <View style={styles.rootContainer}>
      {/* 0. STICKY HEADER BERSAMA (top bar + card siswa, sama dengan Tugas/Jadwal/Materi/Nilai) */}
      <StudentStickyHeader
        scrollY={scrollY}
        topInset={topInset}
        title="Tahfizh Al-Qur'an"
        navigation={navigation}
        route={route}
        student={headerStudent}
        user={user}
        childrenList={children}
        onSelectChild={(cid, idx) => {
          setSelectedChildId(cid);
          useActiveChildStore.getState().setActiveChildId(cid);
          setActiveChildIndex(idx);
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
          colors={['#FFFFFF', '#F4FAF7', '#EAF7F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: Math.max(bottomInset + 72, 94) }]}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} progressViewOffset={topInset + 10} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Bar Statis (ketika belum di-scroll) — sama style dengan Tugas/Jadwal/Materi/Nilai */}
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
                  Tahfizh Al-Qur'an
                </Text>
                <View style={styles.heroSubtitleBadge}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={11} color="#D1FAE5" style={{ marginRight: 4 }} />
                  <Text numberOfLines={1} style={styles.heroModuleSubtitle}>
                    {heroFirstName ? `Ananda ${heroFirstName}` : (heroSubtitleFallback || "Setoran & Mutaba'ah Qur'an")}
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
          {/* SECTION 1: DATA SISWA & UNIT PENDIDIKAN (HERO CARD SISWA TERPILIH) */}
          {(children && children.length > 0) ? (
            <Animated.View style={[styles.containerBlock, styles.studentContainerBlock, { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] }]}>
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
          ) : (activeChild || studentInfo) ? (
            <Animated.View style={[styles.containerBlock, styles.studentContainerBlock, { opacity: bodyCardOpacity, transform: [{ translateY: bodyCardTranslateY }] }]}>
              <View style={styles.singleHeroCardContainer}>
                <StudentHeroCard
                  child={activeChild || studentInfo}
                  isSelected={true}
                  isSingleChild={true}
                  showActionButtons={true}
                  cardLabel="Kartu Siswa"
                  calendarLabel="Jadwal"
                  portalLabel="Menu"
                  onPressCard={() => openIdCard(activeChild || studentInfo)}
                  onPressQr={() => openQrCard(activeChild || studentInfo)}
                  onPressWeeklyReport={() => setSelectedWeeklyStudent(activeChild || studentInfo)}
                  onPressNotifications={() => navigation?.navigate('Notifikasi')}
                  onPressCalendar={() => openScheduleForStudent(activeChild || studentInfo)}
                  onPressPortal={() => setSelectedMenuStudent(activeChild || studentInfo)}
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
                const userUnit = String((user as any)?.unit_name || (user as any)?.education_unit?.name || 'Unit Sekolah');
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
                          <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
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
                        <Text style={styles.studentAttrLabel}>Akses</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>Resmi</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Presensi</Text>
                        <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                          {(user as any)?.attendance_today?.status || (user as any)?.attendance_status || kpiData?.attendance_status || 'Hadir'}
                        </Text>
                      </View>
                    </View>

                    {/* Tahfizh Achievement Bar inside Card Pengguna */}
                    <View style={styles.cardTahfizhStatsRow}>
                      <View style={styles.cardTahfizhStatItem}>
                        <View style={styles.cardTahfizhStatIconLabel}>
                          <MaterialCommunityIcons name="book-open-page-variant" size={11} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.cardTahfizhStatLabel}>Total Ayat</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.cardTahfizhStatVal}>{totalAyat} Ayat</Text>
                      </View>
                      <View style={styles.cardTahfizhStatDivider} />
                      <View style={styles.cardTahfizhStatItem}>
                        <View style={styles.cardTahfizhStatIconLabel}>
                          <MaterialCommunityIcons name="book-multiple-outline" size={11} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.cardTahfizhStatLabel}>Total Juz</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.cardTahfizhStatVal}>
                          {Number(tahfizhAchievement?.completed_juz_count ?? tahfizhAchievement?.juz_count ?? 0)} Juz
                        </Text>
                      </View>
                      <View style={styles.cardTahfizhStatDivider} />
                      <View style={styles.cardTahfizhStatItem}>
                        <View style={styles.cardTahfizhStatIconLabel}>
                          <MaterialCommunityIcons name="trophy-outline" size={11} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.cardTahfizhStatLabel}>Progress</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.cardTahfizhStatVal}>{targetProgress}%</Text>
                      </View>
                    </View>
                  </LinearGradient>
                );
              })()}
            </Animated.View>
          ) : null}

          {/* SECTION 2: RINGKASAN CAPAIAN TAHFIZH (HERO KPI GROUP CARD) */}
          <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardEmerald]}>
            {/* Header Card Emerald */}
            <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowEmerald]}>
              <View style={styles.tahfizhGroupCardHeaderLeft}>
                <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxEmerald]}>
                  <MaterialCommunityIcons name="trophy-award" size={16} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#064E3B' }]}>
                    Ringkasan Capaian Tahfizh
                  </Text>
                  <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#059669' }]}>
                    Progres hafalan ananda & target kurikulum
                  </Text>
                </View>
              </View>
              <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeEmerald]}>
                <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#047857' }]}>
                  {targetProgress}% Tercapai
                </Text>
              </View>
            </View>

            <View style={styles.heroKpiRow}>
              {/* Card 1: Progres Hafalan */}
              <View style={styles.heroKpiCard}>
                <View style={styles.progressCircleBox}>
                  <View style={styles.progressCircleRing}>
                    <Text style={styles.progressCircleText}>{targetProgress}%</Text>
                  </View>
                </View>
                <View style={styles.heroKpiContentCol}>
                  <Text numberOfLines={1} style={styles.heroKpiTitle}>Progres Hafalan</Text>
                  <Text numberOfLines={1} style={styles.heroKpiSub}>
                    {targetAyat > 0 ? `${totalAyat}/${targetAyat} Ayat` : `${totalAyat} Ayat`}
                  </Text>
                  <View style={styles.heroProgressBarTrack}>
                    <View style={[styles.heroProgressBarFill, { width: `${Math.min(100, Math.max(5, targetProgress))}%` }]} />
                  </View>
                </View>
              </View>

              {/* Card 2: Target Tahun Ini / Semester */}
              <View style={styles.heroKpiCard}>
                <View style={styles.targetIconBox}>
                  <MaterialCommunityIcons name="bullseye-arrow" size={22} color="#059669" />
                </View>
                <View style={styles.heroKpiContentCol}>
                  <Text numberOfLines={1} style={styles.heroKpiTargetLabel}>{targetPeriodLabel}</Text>
                  <Text numberOfLines={1} style={styles.heroKpiTargetValue}>
                    {targetSemester || (targetAyat > 0 ? `${targetAyat} Ayat` : 'Kurikulum')}
                  </Text>
                  <Text numberOfLines={1} style={styles.heroKpiTargetSub}>
                    {targetAyat > 0
                      ? targetAyat > totalAyat
                        ? `Sisa ${targetAyat - totalAyat} ayat`
                        : 'Target Tercapai'
                      : `Semester ${academicSemester}`}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* SECTION 3: RIWAYAT & LAPORAN TAHFIZH SESUAI TINGKAT KELAS ANANDA */}
          <View style={styles.containerBlock}>
            {/* MAIN SEGMENTED SWITCHER: RIWAYAT SETORAN VS DAFTAR TARGET */}
            <View style={styles.segmentedTabWrapper}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setMainTab('history')}
                style={[
                  styles.segmentedTabItem,
                  mainTab === 'history' && styles.segmentedTabItemActive,
                ]}
              >
                <View style={styles.segmentedTabContentRow}>
                  <MaterialCommunityIcons
                    name="book-clock-outline"
                    size={16}
                    color={mainTab === 'history' ? '#FFFFFF' : '#64748B'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.segmentedTabText,
                      mainTab === 'history' && styles.segmentedTabTextActive,
                    ]}
                  >
                    Riwayat Setoran
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setMainTab('target')}
                style={[
                  styles.segmentedTabItem,
                  mainTab === 'target' && styles.segmentedTabItemActive,
                ]}
              >
                <View style={styles.segmentedTabContentRow}>
                  <MaterialCommunityIcons
                    name="target"
                    size={16}
                    color={mainTab === 'target' ? '#FFFFFF' : '#64748B'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.segmentedTabText,
                      mainTab === 'target' && styles.segmentedTabTextActive,
                    ]}
                  >
                    Target Kurikulum
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {mainTab === 'target' ? (
              /* TAB 2: DAFTAR TARGET KURIKULUM TAHFIZH (GROUP CARD) */
              <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardPurple]}>
                {/* Header Card Purple */}
                <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowPurple]}>
                  <View style={styles.tahfizhGroupCardHeaderLeft}>
                    <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxPurple]}>
                      <MaterialCommunityIcons name="bullseye-arrow" size={16} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#581C87' }]}>
                        Target Kurikulum Tahfizh {activeStudentName ? `"${activeStudentName}"` : ''}
                      </Text>
                      <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#7C3AED' }]}>
                        {[currentGradeLabel, studentUnitName, `Semester ${academicSemester}`].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgePurple]}>
                    <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#6B21A8' }]}>
                      {targetCurriculumList.filter((t) => t.isDone).length}/{targetCurriculumList.length} Tuntas
                    </Text>
                  </View>
                </View>

                {/* Filter Track: Pilihan Juz & Urutan */}
                <View style={{ marginBottom: 6 }}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.juzFilterTrack}
                  >
                    {curriculumJuzOptions.map((opt) => {
                      const isActive = curriculumJuzFilter === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          activeOpacity={0.8}
                          onPress={() => setCurriculumJuzFilter(opt.key)}
                          style={[
                            styles.juzFilterChip,
                            isActive && styles.juzFilterChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.juzFilterChipText,
                              isActive && styles.juzFilterChipTextActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Quick Controls: Sort Order & Count */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 4 }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#6B21A8' }}>
                      Menampilkan {targetCurriculumList.length} Surah
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => setCurriculumSortOrder((prev) => (prev === 'mushaf' ? 'reverse' : 'mushaf'))}
                      style={styles.curriculumSortBtn}
                    >
                      <MaterialCommunityIcons
                        name={curriculumSortOrder === 'mushaf' ? 'sort-numeric-ascending' : 'sort-numeric-descending'}
                        size={14}
                        color="#7C3AED"
                      />
                      <Text style={styles.curriculumSortBtnText}>
                        {curriculumSortOrder === 'mushaf' ? 'Urut: Mushaf (1 → 114)' : 'Urut: Tahfizh (114 → 1)'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Daftar Surah Dikelompokkan & Dapat Diklik untuk Modal Detail */}
                <View style={{ gap: 8, paddingHorizontal: 14, paddingBottom: 10 }}>
                  {targetCurriculumList.map((tItem, tIdx) => {
                    const isDone = Boolean(tItem.isDone);
                    const isMurajaah = Boolean(tItem.isNeedsMurajaah);
                    const isProgress = Boolean(tItem.uniqueAyatCount > 0 && !isDone && !isMurajaah);

                    const cardBg = isDone
                      ? '#F0FDF4'
                      : isMurajaah
                      ? '#FFFBEB'
                      : isProgress
                      ? '#F0F9FF'
                      : '#FFFFFF';

                    const cardBorder = isDone
                      ? '#86EFAC'
                      : isMurajaah
                      ? '#FCD34D'
                      : isProgress
                      ? '#BAE6FD'
                      : '#E2E8F0';

                    const iconBg = isDone
                      ? '#DCFCE7'
                      : isMurajaah
                      ? '#FEF3C7'
                      : isProgress
                      ? '#E0F2FE'
                      : '#F1F5F9';

                    const iconColor = isDone
                      ? '#16A34A'
                      : isMurajaah
                      ? '#D97706'
                      : isProgress
                      ? '#0284C7'
                      : '#64748B';

                    const iconName = isDone
                      ? 'check-circle'
                      : isMurajaah
                      ? 'repeat'
                      : isProgress
                      ? 'book-open-page-variant'
                      : 'book-outline';

                    const titleColor = isDone
                      ? '#065F46'
                      : isMurajaah
                      ? '#92400E'
                      : isProgress
                      ? '#0369A1'
                      : '#1E293B';

                    const subColor = isDone
                      ? '#047857'
                      : isMurajaah
                      ? '#B45309'
                      : isProgress
                      ? '#0284C7'
                      : '#64748B';

                    const progressTrackBg = isDone
                      ? '#DCFCE7'
                      : isMurajaah
                      ? '#FEF3C7'
                      : isProgress
                      ? '#E0F2FE'
                      : '#F1F5F9';

                    const progressFillColor = isDone
                      ? '#10B981'
                      : isMurajaah
                      ? '#F59E0B'
                      : isProgress
                      ? '#0284C7'
                      : '#CBD5E1';

                    const percent = isDone ? 100 : tItem.progressPercent || 0;

                    return (
                      <TouchableOpacity
                        key={String(tItem.nomor || tIdx)}
                        activeOpacity={0.82}
                        onPress={() => setSelectedCurriculumSurah(tItem)}
                        style={[
                          styles.setoranRowCard,
                          styles.curriculumSurahCard,
                          {
                            backgroundColor: cardBg,
                            borderColor: cardBorder,
                            borderWidth: isDone || isMurajaah || isProgress ? 1.5 : 1,
                          },
                        ]}
                      >
                        <View style={[styles.calendarIconBox, { backgroundColor: iconBg }]}>
                          <MaterialCommunityIcons
                            name={iconName}
                            size={20}
                            color={iconColor}
                          />
                        </View>

                        <View style={[styles.setoranInfoCol, { flex: 1 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text numberOfLines={1} style={[styles.setoranSurahText, { color: titleColor, fontWeight: '800' }]}>
                              Surah {tItem.nama}
                            </Text>
                            {tItem.nama_arab ? (
                              <Text style={{ fontSize: 14, fontWeight: '700', color: isDone ? '#059669' : isMurajaah ? '#B45309' : isProgress ? '#0284C7' : '#065F46' }}>
                                {tItem.nama_arab}
                              </Text>
                            ) : null}
                          </View>

                          <Text numberOfLines={1} style={[styles.setoranSubText, { color: subColor }]}>
                            {tItem.ayat} Ayat · {tItem.juzLabel}{tItem.setoranCount > 0 ? ` · ${tItem.setoranCount} Setoran` : ''}
                          </Text>

                          {/* Progress Bar Mini */}
                          <View style={[styles.curriculumMiniProgressBarBg, { backgroundColor: progressTrackBg, height: 5, borderRadius: 3, marginTop: 7 }]}>
                            <View
                              style={[
                                styles.curriculumMiniProgressBarFill,
                                {
                                  width: `${percent}%`,
                                  backgroundColor: progressFillColor,
                                  borderRadius: 3,
                                },
                              ]}
                            />
                          </View>

                          {/* Badge Status Dipindahkan ke Bawah Bar Progress */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                            <View
                              style={[
                                styles.setoranStatusPill,
                                isDone
                                  ? styles.statusBadgeGreen
                                  : isMurajaah
                                  ? styles.statusBadgeOrange
                                  : isProgress
                                  ? { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD', borderWidth: 1 }
                                  : styles.statusBadgeGray,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.setoranStatusText,
                                  isDone
                                    ? styles.statusTextGreen
                                    : isMurajaah
                                    ? styles.statusTextOrange
                                    : isProgress
                                    ? { color: '#0369A1', fontWeight: '700' }
                                    : styles.statusTextGray,
                                ]}
                              >
                                {tItem.statusLabel}
                              </Text>
                            </View>

                            <Text style={{ fontSize: 10.5, fontWeight: '700', color: subColor }}>
                              {isDone
                                ? `${tItem.ayat}/${tItem.ayat} (100%)`
                                : tItem.uniqueAyatCount > 0
                                ? `${tItem.uniqueAyatCount}/${tItem.ayat} Ayat (${tItem.progressPercent}%)`
                                : `0/${tItem.ayat} Ayat (0%)`}
                            </Text>
                          </View>
                        </View>

                        <View style={{ justifyContent: 'center', paddingLeft: 4 }}>
                          <MaterialCommunityIcons name="chevron-right" size={16} color={iconColor} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              /* TAB 1: RIWAYAT SETORAN TAHFIZH */
              <>
            {/* CARD 1: JENJANG & REKAPITULASI KELAS ANANDA (GROUP CARD BLUE - HANYA TAMPIL JIKA ADA RIWAYAT KELAS LAMPAU) */}
            {effectiveGradeJourney.length > 1 && (
              <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardBlue]}>
                <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowBlue]}>
                  <View style={styles.tahfizhGroupCardHeaderLeft}>
                    <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxBlue]}>
                      <MaterialCommunityIcons name="school" size={16} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#0C4A6E' }]}>
                        Jenjang & Rekapitulasi Kelas
                      </Text>
                      <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#0284C7' }]}>
                        {[studentUnitName, 'Pilih jenjang untuk riwayat'].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeBlue]}>
                    <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#0369A1' }]}>
                      {currentGradeNum !== null ? `${currentGradeLabel} Berjalan` : currentGradeLabel}
                    </Text>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.gradeJourneyScrollTrack}
                >
                  {effectiveGradeJourney.map((gItem: any) => {
                    const isSelected = selectedGrade === gItem.grade;
                    const isCurrent = gItem.grade === currentGradeNum;
                    return (
                      <TouchableOpacity
                        key={String(gItem.grade)}
                        activeOpacity={0.8}
                        onPress={() => setSelectedGrade(gItem.grade)}
                        style={[
                          styles.gradeJourneyChip,
                          isSelected && styles.gradeJourneyChipSelected,
                          isCurrent && !isSelected && styles.gradeJourneyChipCurrent,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={isCurrent ? 'school' : 'check-circle'}
                          size={13}
                          color={isSelected ? '#FFFFFF' : isCurrent ? '#059669' : '#10B981'}
                        />
                        <Text
                          style={[
                            styles.gradeJourneyChipText,
                            isSelected && styles.gradeJourneyChipTextSelected,
                          ]}
                        >
                          {gItem.label}
                        </Text>
                        {isCurrent ? (
                          <View style={[styles.activeTagBadge, isSelected && styles.activeTagBadgeSelected]}>
                            <Text style={[styles.activeTagBadgeText, isSelected && styles.activeTagBadgeTextSelected]}>
                              Aktif
                            </Text>
                          </View>
                        ) : (
                          <Text style={[styles.tuntasMiniText, isSelected && styles.tuntasMiniTextSelected]}>
                            Tuntas
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* KONDISIONAL BERDASARKAN KELAS YANG DIPILIH: */}
            {/* JIKA KELAS 1 - 4 (KELAS LAMPAU): HANYA MENAMPILKAN JUMLAH YANG TELAH DITAHFIZH */}
            {!isCurrentGradeActive && selectedGradeSummary ? (
              <View style={styles.pastGradeContainer}>
                <LinearGradient
                  colors={['#ECFDF5', '#D1FAE5', '#F0FDF4']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.pastGradeCard}
                >
                  <View style={styles.pastGradeCardHeader}>
                    <View style={styles.pastGradeBadgeIcon}>
                      <MaterialCommunityIcons name="certificate" size={22} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.pastGradeCardTitle}>
                          Rekap Capaian {selectedGradeSummary.label}
                        </Text>
                        <View style={styles.tuntasBadge}>
                          <MaterialCommunityIcons name="check" size={11} color="#065F46" />
                          <Text style={styles.tuntasBadgeText}>Riwayat Kelas</Text>
                        </View>
                      </View>
                      <Text style={styles.pastGradeCardSub}>
                        {[selectedGradeSummary.class_name, selectedGradeSummary.unit_name].filter(Boolean).join(' · ') || 'Data kelas dari riwayat setoran'}
                      </Text>
                    </View>
                  </View>

                  {/* JUMLAH YANG TELAH DI-TAFHIZH (MAIN HIGHLIGHT) */}
                  <View style={styles.highlightTahfizhBox}>
                    <View style={styles.highlightTahfizhHeaderRow}>
                      <MaterialCommunityIcons name="book-open-page-variant" size={16} color="#047857" />
                      <Text style={styles.highlightTahfizhLabel}>
                        JUMLAH YANG TELAH DI-TAFHIZH
                      </Text>
                    </View>
                    <View style={styles.highlightTahfizhValueRow}>
                      <Text style={styles.highlightTahfizhNumber}>
                        {selectedGradeSummary.total_ayat}
                      </Text>
                      <Text style={styles.highlightTahfizhUnit}>Ayat Qur'an</Text>
                    </View>
                    <Text style={styles.highlightTahfizhNote}>
                      Target tuntas pada jenjang {selectedGradeSummary.label}
                    </Text>
                  </View>

                  {/* DETAIL REKAP METRICS */}
                  <View style={styles.pastGradeMetricsGrid}>
                    <View style={styles.pastGradeMetricCell}>
                      <View style={styles.pastGradeCellIconWrap}>
                        <MaterialCommunityIcons name="book-check-outline" size={16} color="#0D9488" />
                      </View>
                      <Text style={styles.pastGradeCellLabel}>Target Surah / Juz</Text>
                      <Text style={styles.pastGradeCellVal} numberOfLines={2}>
                        {selectedGradeSummary.target_surah || '-'}
                      </Text>
                    </View>

                    <View style={styles.pastGradeMetricCell}>
                      <View style={styles.pastGradeCellIconWrap}>
                        <MaterialCommunityIcons name="star-outline" size={16} color="#D97706" />
                      </View>
                      <Text style={styles.pastGradeCellLabel}>Predikat Kelulusan</Text>
                      <Text style={[styles.pastGradeCellVal, { color: '#059669', fontWeight: '700' }]}>
                        {selectedGradeSummary.predikat || '-'}
                      </Text>
                    </View>

                    <View style={styles.pastGradeMetricCell}>
                      <View style={styles.pastGradeCellIconWrap}>
                        <MaterialCommunityIcons name="counter" size={16} color="#6366F1" />
                      </View>
                      <Text style={styles.pastGradeCellLabel}>Frekuensi Setoran</Text>
                      <Text style={styles.pastGradeCellVal}>
                        {selectedGradeSummary.total_setoran || 0}x Setoran
                      </Text>
                    </View>

                    <View style={styles.pastGradeMetricCell}>
                      <View style={styles.pastGradeCellIconWrap}>
                        <MaterialCommunityIcons name="shield-check-outline" size={16} color="#059669" />
                      </View>
                      <Text style={styles.pastGradeCellLabel}>Status Kurikulum</Text>
                      <Text style={[styles.pastGradeCellVal, { color: '#166534' }]}>
                        {selectedGradeSummary.status_label || '-'}
                      </Text>
                    </View>
                  </View>

                  {/* Notice & Back Button to Active Grade */}
                  <View style={styles.pastGradeNotice}>
                    <MaterialCommunityIcons name="information" size={15} color="#065F46" />
                    <Text style={styles.pastGradeNoticeText}>
                      Riwayat ini berasal dari setoran yang tersimpan untuk {selectedGradeSummary.label}. Filter periode tetap tersedia pada kelas berjalan ({currentGradeLabel}).
                    </Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setSelectedGrade(currentGradeNum)}
                    style={styles.pastGradeReturnBtn}
                  >
                    <MaterialCommunityIcons name="arrow-left-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.pastGradeReturnBtnText}>
                      Buka Laporan Harian {currentGradeLabel} (Aktif)
                    </Text>
                  </TouchableOpacity>
                </LinearGradient>

                <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardEmerald, { marginTop: 14 }]}>
                  <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowEmerald]}>
                    <View style={styles.tahfizhGroupCardHeaderLeft}>
                      <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxEmerald]}>
                        <MaterialCommunityIcons name="history" size={16} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#064E3B' }]}>
                          Riwayat Setoran {selectedGradeSummary.label}
                        </Text>
                        <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#059669' }]}>
                          {selectedGradeSummary.total_setoran || 0} setoran dari database
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeEmerald]}>
                      <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#047857' }]}>
                        {selectedGradeSummary.total_ayat} Ayat
                      </Text>
                    </View>
                  </View>

                  {Array.isArray(selectedGradeSummary.logs) && selectedGradeSummary.logs.length > 0 ? (
                    selectedGradeSummary.logs.map((item: any, idx: number) => {
                      const title = item.hafalan_surah_name || item.tilawah_text || item.murajaah_text || 'Setoran Tahfizh';
                      const historyAyatStart = item.hafalan_ayah_start ?? item.ayat_start;
                      const historyAyatEnd = item.hafalan_ayah_end ?? item.ayat_end;
                      const surahNameClean = title.replace(/^surah\s+/i, '');
                      const displayTitle = historyAyatStart && historyAyatEnd
                        ? `${surahNameClean} (${historyAyatStart}-${historyAyatEnd})`
                        : surahNameClean;
                      const teacherName =
                        item.teacher?.full_name ||
                        item.teacher?.name ||
                        item.signature_teacher ||
                        '';
                      const itemDate = item.record_date || item.created_at;

                      return (
                        <TouchableOpacity
                          key={String(item.id || idx)}
                          activeOpacity={0.85}
                          onPress={() => setSelectedLogDetail(item)}
                          style={styles.setoranRowCard}
                        >
                          <View style={styles.calendarIconBox}>
                            <MaterialCommunityIcons name="book-open-page-variant-outline" size={20} color="#059669" />
                          </View>
                          <View style={styles.setoranInfoCol}>
                            <Text numberOfLines={1} style={styles.setoranSurahText}>
                              {displayTitle}
                            </Text>
                            <View style={styles.setoranMetaRow}>
                              <Text numberOfLines={1} style={styles.setoranSubText}>
                                {teacherName ? `${teacherName} · ` : ''}{formatDate(itemDate)}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.setoranRightCol}>
                            <View style={[styles.setoranStatusPill, (() => {
                              const s = (item.status || item.nilai || item.predikat || '').toLowerCase();
                              const j = (item.jenis_setoran || item.type || '').toLowerCase();
                              if (j === 'murajaah' || j === 'pengulangan') return styles.statusBadgeBlue;
                              if (s.includes('pending') || s.includes('tunggu') || s === 'submitted') return styles.statusBadgeBlue;
                              if (s.includes('ulang') || s.includes('kurang')) return styles.statusBadgeOrange;
                              return styles.statusBadgeGreen;
                            })()]}
                            >
                              <Text style={[styles.setoranStatusText, (() => {
                                const s = (item.status || item.nilai || item.predikat || '').toLowerCase();
                                const j = (item.jenis_setoran || item.type || '').toLowerCase();
                                if (j === 'murajaah' || j === 'pengulangan') return styles.statusTextBlue;
                                if (s.includes('pending') || s.includes('tunggu') || s === 'submitted') return styles.statusTextBlue;
                                if (s.includes('ulang') || s.includes('kurang')) return styles.statusTextOrange;
                                return styles.statusTextGreen;
                              })()]}
                              >
                                {(() => {
                                  const j = (item.jenis_setoran || item.type || '').toLowerCase();
                                  const s = (item.status || item.nilai || item.predikat || '').toLowerCase();
                                  if (j === 'murajaah' || j === 'pengulangan') return 'Murajaah';
                                  if (j === 'tilawah') return 'Tilawah';
                                  if (s.includes('pending') || s.includes('tunggu') || s === 'submitted') return 'Verifikasi';
                                  if (s.includes('ulang') || s.includes('kurang')) return 'Perlu Ulang';
                                  return 'Lancar';
                                })()}
                              </Text>
                            </View>
                          </View>
                          <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <EmptyStateCard
                      icon="history"
                      title="Belum Ada Riwayat Setoran"
                      description="Tidak ada setoran database yang terhubung dengan kelas ini."
                    />
                  )}
                </View>
              </View>
            ) : (
              <>
                {/* CARD 2: KATEGORI & JENIS SETORAN (GROUP CARD INDIGO) */}
                <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardIndigo]}>
                  <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowIndigo]}>
                    <View style={styles.tahfizhGroupCardHeaderLeft}>
                      <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxIndigo]}>
                        <MaterialCommunityIcons name="bookmark-multiple" size={16} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#312E81' }]}>
                          Kategori & Jenis Setoran
                        </Text>
                        <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#4F46E5' }]}>
                          Pilih filter jenis hafalan ananda
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeIndigo]}>
                      <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#4338CA' }]}>
                        {activeTab === 'all' ? 'Semua' : activeTab === 'ziyadah' ? 'Ziyadah' : activeTab === 'murajaah' ? 'Murajaah' : 'Tilawah'}
                      </Text>
                    </View>
                  </View>

                  {/* 4 Card Tabs Scroll Kiri Kanan */}
                  <ScrollView
                    ref={tabCardScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabCardScrollTrack}
                    scrollEventThrottle={16}
                    onScroll={(event) => {
                      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
                      setActiveTabScrollIndex(
                        contentOffset.x + layoutMeasurement.width >= contentSize.width - 8
                          ? tabCardItems.length - 1
                          : closestScrollIndex(contentOffset.x, tabCardOffsetsRef.current)
                      );
                    }}
                  >
                    {tabCardItems.map((tabItem, index) => {
                      const isActive = activeTab === tabItem.key;
                      return (
                        <TouchableOpacity
                          key={tabItem.key}
                          activeOpacity={0.85}
                          onLayout={(event) => {
                            tabCardOffsetsRef.current[index] = event.nativeEvent.layout.x;
                          }}
                          onPress={() => {
                            setActiveTab(tabItem.key);
                            setActiveTabScrollIndex(index);
                            tabCardScrollRef.current?.scrollTo({
                              x: tabCardOffsetsRef.current[index] || 0,
                              animated: true,
                            });
                          }}
                          style={[styles.tabCardItem, isActive && styles.tabCardItemActive]}
                        >
                          <View style={styles.tabCardTopRow}>
                            <View style={[styles.tabCardIconWrap, isActive && styles.tabCardIconWrapActive]}>
                              <MaterialCommunityIcons
                                name={tabItem.icon as any}
                                size={18}
                                color={isActive ? '#FFFFFF' : '#18A165'}
                              />
                            </View>
                            <View style={[styles.tabCardCountBadge, isActive && styles.tabCardCountBadgeActive]}>
                              <Text style={[styles.tabCardCountText, isActive && styles.tabCardCountTextActive]}>
                                {tabItem.count}
                              </Text>
                            </View>
                          </View>
                          <Text numberOfLines={1} style={[styles.tabCardLabel, isActive && styles.tabCardLabelActive]}>
                            {tabItem.label}
                          </Text>
                          <Text numberOfLines={1} style={[styles.tabCardSub, isActive && styles.tabCardSubActive]}>
                            {tabItem.sub}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.carouselDotsRow}>
                    {tabCardItems.map((item, index) => (
                      <TouchableOpacity
                        key={`tab-dot-${item.key}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Geser ke kartu ${item.label}`}
                        onPress={() => {
                          setActiveTabScrollIndex(index);
                          tabCardScrollRef.current?.scrollTo({
                            x: tabCardOffsetsRef.current[index] || 0,
                            animated: true,
                          });
                        }}
                        style={[styles.carouselDot, activeTabScrollIndex === index && styles.carouselDotActive]}
                      />
                    ))}
                  </View>
                </View>

                {/* CARD 3: PETUNJUK PENGULANGAN MURAJAAH (GROUP CARD TEAL) */}
                {activeTab === 'murajaah' && (
                  <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardTeal]}>
                    <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowTeal]}>
                      <View style={styles.tahfizhGroupCardHeaderLeft}>
                        <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxTeal]}>
                          <MaterialCommunityIcons name="book-open-page-variant" size={16} color="#FFFFFF" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#134E4A' }]}>
                            Petunjuk Pengulangan (Murajaah)
                          </Text>
                          <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#0D9488' }]}>
                            Langkah menyimak & menyetor hafalan di rumah
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeTeal]}>
                        <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#0F766E' }]}>
                          4 Langkah
                        </Text>
                      </View>
                    </View>

                    <View style={styles.instructionStepsList}>
                      <View style={styles.instructionStepItem}>
                        <View style={styles.stepBadge}>
                          <Text style={styles.stepBadgeText}>1</Text>
                        </View>
                        <Text style={styles.stepText}>
                          <Text style={{ fontWeight: '700', color: '#065F46' }}>Pilih Kartu Riwayat:</Text> Klik salah satu card di bawah untuk membuka surah dan ayat yang perlu diulang.
                        </Text>
                      </View>

                      <View style={styles.instructionStepItem}>
                        <View style={styles.stepBadge}>
                          <Text style={styles.stepBadgeText}>2</Text>
                        </View>
                        <Text style={styles.stepText}>
                          <Text style={{ fontWeight: '700', color: '#065F46' }}>Simak Teks Mushaf:</Text> Buka mushaf ayat pada modal untuk menyimak bacaan ananda secara langsung.
                        </Text>
                      </View>

                      <View style={styles.instructionStepItem}>
                        <View style={styles.stepBadge}>
                          <Text style={styles.stepBadgeText}>3</Text>
                        </View>
                        <Text style={styles.stepText}>
                          <Text style={{ fontWeight: '700', color: '#065F46' }}>Ulangi Bersama:</Text> Dampingi ananda mengulang hafalan minimal 3 kali hingga lancar dan mutqin.
                        </Text>
                      </View>

                      <View style={styles.instructionStepItem}>
                        <View style={styles.stepBadge}>
                          <Text style={styles.stepBadgeText}>4</Text>
                        </View>
                        <Text style={styles.stepText}>
                          <Text style={{ fontWeight: '700', color: '#065F46' }}>Kirim Laporan:</Text> Simpan laporan agar pengulangan tercatat dan diteruskan ke Guru untuk verifikasi.
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* CARD 4: TUGAS PENGULANGAN DI RUMAH DARI USTADZ (GROUP CARD AMBER) */}
                {pendingHomeMurajaah && (
                  <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardAmber]}>
                    <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowAmber]}>
                      <View style={styles.tahfizhGroupCardHeaderLeft}>
                        <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxAmber]}>
                          <MaterialCommunityIcons name="clipboard-alert-outline" size={16} color="#FFFFFF" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#78350F' }]}>
                            Tugas Pengulangan di Rumah
                          </Text>
                          <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#D97706' }]}>
                            Instruksi khusus dari Guru / Ustadz
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeAmber]}>
                        <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#B45309' }]}>
                          {pendingHomeMurajaah.status === 'submitted_by_parent' ? 'Menunggu Verifikasi' : 'Wajib Diulang'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.activeMurajaahTaskTitle}>
                      Surah {pendingHomeMurajaah.surah_name} (Ayat {pendingHomeMurajaah.ayat_start} - {pendingHomeMurajaah.ayat_end})
                    </Text>
                    <Text style={styles.activeMurajaahTaskDesc}>
                      {pendingHomeMurajaah.notes_teacher || 'Ustadz menugaskan pengulangan hafalan mandiri di rumah bersama orang tua agar hafalan ananda semakin mutqin.'}
                    </Text>
                    {pendingHomeMurajaah.status !== 'submitted_by_parent' ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.activeMurajaahTaskBtn}
                        onPress={() => {
                          openInputMurajaahModal({
                            record_date: pendingHomeMurajaah.record_date,
                            surah_number: pendingHomeMurajaah.surah_number,
                            surah_name: pendingHomeMurajaah.surah_name,
                            ayat_start: pendingHomeMurajaah.ayat_start,
                            ayat_end: pendingHomeMurajaah.ayat_end,
                            notes_parent: `Pengulangan di rumah Surah ${pendingHomeMurajaah.surah_name} (Ayat ${pendingHomeMurajaah.ayat_start}-${pendingHomeMurajaah.ayat_end})`,
                          }, true);
                        }}
                      >
                        <MaterialCommunityIcons name="book-check-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.activeMurajaahTaskBtnText}>Lakukan & Kirim Setoran Murajaah</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.activeMurajaahSentBox}>
                        <MaterialCommunityIcons name="clock-check-outline" size={16} color="#0284C7" />
                        <Text style={styles.activeMurajaahSentText}>
                          Alhamdulillah, laporan pengulangan sudah dikirim ke Ustadz. Menunggu verifikasi.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* CARD 5: DAFTAR CATATAN & RIWAYAT SETORAN (GROUP CARD EMERALD) */}
                <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardEmerald]}>
                  {/* Header Card Emerald */}
                  <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowEmerald]}>
                    <View style={styles.tahfizhGroupCardHeaderLeft}>
                      <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxEmerald]}>
                        <MaterialCommunityIcons name="book-clock-outline" size={16} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#064E3B' }]}>
                          Daftar Catatan & Riwayat Setoran
                        </Text>
                        <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#059669' }]}>
                          Riwayat hafalan harian, nilai, dan evaluasi guru
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeEmerald]}>
                      <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#047857' }]}>
                        {filteredLogs.length} Setoran
                      </Text>
                    </View>
                  </View>

                  {/* Search Input Bar */}
                  <View style={styles.searchBarBox}>
                    <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Cari surah, tanggal, atau penguji..."
                      placeholderTextColor="#94A3B8"
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* FILTER WAKTU: HARIAN, MINGGUAN, BULANAN, SEMESTER menurut Unit Pendidikan Ananda */}
                  <View style={styles.filterGroupContainer}>
                    <View style={styles.filterRowWrapper}>
                      <View style={styles.filterHeaderRow}>
                        <View style={styles.filterHeaderLeft}>
                          <View style={styles.filterHeaderIconBox}>
                            <MaterialCommunityIcons name="filter-variant" size={13} color="#059669" />
                          </View>
                          <Text style={styles.filterSectionLabel} numberOfLines={1}>
                            Filter Setoran {currentGradeLabel}
                          </Text>
                        </View>
                        {timePeriodFilter !== 'all' && (
                          <TouchableOpacity
                            onPress={() => {
                              setTimePeriodFilter('all');
                              setCustomStartDate(null);
                              setCustomEndDate(null);
                            }}
                            style={styles.resetMiniBtn}
                          >
                            <Text style={styles.resetMiniBtnText}>Reset Filter</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <ScrollView
                        ref={filterScrollRef}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterChipTrack}
                        scrollEventThrottle={16}
                        onScroll={(event) => {
                          const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
                          setActiveFilterScrollIndex(
                            contentOffset.x + layoutMeasurement.width >= contentSize.width - 8
                              ? timeFilterItems.length - 1
                              : closestScrollIndex(contentOffset.x, filterOffsetsRef.current)
                          );
                        }}
                      >
                        {timeFilterItems.map((f, index) => {
                          const isSel = timePeriodFilter === f.key;
                          return (
                            <TouchableOpacity
                              key={f.key}
                              activeOpacity={0.8}
                              onLayout={(event) => {
                                filterOffsetsRef.current[index] = event.nativeEvent.layout.x;
                              }}
                              onPress={() => {
                                if (f.key === 'custom') {
                                  openDateRangeModal();
                                } else {
                                  setTimePeriodFilter(f.key);
                                  setCustomStartDate(null);
                                  setCustomEndDate(null);
                                }
                                setActiveFilterScrollIndex(index);
                                filterScrollRef.current?.scrollTo({
                                  x: filterOffsetsRef.current[index] || 0,
                                  animated: true,
                                });
                              }}
                              style={[styles.filterChipItem, isSel && styles.filterChipItemActive]}
                            >
                              <MaterialCommunityIcons
                                name={f.icon as any}
                                size={13}
                                color={isSel ? '#FFFFFF' : '#059669'}
                              />
                              <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                                {f.label}
                              </Text>
                              {f.key === 'custom' && isSel && (
                                <MaterialCommunityIcons
                                  name="pencil"
                                  size={11}
                                  color="#FFFFFF"
                                  style={{ marginLeft: 2 }}
                                />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>

                    {/* Active Filter Summary Bar */}
                    {(timePeriodFilter !== 'all' || searchQuery.trim().length > 0) && (
                      <View style={styles.activeFilterSummaryRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                          <MaterialCommunityIcons name="filter-check" size={14} color="#166534" />
                          <Text numberOfLines={1} style={styles.activeFilterSummaryText}>
                            Ditemukan {filteredLogs.length} riwayat setoran
                            {timePeriodFilter !== 'all'
                              ? ` · ${
                                  timePeriodFilter === 'today'
                                    ? 'Harian (Hari Ini)'
                                    : timePeriodFilter === 'week'
                                    ? 'Mingguan (Pekan Ini)'
                                    : timePeriodFilter === 'month'
                                    ? 'Bulanan (Bulan Ini)'
                                    : timePeriodFilter === 'semester'
                                    ? 'Semester Berjalan'
                                    : timePeriodFilter === 'custom'
                                    ? (customStartDate && customEndDate
                                        ? (customStartDate === customEndDate
                                            ? `Tanggal (${formatDate(customStartDate)})`
                                            : `Rentang (${formatShortDate(customStartDate)} – ${formatShortDate(customEndDate)})`)
                                        : 'Rentang Tanggal')
                                    : 'Filter Kustom'
                                }`
                              : ''}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            setTimePeriodFilter('all');
                            setCustomStartDate(null);
                            setCustomEndDate(null);
                            setSearchQuery('');
                          }}
                          style={styles.resetFilterBtn}
                        >
                          <MaterialCommunityIcons name="refresh" size={12} color="#065F46" />
                          <Text style={styles.resetFilterBtnText}>Reset</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                {/* View Mode Toggle: Grup per Surat vs Urut Waktu */}
                {filteredLogs.length > 0 && (
                  <View style={styles.viewModeToggleContainer}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setIsGroupedBySurah(true)}
                      style={[styles.viewModeTabBtn, isGroupedBySurah && styles.viewModeTabBtnActive]}
                    >
                      <MaterialCommunityIcons
                        name="book-open-page-variant"
                        size={15}
                        color={isGroupedBySurah ? '#FFFFFF' : '#047857'}
                      />
                      <Text style={[styles.viewModeTabText, isGroupedBySurah && styles.viewModeTabTextActive]}>
                        Grup per Surat ({groupedLogsBySurah.length})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setIsGroupedBySurah(false)}
                      style={[styles.viewModeTabBtn, !isGroupedBySurah && styles.viewModeTabBtnActive]}
                    >
                      <MaterialCommunityIcons
                        name="clock-time-four-outline"
                        size={15}
                        color={!isGroupedBySurah ? '#FFFFFF' : '#047857'}
                      />
                      <Text style={[styles.viewModeTabText, !isGroupedBySurah && styles.viewModeTabTextActive]}>
                        Semua Riwayat ({filteredLogs.length})
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* List of Setoran Cards */}
                {loading && !refreshing ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator size="small" color="#18A165" />
                    <Text style={styles.loadingText}>Memuat riwayat setoran dari database...</Text>
                  </View>
                ) : filteredLogs.length === 0 ? (
                  <EmptyStateCard
                    icon="book-open-page-variant-outline"
                    title="Belum Ada Riwayat Setoran"
                    description="Catatan setoran tahfizh ananda akan otomatis muncul di sini."
                  />
                ) : isGroupedBySurah ? (
                  /* 1. TAMPILAN GRUP PER SURAT AL-QUR'AN DENGAN WARNA BACKGROUND HARMONIS */
                  <View style={{ gap: 11 }}>
                    {groupedLogsBySurah.map((group, gIdx) => {
                      const isCollapsed = Boolean(collapsedSurahs[group.surahKey]);
                      const theme = getSurahTheme(group, activeTab);
                      return (
                        <View
                          key={group.surahKey}
                          style={[
                            styles.surahGroupCard,
                            {
                              borderColor: theme.cardBorder,
                              borderLeftWidth: 5,
                              borderLeftColor: theme.accent,
                            },
                          ]}
                        >
                          {/* Header Kelompok Surat (Klik untuk buka/tutup rincian) */}
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => toggleSurahCollapse(group.surahKey)}
                            style={[
                              styles.surahGroupHeaderRow,
                              {
                                backgroundColor: theme.headerBg,
                                borderBottomColor: theme.cardBorder,
                              },
                            ]}
                          >
                            <View style={styles.surahGroupHeaderLeft}>
                              <View
                                style={[
                                  styles.surahGroupNumberCircle,
                                  {
                                    backgroundColor: theme.badgeBg,
                                    borderColor: theme.accent,
                                  },
                                ]}
                              >
                                {group.surahNumber ? (
                                  <Text style={[styles.surahGroupNumberCircleText, { color: theme.badgeText }]}>
                                    {group.surahNumber}
                                  </Text>
                                ) : (
                                  <MaterialCommunityIcons name="book-open-variant" size={16} color={theme.badgeText} />
                                )}
                              </View>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                {/* Baris 1: Nama Surah */}
                                <Text style={[styles.surahGroupNameText, { color: theme.titleColor }]} numberOfLines={1}>
                                  {/^(surah|murajaah|tilawah|juz|qs\.)/i.test(group.surahName) ? group.surahName : `Surah ${group.surahName}`}
                                </Text>

                                {/* Baris 2: Rentang Ayat */}
                                <Text style={[styles.surahGroupSubText, { color: theme.subTextColor, marginTop: 2 }]} numberOfLines={1}>
                                  {group.minAyat && group.maxAyat ? `Ayat ${group.minAyat}–${group.maxAyat}` : ''}
                                  {group.totalAyatCount > 0 ? `${group.minAyat && group.maxAyat ? ' · ' : ''}${group.totalAyatCount} Ayat` : ''}
                                </Text>

                                {/* Baris 3: Badge Juz dan Badge Setoran di bawah rentang ayat */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                                  {group.juzNumber ? (
                                    <View style={styles.juzMiniBadge}>
                                      <Text style={styles.juzMiniBadgeText}>Juz {group.juzNumber}</Text>
                                    </View>
                                  ) : null}
                                  <View
                                    style={[
                                      styles.surahTotalPill,
                                      {
                                        backgroundColor: theme.pillBg,
                                        borderColor: theme.pillBorder,
                                      },
                                    ]}
                                  >
                                    <Text style={[styles.surahTotalPillText, { color: theme.pillText }]}>
                                      {group.logs.length} Setoran
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            </View>

                            <View style={styles.surahGroupHeaderRight}>
                              <MaterialCommunityIcons
                                name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                                size={22}
                                color={theme.iconColor}
                              />
                            </View>
                          </TouchableOpacity>

                          {/* Rincian Baris Setoran pada Surat ini */}
                          {!isCollapsed && (
                            <View style={styles.surahGroupBody}>
                              {group.logs.map((item: any, lIdx: number) => {
                                const logJenis = getLogJenis(item);
                                const isMurajaah = logJenis === 'murajaah';
                                const isTilawah = logJenis === 'tilawah';
                                const parsed = parseLogSurahAndVerses(item, quranSurahs);
                                const specificAyatStart = parsed.aStart;
                                const specificAyatEnd = parsed.aEnd;
                                const itemDate = item.record_date || item.date || item.tanggal || item.created_at;
                                const teacherName =
                                  item.teacher?.full_name ||
                                  item.teacher?.nama_lengkap ||
                                  item.teacher?.name ||
                                  item.penguji ||
                                  item.pengampu ||
                                  item.signature_teacher ||
                                  '-';

                                const ayatLabel = specificAyatStart && specificAyatEnd
                                  ? `Ayat ${specificAyatStart} – ${specificAyatEnd}`
                                  : (item.murajaah_lembar ? `${item.murajaah_lembar} Lembar Murajaah` : (item.murajaah_text || item.tilawah_text || item.catatan || 'Setoran Hafalan'));

                                let statusBadgeStyle = styles.statusBadgeGreen;
                                let statusTextStyle = styles.statusTextGreen;
                                let statusLabel = 'Lancar';
                                const rawStatus = (item.status || item.nilai || item.predikat || '').toLowerCase();

                                if (isMurajaah) {
                                  if (rawStatus.includes('pending') || rawStatus.includes('menunggu') || rawStatus === 'submitted') {
                                    statusBadgeStyle = styles.statusBadgeBlue;
                                    statusTextStyle = styles.statusTextBlue;
                                    statusLabel = 'Verifikasi';
                                  } else {
                                    statusBadgeStyle = styles.statusBadgeRed;
                                    statusTextStyle = styles.statusTextRed;
                                    statusLabel = 'Murajaah';
                                  }
                                } else if (isTilawah) {
                                  statusBadgeStyle = styles.statusBadgeBlue;
                                  statusTextStyle = styles.statusTextBlue;
                                  statusLabel = 'Tilawah';
                                } else {
                                  const zRawNilai = (item.nilai || item.predikat || '').toLowerCase();
                                  if (isSetoranNeedsMurajaah(item)) {
                                    // Merah HANYA jika ada pengulangan
                                    statusBadgeStyle = styles.statusBadgeRed;
                                    statusTextStyle = styles.statusTextRed;
                                    statusLabel = 'Perlu Ulang';
                                  } else if (zRawNilai.includes('mumtaz') || zRawNilai.includes('mutqin')) {
                                    statusBadgeStyle = styles.statusBadgeGreen;
                                    statusTextStyle = styles.statusTextGreen;
                                    statusLabel = zRawNilai.includes('mutqin') ? 'Mutqin' : 'Mumtaz';
                                  } else {
                                    // Hijau untuk lancar
                                    statusBadgeStyle = styles.statusBadgeGreen;
                                    statusTextStyle = styles.statusTextGreen;
                                    statusLabel = 'Lancar';
                                  }
                                }

                                const handleCardPress = () => {
                                  if (activeTab === 'murajaah' || isMurajaah) {
                                    openInputMurajaahModal(item);
                                  } else {
                                    setSelectedLogDetail(item);
                                  }
                                };

                                return (
                                  <TouchableOpacity
                                    key={String(item.id || lIdx)}
                                    activeOpacity={0.8}
                                    onPress={handleCardPress}
                                    style={[
                                      styles.surahSubItemRow,
                                      lIdx === group.logs.length - 1 && { borderBottomWidth: 0 },
                                    ]}
                                  >
                                    <View style={styles.surahSubItemLeft}>
                                      <MaterialCommunityIcons
                                        name={isMurajaah ? 'book-refresh-outline' : (isTilawah ? 'book-open-outline' : 'check-circle-outline')}
                                        size={15}
                                        color={isMurajaah ? '#E11D48' : (isTilawah ? '#0284C7' : '#059669')}
                                      />
                                    </View>

                                    <View style={styles.surahSubItemInfo}>
                                      <Text style={styles.surahSubItemAyat} numberOfLines={1}>
                                        {ayatLabel}
                                      </Text>
                                      <Text style={styles.surahSubItemMeta} numberOfLines={1}>
                                        {teacherName && teacherName !== '-' ? `${teacherName} · ` : ''}{formatDate(itemDate)}
                                      </Text>
                                    </View>

                                    <View style={[styles.setoranStatusPill, statusBadgeStyle, { marginRight: 6 }]}>
                                      <Text style={[styles.setoranStatusText, statusTextStyle]}>
                                        {statusLabel}
                                      </Text>
                                    </View>

                                    <MaterialCommunityIcons name="chevron-right" size={16} color="#94A3B8" />
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
                  /* 2. TAMPILAN URUT WAKTU (FLAT LIST CHRONOLOGICAL) */
                  <View style={{ gap: 10 }}>
                    {filteredLogs.map((item: any, idx: number) => {
                      const logJenis = getLogJenis(item);
                      const isZiyadah = logJenis === 'ziyadah';
                      const isMurajaah = logJenis === 'murajaah';
                      const isTilawah = logJenis === 'tilawah';
                      const parsed = parseLogSurahAndVerses(item, quranSurahs);
                      const specificAyatStart = parsed.aStart;
                      const specificAyatEnd = parsed.aEnd;

                      const surahTitle =
                        isTilawah
                          ? (item.tilawah_text || 'Tilawah Mandiri')
                          : isMurajaah
                          ? (parsed.surahName ? `Surah ${parsed.surahName}` : (item.murajaah_text || 'Murajaah'))
                          : (isZiyadah && parsed.surahName
                              ? `Surah ${parsed.surahName}`
                              : (item.tilawah_text || item.murajaah_text || item.surah || 'Setoran Tahfizh'));

                      const itemDate = item.record_date || item.date || item.tanggal || item.created_at;
                      const teacherName =
                        item.teacher?.full_name ||
                        item.teacher?.nama_lengkap ||
                        item.teacher?.name ||
                        item.penguji ||
                        item.pengampu ||
                        item.signature_teacher ||
                        '-';

                      const surahNameClean = (parsed.surahName || item.hafalan_surah_name || item.surah || 'Setoran Tahfizh').replace(/^surah\s+/i, '');
                      const displayTitle = isZiyadah && specificAyatStart && specificAyatEnd
                        ? `${surahNameClean} (${specificAyatStart}-${specificAyatEnd})`
                        : surahTitle;

                      // Tentukan status badge berdasarkan field status dari API
                      let statusBadgeStyle = styles.statusBadgeGreen;
                      let statusTextStyle = styles.statusTextGreen;
                      let statusLabel = 'Lancar';
                      const rawStatus = (item.status || item.nilai || item.predikat || '').toLowerCase();

                      if (isMurajaah) {
                        if (rawStatus.includes('pending') || rawStatus.includes('menunggu') || rawStatus.includes('tunggu') || rawStatus === 'submitted') {
                          statusBadgeStyle = styles.statusBadgeBlue;
                          statusTextStyle = styles.statusTextBlue;
                          statusLabel = 'Menunggu Verifikasi';
                        } else {
                          statusBadgeStyle = styles.statusBadgeRed;
                          statusTextStyle = styles.statusTextRed;
                          statusLabel = 'Murajaah';
                        }
                      } else if (isTilawah) {
                        statusBadgeStyle = styles.statusBadgeBlue;
                        statusTextStyle = styles.statusTextBlue;
                        statusLabel = 'Tilawah';
                      } else {
                        const zRawNilai = (item.nilai || item.predikat || '').toLowerCase();
                        if (isSetoranNeedsMurajaah(item)) {
                          // Merah HANYA jika ada pengulangan
                          statusBadgeStyle = styles.statusBadgeRed;
                          statusTextStyle = styles.statusTextRed;
                          statusLabel = 'Perlu Ulang';
                        } else if (zRawNilai.includes('mumtaz') || zRawNilai.includes('mutqin')) {
                          statusBadgeStyle = styles.statusBadgeGreen;
                          statusTextStyle = styles.statusTextGreen;
                          statusLabel = zRawNilai.includes('mutqin') ? 'Mutqin' : 'Mumtaz';
                        } else {
                          // Hijau untuk lancar
                          statusBadgeStyle = styles.statusBadgeGreen;
                          statusTextStyle = styles.statusTextGreen;
                          statusLabel = 'Lancar';
                        }
                      }

                      const handleCardPress = () => {
                        if (activeTab === 'murajaah' || isMurajaah) {
                          openInputMurajaahModal(item);
                        } else {
                          setSelectedLogDetail(item);
                        }
                      };

                      return (
                        <TouchableOpacity
                          key={String(item.id || idx)}
                          activeOpacity={0.85}
                          onPress={handleCardPress}
                          style={styles.setoranRowCard}
                        >
                          {/* Left: Green / Red Icon Box */}
                          <View style={[styles.calendarIconBox, isMurajaah && { backgroundColor: '#FFE4E6' }]}>
                            <MaterialCommunityIcons
                              name="book-open-page-variant-outline"
                              size={20}
                              color={isMurajaah ? '#E11D48' : '#059669'}
                            />
                          </View>

                          {/* Middle: Surah Name & Verses + Subtitle */}
                          <View style={styles.setoranInfoCol}>
                            <Text numberOfLines={1} style={styles.setoranSurahText}>
                              {displayTitle}
                            </Text>
                            <View style={styles.setoranMetaRow}>
                              <Text numberOfLines={1} style={styles.setoranSubText}>
                                {teacherName && teacherName !== '-' ? `${teacherName} · ` : ''}{formatDate(itemDate)}
                              </Text>
                            </View>
                          </View>

                          {/* Right: Status Pill Badge */}
                          <View style={styles.setoranRightCol}>
                            <View style={[styles.setoranStatusPill, statusBadgeStyle]}>
                              <Text style={[styles.setoranStatusText, statusTextStyle]}>
                                {statusLabel === 'Menunggu Verifikasi' ? 'Verifikasi' : statusLabel}
                              </Text>
                            </View>
                          </View>

                          {/* Rightmost: Chevron > */}
                          <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                </View>
              </>
            )}
          </>
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

      {/* DETAIL MODAL SETORAN */}
      <Modal
        visible={Boolean(selectedLogDetail)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedLogDetail(null)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedLogDetail(null)} />
          <View style={[styles.modalCard, { paddingBottom: modalBottomInset }]}>
            <View style={styles.modalDragHandle} />
            {/* Header Modal Detail - Styled Emerald Theme */}
            <View style={styles.modalHeaderStyledContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.modalHeaderStyledIconBox}>
                  <MaterialCommunityIcons name="book-check-outline" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.modalHeaderStyledTitle}>Detail Setoran Tahfizh</Text>
                  <Text numberOfLines={1} style={styles.modalHeaderStyledSubtitle}>
                    {selectedLogDetail ? (
                      (() => {
                        const parsedLog = parseLogSurahAndVerses(selectedLogDetail, quranSurahs);
                        const sNum = selectedLogDetail.hafalan_surah_number || parsedLog?.surahNum;
                        const aStart = selectedLogDetail.hafalan_ayah_start || parsedLog?.aStart || 1;
                        const jNum = sNum ? getQuranJuz(sNum, aStart) : (selectedLogDetail.calculated_juz || selectedLogDetail.juz || null);
                        const dateStr = selectedLogDetail.record_date || selectedLogDetail.date ? formatDate(selectedLogDetail.record_date || selectedLogDetail.date) : (studentInfo?.name || 'Setoran Santri');
                        return jNum ? `Juz ${jNum} · ${dateStr}` : dateStr;
                      })()
                    ) : 'Informasi Lengkap'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedLogDetail(null)} style={styles.modalHeaderStyledCloseBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#065F46" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.72 }}>
              {selectedLogDetail ? (
                <View style={{ gap: 12, paddingVertical: 6 }}>
                  {/* Surah & Ayat Box */}
                  {isZiyadahLog(selectedLogDetail) ? (
                    (() => {
                      const parsedLog = parseLogSurahAndVerses(selectedLogDetail, quranSurahs);
                      const sNum = selectedLogDetail.hafalan_surah_number || parsedLog?.surahNum;
                      const aStart = selectedLogDetail.hafalan_ayah_start || parsedLog?.aStart || 1;
                      const jNum = sNum ? getQuranJuz(sNum, aStart) : (selectedLogDetail.calculated_juz || selectedLogDetail.juz || null);

                      return (
                        <View style={styles.modalInfoBox}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <MaterialCommunityIcons name="book-open-variant" size={14} color="#059669" />
                              <Text style={styles.modalInfoLabel}>Surah & Ayat Hafalan Baru</Text>
                            </View>
                            {jNum ? (
                              <View style={styles.modalJuzBadge}>
                                <Text style={styles.modalJuzBadgeText}>Juz {jNum}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.modalInfoValue}>
                            {selectedLogDetail.hafalan_surah_name || selectedLogDetail.surah || 'Setoran Hafalan'}
                          </Text>
                          {selectedLogDetail.hafalan_ayah_start && selectedLogDetail.hafalan_ayah_end ? (
                            <Text style={styles.modalInfoSub}>
                              Ayat {selectedLogDetail.hafalan_ayah_start} s/d {selectedLogDetail.hafalan_ayah_end} (
                              {Number(selectedLogDetail.hafalan_ayah_end) - Number(selectedLogDetail.hafalan_ayah_start) + 1} Ayat){jNum ? ` · Juz ${jNum}` : ''}
                            </Text>
                          ) : jNum ? (
                            <Text style={styles.modalInfoSub}>Juz {jNum}</Text>
                          ) : null}
                        </View>
                      );
                    })()
                  ) : (
                    (() => {
                      const parsedLog = parseLogSurahAndVerses(selectedLogDetail, quranSurahs);
                      const sNum = selectedLogDetail.hafalan_surah_number || parsedLog?.surahNum;
                      const aStart = selectedLogDetail.hafalan_ayah_start || parsedLog?.aStart || 1;
                      const jNum = sNum ? getQuranJuz(sNum, aStart) : (selectedLogDetail.calculated_juz || selectedLogDetail.juz || null);

                      return (
                        <View style={[styles.modalInfoBox, { backgroundColor: '#F0FDF4' }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <MaterialCommunityIcons name="bookmark-check-outline" size={14} color="#047857" />
                              <Text style={[styles.modalInfoLabel, { color: '#047857' }]}>Jenis Setoran</Text>
                            </View>
                            {jNum ? (
                              <View style={styles.modalJuzBadge}>
                                <Text style={styles.modalJuzBadgeText}>Juz {jNum}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={[styles.modalInfoValue, { color: '#065F46' }]}>Setoran Tilawah & Penguatan Murajaah</Text>
                          <Text style={styles.modalInfoSub}>
                            Penguatan bacaan tartil Al-Qur'an dan murajaah hafalan mandiri.{jNum ? ` (Juz ${jNum})` : ''}
                          </Text>
                        </View>
                      );
                    })()
                  )}

                  {/* Tilawah & Murajaah info if present */}
                  {selectedLogDetail.tilawah_text ? (
                    <View style={styles.modalInfoBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <MaterialCommunityIcons name="book-outline" size={14} color="#059669" />
                        <Text style={styles.modalInfoLabel}>Bacaan Tilawah</Text>
                      </View>
                      <Text style={styles.modalInfoValue}>{selectedLogDetail.tilawah_text}</Text>
                      {selectedLogDetail.tilawah_baris ? (
                        <Text style={styles.modalInfoSub}>{selectedLogDetail.tilawah_baris} Baris</Text>
                      ) : null}
                    </View>
                  ) : null}

                  {selectedLogDetail.murajaah_text ? (
                    <View style={styles.modalInfoBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <MaterialCommunityIcons name="repeat" size={14} color="#059669" />
                        <Text style={styles.modalInfoLabel}>Pengulangan Murajaah</Text>
                      </View>
                      <Text style={styles.modalInfoValue}>{selectedLogDetail.murajaah_text}</Text>
                      {selectedLogDetail.murajaah_lembar ? (
                        <Text style={styles.modalInfoSub}>{selectedLogDetail.murajaah_lembar} Lembar</Text>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Teacher & Verification */}
                  <View style={styles.modalInfoBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <MaterialCommunityIcons name="account-tie-outline" size={14} color="#059669" />
                      <Text style={styles.modalInfoLabel}>Penguji / Ustadz</Text>
                    </View>
                    <Text style={styles.modalInfoValue}>
                      {selectedLogDetail.teacher?.full_name ||
                        selectedLogDetail.teacher?.nama_lengkap ||
                        selectedLogDetail.teacher?.name ||
                        selectedLogDetail.signature_teacher ||
                        '-'}
                    </Text>
                    <Text style={styles.modalInfoSub}>
                      Tanggal: {formatDate(selectedLogDetail.record_date || selectedLogDetail.date)}
                    </Text>
                  </View>

                  {/* Notes Teacher */}
                  {selectedLogDetail.notes_teacher || selectedLogDetail.catatan ? (
                    <View style={styles.teacherNoteCalloutBox}>
                      <View style={styles.teacherNoteCalloutHeader}>
                        <View style={styles.teacherNoteIconBadge}>
                          <MaterialCommunityIcons name="account-tie" size={17} color="#0D7A48" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.teacherNoteCalloutLabel}>CATATAN DARI GURU / USTADZ</Text>
                          <Text numberOfLines={1} style={styles.teacherNoteCalloutAuthor}>
                            {selectedLogDetail.teacher?.full_name ||
                              selectedLogDetail.teacher?.nama_lengkap ||
                              selectedLogDetail.teacher?.name ||
                              selectedLogDetail.signature_teacher ||
                              'Guru Pembimbing Tahfizh'}
                          </Text>
                        </View>
                        <View style={styles.teacherNoteRoleBadge}>
                          <MaterialCommunityIcons name="check-decagram" size={12} color="#059669" />
                          <Text style={styles.teacherNoteRoleBadgeText}>Terverifikasi</Text>
                        </View>
                      </View>
                      <View style={styles.teacherNoteContentBox}>
                        <MaterialCommunityIcons
                          name="format-quote-open"
                          size={16}
                          color="#059669"
                          style={{ marginRight: 6, marginTop: -2 }}
                        />
                        <Text style={styles.teacherNoteCalloutText}>
                          {selectedLogDetail.notes_teacher || selectedLogDetail.catatan}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Catatan Orang Tua dan Teks Bacaan Ayat Al-Qur'an HANYA MUNCUL JIKA STATUS MEMERLUKAN PENGULANGAN (MURAJAAH) */}
                  {isSetoranNeedsMurajaah(selectedLogDetail) ? (
                    <>
                      {/* Notes Parent */}
                      {selectedLogDetail.notes_parent ? (
                        <View style={styles.parentNoteCalloutBox}>
                          <View style={styles.parentNoteCalloutHeader}>
                            <View style={styles.parentNoteIconBadge}>
                              <MaterialCommunityIcons name="account-heart" size={17} color="#B45309" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.parentNoteCalloutLabel}>CATATAN WALI / ORANG TUA</Text>
                              <Text numberOfLines={1} style={styles.parentNoteCalloutAuthor}>
                                {studentInfo?.parent_name || 'Orang Tua / Wali Santri'}
                              </Text>
                            </View>
                            <View style={styles.parentNoteRoleBadge}>
                              <MaterialCommunityIcons name="home-heart" size={12} color="#D97706" />
                              <Text style={styles.parentNoteRoleBadgeText}>Di Rumah</Text>
                            </View>
                          </View>
                          <View style={styles.parentNoteContentBox}>
                            <MaterialCommunityIcons
                              name="format-quote-open"
                              size={16}
                              color="#D97706"
                              style={{ marginRight: 6, marginTop: -2 }}
                            />
                            <Text style={styles.parentNoteCalloutText}>
                              {selectedLogDetail.notes_parent}
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      {/* DETAIL BACAAN AYAT AL-QUR'AN SECARA DINAMIS UNTUK PENDAMPINGAN ORANG TUA */}
                      <View style={styles.detailAyatSectionBox}>
                        <View style={styles.detailAyatSectionHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                            <MaterialCommunityIcons name="book-open-page-variant" size={17} color="#059669" />
                            <Text style={styles.detailAyatSectionTitle}>Teks Bacaan Ayat Al-Qur'an</Text>
                          </View>
                          {detailAyahs.length > 0 && (
                            <View style={styles.detailAyatCountPill}>
                              <Text style={styles.detailAyatCountPillText}>{detailAyahs.length} Ayat</Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.detailAyatSectionSubtitle}>
                          Panduan teks ayat untuk disimak atau diulang bersama orang tua di rumah:
                        </Text>

                        {isDetailAyahsLoading ? (
                          <View style={styles.detailAyatLoadingBox}>
                            <ActivityIndicator size="small" color="#059669" />
                            <Text style={styles.detailAyatLoadingText}>Memuat teks ayat dari Al-Qur'an digital...</Text>
                          </View>
                        ) : detailAyahsError ? (
                          <View style={styles.detailAyatErrorBox}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#EF4444" />
                            <Text style={styles.detailAyatErrorText}>{detailAyahsError}</Text>
                          </View>
                        ) : detailAyahs.length === 0 ? (
                          <View style={styles.detailAyatEmptyBox}>
                            <Text style={styles.detailAyatEmptyText}>
                              Teks ayat spesifik belum terindeks untuk catatan setoran ini.
                            </Text>
                          </View>
                        ) : (
                          <View style={{ gap: 10, marginTop: 8 }}>
                            {detailAyahs.map((ay: any, aIdx: number) => {
                              const ayahNo = ay.nomorAyat || ay.nomor_ayat || ay.nomor || ay.ayat || aIdx + 1;
                              const arab = ay.teksArab || ay.teks_arab || ay.ar || '';
                              const latin = ay.teksLatin || ay.teks_latin || ay.tr || '';
                              const arti = ay.teksIndonesia || ay.teks_indonesia || ay.idn || '';

                              return (
                                <View key={String(ayahNo || aIdx)} style={styles.detailAyahItemCard}>
                                  <View style={styles.detailAyahNumberRow}>
                                    <View style={styles.detailAyahNumberBadge}>
                                      <Text style={styles.detailAyahNumberBadgeText}>Ayat {ayahNo}</Text>
                                    </View>
                                  </View>

                                  {/* Teks Arab dengan tipografi Al-Qur'an yang jelas */}
                                  {Boolean(arab) && (
                                    <Text style={styles.detailAyahArabText} selectable={true}>
                                      {arab}
                                    </Text>
                                  )}

                                  {/* Transliterasi Latin */}
                                  {Boolean(latin) && (
                                    <Text style={styles.detailAyahLatinText}>
                                      {latin}
                                    </Text>
                                  )}

                                  {/* Terjemahan Bahasa Indonesia */}
                                  {Boolean(arti) && (
                                    <Text style={styles.detailAyahArtiText}>
                                      "{arti}"
                                    </Text>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    </>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            {/* Tombol Aksi: Jika telah lancar, tombol murajaah dihilangkan. Tombol murajaah hanya muncul untuk yang pengulangan saja */}
            {isSetoranNeedsMurajaah(selectedLogDetail) ? (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => setSelectedLogDetail(null)}
                  style={[styles.modalActionBtn, { flex: 1, backgroundColor: '#F1F5F9', marginTop: 0 }]}
                >
                  <Text style={[styles.modalActionBtnText, { color: '#64748B' }]}>Tutup</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => {
                    const itemToMurajaah = selectedLogDetail;
                    setSelectedLogDetail(null);
                    setTimeout(() => {
                      openInputMurajaahModal(itemToMurajaah);
                    }, 200);
                  }}
                  style={[styles.modalActionBtn, { flex: 1.6, marginTop: 0 }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="repeat" size={16} color="#FFFFFF" />
                    <Text style={styles.modalActionBtnText}>Ulangi (Murajaah)</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginTop: 16 }}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => setSelectedLogDetail(null)}
                  style={[styles.modalActionBtn, { backgroundColor: '#059669', marginTop: 0 }]}
                >
                  <Text style={[styles.modalActionBtnText, { color: '#FFFFFF' }]}>Tutup</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL INPUT PENGULANGAN (MURAJAAH) ORANG TUA & VIEWER MUSHAF AL-QUR'AN    */}
      {/* ========================================================================= */}
      <Modal
        visible={isInputModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsInputModalVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsInputModalVisible(false)} />
          <View style={[styles.modalCard, { paddingBottom: modalBottomInset, maxHeight: SCREEN_HEIGHT * 0.9 }]}>
            <View style={styles.modalDragHandle} />

            {/* Header Modal Input - Styled Emerald Theme */}
            <View style={styles.modalHeaderStyledContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.modalHeaderStyledIconBox}>
                  <MaterialCommunityIcons name="book-plus-multiple" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.modalHeaderStyledTitle}>Input Murajaah di Rumah</Text>
                  <Text numberOfLines={1} style={styles.modalHeaderStyledSubtitle}>
                    {selectedSurah ? `Juz ${getQuranJuz(selectedSurah.nomor, inputAyatStart)} · ` : ''}{studentInfo?.name || studentInfo?.full_name || 'Ananda'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsInputModalVisible(false)} style={styles.modalHeaderStyledCloseBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#065F46" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.72 }}>
              <View style={{ gap: 14, paddingVertical: 6 }}>

                {/* Catatan dari Guru / Ustadz */}
                <View style={styles.teacherNoteCalloutBox}>
                  <View style={styles.teacherNoteCalloutHeader}>
                    <View style={styles.teacherNoteIconBadge}>
                      <MaterialCommunityIcons name="account-tie" size={17} color="#0D7A48" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.teacherNoteCalloutLabel}>CATATAN DARI GURU / USTADZ</Text>
                      <Text numberOfLines={1} style={styles.teacherNoteCalloutAuthor}>
                        {currentTeacherName || 'Guru Pembimbing Tahfizh'}
                      </Text>
                    </View>
                    <View style={styles.teacherNoteRoleBadge}>
                      <MaterialCommunityIcons name="check-decagram" size={12} color="#059669" />
                      <Text style={styles.teacherNoteRoleBadgeText}>Terverifikasi</Text>
                    </View>
                  </View>
                  <View style={styles.teacherNoteContentBox}>
                    <MaterialCommunityIcons name="format-quote-open" size={16} color="#059669" style={{ marginRight: 4, marginTop: 1 }} />
                    <Text style={styles.teacherNoteCalloutText}>
                      {currentTeacherNote || 'Fokus pada kelancaran makhraj dan ketukan mad pada ayat yang diulang bersama orang tua di rumah.'}
                    </Text>
                  </View>
                </View>

                {/* 1. Surah & Ayat yang Diulang */}
                <View style={styles.inputGroupBlock}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={styles.inputGroupLabel}>SURAH & AYAT YANG DIULANG *</Text>
                  </View>

                  {/* Card Utama: Menampilkan Nama Surah dan Ayat yang Diulang Saja */}
                  {selectedSurah ? (
                    <View style={styles.selectedSurahBanner}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <View style={styles.surahNumberCircle}>
                          <Text style={styles.surahNumberCircleText}>{selectedSurah.nomor}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.selectedSurahName}>
                              Surah {selectedSurah.nama_latin}
                            </Text>
                            {selectedSurah.nama ? (
                              <Text style={{ fontSize: 13, color: '#065F46', fontWeight: 'bold' }}>
                                ({selectedSurah.nama})
                              </Text>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            <View style={{ backgroundColor: '#059669', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>
                                Juz {getQuranJuz(selectedSurah.nomor, inputAyatStart)}
                              </Text>
                            </View>
                            <View style={{ backgroundColor: '#10B981', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>
                                Ayat {inputAyatStart} - {inputAyatEnd}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 11, color: '#047857', fontWeight: '600' }}>
                              {Math.max(0, (parseInt(inputAyatEnd, 10) || 0) - (parseInt(inputAyatStart, 10) || 0) + 1)} Ayat yang diulang
                            </Text>
                          </View>
                        </View>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={toggleMushafViewer}
                        style={[
                          styles.btnToggleMushaf,
                          showMushafViewer && styles.btnToggleMushafActive,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={showMushafViewer ? 'book-open-variant' : 'book-search-outline'}
                          size={15}
                          color={showMushafViewer ? '#FFFFFF' : '#18A165'}
                        />
                        <Text
                          style={[
                            styles.btnToggleMushafText,
                            showMushafViewer && styles.btnToggleMushafTextActive,
                          ]}
                        >
                          {showMushafViewer ? 'Tutup Mushaf' : 'Buka Mushaf'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setIsSelectingDifferentSurah(true)}
                      style={[styles.selectedSurahBanner, { borderColor: '#CBD5E1', borderStyle: 'dashed' }]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <View style={[styles.surahNumberCircle, { backgroundColor: '#F1F5F9' }]}>
                          <MaterialCommunityIcons name="book-search-outline" size={16} color="#64748B" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.selectedSurahName, { color: '#64748B' }]}>
                            Belum Ada Surah Dipilih
                          </Text>
                          <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                            Silakan ketuk untuk memilih surah dari daftar di bawah
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Pilihan 114 Surah (Hanya terbuka jika orang tua ingin mengganti surah) */}
                  {isSelectingDifferentSurah && (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                      <View style={styles.surahSearchBox}>
                        <MaterialCommunityIcons name="magnify" size={16} color="#94A3B8" />
                        <TextInput
                          style={styles.surahSearchInput}
                          placeholder="Cari nama atau nomor surah..."
                          placeholderTextColor="#94A3B8"
                          value={surahSearchText}
                          onChangeText={setSurahSearchText}
                        />
                        {surahSearchText.length > 0 && (
                          <TouchableOpacity onPress={() => setSurahSearchText('')}>
                            <MaterialCommunityIcons name="close-circle" size={14} color="#94A3B8" />
                          </TouchableOpacity>
                        )}
                      </View>

                      {isSurahListLoading ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
                          <ActivityIndicator size="small" color="#18A165" />
                          <Text style={{ fontSize: 11.5, color: '#64748B' }}>Memuat daftar surah...</Text>
                        </View>
                      ) : (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
                        >
                          {quranSurahs
                            .filter((s) => {
                              if (!surahSearchText) return true;
                              const q = surahSearchText.toLowerCase();
                              return (
                                s.nama_latin?.toLowerCase().includes(q) ||
                                s.nama?.toLowerCase().includes(q) ||
                                String(s.nomor).includes(q)
                              );
                            })
                            .slice(0, 30)
                            .map((s) => {
                              const isSel = selectedSurah?.nomor === s.nomor;
                              return (
                                <TouchableOpacity
                                  key={String(s.nomor)}
                                  activeOpacity={0.8}
                                  onPress={() => handleSelectSurah(s)}
                                  style={[
                                    styles.surahChip,
                                    isSel && styles.surahChipActive,
                                  ]}
                                >
                                  <Text style={[styles.surahChipNumber, isSel && styles.surahChipNumberActive]}>
                                    {s.nomor}
                                  </Text>
                                  <Text style={[styles.surahChipText, isSel && styles.surahChipTextActive]}>
                                    {s.nama_latin}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                        </ScrollView>
                      )}
                    </View>
                  )}
                </View>

                {/* 2. VIEWER MUSHAF AYAT DARI DATABASE (HANYA MENAMPILKAN AYAT YANG DIULANG) */}
                {showMushafViewer && (
                  <View style={styles.mushafViewerContainer}>
                    <View style={styles.mushafViewerHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <MaterialCommunityIcons name="book-open-page-variant" size={16} color="#18A165" />
                        <Text numberOfLines={1} style={styles.mushafViewerTitle}>
                          Ayat yang Diulang: {selectedSurah?.nama_latin} ({inputAyatStart} - {inputAyatEnd})
                        </Text>
                      </View>
                      <View style={{ backgroundColor: '#DEF7EC', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10.5, color: '#059669', fontWeight: '800' }}>
                          {repeatedVerses.length} Ayat
                        </Text>
                      </View>
                    </View>

                    {isAyatLoading ? (
                      <View style={{ padding: 20, alignItems: 'center', gap: 6 }}>
                        <ActivityIndicator size="small" color="#18A165" />
                        <Text style={{ fontSize: 11, color: '#64748B' }}>Mengambil teks ayat yang diulang...</Text>
                      </View>
                    ) : repeatedVerses.length === 0 ? (
                      <View style={{ padding: 14, alignItems: 'center', gap: 4 }}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#94A3B8" />
                        <Text style={{ fontSize: 11.5, color: '#64748B', textAlign: 'center', fontWeight: '500' }}>
                          Tidak ada teks ayat untuk nomor {inputAyatStart} s/d {inputAyatEnd}.
                        </Text>
                        <Text style={{ fontSize: 10.5, color: '#94A3B8', textAlign: 'center' }}>
                          Surah {selectedSurah?.nama_latin} memiliki total {selectedSurah?.jumlah_ayat || surahAyatList.length} ayat.
                        </Text>
                      </View>
                    ) : (
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 240, paddingHorizontal: 4 }}>
                        {repeatedVerses.map((ay: any) => (
                          <View key={String(ay.nomor_ayat || ay.id || ay.nomor)} style={styles.ayatCardItem}>
                            <View style={styles.ayatTopRow}>
                              <View style={styles.ayatNumberBadge}>
                                <Text style={styles.ayatNumberText}>{ay.nomor_ayat || ay.nomor}</Text>
                              </View>
                              <Text style={styles.ayatArabicText}>{ay.teks_arab || ay.ar}</Text>
                            </View>
                            {ay.teks_latin || ay.tr ? (
                              <Text style={styles.ayatLatinText}>{ay.teks_latin || ay.tr}</Text>
                            ) : null}
                            {ay.teks_indonesia || ay.idn ? (
                              <Text style={styles.ayatIndoText}>{ay.teks_indonesia || ay.idn}</Text>
                            ) : null}
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )}

                {/* 3. Input Rentang Ayat */}
                <View style={styles.inputGroupBlock}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.inputGroupLabel}>RENTANG AYAT YANG DIULANG *</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subFieldLabel}>Ayat Mulai</Text>
                      <TextInput
                        style={[styles.numberInput, styles.numberInputLocked]}
                        keyboardType="numeric"
                        editable={false}
                        value={inputAyatStart}
                        placeholder="1"
                      />
                    </View>
                    <Text style={{ marginTop: 18, fontWeight: '700', color: '#94A3B8' }}>s/d</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subFieldLabel}>Ayat Selesai</Text>
                      <TextInput
                        style={[styles.numberInput, styles.numberInputLocked]}
                        keyboardType="numeric"
                        editable={false}
                        value={inputAyatEnd}
                        placeholder="10"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subFieldLabel}>Jml Lembar</Text>
                      <TextInput
                        style={[styles.numberInput, styles.numberInputLocked]}
                        keyboardType="numeric"
                        editable={false}
                        value={inputLembar}
                        placeholder="1.0"
                      />
                    </View>
                  </View>
                </View>

                {/* 4. Input Tanggal & Jam Pelaksanaan */}
                <View style={styles.inputGroupBlock}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.inputGroupLabel}>WAKTU PENGULANGAN (MURAJAAH) *</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1.4 }}>
                      <Text style={styles.subFieldLabel}>Tanggal (YYYY-MM-DD)</Text>
                      <View style={[styles.inputWithIcon, styles.inputWithIconLocked]}>
                        <MaterialCommunityIcons name="calendar" size={16} color="#94A3B8" />
                        <TextInput
                          style={[styles.textInputWithIcon, styles.textInputWithIconLocked]}
                          editable={false}
                          value={inputDate}
                          placeholder={new Date().toISOString().slice(0, 10)}
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subFieldLabel}>Jam (HH:MM)</Text>
                      <View style={[styles.inputWithIcon, styles.inputWithIconLocked]}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#94A3B8" />
                        <TextInput
                          style={[styles.textInputWithIcon, styles.textInputWithIconLocked]}
                          editable={false}
                          value={inputTime}
                          placeholder="20:00"
                        />
                      </View>
                    </View>
                  </View>
                </View>

                {/* 5. Catatan Wali Murid */}
                <View style={styles.inputGroupBlock}>
                  <Text style={styles.inputGroupLabel}>CATATAN ORANG TUA (OPSIONAL)</Text>
                  <TextInput
                    style={[styles.textInputArea, { minHeight: 64 }]}
                    multiline
                    placeholder="Contoh: Ananda lancar membaca surah ini dengan tartil dan tajwid baik..."
                    placeholderTextColor="#94A3B8"
                    value={inputNotes}
                    onChangeText={setInputNotes}
                  />
                </View>

                {/* Status Notice */}
                <View style={styles.approvalNoticeBox}>
                  <MaterialCommunityIcons name="information-outline" size={18} color="#0284C7" />
                  <Text style={styles.approvalNoticeText}>
                    Data pengulangan ini akan disimpan ke database dan langsung diteruskan ke Guru / Ustadz Tahfizh untuk verifikasi dan pemberian predikat mutu.
                  </Text>
                </View>

              </View>
            </ScrollView>

            {/* Tombol Simpan & Kirim */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsInputModalVisible(false)}
                style={[styles.modalActionBtn, { flex: 1, backgroundColor: '#F1F5F9', marginTop: 0 }]}
              >
                <Text style={[styles.modalActionBtnText, { color: '#64748B' }]}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSubmitMurajaah}
                disabled={isSubmittingMurajaah}
                style={[styles.modalActionBtn, { flex: 2, marginTop: 0 }]}
              >
                {isSubmittingMurajaah ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.modalActionBtnText}>Menyimpan...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="check-circle" size={17} color="#FFFFFF" />
                    <Text style={styles.modalActionBtnText}>Simpan & Ajukan Verifikasi</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* Modal Filter Rentang Tanggal (Date Range Picker) */}
      <Modal
        visible={isDateRangeModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsDateRangeModalVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsDateRangeModalVisible(false)} />
          <View style={[styles.modalCard, { paddingBottom: modalBottomInset, maxHeight: SCREEN_HEIGHT * 0.9 }]}>
            <View style={styles.modalDragHandle} />

            {/* Header Modal - Styled Emerald Theme */}
            <View style={styles.modalHeaderStyledContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.modalHeaderStyledIconBox}>
                  <MaterialCommunityIcons name="calendar-range" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.modalHeaderStyledTitle}>Filter Rentang Tanggal</Text>
                  <Text numberOfLines={1} style={styles.modalHeaderStyledSubtitle}>
                    {tempRangeStart && tempRangeEnd
                      ? `${formatDate(tempRangeStart)} – ${formatDate(tempRangeEnd)}`
                      : tempRangeStart
                      ? `Mulai ${formatDate(tempRangeStart)} (Pilih Selesai)`
                      : 'Pilih Tanggal Mulai & Tanggal Selesai'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsDateRangeModalVisible(false)}
                style={styles.modalHeaderStyledCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#065F46" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.62 }}>
              <View style={{ gap: 12, paddingVertical: 4 }}>
                {/* Quick Presets */}
                <View>
                  <Text style={styles.dateRangeSectionLabel}>PILIHAN CEPAT</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetTrack}>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => handleApplyPresetRange('7days')}
                      style={styles.presetChip}
                    >
                      <MaterialCommunityIcons name="clock-fast" size={13} color="#059669" />
                      <Text style={styles.presetChipText}>7 Hari Terakhir</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => handleApplyPresetRange('14days')}
                      style={styles.presetChip}
                    >
                      <MaterialCommunityIcons name="clock-fast" size={13} color="#059669" />
                      <Text style={styles.presetChipText}>14 Hari Terakhir</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => handleApplyPresetRange('30days')}
                      style={styles.presetChip}
                    >
                      <MaterialCommunityIcons name="history" size={13} color="#059669" />
                      <Text style={styles.presetChipText}>30 Hari Terakhir</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => handleApplyPresetRange('thisMonth')}
                      style={styles.presetChip}
                    >
                      <MaterialCommunityIcons name="calendar-month" size={13} color="#059669" />
                      <Text style={styles.presetChipText}>Bulan Ini</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => handleApplyPresetRange('lastMonth')}
                      style={styles.presetChip}
                    >
                      <MaterialCommunityIcons name="calendar-arrow-left" size={13} color="#059669" />
                      <Text style={styles.presetChipText}>Bulan Lalu</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>

                {/* Calendar Card Container */}
                <View style={styles.calendarCardContainer}>
                  {/* Month Navigation */}
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={handlePrevMonth}
                      style={styles.calendarNavBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={22} color="#065F46" />
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.calendarMonthTitle}>
                        {MONTH_NAMES_ID[calendarViewingDate.getMonth()]} {calendarViewingDate.getFullYear()}
                      </Text>
                      <TouchableOpacity
                        onPress={handleResetCalendarToToday}
                        style={styles.calendarTodayBadge}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.calendarTodayBadgeText}>Bulan Ini</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={handleNextMonth}
                      style={styles.calendarNavBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={22} color="#065F46" />
                    </TouchableOpacity>
                  </View>

                  {/* Day of Week Header */}
                  <View style={styles.calendarDayHeaderRow}>
                    {DAY_LABELS_ID.map((lbl, idx) => (
                      <View key={lbl} style={styles.calendarDayHeaderCell}>
                        <Text
                          style={[
                            styles.calendarDayHeaderText,
                            idx === 0 && { color: '#DC2626' },
                            idx === 5 && { color: '#059669' },
                          ]}
                        >
                          {lbl}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Calendar Matrix Grid */}
                  <View style={styles.calendarGrid}>
                    {calendarGridData.map((cell, idx) => {
                      const isRangeEndpoint = cell.isStart || cell.isEnd;
                      return (
                        <TouchableOpacity
                          key={`${cell.fullDate}_${idx}`}
                          activeOpacity={0.75}
                          onPress={() => handleSelectDateRange(cell.fullDate)}
                          style={[
                            styles.calendarGridCell,
                            cell.isInRange && styles.calendarGridCellInRange,
                            cell.isStart && styles.calendarGridCellStart,
                            cell.isEnd && styles.calendarGridCellEnd,
                          ]}
                        >
                          <View
                            style={[
                              styles.calendarCellInner,
                              cell.isToday && !isRangeEndpoint && styles.calendarCellInnerToday,
                              isRangeEndpoint && styles.calendarCellInnerEndpoint,
                            ]}
                          >
                            <Text
                              style={[
                                styles.calendarCellText,
                                !cell.isCurrentMonth && styles.calendarCellTextInactive,
                                cell.isToday && !isRangeEndpoint && styles.calendarCellTextToday,
                                cell.isInRange && styles.calendarCellTextInRange,
                                isRangeEndpoint && styles.calendarCellTextEndpoint,
                              ]}
                            >
                              {cell.day}
                            </Text>
                          </View>
                          {cell.isStart && (
                            <View style={styles.cellStartMarker}>
                              <Text style={styles.cellMarkerText}>Mulai</Text>
                            </View>
                          )}
                          {cell.isEnd && cell.isEnd !== cell.isStart && (
                            <View style={styles.cellEndMarker}>
                              <Text style={styles.cellMarkerText}>Selesai</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Selected Range Summary Box */}
                <View style={styles.rangeSummaryCard}>
                  <View style={styles.rangeSummarySide}>
                    <Text style={styles.rangeSummaryLabel}>DARI TANGGAL</Text>
                    <View style={styles.rangeDatePill}>
                      <MaterialCommunityIcons name="calendar-start" size={14} color="#059669" />
                      <Text numberOfLines={1} style={styles.rangeDatePillText}>
                        {tempRangeStart ? formatDate(tempRangeStart) : 'Belum dipilih'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rangeArrowWrapper}>
                    <MaterialCommunityIcons name="arrow-right" size={18} color="#059669" />
                    {tempRangeDurationDays > 0 && (
                      <View style={styles.rangeDurationBadge}>
                        <Text style={styles.rangeDurationBadgeText}>{tempRangeDurationDays} Hari</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.rangeSummarySide}>
                    <Text style={styles.rangeSummaryLabel}>SAMPAI TANGGAL</Text>
                    <View style={styles.rangeDatePill}>
                      <MaterialCommunityIcons name="calendar-end" size={14} color="#059669" />
                      <Text numberOfLines={1} style={styles.rangeDatePillText}>
                        {tempRangeEnd ? formatDate(tempRangeEnd) : (tempRangeStart ? formatDate(tempRangeStart) : 'Belum dipilih')}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Footer Buttons: Batal, Reset, Terapkan Rentang */}
            <View style={[styles.dateRangeModalFooterRow, { marginTop: 12 }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setTempRangeStart(null);
                  setTempRangeEnd(null);
                }}
                style={styles.dateRangeResetBtn}
              >
                <MaterialCommunityIcons name="refresh" size={15} color="#475569" />
                <Text style={styles.dateRangeResetBtnText}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsDateRangeModalVisible(false)}
                style={styles.dateRangeCancelBtn}
              >
                <Text style={styles.dateRangeCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleApplyCustomRange}
                style={styles.dateRangeApplyBtn}
              >
                <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                <Text style={styles.dateRangeApplyBtnText}>Terapkan Rentang</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Detail Target Kurikulum & Setoran Surah */}
      <Modal
        visible={!!selectedCurriculumSurah}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedCurriculumSurah(null)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedCurriculumSurah(null)} />
          <View style={[styles.modalCard, { paddingBottom: modalBottomInset, maxHeight: SCREEN_HEIGHT * 0.88 }]}>
            <View style={styles.modalDragHandle} />

            {/* Header Styled Emerald Theme */}
            <View style={styles.modalHeaderStyledContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.modalHeaderStyledIconBox}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.modalHeaderStyledTitle}>
                    Detail Target Kurikulum
                  </Text>
                  <Text numberOfLines={1} style={styles.modalHeaderStyledSubtitle}>
                    Surah {selectedCurriculumSurah?.nama} · {selectedCurriculumSurah?.juzLabel}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedCurriculumSurah(null)}
                style={styles.modalHeaderStyledCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#065F46" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.60 }}>
              <View style={{ gap: 14, paddingVertical: 4 }}>
                {/* Hero Info Card Surah */}
                {(() => {
                  const mDone = Boolean(selectedCurriculumSurah?.isDone);
                  const mMurajaah = Boolean(selectedCurriculumSurah?.isNeedsMurajaah);
                  const mProgress = Boolean(selectedCurriculumSurah?.uniqueAyatCount > 0 && !mDone && !mMurajaah);

                  const mCardBg = mDone ? '#F0FDF4' : mMurajaah ? '#FFFBEB' : mProgress ? '#F0F9FF' : '#F8FAFC';
                  const mCardBorder = mDone ? '#86EFAC' : mMurajaah ? '#FCD34D' : mProgress ? '#BAE6FD' : '#E2E8F0';
                  const mTitleColor = mDone ? '#065F46' : mMurajaah ? '#92400E' : mProgress ? '#0369A1' : '#065F46';
                  const mFillColor = mDone ? '#10B981' : mMurajaah ? '#F59E0B' : mProgress ? '#0284C7' : '#CBD5E1';
                  const mTrackBg = mDone ? '#DCFCE7' : mMurajaah ? '#FEF3C7' : mProgress ? '#E0F2FE' : '#F1F5F9';
                  const mPercent = mDone ? 100 : selectedCurriculumSurah?.progressPercent || 0;

                  return (
                    <View style={[styles.curriculumModalHeroCard, { backgroundColor: mCardBg, borderColor: mCardBorder, borderWidth: 1.5 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={[styles.curriculumModalSurahTitle, { color: mTitleColor }]}>
                              Surah {selectedCurriculumSurah?.nama}
                            </Text>
                            <View style={styles.curriculumSurahNumBadge}>
                              <Text style={styles.curriculumSurahNumText}>No. {selectedCurriculumSurah?.nomor}</Text>
                            </View>
                          </View>
                          {selectedCurriculumSurah?.arti ? (
                            <Text style={styles.curriculumModalSurahArti}>"{selectedCurriculumSurah.arti}"</Text>
                          ) : null}
                        </View>
                        {selectedCurriculumSurah?.nama_arab ? (
                          <Text style={[styles.curriculumModalSurahArab, { color: mDone ? '#059669' : mMurajaah ? '#B45309' : mProgress ? '#0284C7' : '#065F46' }]}>
                            {selectedCurriculumSurah.nama_arab}
                          </Text>
                        ) : null}
                      </View>

                      {/* Badges: Ayat, Juz, Tempat Turun */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        <View style={styles.curriculumModalBadge}>
                          <MaterialCommunityIcons name="format-list-numbered" size={12} color="#065F46" />
                          <Text style={styles.curriculumModalBadgeText}>{selectedCurriculumSurah?.ayat} Ayat</Text>
                        </View>
                        <View style={styles.curriculumModalBadge}>
                          <MaterialCommunityIcons name="book-outline" size={12} color="#065F46" />
                          <Text style={styles.curriculumModalBadgeText}>{selectedCurriculumSurah?.juzLabel}</Text>
                        </View>
                        {selectedCurriculumSurah?.tempat_turun ? (
                          <View style={styles.curriculumModalBadge}>
                            <MaterialCommunityIcons name="map-marker-outline" size={12} color="#065F46" />
                            <Text style={styles.curriculumModalBadgeText}>{selectedCurriculumSurah.tempat_turun}</Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Progress Bar & Status Badge di Bawah Bar */}
                      <View style={{ marginTop: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={styles.curriculumProgressLabel}>Capaian Hafalan Ananda</Text>
                          <Text style={styles.curriculumProgressVal}>
                            {mDone
                              ? `${selectedCurriculumSurah?.ayat}/${selectedCurriculumSurah?.ayat} Ayat (100%)`
                              : `${selectedCurriculumSurah?.uniqueAyatCount || 0}/${selectedCurriculumSurah?.ayat || 0} Ayat (${selectedCurriculumSurah?.progressPercent || 0}%)`}
                          </Text>
                        </View>
                        <View style={[styles.curriculumProgressBarBg, { backgroundColor: mTrackBg, height: 6, borderRadius: 3 }]}>
                          <View style={[
                            styles.curriculumProgressBarFill,
                            { width: `${mPercent}%`, backgroundColor: mFillColor, borderRadius: 3 },
                          ]} />
                        </View>

                        {/* BADGE STATUS DIPINDAHKAN KE BAWAH BAR PROGRESS */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                          <View style={[
                            styles.curriculumModalStatusBadge,
                            mDone
                              ? styles.statusBadgeGreen
                              : mMurajaah
                              ? styles.statusBadgeOrange
                              : mProgress
                              ? { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD', borderWidth: 1 }
                              : styles.statusBadgeGray,
                          ]}>
                            <Text style={[
                              styles.curriculumModalStatusText,
                              mDone
                                ? styles.statusTextGreen
                                : mMurajaah
                                ? styles.statusTextOrange
                                : mProgress
                                ? { color: '#0369A1', fontWeight: '700' }
                                : styles.statusTextGray,
                            ]}>
                              {selectedCurriculumSurah?.statusLabel}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })()}

                {/* Section Riwayat Setoran Ananda untuk Surah Ini */}
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialCommunityIcons name="history" size={16} color="#065F46" />
                      <Text style={styles.curriculumSectionTitle}>
                        Riwayat Setoran Ananda
                      </Text>
                    </View>
                    <View style={styles.curriculumCountPill}>
                      <Text style={styles.curriculumCountPillText}>
                        {selectedCurriculumSurah?.matchedLogs?.length || 0} Setoran
                      </Text>
                    </View>
                  </View>

                  {selectedCurriculumSurah?.matchedLogs && selectedCurriculumSurah.matchedLogs.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      {selectedCurriculumSurah.matchedLogs.map((l: any, idx: number) => {
                        const parsed = parseLogSurahAndVerses(l, quranSurahs);
                        const dateStr = l.record_date || l.date ? formatDate(l.record_date || l.date) : '-';
                        const teacherName = l.teacher?.full_name || l.teacher?.nama_lengkap || l.teacher_name || l.pengampu || '-';
                        const notes = l.notes_teacher || l.catatan || l.notes_parent;
                        const nilai = l.nilai || l.tajwid_label || l.status || 'Lancar';
                        const jenis = getLogJenis(l);

                        return (
                          <View key={String(l.id || idx)} style={styles.curriculumLogCard}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[styles.curriculumLogIndexBox]}>
                                  <Text style={styles.curriculumLogIndexText}>#{idx + 1}</Text>
                                </View>
                                <Text style={styles.curriculumLogDateText}>{dateStr}</Text>
                              </View>
                              <View style={[
                                styles.curriculumLogJenisBadge,
                                jenis === 'ziyadah' ? styles.jenisBadgeZiyadah : jenis === 'murajaah' ? styles.jenisBadgeMurajaah : styles.jenisBadgeTilawah,
                              ]}>
                                <Text style={styles.curriculumLogJenisText}>
                                  {jenis === 'ziyadah' ? 'Hafalan Baru' : jenis === 'murajaah' ? 'Murajaah' : 'Tilawah'}
                                </Text>
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <MaterialCommunityIcons name="book-open-outline" size={14} color="#059669" />
                                <Text style={styles.curriculumLogAyatText}>
                                  {parsed.aStart && parsed.aEnd ? `Ayat ${parsed.aStart} – ${parsed.aEnd} (${parsed.aEnd - parsed.aStart + 1} Ayat)` : 'Setoran Lengkap'}
                                </Text>
                              </View>
                              <View style={styles.curriculumLogNilaiBadge}>
                                <Text style={styles.curriculumLogNilaiText}>{nilai}</Text>
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                              <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" />
                              <Text style={styles.curriculumLogTeacherText}>Penguji: {teacherName}</Text>
                            </View>

                            {notes ? (
                              <View style={styles.curriculumLogNotesBox}>
                                <MaterialCommunityIcons name="comment-text-outline" size={12} color="#047857" />
                                <Text style={styles.curriculumLogNotesText}>{notes}</Text>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.curriculumEmptyLogsCard}>
                      <MaterialCommunityIcons name="calendar-clock" size={32} color="#94A3B8" />
                      <Text style={styles.curriculumEmptyLogsTitle}>Belum Ada Catatan Setoran</Text>
                      <Text style={styles.curriculumEmptyLogsSub}>
                        Surah {selectedCurriculumSurah?.nama} terdaftar dalam kurikulum hafalan aktif ananda pada semester ini dan belum pernah disetorkan.
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Footer Buttons */}
            {(() => {
              const surahNeedsMurajaah = Boolean(
                selectedCurriculumSurah?.isNeedsMurajaah ||
                selectedCurriculumSurah?.matchedLogs?.some((l: any) => isSetoranNeedsMurajaah(l))
              );

              return (
                <View style={[styles.dateRangeModalFooterRow, { marginTop: 12 }]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedCurriculumSurah(null)}
                    style={[
                      styles.dateRangeCancelBtn,
                      { flex: 1, alignItems: 'center', justifyContent: 'center' },
                      !surahNeedsMurajaah && { backgroundColor: '#064E3B', borderWidth: 0, paddingVertical: 13, borderRadius: 14 },
                    ]}
                  >
                    <Text style={[styles.dateRangeCancelBtnText, !surahNeedsMurajaah && { color: '#FFFFFF', fontWeight: '800', fontSize: 14 }]}>
                      Tutup
                    </Text>
                  </TouchableOpacity>

                  {surahNeedsMurajaah && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        const s = selectedCurriculumSurah;
                        setSelectedCurriculumSurah(null);
                        setTimeout(() => {
                          openInputMurajaahModal({
                            hafalan_surah_number: s.nomor,
                            hafalan_surah_name: s.nama,
                            hafalan_ayah_start: 1,
                            hafalan_ayah_end: Math.min(s.ayat || 10, 10),
                          });
                        }, 250);
                      }}
                      style={[styles.dateRangeApplyBtn, { flex: 1.8 }]}
                    >
                      <MaterialCommunityIcons name="repeat" size={16} color="#FFFFFF" />
                      <Text style={styles.dateRangeApplyBtnText}>Latihan Murajaah</Text>
                    </TouchableOpacity>
                  )}
                </View>
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
          onConfirm={feedbackModal.onConfirm}
          onClose={() => {
            const cb = feedbackModal.onConfirm;
            setFeedbackModal(null);
            if (cb) cb();
          }}
        />
      )}
    </View>
  );

}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#044E36',
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
  containerBlock: {
    marginBottom: 16,
  },
  // Grouped Card Container & Header with Distinct Themed Colors
  tahfizhGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1.5,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tahfizhGroupCardEmerald: {
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
  },
  tahfizhGroupCardBlue: {
    borderColor: '#BFDBFE',
    shadowColor: '#2563EB',
  },
  tahfizhGroupCardIndigo: {
    borderColor: '#C7D2FE',
    shadowColor: '#4F46E5',
  },
  tahfizhGroupCardPurple: {
    borderColor: '#E9D5FF',
    shadowColor: '#7C3AED',
  },
  tahfizhGroupCardAmber: {
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
  },
  tahfizhGroupCardTeal: {
    borderColor: '#99F6E4',
    shadowColor: '#0D9488',
  },

  // Card Header Row styles
  tahfizhGroupCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 11,
    borderRadius: 13,
    borderWidth: 1,
  },
  tahfizhGroupCardHeaderRowEmerald: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  tahfizhGroupCardHeaderRowBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  tahfizhGroupCardHeaderRowIndigo: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  tahfizhGroupCardHeaderRowPurple: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  tahfizhGroupCardHeaderRowAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  tahfizhGroupCardHeaderRowTeal: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
  },

  // Card Header Left (Icon + Titles)
  tahfizhGroupCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    marginRight: 8,
  },
  tahfizhGroupHeaderIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  tahfizhGroupHeaderIconBoxEmerald: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  tahfizhGroupHeaderIconBoxBlue: {
    backgroundColor: '#0284C7',
    shadowColor: '#0284C7',
  },
  tahfizhGroupHeaderIconBoxIndigo: {
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
  },
  tahfizhGroupHeaderIconBoxPurple: {
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
  },
  tahfizhGroupHeaderIconBoxAmber: {
    backgroundColor: '#D97706',
    shadowColor: '#D97706',
  },
  tahfizhGroupHeaderIconBoxTeal: {
    backgroundColor: '#0D9488',
    shadowColor: '#0D9488',
  },

  // Card Header Titles
  tahfizhGroupCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  tahfizhGroupCardSub: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 2,
  },

  // Card Header Action Badge (Right side)
  tahfizhGroupActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  tahfizhGroupActionBadgeEmerald: {
    backgroundColor: '#FFFFFF',
    borderColor: '#A7F3D0',
  },
  tahfizhGroupActionBadgeBlue: {
    backgroundColor: '#FFFFFF',
    borderColor: '#BFDBFE',
  },
  tahfizhGroupActionBadgeIndigo: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C7D2FE',
  },
  tahfizhGroupActionBadgePurple: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E9D5FF',
  },
  tahfizhGroupActionBadgeAmber: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FDE68A',
  },
  tahfizhGroupActionBadgeTeal: {
    backgroundColor: '#FFFFFF',
    borderColor: '#99F6E4',
  },
  tahfizhGroupActionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  studentContainerBlock: {
    marginBottom: 8,
  },
  singleHeroCardContainer: {
    width: '100%',
    alignSelf: 'stretch',
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
    borderRadius: 26,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#022C22',
    shadowOpacity: 0.30,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeSingle: {
    width: '100%',
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#022C22',
    shadowOpacity: 0.30,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
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
  selectedActionBtnText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
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
  studentAttrDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  // Card Ananda Tahfizh Stats Row
  cardTahfizhStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    zIndex: 1,
  },
  cardTahfizhStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  cardTahfizhStatIconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardTahfizhStatLabel: {
    fontSize: 9,
    color: '#A7F3D0',
    fontWeight: '700',
  },
  cardTahfizhStatVal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardTahfizhStatDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },

  // Hero KPI Cards
  heroKpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  heroKpiCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  progressCircleBox: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircleRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircleText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#047857',
  },
  heroKpiContentCol: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  heroKpiTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroKpiSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  heroProgressBarTrack: {
    height: 4.5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginTop: 5,
    overflow: 'hidden',
  },
  heroProgressBarFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 3,
  },
  targetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  heroKpiTargetLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  heroKpiTargetValue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  heroKpiTargetSub: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },

  // Main Segmented Switcher (Riwayat Setoran vs Daftar Target)
  segmentedTabWrapper: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  segmentedTabContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedTabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  segmentedTabItemActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  segmentedTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentedTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Target Tab Content
  targetTabContent: {
    marginTop: 4,
  },
  targetHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 4,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  targetHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  targetHeaderSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  targetTotalBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  targetTotalBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16A34A',
  },

  // Setoran Row Card (Matching Reference Image)
  setoranRowCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  calendarIconBox: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  setoranInfoCol: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  setoranSurahText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  setoranMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  setoranSubText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
  },
  setoranRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  setoranDateText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginRight: 2,
  },
  setoranStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setoranStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadgeGreen: {
    backgroundColor: '#DCFCE7',
  },
  statusTextGreen: {
    color: '#16A34A',
  },
  statusBadgeOrange: {
    backgroundColor: '#FEF3C7',
  },
  statusTextOrange: {
    color: '#D97706',
  },
  statusBadgeBlue: {
    backgroundColor: '#E0F2FE',
  },
  statusTextBlue: {
    color: '#0284C7',
  },
  statusBadgeGray: {
    backgroundColor: '#F1F5F9',
  },
  statusTextGray: {
    color: '#64748B',
  },
  statusBadgeRed: {
    backgroundColor: '#FFE4E6',
  },
  statusTextRed: {
    color: '#E11D48',
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

  // KPI Grid Styles
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 3,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiIconBox: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiValueText: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
  },
  kpiTitleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  kpiSubText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  progressBarTrack: {
    height: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },

  // Hafalan Terakhir (Integrated in Hero Card)
  cardLatestHafalanBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    padding: 13,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  cardLatestHafalanBoxActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  cardLatestHafalanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardLatestTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  cardLatestTagBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  cardLatestTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#059669',
  },
  cardLatestTagTextActive: {
    color: '#DEF7EC',
  },
  cardLatestDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardLatestDateText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  cardLatestDateTextActive: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  cardLatestSurahText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  cardLatestTeacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  cardLatestTeacherText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    flex: 1,
  },
  cardLatestTeacherTextActive: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  cardLatestQuoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#18A165',
  },
  cardLatestQuoteBoxActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderLeftColor: '#FFFFFF',
  },
  cardLatestQuoteText: {
    fontSize: 10.5,
    fontStyle: 'italic',
    color: '#064E3B',
    flex: 1,
    lineHeight: 15,
  },

  // Search & Filter
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  tabCardScrollTrack: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 4,
    marginBottom: 4,
  },
  carouselDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  carouselDotsRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 6,
  },
  carouselDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  carouselDotActive: {
    width: 20,
    backgroundColor: '#059669',
  },
  carouselDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
  },
  carouselDotSmallActive: {
    width: 16,
    backgroundColor: '#059669',
  },
  tabCardItem: {
    width: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  tabCardItemActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 5,
  },
  tabCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tabCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  tabCardIconWrapActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabCardCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tabCardCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabCardCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  tabCardCountTextActive: {
    color: '#FFFFFF',
  },
  tabCardLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  tabCardLabelActive: {
    color: '#FFFFFF',
  },
  tabCardSub: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  tabCardSubActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },

  // Setoran Log Cards
  logCardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  logCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  logCardSurahText: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  logCardBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  verseRangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  verseRangeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillGood: {
    backgroundColor: '#DEF7EC',
  },
  statusPillNeutral: {
    backgroundColor: '#E0F2FE',
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  statusPillTextGood: {
    color: '#047857',
  },
  statusPillTextNeutral: {
    color: '#0284C7',
  },
  logCardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  logMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logMetaText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  logNoteBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderLeftWidth: 2.5,
    borderLeftColor: '#18A165',
  },
  logNoteText: {
    fontSize: 11,
    color: '#334155',
    fontStyle: 'italic',
  },

  // Loading & Empty states
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyCardBox: {
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#334155',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 2,
  },

  // Filter Group Styles
  filterGroupContainer: {
    marginTop: 2,
    marginBottom: 14,
  },
  filterRowWrapper: {
    gap: 8,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  filterHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    marginRight: 8,
  },
  filterHeaderIconBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  filterSectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
    letterSpacing: 0.2,
    lineHeight: 18,
  },
  resetMiniBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 7,
  },
  resetMiniBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTrack: {
    gap: 7,
    paddingVertical: 3,
  },
  filterChipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7.5,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filterChipItemActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  activeFilterSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginTop: 2,
  },
  activeFilterSummaryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
    flex: 1,
    marginRight: 8,
  },
  resetFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  resetFilterBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0D7A48',
  },

  // Detail Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 44, 34, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    padding: 20,
    paddingBottom: 28,
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
  },
  modalHeaderIconBox: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  modalHeaderTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInfoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  modalInfoLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInfoValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
    marginTop: 2,
  },
  modalInfoSub: {
    fontSize: 11.5,
    color: '#059669',
    fontWeight: '700',
    marginTop: 3,
  },
  modalActionBtn: {
    backgroundColor: '#059669',
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  modalActionBtnText: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },

  // Status Pill Pending
  statusPillPending: {
    backgroundColor: '#FEF3C7',
  },
  statusPillTextPending: {
    color: '#D97706',
  },

  // Instruction Card Murajaah
  murajaahInstructionCard: {
    marginVertical: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  murajaahInstructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  murajaahInstructionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  murajaahInstructionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  murajaahInstructionSub: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 1,
    fontWeight: '500',
  },
  instructionStepsList: {
    marginTop: 8,
    gap: 6,
  },
  instructionStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#18A165',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: 11,
    color: '#334155',
    lineHeight: 16,
  },

  // Modal Input Styles
  inputGroupBlock: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  inputGroupLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  subFieldLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
    marginBottom: 4,
  },
  surahSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    height: 36,
    gap: 6,
    marginBottom: 6,
  },
  surahSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    paddingVertical: 0,
  },
  surahChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
  },
  surahChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  surahChipNumber: {
    fontSize: 10,
    fontWeight: '900',
    color: '#18A165',
  },
  surahChipNumberActive: {
    color: '#FFFFFF',
  },
  surahChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  surahChipTextActive: {
    color: '#FFFFFF',
  },
  selectedSurahBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    gap: 10,
  },
  surahNumberCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#18A165',
    alignItems: 'center',
    justifyContent: 'center',
  },
  surahNumberCircleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  selectedSurahName: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#065F46',
  },
  selectedSurahMeaning: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 2,
    fontWeight: '600',
  },
  btnToggleMushaf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#18A165',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnToggleMushafActive: {
    backgroundColor: '#18A165',
  },
  btnToggleMushafText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },
  btnToggleMushafTextActive: {
    color: '#FFFFFF',
  },

  // Mushaf Reader Section
  mushafViewerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  mushafViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 8,
  },
  mushafViewerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  ayatCardItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  ayatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  ayatNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  ayatNumberText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669',
  },
  ayatArabicText: {
    flex: 1,
    fontSize: 18,
    textAlign: 'right',
    color: '#0F172A',
    fontWeight: '700',
    lineHeight: 32,
  },
  ayatLatinText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 4,
  },
  ayatIndoText: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },

  // Inputs
  numberInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  textInputWithIcon: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  textInputArea: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 10,
    fontSize: 12,
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  approvalNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#E0F2FE',
    borderRadius: 10,
    padding: 10,
  },
  approvalNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#0369A1',
    lineHeight: 16,
    fontWeight: '500',
  },

  // Category Badge in card
  categoryBadge: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  categoryBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },

  // Section Subtitle
  sectionSubtitle: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },

  // Section 3: Laporan & Rekapitulasi Header
  rekapSectionHeader: {
    marginBottom: 12,
  },
  rekapHeaderMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rekapHeaderIconBox: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  rekapHeaderTitleCol: {
    flex: 1,
  },
  rekapMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3,
  },
  rekapUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    maxWidth: 220,
    flexShrink: 1,
  },
  rekapUnitBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  rekapMetaDot: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
  },
  rekapSubtitleText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },

  // History Section Header
  historySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  historyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  historySubCaption: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },

  // Grade Journey Chips (Tingkat Perjalanan Kelas Ananda)
  gradeJourneyWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 12,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  gradeJourneyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gradeJourneyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  gradeJourneyActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  gradeJourneyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  gradeJourneyActivePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  gradeJourneyScrollTrack: {
    gap: 8,
    paddingVertical: 2,
  },
  gradeJourneyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  gradeJourneyChipSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 4,
  },
  gradeJourneyChipCurrent: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  gradeJourneyChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  gradeJourneyChipTextSelected: {
    color: '#FFFFFF',
  },
  activeTagBadge: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  activeTagBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  activeTagBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
  },
  activeTagBadgeTextSelected: {
    color: '#FFFFFF',
  },
  tuntasMiniText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#10B981',
  },
  tuntasMiniTextSelected: {
    color: '#D1FAE5',
  },

  // Past Grade Summary Card (Hanya Menampilkan Jumlah yang Telah Di-Tahfizh)
  pastGradeContainer: {
    marginBottom: 16,
  },
  pastGradeCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
  pastGradeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  pastGradeBadgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  pastGradeCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#064E3B',
  },
  pastGradeCardSub: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '500',
    marginTop: 2,
  },
  tuntasBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  tuntasBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  highlightTahfizhBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 12,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 3,
  },
  highlightTahfizhHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  highlightTahfizhLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  highlightTahfizhValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginVertical: 4,
  },
  highlightTahfizhNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: '#059669',
  },
  highlightTahfizhUnit: {
    fontSize: 14,
    fontWeight: '800',
    color: '#047857',
  },
  highlightTahfizhNote: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  pastGradeMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  pastGradeMetricCell: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  pastGradeCellIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  pastGradeCellLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  pastGradeCellVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  pastGradeNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#DEF7EC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  pastGradeNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#065F46',
    lineHeight: 16,
    fontWeight: '500',
  },
  pastGradeReturnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 20,
    paddingVertical: 13,
    paddingHorizontal: 20,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 10,
    elevation: 5,
  },
  pastGradeReturnBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  activeMurajaahTaskCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  activeMurajaahTaskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeMurajaahTaskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeMurajaahTaskBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  activeMurajaahStatusPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  activeMurajaahStatusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#D97706',
  },
  activeMurajaahTaskTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#78350F',
    marginBottom: 4,
  },
  activeMurajaahTaskDesc: {
    fontSize: 11.5,
    color: '#92400E',
    lineHeight: 16,
    marginBottom: 12,
  },
  activeMurajaahTaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 18,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 3,
  },
  activeMurajaahTaskBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  activeMurajaahSentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  activeMurajaahSentText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0369A1',
    flex: 1,
  },
  viewModeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  viewModeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 6,
  },
  viewModeTabBtnActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 0,
  },
  viewModeTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  viewModeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  surahGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    shadowColor: '#065F46',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  surahGroupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#ECFDF5',
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  surahGroupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  surahGroupNumberCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#059669',
    borderWidth: 1,
    borderColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
  },
  surahGroupNumberCircleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  surahGroupNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  juzMiniBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  juzMiniBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  modalJuzBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  modalJuzBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  surahGroupSubText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  surahGroupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  surahTotalPill: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  surahTotalPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  surahGroupBody: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
  },
  surahSubItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  surahSubItemLeft: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  surahSubItemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  surahSubItemAyat: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  surahSubItemMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1.5,
  },
  detailAyatSectionBox: {
    backgroundColor: '#F8FCF9',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  detailAyatSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailAyatSectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#065F46',
  },
  detailAyatCountPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  detailAyatCountPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  detailAyatSectionSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 6,
  },
  detailAyatLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
  },
  detailAyatLoadingText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  detailAyatErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
  },
  detailAyatErrorText: {
    fontSize: 11.5,
    color: '#DC2626',
    flex: 1,
  },
  detailAyatEmptyBox: {
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
  },
  detailAyatEmptyText: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
  },
  detailAyahItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  detailAyahNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  detailAyahNumberBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  detailAyahNumberBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  detailAyahArabText: {
    fontSize: 21,
    lineHeight: 38,
    color: '#064E3B',
    textAlign: 'right',
    writingDirection: 'rtl',
    fontWeight: '500',
    marginBottom: 8,
  },
  detailAyahLatinText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#059669',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  detailAyahArtiText: {
    fontSize: 11.5,
    lineHeight: 17,
    color: '#334155',
  },
  numberInputLocked: {
    backgroundColor: '#F0FDF4',
    borderColor: '#A7F3D0',
    color: '#065F46',
    fontWeight: '800',
  },
  inputWithIconLocked: {
    backgroundColor: '#F0FDF4',
    borderColor: '#A7F3D0',
  },
  textInputWithIconLocked: {
    color: '#065F46',
    fontWeight: '700',
  },
  modalHeaderStyledContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  modalHeaderStyledIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  modalHeaderStyledTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#065F46',
  },
  modalHeaderStyledSubtitle: {
    fontSize: 11.5,
    color: '#047857',
    fontWeight: '600',
    marginTop: 1,
  },
  modalHeaderStyledCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherNoteCalloutBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 18,
    padding: 13,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  teacherNoteCalloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  teacherNoteIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherNoteCalloutLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
  },
  teacherNoteCalloutAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  teacherNoteRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  teacherNoteRoleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  teacherNoteContentBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  teacherNoteCalloutText: {
    flex: 1,
    fontSize: 12,
    color: '#064E3B',
    fontStyle: 'italic',
    lineHeight: 18,
    fontWeight: '500',
  },
  parentNoteCalloutBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 18,
    padding: 13,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  parentNoteCalloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  parentNoteIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentNoteCalloutLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  parentNoteCalloutAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  parentNoteRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  parentNoteRoleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  parentNoteContentBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  parentNoteCalloutText: {
    flex: 1,
    fontSize: 12,
    color: '#78350F',
    fontStyle: 'italic',
    lineHeight: 18,
    fontWeight: '500',
  },
  // Date Range Picker Modal Styles
  dateRangeSectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 2,
  },
  presetTrack: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  presetChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  calendarCardContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 4,
  },
  calendarNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#065F46',
  },
  calendarTodayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    borderWidth: 0.8,
    borderColor: '#BAE6FD',
  },
  calendarTodayBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0369A1',
  },
  calendarDayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarDayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarGridCell: {
    width: '14.28%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  calendarGridCellInRange: {
    backgroundColor: '#D1FAE5',
  },
  calendarGridCellStart: {
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: '#D1FAE5',
  },
  calendarGridCellEnd: {
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: '#D1FAE5',
  },
  calendarCellInner: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellInnerToday: {
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  calendarCellInnerEndpoint: {
    backgroundColor: '#10B981',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  calendarCellText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  calendarCellTextInactive: {
    color: '#94A3B8',
  },
  calendarCellTextToday: {
    color: '#059669',
    fontWeight: '800',
  },
  calendarCellTextInRange: {
    color: '#065F46',
    fontWeight: '800',
  },
  calendarCellTextEndpoint: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  cellStartMarker: {
    position: 'absolute',
    bottom: -2,
    paddingHorizontal: 3,
    borderRadius: 3,
    backgroundColor: '#047857',
  },
  cellEndMarker: {
    position: 'absolute',
    bottom: -2,
    paddingHorizontal: 3,
    borderRadius: 3,
    backgroundColor: '#065F46',
  },
  cellMarkerText: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  rangeSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 10,
    marginTop: 4,
  },
  rangeSummarySide: {
    flex: 1,
  },
  rangeSummaryLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  rangeDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  rangeDatePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  rangeArrowWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rangeDurationBadge: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    borderWidth: 0.8,
    borderColor: '#86EFAC',
  },
  rangeDurationBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
  },
  dateRangeModalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  dateRangeResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateRangeResetBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  dateRangeCancelBtn: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  dateRangeCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  dateRangeApplyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#10B981',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  dateRangeApplyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Target Kurikulum & Filter Styles
  juzFilterTrack: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  juzFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  juzFilterChipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#6D28D9',
  },
  juzFilterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B21A8',
  },
  juzFilterChipTextActive: {
    color: '#FFFFFF',
  },
  curriculumSortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  curriculumSortBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  curriculumSurahCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
  },
  curriculumMiniProgressBarBg: {
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
    width: '100%',
  },
  curriculumMiniProgressBarFill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 4,
  },

  // Modal Detail Kurikulum Styles
  curriculumModalHeroCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 16,
    padding: 14,
  },
  curriculumModalSurahTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#065F46',
  },
  curriculumSurahNumBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  curriculumSurahNumText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  curriculumModalSurahArti: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#047857',
    marginTop: 2,
  },
  curriculumModalSurahArab: {
    fontSize: 22,
    fontWeight: '700',
    color: '#065F46',
  },
  curriculumModalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  curriculumModalBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  curriculumModalStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  curriculumModalStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  curriculumProgressLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  curriculumProgressVal: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
  },
  curriculumProgressBarBg: {
    height: 7,
    backgroundColor: '#D1FAE5',
    borderRadius: 7,
    overflow: 'hidden',
  },
  curriculumProgressBarFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 7,
  },
  curriculumSectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  curriculumCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  curriculumCountPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  curriculumLogCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 11,
  },
  curriculumLogIndexBox: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  curriculumLogIndexText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  curriculumLogDateText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  curriculumLogJenisBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  curriculumLogJenisText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  jenisBadgeZiyadah: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  jenisBadgeMurajaah: {
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  jenisBadgeTilawah: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  curriculumLogAyatText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  curriculumLogNilaiBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
  },
  curriculumLogNilaiText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
  },
  curriculumLogTeacherText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  curriculumLogNotesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderLeftWidth: 3,
    borderLeftColor: '#059669',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 6,
  },
  curriculumLogNotesText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
    lineHeight: 15,
  },
  curriculumEmptyLogsCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    gap: 8,
  },
  curriculumEmptyLogsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  curriculumEmptyLogsSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
  },
});

