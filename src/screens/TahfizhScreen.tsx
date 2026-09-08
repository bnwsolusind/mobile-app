import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { isParentRole } from '../utils/roles';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

// Helper untuk mengekstrak surah dan rentang ayat yang spesifik dari riwayat/catatan log
const parseLogSurahAndVerses = (log: any, allSurahs: any[] = []) => {
  if (!log) {
    return {
      surahNum: 1,
      surahName: 'Al-Fatihah',
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
  const finalEnd = (aEnd !== null && !isNaN(aEnd) && aEnd >= finalStart)
    ? aEnd
    : (matchedSurah?.jumlah_ayat ? Math.min(10, matchedSurah.jumlah_ayat) : 10);

  return {
    surahNum: surahNum ? Number(surahNum) : null,
    surahName: surahName || 'Al-Fatihah',
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

  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const studentScrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [kpiData, setKpiData] = useState<any>(null);
  const [targetData, setTargetData] = useState<any>(null);
  const [tahfizhAchievement, setTahfizhAchievement] = useState<any>(null);
  const [pendingHomeMurajaah, setPendingHomeMurajaah] = useState<any>(null);
  const [isMurajaahLockedByTeacher, setIsMurajaahLockedByTeacher] = useState(false);

  // Filter & Search states
  const [mainTab, setMainTab] = useState<'history' | 'target'>('history');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'ziyadah' | 'murajaah' | 'tilawah'>('all');
  const [selectedLogDetail, setSelectedLogDetail] = useState<any>(null);

  // Filter Tingkat Kelas Ananda (Perjalanan dari Kelas 1 s/d Kelas Berjalan Saat Ini)
  const [gradeJourney, setGradeJourney] = useState<any[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<number | 'all' | null>(null);
  const [currentGradeNum, setCurrentGradeNum] = useState<number | null>(null);
  const currentGradeLabel = currentGradeNum !== null ? `Kelas ${currentGradeNum}` : 'Kelas belum tersedia';

  // Filter Periode Waktu di Kelas Aktif (Harian, Mingguan, Bulanan, Semester)
  const [timePeriodFilter, setTimePeriodFilter] = useState<'all' | 'today' | 'week' | 'month' | 'semester' | 'year'>('all');
  const [activeTabScrollIndex, setActiveTabScrollIndex] = useState(0);
  const [activeFilterScrollIndex, setActiveFilterScrollIndex] = useState(0);
  const tabCardScrollRef = useRef<ScrollView>(null);
  const filterScrollRef = useRef<ScrollView>(null);
  const tabCardOffsetsRef = useRef<number[]>([]);
  const filterOffsetsRef = useRef<number[]>([]);

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

  const openInputMurajaahModal = (prefillLog?: any, isLocked: boolean = false) => {
    setIsMurajaahLockedByTeacher(isLocked);
    const now = new Date();
    setInputDate(prefillLog?.record_date || prefillLog?.date || now.toISOString().split('T')[0]);

    const prefillTime = prefillLog?.metadata?.murajaah_time ||
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setInputTime(prefillTime);
    setInputNotes(prefillLog?.notes_parent || '');
    setInputLembar(String(prefillLog?.murajaah_lembar || '1.0'));

    if (prefillLog) {
      // Ekstraksi surah dan ayat yang spesifik dari card yang diklik
      const parsed = parseLogSurahAndVerses(prefillLog, quranSurahs);
      setInputAyatStart(String(parsed.aStart));
      setInputAyatEnd(String(parsed.aEnd));
      setIsSelectingDifferentSurah(false);

      if (parsed.matchedSurah) {
        setSelectedSurah(parsed.matchedSurah);
        void loadSurahVerses(parsed.matchedSurah.nomor);
      } else {
        setSelectedSurah({
          nomor: parsed.surahNum || 1,
          nama_latin: parsed.surahName,
          nama: '',
          jumlah_ayat: 300,
          arti: '',
          tempat_turun: '',
        });
        if (parsed.surahNum) {
          void loadSurahVerses(parsed.surahNum);
        }
      }
      setShowMushafViewer(true);
    } else {
      setIsSelectingDifferentSurah(true);
      setShowMushafViewer(false);
      if (!selectedSurah && quranSurahs.length > 0) {
        setSelectedSurah(quranSurahs[0]);
        setInputAyatStart('1');
        setInputAyatEnd(String(Math.min(10, quranSurahs[0].jumlah_ayat || 10)));
      }
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
              }
            } else if (!selectedSurah) {
              setSelectedSurah(list[0]);
              setInputAyatStart('1');
              setInputAyatEnd(String(Math.min(10, list[0].jumlah_ayat || 10)));
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
    const nextState = !showMushafViewer;
    setShowMushafViewer(nextState);
    if (nextState && selectedSurah) {
      void loadSurahVerses(selectedSurah.nomor);
    }
  };

  const handleSubmitMurajaah = async () => {
    if (!selectedSurah) {
      Alert.alert('Pilih Surah', 'Silakan pilih surah yang dimurajaahkan terlebih dahulu.');
      return;
    }
    const aStart = parseInt(inputAyatStart, 10);
    const aEnd = parseInt(inputAyatEnd, 10);

    if (isNaN(aStart) || aStart < 1) {
      Alert.alert('Ayat Tidak Valid', 'Nomor ayat awal minimal 1.');
      return;
    }
    if (isNaN(aEnd) || aEnd < aStart) {
      Alert.alert('Ayat Tidak Valid', 'Nomor ayat akhir harus lebih besar atau sama dengan ayat mulai.');
      return;
    }
    if (selectedSurah.jumlah_ayat && aEnd > selectedSurah.jumlah_ayat) {
      Alert.alert(
        'Melebihi Jumlah Ayat',
        `Surah ${selectedSurah.nama_latin} hanya memiliki ${selectedSurah.jumlah_ayat} ayat.`
      );
      return;
    }

    const currentStudentId = selectedChildId || (studentInfo?.id ? String(studentInfo.id) : undefined);
    if (!currentStudentId) {
      Alert.alert('Pilih Siswa', 'Silakan pilih ananda/siswa terlebih dahulu.');
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
      Alert.alert(
        'Alhamdulillah! 🌟',
        res?.message || 'Laporan setoran murajaah mandiri di rumah telah berhasil disimpan dan diteruskan ke Guru/Ustadz Tahfizh untuk verifikasi.',
        [{ text: 'OK', onPress: () => {
          setIsInputModalVisible(false);
          void loadTahfizhData();
        }}]
      );
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || 'Gagal menyimpan setoran murajaah. Silakan periksa koneksi internet Anda.';
      Alert.alert('Gagal Mengirim', errorMsg);
    } finally {
      setIsSubmittingMurajaah(false);
    }
  };


  // 1. Fetch children if parent role with offline cache
  const loadChildren = useCallback(async () => {
    if (!isParent) return;
    const targetChildId = route?.params?.child_id;
    const childCacheKey = offlineCache.buildKey('tahfizh_children', user?.id);
    const cached = await offlineCache.get<any[]>(childCacheKey);
    if (cached && cached.length > 0) {
      const filteredCached = targetChildId
        ? cached.filter((c) => String(c.id) === String(targetChildId))
        : cached;
      setChildren(filteredCached.length > 0 ? filteredCached : cached);
      setSelectedChildId(targetChildId ? String(targetChildId) : ((prev: any) => prev || String(cached[0].id)));
    }

    try {
      const res = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<any[]>(res) || [];
      if (Array.isArray(list) && list.length > 0) {
        const filteredList = targetChildId
          ? list.filter((c) => String(c.id) === String(targetChildId))
          : list;
        setChildren(filteredList.length > 0 ? filteredList : list);
        setSelectedChildId(targetChildId ? String(targetChildId) : ((prev: any) => prev || String(list[0].id)));
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

  const targetSemester = targetData?.surah_target || kpiData?.target_surah || (totalAyat > 0 ? 'Target Kurikulum' : '-');
  const targetSurah = targetSemester;
  const targetAyat = Number(tahfizhAchievement?.target_ayah || targetData?.target_ayat || kpiData?.target_ayat || 0);

  // Persentase progress hafalan (identik dengan achievement_percentage di web-dashboard)
  const targetProgress = useMemo(() => {
    if (tahfizhAchievement?.achievement_percentage !== undefined && tahfizhAchievement?.achievement_percentage !== null) {
      return Math.round(Number(tahfizhAchievement.achievement_percentage));
    }
    return targetAyat > 0 ? Math.min(100, Math.round((totalAyat / targetAyat) * 100)) : (totalAyat > 0 ? 100 : 0);
  }, [tahfizhAchievement, targetAyat, totalAyat]);

  const targetProgressExact = useMemo(() => {
    if (tahfizhAchievement?.achievement_percentage !== undefined && tahfizhAchievement?.achievement_percentage !== null) {
      return Number(tahfizhAchievement.achievement_percentage).toFixed(2);
    }
    return targetAyat > 0 ? ((totalAyat / targetAyat) * 100).toFixed(2) : '0';
  }, [tahfizhAchievement, targetAyat, totalAyat]);

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
    // Tarik daftar surah Juz 30 dinamis dari quranSurahs API backend jika sudah tersedia
    const apiJuz30 = Array.isArray(quranSurahs) && quranSurahs.length > 0
      ? quranSurahs
          .filter((s) => Number(s.nomor) >= 78 && Number(s.nomor) <= 114)
          .map((s) => ({
            nomor: Number(s.nomor),
            nama: s.nama_latin || s.nama || `Surah ${s.nomor}`,
            ayat: Number(s.jumlah_ayat || 0),
          }))
      : [];

    const defaultJuz30 = [
      { nomor: 78, nama: "An-Naba'", ayat: 40 },
      { nomor: 79, nama: "An-Nazi'at", ayat: 46 },
      { nomor: 80, nama: "'Abasa", ayat: 42 },
      { nomor: 81, nama: "At-Takwir", ayat: 29 },
      { nomor: 82, nama: "Al-Infithar", ayat: 19 },
      { nomor: 83, nama: "Al-Muthaffifin", ayat: 36 },
      { nomor: 84, nama: "Al-Insyiqaq", ayat: 25 },
      { nomor: 85, nama: "Al-Buruj", ayat: 22 },
      { nomor: 86, nama: "Ath-Thariq", ayat: 17 },
      { nomor: 87, nama: "Al-A'la", ayat: 19 },
      { nomor: 88, nama: "Al-Ghasyiyah", ayat: 26 },
      { nomor: 89, nama: "Al-Fajr", ayat: 30 },
      { nomor: 90, nama: "Al-Balad", ayat: 20 },
      { nomor: 91, nama: "Asy-Syams", ayat: 15 },
      { nomor: 92, nama: "Al-Lail", ayat: 21 },
      { nomor: 93, nama: "Adh-Dhuha", ayat: 11 },
      { nomor: 94, nama: "Asy-Syarh", ayat: 8 },
      { nomor: 95, nama: "At-Tin", ayat: 8 },
      { nomor: 96, nama: "Al-'Alaq", ayat: 19 },
      { nomor: 97, nama: "Al-Qadr", ayat: 5 },
      { nomor: 98, nama: "Al-Bayyinah", ayat: 8 },
      { nomor: 99, nama: "Az-Zalzalah", ayat: 8 },
      { nomor: 100, nama: "Al-'Adiyat", ayat: 11 },
      { nomor: 101, nama: "Al-Qari'ah", ayat: 11 },
      { nomor: 102, nama: "At-Takatsur", ayat: 8 },
      { nomor: 103, nama: "Al-'Ashr", ayat: 3 },
      { nomor: 104, nama: "Al-Humazah", ayat: 9 },
      { nomor: 105, nama: "Al-Fil", ayat: 5 },
      { nomor: 106, nama: "Quraisy", ayat: 4 },
      { nomor: 107, nama: "Al-Ma'un", ayat: 7 },
      { nomor: 108, nama: "Al-Kautsar", ayat: 3 },
      { nomor: 109, nama: "Al-Kafirun", ayat: 6 },
      { nomor: 110, nama: "An-Nashr", ayat: 3 },
      { nomor: 111, nama: "Al-Lahab", ayat: 5 },
      { nomor: 112, nama: "Al-Ikhlas", ayat: 4 },
      { nomor: 113, nama: "Al-Falaq", ayat: 5 },
      { nomor: 114, nama: "An-Nas", ayat: 6 },
    ];

    const sourceSurahs = apiJuz30.length > 0 ? apiJuz30 : defaultJuz30;

    const completedSet = new Set(
      logs.map((l) => {
        const p = parseLogSurahAndVerses(l, quranSurahs);
        return (p.surahName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      }).filter(Boolean)
    );

    return sourceSurahs.map((s) => {
      const clean = s.nama.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isDone = completedSet.has(clean);
      return {
        ...s,
        isDone,
        statusLabel: isDone ? 'Tuntas' : 'Target Berikutnya',
      };
    });
  }, [logs, quranSurahs]);

  // Helper to categorize log based on actual database record properties
  // Priority: jenis_setoran / type field dari database > heuristic field detection
  const getLogJenis = (l: any): 'ziyadah' | 'murajaah' | 'tilawah' | 'unknown' => {
    if (!l) return 'unknown';

    // Cek dulu apakah ini log murajaah dari parent (override semua jenis lain)
    const isSubmittedByParent = Boolean(l.metadata?.submitted_by_parent || l.notes_parent);
    const hasMurajaahText = Boolean(l.murajaah_text || Number(l.murajaah_lembar) > 0);

    // Jika parent-submitted ATAU ada murajaah_text → selalu murajaah
    if (isSubmittedByParent || hasMurajaahText) return 'murajaah';

    // 1. Prioritas: field type / category / jenis_setoran dari backend
    const jenisRaw = (l.jenis_setoran || l.type || l.category || l.jenis || l.kategori || '').toLowerCase();
    if (jenisRaw === 'murajaah' || jenisRaw === "muroja'ah" || jenisRaw === 'pengulangan') return 'murajaah';
    if (jenisRaw === 'tilawah' || jenisRaw === 'tilawah_mandiri') return 'tilawah';
    if (jenisRaw === 'ziyadah' || jenisRaw === 'hafalan_baru' || jenisRaw === 'hafalan baru') return 'ziyadah';

    // 2. Fallback: heuristic berbasis field yang ada
    const surah = l.hafalan_surah_name || l.nama_surah || l.surah;
    const isSpecialSurahName = !surah || surah === 'Tilawah' || surah === 'Murajaah';
    const hasAyatRange = (
      (l.hafalan_ayah_start !== null && l.hafalan_ayah_start !== undefined) ||
      (l.ayat_start !== null && l.ayat_start !== undefined)
    );

    // Jika ada tilawah_text → tilawah
    if (l.tilawah_text || Number(l.tilawah_baris) > 0) return 'tilawah';
    // Jika ada surah + ayat range (bukan nama khusus) → ziyadah
    if (hasAyatRange && !isSpecialSurahName) return 'ziyadah';

    return 'unknown';
  };

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
    () => [
      { key: 'all' as const, label: `Semua ${currentGradeLabel}`, icon: 'calendar-blank' },
      { key: 'today' as const, label: 'Harian (Hari Ini)', icon: 'calendar-today' },
      { key: 'week' as const, label: 'Mingguan (Pekan Ini)', icon: 'calendar-week' },
      { key: 'month' as const, label: 'Bulanan (Bulan Ini)', icon: 'calendar-month' },
      { key: 'semester' as const, label: 'Semester Berjalan', icon: 'calendar-range' },
    ],
    [currentGradeLabel]
  );

  const closestScrollIndex = (offsetX: number, offsets: number[]) => {
    if (offsets.length === 0) return 0;
    return offsets.reduce(
      (closest, itemOffset, index) =>
        Math.abs(itemOffset - offsetX) < Math.abs(offsets[closest] - offsetX) ? index : closest,
      0
    );
  };

  // Helper filter periode waktu: Harian, Pekan, Bulan, Semester, Tahunan
  const matchesTimePeriod = (dateVal: string | undefined, period: 'all' | 'today' | 'week' | 'month' | 'semester' | 'year') => {
    if (period === 'all' || !dateVal) return true;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return true;
    const now = new Date();

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

  const activeChild = useMemo(() => {
    if (Array.isArray(children) && children.length > 0) {
      return children.find((c) => String(c.id) === String(selectedChildId)) || children[0];
    }
    return null;
  }, [children, selectedChildId]);

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
  }, [logs, activeTab, timePeriodFilter, searchQuery]);

  return (
    <View style={styles.rootContainer}>
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 30 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />}
          showsVerticalScrollIndicator={false}
        >
          {/* SECTION 1: DATA SISWA & UNIT PENDIDIKAN (HERO CAROUSEL) */}
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

              <ScrollView
                ref={studentScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={SCREEN_WIDTH - 50 + 12}
                decelerationRate="fast"
                onMomentumScrollEnd={handleStudentScrollEnd}
                style={styles.heroCardScrollContainer}
                contentContainerStyle={styles.heroCardScroll}
              >
                {children.map((child, idx) => {
                  const isSelected = String(child.id) === selectedChildId;
                  const childFullName = child.full_name || child.nama_lengkap || child.name || 'Siswa';
                  const unitTitle =
                    child.kelas?.unit_pendidikan?.name ||
                    child.kelas?.unitPendidikan?.name ||
                    child.education_unit?.name ||
                    child.unit_name ||
                    'Unit Sekolah';
                  const className = child.kelas?.name || child.kelas?.nama_kelas || child.classroom?.name || child.class_name || 'Kelas Belum Ditentukan';
                  const jenjang = child.kelas?.jenjang || child.education_unit?.level || 'Terpadu';
                  const avatarUri = getProfileImageUrl(child);

                  return (
                    <TouchableOpacity
                      key={String(child.id)}
                      activeOpacity={0.88}
                      onPress={() => selectChildWithScroll(String(child.id), idx)}
                    >
                      <LinearGradient
                        colors={['#0D6B42', '#18A165', '#2BD988']}
                        locations={[0, 0.55, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.childCardHeroSize, !isSelected && { opacity: 0.9 }]}
                      >
                        <View style={styles.cardDecorCircle} />

                        {/* Top Row: Avatar + Info (Name, NIS, Unit Pill) + Right Button */}
                        <View style={styles.childHeroTopRow}>
                          <View style={styles.avatarBorderWrapHero}>
                            {avatarUri ? (
                              <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
                            ) : (
                              <Image
                                source={
                                  child?.gender === 'female' ||
                                  child?.jenis_kelamin === 'P' ||
                                  child?.jenis_kelamin === 'female' ||
                                  child?.gender === 'P'
                                    ? DEFAULT_STUDENT_GIRL_AVATAR
                                    : DEFAULT_STUDENT_BOY_AVATAR
                                }
                                style={styles.childAvatarImgHero}
                                resizeMode="cover"
                              />
                            )}
                          </View>
                          <View style={styles.childInfoCol}>
                            <View style={styles.studentNameBadgeRow}>
                              <Text numberOfLines={1} style={styles.studentFullName}>
                                {childFullName}
                              </Text>
                            </View>
                            <Text style={styles.studentNisText}>
                              NIS: {child.nis || '-'} {child.nisn ? `· NISN: ${child.nisn}` : ''}
                            </Text>
                            <View style={styles.studentUnitBadge}>
                              <MaterialCommunityIcons
                                name="school"
                                size={11}
                                color="#FFFFFF"
                                style={{ marginRight: 4 }}
                              />
                              <Text numberOfLines={1} style={styles.studentUnitText}>
                                {unitTitle}
                              </Text>
                            </View>
                          </View>

                          {/* Right Action Button */}
                          <View style={[styles.selectedActionBtnRight, !isSelected && styles.selectedActionBtnRightInactive]}>
                            <MaterialCommunityIcons
                              name={isSelected ? 'check-circle' : 'gesture-tap'}
                              size={16}
                              color={isSelected ? '#18A165' : '#FFFFFF'}
                            />
                            <Text style={[styles.selectedActionBtnText, !isSelected && styles.selectedActionBtnTextInactive]}>
                              {isSelected ? 'Terpilih' : 'Pilih'}
                            </Text>
                          </View>
                        </View>

                        {/* Middle Attributes Bar: Kelas | Jenjang | Presensi */}
                        <View style={styles.studentAttributesGrid}>
                          <View style={styles.studentAttrBox}>
                            <View style={styles.studentAttrLabelRow}>
                              <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.studentAttrLabel}>Kelas</Text>
                            </View>
                            <Text numberOfLines={1} style={styles.studentAttrValue}>
                              {className}
                            </Text>
                          </View>
                          <View style={styles.studentAttrDivider} />
                          <View style={styles.studentAttrBox}>
                            <View style={styles.studentAttrLabelRow}>
                              <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.studentAttrLabel}>Jenjang</Text>
                            </View>
                            <Text numberOfLines={1} style={styles.studentAttrValue}>
                              {jenjang}
                            </Text>
                          </View>
                          <View style={styles.studentAttrDivider} />
                          <View style={styles.studentAttrBox}>
                            <View style={styles.studentAttrLabelRow}>
                              <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.studentAttrLabel}>Presensi</Text>
                            </View>
                            <View style={styles.studentPresensiValueRow}>
                              <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                                Hadir
                              </Text>
                              <View style={styles.presensiGreenDot} />
                            </View>
                          </View>
                        </View>

                        {/* Tahfizh Achievement Bar inside Card Ananda */}
                        <View style={styles.cardTahfizhStatsRow}>
                          <View style={styles.cardTahfizhStatItem}>
                            <View style={styles.cardTahfizhStatIconLabel}>
                              <MaterialCommunityIcons name="book-open-page-variant" size={11} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.cardTahfizhStatLabel}>Total Ayat</Text>
                            </View>
                            <Text numberOfLines={1} style={styles.cardTahfizhStatVal}>
                              {isSelected ? `${totalAyat} Ayat` : `${child.total_ayat || 0} Ayat`}
                            </Text>
                          </View>
                          <View style={styles.cardTahfizhStatDivider} />
                          <View style={styles.cardTahfizhStatItem}>
                            <View style={styles.cardTahfizhStatIconLabel}>
                              <MaterialCommunityIcons name="book-multiple-outline" size={11} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.cardTahfizhStatLabel}>Total Juz</Text>
                            </View>
                            <Text numberOfLines={1} style={styles.cardTahfizhStatVal}>
                              {isSelected
                                ? `${Number(tahfizhAchievement?.completed_juz_count ?? tahfizhAchievement?.juz_count ?? 0)} Juz`
                                : `${child.completed_juz_count || child.juz_count || 0} Juz`}
                            </Text>
                          </View>
                          <View style={styles.cardTahfizhStatDivider} />
                          <View style={styles.cardTahfizhStatItem}>
                            <View style={styles.cardTahfizhStatIconLabel}>
                              <MaterialCommunityIcons name="trophy-outline" size={11} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.cardTahfizhStatLabel}>Progress</Text>
                            </View>
                            <Text numberOfLines={1} style={styles.cardTahfizhStatVal}>
                              {isSelected ? `${targetProgress}%` : `${child.target_progress || 0}%`}
                            </Text>
                          </View>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* DOT INDIKATOR SCROLL SISWA */}
              {children.length > 1 && (
                <View style={styles.paginationDotsRow}>
                  {children.map((c, i) => {
                    const isDotActive = String(c.id) === selectedChildId;
                    return (
                      <TouchableOpacity
                        key={String(c.id || i)}
                        onPress={() => selectChildWithScroll(String(c.id), i)}
                        style={[
                          styles.paginationDot,
                          isDotActive && styles.paginationDotActive,
                        ]}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          ) : studentInfo ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Ananda</Text>
                </View>
              </View>

              {(() => {
                const s = studentInfo;
                const studentName = s.name || s.full_name || s.nama_lengkap || 'Siswa Aktif';
                const studentClass = s.class || s.class_name || s.kelas?.nama_kelas || 'Kelas Belum Ditentukan';
                const studentUnit = s.unit || s.unit_name || s.education_unit?.name || 'Unit Pendidikan';
                const jenjang = s.kelas?.jenjang || s.education_unit?.level || 'Terpadu';
                const avatarUri = getProfileImageUrl(s);

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
                          <Image
                            source={
                              s?.gender === 'female' ||
                              s?.jenis_kelamin === 'P' ||
                              s?.jenis_kelamin === 'female' ||
                              s?.gender === 'P'
                                ? DEFAULT_STUDENT_GIRL_AVATAR
                                : DEFAULT_STUDENT_BOY_AVATAR
                            }
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
                        )}
                      </View>
                      <View style={styles.childInfoCol}>
                        <View style={styles.studentNameBadgeRow}>
                          <Text numberOfLines={1} style={styles.studentFullName}>
                            {studentName}
                          </Text>
                        </View>
                        <Text style={styles.studentNisText}>
                          NIS: {s.nis || '-'} {s.nisn ? `· NISN: ${s.nisn}` : ''}
                        </Text>
                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {studentUnit}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.selectedActionBtnRight}>
                        <MaterialCommunityIcons name="check-circle" size={16} color="#18A165" />
                        <Text style={styles.selectedActionBtnText}>Aktif</Text>
                      </View>
                    </View>

                    <View style={styles.studentAttributesGrid}>
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Kelas</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{studentClass}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Jenjang</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{jenjang}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Presensi</Text>
                        </View>
                        <View style={styles.studentPresensiValueRow}>
                          <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Hadir</Text>
                          <View style={styles.presensiGreenDot} />
                        </View>
                      </View>
                    </View>

                    {/* Tahfizh Achievement Bar inside Card Ananda (single student) */}
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
            </View>
          ) : user ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
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
                        <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Hadir</Text>
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
            </View>
          ) : null}

          {/* SECTION 2: RINGKASAN CAPAIAN TAHFIZH (2 HERO KPI CARDS SESUAI MOCKUP) */}
          <View style={styles.containerBlock}>
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
                    {targetAyat > 0 ? `${totalAyat} dari ${targetAyat} target ayat` : `${totalAyat} ayat tercatat`}
                  </Text>
                  <View style={styles.heroProgressBarTrack}>
                    <View style={[styles.heroProgressBarFill, { width: `${Math.min(100, Math.max(5, targetProgress))}%` }]} />
                  </View>
                </View>
              </View>

              {/* Card 2: Target Tahun Ini / Semester */}
              <View style={styles.heroKpiCard}>
                <View style={styles.targetIconBox}>
                  <MaterialCommunityIcons name="target" size={24} color="#059669" />
                </View>
                <View style={styles.heroKpiContentCol}>
                  <Text numberOfLines={1} style={styles.heroKpiTargetLabel}>Target Tahun Ini</Text>
                  <Text numberOfLines={1} style={styles.heroKpiTargetValue}>
                    {targetSemester || (targetAyat > 0 ? `${targetAyat} Ayat` : 'Target Kurikulum')}
                  </Text>
                  <Text numberOfLines={1} style={styles.heroKpiTargetSub}>
                    {targetAyat > 0
                      ? targetAyat > totalAyat
                        ? `Tersisa ${targetAyat - totalAyat} ayat`
                        : 'Target Tercapai'
                      : 'Semester Berjalan'}
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
                <Text
                  style={[
                    styles.segmentedTabText,
                    mainTab === 'history' && styles.segmentedTabTextActive,
                  ]}
                >
                  Riwayat Setoran
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setMainTab('target')}
                style={[
                  styles.segmentedTabItem,
                  mainTab === 'target' && styles.segmentedTabItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentedTabText,
                    mainTab === 'target' && styles.segmentedTabTextActive,
                  ]}
                >
                  Daftar Target
                </Text>
              </TouchableOpacity>
            </View>

            {mainTab === 'target' ? (
              /* TAB 2: DAFTAR TARGET KURIKULUM TAHFIZH */
              <View style={styles.targetTabContent}>
                <View style={styles.targetHeaderBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.targetHeaderTitle}>Target Kurikulum Tahfizh</Text>
                    <Text numberOfLines={1} style={styles.targetHeaderSub}>
                      {[currentGradeLabel, studentUnitName, 'Semester Berjalan'].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.targetTotalBadge}>
                    <Text style={styles.targetTotalBadgeText}>
                      {targetCurriculumList.filter((t) => t.isDone).length}/{targetCurriculumList.length} Tuntas
                    </Text>
                  </View>
                </View>

                <View style={{ gap: 8, marginTop: 10 }}>
                  {targetCurriculumList.map((tItem, tIdx) => (
                    <View key={String(tItem.nomor || tIdx)} style={styles.setoranRowCard}>
                      <View style={[styles.calendarIconBox, tItem.isDone && { backgroundColor: '#DCFCE7' }]}>
                        <MaterialCommunityIcons
                          name={tItem.isDone ? 'check-circle' : 'book-outline'}
                          size={20}
                          color={tItem.isDone ? '#16A34A' : '#64748B'}
                        />
                      </View>
                      <View style={styles.setoranInfoCol}>
                        <Text numberOfLines={1} style={styles.setoranSurahText}>
                          Surah {tItem.nama}
                        </Text>
                        <Text numberOfLines={1} style={styles.setoranSubText}>
                          {tItem.ayat} Ayat · Juz 30
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.setoranStatusPill,
                          tItem.isDone ? styles.statusBadgeGreen : styles.statusBadgeGray,
                        ]}
                      >
                        <Text
                          style={[
                            styles.setoranStatusText,
                            tItem.isDone ? styles.statusTextGreen : styles.statusTextGray,
                          ]}
                        >
                          {tItem.statusLabel}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              /* TAB 1: RIWAYAT SETORAN TAHFIZH */
              <>
            {/* SECTION 3 HEADER: LAPORAN & REKAPITULASI DENGAN UNIT PENDIDIKAN */}
            <View style={styles.rekapSectionHeader}>
              <View style={styles.rekapHeaderMainRow}>
                <View style={styles.rekapHeaderIconBox}>
                  <MaterialCommunityIcons name="book-education-outline" size={20} color="#059669" />
                </View>
                <View style={styles.rekapHeaderTitleCol}>
                  <Text style={styles.sectionTitle} numberOfLines={1}>
                    Laporan & Rekapitulasi Tahfizh
                  </Text>
                  <View style={styles.rekapMetaRow}>
                    {Boolean(studentUnitName) && (
                      <View style={styles.rekapUnitBadge}>
                        <MaterialCommunityIcons name="school" size={11} color="#047857" />
                        <Text numberOfLines={1} style={styles.rekapUnitBadgeText}>
                          {studentUnitName}
                        </Text>
                      </View>
                    )}
                    {Boolean(studentUnitName) && <Text style={styles.rekapMetaDot}>•</Text>}
                    <Text style={styles.rekapSubtitleText} numberOfLines={1}>
                      Perjalanan Hafalan Ananda
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* CHIPS TINGKAT KELAS ANANDA (KELAS 1 S/D KELAS AKTIF) */}
            <View style={styles.gradeJourneyWrapper}>
              <View style={styles.gradeJourneyHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <MaterialCommunityIcons name="school" size={14} color="#059669" />
                  <Text style={styles.gradeJourneyLabel}>Tingkat Kelas Ananda:</Text>
                </View>
                <View style={styles.gradeJourneyActivePill}>
                  <View style={styles.gradeJourneyDot} />
                  <Text style={styles.gradeJourneyActivePillText}>
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

            {/* KONDISIONAL BERDASARKAN KELAS YANG DIPILIH: */}
            {/* JIKA KELAS 1 - 4 (KELAS LAMPAU): HANYA MENAMPILKAN JUMLAH YANG TELAH DITAHFIZH */}
            {!isCurrentGradeActive && selectedGradeSummary ? (
              <View style={styles.pastGradeContainer}>
                <LinearGradient
                  colors={['#F0FDF4', '#ECFDF5', '#E6F9F0']}
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

                <View style={{ marginTop: 14, gap: 10 }}>
                  <View style={styles.historySectionHeader}>
                    <View style={styles.historyIconBox}>
                      <MaterialCommunityIcons name="history" size={18} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionTitle}>Riwayat Setoran {selectedGradeSummary.label}</Text>
                      <Text style={styles.historySubCaption}>
                        {selectedGradeSummary.total_setoran || 0} setoran dari database
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
                            <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#059669" />
                          </View>
                          <View style={styles.setoranInfoCol}>
                            <Text numberOfLines={1} style={styles.setoranSurahText}>
                              {displayTitle}
                            </Text>
                            {teacherName ? (
                              <Text numberOfLines={1} style={styles.setoranSubText}>
                                {teacherName}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.setoranDateText}>{formatDate(itemDate)}</Text>
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
                                if (s.includes('pending') || s.includes('tunggu') || s === 'submitted') return 'Menunggu Verifikasi';
                                if (s.includes('ulang') || s.includes('kurang')) return 'Perlu Ulang';
                                return 'Lancar';
                              })()}
                            </Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <View style={styles.emptyCardBox}>
                      <MaterialCommunityIcons name="history" size={32} color="#CBD5E1" />
                      <Text style={styles.emptyTitle}>Belum Ada Riwayat Setoran</Text>
                      <Text style={styles.emptySub}>Tidak ada setoran database yang terhubung dengan kelas ini.</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <>
                {/* JIKA KELAS AKTIF (KELAS BERJALAN): TAMPILKAN 4 TAB CARD, INSTRUKSI MURAJAAH, SEARCH, FILTER HARIAN/MINGGUAN/BULANAN/SEMESTER & DAFTAR KARTU SETORAN */}
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

                {/* Instruksi / Petunjuk Cara Melakukan Pengulangan (Murajaah) */}
                {activeTab === 'murajaah' && (
                  <View style={styles.murajaahInstructionCard}>
                    <View style={styles.murajaahInstructionHeader}>
                      <View style={styles.murajaahInstructionIconWrap}>
                        <MaterialCommunityIcons name="book-open-page-variant" size={18} color="#0D7A48" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.murajaahInstructionTitle}>Petunjuk Pengulangan (Murajaah)</Text>
                        <Text style={styles.murajaahInstructionSub}>
                          Ikuti langkah berikut untuk menyimak & menyetor hafalan di rumah:
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <MaterialCommunityIcons name="filter-variant" size={14} color="#059669" />
                        <Text style={styles.filterSectionLabel}>
                          Filter Setoran {currentGradeLabel}{studentUnitName ? ` (${studentUnitName})` : ''}:
                        </Text>
                      </View>
                      {timePeriodFilter !== 'all' && (
                        <TouchableOpacity onPress={() => setTimePeriodFilter('all')} style={styles.resetMiniBtn}>
                          <Text style={styles.resetMiniBtnText}>Semua Waktu</Text>
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
                              setTimePeriodFilter(f.key);
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
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <View style={styles.carouselDotsRowCompact}>
                      {timeFilterItems.map((item, index) => (
                        <TouchableOpacity
                          key={`filter-dot-${item.key}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Geser ke filter ${item.label}`}
                          onPress={() => {
                            setActiveFilterScrollIndex(index);
                            filterScrollRef.current?.scrollTo({
                              x: filterOffsetsRef.current[index] || 0,
                              animated: true,
                            });
                          }}
                          style={[styles.carouselDotSmall, activeFilterScrollIndex === index && styles.carouselDotSmallActive]}
                        />
                      ))}
                    </View>
                  </View>

                  {/* Active Filter Summary Bar */}
                  {(timePeriodFilter !== 'all' || searchQuery.trim().length > 0) && (
                    <View style={styles.activeFilterSummaryRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <MaterialCommunityIcons name="filter-check" size={14} color="#166534" />
                        <Text numberOfLines={1} style={styles.activeFilterSummaryText}>
                          Ditemukan {filteredLogs.length} riwayat setoran
                          {timePeriodFilter !== 'all' ? ` · ${timePeriodFilter === 'today' ? 'Harian (Hari Ini)' : timePeriodFilter === 'week' ? 'Mingguan (Pekan Ini)' : timePeriodFilter === 'month' ? 'Bulanan (Bulan Ini)' : 'Semester Berjalan'}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setTimePeriodFilter('all');
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

                {/* Active Assignment: Tugas Pengulangan di Rumah dari Ustadz */}
                {pendingHomeMurajaah && (
                  <View style={styles.activeMurajaahTaskCard}>
                    <View style={styles.activeMurajaahTaskHeader}>
                      <View style={styles.activeMurajaahTaskBadge}>
                        <MaterialCommunityIcons name="clipboard-alert-outline" size={14} color="#D97706" />
                        <Text style={styles.activeMurajaahTaskBadgeText}>Tugas Pengulangan di Rumah</Text>
                      </View>
                      <View style={[
                        styles.activeMurajaahStatusPill,
                        pendingHomeMurajaah.status === 'submitted_by_parent' && { backgroundColor: '#E0F2FE' }
                      ]}>
                        <Text style={[
                          styles.activeMurajaahStatusPillText,
                          pendingHomeMurajaah.status === 'submitted_by_parent' && { color: '#0284C7' }
                        ]}>
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

                {/* List of Setoran Cards */}
                {loading && !refreshing ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator size="small" color="#18A165" />
                    <Text style={styles.loadingText}>Memuat riwayat setoran dari database...</Text>
                  </View>
                ) : filteredLogs.length === 0 ? (
                  <View style={styles.emptyCardBox}>
                    <MaterialCommunityIcons name="book-open-page-variant-outline" size={36} color="#CBD5E1" />
                    <Text style={styles.emptyTitle}>Belum Ada Riwayat Setoran</Text>
                    <Text style={styles.emptySub}>Catatan setoran tahfizh ananda akan otomatis muncul di sini.</Text>
                  </View>
                ) : (
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

                      // Prioritas: status > nilai > predikat
                      const rawStatus = (item.status || item.nilai || item.predikat || '').toLowerCase();

                      if (isMurajaah) {
                        // Log murajaah: label sesuai jenis setoran
                        if (rawStatus.includes('pending') || rawStatus.includes('menunggu') || rawStatus.includes('tunggu') || rawStatus === 'submitted') {
                          statusBadgeStyle = styles.statusBadgeBlue;
                          statusTextStyle = styles.statusTextBlue;
                          statusLabel = 'Menunggu Verifikasi';
                        } else if (rawStatus.includes('verified') || rawStatus.includes('approved') || rawStatus.includes('lancar')) {
                          statusBadgeStyle = styles.statusBadgeGreen;
                          statusTextStyle = styles.statusTextGreen;
                          statusLabel = 'Murajaah';
                        } else {
                          statusBadgeStyle = styles.statusBadgeBlue;
                          statusTextStyle = styles.statusTextBlue;
                          statusLabel = 'Murajaah';
                        }
                      } else if (isTilawah) {
                        statusBadgeStyle = styles.statusBadgeBlue;
                        statusTextStyle = styles.statusTextBlue;
                        statusLabel = 'Tilawah';
                      } else {
                        // Ziyadah / Hafalan Baru — selalu dicatat guru, tidak perlu verifikasi
                        // "pending_approval" dari backend pada ziyadah diabaikan karena guru sudah
                        // mencatat langsung saat setoran, sehingga selalu dianggap sah/lancar
                        const zRawNilai = (item.nilai || item.predikat || '').toLowerCase();
                        if (zRawNilai.includes('ulang') || zRawNilai.includes('murojaah') || zRawNilai.includes('kurang') || zRawNilai === 'perlu_ulang') {
                          statusBadgeStyle = styles.statusBadgeOrange;
                          statusTextStyle = styles.statusTextOrange;
                          statusLabel = 'Perlu Ulang';
                        } else if (zRawNilai.includes('mumtaz') || zRawNilai.includes('mutqin')) {
                          statusBadgeStyle = styles.statusBadgeGreen;
                          statusTextStyle = styles.statusTextGreen;
                          statusLabel = zRawNilai.includes('mutqin') ? 'Mutqin' : 'Mumtaz';
                        } else {
                          // Default Ziyadah: Lancar (termasuk pending_approval dikonversi ke Lancar)
                          statusBadgeStyle = styles.statusBadgeGreen;
                          statusTextStyle = styles.statusTextGreen;
                          statusLabel = 'Lancar';
                        }
                      }

                      const handleCardPress = () => {
                        if (activeTab === 'murajaah') {
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
                          {/* Left: Green Calendar Icon Box */}
                          <View style={styles.calendarIconBox}>
                            <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#059669" />
                          </View>

                          {/* Middle: Surah Name & Verses + Subtitle */}
                          <View style={styles.setoranInfoCol}>
                            <Text numberOfLines={1} style={styles.setoranSurahText}>
                              {displayTitle}
                            </Text>
                            {teacherName ? (
                              <Text numberOfLines={1} style={styles.setoranSubText}>
                                {teacherName}
                              </Text>
                            ) : null}
                          </View>

                          {/* Middle-Right: Date */}
                          <Text style={styles.setoranDateText}>
                            {formatDate(itemDate)}
                          </Text>

                          {/* Right: Status Pill Badge */}
                          <View style={[styles.setoranStatusPill, statusBadgeStyle]}>
                            <Text style={[styles.setoranStatusText, statusTextStyle]}>
                              {statusLabel}
                            </Text>
                          </View>

                          {/* Rightmost: Chevron > */}
                          <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </View>
        </ScrollView>
      </View>

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
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.modalHeaderIconBox}>
                  <MaterialCommunityIcons name="book-check-outline" size={20} color="#18A165" />
                </View>
                <Text style={styles.modalHeaderTitle}>Detail Setoran Tahfizh</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedLogDetail(null)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.62 }}>
              {selectedLogDetail ? (
                <View style={{ gap: 12, paddingVertical: 6 }}>
                  {/* Surah & Ayat Box */}
                  {isZiyadahLog(selectedLogDetail) ? (
                    <View style={styles.modalInfoBox}>
                      <Text style={styles.modalInfoLabel}>Surah & Ayat Hafalan Baru</Text>
                      <Text style={styles.modalInfoValue}>
                        {selectedLogDetail.hafalan_surah_name || selectedLogDetail.surah || 'Setoran Hafalan'}
                      </Text>
                      {selectedLogDetail.hafalan_ayah_start && selectedLogDetail.hafalan_ayah_end ? (
                        <Text style={styles.modalInfoSub}>
                          Ayat {selectedLogDetail.hafalan_ayah_start} s/d {selectedLogDetail.hafalan_ayah_end} (
                          {Number(selectedLogDetail.hafalan_ayah_end) - Number(selectedLogDetail.hafalan_ayah_start) + 1} Ayat)
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <View style={[styles.modalInfoBox, { backgroundColor: '#F0FDF4' }]}>
                      <Text style={[styles.modalInfoLabel, { color: '#047857' }]}>Jenis Setoran</Text>
                      <Text style={[styles.modalInfoValue, { color: '#065F46' }]}>Setoran Tilawah & Penguatan Murajaah</Text>
                      <Text style={styles.modalInfoSub}>Penguatan bacaan tartil Al-Qur'an dan murajaah hafalan mandiri.</Text>
                    </View>
                  )}

                  {/* Tilawah & Murajaah info if present */}
                  {selectedLogDetail.tilawah_text ? (
                    <View style={styles.modalInfoBox}>
                      <Text style={styles.modalInfoLabel}>Bacaan Tilawah</Text>
                      <Text style={styles.modalInfoValue}>{selectedLogDetail.tilawah_text}</Text>
                      {selectedLogDetail.tilawah_baris ? (
                        <Text style={styles.modalInfoSub}>{selectedLogDetail.tilawah_baris} Baris</Text>
                      ) : null}
                    </View>
                  ) : null}

                  {selectedLogDetail.murajaah_text ? (
                    <View style={styles.modalInfoBox}>
                      <Text style={styles.modalInfoLabel}>Pengulangan Murajaah</Text>
                      <Text style={styles.modalInfoValue}>{selectedLogDetail.murajaah_text}</Text>
                      {selectedLogDetail.murajaah_lembar ? (
                        <Text style={styles.modalInfoSub}>{selectedLogDetail.murajaah_lembar} Lembar</Text>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Teacher & Verification */}
                  <View style={styles.modalInfoBox}>
                    <Text style={styles.modalInfoLabel}>Penguji / Ustadz</Text>
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
                    <View style={[styles.modalInfoBox, { backgroundColor: '#F0FDF4' }]}>
                      <Text style={[styles.modalInfoLabel, { color: '#047857' }]}>Catatan Ustadz / Guru</Text>
                      <Text style={[styles.modalInfoValue, { color: '#065F46', fontStyle: 'italic', fontWeight: '500' }]}>
                        "{selectedLogDetail.notes_teacher || selectedLogDetail.catatan}"
                      </Text>
                    </View>
                  ) : null}

                  {/* Notes Parent */}
                  {selectedLogDetail.notes_parent ? (
                    <View style={[styles.modalInfoBox, { backgroundColor: '#FFFBEB' }]}>
                      <Text style={[styles.modalInfoLabel, { color: '#B45309' }]}>Catatan Wali / Orang Tua</Text>
                      <Text style={[styles.modalInfoValue, { color: '#92400E', fontStyle: 'italic', fontWeight: '500' }]}>
                        "{selectedLogDetail.notes_parent}"
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

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

            {/* Header Modal Input */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[styles.modalHeaderIconBox, { backgroundColor: '#DEF7EC' }]}>
                  <MaterialCommunityIcons name="book-plus-multiple" size={20} color="#18A165" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.modalHeaderTitle}>Input Murajaah di Rumah</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>
                    {studentInfo?.name || studentInfo?.full_name || 'Ananda'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsInputModalVisible(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.72 }}>
              <View style={{ gap: 14, paddingVertical: 6 }}>

                {/* 1. Surah & Ayat yang Diulang */}
                <View style={styles.inputGroupBlock}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={styles.inputGroupLabel}>SURAH & AYAT YANG DIULANG *</Text>
                    {!isMurajaahLockedByTeacher ? (
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => setIsSelectingDifferentSurah(!isSelectingDifferentSurah)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: '#F1F5F9', borderRadius: 8 }}
                      >
                        <MaterialCommunityIcons name={isSelectingDifferentSurah ? 'chevron-up' : 'swap-horizontal'} size={14} color="#0D7A48" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D7A48' }}>
                          {isSelectingDifferentSurah ? 'Tutup Pilihan' : 'Ganti Surah'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <MaterialCommunityIcons name="lock" size={12} color="#D97706" />
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#B45309' }}>Terkunci dari Guru</Text>
                      </View>
                    )}
                  </View>

                  {/* Card Utama: Menampilkan Nama Surah dan Ayat yang Diulang Saja */}
                  {selectedSurah && (
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
                  <Text style={styles.inputGroupLabel}>RENTANG AYAT YANG DIULANG *</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subFieldLabel}>Ayat Mulai</Text>
                      <TextInput
                        style={[styles.numberInput, isMurajaahLockedByTeacher && { backgroundColor: '#F1F5F9', color: '#64748B' }]}
                        keyboardType="numeric"
                        editable={!isMurajaahLockedByTeacher}
                        value={inputAyatStart}
                        onChangeText={setInputAyatStart}
                        placeholder="1"
                      />
                    </View>
                    <Text style={{ marginTop: 18, fontWeight: '700', color: '#94A3B8' }}>s/d</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subFieldLabel}>Ayat Selesai</Text>
                      <TextInput
                        style={[styles.numberInput, isMurajaahLockedByTeacher && { backgroundColor: '#F1F5F9', color: '#64748B' }]}
                        keyboardType="numeric"
                        editable={!isMurajaahLockedByTeacher}
                        value={inputAyatEnd}
                        onChangeText={setInputAyatEnd}
                        placeholder="10"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subFieldLabel}>Jml Lembar</Text>
                      <TextInput
                        style={styles.numberInput}
                        keyboardType="numeric"
                        value={inputLembar}
                        onChangeText={setInputLembar}
                        placeholder="1.0"
                      />
                    </View>
                  </View>
                </View>

                {/* 4. Input Tanggal & Jam Pelaksanaan */}
                <View style={styles.inputGroupBlock}>
                  <Text style={styles.inputGroupLabel}>WAKTU PENGULANGAN (MURAJAAH) *</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1.4 }}>
                      <Text style={styles.subFieldLabel}>Tanggal (YYYY-MM-DD)</Text>
                      <View style={styles.inputWithIcon}>
                        <MaterialCommunityIcons name="calendar" size={16} color="#64748B" />
                        <TextInput
                          style={styles.textInputWithIcon}
                          value={inputDate}
                          onChangeText={setInputDate}
                          placeholder={new Date().toISOString().slice(0, 10)}
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subFieldLabel}>Jam (HH:MM)</Text>
                      <View style={styles.inputWithIcon}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#64748B" />
                        <TextInput
                          style={styles.textInputWithIcon}
                          value={inputTime}
                          onChangeText={setInputTime}
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
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 20 : 16,
  },
  containerBlock: {
    marginBottom: 16,
  },
  studentContainerBlock: {
    marginBottom: 8,
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

  // Hero KPI Cards (Matching reference image)
  heroKpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  heroKpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  progressCircleBox: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircleRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 3.5,
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircleText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  heroKpiContentCol: {
    flex: 1,
    justifyContent: 'center',
  },
  heroKpiTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroKpiSub: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 2,
  },
  heroProgressBarTrack: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    marginTop: 6,
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
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroKpiTargetLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  heroKpiTargetValue: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 1,
  },
  heroKpiTargetSub: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 2,
  },

  // Main Segmented Switcher (Riwayat Setoran vs Daftar Target)
  segmentedTabWrapper: {
    flexDirection: 'row',
    backgroundColor: '#E8EFF5',
    borderRadius: 22,
    padding: 4,
    marginBottom: 14,
  },
  segmentedTabItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  segmentedTabItemActive: {
    backgroundColor: '#0D6B42',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentedTabText: {
    fontSize: 13,
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
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 4,
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
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  calendarIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setoranInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  setoranSurahText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  setoranSubText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  setoranDateText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginRight: 2,
  },
  setoranStatusPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setoranStatusText: {
    fontSize: 11,
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
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
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
    backgroundColor: '#18A165',
  },
  carouselDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
  },
  carouselDotSmallActive: {
    width: 16,
    backgroundColor: '#18A165',
  },
  tabCardItem: {
    width: 136,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  tabCardItemActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
    shadowColor: '#18A165',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  tabCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tabCardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCardIconWrapActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  tabCardCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tabCardCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
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
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 12,
    gap: 8,
  },
  filterRowWrapper: {
    gap: 4,
  },
  filterSectionLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  resetMiniBtn: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  resetMiniBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTrack: {
    gap: 6,
    paddingVertical: 2,
  },
  filterChipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipItemActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalInfoLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInfoValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 3,
  },
  modalInfoSub: {
    fontSize: 11.5,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },
  modalActionBtn: {
    backgroundColor: '#18A165',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  modalActionBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
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
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 12,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputGroupLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#334155',
    letterSpacing: 0.5,
  },
  subFieldLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  surahChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
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
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#18A165',
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
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    maxWidth: 160,
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
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historySubCaption: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },

  // Grade Journey Chips (Tingkat Perjalanan Kelas Ananda)
  gradeJourneyWrapper: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  gradeJourneyChipSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
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
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  pastGradeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  pastGradeBadgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
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
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  pastGradeReturnBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  activeMurajaahTaskCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
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
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
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
});
